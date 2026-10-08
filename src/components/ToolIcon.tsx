import { Photo, Sparkle, Text } from './Icons';
import type { ToolId } from '../content/tools';

// one small picture per remover (the sparkle, the “Veo” text, a photo)
const MAP = { omni: Sparkle, veo: Text, gphoto: Photo } as const;
export function ToolIcon({ id, className }: { id: ToolId; className?: string }) {
  const I = MAP[id];
  return <I className={className} />;
}
