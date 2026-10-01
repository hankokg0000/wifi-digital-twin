import { forwardRef, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group } from 'three';
import type { Agent } from '../../core';
import { PALETTE } from '../theme/palette';

/** Person: capsule body + head sphere, plus a small forward notch showing heading. */
function PersonBody({ radius, height, color }: { radius: number; height: number; color: string }) {
  const bodyLength = Math.max(height - 2 * radius, 0.02);
  return (
    <>
      <mesh position={[0, height / 2, 0]}>
        <capsuleGeometry args={[radius, bodyLength, 4, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.55} />
      </mesh>
      <mesh position={[0, height + radius * 0.45, 0]}>
        <sphereGeometry args={[radius * 0.6, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.55} />
      </mesh>
      {/* Heading notch: local +z is "forward" (heading 0). */}
      <mesh position={[0, height * 0.6, radius + 0.07]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[radius * 0.4, radius * 0.8, 10]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.5} />
      </mesh>
    </>
  );
}

/** Pet: horizontal capsule ~0.5 m + head. */
function PetBody({ height, color }: { height: number; color: string }) {
  const diameter = Math.max(height, 0.15);
  const bodyLength = 0.5;
  return (
    <>
      <mesh position={[0, diameter / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[diameter / 2, Math.max(bodyLength - diameter, 0.05), 4, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.6} />
      </mesh>
      <mesh position={[0, diameter / 2, bodyLength / 2 - 0.02]}>
        <sphereGeometry args={[diameter * 0.42, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.6} />
      </mesh>
    </>
  );
}

/** Lying-on-the-floor pose for a fallen person (the same capsule tipped onto its side). The
 * pulsing concentric critical rings live in the floor-effects group so they stay at full
 * strength; <AgentsLayer> animates them each frame (static under reduced motion). */
function FallenBody({ radius, color }: { radius: number; color: string }) {
  const bodyLength = Math.max(radius * 3, 0.35);
  return (
    <group name="fallen" visible={false}>
      <mesh position={[0, radius, bodyLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[radius, bodyLength, 4, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.55} />
      </mesh>
    </group>
  );
}

const ringGeo = (inner: number, outer: number) => new THREE.RingGeometry(inner, outer, 48);

/** Flat floor decoration: soft same-hue halo, accent selection ring, fallen alarm rings. All
 * meshes carry `userData.fx` so <AgentsLayer>'s ghost-opacity pass leaves them alone. */
function FloorEffects({ radius, color, selected, isPerson, fallOffset }: { radius: number; color: string; selected: boolean; isPerson: boolean; fallOffset: number }) {
  const halo = radius * 2.3;
  const geos = useMemo(
    () => ({
      haloFill: new THREE.CircleGeometry(halo, 40),
      haloEdge: ringGeo(halo * 0.94, halo),
      selRing: ringGeo(halo * 1.12, halo * 1.28),
      alarm: ringGeo(0.96, 1),
    }),
    [halo],
  );
  return (
    <group name="floorfx" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
      <group name="halo">
        <mesh geometry={geos.haloFill} userData={{ fx: true }}>
          <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
        </mesh>
        <mesh geometry={geos.haloEdge} userData={{ fx: true }}>
          <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
      {selected && (
        <mesh geometry={geos.selRing} position={[0, 0, 0.002]} userData={{ fx: true }}>
          <meshBasicMaterial color={PALETTE.accent} depthWrite={false} />
        </mesh>
      )}
      {isPerson && (
        <group name="alarm" visible={false} position={[0, 0, 0.004]}>
          {[0, 1, 2].map((i) => (
            // lie along the fallen body's centre (z of local floor frame is the body's forward)
            <mesh key={i} name={`alarmRing${i}`} geometry={geos.alarm} position={[0, -fallOffset, 0]} userData={{ fx: true }}>
              <meshBasicMaterial color={PALETTE.critical} transparent opacity={0.8} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

interface AgentMeshProps {
  agent: Agent;
  selected: boolean;
  interactive: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * The agent's visual body only — NOT its position. <AgentsLayer> owns one persistent instance
 * per agent and drives this group's position/rotation directly every simulation frame (via the
 * forwarded ref), so agent motion never goes through React state/props. Both the standing and
 * fallen poses are always mounted (named "standing"/"fallen"); AgentsLayer toggles which one is
 * visible per frame from the sampled posture, again without touching React.
 */
export const AgentMesh = forwardRef<Group, AgentMeshProps>(function AgentMesh({ agent, selected, interactive, onSelect }, ref) {
  const isPerson = agent.kind === 'person';
  const fallLen = Math.max(agent.radius * 3, 0.35);
  return (
    <group ref={ref} onClick={interactive ? onSelect : undefined}>
      <FloorEffects
        radius={isPerson ? agent.radius : Math.max(agent.radius, 0.2)}
        color={agent.color}
        selected={selected}
        isPerson={isPerson}
        fallOffset={fallLen / 2}
      />
      <group name="standing">
        {isPerson ? (
          <PersonBody radius={agent.radius} height={agent.height} color={agent.color} />
        ) : (
          <PetBody height={agent.height} color={agent.color} />
        )}
      </group>
      {isPerson && <FallenBody radius={agent.radius} color={agent.color} />}
    </group>
  );
});
