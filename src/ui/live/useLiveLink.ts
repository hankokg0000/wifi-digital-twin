import { useMemo } from 'react';
import { liveLinkOf, roomsCrossed, type Id, type LiveLink } from '../../core';
import { useSceneStore } from '../store';
import { selectMotion, selectSensingOrigin, useSensingStore } from '../sensing/sensingStore';

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
 * The Link and room fills share the same WiFi source and current Motion Detection verdict.
 */
export function useLiveMirror(): { mirrored: boolean; motion: boolean } {
  const mirrored = useSensingStore((s) => selectSensingOrigin(s) !== null);
  const motion = useSensingStore(selectMotion);
  return { mirrored, motion };
}
