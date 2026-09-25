import { useSceneStore } from '../store';
import { LevelGroup } from './LevelGroup';

export function LevelsRenderer() {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const viewMode = useSceneStore((s) => s.viewMode);

  const activeLevel = doc.levels.find((l) => l.id === activeLevelId);
  const activeElevation = activeLevel?.elevation ?? 0;

  return (
    <>
      {doc.levels.map((level) => {
        const isActive = level.id === activeLevelId;
        const isAbove = level.elevation > activeElevation;
        const isBelow = level.elevation < activeElevation;

        if (isAbove && viewMode === 'plan') return null; // hidden above in plan view

        const opacity = isActive ? 1 : isAbove ? 0.3 : isBelow ? 0.2 : 1;
        const interactive = isActive;

        return (
          <LevelGroup key={level.id} level={level} opacity={opacity} interactive={interactive} />
        );
      })}
    </>
  );
}
