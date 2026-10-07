// What each remover page says besides the tool itself: how to use it step by step, what it is for, which files it takes,
// tips, fixes for common problems and where to read more. The same words feed the page and its structured data.
import type { ToolId } from './tools';

export type ToolSeo = {
  /** the page's one-line description for search results and the structured data */
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
  gemini: {
    summary: 'A free online remover for the Gemini sparkle and the Veo text mark. It finds the logo by itself and restores the real picture under it, frame by frame, in your browser.',
    features: ['Finds the Gemini sparkle and the Veo text mark automatically', 'Restores the real pixels under the logo instead of blurring it', 'Videos (MP4, MOV, WebM, MKV) and photos (PNG, JPG, WebP)', 'Batch mode with one ZIP download', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove the Gemini or Veo watermark from a video or photo',
      steps: [
        { name: 'Add your files', text: 'Drag your videos or photos onto the page, or choose files or a whole folder. Use the original files you downloaded, not screen recordings.' },
        { name: 'Let it find the logo', text: 'The sparkle or the Veo text mark is found by its shape, and its exact strength is measured in your file. Cleaning starts by itself.' },
        { name: 'Check the result', text: 'Use the Compare view to slide between the original and the clean picture, and zoom in on the spot where the logo was.' },
        { name: 'Download', text: 'Download each clean file, or all of them together as one ZIP. Size, frame rate and sound are kept.' },
      ],
    },
    uses: [
      { title: 'Clips for social media', text: 'Post Reels, Shorts and TikToks without a corner logo covering the picture, keeping the clip at its original size and framing.' },
      { title: 'Product and ad videos', text: 'Use AI-made product shots and promos you own in your own edit, without a distracting mark in the corner.' },
      { title: 'AI images and thumbnails', text: 'Clean the sparkle off Gemini images for blog posts, thumbnails and presentations. PNGs stay lossless.' },
      { title: 'Whole batches', text: 'Drop in a folder of generated clips and download them all as one ZIP when they are done.' },
    ],
    files: [['Videos', 'MP4, MOV, WebM and MKV, in any codec your browser can decode (H.264, HEVC, VP9, AV1)'], ['Photos', 'PNG, JPG and WebP'], ['What you get', 'Videos as MP4 with the same resolution, frame rate and sound; PNG stays lossless, JPG is saved at 95% quality, WebP comes back as PNG'], ['How many', 'As many files as your computer can hold, one after another, or a whole folder'], ['Best on', 'A recent Chrome or Edge on a computer; Safari and Firefox work for most files'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Use the original download, not a screen recording or a re-upload. Every extra round of compression makes the logo’s edge fuzzier.', 'Keep the tab open and visible while a long video is cleaned; browsers slow down background tabs.', 'Leave “Best quality” on for videos you will publish. “Smaller files” is for drafts.', 'Look at the Compare view before you download, and zoom in on the corner where the logo was.', 'For a logo this tool does not know, use the video or photo logo remover and draw a box around it.'],
    trouble: [
      { q: 'It says “No logo found”. What now?', a: 'The video may be clean already, or the logo may be faint on a light picture. Choose “Draw a box”, drag a rectangle around the spot where the logo should be, and the tool learns it from your box.' },
      { q: 'A faint trace of the sparkle is left. How do I fix it?', a: 'Heavily compressed videos can keep a faint trace because the compression already damaged the detail under the logo. Try the original download, switch the video quality to Best quality, or draw a box around the logo to measure it again.' },
      { q: 'The cleaning is slow. Can I speed it up?', a: 'Speed depends on your computer and on the video’s length and resolution. Close heavy tabs, keep the page visible and plug your laptop in. Long 4K videos take the longest.' },
      { q: 'My browser ran out of memory.', a: 'Process long or very large videos a few at a time instead of all at once, and close other tabs.' },
      { q: 'The downloaded file will not play.', a: 'Results are MP4 files with H.264 video where your browser supports it. If a player cannot open one, try VLC or another modern player.' },
    ],
    guides: ['remove-gemini-watermark-from-video', 'blur-crop-or-restore', 'batch-remove-watermarks'],
  },
  sora: {
    summary: 'A free online Sora watermark remover. It finds the moving Sora mark at every moment and rebuilds the picture under it, frame by frame, in your browser.',
    features: ['Finds the moving Sora watermark automatically', 'Removes it from every frame, including while it fades', 'Rebuilds the picture from other moments of the same shot', 'Keeps size, frame rate, length and sound', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove the Sora watermark from a video',
      steps: [
        { name: 'Add your Sora videos', text: 'Drag the videos you downloaded from Sora onto the page, or choose files. MP4, MOV and WebM work.' },
        { name: 'Wait while the mark is found', text: 'The tool looks through the whole video, learns where the white cloud logo and the name sit and when they jump to a new spot. There is nothing to draw.' },
        { name: 'Check the result', text: 'Slide the Compare line over the places where the mark used to be, and zoom in to check the rebuilt area.' },
        { name: 'Download', text: 'Download the clean video, or several as one ZIP. The size, frame rate, length and sound stay the same.' },
      ],
    },
    uses: [
      { title: 'Your own Sora videos', text: 'Use clips you generated in your own edits, reels and presentations without a moving logo in the frame.' },
      { title: 'Cleaner AI storytelling', text: 'Cut several Sora clips together without the mark appearing in a different corner in each one.' },
      { title: 'Presentations and demos', text: 'Show AI video in a talk or a demo without a watermark that pops up in the middle of a side.' },
      { title: 'Batches', text: 'Clean a set of clips in one go; each video is searched on its own and downloaded as one ZIP.' },
    ],
    files: [['Videos', 'MP4, MOV, WebM and MKV'], ['What it finds', 'The Sora cloud logo, the word “Sora” and the creator’s name, wherever they sit and whenever they move'], ['What you get', 'An MP4 with the same size, frame rate, length and sound'], ['Photos', 'Not for this tool: use the photo logo remover'], ['Best on', 'A recent Chrome or Edge on a computer'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Use the original download from Sora, not a screen recording.', 'Where the scene stands still, the picture is copied back from moments when the mark was elsewhere, so it looks the same as the original.', 'Fast, busy motion right behind the mark can show a soft patch. Check those moments in the Compare view.', 'A video without the Sora mark is left alone and the card says so.', 'Keep the tab open and visible while it works.'],
    trouble: [
      { q: 'It says “No Sora watermark found”.', a: 'The video may not carry the Sora mark, or the mark may be too faint or too small to find. For another logo, use the video logo remover and draw a box around it.' },
      { q: 'A soft patch is left where the mark was.', a: 'The Sora mark is almost solid, so the pixels under it are gone and have to be rebuilt. Busy motion behind it can leave a soft patch. Try the original file, and compare at 2× or 4× zoom before you publish.' },
      { q: 'The mark moves. Will it still work?', a: 'Yes, that is what the tool is made for: it finds the mark at every moment and removes it in each place.' },
      { q: 'Is the audio kept?', a: 'Yes. The sound is copied across and the length stays the same.' },
      { q: 'How long does it take?', a: 'It depends on your computer and the video’s length. A ten-second clip usually takes seconds to a minute.' },
    ],
    guides: ['remove-sora-watermark', 'blur-crop-or-restore', 'label-ai-generated-content'],
  },
  video: {
    summary: 'A free online logo remover for videos. Draw a box around any steady logo, badge or date stamp and it is rebuilt in every frame, in your browser.',
    features: ['Removes any logo that stays in one place', 'You draw one box; it is cleaned in every frame', 'Only the logo’s own pixels are rebuilt', 'Hidden pixels are copied back from other frames when the scene moves', 'Runs in your browser: nothing is uploaded', 'Free, no sign-up'],
    howTo: {
      name: 'How to remove a logo from a video',
      steps: [
        { name: 'Add your video', text: 'Drag your video onto the page, or choose a file. MP4, MOV and WebM work.' },
        { name: 'Draw a box around the logo', text: 'On the preview, drag a rectangle around the logo, a little bigger than it. Zoom in for a precise box. Let go and the cleaning starts.' },
        { name: 'Check the result', text: 'Use the Compare view and zoom in on the spot. If a piece of the logo is left, draw the box again, a little bigger.' },
        { name: 'Download', text: 'Download the clean video, or several as one ZIP.' },
      ],
    },
    uses: [
      { title: 'Channel logos and bugs', text: 'Remove a corner badge from your own old footage before you re-edit it.' },
      { title: 'Date and time stamps', text: 'Clean a camera date stamp or a timecode burned into your own footage.' },
      { title: 'Your old watermark', text: 'Swap an out-of-date watermark of your own for a new one.' },
      { title: 'Screen recordings', text: 'Take a small widget or a tool’s corner logo out of a screen capture you made.' },
    ],
    files: [['Videos', 'MP4, MOV, WebM and MKV'], ['What it removes', 'Logos and text that stay in one place for the whole video'], ['Not for', 'Logos that move around the picture (not supported yet)'], ['What you get', 'An MP4 with the same size, frame rate and sound'], ['Photos', 'Use the photo logo remover'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Draw the box a little bigger than the logo with some picture around it; only the logo’s own pixels inside it are rebuilt.', 'A moving background gives the best result: the hidden pixels show up in other frames and are copied back.', 'On a still background the area is filled from its surroundings: plain backgrounds look natural, detailed patterns may look smooth.', 'Check the result at 2× or 4× zoom before you download.', 'For the Gemini sparkle or the Sora mark use their own removers: no box to draw.'],
    trouble: [
      { q: 'A piece of the logo is still there.', a: 'The box probably cut through the logo. Draw it again, a little bigger, so the whole logo is inside.' },
      { q: 'The cleaned spot looks smooth or blurry.', a: 'On a still, detailed background there is nothing to copy back, so the area is filled from around it. A tighter box over a plainer part helps, or accept a soft patch.' },
      { q: 'The logo moves around the picture.', a: 'Only logos that stay in one place are supported for now.' },
      { q: 'Can I draw more than one box?', a: 'Clean the video once for each logo: run it, download, add the result again and draw the next box.' },
      { q: 'Is the sound kept?', a: 'Yes. The sound and the length stay as they were.' },
    ],
    guides: ['remove-logo-from-video', 'blur-crop-or-restore', 'label-ai-generated-content'],
  },
  photo: {
    summary: 'A free online logo and watermark remover for photos. Draw a box and only the logo’s own pixels are rebuilt from the picture around them, in your browser.',
    features: ['Removes a logo, stamp or watermark from a photo', 'Only the logo’s own pixels are rebuilt, the rest of the box is untouched', 'The photo’s grain is put back so the patch does not look smooth', 'As many boxes as you need on one photo', 'PNG stays lossless, JPG stays high quality', 'Free, no sign-up, nothing is uploaded'],
    howTo: {
      name: 'How to remove a logo or watermark from a photo',
      steps: [
        { name: 'Add your photo', text: 'Drag a PNG, JPG or WebP onto the page, or choose files.' },
        { name: 'Draw a box around the logo', text: 'Drag a rectangle around the logo or watermark, a little bigger than it. Zoom in for a precise box. Let go and it is removed.' },
        { name: 'Add more boxes if you need them', text: 'Choose “Add another box” for each further logo. “Clear boxes” starts again from the original.' },
        { name: 'Download', text: 'Download the clean photo, or several as one ZIP. A PNG stays lossless and a JPG is saved at high quality.' },
      ],
    },
    uses: [
      { title: 'Your own photos', text: 'Remove a stamp, a date or an old watermark of yours from photos you took.' },
      { title: 'AI images', text: 'Clean a logo off an image you generated, for a blog post, a thumbnail or a deck.' },
      { title: 'Product pictures', text: 'Take a stray label or a sticker out of a product shot you own.' },
      { title: 'Screenshots', text: 'Remove a small badge or an account name from a screenshot of your own work.' },
    ],
    files: [['Photos', 'PNG, JPG and WebP'], ['Boxes', 'As many as you need on one photo'], ['What you get', 'PNG stays lossless; JPG is saved again at high quality; WebP comes back as PNG; the size stays the same'], ['Videos', 'Use the video logo remover'], ['Best on', 'Skies, walls, water, studio backdrops and most AI images'], ['Price', 'Free, no sign-up, no limit on files']],
    tips: ['Draw the box a little bigger than the logo. Only the logo’s pixels inside it are rebuilt, so a generous box costs nothing, but a box that cuts through the logo leaves a piece.', 'Logos on smooth backgrounds (sky, wall, water, studio) come out best.', 'Fine texture such as foliage, fabric or crowds can leave a smooth patch. The tool says when it had to rebuild the whole box.', 'Zoom in to 2× or 4× to check the edges before you download.', 'For the Gemini sparkle use the Gemini remover, which restores the real pixels.'],
    trouble: [
      { q: 'A piece of the logo is left.', a: 'Draw the box again a little bigger so that the whole logo is inside it. “Clear boxes” starts again from the original.' },
      { q: 'The fixed spot looks smooth.', a: 'On fine texture there is little to copy from. The tool puts the photo’s grain back, but detailed patterns can still look soft. A tighter box over a plainer part helps.' },
      { q: 'It says it rebuilt the whole box.', a: 'The logo could not be told apart from the picture here (a busy photo, or a very faint mark), so the whole box was filled from around it. A tighter box gives a cleaner result.' },
      { q: 'Can I remove several logos?', a: 'Yes. Choose “Add another box” after the first, and draw the next one. All boxes are applied to the same photo.' },
      { q: 'Will my photo’s quality drop?', a: 'Only the logo’s pixels change. A PNG stays lossless, a JPG is saved again at high quality, and the size stays the same.' },
    ],
    guides: ['remove-logo-from-photo', 'blur-crop-or-restore', 'visible-watermark-vs-synthid'],
  },
};
