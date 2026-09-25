import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { labelEntries } from './labels';

/**
 * Lives inside <Canvas>. Every frame, projects each registered label's world position to
 * screen pixels (relative to the canvas) using the live camera, and writes the result
 * directly to the label's DOM element style. Renders nothing itself.
 */
export function LabelProjector() {
  const vRef = useRef(new THREE.Vector3());

  useFrame(({ camera, size }) => {
    const v = vRef.current;
    for (const [, { el, world }] of labelEntries()) {
      v.set(world[0], world[1], world[2]).project(camera);

      const offscreen = v.z > 1 || v.z < -1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1;
      if (offscreen) {
        el.style.visibility = 'hidden';
        continue;
      }

      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      el.style.visibility = 'visible';
    }
  });

  return null;
}
