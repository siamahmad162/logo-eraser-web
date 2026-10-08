import { useCallback, useEffect, useState } from 'react';
import type { Demo } from '../media';

// A few clips one after the other: when one has played to its end the next one starts. The next clip is fetched while the
// current one plays, so there is no gap. Only videos rotate; a list of images stays on the one picked.
export function useClipRotation(clips: Demo[]) {
  const [i, setI] = useState(0);
  const next = useCallback(() => setI((k) => (k + 1) % clips.length), [clips.length]);
  useEffect(() => {
    const n = clips[(i + 1) % clips.length];
    if (!n || n.media.kind !== 'video') return;
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto';
    v.src = v.canPlayType('video/webm') ? n.media.webm : n.media.mp4 || n.media.webm;
    v.load();
    return () => { v.removeAttribute('src'); v.load(); };
  }, [i, clips]);
  return { index: i, clip: clips[i], setIndex: setI, next, rotates: clips.every((c) => c.media.kind === 'video') && clips.length > 1 };
}
