// Demo media: real engine output. Each clip holds the original (top half) above the result
// (bottom half) in one file, so the two always play in sync. Logo positions are fractions of the frame.
import type { CompareMedia } from './components/MediaCompare';
import HeroWatchWebm from './assets/media/hero-watch.webm';
import HeroWatchMp4 from './assets/media/hero-watch.mp4';
import HeroWatchPoster from './assets/media/hero-watch-poster.webp';
import GOceanWebm from './assets/media/g-ocean.webm';
import GOceanMp4 from './assets/media/g-ocean.mp4';
import GOceanPoster from './assets/media/g-ocean-poster.webp';
import GGardenWebm from './assets/media/g-garden.webm';
import GGardenMp4 from './assets/media/g-garden.mp4';
import GGardenPoster from './assets/media/g-garden-poster.webp';
import GAlleyWebm from './assets/media/g-alley.webm';
import GAlleyMp4 from './assets/media/g-alley.mp4';
import GAlleyPoster from './assets/media/g-alley-poster.webp';
import GRamenWebm from './assets/media/g-ramen.webm';
import GRamenMp4 from './assets/media/g-ramen.mp4';
import GRamenPoster from './assets/media/g-ramen-poster.webp';
import VJellyWebm from './assets/media/v-jelly.webm';
import VJellyMp4 from './assets/media/v-jelly.mp4';
import VJellyPoster from './assets/media/v-jelly-poster.webp';
import VAuroraWebm from './assets/media/v-aurora.webm';
import VAuroraMp4 from './assets/media/v-aurora.mp4';
import VAuroraPoster from './assets/media/v-aurora-poster.webp';
import VLavaWebm from './assets/media/v-lava.webm';
import VLavaMp4 from './assets/media/v-lava.mp4';
import VLavaPoster from './assets/media/v-lava-poster.webp';
import VBoatWebm from './assets/media/v-boat.webm';
import VBoatMp4 from './assets/media/v-boat.mp4';
import VBoatPoster from './assets/media/v-boat-poster.webp';
import PLakeBefore from './assets/media/p-lake-before.webp';
import PLakeAfter from './assets/media/p-lake-after.webp';
import PDesertBefore from './assets/media/p-desert-before.webp';
import PDesertAfter from './assets/media/p-desert-after.webp';
import PWorkshopBefore from './assets/media/p-workshop-before.webp';
import PWorkshopAfter from './assets/media/p-workshop-after.webp';
import PSneakerBefore from './assets/media/p-sneaker-before.webp';
import PSneakerAfter from './assets/media/p-sneaker-after.webp';
import PBreakfastBefore from './assets/media/p-breakfast-before.webp';
import PBreakfastAfter from './assets/media/p-breakfast-after.webp';
import PBoatBefore from './assets/media/p-boat-before.webp';
import PBoatAfter from './assets/media/p-boat-after.webp';
import TSoraWebm from './assets/media/t-sora.webm';
import TSoraMp4 from './assets/media/t-sora.mp4';
import TSoraPoster from './assets/media/t-sora-poster.webp';
import TVideoWebm from './assets/media/t-video.webm';
import TVideoMp4 from './assets/media/t-video.mp4';
import TVideoPoster from './assets/media/t-video-poster.webp';
import TPhotoBefore from './assets/media/t-photo-before.webp';
import TPhotoAfter from './assets/media/t-photo-after.webp';
import type { ToolId } from './content/tools';

// (the single-file test build carries only WebM, which every browser it targets plays)
const FILE = import.meta.env.MODE === 'file';

export type Demo = { id: string; source: 'Gemini' | 'Veo' | 'Photo' | 'Sora' | 'Logo'; title: string; alt: string; media: CompareMedia; logo: { x: number; y: number } };

