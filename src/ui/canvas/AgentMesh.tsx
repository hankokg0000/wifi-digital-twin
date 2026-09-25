import type { ThreeEvent } from '@react-three/fiber';
import type { Agent } from '../../core';

interface AgentMeshProps {
  agent: Agent;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

export function AgentMesh({ agent, selected, interactive, opacity, onSelect }: AgentMeshProps) {
  const start = agent.path[0]?.p ?? [0, 0];
  const [x, z] = start;
  const y = agent.height / 2;

  return (
    <mesh position={[x, y, z]} onClick={interactive ? onSelect : undefined}>
      <cylinderGeometry args={[agent.radius, agent.radius, agent.height, 16]} />
      <meshStandardMaterial
        color={selected ? '#5ac8fa' : '#e8b98c'}
        emissive={selected ? '#1c6fa8' : '#000000'}
        emissiveIntensity={selected ? 0.4 : 0}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}
