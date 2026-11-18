import { useSceneStore } from '../store';
import { LevelGroup } from './LevelGroup';
import type { Bounds } from './bounds';

export function LevelsRenderer({ bounds }: { bounds: Bounds }) {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const viewMode = useSceneStore((s) => s.viewMode);
  const mode = useSceneStore((s) => s.mode);

  const activeLevel = doc.levels.find((l) => l.id === activeLevelId);
  const activeElevation = activeLevel?.elevation ?? 0;

  return (
    <>
      {doc.levels.map((level) => {
        const isActive = level.id === activeLevelId;
        const isAbove = level.elevation > activeElevation;
        const isBelow = level.elevation < activeElevation;

        // Upper levels are hidden in plan view and in Monitor's 3D cutaway (nothing may hide people).
        if (isAbove && (viewMode === 'plan' || mode === 'monitor')) return null;

        const opacity = isActive ? 1 : isAbove ? 0.3 : isBelow ? 0.2 : 1;
        const interactive = isActive;

        return (
          <LevelGroup key={level.id} level={level} opacity={opacity} interactive={interactive} bounds={bounds} />
        );
      })}
    </>
  );
}
