import { useCallback, useEffect, useRef, useState } from 'react';
import type { Demo } from '../media';

// A few clips one after the other: when one has played to its end the next one fades in over it. The next clip is fetched
// while the current one plays, so there is no gap. Only videos rotate; a list of images stays on the one picked.
export function useClipRotation(clips: Demo[]) {
  const [i, setI] = useState(0);
  const [out, setOut] = useState<Demo | null>(null);   // the clip that is fading out
  const [swapped, setSwapped] = useState(false);       // true once the first change has happened (the first clip does not fade in)
  const cur = useRef(0);
  const go = useCallback((k: number) => {
    if (k === cur.current || !clips[k]) return;
    setOut(clips[cur.current]);
    cur.current = k;
    setI(k);
    setSwapped(true);
  }, [clips]);
  const next = useCallback(() => go((cur.current + 1) % clips.length), [go, clips.length]);
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => setOut(null), 1000);
    return () => clearTimeout(t);
  }, [out]);
  useEffect(() => {
    const n = clips[(i + 1) % clips.length];
    if (!n || n.media.kind !== 'video') return;
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto';
    v.src = v.canPlayType('video/webm') ? n.media.webm : n.media.mp4 || n.media.webm;
    v.load();
    return () => { v.removeAttribute('src'); v.load(); };
  }, [i, clips]);
  return { index: i, clip: clips[i], out, swapped, setIndex: go, next, rotates: clips.every((c) => c.media.kind === 'video') && clips.length > 1 };
}
export type ClipRotation = ReturnType<typeof useClipRotation>;
