import type { ReactNode } from 'react';
import { Link } from '../router';
import { SITE } from '../site';

// Guide bodies, keyed by slug (titles and dates live in meta.ts).
const n = SITE.name;

export const GUIDE_BODIES: Record<string, () => ReactNode> = {
  'remove-gemini-watermark-from-video': () => (
    <>
      <p>Videos made with Gemini and Veo usually carry a small four-pointed sparkle in the bottom-right corner. It is semi-transparent and white, and it sits in exactly the same place in every frame. This guide shows how to remove it cleanly, without a blurred patch, a crop or a drop in quality.</p>

      <h2>What you need</h2>
      <ul>
        <li>The original video file you downloaded (MP4, MOV or WebM). Use the original rather than a screen recording or a re-upload: every extra round of compression makes the logo’s edge fuzzier.</li>
        <li>A computer with a recent Chrome or Edge. Safari and Firefox work for most files too.</li>
        <li>The right to edit the video: you made it, or its owner agreed.</li>
      </ul>

      <h2>Step 1: Open the remover and add your video</h2>
      <p>Open the <Link to="/app">{n} remover</Link> and drag your video onto the page, or click <em>Choose files</em> (<em>Choose a folder</em> adds a whole folder). Nothing is uploaded: the video is read straight from your disk by your browser.</p>

      <h2>Step 2: Wait while it works</h2>
      <p>You don’t have to press anything. Your video appears as a card, and {n} looks at frames from across the whole video and finds the sparkle by its shape. Once found, it measures the logo’s exact opacity in your file, pixel by pixel, and then removes the logo from every frame by itself. The card shows each stage: <em>Finding the logo…</em>, <em>Gemini sparkle found</em>, <em>Removing the logo…</em> and finally <em>Finished</em>. The bar at the bottom shows the overall progress, and you can press <em>Stop</em> at any time.</p>
      <p>Before the long job starts, {n} cleans a few frames in memory and looks at what would be left behind. If a trace would remain, it tries other ways of measuring the logo and keeps the best one.</p>
      <p>If no logo is found (a video that was cleaned already, or one where the logo is faint on a light picture), the card says <em>No logo found</em> and shows the spot where the logo normally sits with the question <em>Is the logo here?</em>. Click <em>Yes, remove it</em> if you can see it, <em>Nothing to remove</em> to leave the file as it is, or <em>Draw a box</em> to mark a different place. As soon as the spot holds the logo, the cleaning starts by itself.</p>

      <h2>Step 3: Check the result</h2>
      <p>When a video is finished, {n} looks at the written file again and compares the picture just inside the logo’s outline with the picture just outside it. Where the logo is gone cleanly the two match. The card then says <em>checked, nothing left behind</em> and the bar says <em>All clean</em>.</p>
      <p>The card also shows the logo area before and after at three moments of the video, at several times its real size. If the check finds a faint trace, or a dark patch where the logo was, the card turns amber and says <em>please check</em> or <em>needs a look</em>, and one of the three moments is the worst one. Click <em>Review</em> for a bigger look, and <em>Go to that moment</em> to jump there.</p>

      <h2>Step 4: Pick the quality (optional)</h2>
      <p>Under the drop area on the start page, <em>Video quality</em> is set to <strong>Best quality</strong>. Changing pixels means the video has to be encoded again; Best quality uses about 2.5 times the original bitrate so the re-encoding can’t be seen. <strong>Smaller files</strong> makes smaller files that still look the same at normal viewing sizes. Choose before you add your video, because the cleaning starts right away. If you change your mind later, switch it in <em>Options</em> and press <em>Redo</em>. Either way the resolution, frame rate and number of frames stay the same, and the audio is copied untouched.</p>

      <h2>Step 5: Download</h2>
      <p>When the card says <em>Finished</em>, click <em>Download</em>. The cleaned video is saved as <code>yourvideo-clean.mp4</code> next to your other downloads.</p>

      <h2>Tips for the best result</h2>
      <ul>
        <li><strong>Keep your original.</strong> {n} writes a new file and never changes the one you added.</li>
        <li><strong>Several videos?</strong> Drop them all in at once. See <Link to="/guides/batch-remove-watermarks">how batch mode works</Link>.</li>
        <li><strong>Very dark scenes</strong> are handled with a separate correction that the tool measures from your video’s own dark frames.</li>
        <li><strong>Long or 4K videos</strong> take longer and need more memory. Close other heavy tabs, and plug your laptop in.</li>
      </ul>

      <h2>Before you publish</h2>
      <p>Removing the visible logo does not change where the video came from. AI videos also carry invisible watermarks such as SynthID, which {n} doesn’t touch, and many platforms ask you to label realistic AI content. Read <Link to="/guides/visible-watermark-vs-synthid">what removing the logo does and doesn’t do</Link> and <Link to="/guides/label-ai-generated-content">how to label AI content on each platform</Link>.</p>
    </>
  ),

  'blur-crop-or-restore': () => (
    <>
      <p>There are three common ways to get rid of a corner watermark: crop it out, cover it up, or restore what is underneath. They give very different results, especially in video.</p>

      <h2>1. Cropping</h2>
      <p>Cropping cuts off the edge of the frame that holds the logo. It is quick, but you lose part of the picture and the video no longer has its original shape: a 16:9 video cropped to remove a corner logo either becomes a different aspect ratio or has to be scaled up, which softens every frame. For anything you care about, cropping costs more than it saves.</p>

      <h2>2. Blurring, smudging and “content-aware fill”</h2>
      <p>Covering the logo with a blur or a smudge leaves a soft patch that the eye finds immediately, because it has none of the texture around it. In video it is worse: the background moves but the patch doesn’t, so it looks like a smear on the lens.</p>
      <p>AI inpainting is more convincing on a single image: it invents plausible detail to fill the hole. But it is guessing. In video, most tools guess each frame on its own, so the filled area shimmers and flickers from frame to frame, and fine detail that was really there (text, a face, the edge of an object) is replaced by something made up.</p>

      <h2>3. Restoring the pixels under the logo</h2>
      <p>The sparkle watermark is see-through. Every pixel inside it is a mix of the real picture and the logo’s white colour, in a fixed proportion called the opacity (or alpha):</p>
      <p className="formula">shown = (1 − α) × real + α × white</p>
      <p>If you know α for each pixel and the logo’s exact colour, you can turn the equation around and recover the real pixel:</p>
      <p className="formula">real = (shown − α × white) ÷ (1 − α)</p>
      <p>Nothing is invented. The original detail was in the frame all along, only lightened. This is how {n} works: it measures α for every pixel of the logo in your own file, then reverses the blend in every frame. Because the calculation is exact and the same in every frame, there is no shimmer, and moving things behind the logo stay sharp. <Link to="/how-it-works">Read the full explanation</Link>.</p>

      <h2>The catch: compression</h2>
      <p>Real videos are compressed, and compression adds small errors. Dividing by (1 − α) makes those errors a little larger where the logo is most opaque, which can leave a faint outline. {n} cleans that up with an extra pass along the logo’s edge that only changes pixels where the numbers show leftover traces, and leaves real detail alone.</p>
      <p>Where a logo is completely opaque (α = 1) there is nothing left to recover. Those pixels have to be filled in from their surroundings, like any other tool would. The sparkle used by Gemini and Veo is not fully opaque, which is why it can be removed so cleanly.</p>

      <h2>Which should you use?</h2>
      <ul>
        <li><strong>See-through logo</strong> (like the AI sparkle): restore. It is the only method that brings back the real picture.</li>
        <li><strong>Solid, opaque logo</strong>: inpainting or a fill is the only option, and results depend on the background.</li>
        <li><strong>Logo in an empty corner</strong> of a still image: any method works; restoring still keeps the texture of the background.</li>
      </ul>
    </>
  ),

  'visible-watermark-vs-synthid': () => (
    <>
      <p>AI-generated media from Google can carry two quite different watermarks. It helps to know which is which before you edit and publish anything.</p>

      <h2>The visible watermark</h2>
      <p>The small sparkle in the corner (and on some videos, a “Veo” text mark) is drawn on top of the picture. It tells viewers at a glance that the content was AI-generated. It is a visual overlay, so it can be measured and reversed, which is what {n} does.</p>

      <h2>SynthID: the invisible watermark</h2>
      <p>SynthID is Google DeepMind’s invisible watermark. It is woven into the pixels (and audio) of generated content in a way people can’t see, and it is designed to survive common edits such as cropping, compression, filters and frame-rate changes. Google provides tools that check for it.</p>
      <p><strong>{n} does not remove SynthID, and doesn’t try to.</strong> Removing the visible sparkle changes a few thousand pixels in one corner by a small, precise amount; the invisible watermark is spread across the whole picture and is not affected. Content you clean with {n} can still be identified as AI-generated by tools that read SynthID.</p>

      <h2>Metadata and content credentials</h2>
      <p>Some files also carry metadata that describes how they were made, such as C2PA “content credentials”. Like most video editors, {n} writes a brand-new file, so this metadata is not carried over. If you need to show where a file came from, keep the original.</p>

      <h2>So why remove the visible logo at all?</h2>
      <p>Usually for presentation: the sparkle distracts in a showreel, a product demo, a client presentation or a video that will be edited together with other footage. Removing it is about how the content looks, not about hiding where it came from. That is also why it is important to keep being open about AI use.</p>

      <h2>Be open about AI content</h2>
      <p>Many platforms require realistic AI-generated or AI-altered content to be labelled, and laws such as the EU AI Act require deepfakes to be disclosed. Removing the logo does not remove that duty. Our guide on <Link to="/guides/label-ai-generated-content">labelling AI content on YouTube, TikTok, Instagram and Facebook</Link> shows where the settings are.</p>
    </>
  ),

  'label-ai-generated-content': () => (
    <>
      <p>Major platforms ask creators to disclose realistic content that was made or changed with AI. Doing so is simple, keeps your account in good standing, and is honest with your audience. Here is where to find the setting on the biggest platforms. Platforms change their apps often, so if a menu has moved, search their help centre for “AI label” or “altered content”.</p>

      <h2>When do you need a label?</h2>
      <p>Broadly, when a reasonable viewer could mistake AI content for real footage of real people, places or events. Obvious fantasy, animation and stylised art usually don’t need one, and neither do small AI-assisted edits like colour correction. When in doubt, label it: there is no penalty for being transparent.</p>

      <h2>YouTube</h2>
      <p>When you upload in YouTube Studio, the <em>Details</em> step asks whether your video contains altered or synthetic content. Answer <strong>Yes</strong> if it includes realistic AI-generated people, places or events. YouTube then shows a label in the description, or on the video itself for sensitive topics. Content made with YouTube’s own AI tools may be labelled automatically.</p>

      <h2>TikTok</h2>
      <p>On the posting screen, open <em>More options</em> and turn on the <strong>AI-generated content</strong> setting. TikTok can also add the label automatically when a file carries content credentials from another AI tool, and it may remove unlabelled realistic AI content.</p>

      <h2>Instagram and Facebook</h2>
      <p>Meta shows an “AI info” label on content it detects as AI-made or that you mark yourself. When you post, look for the <strong>Add AI label</strong> option (on Instagram under <em>Advanced settings</em>). Meta asks you to label photorealistic video and realistic-sounding audio that was digitally created or altered.</p>

      <h2>Other places</h2>
      <ul>
        <li><strong>Ads and sponsored content</strong> usually have stricter disclosure rules than ordinary posts, especially for political or social-issue ads.</li>
        <li><strong>Client work:</strong> tell your client which parts are AI-generated, and agree on how it will be disclosed.</li>
        <li><strong>The law:</strong> in the EU, the AI Act requires deepfakes (realistic AI images, audio or video of real people, places or events) to be disclosed as artificial. Other countries have or are adding similar rules.</li>
      </ul>

      <h2>Removing the logo and labelling go together</h2>
      <p>The corner sparkle is a crude label: it can be cropped or covered, and it clutters the picture. A platform label is cleaner and is the one viewers actually look for. Remove the sparkle with <Link to="/app">{n}</Link> for a clean picture, and use the platform’s label so your audience knows what they are watching.</p>
    </>
  ),

  'batch-remove-watermarks': () => (
    <>
      <p>If you generate a lot of AI clips, cleaning them one by one gets tedious. {n}’s batch mode takes a whole folder at once and gives you everything back as one ZIP.</p>

      <h2>1. Add all your files at once</h2>
      <p>Open the <Link to="/app">remover</Link> and drop in as many videos and photos as you like, or select them together in the file picker. They appear as a list of cards; each one is opened and checked as it arrives.</p>

      <h2>2. The first video leads</h2>
      <p>{n} finds the logo in the first video, shows the before and after on its card and starts cleaning it by itself. With <em>Use the first video’s logo position for all videos</em> switched on (it is in <em>Options</em> once you have two or more videos), every other video uses the same logo position, scaled to its own size, which is fast and reliable because the AI sparkle always sits in the same place.</p>
      <p>Each video still gets its own measurement of the logo’s opacity, because different videos are compressed differently. You don’t need to do anything for that; it happens while the batch runs.</p>
      <p>If your videos come from different sources and the logo is not always in the same place, switch the option off. {n} will then search each video separately.</p>

      <h2>3. Check any file, answer the questions</h2>
      <p>Click <em>Review</em> on any card for a closer look. If the logo was missed in one of them (or it was cleaned already), its card says <em>No logo found</em> and asks <em>Is the logo here?</em>. Once the files being cleaned are finished, click <em>Yes, remove it</em>, <em>Nothing to remove</em> or <em>Draw a box</em>; the file is then cleaned by itself, or left as it is.</p>

      <h2>4. Let the batch run</h2>
      <p>There is nothing to press. Files are cleaned one after another, with progress on each card and an overall bar at the bottom. You can press <em>Stop</em> at any time; finished files stay finished and <em>Continue</em> picks up the rest. You can also add more files while it runs; they join the queue. Files where no logo could be found are skipped and wait for your answer, so nothing is changed by mistake. Every finished file is checked again, and the bar tells you how many are clean and how many to look at.</p>

      <h2>5. Download everything</h2>
      <p>When two or more files are done, <em>Download all (ZIP)</em> appears. The ZIP is built in your browser and simply packs the cleaned files (they are already compressed, so zipping them again would only waste time). A single ZIP can hold up to 4 GB; above that, download the files one by one.</p>

      <h2>Tips for big batches</h2>
      <ul>
        <li>Keep the tab open and visible while it runs; browsers slow down background tabs.</li>
        <li>Plug your laptop in: processing uses the graphics chip and CPU heavily.</li>
        <li>If your browser runs out of memory with many long 4K videos, process them in smaller groups.</li>
        <li>Batch mode and longer videos are part of <Link to="/pricing">{n} Pro</Link>.</li>
      </ul>
    </>
  ),
};
