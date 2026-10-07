// The four removers, in one place: the header menu, the tools page, the footer and the home page all read this.
// (No JSX here, so the route table can import it.)
export type ToolId = 'gemini' | 'sora' | 'video' | 'photo';

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
    id: 'gemini',
    path: '/app',
    name: 'Gemini & Veo remover',
    files: 'Videos · Photos',
    how: 'Automatic',
    short: 'The Gemini sparkle and the Veo text mark, restored to the exact pixels.',
    long: 'Finds the Gemini sparkle and the Veo text mark by itself and undoes them, so the real picture comes back. Nothing to draw.',
    points: ['The real pixels come back, not a guess', 'Steady in motion: no smudge, no flicker', 'Whole folders at once, one ZIP out'],
  },
  {
    id: 'sora',
    path: '/sora-watermark-remover',
    name: 'Sora watermark remover',
    files: 'Videos',
    how: 'Automatic',
    short: 'Finds the moving Sora mark at every moment and rebuilds the picture under it.',
    long: 'The Sora mark jumps around the frame. It is found at every moment and removed from every frame; where the scene stands still the picture is copied back from the moments when the mark was elsewhere.',
    points: ['Found by itself, even while it moves', 'Same size, frame rate, length and sound', 'Nothing is uploaded'],
  },
  {
    id: 'video',
    path: '/remove-logo-from-video',
    name: 'Video logo remover',
    files: 'Videos',
    how: 'Draw a box',
    short: 'Drag a box around any steady logo, badge or date stamp. It is rebuilt in every frame.',
    long: 'For logos the tool does not know: draw a box and the logo is removed from every frame. Moving scenes show the hidden pixels in other frames, and they are copied back.',
    points: ['Any logo that stays in one place', 'Only the logo itself is rebuilt', 'See the result before you download'],
  },
  {
    id: 'photo',
    path: '/remove-logo-from-photo',
    name: 'Photo logo remover',
    files: 'Photos',
    how: 'Draw a box',
    short: 'Box in a logo or watermark; only its own pixels are rebuilt from the picture around them.',
    long: 'Draw a box around a logo, a stamp or a watermark. Its own pixels are told apart from the picture and rebuilt from around them, with the photo’s grain put back. Add as many boxes as you need.',
    points: ['As many boxes as you need on one photo', 'PNG stays lossless, JPG stays high quality', 'Nothing is uploaded'],
  },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const TOOL_PATHS: string[] = TOOLS.map((t) => t.path);
