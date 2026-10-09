// The use-case pages: one landing page for each of the three removers, an overview of the Gemini watermark, and the hub
// that lists them. They explain who the remover is for and why it works, and send people on to the working page.
// Plain text only (no JSX), so the route table can read the titles and descriptions.
import { SITE } from '../site';
import type { ToolId } from './tools';

const n = SITE.name;

export type Landing = {
  path: string;
  /** the name in menus and cards */
  name: string;
  /** one line under the name in the header menu and the footer */
  note: string;
  /** what the watermark is on, for headings: “Gemini video”, “Veo clip” */
  subject: string;
  /** the small label on the home page card */
  kind: string;
  icon: ToolId | 'overview';
  /** page title without the site name (the route adds it) */
  title: string;
  description: string;
  eyebrow: string;
  h1: [string, string];
  lede: string;
  /** the working pages this one sends people to: the main button first */
  go: { to: string; label: string }[];
  sections: { title: string; paras: string[] }[];
  audiences: { title: string; text: string }[];
  steps: { title: string; text: string }[];
  compare: { what: string; us: string; other: string }[];
  faq: { q: string; a: string }[];
  guides: string[];
  /** other use-case pages to read next */
  related: string[];
};

const STEPS_VIDEO = [
  { title: 'Add the clips', text: 'Drop in one video or a whole folder. Nothing is uploaded: the files are opened on your own device.' },
  { title: 'Let it find the logo', text: 'The mark is found and measured in each clip by itself. There is nothing to draw and nothing to set.' },
  { title: 'Check the close-ups', text: 'Each card shows the logo area before and after, so you can see the result before you save anything.' },
  { title: 'Download', text: 'Save each clip, or all of them as one ZIP.' },
];

