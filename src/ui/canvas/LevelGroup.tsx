import { useCallback, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Level, Vec2, Id } from '../../core';
import { addWall, addOpening, addRoom, addObject, addRadio, addZone, updateObject, updateRadio } from '../../core';
import { useSceneStore } from '../store';
import { WallMesh } from './WallMesh';
import { OpeningMesh } from './OpeningMesh';
import { RoomMesh } from './RoomMesh';
import { ObjectMesh } from './ObjectMesh';
import { RadioMesh } from './RadioMesh';
import { ZoneMesh } from './ZoneMesh';
import { GridFloor } from './GridFloor';
import { InteractionPlane } from './InteractionPlane';
import { SnapIndicator, DraftChainPreview, OpeningPreview } from './Previews';
import { computeSnap, findHoverWall } from './snapping';

interface LevelGroupProps {
  level: Level;
  opacity: number;
  interactive: boolean;
}

/** Plan view slices walls at this height (m) so doors and windows read as gaps. */
const PLAN_CUT_HEIGHT = 1.2;

type DragState = { id: Id; kind: 'object' | 'radio'; position: [number, number, number] } | null;

export function LevelGroup({ level, opacity, interactive }: LevelGroupProps) {
  const doc = useSceneStore((s) => s.doc);
  const tool = useSceneStore((s) => s.tool);
  const viewMode = useSceneStore((s) => s.viewMode);
  const cutHeight = viewMode === 'plan' ? PLAN_CUT_HEIGHT : undefined;
  const selection = useSceneStore((s) => s.selection);
  const draft = useSceneStore((s) => s.draft);
  const setSelection = useSceneStore((s) => s.setSelection);
  const setDraft = useSceneStore((s) => s.setDraft);
  const apply = useSceneStore((s) => s.apply);
  const applyOp = useSceneStore((s) => s.applyOp);
  const setCameraLocked = useSceneStore((s) => s.setCameraLocked);

  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);

  const walls = useMemo(() => doc.walls.filter((w) => w.levelId === level.id), [doc.walls, level.id]);
  const wallIds = useMemo(() => new Set(walls.map((w) => w.id)), [walls]);
  const openings = useMemo(() => doc.openings.filter((o) => wallIds.has(o.wallId)), [doc.openings, wallIds]);
  const openingsByWall = useMemo(() => {
    const m = new Map<Id, typeof openings>();
    for (const o of openings) {
      const list = m.get(o.wallId) ?? [];
      list.push(o);
      m.set(o.wallId, list);
    }
    return m;
  }, [openings]);
  const rooms = useMemo(() => doc.rooms.filter((r) => r.levelId === level.id), [doc.rooms, level.id]);
  const objects = useMemo(() => doc.objects.filter((o) => o.levelId === level.id), [doc.objects, level.id]);
  const radios = useMemo(() => doc.radios.filter((r) => r.levelId === level.id), [doc.radios, level.id]);
  const zones = useMemo(() => doc.zones.filter((z) => z.levelId === level.id), [doc.zones, level.id]);
  const materialColor = useCallback(
    (materialId: string) => doc.materials.find((m) => m.id === materialId)?.color ?? '#999999',
    [doc.materials],
  );

  const selectable = interactive && tool === 'select';

  const select = useCallback(
    (id: Id) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setSelection(id);
    },
    [setSelection],
  );

  const startDrag = useCallback(
    (id: Id, kind: 'object' | 'radio', position: [number, number, number]) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // Lock the camera controls immediately: in plan view MapControls' left button pans, and
      // in 3D OrbitControls' left button rotates, either of which would otherwise fight this drag.
      setCameraLocked(true);
      const next: DragState = { id, kind, position };
      setDrag(next);
      dragRef.current = next;

      // Coordinate updates arrive via the InteractionPlane's onPointerMove (handlePointerMove
      // reads dragRef); pointerup (anywhere, since the cursor may not be over the plane) commits.
      const onWindowPointerUp = () => {
        window.removeEventListener('pointerup', onWindowPointerUp);
        setCameraLocked(false);
        const finalDrag = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!finalDrag) return;
        if (finalDrag.kind === 'object') {
          apply((d) => updateObject(d, finalDrag.id, { position: finalDrag.position }));
        } else {
          apply((d) => updateRadio(d, finalDrag.id, { position: finalDrag.position }));
        }
      };
      window.addEventListener('pointerup', onWindowPointerUp);
    },
    [apply, setCameraLocked],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const raw: Vec2 = [e.point.x, e.point.z];

      if (dragRef.current) {
        const snapped = computeSnap(raw, walls).point;
        const y = dragRef.current.position[1];
        const next: DragState = { ...dragRef.current, position: [snapped[0], y, snapped[1]] };
        dragRef.current = next;
        setDrag(next);
        return;
      }

      if (tool === 'wall' || tool === 'room' || tool === 'object' || tool === 'ap' || tool === 'zone') {
        setHoverPoint(computeSnap(raw, walls).point);
      } else if (tool === 'door' || tool === 'window') {
        setHoverPoint(raw);
      } else {
        setHoverPoint(null);
      }
    },
    [tool, walls],
  );

  const hoverWall = useMemo(() => {
    if (!interactive || !hoverPoint) return null;
    if (tool !== 'door' && tool !== 'window') return null;
    return findHoverWall(hoverPoint, walls);
  }, [interactive, hoverPoint, tool, walls]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const raw: Vec2 = [e.point.x, e.point.z];

      if (tool === 'select') {
        setSelection(null);
        return;
      }

      if (tool === 'wall') {
        const snapped = computeSnap(raw, walls).point;
        if (!draft || draft.kind !== 'wall-chain') {
          setDraft({ kind: 'wall-chain', points: [snapped] });
          return;
        }
        const last = draft.points[draft.points.length - 1]!;
        applyOp((d) => addWall(d, { levelId: level.id, a: last, b: snapped }));
        setDraft({ kind: 'wall-chain', points: [...draft.points, snapped] });
        return;
      }

      if (tool === 'room') {
        const snapped = computeSnap(raw, walls).point;
        if (!draft || draft.kind !== 'room-polygon') {
          setDraft({ kind: 'room-polygon', points: [snapped] });
          return;
        }
        const first = draft.points[0]!;
        const closeDist = Math.hypot(snapped[0] - first[0], snapped[1] - first[1]);
        if (draft.points.length >= 3 && closeDist <= 0.25) {
          applyOp((d) => addRoom(d, { levelId: level.id, polygon: draft.points }));
          setDraft(null);
          return;
        }
        setDraft({ kind: 'room-polygon', points: [...draft.points, snapped] });
        return;
      }

      if (tool === 'door' || tool === 'window') {
        const hw = findHoverWall(raw, walls);
        if (!hw) return;
        const wall = walls.find((w) => w.id === hw.wallId);
        if (!wall) return;
        const kind = tool;
        const width = kind === 'door' ? 0.9 : 1.2;
        const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
        const offset = Math.min(Math.max(hw.offset - width / 2, 0), Math.max(length - width, 0));
        applyOp((d) => addOpening(d, { wallId: hw.wallId, kind, offset }));
        return;
      }

      if (tool === 'object') {
        const snapped = computeSnap(raw, walls).point;
        applyOp((d) => addObject(d, { levelId: level.id, position: [snapped[0], 0, snapped[1]] }));
        return;
      }

      if (tool === 'ap') {
        const snapped = computeSnap(raw, walls).point;
        applyOp((d) => addRadio(d, { levelId: level.id, position: [snapped[0], 2.0, snapped[1]] }));
        return;
      }

      if (tool === 'zone') {
        const snapped = computeSnap(raw, walls).point;
        if (!draft || draft.kind !== 'zone-polygon') {
          setDraft({ kind: 'zone-polygon', points: [snapped] });
          return;
        }
        const first = draft.points[0]!;
        const closeDist = Math.hypot(snapped[0] - first[0], snapped[1] - first[1]);
        if (draft.points.length >= 3 && closeDist <= 0.25) {
          applyOp((d) => addZone(d, { levelId: level.id, polygon: draft.points }));
          setDraft(null);
          return;
        }
        setDraft({ kind: 'zone-polygon', points: [...draft.points, snapped] });
        return;
      }
    },
    [tool, draft, walls, level.id, setDraft, setSelection, applyOp],
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.nativeEvent.preventDefault();
      setDraft(null);
    },
    [setDraft],
  );

  return (
    <group position={[0, level.elevation, 0]}>
      {interactive && <GridFloor />}
      {interactive && (
        <InteractionPlane onPointerMove={handlePointerMove} onClick={handleClick} onContextMenu={handleContextMenu} />
      )}

      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={openingsByWall.get(wall.id) ?? []}
          color={materialColor(wall.materialId)}
          selected={selection === wall.id}
          interactive={selectable}
          opacity={opacity}
          cutHeight={cutHeight}
          onSelect={select(wall.id)}
        />
      ))}

      {openings.map((opening) => {
        const wall = walls.find((w) => w.id === opening.wallId);
        if (!wall) return null;
        return (
          <OpeningMesh
            key={opening.id}
            wall={wall}
            opening={opening}
            color={materialColor(opening.materialId)}
            selected={selection === opening.id}
            interactive={selectable}
            opacity={opacity}
            cutHeight={cutHeight}
            onSelect={select(opening.id)}
          />
        );
      })}

      {(interactive || viewMode === '3d') && rooms.map((room) => (
        <RoomMesh
          key={room.id}
          room={room}
          selected={selection === room.id}
          interactive={selectable}
          opacity={opacity}
          onSelect={select(room.id)}
        />
      ))}

      {objects.map((object) => {
        const isDragging = drag?.id === object.id;
        const obj = isDragging ? { ...object, position: drag!.position } : object;
        return (
          <ObjectMesh
            key={object.id}
            object={obj}
            color={materialColor(object.materialId)}
            selected={selection === object.id}
            interactive={selectable}
            opacity={opacity}
            onSelect={select(object.id)}
            onDragStart={startDrag(object.id, 'object', object.position)}
          />
        );
      })}

      {radios.map((radio) => {
        const isDragging = drag?.id === radio.id;
        const r = isDragging ? { ...radio, position: drag!.position } : radio;
        return (
          <RadioMesh
            key={radio.id}
            radio={r}
            selected={selection === radio.id}
            interactive={selectable}
            opacity={opacity}
            onSelect={select(radio.id)}
            onDragStart={startDrag(radio.id, 'radio', radio.position)}
          />
        );
      })}

      {(interactive || viewMode === '3d') &&
        zones.map((zone) => (
          <ZoneMesh
            key={zone.id}
            zone={zone}
            polygon={zone.roomId !== undefined ? (doc.rooms.find((r) => r.id === zone.roomId)?.polygon ?? []) : zone.polygon}
            selected={selection === zone.id}
            interactive={selectable}
            onSelect={select(zone.id)}
          />
        ))}

      {interactive && hoverPoint && (tool === 'wall' || tool === 'room' || tool === 'object' || tool === 'ap' || tool === 'zone') && (
        <SnapIndicator point={hoverPoint} snappedToEndpoint={computeSnap(hoverPoint, walls).snappedToEndpoint} />
      )}

      {interactive && draft?.kind === 'wall-chain' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}
      {interactive && draft?.kind === 'room-polygon' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}
      {interactive && draft?.kind === 'zone-polygon' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}

      {interactive && hoverWall && (tool === 'door' || tool === 'window') && (
        <OpeningPreview
          wall={walls.find((w) => w.id === hoverWall.wallId)!}
          hover={hoverWall}
          kind={tool}
        />
      )}
    </group>
  );
}