export const CLIPS = {
  HERO_WATCH: { id: 'hero-watch', source: 'Gemini', title: 'Luxury watch', alt: 'A luxury watch turning on a pedestal', media: { kind: 'video', webm: HeroWatchWebm, mp4: FILE ? '' : HeroWatchMp4, poster: HeroWatchPoster, w: 1280, h: 720 }, logo: { x: 0.906, y: 0.833 } },
  G_OCEAN: { id: 'g-ocean', source: 'Gemini', title: 'Night ocean', alt: 'Waves on dark rocks at night', media: { kind: 'video', webm: GOceanWebm, mp4: FILE ? '' : GOceanMp4, poster: GOceanPoster, w: 640, h: 360 }, logo: { x: 0.75, y: 0.6 } },
  G_GARDEN: { id: 'g-garden', source: 'Gemini', title: 'Glowing garden', alt: 'A 3D garden of glowing flowers', media: { kind: 'video', webm: GGardenWebm, mp4: FILE ? '' : GGardenMp4, poster: GGardenPoster, w: 640, h: 360 }, logo: { x: 0.75, y: 0.6 } },
  G_ALLEY: { id: 'g-alley', source: 'Gemini', title: 'Neon alley', alt: 'A rainy neon alley at night', media: { kind: 'video', webm: GAlleyWebm, mp4: FILE ? '' : GAlleyMp4, poster: GAlleyPoster, w: 640, h: 360 }, logo: { x: 0.75, y: 0.6 } },
  G_RAMEN: { id: 'g-ramen', source: 'Gemini', title: 'Ramen (9:16)', alt: 'A steaming bowl of ramen', media: { kind: 'video', webm: GRamenWebm, mp4: FILE ? '' : GRamenMp4, poster: GRamenPoster, w: 360, h: 640 }, logo: { x: 0.749, y: 0.749 } },
  V_JELLY: { id: 'v-jelly', source: 'Veo', title: 'Deep-sea jellyfish', alt: 'Glowing jellyfish in the deep sea', media: { kind: 'video', webm: VJellyWebm, mp4: FILE ? '' : VJellyMp4, poster: VJellyPoster, w: 640, h: 360 }, logo: { x: 0.916, y: 0.883 } },
  V_AURORA: { id: 'v-aurora', source: 'Veo', title: 'Aurora lake', alt: 'Snowy pines under the northern lights', media: { kind: 'video', webm: VAuroraWebm, mp4: FILE ? '' : VAuroraMp4, poster: VAuroraPoster, w: 640, h: 360 }, logo: { x: 0.916, y: 0.883 } },
  V_LAVA: { id: 'v-lava', source: 'Veo', title: 'Lava field', alt: 'Glowing lava at night', media: { kind: 'video', webm: VLavaWebm, mp4: FILE ? '' : VLavaMp4, poster: VLavaPoster, w: 640, h: 360 }, logo: { x: 0.916, y: 0.883 } },
  V_BOAT: { id: 'v-boat', source: 'Veo', title: 'Lantern boat (9:16)', alt: 'Dark river water at night', media: { kind: 'video', webm: VBoatWebm, mp4: FILE ? '' : VBoatMp4, poster: VBoatPoster, w: 360, h: 640 }, logo: { x: 0.85, y: 0.934 } },
} satisfies Record<string, Demo>;

export const PHOTOS: Demo[] = [
  { id: 'p-lake', source: 'Photo', title: 'Moonlit lake', alt: 'Moonlit lake (AI image)', media: { kind: 'image', before: PLakeBefore, after: PLakeAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
  { id: 'p-desert', source: 'Photo', title: 'Desert night sky', alt: 'Desert night sky (AI image)', media: { kind: 'image', before: PDesertBefore, after: PDesertAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
  { id: 'p-workshop', source: 'Photo', title: 'Isometric workshop', alt: 'Isometric workshop (AI image)', media: { kind: 'image', before: PWorkshopBefore, after: PWorkshopAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
  { id: 'p-sneaker', source: 'Photo', title: 'Sneaker', alt: 'Sneaker (AI image)', media: { kind: 'image', before: PSneakerBefore, after: PSneakerAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
  { id: 'p-breakfast', source: 'Photo', title: 'Breakfast', alt: 'Breakfast (AI image)', media: { kind: 'image', before: PBreakfastBefore, after: PBreakfastAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
  { id: 'p-boat', source: 'Photo', title: 'Lantern boat', alt: 'Lantern boat (AI image)', media: { kind: 'image', before: PBoatBefore, after: PBoatAfter, w: 480, h: 270 }, logo: { x: 0.75, y: 0.6 } },
];

export const GALLERY_VIDEOS: Demo[] = [CLIPS.G_OCEAN, CLIPS.G_GARDEN, CLIPS.G_ALLEY, CLIPS.V_JELLY, CLIPS.V_AURORA, CLIPS.V_LAVA];
export const GALLERY_VERTICAL: Demo[] = [CLIPS.G_RAMEN, CLIPS.V_BOAT];

// One example per remover, for the tools section of the home page and the tools page. The logos in the Sora example
// are the real Sora watermark; the video and photo examples carry a made-up badge, drawn on a clean picture, so
// the result can be judged against the original.
export const TOOL_DEMOS: Record<ToolId, Demo> = {
  gemini: CLIPS.G_GARDEN,
  sora: { id: 't-sora', source: 'Sora', title: 'Sora clip, mark on the move', alt: 'A Sora video with its moving watermark', media: { kind: 'video', webm: TSoraWebm, mp4: FILE ? '' : TSoraMp4, poster: TSoraPoster, w: 360, h: 654 }, logo: { x: 0.82, y: 0.93 } },
  video: { id: 't-video', source: 'Logo', title: 'Badge in a corner', alt: 'A video with a badge in the top corner', media: { kind: 'video', webm: TVideoWebm, mp4: FILE ? '' : TVideoMp4, poster: TVideoPoster, w: 640, h: 360 }, logo: { x: 0.14, y: 0.15 } },
  photo: { id: 't-photo', source: 'Photo', title: 'Two watermarks on a photo', alt: 'A burger photo with two watermarks', media: { kind: 'image', before: TPhotoBefore, after: TPhotoAfter, w: 800, h: 446 }, logo: { x: 0.16, y: 0.1 } },
};
