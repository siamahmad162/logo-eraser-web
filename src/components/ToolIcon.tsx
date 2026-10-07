import { Box, Cloud, Photo, Sparkle } from './Icons';
import type { ToolId } from '../content/tools';

// one small picture per remover
const MAP = { gemini: Sparkle, sora: Cloud, video: Box, photo: Photo } as const;
export function ToolIcon({ id, className }: { id: ToolId; className?: string }) {
  const I = MAP[id];
  return <I className={className} />;
}
