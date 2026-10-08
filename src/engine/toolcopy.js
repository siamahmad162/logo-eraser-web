// The words on the start screen of each remover. Shared by the tool (which sets them when it opens) and by the page
// (which writes them into the HTML first, so search engines read the right words).
export const COPY = {
  gemini: { h: 'Drop your videos or photos here', sub: 'Gemini and Veo clips, one at a time or a whole folder. The logo is found and removed automatically, and everything stays on your device.', formats: ['MP4', 'MOV', 'WebM', 'PNG', 'JPG', 'WebP'], accept: null },
  // the three pages of the Gemini family: one engine, each page for its own kind of file
  omni: { h: 'Drop your Gemini videos here', sub: 'The Gemini sparkle is found and removed automatically, frame by frame. Add one video or a whole folder, and everything stays on your device.', formats: ['MP4', 'MOV', 'WebM', 'MKV'], accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv' },
  veo: { h: 'Drop your Veo videos here', sub: 'The Veo text mark and the sparkle are found and removed automatically, in wide and vertical clips. Everything stays on your device.', formats: ['MP4', 'MOV', 'WebM', 'MKV'], accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv' },
  gphoto: { h: 'Drop your Gemini images here', sub: 'The Gemini sparkle is found, fitted to your image and removed automatically. PNG stays lossless, and everything stays on your device.', formats: ['PNG', 'JPG', 'WebP'], accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp' },
};
