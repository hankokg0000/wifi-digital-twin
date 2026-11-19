import { useMemo } from 'react';
import { liveLinkOf, roomsCrossed, type Id, type LiveLink } from '../../core';
import { useSceneStore } from '../store';
import { useSensingStore } from '../sensing/sensingStore';

/** The Site's placed Link in the current doc, or null (simulation, or devices not placed yet). */
export function useLiveLink(): LiveLink | null {
  const doc = useSceneStore((s) => s.doc);
  return useMemo(() => liveLinkOf(doc), [doc]);
}

/** Rooms the Link passes through; empty without a Link. */
export function useCrossedRoomIds(): Set<Id> {
  const doc = useSceneStore((s) => s.doc);
  return useMemo(() => {
    const link = liveLinkOf(doc);
    if (!link) return new Set<Id>();
    const rooms = doc.rooms.filter((r) => r.levelId === link.levelId);
    return new Set(roomsCrossed(rooms, link.tx, link.rx).map((c) => c.roomId));
  }, [doc]);
}

/**
 * The single Live Mirror signal shared by the Link line and the room fills so they always agree:
 * `mirrored` = Observed evidence is flowing (live, fake, or replay); `motion` = the detector's
 * current verdict is motion.
 */
export function useLiveMirror(): { mirrored: boolean; motion: boolean } {
  const mirrored = useSensingStore((s) => s.source === 'replay' || s.connection === 'live' || s.connection === 'fake');
  const motion = useSensingStore((s) => s.verdict?.motion === true);
  return { mirrored, motion };
}
