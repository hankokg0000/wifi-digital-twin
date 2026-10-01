import { Grid } from '@react-three/drei';
import { PALETTE } from '../theme/palette';

/** Ground grid for the active level: very subtle 0.5 m minor lines, slightly stronger 1 m majors. */
export function GridFloor() {
  return (
    <Grid
      position={[0, -0.005, 0]}
      args={[60, 60]}
      cellSize={0.5}
      cellThickness={0.6}
      cellColor={PALETTE.gridMinor}
      sectionSize={1}
      sectionThickness={1}
      sectionColor={PALETTE.gridMajor}
      fadeDistance={34}
      fadeStrength={1}
      infiniteGrid
    />
  );
}
