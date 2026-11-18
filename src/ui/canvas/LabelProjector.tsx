import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { labelEntries, resolveLabelOverlaps, type LabelCandidate } from './labels';

const REMEASURE_EVERY = 45; // frames — label text can change width (signal readout, names)

/**
 * Lives inside <Canvas>. Every frame, projects each registered label's world position to
 * screen pixels (relative to the canvas) using the live camera, and writes the result
 * directly to the label's DOM element style. Then de-clutters: overlapping labels lose to the
 * higher-priority one via the `label-collided` class. Three independent mechanisms keep
 * a label hidden and never fight: `display` (setLabelHidden), `visibility` (off-screen, here),
 * and the `label-collided` class (opacity).
 */
export function LabelProjector() {
  const vRef = useRef(new THREE.Vector3());
  const poolRef = useRef<LabelCandidate[]>([]);
  const frameRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  useFrame(({ camera, size }) => {
    const v = vRef.current;
    const pool = poolRef.current;
    let n = 0;

    const resized = sizeRef.current.w !== size.width || sizeRef.current.h !== size.height;
    sizeRef.current.w = size.width;
    sizeRef.current.h = size.height;
    const remeasure = resized || ++frameRef.current % REMEASURE_EVERY === 0;

    for (const [id, entry] of labelEntries()) {
      const { el, world } = entry;
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

      if (el.style.display === 'none') continue; // hidden on purpose: takes no space
      if (entry.w === 0 || entry.h === 0 || remeasure) {
        entry.w = el.offsetWidth;
        entry.h = el.offsetHeight;
        entry.my = parseFloat(getComputedStyle(el).marginTop) || 0;
      }
      if (entry.w === 0 || entry.h === 0) continue;

      let c = pool[n];
      if (!c) {
        c = { id, rect: { x: 0, y: 0, w: 0, h: 0 }, priority: 1 };
        pool[n] = c;
      }
      c.id = id;
      c.priority = entry.priority;
      c.rect.x = x - entry.w / 2;
      c.rect.y = y - entry.h / 2 + entry.my;
      c.rect.w = entry.w;
      c.rect.h = entry.h;
      n++;
    }

    const hide = resolveLabelOverlaps(n === pool.length ? pool : pool.slice(0, n));
    for (const [id, entry] of labelEntries()) {
      const collided = hide.has(id);
      if (collided !== entry.collided) {
        entry.collided = collided;
        entry.el.classList.toggle('label-collided', collided);
      }
    }
  });

  return null;
}
