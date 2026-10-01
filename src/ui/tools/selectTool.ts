import { useCallback, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { toggleOpening, updateObject, updateRadio } from '../../core';
import type { Wall, Vec2, Id } from '../../core';
import { useSceneStore } from '../store';
import { findEntity } from '../entityLookup';
import { computeSnap } from '../canvas/snapping';
import type { ToolHandler } from './types';

export const selectTool: ToolHandler = {
  onMove: () => null,
  onClick: (ctx) => ctx.setSelection(null),
  onKey: (ctx, e) => {
    if (e.key === ' ' && ctx.selection) {
      const found = findEntity(ctx.doc, ctx.selection);
      if (found?.kind === 'opening') {
        e.preventDefault();
        const id = ctx.selection;
        ctx.apply((d) => toggleOpening(d, id));
      }
      return true;
    }
    return false;
  },
};

export type DragState = { id: Id; kind: 'object' | 'radio'; position: [number, number, number] } | null;

/**
 * Drag-to-move for scene objects and radios in the select tool. `startDrag` is attached to
 * the entity mesh; `moveDrag` is fed from the interaction plane's pointer-move and returns
 * true while a drag is in progress (consuming the move); pointerup commits.
 */
export function useSelectDrag(walls: Wall[]) {
  const apply = useSceneStore((s) => s.apply);
  const setCameraLocked = useSceneStore((s) => s.setCameraLocked);
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);

  const startDrag = useCallback(
    (id: Id, kind: 'object' | 'radio', position: [number, number, number]) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // Lock the camera controls immediately: in plan view MapControls' left button pans, and
      // in 3D OrbitControls' left button rotates, either of which would otherwise fight this drag.
      setCameraLocked(true);
      const next: DragState = { id, kind, position };
      setDrag(next);
      dragRef.current = next;

      // Coordinate updates arrive via the InteractionPlane's onPointerMove (moveDrag
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

  const moveDrag = useCallback(
    (raw: Vec2): boolean => {
      if (!dragRef.current) return false;
      const snapped = computeSnap(raw, walls).point;
      const y = dragRef.current.position[1];
      const next: DragState = { ...dragRef.current, position: [snapped[0], y, snapped[1]] };
      dragRef.current = next;
      setDrag(next);
      return true;
    },
    [walls],
  );

  return { drag, startDrag, moveDrag };
}
