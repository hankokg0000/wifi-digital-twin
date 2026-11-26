import { useEffect } from 'react';
import { activeSite, quickRoomDoc } from '../../core';
import { useSceneStore } from '../store';
import { useSensingStore } from '../sensing/sensingStore';
import { fetchSites, setWantReal, useLiveStore } from './liveStore';

/** Renders nothing; mounts once. Keeps the shown doc in step with the real/sim wish and the Site. */
export function LiveDriver(): null {
  const sites = useLiveStore((s) => s.sites);
  const wantReal = useLiveStore((s) => s.wantReal);
  const channel = useSensingStore((s) => s.channel);
  const loaded = sites !== null;
  const site = activeSite(sites);
  const siteKey = JSON.stringify(site) + String(channel);

  useEffect(() => {
    void fetchSites();
  }, []);

  // Leaving real by other means (loading a file or the demo) clears the wish so the switch agrees.
  useEffect(
    () =>
      useSceneStore.subscribe((s, prev) => {
        if (prev.reality === 'real' && s.reality === 'sim' && useLiveStore.getState().wantReal) setWantReal(false);
      }),
    [],
  );

  useEffect(() => {
    const st = useSceneStore.getState();
    if (wantReal && loaded) {
      const doc = quickRoomDoc(site, channel);
      if (st.reality === 'real') st.replaceRealDoc(doc);
      else st.enterReal(doc);
    } else if (!wantReal && st.reality === 'real') {
      st.exitReal();
    }
    // `site`/`channel` are covered by siteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantReal, loaded, siteKey]);

  return null;
}
