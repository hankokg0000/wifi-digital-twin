import { Grid } from '@react-three/drei';

/** Ground grid for the active level: 0.5 m minor lines, 1 m major lines. */
export function GridFloor() {
  return (
    <Grid
      position={[0, -0.005, 0]}
      args={[60, 60]}
      cellSize={0.5}
      cellThickness={0.5}
      cellColor="#3a4048"
      sectionSize={1}
      sectionThickness={1}
      sectionColor="#575f68"
      fadeDistance={60}
      fadeStrength={1}
      infiniteGrid
    />
  );
}
