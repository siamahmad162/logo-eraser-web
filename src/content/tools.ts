// The three removers, in one place: the header menu, the tools page, the footer and the home page all read this.
// They share one engine; each has its own page, so each can say exactly what it is for.
// (No JSX here, so the route table can import it.)
export type ToolId = 'omni' | 'veo' | 'gphoto';

export type ToolInfo = {
  id: ToolId;
  path: string;
  name: string;
  /** what it takes: shown as a chip */
  files: string;
  /** how the logo is found */
  how: 'Automatic' | 'Draw a box';
  short: string;
  long: string;
  points: string[];
};

export const TOOLS: ToolInfo[] = [
  {
    id: 'omni',
    path: '/gemini-omni-watermark-remover',
    name: 'Gemini Omni watermark remover',
    files: 'Videos',
    how: 'Automatic',
    short: 'Finds the Gemini sparkle in a video and restores the real picture under it, frame by frame.',
    long: 'The sparkle in the corner of a Gemini video is see-through, so the real picture is still there. It is found by its shape, measured in your file and undone in every frame. Nothing to draw.',
    points: ['The real pixels come back, not a guess', 'Steady in motion: no smudge, no flicker', 'Whole folders at once, one ZIP out'],
  },
  {
    id: 'veo',
    path: '/veo-watermark-remover',
    name: 'Veo watermark remover',
    files: 'Videos',
    how: 'Automatic',
    short: 'Removes the sparkle and the “Veo” text mark from Veo clips, wide or vertical, without losing quality.',
    long: 'A Veo clip can carry the sparkle, the “Veo” text mark, or both. Each one is found by itself and removed from every frame, and the clip keeps its size, frame rate, length and sound.',
    points: ['Sparkle and Veo text mark, found by itself', 'Wide and vertical clips alike', 'Same size, frame rate, length and sound'],
  },
  {
    id: 'gphoto',
    path: '/gemini-photo-watermark-remover',
    name: 'Gemini photo watermark remover',
    files: 'Photos',
    how: 'Automatic',
    short: 'Removes the Gemini sparkle from an image: fitted to your picture and reversed, with no blur.',
    long: 'A photo has one frame only, so the sparkle’s known shape is fitted to your image (its place, size, softness and strength) and reversed on each colour channel. PNG stays lossless.',
    points: ['Fitted to your image, not painted over', 'PNG stays lossless, JPG stays high quality', 'As many images as you like, one ZIP out'],
  },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const TOOL_PATHS: string[] = TOOLS.map((t) => t.path);

// The use cases, as the header menu and the footer list them: the Gemini overview page, then one page for each remover.
export type UseCase = { path: string; name: string; note: string; icon: ToolId | 'overview' };
export const USE_CASES: UseCase[] = [
  { path: '/gemini-watermark-remover', name: 'Gemini watermark remover', note: 'Videos and images, all in one place', icon: 'overview' },
  ...TOOLS.map((t) => ({ path: t.path, name: t.name, note: { omni: 'For videos made with Gemini', veo: 'For Veo clips, wide or vertical', gphoto: 'For images made with Gemini' }[t.id], icon: t.id as ToolId })),
];
