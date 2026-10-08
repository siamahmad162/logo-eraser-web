import { MediaCompare } from './MediaCompare';
import type { ClipRotation } from './useClipRotation';

// The before/after of the current clip. When the clip changes, the next one fades in over the one before, which stays
// where it was (a frozen last frame) until the fade is done.
export function ClipStage({ rot, rotate = true }: { rot: ClipRotation; rotate?: boolean }) {
  const layers = rot.out && rot.out.id !== rot.clip.id ? [rot.out, rot.clip] : [rot.clip];
  return (
    <div className="mc-swap">
      {layers.map((d) => {
        const now = d.id === rot.clip.id;
        return (
          <div key={d.id} className={now ? (rot.swapped ? 'mc-layer mc-in' : 'mc-layer') : 'mc-layer mc-out'} aria-hidden={now ? undefined : true} inert={!now}>
            <MediaCompare media={d.media} logo={d.logo} alt={d.alt} variant="hero" zoom eager onEnded={now && rotate ? rot.next : undefined} />
          </div>
        );
      })}
    </div>
  );
}