export const LANDINGS: Landing[] = [
  {
    path: '/gemini-watermark-remover',
    name: 'Gemini watermark remover',
    note: 'Videos and images, all in one place',
    subject: 'Gemini',
    kind: 'Gemini overview',
    icon: 'overview',
    title: 'Gemini watermark remover for videos and images',
    description: 'Remove the sparkle logo from Gemini videos and images. Each frame is restored, not blurred, and your files never leave your device.',
    eyebrow: 'Gemini videos & images',
    h1: ['Remove the Gemini watermark from ', 'videos and photos'],
    lede: `The sparkle in the corner of Gemini videos and images is see-through. ${n} measures it in your file and restores the real pixels underneath, frame by frame. Nothing is uploaded.`,
    go: [{ to: '/gemini-omni-watermark-remover', label: 'Clean a video — free' }, { to: '/gemini-photo-watermark-remover', label: 'Clean an image' }],
    sections: [
      {
        title: 'What the Gemini watermark is',
        paras: [
          'Gemini marks the videos and images it generates with a small four-pointed sparkle near the bottom-right corner. It is white and partly transparent, it is always the same shape, and on video it stays in exactly the same place in every frame.',
          'That is what makes it removable. A see-through logo does not destroy the picture under it: every pixel there is still a blend of the real picture and the white of the sparkle. If you know how strong the blend is, you can undo it.',
        ],
      },
      {
        title: 'Restored, not covered up',
        paras: [
          `Instead of blurring the corner or inventing new pixels, ${n} reverses the blend between the logo and your picture. The detail that was always there comes back: moving backgrounds stay sharp, and there is no smudge or flicker where the logo used to be.`,
          'The strength of the blend is measured in your own file, not guessed, so the same method works on bright scenes, dark scenes and everything in between.',
        ],
      },
      {
        title: 'Same file, minus the logo',
        paras: [
          'Resolution, frame rate and the number of frames stay exactly the same, and the audio is copied untouched. Images keep their size; PNGs stay lossless. Add one file or a whole folder and batch mode handles the rest.',
        ],
      },
      {
        title: 'Which page do I need?',
        paras: [
          'Videos made with Gemini go to the Gemini Omni remover. Clips made with Veo, which can also carry a “Veo” text mark, go to the Veo remover. Still images go to the Gemini photo remover. All three run the same engine in your browser, and each page explains its own kind of file.',
        ],
      },
    ],
    audiences: [
      { title: 'Social media creators', text: 'Post Gemini clips and images to reels, shorts and feeds without a corner logo pulling the eye away.' },
      { title: 'Marketers and small shops', text: 'Use AI footage and pictures in product pages, ads and newsletters with a clean frame.' },
      { title: 'Video editors', text: 'Drop clean clips into a timeline, so the logo does not have to be masked in every cut.' },
      { title: 'Designers', text: 'Place generated images into mock-ups, slides and layouts without retouching the corner by hand.' },
    ],
    steps: STEPS_VIDEO,
    compare: [
      { what: 'Cropping the corner', us: 'Keeps the whole frame', other: 'Loses part of the picture and changes the size' },
      { what: 'Blurring the logo', us: 'Restores the real pixels', other: 'Leaves a visible smudge that moves with the scene' },
      { what: 'Guessing with AI fill', us: 'Reverses a measured blend', other: 'Can flicker from frame to frame in video' },
    ],
    faq: [
      { q: 'Is the Gemini watermark the same on videos and images?', a: 'It is the same four-pointed sparkle, but a video has thousands of frames to measure it in and a still image has one. That is why there are separate pages for each, both running the same engine.' },
      { q: 'Does removing it change the picture anywhere else?', a: 'No. Only the small area around the logo is touched, and there the real picture is restored. The rest of every frame is left as it was.' },
      { q: 'Are my files sent to a server?', a: 'No. Everything runs in your browser on your own device, so your videos and images never leave it.' },
      { q: 'Is it free?', a: 'Yes, with no sign-up. The site may show ads, and the tools have no limits on how many files you clean.' },
      { q: 'Should I still say the content is AI-made?', a: 'Yes, wherever a platform asks for it. Removing the visible logo does not change where a file came from, and Google’s invisible SynthID mark is a separate thing. See the guides for details.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'blur-crop-or-restore', 'visible-watermark-vs-synthid'],
    related: ['/use-cases/gemini-omni-videos', '/use-cases/veo-videos', '/use-cases/gemini-images'],
  },

  {
    path: '/use-cases/gemini-omni-videos',
    name: 'Gemini Omni videos',
    note: 'For videos made with Gemini',
    subject: 'Gemini video',
    kind: 'Gemini video',
    icon: 'omni',
    title: 'Gemini Video Watermark Removal for Reels and Ads',
    description: 'Post Gemini videos without the sparkle: reels, ads and edits. It is found by itself and removed frame by frame, free, in your browser. No upload.',
    eyebrow: 'Use case · Gemini Omni videos',
    h1: ['Gemini video watermark removal ', 'for reels, ads and edits'],
    lede: `You made a good clip with Gemini, and a small sparkle sits in its corner. ${n} removes it from every frame by restoring the picture under it, on your own device, for free.`,
    go: [{ to: '/gemini-omni-watermark-remover', label: 'Open the Gemini Omni remover' }],
    sections: [
      {
        title: 'The problem with a corner logo',
        paras: [
          'A clip with a logo in the corner looks unfinished once it leaves the Gemini app. On a phone screen the corner is also where platform buttons, captions and progress bars sit, so a logo there is easy to notice and hard to ignore.',
          'It also gets in the way of editing. A logo that has to be hidden in every cut, resized for every aspect ratio and masked again when the clip is cropped is a chore that repeats for each video.',
        ],
      },
      {
        title: 'Why the sparkle can be taken out cleanly',
        paras: [
          'The Gemini sparkle is white and see-through, always the same shape, and on a video it stays in the same place for the whole clip. A see-through logo does not delete what is under it: each pixel is a blend of the real picture and the logo’s white.',
          `${n} finds the sparkle by its shape, measures how strong the blend is in your file, and reverses it in every frame. The real picture comes back instead of being painted over, so a moving background stays sharp and nothing flickers.`,
        ],
      },
      {
        title: 'What stays the same',
        paras: [
          'The clip keeps its resolution, frame rate, length and sound. Because pixels change, the video is saved again as MP4; Maximum quality is the default and keeps the result very close to the original.',
          'Wide, square and vertical clips all work, in MP4, MOV, WebM or MKV, in any codec your browser can decode.',
        ],
      },
      {
        title: 'Made for batches',
        paras: [
          'If you make a handful of clips at a time, add the whole folder. They are cleaned one after another, each card shows its own progress and a close-up check, and you can download everything as a single ZIP.',
        ],
      },
      {
        title: 'Private by design',
        paras: [
          'Nothing is uploaded. The video is read and written on your own device, so unreleased work, client footage and personal clips never travel anywhere, and there is no upload to wait for.',
        ],
      },
    ],
    audiences: [
      { title: 'Short-video creators', text: 'Turn a Gemini clip into a reel, short or story without a logo that every viewer sees first.' },
      { title: 'Advertisers and agencies', text: 'Test AI footage in ad concepts and client mock-ups with a clean frame.' },
      { title: 'Video editors', text: 'Bring clean generated clips into a timeline and cut them freely, with no logo to track and mask.' },
      { title: 'Educators and presenters', text: 'Use generated illustrations and scenes in lessons and slides without a distracting mark.' },
      { title: 'Small businesses', text: 'Make product teasers and announcements with AI clips that look finished.' },
      { title: 'Hobbyists and storytellers', text: 'Share your experiments in a clean form, and keep the originals for yourself.' },
    ],
    steps: STEPS_VIDEO,
    compare: [
      { what: 'Cropping the corner', us: 'Keeps the whole frame and the aspect ratio', other: 'Cuts the picture and changes the size' },
      { what: 'Blurring or a patch', us: 'Restores the real pixels', other: 'Leaves a soft spot that follows the logo' },
      { what: 'AI fill on every frame', us: 'The same fix in every frame', other: 'Can flicker, because each frame is guessed anew' },
      { what: 'Upload to a website', us: 'Stays on your device', other: 'Your video travels to a server' },
    ],
    faq: [
      { q: 'Which videos does this use case cover?', a: 'Videos made with Gemini that carry the four-pointed sparkle in the bottom-right corner. Veo clips have their own page, because they can also carry a “Veo” text mark.' },
      { q: 'Will the clip look the same after the sparkle is gone?', a: 'Everywhere except the logo area, yes. Resolution, frame rate, length and sound stay the same, and the area under the sparkle is restored rather than blurred.' },
      { q: 'Do I have to mark where the sparkle is?', a: 'No. It is found by itself. If a clip has no sparkle, you are told so and nothing is changed.' },
      { q: 'Can I clean vertical clips for reels and shorts?', a: 'Yes. Vertical, square and wide clips work the same way.' },
      { q: 'How long does a clip take?', a: 'It depends on your computer and on the clip’s length and resolution. Each card shows its own progress, and a batch works through the list while you do something else.' },
      { q: 'What do I get at the end?', a: 'An MP4 with the same size, frame rate, length and sound. Download clips one by one or all together as a ZIP.' },
      { q: 'Is it allowed to remove the watermark?', a: 'You are responsible for having the right to edit and publish the clip, and for following the rules of the platforms you post on, including AI labels. See the terms and the guide on labelling AI content.' },
      { q: 'Does it cost anything?', a: 'No. It is free, with no sign-up and no limit on how many clips you clean.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'batch-remove-watermarks', 'label-ai-generated-content'],
    related: ['/use-cases/veo-videos', '/use-cases/gemini-images', '/gemini-watermark-remover'],
  },

  {
    path: '/use-cases/veo-videos',
    name: 'Veo videos',
    note: 'For Veo clips, wide or vertical',
    subject: 'Veo clip',
    kind: 'Veo video',
    icon: 'veo',
    title: 'Veo Watermark Removal for Reels, Ads and Edits',
    description: 'Clean Veo clips for reels, ads and edits: the “Veo” text mark and the sparkle are found and removed in every frame. Free, in your browser.',
    eyebrow: 'Use case · Veo videos',
    h1: ['Remove the Veo mark from clips ', 'for reels, ads and films'],
    lede: `A Veo clip can carry a sparkle, a “Veo” text mark, or both. ${n} finds each one by itself and removes it from every frame, on your own device, for free.`,
    go: [{ to: '/veo-watermark-remover', label: 'Open the Veo remover' }],
    sections: [
      {
        title: 'Two kinds of mark, one clip',
        paras: [
          'Veo clips are not marked in just one way. Depending on where a clip was made, it can have the Gemini sparkle in a corner, a small “Veo” text mark, or both at the same time. A remover that only knows one of them leaves the other on screen.',
          `${n} looks for both. Each mark that is found is measured and removed on its own, so you do not need to know in advance which one your clip has.`,
        ],
      },
      {
        title: 'How the text mark is found',
        paras: [
          'A text mark does not move while the scene behind it does. That stillness gives it away: the part of the picture that stays put through the clip, with the shape of lettering, is the mark. It is traced from your own file, so it does not matter which size or position the mark has on your clip.',
          'Once the mark is found, the real picture under its see-through parts is restored, and the rest of its outline is filled in from the pixels around it.',
        ],
      },
      {
        title: 'Wide and vertical clips',
        paras: [
          'Veo clips come in wide formats and in vertical ones for reels and shorts. Both are handled the same way, and the clip keeps its resolution, frame rate, length and sound. The result is saved as MP4.',
        ],
      },
      {
        title: 'Check before you download',
        paras: [
          'Every card shows close-ups of the logo area before and after, and a check runs on the finished file. If a trace of the mark seems left, the card says so, and you can look at that exact moment before you save the clip.',
        ],
      },
      {
        title: 'Free and private',
        paras: [
          'There is no sign-up, no limit on clips, and no upload: the clip is opened and saved on your own device. Add a folder and download everything as one ZIP.',
        ],
      },
    ],
    audiences: [
      { title: 'Reel and shorts creators', text: 'Post vertical Veo clips with the whole frame to yourself, not a text mark in the corner.' },
      { title: 'Ad and brand teams', text: 'Build concept videos and animatics from Veo footage with a clean frame.' },
      { title: 'Filmmakers and editors', text: 'Cut generated shots into a timeline without masking a mark in every cut.' },
      { title: 'Music and visual artists', text: 'Use Veo clips as visuals for tracks and live sets without a logo on screen.' },
      { title: 'Course makers', text: 'Put generated scenes into lessons and explainers with a tidy picture.' },
      { title: 'Storytellers', text: 'Share short AI films as they were meant to look, and keep the original files too.' },
    ],
    steps: STEPS_VIDEO,
    compare: [
      { what: 'Cropping out the text', us: 'Keeps the full frame', other: 'Cuts into the picture, and vertical clips lose even more' },
      { what: 'Blurring the text', us: 'Restores what is under the mark', other: 'A soft patch, easy to spot on a plain background' },
      { what: 'Tools for the sparkle only', us: 'Finds the sparkle and the text mark', other: 'Leaves the other mark on the clip' },
      { what: 'Upload to a website', us: 'Stays on your device', other: 'Your clip travels to a server' },
    ],
    faq: [
      { q: 'Does it remove the “Veo” text and the sparkle?', a: 'Yes. A clip can carry either or both, and each one that is found is removed from every frame.' },
      { q: 'What if my clip has no mark?', a: 'You are told that no logo was found and nothing is changed. If you can see a mark, you can point it out with a box.' },
      { q: 'Do wide and vertical clips both work?', a: 'Yes, in any size. The clip keeps its resolution, frame rate, length and sound.' },
      { q: 'Why is the text mark harder than the sparkle?', a: 'The sparkle has one known shape. Lettering is found from your own clip, by the fact that it stays still while the scene moves, and then removed. That is why a close-up check is shown.' },
      { q: 'Which files can I add?', a: 'MP4, MOV, WebM and MKV, in any codec your browser can decode. Results are saved as MP4.' },
      { q: 'Are my clips uploaded?', a: 'No. Everything runs in your browser, so a clip never leaves your device.' },
      { q: 'Should I still label the clip as AI-made?', a: 'Yes, wherever a platform asks for it. Removing the visible mark does not change where a clip came from.' },
      { q: 'Does it cost anything?', a: 'No. It is free, with no sign-up.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'batch-remove-watermarks', 'label-ai-generated-content'],
    related: ['/use-cases/gemini-omni-videos', '/use-cases/gemini-images', '/gemini-watermark-remover'],
  },

  {
    path: '/use-cases/gemini-images',
    name: 'Gemini images',
    note: 'For images made with Gemini',
    subject: 'Gemini image',
    kind: 'Gemini image',
    icon: 'gphoto',
    title: 'Gemini Image Watermark Removal for Blogs and Designs',
    description: 'Use Gemini images in posts, slides and designs without the sparkle. It is fitted to your picture and reversed, with no blur. Free, no upload.',
    eyebrow: 'Use case · Gemini images',
    h1: ['Gemini image watermark removal ', 'for blogs, slides and designs'],
    lede: `The sparkle in the corner of a Gemini image is see-through. ${n} fits its known shape to your picture and reverses it, so the real pixels come back. Free, and on your own device.`,
    go: [{ to: '/gemini-photo-watermark-remover', label: 'Open the Gemini photo remover' }],
    sections: [
      {
        title: 'Why an image needs its own method',
        paras: [
          'A video has thousands of frames to learn a logo from. A still image has exactly one. So the sparkle’s known shape is fitted to your picture instead: its place, its size, its softness and its strength are all worked out from the image itself.',
          'The fit is done on each colour channel on its own, because a picture’s red, green and blue can show the logo a little differently.',
        ],
      },
      {
        title: 'Reversed, not painted over',
        paras: [
          'A see-through logo leaves the picture underneath in place; it only blends white over it. Reversing that blend brings the real pixels back, so textures, grain and edges near the corner stay as they were. There is no blur and no patch.',
        ],
      },
      {
        title: 'Your file stays your file',
        paras: [
          'The image keeps its exact dimensions. A PNG is saved losslessly, a JPG at 95% quality, and a WebP comes back as a PNG. Only the small area around the sparkle changes.',
        ],
      },
      {
        title: 'Many images, one go',
        paras: [
          'Add as many images as you like, or a whole folder. They are cleaned one after another and each card shows a before and after of the logo area. Download them one by one, or all together as a ZIP.',
        ],
      },
      {
        title: 'Nothing leaves your device',
        paras: [
          'The images are read and saved in your browser. They are never uploaded, so private pictures, client work and drafts stay where they are.',
        ],
      },
    ],
    audiences: [
      { title: 'Bloggers and writers', text: 'Illustrate articles and newsletters with generated images that look clean.' },
      { title: 'Designers', text: 'Place generated pictures into mock-ups, covers and layouts without retouching the corner.' },
      { title: 'Presenters and teachers', text: 'Put images into slides and handouts without a mark in the corner of each.' },
      { title: 'Online shops', text: 'Make product scenes and banners with generated images that look finished.' },
      { title: 'Social media managers', text: 'Post generated pictures to feeds and stories with the whole frame in view.' },
      { title: 'Game and story makers', text: 'Collect concept art and scene images in a clean form for boards and decks.' },
    ],
    steps: [
      { title: 'Add the images', text: 'Drop in PNG, JPG or WebP files, or a whole folder. Nothing is uploaded.' },
      { title: 'Let it fit the sparkle', text: 'The sparkle is found and fitted to each image by itself. There is nothing to draw.' },
      { title: 'Compare', text: 'Each card shows the logo area before and after, so you can check the result.' },
      { title: 'Download', text: 'Save each image, or all of them as one ZIP.' },
    ],
    compare: [
      { what: 'Cropping the corner', us: 'Keeps the full image and its size', other: 'Cuts the picture and changes the aspect ratio' },
      { what: 'Clone stamp or blur', us: 'Restores the real pixels', other: 'Leaves a soft or repeated patch' },
      { what: 'AI fill', us: 'Reverses a measured blend', other: 'Invents new pixels that can differ from the original' },
      { what: 'Upload to a website', us: 'Stays on your device', other: 'Your image travels to a server' },
    ],
    faq: [
      { q: 'Which images does it work on?', a: 'Images made with Gemini that carry the four-pointed sparkle near the bottom-right corner, in PNG, JPG or WebP.' },
      { q: 'Does it blur the corner?', a: 'No. The sparkle’s blend is reversed, so the real pixels come back instead of being smoothed over.' },
      { q: 'What happens to the file format?', a: 'A PNG stays a lossless PNG, a JPG is saved at 95% quality, and a WebP comes back as a PNG.' },
      { q: 'Is the image size changed?', a: 'No. The dimensions stay exactly as they were.' },
      { q: 'What if the sparkle is not found?', a: 'You are told that no logo was found and nothing is changed. If you can see one, you can point it out with a box.' },
      { q: 'Can I clean many images at once?', a: 'Yes. Add as many as you like, or a folder, and download them all as one ZIP.' },
      { q: 'Are my images uploaded?', a: 'No. Everything runs in your browser on your own device.' },
      { q: 'Does it cost anything?', a: 'No. It is free, with no sign-up and no limit on the number of images.' },
    ],
    guides: ['blur-crop-or-restore', 'visible-watermark-vs-synthid', 'batch-remove-watermarks'],
    related: ['/use-cases/gemini-omni-videos', '/use-cases/veo-videos', '/gemini-watermark-remover'],
  },
];

export const landingByPath = (p: string) => LANDINGS.find((l) => l.path === p);

export const USE_CASES_HUB = {
  path: '/use-cases',
  title: 'Use Cases: Remove AI Watermarks for Every Job',
  description: 'See how creators, marketers and editors use the removers: Gemini videos, Veo clips and Gemini images, each explained with who it is for.',
};
