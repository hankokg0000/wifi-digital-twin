import type { ThreeEvent } from '@react-three/fiber';
import { useSceneStore } from '../store';
import { StairMesh } from './StairMesh';

/**
 * Renders every stair once, in absolute world space — independent of the active level/view
 * mode, since a stair is meant to read correctly from both the level it starts on and the one
 * it lands on (design brief: "visible on both levels").
 */
export function StairsLayer() {
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const tool = useSceneStore((s) => s.tool);
  const setSelection = useSceneStore((s) => s.setSelection);

  return (
    <>
      {doc.stairs.map((stair) => {
        const fromLevel = doc.levels.find((l) => l.id === stair.fromLevelId);
        const toLevel = doc.levels.find((l) => l.id === stair.toLevelId);
        if (!fromLevel || !toLevel) return null;
        const onClick =
          tool === 'select'
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                setSelection(stair.id);
              }
            : undefined;
        return (
          <group key={stair.id} onClick={onClick}>
            <StairMesh
              stair={stair}
              fromElevation={fromLevel.elevation}
              toElevation={toLevel.elevation}
              selected={selection === stair.id}
            />
          </group>
        );
      })}
    </>
  );
}
