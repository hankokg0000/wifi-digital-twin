import { useCallback, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Level, Vec2, Id } from '../../core';
import { useSceneStore } from '../store';
import { TOOL_HANDLERS, useSelectDrag, type ToolContext } from '../tools';
import { WallMesh } from './WallMesh';
import { OpeningMesh } from './OpeningMesh';
import { RoomMesh } from './RoomMesh';
import { ObjectMesh } from './ObjectMesh';
import { RadioMesh } from './RadioMesh';
import { ZoneMesh } from './ZoneMesh';
import { GridFloor } from './GridFloor';
import { FloorSlab } from './FloorSlab';
import type { Bounds } from './bounds';
import { InteractionPlane } from './InteractionPlane';
import { SnapIndicator, DraftChainPreview, OpeningPreview } from './Previews';
import { computeSnap, findHoverWall } from './snapping';

interface LevelGroupProps {
  level: Level;
  opacity: number;
  interactive: boolean;
  bounds: Bounds;
}

/** Plan view slices walls at this height (m) so doors and windows read as gaps. */
const PLAN_CUT_HEIGHT = 1.2;

export function LevelGroup({ level, opacity, interactive, bounds }: LevelGroupProps) {
  const doc = useSceneStore((s) => s.doc);
  const tool = useSceneStore((s) => s.tool);
  const editing = useSceneStore((s) => s.mode) === 'edit';
  const viewMode = useSceneStore((s) => s.viewMode);
  const cutHeight = viewMode === 'plan' ? PLAN_CUT_HEIGHT : undefined;
  const selection = useSceneStore((s) => s.selection);
  const draft = useSceneStore((s) => s.draft);
  const setSelection = useSceneStore((s) => s.setSelection);
  const setDraft = useSceneStore((s) => s.setDraft);
  const apply = useSceneStore((s) => s.apply);
  const applyOp = useSceneStore((s) => s.applyOp);

  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null);

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

  const selectable = editing && interactive && tool === 'select';

  const select = useCallback(
    (id: Id) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setSelection(id);
    },
    [setSelection],
  );

  const { drag, startDrag, moveDrag } = useSelectDrag(walls);

  const toolCtx = useMemo<ToolContext>(
    () => ({ doc, levelId: level.id, walls, selection, draft, apply, applyOp, setDraft, setSelection }),
    [doc, level.id, walls, selection, draft, apply, applyOp, setDraft, setSelection],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const raw: Vec2 = [e.point.x, e.point.z];
      if (moveDrag(raw)) return;
      setHoverPoint(TOOL_HANDLERS[tool].onMove?.(toolCtx, raw) ?? null);
    },
    [tool, toolCtx, moveDrag],
  );

  const hoverWall = useMemo(() => {
    if (!interactive || !hoverPoint) return null;
    if (tool !== 'door' && tool !== 'window') return null;
    return findHoverWall(hoverPoint, walls);
  }, [interactive, hoverPoint, tool, walls]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      TOOL_HANDLERS[tool].onClick?.(toolCtx, [e.point.x, e.point.z]);
    },
    [tool, toolCtx],
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
      {viewMode === '3d' && <FloorSlab bounds={bounds} opacity={opacity} />}
      {editing && interactive && (
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

      {editing && interactive && hoverPoint && TOOL_HANDLERS[tool].snapIndicator && (
        <SnapIndicator point={hoverPoint} snappedToEndpoint={computeSnap(hoverPoint, walls).snappedToEndpoint} />
      )}

      {editing && interactive && draft?.kind === 'wall-chain' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}
      {editing && interactive && draft?.kind === 'room-polygon' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}
      {editing && interactive && draft?.kind === 'zone-polygon' && <DraftChainPreview points={draft.points} cursor={hoverPoint} />}

      {editing && interactive && hoverWall && (tool === 'door' || tool === 'window') && (
        <OpeningPreview
          wall={walls.find((w) => w.id === hoverWall.wallId)!}
          hover={hoverWall}
          kind={tool}
        />
      )}
    </group>
  );
}
