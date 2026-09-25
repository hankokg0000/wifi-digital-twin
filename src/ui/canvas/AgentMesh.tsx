import { forwardRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import type { Agent } from '../../core';

interface BodyProps {
  color: string;
  emissive: string;
  emissiveIntensity: number;
}

/** Person: capsule body (radius, height − 2·radius) + head sphere + a small forward nose
 * showing heading, per the design brief. */
function PersonBody({ radius, height, color, emissive, emissiveIntensity }: BodyProps & { radius: number; height: number }) {
  const bodyLength = Math.max(height - 2 * radius, 0.02);
  return (
    <>
      <mesh position={[0, height / 2, 0]}>
        <capsuleGeometry args={[radius, bodyLength, 4, 8]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, height + radius * 0.45, 0]}>
        <sphereGeometry args={[radius * 0.6, 12, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      {/* Nose/arrow: local +z is "forward" (heading 0), rotated to point that way. */}
      <mesh position={[0, height * 0.55, radius + 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[radius * 0.35, radius * 0.7, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

/** Pet: horizontal capsule/box ~0.5 × 0.2 m + head, per the design brief. */
function PetBody({ height, color, emissive, emissiveIntensity }: BodyProps & { height: number }) {
  const diameter = Math.max(height, 0.15);
  const bodyLength = 0.5;
  return (
    <>
      <mesh position={[0, diameter / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[diameter / 2, Math.max(bodyLength - diameter, 0.05), 4, 8]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, diameter / 2, bodyLength / 2 - 0.02]}>
        <sphereGeometry args={[diameter * 0.4, 10, 10]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
    </>
  );
}

/** Lying-on-the-floor pose for a fallen person: the same capsule, tipped onto its side, plus a
 * red ring on the floor beneath it. <AgentsLayer> toggles this whole group's `.visible` (found
 * by name, no React re-render) whenever the agent's sampled posture is 'fallen', and pulses the
 * ring's opacity itself every frame — see AgentsLayer's useFrame. */
function FallenBody({ radius, color }: { radius: number; color: string }) {
  const bodyLength = Math.max(radius * 3, 0.35);
  return (
    <group name="fallen" visible={false}>
      <mesh position={[0, radius, bodyLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[radius, bodyLength, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh name="fallenRing" position={[0, 0.03, bodyLength / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.4, radius * 2.0, 24]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.8} depthWrite={false} />
      </mesh>
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
  const color = selected ? '#5ac8fa' : agent.color;
  const emissive = selected ? '#1c6fa8' : '#000000';
  const emissiveIntensity = selected ? 0.4 : 0;

  return (
    <group ref={ref} onClick={interactive ? onSelect : undefined}>
      <group name="standing">
        {agent.kind === 'person' ? (
          <PersonBody radius={agent.radius} height={agent.height} color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        ) : (
          <PetBody height={agent.height} color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        )}
      </group>
      {agent.kind === 'person' && <FallenBody radius={agent.radius} color={color} />}
    </group>
  );
});
