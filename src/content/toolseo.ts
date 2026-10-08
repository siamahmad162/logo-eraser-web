// What each remover page says besides the tool itself: how to use it step by step, what it is for, which files it takes,
// tips, fixes for common problems and where to read more. The same words feed the page and its structured data.
// The three removers share one engine, so each page is written for its own kind of file and its own questions.
import type { ToolId } from './tools';

export type ToolSeo = {
  /** the page's one-line description for the structured data */
  summary: string;
  features: string[];
  howTo: { name: string; steps: { name: string; text: string }[] };
  uses: { title: string; text: string }[];
  files: [string, string][];
  tips: string[];
  trouble: { q: string; a: string }[];
  guides: string[];
};

export const TOOL_SEO: Record<ToolId, ToolSeo> = {
  omni: {
    summary: 'A free online Gemini Omni watermark remover. It finds the Gemini sparkle in your video by its shape and restores the real picture under it, frame by frame, in your browser.',
    features: ['Finds the Gemini sparkle in a video automatically', 'Restores the real pixels under the logo instead of blurring it', 'Same resolution, frame rate, length and sound', 'Batch mode: a whole folder, one ZIP out', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove the Gemini Omni watermark from a video',
      steps: [
        { name: 'Add your videos', text: 'Drag your Gemini videos onto the page, or choose files or a whole folder. Use the original files you downloaded, not screen recordings.' },
        { name: 'Let it find the sparkle', text: 'The sparkle is found by its shape in frames from across the whole video, and its exact strength is measured in your file. Cleaning starts by itself; there is nothing to draw.' },
        { name: 'Check the result', text: 'Use the Compare view to slide between the original and the clean picture, and zoom in on the corner where the sparkle was.' },
        { name: 'Download', text: 'Download each clean video, or all of them together as one ZIP. Resolution, frame rate, length and sound are kept.' },
      ],
    },
    uses: [
      { title: 'Reels, Shorts and TikToks', text: 'Post a Gemini clip without a corner logo sitting on the picture, at its original size and framing, wide or vertical.' },
      { title: 'Product and ad videos', text: 'Use AI-made product shots and promos you own in your own edit, without a mark in the corner to distract from the product.' },
      { title: 'Footage for a longer edit', text: 'Cut several Gemini clips together, or mix them with other footage, without the same logo flashing in the corner of every shot.' },
      { title: 'A whole folder at once', text: 'Drop in every clip from a session. The first video shows the rest where the logo sits, and one ZIP comes out at the end.' },
    ],
    files: [['Videos', 'MP4, MOV, WebM and MKV, in any codec your browser can decode (H.264, HEVC, VP9, AV1)'], ['What it finds', 'The four-pointed Gemini sparkle near the bottom-right corner'], ['What you get', 'An MP4 with the same resolution, frame rate, length and sound as the original'], ['Quality', 'Best quality (about 2.5 times the original bitrate) or Smaller files, chosen before you add a video'], ['Photos', 'Not for this page: use the Gemini photo watermark remover'], ['Best on', 'A recent Chrome or Edge on a computer; Safari and Firefox work for most files'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Use the original download, not a screen recording or a re-upload. Every extra round of compression makes the sparkle’s edge fuzzier and harder to undo.', 'Keep the tab open and visible while a long video is cleaned; browsers slow down background tabs.', 'Leave “Best quality” on for anything you will publish. “Smaller files” is for drafts and quick shares.', 'Look at the Compare view before you download, and zoom in to 2× or 4× on the corner where the sparkle was.', 'Very dark scenes are handled with a separate correction measured from your own video’s dark frames, so they do not turn grey or black around the spot.'],
    trouble: [
      { q: 'It says “No logo found”. What now?', a: 'The video may be clean already, or the sparkle may be faint on a light picture. The card shows the spot where it normally sits and asks “Is the logo here?”. Choose “Yes, remove it” if you can see it, or “Draw a box” and drag a rectangle around the place; the tool learns the sparkle from your box.' },
      { q: 'A faint trace of the sparkle is left. How do I fix it?', a: 'Heavily compressed videos can keep a faint trace because the compression already damaged the detail under the logo. Try the original download, make sure Best quality is on, or redo the file after drawing a box around the sparkle so it is measured again.' },
      { q: 'The cleaned spot looks a little dark or grey.', a: 'That can happen on very dark scenes. The card turns amber and says “needs a look” and shows the worst moment; open Review and use “Go to that moment”. Redoing the file with Best quality usually settles it.' },
      { q: 'The cleaning is slow. Can I speed it up?', a: 'Speed depends on your computer and on the video’s length and resolution. Close heavy tabs, keep the page visible and plug your laptop in. Long 4K videos take the longest.' },
      { q: 'My browser ran out of memory.', a: 'Process long or very large videos a few at a time instead of all at once, and close other tabs.' },
      { q: 'The downloaded file will not play.', a: 'Results are MP4 files with H.264 video where your browser can write it. If a player cannot open one, try VLC or another modern player.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'blur-crop-or-restore', 'batch-remove-watermarks'],
  },
  veo: {
    summary: 'A free online Veo watermark remover. It finds the sparkle and the “Veo” text mark by itself and removes them from every frame, wide or vertical, in your browser.',
    features: ['Finds the Veo text mark and the sparkle automatically', 'Wide (16:9) and vertical (9:16) clips', 'Restores the real pixels under a see-through logo', 'Keeps resolution, frame rate, length and sound', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove the Veo watermark from a video',
      steps: [
        { name: 'Add your Veo clips', text: 'Drag your clips onto the page, or choose files or a whole folder. Use the originals you downloaded rather than screen recordings.' },
        { name: 'Let it find the marks', text: 'The sparkle is found by its shape. The “Veo” text mark is found by noticing what stays perfectly still while the scene moves. Each is measured in your clip, and cleaning starts by itself.' },
        { name: 'Check the result', text: 'Slide the Compare line over the corner and zoom in on the places where the sparkle or the text used to be.' },
        { name: 'Download', text: 'Download each clean clip, or all of them as one ZIP. The size, frame rate, length and sound stay as they were.' },
      ],
    },
    uses: [
      { title: 'Cinematic and b-roll shots', text: 'Use Veo shots as b-roll in a longer film without the text mark crossing the corner of every cut.' },
      { title: 'Vertical clips for social', text: 'Clean 9:16 Veo clips for Reels, Shorts and TikTok. Vertical videos are handled exactly like wide ones.' },
      { title: 'Marketing and explainer videos', text: 'Put generated scenes in an explainer, a promo or a presentation without a logo that is not yours on the picture.' },
      { title: 'A series in one go', text: 'Clean all the clips of a project in one batch, and download them together as one ZIP.' },
    ],
    files: [['Videos', 'MP4, MOV, WebM and MKV, in any codec your browser can decode (H.264, HEVC, VP9, AV1)'], ['What it finds', 'The “Veo” text mark and the four-pointed sparkle, wherever the clip carries one or both'], ['Shapes', 'Wide and vertical clips'], ['What you get', 'An MP4 with the same resolution, frame rate, length and sound'], ['Photos', 'Not for this page: use the Gemini photo watermark remover'], ['Best on', 'A recent Chrome or Edge on a computer'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Use the original download. A screen recording or a re-upload has already been compressed, which softens the text mark’s edge.', 'The text mark is found from motion: a clip with a very still camera and a very still scene gives it less to work with. If it is missed, draw a box around it.', 'Keep the tab open and visible while the clip is cleaned.', 'Check the result at 2× or 4× zoom; look at the letters’ position in the corner before and after.', 'Several clips from one project? Add them together: the first one shows the others where the mark sits.'],
    trouble: [
      { q: 'It says “No logo found”.', a: 'The clip may already be clean, or the mark may be faint on a light picture. The card shows where a mark normally sits and asks “Is the logo here?”. Choose “Yes, remove it”, or “Draw a box” and drag a rectangle around the Veo text or the sparkle; the tool learns it from your box.' },
      { q: 'The “Veo” text is still faintly visible.', a: 'A heavily compressed clip can keep a faint outline of the letters. Try the original download, keep Best quality on, and redo the file after drawing a box around the text so its shape is measured again.' },
      { q: 'Does it work on vertical (9:16) clips?', a: 'Yes. Vertical clips are cleaned exactly like wide ones, and the preview is made larger so you can see the corner clearly.' },
      { q: 'My clip has the sparkle and the text. Do I do it twice?', a: 'No. Both marks are found and removed in the same pass.' },
      { q: 'The cleaning is slow.', a: 'Speed depends on your computer and the clip’s length and resolution. Keep the page visible, close heavy tabs and plug your laptop in.' },
      { q: 'Is the sound kept?', a: 'Yes. The sound is copied across untouched and the length stays the same.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'batch-remove-watermarks', 'label-ai-generated-content'],
  },
  gphoto: {
    summary: 'A free online Gemini photo watermark remover. The sparkle in the corner of a Gemini image is fitted to your picture and reversed in seconds, with no blur, in your browser.',
    features: ['Removes the Gemini sparkle from images automatically', 'Fitted to your picture: its place, size, softness and strength', 'Reversed on each colour channel, not painted over', 'PNG stays lossless, JPG stays high quality', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove the Gemini watermark from an image',
      steps: [
        { name: 'Add your images', text: 'Drag PNG, JPG or WebP images onto the page, or choose files or a whole folder.' },
        { name: 'Let it fit the sparkle', text: 'The sparkle is found in the corner, and its exact place, size, sharpness and strength are fitted to your image. Cleaning starts by itself; there is nothing to draw.' },
        { name: 'Check the result', text: 'Slide the Compare line over the corner and zoom in to 2× or 4× on the spot where the sparkle was.' },
        { name: 'Download', text: 'Download each clean image, or all of them together as one ZIP. The size stays the same and a PNG stays lossless.' },
      ],
    },
    uses: [
      { title: 'Blog posts and thumbnails', text: 'Use a Gemini image as a header or a thumbnail without a sparkle in the corner of the picture.' },
      { title: 'Presentations and decks', text: 'Put generated images on slides, clean at the edges, at their full original size.' },
      { title: 'Product and mood images', text: 'Clean generated product shots and mood boards you own before they go in a shop page or a catalogue.' },
      { title: 'A folder of images', text: 'Drop in a whole folder of generated images and download them all as one ZIP when they are done.' },
    ],
    files: [['Photos', 'PNG, JPG and WebP'], ['What it finds', 'The four-pointed Gemini sparkle near the bottom-right corner'], ['What you get', 'PNG stays lossless; JPG is saved again at 95% quality; WebP comes back as PNG; the image size stays the same'], ['How many', 'As many images as your computer can hold, one after another, or a whole folder'], ['Videos', 'Not for this page: use the Gemini Omni or the Veo watermark remover'], ['Best on', 'A recent Chrome or Edge on a computer; phones work for single images'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Use the image exactly as Gemini gave it to you. A screenshot, or an image that has been re-saved as a small JPG, has a softer sparkle edge and a trace is more likely.', 'PNG gives the cleanest result because nothing is lost when it is saved again.', 'A photo has only one frame, so the sparkle cannot be learned over time; it is fitted from its known shape. That is fast, and very exact when the image is the original.', 'Zoom in to 2× or 4× on the corner before you download, and compare the two sides of the slider.', 'Several images from one session? Add them together; they are cleaned one after another.'],
    trouble: [
      { q: 'It says “No logo found”.', a: 'The image may be clean already, or cropped so that the sparkle is outside it. The card shows the spot where it normally sits and asks “Is the logo here?”. Choose “Yes, remove it” if you can see it, or “Draw a box” around the place.' },
      { q: 'A faint trace of the sparkle is left.', a: 'A small, heavily compressed JPG can keep a faint trace because compression has already blurred the edge. Try the original image, ideally a PNG, and redo it after drawing a box around the sparkle.' },
      { q: 'Will my image get smaller or softer?', a: 'No. The image keeps its exact dimensions, and only the pixels inside the sparkle change. A PNG stays lossless and a JPG is saved again at 95% quality.' },
      { q: 'Why did my WebP come back as a PNG?', a: 'WebP images are saved as PNG so that nothing is lost. If you need WebP again, convert the PNG afterwards in any image editor.' },
      { q: 'Does it work on a screenshot of a Gemini image?', a: 'It can, but a screenshot has been resampled, which blurs the sparkle’s edge. For the cleanest result use the image you downloaded.' },
      { q: 'Is my image uploaded?', a: 'No. The image is opened, cleaned and saved by your browser on your own device and never reaches our servers.' },
    ],
    guides: ['blur-crop-or-restore', 'visible-watermark-vs-synthid', 'watermark-remover-without-upload'],
  },
};
