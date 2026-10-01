import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pointInPolygon, qualityOf, rssiDbm, sampleWorld, traceLink, type Obstruction, type Radio, type RfAgent } from '../../core';
import { useSceneStore } from '../store';
import { plansFor } from '../sim/cache';
import { simClockRef } from '../simClock';
import { useProbeStore, type ProbeData } from '../rf/probeStore';

const PROBE_HEIGHT = 1.0; // m — same receiver height as the heatmap

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function groupObstructions(list: Obstruction[]): ProbeData['obstructions'] {
  const byName = new Map<string, { name: string; count: number; lossDb: number }>();
  for (const o of list) {
    const g = byName.get(o.name);
    if (g) {
      g.count += 1;
      g.lossDb += o.lossDb;
    } else byName.set(o.name, { name: o.name, count: 1, lossDb: o.lossDb });
  }
  return [...byName.values()].sort((a, b) => b.lossDb - a.lossDb);
}

function hide() {
  const s = useProbeStore.getState();
  if (s.at || s.data) useProbeStore.setState({ at: null, data: null });
}

/**
 * Lives inside <Canvas>. While the signal layer is on, hovering the plan (Monitor, or Edit with
 * the Select tool) traces the links from every AP to that one point on the main thread and hands
 * the result to <ProbeTooltip/>. Renders nothing.
 */
export function ProbeController() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    let frame = 0;
    let last: PointerEvent | null = null;

    const compute = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const s = useSceneStore.getState();
      const level = s.doc.levels.find((l) => l.id === s.activeLevelId);
      const active = s.heatmap.enabled && s.viewMode === 'plan' && (s.mode === 'monitor' || s.tool === 'select') && e.buttons === 0;
      if (!active || !level) return hide();

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      plane.constant = -level.elevation;
      if (!ray.ray.intersectPlane(plane, hit)) return hide();

      const room = s.doc.rooms.find((r) => r.levelId === level.id && pointInPolygon([hit.x, hit.z], r.polygon));
      if (!room) return hide();

      const band = s.heatmap.band;
      const world = sampleWorld(s.doc, plansFor(s.doc), simClockRef.t);
      const agents: RfAgent[] = world.map((a) => ({ agentId: a.agentId, position: a.position, posture: a.posture }));
      const rx = { levelId: level.id, position: [hit.x, PROBE_HEIGHT, hit.z] as [number, number, number] };

      const links = s.doc.radios
        .filter((r: Radio) => r.role === 'ap')
        .flatMap((radio) => {
          const iface = radio.ifaces.find((f) => f.band === band);
          if (!iface) return [];
          const trace = traceLink(s.doc, { levelId: radio.levelId, position: radio.position }, rx, band, agents);
          return [{ radio, trace, dbm: rssiDbm(iface.txPowerDbm, radio.antennaGainDbi, trace.pathLossDb) }];
        })
        .sort((a, b) => b.dbm - a.dbm);

      const focus = links.find((l) => l.radio.id === s.heatmap.source) ?? links[0];
      const data: ProbeData = {
        roomName: room.name,
        rows: links.map((l) => ({ radioId: l.radio.id, name: l.radio.name, band, dbm: l.dbm, quality: qualityOf(l.dbm) })),
        linkName: focus?.radio.name ?? '',
        distance: focus?.trace.distance ?? 0,
        obstructions: focus ? groupObstructions(focus.trace.obstructions) : [],
      };
      useProbeStore.setState({ at: { x: px, y: py, w: rect.width, h: rect.height }, data });
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(compute);
    };
    const onLeave = () => {
      last = null;
      hide();
    };

    // Agents keep moving under a still cursor: refresh the open probe a few times a second.
    const refresh = setInterval(() => {
      if (last && useProbeStore.getState().at && !frame) frame = requestAnimationFrame(compute);
    }, 250);

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onLeave);
      clearInterval(refresh);
      if (frame) cancelAnimationFrame(frame);
      hide();
    };
  }, [gl, camera]);

  return null;
}
