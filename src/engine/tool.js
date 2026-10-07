// The tool page: wires the removal engine (core.js) to the markup in tool-markup.html.
// Everything runs in the visitor's browser; Mediabunny (MPL-2.0) reads, decodes, encodes and writes the files.
import * as MB from 'mediabunny';
import C from './core.js';
import { makeEngine } from './engine.js';
import EngineWorker from './worker.js?worker&inline';
import { makeSora, rectAtTime } from './sora.js';
import { makePhoto } from './photo.js';

export function mountTool(root, opts = {}) {
  // which remover this page is: Gemini and Veo logos (the default), the Sora watermark, or any logo the person points out
  const MODE = opts.mode === 'sora' || opts.mode === 'logo' || opts.mode === 'photo' ? opts.mode : 'gemini';
  const CFG = {
    gemini: { ask: true, box: true, videos: true, images: true, sample: true, same: true },
    sora: { ask: false, box: false, videos: true, images: false, sample: false, same: false },
    logo: { ask: false, box: true, videos: true, images: false, sample: false, same: false },
    photo: { ask: false, box: true, videos: false, images: true, sample: false, same: false },
  }[MODE];
  const OTHER = MODE !== 'gemini';
  const BOXED = MODE === 'logo' || MODE === 'photo';               // the person points out the logo with a box
  root.dataset.mode = MODE;
  const ac = new AbortController(), signal = ac.signal, cleanups = [];
  let alive = true;
  const $ = (s) => root.querySelector(s);
  const stage = $('#stage'), stageWrap = $('#stageWrap'), view = $('#view'), vctx = view.getContext('2d');
  const overlay = $('#overlay'), octx = overlay.getContext('2d');
  const stagePill = $('#stagePill'), stagePillText = $('#stagePillText'), stageMsg = $('#stageMsg');
  const scrub = $('#scrub'), tcEl = $('#tc'), playBtn = $('#playBtn'), splitEl = $('#split');
  const boxHint = $('#boxHint'), boxHintText = $('#boxHintText'), viewSeg = $('#viewSeg'), boxBtn = $('#boxBtn'), boxBtn2 = $('#boxBtn2');
  const loupesEl = $('#loupes'), loupeA = $('#loupeA'), loupeB = $('#loupeB'), logoInfo = $('#logoInfo'), redetectBtn = $('#redetect');
  const reviewEl = $('#review'), rvBackdrop = $('#rvBackdrop'), rvTitle = $('#rvTitle'), rvMeta = $('#rvMeta'), rvNav = $('#rvNav'), rvPrev = $('#rvPrev'), rvCount = $('#rvCount'), rvNext = $('#rvNext'), rvClose = $('#rvClose');
  const confirmEl = $('#confirm'), cfTitle = $('#cfTitle'), cfText = $('#cfText'), cfYes = $('#cfYes'), cfNo = $('#cfNo'), cfBackdrop = $('#cfBackdrop');
  const fileEl = $('#file'), folderEl = $('#folder'), dropEl = $('#drop'), dropOverlay = $('#dropOverlay');
  const welcomeEl = $('#welcome'), welcomeNote = $('#welcomeNote'), sampleCard = $('#sampleCard'), sampleBtn = $('#sampleBtn'), chooseBtn = $('#chooseBtn'), chooseFolderBtn = $('#chooseFolderBtn');
  const jobArea = $('#jobArea'), jobsEl = $('#jobs'), fileCount = $('#fileCount'), filesTotal = $('#filesTotal'), clearBtn = $('#clearBtn'), addFilesBtn = $('#addFilesBtn'), addFolderBtn = $('#addFolderBtn');
  const optSum = $('#optSum'), qMax = $('#qMax'), qHigh = $('#qHigh'), wqMax = $('#wqMax'), wqHigh = $('#wqHigh'), qNote = $('#qNote'), sameRectEl = $('#sameRect'), sameRow = $('#sameRow');
  const barEl = $('#actionbar'), abProgress = $('#abProgress'), abFill = $('#abFill'), abIcon = $('#abIcon'), abTitle = $('#abTitle'), abPct = $('#abPct'), abSub = $('#abSub');
  const abPrimary = $('#abPrimary'), abPrimaryLabel = $('#abPrimaryLabel'), abSecondary = $('#abSecondary'), abMore = $('#abMore'), noteEl = $('#note'), noteBox = $('#noteBox'), noteClose = $('#noteClose'), srStatus = $('#srStatus'), rvHint = $('#rvHint');

  // the three steps, and what to do in each, for this remover
  const GUIDE = {
    gemini: { steps: ['Add files', 'Cleaned by itself', 'Download'], how: ['Drop in your <b>videos or photos</b>.', 'The logo is <b>found and removed</b> by itself.', '<b>Download</b> the clean files, or all of them as one ZIP.'] },
    sora: { steps: ['Add videos', 'Cleaned by itself', 'Download'], how: ['Drop in your <b>Sora videos</b>.', 'The moving watermark is <b>found and removed</b> by itself.', '<b>Download</b> the clean videos, or all of them as one ZIP.'] },
    logo: { steps: ['Add videos', 'Mark the logo', 'Download'], how: ['Drop in your <b>videos</b>.', '<b>Drag a box</b> around the logo.', '<b>Download</b> the clean videos, or all of them as one ZIP.'] },
    photo: { steps: ['Add photos', 'Mark the logo', 'Download'], how: ['Drop in your <b>photos</b>.', '<b>Drag a box</b> around each logo or watermark.', '<b>Download</b> the clean photos, or all of them as one ZIP.'] },
  }[MODE];
  root.querySelectorAll('#stepper .st-l').forEach((el, i) => { el.textContent = GUIDE.steps[i]; });
  $('#howList').innerHTML = GUIDE.how.map((h) => '<li><span>' + h + '</span></li>').join('');

  // the start page says what this remover is for
  if (OTHER) {
    const COPY = {
      sora: { h: 'Drop your Sora videos here', sub: 'The Sora watermark is found and removed automatically, even while it moves around the frame. Everything stays on your device.', formats: ['MP4', 'MOV', 'WebM'], accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv' },
      logo: { h: 'Drop your videos here', sub: 'Then drag a box around the logo you want gone. It is rebuilt in every frame, and everything stays on your device.', formats: ['MP4', 'MOV', 'WebM'], accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv' },
      photo: { h: 'Drop your photos here', sub: 'Then drag a box around the logo or watermark you want gone. Only the logo itself is rebuilt, from the picture around it. Everything stays on your device.', formats: ['PNG', 'JPG', 'WebP'], accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp' },
    };
    const copy = COPY[MODE];
    $('.hero-drop h2').textContent = copy.h; $('.hero-sub').textContent = copy.sub;
    $('.formats').innerHTML = copy.formats.map((f) => '<b>' + f + '</b>').join('');
    $('#file').setAttribute('accept', copy.accept);
    sampleCard.hidden = true;
    if (!CFG.videos) { for (const el of root.querySelectorAll('#welcomeQuality, #options')) el.hidden = true; }   // nothing to set for photos
    if (BOXED) redetectBtn.textContent = MODE === 'photo' ? 'Clear boxes' : 'Clear box';
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // on a wide screen the review window is docked beside the queue (an inspector); elsewhere it is a window
  // the inspector docks beside the file list when the page has the room for both: the width the page really has, which is
  // less than the window's when ads stand beside it
  const DOCK_MIN = 960, studioEl = $('#studio'), pipeEl = $('#pipe');
  const pageBox = root.closest('main') || document.body;
  const roomNow = () => pageBox.clientWidth || window.innerWidth;
  let dockOn = roomNow() >= DOCK_MIN;
  const docked = () => dockOn;
  root.dataset.room = dockOn ? 'wide' : 'narrow';

  // ---------- small helpers ----------
  const bn = (n) => String(n);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Gives the page a moment to breathe. A message, not a timer: browsers slow timers in background tabs to one a second.
  const idle = (() => {
    const ch = new MessageChannel(), waiting = [];
    ch.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
    return () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
  })();
  function tc(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60); let s = (t - m * 60).toFixed(2);
    if (s.length < 5) s = '0' + s;
    return String(m).padStart(2, '0') + ':' + s;
  }
  const fmtMB = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB');
  const fmtMbps = (b) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' Mbps';
  const pct = (v) => bn(Math.round(v * 100)) + '%';
  function uerr(msg) { const e = new Error(msg); e.userMsg = msg; return e; }
  function errText(e) {
    if (e && e.userMsg) return e.userMsg;
    const m = (e && (e.message || e.name)) || String(e);
    if (/memory|allocation/i.test(m)) return 'Your browser ran out of memory. Process the videos a few at a time.';
    return 'Something went wrong: ' + m;
  }
  const baseName = (n) => (n || 'video').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90) || 'video';

  // ---------- state ----------
  const S = {
    items: [], refId: null, reviewId: null, rectRel: null, sameRect: true, quality: 'max',
    busy: false, analyzing: false, cancel: false, frac: 0.25, conv: null, intake: false,
    view: 'split', split: 0.5, splitSet: false, boxMode: false, zoom: 1, zx: 0.5, zy: 0.5,
    runId: 0, runT0: 0, runDid: 0, eta: null, lastSecs: 0, stopped: false, stopping: false, zipping: false,
  };
  let nextId = 1;
  const getItem = (id) => S.items.find((i) => i.id === id) || null;
  const refItem = () => getItem(S.refId);

  // ---------- the engine ----------
  // The engine itself is in engine.js. Reading single frames (previews, checks) happens here; finding the logo,
  // learning it and cleaning and writing the video run in workers, so the page stays free and two files can
  // be worked on at once. Where workers are not available everything runs here, with the same code.
  const E = makeEngine(S);
  const SR = makeSora(E, S);
  const PH = makePhoto(E, S);
  const { GEMINI, GEMINI_SHARP, GEMINI_SHARP_DARK, VEO, VEO_MIN, YUV8, analyzeImage, cleanSample, csInit, encodeImage, evenRect, frameMode, fromRel, isImageFile, isJpeg, makeCanvas, openInput, padRect, planeModels, probe, probeImage, readFrame, readRgb, readYuv, rgbToYuv, stamps, targetBitrate, toRel, withTrack, yuvToRgb } = E;
  const pool = (() => {
    let ws = null, dead = false, seq = 0;
    const jobs = new Map(), stats = { worker: 0, local: 0 };
    const finish = (id, fn) => { const j = jobs.get(id); if (j) { jobs.delete(id); fn(j); } };
    function onMsg(m) {
      const j = jobs.get(m.id);
      if (!j) { if (m.b) { m.b.close(); m.a.close(); m.t.close(); } return; }
      if (m.type === 'progress') j.onP && j.onP(m.p);
      else if (m.type === 'live') { if (j.live) j.live(m); else { m.b.close(); m.a.close(); m.t.close(); } }
      else if (m.type === 'done') finish(m.id, (x) => x.resolve({ value: m.result, outCodec: m.outCodec }));
      else if (m.type === 'error') finish(m.id, (x) => { const e = new Error(m.text); if (m.msg) e.userMsg = m.msg; x.reject(e); });
    }
    function lost() { dead = true; for (const [id, j] of jobs) { jobs.delete(id); j.resolve({ local: true }); } if (ws) { for (const w of ws) { try { w.w.terminate(); } catch (e) { /* gone */ } } ws = null; } }
    function make() {
      if (ws || dead) return ws;
      try {
        ws = [0, 1].map(() => { const w = new EngineWorker(); w.onmessage = (e) => onMsg(e.data); w.onerror = lost; w.onmessageerror = lost; return { w, q: Promise.resolve() }; });
      } catch (e) { dead = true; ws = null; }
      return ws;
    }
    // runs one job on a worker (finding and learning on the first, writing on the second); {local:true} says to do it here
    async function call(kind, it, payload, onP, live) {
      const list = make();
      if (!list || (it.file && it.file.__noWorker)) { stats.local++; return { local: true }; }
      stats.worker++;
      const w = list[kind === 'convert' || kind === 'soraConvert' ? 1 : 0];
      const run = () => new Promise((resolve, reject) => {
        const id = ++seq;
        jobs.set(id, { resolve, reject, onP, live, w });
        try { w.w.postMessage({ id, type: kind, item: { file: it.file, info: it.info }, quality: S.quality, ...payload }); } catch (e) { jobs.delete(id); resolve({ local: true }); }
      });
      const p = w.q.then(run, run);
      w.q = p.then(() => {}, () => {});
      return p;
    }
    return {
      call, stats,
      cancel() { if (ws) for (const w of ws) w.w.postMessage({ type: 'cancel' }); },
      hold(on) { if (ws) for (const w of ws) w.w.postMessage({ type: 'hold', on: !!on }); },
      get usable() { return !dead; },
    };
  })();
  const cleanFrame = (s, m, holder) => (m.engine ? SR.cleanSample(s, m, holder) : cleanSample(s, m, holder));
  const detectLogo = async (it, onP) => { const r = await pool.call('detect', it, {}, onP); return r.local ? E.detectLogo(it, onP) : r.value; };
  const learn = async (it, rect, onP, guess) => { const r = await pool.call('learn', it, { rect, guess: guess || null }, onP); return r.local ? E.learn(it, rect, onP, guess) : r.value; };
  // live: { spec, draw(bitmaps) } to show the work as it goes, or null; hold waits while a preview plays
  const soraDetect = async (it, onP) => { const r = await pool.call('soraDetect', it, {}, onP); return r.local ? SR.detectSora(it, onP) : r.value; };
  const logoPrepare = async (it, rect, onP) => { const r = await pool.call('logoPrepare', it, { rect }, onP); return r.local ? SR.prepareLogo(it, rect, onP) : r.value; };
  async function convert(it, model, onP, live, hold) {
    if (model.engine) {
      const r = await pool.call('soraConvert', it, { model }, onP, null);
      if (r.local) return SR.convert(it, model, onP, null, hold);
      it.outCodec = r.outCodec;
      return r.value;
    }
    const r = await pool.call('convert', it, { model, live: live ? live.spec : null }, onP, live ? live.draw : null);
    if (r.local) return E.convert(it, model, onP, live ? live.local : null, hold);
    it.outCodec = r.outCodec;
    return r.value;
  }

  // =====================================================================================
  // Everything below is the page around the engine: the file list, the review window, the
  // queue that finds each file's logo, and the run that removes it. The engine above is untouched.
  // =====================================================================================

  // ---------- small helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let scrollLocks = 0;
  function lockScroll(on) {
    scrollLocks = Math.max(0, scrollLocks + (on ? 1 : -1));
    document.documentElement.style.overflow = scrollLocks ? 'hidden' : '';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICON = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9.5v5l4-2.5z"></path></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M21 16l-5-5-8 8"></path></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"></path></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11v5M12 7.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    spin: '<span class="spin"></span>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
    wand: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"></path><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"></path></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"></path></svg>',
    found: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"></path><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"></circle></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"></path></svg>',
  };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // The reason a file failed, in plain words. The raw message stays available as a tooltip.
  function explain(it) {
    const raw = it.msg || '';
    let m, text = raw;
    if (/unsupported or unrecognizable|not recognized|invalid data/i.test(raw)) text = 'This browser can’t read this file. It may be damaged, or not a video or photo.';
    else if (/No video track/i.test(raw)) text = 'There is no video in this file.';
    else if ((m = raw.match(/cannot decode this video format \(([^)]+)\)/i))) {
      const c = m[1].toLowerCase();
      const name = { avc: 'H.264', hevc: 'H.265 (HEVC)', vp8: 'VP8', vp9: 'VP9', av1: 'AV1' }[c] || c.toUpperCase();
      text = 'This browser can’t play ' + name + ' video. ' + (c === 'avc' ? 'Use a recent Chrome or Edge on a computer.' : 'Try Chrome or Edge, or save it as MP4 (H.264) first.');
    }
    else if (/image could not be opened/i.test(raw)) text = 'This image can’t be opened. It may be damaged.';
    else if (/Not enough frames/i.test(raw)) text = 'This video is too short to find the logo in.';
    else if (/cannot encode video/i.test(raw)) text = 'This browser can’t save a video this large. Use a recent Chrome or Edge on a computer.';
    else if (/cannot be converted/i.test(raw)) text = 'This browser can’t convert this video. Try Chrome or Edge on a computer.';
    else if (/could not be saved/i.test(raw)) text = 'The cleaned image could not be saved. Try again.';
    else if (/^Something went wrong:/i.test(raw)) text = 'Something unexpected happened. Try again, or clean this file on its own.';
    return { text, raw };
  }
  const isVideoFile = (f) => (f.type && f.type.startsWith('video/')) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);
  const coverRect = (W, H, ar) => { let sw = W, sh = W / ar; if (sh > H) { sh = H; sw = H * ar; } return { sx: (W - sw) / 2, sy: (H - sh) / 2, sw, sh }; };

  // ---------- where each file is in its journey ----------
  // opening → queued → finding → ready | nologo → working → done        (or error at any point)
  function phase(it) {
    if (it.status === 'error') return 'error';
    if (it.status === 'done') return 'done';
    if (it.status === 'encoding' || it.status === 'learning') return 'working';
    if (!it.info || it.status === 'new' || it.status === 'probing') return 'opening';
    if (it.status === 'analyzing') return 'finding';
    if (it.boxReq) return 'queued';
    if (it.model && it.model.ok) return 'ready';
    if (it.skipped && !it.model) return 'skipped';
    if (it.msg || it.model) return 'nologo';
    return 'queued';
  }
  const TODO = new Set(['opening', 'queued', 'finding', 'ready']);
  const isTodo = (it) => !it.removed && TODO.has(phase(it));
  const doneItems = () => S.items.filter((i) => i.status === 'done' && i.result);
  const unsavedItems = () => doneItems().filter((i) => !i.saved);
  function counts() {
    const c = { opening: 0, queued: 0, finding: 0, ready: 0, nologo: 0, skipped: 0, working: 0, done: 0, error: 0 };
    for (const it of S.items) c[phase(it)]++;
    return c;
  }
  const weight = (it) => (it.kind === 'video' && it.info ? Math.max(1, (it.info.dur - it.info.first) * it.info.fps) : 24);
  const logoName = (m) => (m && m.engine === 'sora' ? 'Sora watermark' : m && m.engine ? 'Logo' : m && (m.kind === 'image' || m.gemini) ? 'Gemini sparkle' : m && m.veo ? 'Veo text mark' : 'Logo');

  // ---------- close-ups of the logo (before and after) ----------
  const CU_W = 224, CU_H = 168;
  function cuGeom(rect, W, H) {
    const ar = CU_W / CU_H, sh = Math.min(H, Math.round(Math.max(rect.h, rect.w / ar) * 1.7)), sw = Math.min(W, Math.round(sh * ar));
    return { sx: clamp(Math.round(rect.x + rect.w / 2 - sw / 2), 0, W - sw), sy: clamp(Math.round(rect.y + rect.h / 2 - sh / 2), 0, H - sh), sw, sh };
  }
  function cuDraw(src, cv, g, isSample) {
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, cv.width, cv.height);
    if (isSample) src.draw(c, g.sx, g.sy, g.sw, g.sh, 0, 0, cv.width, cv.height);
    else c.drawImage(src, g.sx, g.sy, g.sw, g.sh, 0, 0, cv.width, cv.height);
  }
  async function withSampleAt(source, t, fn) {
    const input = new MB.Input({ source: new MB.BlobSource(source), formats: MB.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('no video track');
      const s = await new MB.VideoSampleSink(track).getSample(t);
      if (!s) throw new Error('no frame');
      try { return await fn(s); } finally { s.close(); }
    } finally { try { input.dispose(); } catch (e) { /* closed */ } }
  }
  const thumbTime = (it) => it.info.first + Math.min(1, (it.info.dur - it.info.first) * 0.3);
  // from = 'preview' (the original with the measured logo removed) or 'result' (read back from the finished file)
  async function makeCloseups(it, from) {
    const m = it.model, c = it.card;
    if (!c || it.removed || !it.info || !m || !m.ok) return;
    const ct = m.engine && it.kind === 'video' ? m.mainT : null;
    const g = cuGeom(m.engine ? rectAtTime(m, ct) : m.rect, it.info.w, it.info.h);
    if (from === 'result' && it.kind === 'video' && it.result) {
      await drawStrip(it);
      if (it.stripHas) { it.cuHas = true; it.cuKind = from; updItem(it); return; }
    }
    try {
      if (it.kind === 'image') {
        cuDraw(it.bmp, c.b, g, false);
        if (from === 'result' && it.result) {
          const bmp = await createImageBitmap(it.result);
          try { cuDraw(bmp, c.a, g, false); } finally { bmp.close(); }
        } else cuDraw(m.out, c.a, g, false);
      } else {
        const t = ct != null ? ct : thumbTime(it);
        await withSampleAt(it.file, t, async (s) => {
          cuDraw(s, c.b, g, true);
          if (from === 'result' && it.result) return;
          const out = await cleanFrame(s, m, {});
          try { cuDraw(out, c.a, g, true); } finally { if (out !== s) out.close(); }
        });
        if (from === 'result' && it.result) await withSampleAt(it.result, t, async (r) => cuDraw(r, c.a, g, true));
      }
      it.cuHas = true; it.cuKind = from;
    } catch (e) { /* no close-ups for this file; the card still works */ }
    updItem(it);
  }
  const mmss = (t) => { const s = Math.max(0, Math.round(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  // The finished video at three moments (the worst one when the check found something), before and after.
  async function drawStrip(it) {
    const c = it.card, m = it.model;
    if (!c || it.removed || it.kind !== 'video' || !it.result || !it.info || !m || !m.ok) return;
    const g = cuGeom(m.rect, it.info.w, it.info.h), span = Math.max(0, it.info.dur - it.info.first - 1 / it.info.fps), flagged = !!(it.check && it.check.level !== 'ok');
    const times = [it.info.first + span * 0.1, flagged ? it.check.worstT : it.info.first + span * 0.5, it.info.first + span * 0.9];
    const inA = openInput(it.file), inB = openInput(it.result);
    try {
      const sinkA = new MB.VideoSampleSink(await inA.getPrimaryVideoTrack()), sinkB = new MB.VideoSampleSink(await inB.getPrimaryVideoTrack());
      for (let i = 0; i < 3; i++) {
        const t = times[i], f = c.strip.figs[i], a = await sinkA.getSample(t), b = await sinkB.getSample(t);
        try { if (!a || !b) throw new Error('no frame'); const gg = m.engine ? cuGeom(rectAtTime(m, t), it.info.w, it.info.h) : g; cuDraw(a, f.b, gg, true); cuDraw(b, f.a, gg, true); } finally { if (a) a.close(); if (b) b.close(); }
        f.cap.textContent = (flagged && i === 1 ? 'Worst moment · ' : '') + mmss(t - it.info.first);
        f.cap.classList.toggle('worst', flagged && i === 1);
      }
      it.stripHas = true;
    } catch (e) { /* no strip for this file; the single close-up stays */ }
    finally { try { inA.dispose(); inB.dispose(); } catch (e) { /* closed */ } }
    updItem(it);
  }
  // Where a logo would be, to ask "is it here?" about a file whose logo was not found.
  function suggestRect(it) {
    const { w: W, h: H } = it.info;
    if (it.kind === 'image') return evenRect({ x: W * 0.84, y: H * 0.84, w: W * 0.14, h: H * 0.14 }, W, H);
    const ref = refItem();
    if (S.rectRel && ref && ref !== it && ref.model && ref.model.ok) return fromRel(S.rectRel, W, H); // where the first video's logo sits
    const g = usualPlace(it.info);
    return evenRect(C.placeTemplate(GEMINI, g.x, g.y, g.s, W, H).rect, W, H);
  }
  async function makeAsk(it) {
    const c = it.card;
    if (!c || it.removed || !it.info || it.askBusy) return;
    it.askBusy = true;
    try {
      const r = suggestRect(it), g = cuGeom(r, it.info.w, it.info.h);
      if (it.kind === 'image') cuDraw(it.bmp, c.b, g, false);
      else await withSampleAt(it.file, thumbTime(it), async (s) => cuDraw(s, c.b, g, true));
      it.suggest = r; it.suggestGuess = it.kind === 'video' ? { ...usualPlace(it.info), usual: true } : null; it.askHas = true;
    } catch (e) { /* no suggestion for this file */ }
    it.askBusy = false;
    updItem(it);
  }
  // A small picture of each file for its card.
  async function makeThumb(it) {
    try {
      const TW = 320, TH = 180, cv = document.createElement('canvas');
      cv.width = TW; cv.height = TH;
      const cx = cv.getContext('2d'), { w, h } = it.info, k = Math.max(TW / w, TH / h);
      const dw = w * k, dh = h * k, dx = (TW - dw) / 2, dy = (TH - dh) / 2;
      if (it.kind === 'image') cx.drawImage(it.bmp, dx, dy, dw, dh);
      else await withSampleAt(it.file, thumbTime(it), async (s) => { s.draw(cx, dx, dy, dw, dh); });
      it.thumb = cv.toDataURL('image/jpeg', 0.82);
    } catch (e) { /* the card shows an icon instead */ }
    updItem(it);
  }

  // ---------- preview (in the review window) ----------
  const P = { res: null, item: null, input: null, sink: null, busy: false, pending: false, holder: {}, orig: null, proc: null, has: false, token: 0, playing: false, loop: null };
  { let playing = false; Object.defineProperty(P, 'playing', { get: () => playing, set: (v) => { playing = !!v; pool.hold(playing); } }); }
  function closePreview() {
    P.token++; P.playing = false;
    if (P.input) { try { P.input.dispose(); } catch (e) { /* closed */ } }
    P.input = null; P.sink = null; P.item = null; P.has = false;
    closeResult();
  }
  async function stopPlay() {
    P.playing = false;
    if (P.loop) { try { await P.loop; } catch (e) { /* reported by the loop */ } }
  }
  async function openPreview(item) {
    await stopPlay();
    closePreview();
    if (!item || !item.info) return;
    const tok = P.token;
    S.splitSet = false; S.zoom = 1; S.zx = 0.5; S.zy = 0.5; stage.dataset.zoomed = '';
    $('#zoomSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.z === 1)));
    const { w, h } = item.info;
    if (item.kind === 'image') {
      P.item = item; P.orig = makeCanvas(w, h); P.proc = makeCanvas(w, h);
    } else {
      const input = openInput(item.file);
      let track;
      try { track = await input.getPrimaryVideoTrack(); } catch (e) { try { input.dispose(); } catch (x) { /* closed */ } throw e; }
      if (tok !== P.token || !track) { try { input.dispose(); } catch (e) { /* closed */ } return; }
      P.input = input; P.sink = new MB.VideoSampleSink(track); P.item = item;
      P.orig = makeCanvas(w, h); P.proc = makeCanvas(w, h);
    }
    view.width = w; view.height = h;
    stage.style.aspectRatio = w + ' / ' + h;
    layoutStage();
    await renderPreview();
  }
  // A file is previewed with its own logo measurement only (another file's could leave traces
  // that its own result won't have).
  function previewModel(item) {
    if (!item) return null;
    const m = item.model && item.model.ok ? item.model : null;
    // the other engines are slow: their video previews are read from the finished file
    if (m && m.engine && m.kind !== 'image' && !(item.status === 'done' && item.result)) return null;
    return m;
  }
  // a frame of the finished file (for the other engines' previews)
  async function resultAt(item, t) {
    if (!item.result) return null;
    if (!P.res || P.res.blob !== item.result) {
      closeResult();
      const input = openInput(item.result), track = await input.getPrimaryVideoTrack();
      if (!track) { try { input.dispose(); } catch (e) { /* closed */ } return null; }
      P.res = { blob: item.result, input, sink: new MB.VideoSampleSink(track) };
    }
    return P.res.sink.getSample(t);
  }
  function closeResult() { if (P.res) { try { P.res.input.dispose(); } catch (e) { /* closed */ } P.res = null; } }
  function previewTime(item) { const i = item.info; return i.first + S.frac * Math.max(0, i.dur - i.first - 1 / i.fps); }
  const setTc = (t, dur) => { tcEl.innerHTML = '<b>' + tc(t) + '</b> / ' + tc(dur); };
  async function drawSample(s, item) {
    s.draw(P.orig.getContext('2d'), 0, 0, P.orig.width, P.orig.height);
    const px = P.proc.getContext('2d'), model = previewModel(item);
    if (model && model.engine && item.kind === 'video') {
      const r = await resultAt(item, s.timestamp);
      if (r) { try { r.draw(px, 0, 0, P.proc.width, P.proc.height); } finally { r.close(); } } else px.drawImage(P.orig, 0, 0);
    } else if (model) {
      const out = await cleanSample(s, model, P.holder);
      try { out.draw(px, 0, 0, P.proc.width, P.proc.height); } finally { if (out !== s) out.close(); }
    } else px.drawImage(P.orig, 0, 0);
    P.has = true;
  }
  async function renderPreview() {
    if (P.item && P.item.kind === 'image') {
      const item = P.item;
      P.orig.getContext('2d').drawImage(item.bmp, 0, 0);
      P.proc.getContext('2d').drawImage(item.model && item.model.ok ? item.model.out : item.bmp, 0, 0);
      P.has = true;
      tcEl.innerHTML = '<b>Photo</b>';
      drawView(); rvRender();
      return;
    }
    if (!P.sink || P.playing) return;
    if (P.busy) { P.pending = true; return; }
    P.busy = true;
    try {
      do {
        P.pending = false;
        const item = P.item, sink = P.sink, tok = P.token;
        if (!item || !sink) break;
        const t = previewTime(item);
        let s = null;
        // another file may be picked while this frame loads; then its own request (pending) runs next
        try { s = await sink.getSample(t); } catch (e) { if (tok === P.token) throw e; continue; }
        if (!s || tok !== P.token) { if (s) s.close(); continue; }
        try { await drawSample(s, item); setTc(t, item.info.dur); } finally { s.close(); }
        drawView();
      } while (P.pending);
    } catch (e) {
      setNote('Could not show the preview: ' + errText(e), 'warn');
    } finally { P.busy = false; }
    rvRender();
  }

  // Plays the preview from the timeline position, cleaning each frame as it goes (slower than real
  // time on big videos, never faster).
  // while a preview plays, the cleaning waits between frames so the preview gets the whole machine and plays smoothly
  const previewHold = async () => { while (P.playing && !S.cancel) await sleep(60); };
  function play() {
    const item = P.item;
    if (!item || item.kind !== 'video' || !P.sink || P.playing) return;
    P.playing = true;
    renderTransport();
    P.loop = (async () => {
      while (P.busy) await sleep(16);
      const tok = ++P.token, i = item.info, span = Math.max(0, i.dur - i.first - 1 / i.fps);
      if (S.frac >= 0.995) S.frac = 0;
      const t0 = previewTime(item), wall0 = performance.now();
      try {
        for await (const s of P.sink.samples(t0)) {
          try {
            if (!P.playing || tok !== P.token || !alive) break;
            await drawSample(s, item);
            const t = s.timestamp;
            S.frac = span ? clamp((t - i.first) / span, 0, 1) : 0;
            scrub.value = String(Math.round(S.frac * 1000));
            setTc(t, i.dur);
            drawView();
          } finally { s.close(); }
          const ahead = (s.timestamp - t0) * 1000 - (performance.now() - wall0);
          await new Promise((r) => (ahead > 8 ? setTimeout(r, ahead) : requestAnimationFrame(() => r())));
        }
      } catch (e) {
        if (P.playing && tok === P.token) setNote('Could not play the preview: ' + errText(e), 'warn');
      } finally {
        P.playing = false; P.loop = null;
        if (alive) renderTransport();
      }
    })();
  }

  function viewMode() { return P.item && previewModel(P.item) ? S.view : 'original'; }
  function currentRect() {
    if (drag && drag.rect) return drag.rect;
    const item = P.item;
    if (!item) return null;
    const mm = item.model && item.model.ok ? item.model : null;
    if (mm && mm.engine && mm.kind !== 'image') return rectAtTime(mm, previewTime(item));
    const m = previewModel(item);
    if (m) return m.rect;
    if (item.detected) return item.detected.rect;
    return null;
  }
  // every box shown on the original: the ones drawn for a photo, else the logo's one box
  function currentRects() {
    const it = P.item, out = [];
    if (it && MODE === 'photo' && it.boxes && it.boxes.length) for (const b of it.boxes) out.push(b);
    else { const r = currentRect(); if (r && !(drag && drag.rect)) out.push(r); }
    if (drag && drag.rect) out.push(drag.rect);
    return out;
  }
  // the part of the picture on screen: all of it, or a zoomed-in window (zoom 2 shows half the width, and so on)
  function viewRect() {
    const W = view.width || 1, H = view.height || 1, z = S.zoom, sw = W / z, sh = H / z;
    return { sx: clamp(S.zx * W - sw / 2, 0, W - sw), sy: clamp(S.zy * H - sh / 2, 0, H - sh), sw, sh };
  }
  function setZoom(z, fx, fy) {
    // keep the point under the cursor (fx, fy as fractions of the stage) where it is
    const W = view.width || 1, H = view.height || 1, v = viewRect(), px = v.sx + fx * v.sw, py = v.sy + fy * v.sh;
    S.zoom = clamp(z, 1, 4); S.splitSet = false;
    const sw = W / S.zoom, sh = H / S.zoom;
    S.zx = S.zoom === 1 ? 0.5 : (px - fx * sw + sw / 2) / W; S.zy = S.zoom === 1 ? 0.5 : (py - fy * sh + sh / 2) / H;
    stage.dataset.zoomed = S.zoom > 1 ? '1' : '';
    $('#zoomSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.z === S.zoom)));
    drawView(); rvRender();
  }
  function drawView() {
    if (!P.has) return;
    const model = previewModel(P.item), mode = viewMode(), W = view.width, H = view.height, r = currentRect();
    const vr = viewRect();
    // the compare line starts on the logo (where it is on screen, zoomed or not) until the visitor moves it
    if (r && !S.splitSet) S.split = clamp((r.x + r.w / 2 - vr.sx) / vr.sw, 0.08, 0.92);
    vctx.imageSmoothingEnabled = true; vctx.imageSmoothingQuality = 'high';
    if (mode === 'original') vctx.drawImage(P.orig, vr.sx, vr.sy, vr.sw, vr.sh, 0, 0, W, H);
    else {
      vctx.drawImage(P.proc, vr.sx, vr.sy, vr.sw, vr.sh, 0, 0, W, H);
      const x = Math.round(S.split * W);
      if (mode === 'split' && x > 0) vctx.drawImage(P.orig, vr.sx, vr.sy, vr.sw * x / W, vr.sh, 0, 0, x, H);
    }
    stage.dataset.mode = mode;
    stage.style.setProperty('--split', (S.split * 100).toFixed(2) + '%');
    splitEl.setAttribute('aria-valuenow', String(Math.round(S.split * 100)));
    loupesEl.dataset.empty = r ? '' : '1';
    if (!r) return;
    // close-ups of the same spot, before and after
    const ar = loupeA.width / loupeA.height, sh = Math.min(P.orig.height, Math.round(Math.max(r.h, r.w / ar) * 1.25)), sw = Math.min(P.orig.width, Math.round(sh * ar));
    const sx = clamp(Math.round(r.x + r.w / 2 - sw / 2), 0, P.orig.width - sw), sy = clamp(Math.round(r.y + r.h / 2 - sh / 2), 0, P.orig.height - sh);
    [[loupeA, P.orig], [loupeB, model ? P.proc : P.orig]].forEach(([cv, src]) => {
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    });
    const z = (loupeA.getBoundingClientRect().width || 480) / sw;
    $('#zoomA').textContent = $('#zoomB').textContent = z >= 1.05 ? z.toFixed(1) + '× zoom' : '';
  }

  // ---------- stage + overlay ----------
  let dpr = 1;
  function layoutStage() {
    const avail = stageWrap.clientWidth;
    if (!avail) return;
    const W = view.width || 16, H = view.height || 9;
    const maxH = docked() ? clamp(window.innerHeight - 430, 240, 640) : clamp(window.innerHeight - 290, 220, 720);
    let w = avail, h = w * H / W;
    if (h > maxH) { h = maxH; w = h * W / H; }
    stage.style.width = Math.floor(w) + 'px'; stage.style.height = Math.floor(h) + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(Math.floor(w) * dpr); overlay.height = Math.round(Math.floor(h) * dpr);
  }
  const ro = new ResizeObserver(() => { layoutStage(); drawView(); });
  ro.observe(stageWrap);
  cleanups.push(() => ro.disconnect());
  window.addEventListener('resize', () => { layoutStage(); drawView(); }, { signal });

  let tokens = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    tokens = { mask: cs.getPropertyValue('--mask').trim() || '#CC2156', maskInk: cs.getPropertyValue('--mask-ink').trim() || '#fff' };
  }
  readTokens();

  let drag = null;
  const canDraw = () => CFG.box && !!(P.has && P.item);
  const needsBox = (it) => !!it && phase(it) === 'nologo';
  const boxOn = () => !!canDraw() && (S.boxMode || needsBox(P.item));

  // the box animation runs only while the review window is open
  let overlayRaf = 0;
  function drawOverlay(ts) {
    overlayRaf = 0;
    if (!alive || reviewEl.hidden) return;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    // the logo box shows while drawing one and on the original; the result views stay unmarked
    const rs = P.has && view.width && (boxOn() || viewMode() === 'original') ? currentRects() : [];
    const k = overlay.width / Math.max(1, view.width), dash = 6 * dpr, gap = 4 * dpr, off = reduceMotion ? 0 : -((ts / 45) % (dash + gap));
    const vr = viewRect(), kz = overlay.width / vr.sw;
    rs.forEach((r, n) => {
      const x = Math.round((r.x - vr.sx) * kz) + 0.5, y = Math.round((r.y - vr.sy) * kz) + 0.5, w = Math.round(r.w * kz), h = Math.round(r.h * kz);
      octx.lineWidth = 1.5 * dpr; octx.setLineDash([dash, gap]);
      octx.lineDashOffset = off; octx.strokeStyle = '#FFFFFF'; octx.strokeRect(x, y, w, h);
      octx.lineDashOffset = off + dash; octx.strokeStyle = tokens.mask; octx.strokeRect(x, y, w, h);
      octx.setLineDash([]);
      octx.font = '600 ' + Math.round(12 * dpr) + 'px "Geist Variable", system-ui, sans-serif';
      const label = drag && drag.rect && r === drag.rect ? 'New box' : rs.length > 1 ? 'Logo ' + (n + 1) : 'Logo';
      const tw = octx.measureText(label).width + 10 * dpr, th = 18 * dpr;
      const ly = y - th >= 0 ? y - th : y + h;
      octx.fillStyle = tokens.mask; octx.fillRect(x - 0.5, ly, tw, th);
      octx.fillStyle = tokens.maskInk; octx.textBaseline = 'middle'; octx.fillText(label, x + 4.5 * dpr, ly + th / 2 + 0.5);
    });
    overlayRaf = requestAnimationFrame(drawOverlay);
  }
  const startOverlay = () => { if (!overlayRaf) overlayRaf = requestAnimationFrame(drawOverlay); };
  const stopOverlay = () => { if (overlayRaf) cancelAnimationFrame(overlayRaf); overlayRaf = 0; };

  function toFrame(e) {
    const b = overlay.getBoundingClientRect(), vr = viewRect();
    return { x: clamp(vr.sx + (e.clientX - b.left) * vr.sw / b.width, 0, view.width), y: clamp(vr.sy + (e.clientY - b.top) * vr.sh / b.height, 0, view.height) };
  }
  overlay.addEventListener('pointerdown', (e) => {
    if (!boxOn() || e.button > 0 || (e.shiftKey && S.zoom > 1)) return;
    overlay.setPointerCapture(e.pointerId);
    const p = toFrame(e);
    drag = { start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
    e.preventDefault();
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toFrame(e), s = drag.start;
    drag.rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    drawView();
  });
  function endDrag() {
    if (!drag) return;
    const r = drag.rect; drag = null;
    const min = Math.max(10, view.width / 120);
    if (r.w < min || r.h < min) { drawView(); return; }
    S.boxMode = false;
    requestBox(P.item, evenRect(r, view.width, view.height));
  }
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', () => { drag = null; drawView(); });

  // the compare line follows a drag anywhere on the picture
  let splitDrag = false;
  function splitFrom(e) {
    const b = stage.getBoundingClientRect();
    S.split = clamp((e.clientX - b.left) / b.width, 0, 1); S.splitSet = true;
    drawView();
  }
  // zoomed in: drag the picture to move around it; the wheel zooms where the pointer is
  let pan = null;
  // close to the compare line (or its knob): the line is what is being grabbed, even when zoomed in
  const nearSplit = (e) => { if (viewMode() !== 'split') return false; const b = stage.getBoundingClientRect(); return Math.abs(e.clientX - (b.left + S.split * b.width)) < 30; };
  stage.addEventListener('pointerdown', (e) => {
    const free = boxOn() ? (e.shiftKey || e.button === 1 || e.button === 2) : e.button === 0;
    if (S.zoom > 1 && free && !e.target.closest('#split') && !nearSplit(e)) { pan = { x: e.clientX, y: e.clientY, zx: S.zx, zy: S.zy }; stage.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pan) return;
    const b = stage.getBoundingClientRect(), vr = viewRect();
    S.zx = pan.zx - ((e.clientX - pan.x) / b.width) * vr.sw / view.width; S.zy = pan.zy - ((e.clientY - pan.y) / b.height) * vr.sh / view.height;
    drawView();
  });
  stage.addEventListener('contextmenu', (e) => { if (S.zoom > 1) e.preventDefault(); });
  const endPan = () => { pan = null; };
  stage.addEventListener('pointerup', endPan); stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('wheel', (e) => {
    if (!P.has) return;
    e.preventDefault();
    const b = stage.getBoundingClientRect();
    setZoom(e.deltaY < 0 ? S.zoom * 1.25 : S.zoom / 1.25, clamp((e.clientX - b.left) / b.width, 0, 1), clamp((e.clientY - b.top) / b.height, 0, 1));
    $('#zoomSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.z === S.zoom)));
  }, { passive: false });
  $('#zoomSeg').addEventListener('click', (e) => {
    const x = e.target.closest('button[data-z]'); if (!x) return;
    // zoom toward the logo when there is one (its centre goes to the middle of the picture), else the middle
    const r = currentRect(), W = view.width || 1, H = view.height || 1, z = +x.dataset.z;
    if (z > 1 && r) { S.zoom = 1; S.zx = clamp((r.x + r.w / 2) / W, 0, 1); S.zy = clamp((r.y + r.h / 2) / H, 0, 1); setZoom(z, 0.5, 0.5); S.zx = clamp((r.x + r.w / 2) / W, 0, 1); S.zy = clamp((r.y + r.h / 2) / H, 0, 1); drawView(); }
    else setZoom(z, 0.5, 0.5);
  });
  stage.addEventListener('pointerdown', (e) => {
    if ((S.zoom > 1 && !nearSplit(e)) || boxOn() || viewMode() !== 'split' || e.button > 0) return;
    splitDrag = true; stage.setPointerCapture(e.pointerId); splitFrom(e);
  });
  stage.addEventListener('pointermove', (e) => { if (splitDrag) splitFrom(e); });
  stage.addEventListener('pointerup', () => { splitDrag = false; });
  stage.addEventListener('pointercancel', () => { splitDrag = false; });
  splitEl.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    S.split = clamp(S.split + d, 0, 1); S.splitSet = true; drawView();
  });

  // from a flagged file's panel: jump to the moment where the check looked worst
  logoInfo.addEventListener('click', async (e) => {
    if (!e.target.closest('#goWorst')) return;
    const it = reviewItem();
    if (!it || !it.check || !it.info || !P.has) return;
    const span = Math.max(0, it.info.dur - it.info.first - 1 / it.info.fps);
    S.frac = span ? clamp((it.check.worstT - it.info.first) / span, 0, 1) : 0;
    if (S.view === 'original') S.view = 'split';
    if (P.playing) await stopPlay();
    renderPreview(); rvRender();
  });
  scrub.addEventListener('input', async () => {
    S.frac = +scrub.value / 1000;
    if (P.playing) await stopPlay();
    renderPreview();
  });
  playBtn.addEventListener('click', () => { if (P.playing) stopPlay(); else play(); });
  function stepFrame(dir) {
    const it = P.item;
    if (!it || it.kind !== 'video' || !P.has) return;
    const i = it.info, span = Math.max(1e-6, i.dur - i.first - 1 / i.fps);
    S.frac = clamp(S.frac + dir / (i.fps * span), 0, 1);
    scrub.value = String(Math.round(S.frac * 1000));
    stopPlay().then(renderPreview);
  }
  function renderTransport() {
    const it = P.item, video = !!(it && it.kind === 'video' && P.has);
    scrub.disabled = !video;
    playBtn.disabled = !video;
    playBtn.classList.toggle('is-playing', P.playing);
    playBtn.setAttribute('aria-label', P.playing ? 'Pause preview' : 'Play preview');
  }

  // ---------- the review window ----------
  const reviewItem = () => getItem(S.reviewId);
  let rvOpener = null;
  let rvLocked = false;
  async function openReview(it) {
    if (!it || !it.info || it.removed) return;
    S.reviewId = it.id; S.boxMode = false;
    if (reviewEl.hidden) { rvOpener = docked() ? null : document.activeElement; reviewEl.hidden = false; reviewEl.setAttribute('aria-modal', String(!docked())); if (!docked()) { lockScroll(true); rvLocked = true; } }
    layoutStage(); rvRender(); startOverlay();
    if (!docked()) $('#rvCard').focus({ preventScroll: true });
    try { await openPreview(it); } catch (e) { setNote('Could not open the preview: ' + errText(e), 'warn'); }
    rvRender();
  }
  async function closeReview() {
    if (reviewEl.hidden) return;
    reviewEl.hidden = true; if (rvLocked) { lockScroll(false); rvLocked = false; } stopOverlay();
    S.boxMode = false; drag = null; S.reviewId = null;
    await stopPlay();
    closePreview();
    vctx.clearRect(0, 0, view.width, view.height);
    if (rvOpener && rvOpener.isConnected) { try { rvOpener.focus(); } catch (e) { /* gone */ } }
    rvOpener = null;
    render();
  }
  async function showInReview(next) {
    await stopPlay();
    S.reviewId = next.id; S.boxMode = false; S.splitSet = false;
    rvRender();
    try { await openPreview(next); } catch (e) { setNote('Could not open the preview: ' + errText(e), 'warn'); }
    rvRender();
  }
  async function reviewStep(d) {
    const cur = reviewItem();
    if (!cur) return;
    let i = S.items.indexOf(cur) + d;
    while (S.items[i] && !S.items[i].info) i += d;
    const next = S.items[i];
    if (next) await showInReview(next);
  }
  const stageTagR = $('.tag-r');
  let wasBoxing = false;
  function rvRender() {
    if (reviewEl.hidden) return;
    const it = reviewItem();
    if (!it) return;
    const mode = viewMode(), box = boxOn(), idx = S.items.indexOf(it);
    for (const x of S.items) if (x.card) x.card.el.classList.toggle('is-selected', x.id === it.id);
    rvTitle.textContent = it.name;
    rvMeta.textContent = it.info ? itemMeta(it) : '';
    rvNav.hidden = S.items.length < 2;
    rvCount.textContent = (idx + 1) + ' / ' + S.items.length;
    rvPrev.disabled = idx <= 0; rvNext.disabled = idx >= S.items.length - 1;
    stage.classList.toggle('is-boxing', box);
    if (box && !wasBoxing) stage.scrollIntoView({ block: 'nearest' });
    wasBoxing = box;
    boxHint.hidden = !box || !!drag;
    if (S.zoom > 1 && box) boxHintText.textContent = 'Hold Shift and drag to move the zoomed picture'; else
    boxHintText.textContent = needsBox(it) && !S.boxMode && !BOXED ? 'No logo found. Drag a box around it.' : MODE === 'photo' && it.boxes && it.boxes.length ? 'Drag a box around the next logo' : 'Drag a box around the logo';
    for (const b of [boxBtn, boxBtn2]) { b.disabled = !canDraw(); b.setAttribute('aria-pressed', String(!!S.boxMode)); }
    const boxLabel = S.boxMode ? 'Cancel box' : MODE === 'photo' && it.boxes && it.boxes.length ? 'Add another box' : 'Draw a box';
    boxBtn.querySelector('span').textContent = boxLabel;
    boxBtn2.textContent = boxLabel;
    viewSeg.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.view === mode)); b.disabled = !previewModel(it); });
    const ph = phase(it);
    const afterName = it.status === 'done' && it.result ? 'Result' : 'Preview';
    setText(viewSeg.querySelector('[data-view="result"]'), afterName); setText(stageTagR, afterName);
    stageMsg.hidden = P.has;
    stageMsg.innerHTML = it.status === 'error' ? '<b>Can’t show this file</b><span>' + esc(explain(it).text) + '</span>' : '<b>Opening the preview…</b>';
    pill(ph === 'finding' ? (it.progress < 0.3 ? 'Finding the logo…' : 'Measuring the logo…') : ph === 'queued' ? 'In line to find the logo…' : '');
    // controls that are off say why
    const paused = '';
    playBtn.title = paused; boxBtn.title = paused; boxBtn2.title = paused; redetectBtn.title = paused;
    rvHint.hidden = !(S.busy && P.playing); rvHint.textContent = 'Cleaning pauses while the preview plays, so it stays smooth.';
    redetectBtn.disabled = !it.info || S.busy || ph === 'finding' || (BOXED && !(it.boxes && it.boxes.length) && !it.manual);
    renderTransport();
    renderLogo();
  }
  function logoState(tone, title, text) {
    return '<div class="logo-state ' + tone + '">' + (tone === 'run' ? '<span class="spin"></span>' : '<span class="ico">' + ICON[tone === 'ok' ? 'found' : tone === 'warn' ? 'warn' : 'info'] + '</span>') +
      '<div><b>' + title + '</b>' + (text ? '<span>' + text + '</span>' : '') + '</div></div>';
  }
  function renderLogo() {
    if (reviewEl.hidden) return;
    const it = reviewItem();
    if (!it) { logoInfo.innerHTML = ''; return; }
    const m = it.model, ph = phase(it);
    let html = '';
    if (ph === 'opening' || ph === 'finding' || ph === 'queued') {
      const p = it.progress || 0;
      html = logoState('run', ph === 'queued' ? 'In line to find the logo…' : ph === 'opening' ? 'Opening the file…' : p < 0.3 ? 'Finding the logo…' : 'Measuring the logo…', ph === 'queued' ? 'It starts after the files above.' : 'This takes a few seconds.') +
        (ph === 'finding' ? '<div class="bar"><i style="width:' + (p * 100).toFixed(0) + '%"></i></div>' : '');
    } else if (m && m.ok && it.borrowed) {
      html = logoState('warn', 'Using the first video’s logo settings', 'This video’s own check failed, so the first video’s settings are used. If traces remain, clean this video on its own, or draw a box around its logo.');
    } else if (m && m.ok && m.engine) {
      const done = it.status === 'done';
      const kv = m.engine === 'sora'
        ? '<dt>Where</dt><dd>' + m.intervals.length + (m.intervals.length === 1 ? ' place' : ' places') + ' in the frame · it moves ' + Math.max(0, m.intervals.length - 1) + ' times</dd>' +
          '<dt>Size</dt><dd>' + m.rect.w + '×' + m.rect.h + ' px</dd><dt>Method</dt><dd>rebuilt from other moments and from around it</dd>'
        : m.engine === 'photo'
          ? '<dt>' + (m.rects.length === 1 ? 'Your box' : 'Your boxes') + '</dt><dd>' + m.rects.map((r) => r.w + '×' + r.h + ' at ' + r.x + ', ' + r.y).join('<br>') + '</dd>' +
            '<dt>Method</dt><dd>' + (m.modes.every((x) => x === 'shape') ? 'only the logo’s own pixels rebuilt from around them, then the photo’s grain put back' : m.modes.some((x) => x === 'shape') ? 'the logo’s pixels rebuilt where it could be told apart; the whole box elsewhere' : 'the whole box rebuilt from around it') + '</dd>'
        : '<dt>Your box</dt><dd>x ' + m.rect.x + ' · y ' + m.rect.y + ' · ' + m.rect.w + '×' + m.rect.h + '</dd><dt>Method</dt><dd>' + (m.kind === 'image' ? 'filled in from around it' : 'rebuilt from other frames and from around it') + '</dd>';
      html = logoState(m.engine === 'photo' && m.modes.includes('box') ? 'warn' : 'ok', logoName(m) + (done ? ' removed' : ' found'), m.engine === 'sora'
        ? (done ? 'The picture under it was rebuilt from other moments and from around it.' : 'It moves around the frame, so it is found at every moment. What is under it is gone, so it is rebuilt from other moments and from around it.')
        : m.engine === 'photo'
          ? (m.modes.includes('box') ? 'The logo could not be told apart from the picture here, so the whole box was rebuilt. A tighter box around it gives a cleaner result. Check it before you download.' : 'Only the logo itself was rebuilt, from the picture around it. Look at the close-ups to check it before you download.') + ' Draw another box to remove more.'
        : 'This is not a logo the tool knows, so what is under it is rebuilt from other frames and from around it. Check the result before you download.') +
        '<details class="details"><summary>Technical details</summary><dl class="kv">' + kv + '</dl></details>';
    } else if (m && m.ok) {
      const opaque = m.kind !== 'image' && m.max >= C.OPAQUE;
      const kv = m.kind === 'image'
        ? '<dt>Position</dt><dd>x ' + m.rect.x + ' · y ' + m.rect.y + ' · logo ' + Math.round(m.size) + ' px</dd>' +
          '<dt>Opacity</dt><dd>max ' + Math.round(m.max * 100) + '%</dd>' +
          '<dt>Method</dt><dd>known logo shape, fitted to this photo and reversed</dd>'
        : '<dt>Position</dt><dd>x ' + m.rect.x + ' · y ' + m.rect.y + ' · ' + m.rect.w + '×' + m.rect.h + '</dd>' +
          '<dt>Opacity</dt><dd>mean ' + Math.round(m.mean * 100) + '% · max ' + Math.round(m.max * 100) + '%</dd>' +
          '<dt>Method</dt><dd>' + (m.method === 'template' ? (m.planeAlpha ? 'known logo shape, matched to this video pixel by pixel' : 'known logo shape (still background)') : 'learned from the video') + '</dd>' +
          '<dt>Analysed</dt><dd>' + m.frames + ' frames · ' + (m.mode === 'yuv' ? 'YUV, no colour conversion' : 'RGB') + '</dd>' +
          (m.resp ? '<dt>Dark scenes</dt><dd>extra correction on (from ' + m.resp.frames + ' frames)</dd>' : '');
      const ck = it.status === 'done' ? it.check : null;
      const verdict = ck && ck.level !== 'ok'
        ? logoState('warn', ck.level === 'bad' ? 'Needs a look' : 'Please check', (ck.core > 0 ? 'A trace of the logo may be left' : 'The spot may look a little dark') + ' around ' + mmss(ck.worstT - it.info.first) + '.') + '<button type="button" class="btn-soft sm go-worst" id="goWorst">Go to that moment</button>'
        : '';
      html = (verdict || logoState('ok', logoName(m) + (ck ? ' removed' : ' found'), ck ? 'Checked after cleaning: nothing of it is left behind.' : (it.manual ? 'Your box. ' : '') + (opaque ? 'Parts of it are fully solid; those pixels are filled in from around them.' : 'It is see-through, so the real picture underneath is restored.'))) +
        '<details class="details"><summary>Technical details</summary><dl class="kv">' + kv + '</dl></details>';
    } else if (m && !m.ok) {
      html = logoState('warn', 'No logo in that box', 'Draw a slightly bigger box around it.');
    } else if (ph === 'error') {
      html = logoState('warn', it.info ? 'Couldn’t clean this file' : 'Can’t open this file', esc(explain(it).text));
    } else {
      html = MODE === 'sora' ? logoState('warn', 'No Sora watermark found', esc(it.msg && !/^No Sora/.test(it.msg) ? it.msg : 'This video does not seem to carry one. If it does, it may be too faint or too small to find.'))
        : BOXED ? logoState('warn', it.manual ? 'That spot could not be cleaned' : 'Choose the logo to remove', it.manual ? 'Draw the box again, a little bigger.' : 'Click “Draw a box”, then drag a rectangle around the logo, a little bigger than it.')
        : logoState('warn', it.manual ? 'No logo in that box' : 'No logo found', 'Click “Draw a box”, then drag a rectangle around it, a little bigger than the logo.');
    }
    logoInfo.innerHTML = html;
  }

  // ---------- questions before something is lost ----------
  let askDone = null;
  function ask({ title, text, yes, no = 'Cancel', danger = false }) {
    return new Promise((res) => {
      cfTitle.textContent = title; cfText.textContent = text; cfYes.textContent = yes; cfNo.textContent = no;
      cfYes.classList.toggle('danger', danger);
      const prev = document.activeElement;
      confirmEl.hidden = false; lockScroll(true);
      cfNo.focus();
      askDone = (v) => {
        askDone = null; confirmEl.hidden = true; lockScroll(false);
        cfYes.onclick = cfNo.onclick = cfBackdrop.onclick = null;
        if (prev && prev.isConnected) { try { prev.focus(); } catch (e) { /* gone */ } }
        res(v);
      };
      cfYes.onclick = () => askDone(true); cfNo.onclick = () => askDone(false); cfBackdrop.onclick = () => askDone(false);
    });
  }
  // true when it is fine to go on
  async function okToLose(what) {
    const n = unsavedItems().length;
    if (!n) return true;
    return ask({ title: 'Download your files first?', text: 'You have ' + plural(n, 'finished file', 'finished files') + ' that you haven’t downloaded yet. ' + what + ' will delete ' + (n === 1 ? 'it' : 'them') + '.', yes: 'Delete anyway', no: 'Go back', danger: true });
  }
  function leaveWarning() {
    if (S.busy) return 'Files are still being processed. Leave and stop?';
    const n = unsavedItems().length;
    return n ? 'You have ' + plural(n, 'finished file', 'finished files') + ' that you haven’t downloaded yet. Leave anyway?' : '';
  }

  // ---------- adding files ----------
  const isImgFile = (f) => isImageFile(f);
  const keyOf = (f) => f.name + '|' + f.size + '|' + f.lastModified;
  function addFiles(list, source) {
    const all = [...list];
    const files = all.filter((f) => (CFG.videos && isVideoFile(f)) || (CFG.images && isImgFile(f)));
    const ignored = all.length - files.length;
    const KIND = CFG.videos && CFG.images ? 'videos or photos' : CFG.images ? 'photos' : 'videos', EXT = CFG.videos && CFG.images ? 'MP4, MOV, WebM or PNG, JPG, WebP' : CFG.images ? 'PNG, JPG or WebP' : 'MP4, MOV or WebM';
    if (!files.length) { setNote(source === 'folder' ? 'There are no ' + KIND + ' in that folder.' : 'No ' + KIND + ' found. Add ' + EXT + ' files.', 'warn'); return; }
    const have = new Set(S.items.map((i) => i.key)), fresh = [];
    let dupes = 0;
    for (const f of files) { const k = keyOf(f); if (have.has(k)) { dupes++; continue; } have.add(k); fresh.push(f); }
    const notes = [];
    if (ignored) notes.push(source === 'folder' ? plural(ignored, 'other file', 'other files') + ' in the folder ' + (ignored === 1 ? 'was' : 'were') + ' left out.' : plural(ignored, 'file is', 'files are') + ' not ' + (CFG.videos && CFG.images ? 'a video or photo' : CFG.images ? 'a photo' : 'a video') + ' and ' + (ignored === 1 ? 'was' : 'were') + ' left out.');
    if (dupes) notes.push(plural(dupes, 'file was', 'files were') + ' already in the list.');
    setNote(notes.filter(Boolean).join(' '), notes.some(Boolean) ? 'warn' : '');
    for (const file of fresh) {
      const it = { id: nextId++, key: keyOf(file), file, name: file.name, size: file.size, kind: isVideoFile(file) ? 'video' : 'image', status: 'new', progress: 0, info: null, model: null, detected: null, result: null, msg: '', thumb: null, runId: S.busy ? S.runId : 0, saved: false };
      S.items.push(it);
      ensureCard(it);
    }
    if (fresh.length) { S.stopped = false; render(); intake(); announce(plural(fresh.length, 'file', 'files') + ' added'); }
  }
  // files from a drop, folders included (the entries must be read before the event ends)
  async function filesFromDrop(dt) {
    const entries = [];
    if (dt.items) for (const item of dt.items) { if (item.kind === 'file' && item.webkitGetAsEntry) { const e = item.webkitGetAsEntry(); if (e) entries.push(e); } }
    if (!entries.some((e) => e.isDirectory)) return { files: [...dt.files], folder: false };
    const out = [];
    const walk = async (entry, depth) => {
      if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
      else if (entry.isDirectory && depth < 8) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const e of batch) await walk(e, depth + 1);
        } while (batch.length);
      }
    };
    for (const e of entries) { try { await walk(e, 0); } catch (err) { /* an unreadable item is skipped */ } }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { files: out, folder: true };
  }

  async function intake() {
    if (S.intake) return;
    S.intake = true;
    try {
      for (;;) {
        const it = S.items.find((x) => !x.removed && !x.info && x.status === 'new');
        if (!it) break;
        it.status = 'probing'; updItem(it); renderBar();
        try { await (it.kind === 'image' ? probeImage(it) : probe(it)); it.status = 'ready'; } catch (e) { it.status = 'error'; it.msg = errText(e); }
        updItem(it);
        if (it.info && !it.removed) await makeThumb(it);
        ensureLead();
        render();
        pump();
      }
    } finally { S.intake = false; }
  }
  // the first video is the lead: the others look for the logo where it found it
  function ensureLead() {
    const ok = (i) => i.info && i.status !== 'error' && !i.removed;
    const cur = refItem();
    const lead = (cur && ok(cur) && (cur.kind === 'video' || !S.items.some((i) => ok(i) && i.kind === 'video')) ? cur : null)
      || S.items.find((i) => ok(i) && i.kind === 'video') || S.items.find(ok) || null;
    const id = lead ? lead.id : null;
    if (id === S.refId) return;
    S.refId = id; S.rectRel = null;
    for (const o of S.items) if (o !== lead && o.kind === 'video' && !o.manual && o.status === 'ready') { o.model = null; o.borrowed = false; o.msg = ''; o.cuHas = false; updItem(o); }
  }

  // ---------- finding each file's logo (one file at a time, in the background) ----------
  // A video that follows the lead file: its own logo when "same spot" is off (or the lead is a photo
  // or a Veo clip), else the lead's spot and exact position, measured in this video.
  // ---------- looking at a few frames around the logo (to check things, never to change them) ----------
  // Calls fn(img, rr, t) with the luma of the area around the sparkle for n frames spread over the video. With a
  // model the frame is first cleaned in memory exactly as it will be written, so a model can be judged before
  // anything is encoded. `src` is the file (the original, or a finished result).
  async function lookAt(src, info, g, n, fn, model) {
    const { w: W, h: H } = info, pr = C.placeTemplate(GEMINI, g.x, g.y, g.s, W, H).rect;
    const x0 = Math.max(0, pr.x - 8), y0 = Math.max(0, pr.y - 8), rr = { x: x0, y: y0, w: Math.min(W, pr.x + pr.w + 8) - x0, h: Math.min(H, pr.y + pr.h + 8) - y0 };
    const rd = model ? unionRect(rr, model.rect) : rr;
    const input = openInput(src);
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return 0;
      const t0 = (await track.getFirstTimestamp()) - info.first; // a finished file starts at its own zero
      const sink = new MB.VideoSampleSink(track), holder = {}, ts = stamps(info, n).map((t) => t + t0);
      let done = 0;
      for await (const s of sink.samplesAtTimestamps(ts)) {
        if (S.cancel) break;
        if (!s) continue;
        try {
          const fr = await readFrame(s, rd, holder);
          if (model && fr.W === model.W && fr.H === model.H) {
            const pms = planeModels(model, fr);
            fr.planes.forEach((p, i) => C.restorePlane(p, pms[i]));
          }
          const p = fr.planes[fr.mode === 'yuv' ? 0 : 1], img = new Float32Array(rr.w * rr.h);
          for (let j = 0; j < rr.h; j++) for (let i = 0; i < rr.w; i++) img[j * rr.w + i] = p.data[p.off + (rr.y + j) * p.stride + (rr.x + i) * p.step];
          await fn(img, rr, s.timestamp - t0, p.white);
          done++;
        } finally { s.close(); }
      }
      if (S.cancel) throw uerr('Stopped.');
      return done;
    } finally { try { input.dispose(); } catch (e) { /* closed */ } }
  }
  const unionRect = (a, b) => { const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const median = (v) => { const a = v.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };

  // Is the sparkle really in this video? The engine's own test, run on a few frames at the given place:
  // taking the logo away there must take the edge along its outline away (a ratio well under 1).
  // Over 1 means nothing is there, and removing it would only leave a dark sparkle behind.
  async function sparkleRatio(it, g, onP) {
    const vals = [];
    await lookAt(it.file, it.info, g, 8, (img, rr, t, white) => {
      const Lw = white === 255 ? (GEMINI.L - 16) * 255 / 219 : GEMINI.L;
      vals.push(C.logoPresence(img, rr.w, rr.h, GEMINI, g.x - rr.x, g.y - rr.y, g.s, Lw));
      if (onP) onP(vals.length / 8);
    });
    return median(vals);
  }
  // What is left along the sparkle's outline: a few pixels inside it minus the same distance outside it. Where the
  // logo is gone cleanly the picture simply continues (about 0); a bright step means a trace of it is left, a dark
  // one means too much was taken away (a dark sparkle). The middle value of the whole outline, so what happens to
  // pass behind it, or a striped background, does not matter. k is the distance in pixels.
  function outlineStep(img, rr, g, k) {
    const rect = C.placeTemplate(GEMINI, g.x - rr.x, g.y - rr.y, g.s, rr.w, rr.h).rect, c = new Float32Array(rect.w * rect.h);
    for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) c[j * rect.w + i] = img[(rect.y + j) * rr.w + rect.x + i];
    const b = C.outlineSetup([c], rect, GEMINI, g.x - rr.x, g.y - rr.y, g.s).band, w = rect.w, n = c.length;
    if (b.length < 4 * 20) return null;
    const st = [];
    for (let u = 0; u < b.length; u += 4) {
      const q = b[u], d = b[u + 1] - q, dy = Math.round(d / w), dx = d - dy * w, a = q + k * (dy * w + dx), o = q - k * (dy * w + dx);
      const xa = q % w + k * dx, xo = q % w - k * dx;
      if (a < 0 || o < 0 || a >= n || o >= n || xa < 0 || xa >= w || xo < 0 || xo >= w) continue;
      st.push(c[a] - c[o]);
    }
    return st.length >= 20 ? median(st) : null;
  }
  // The outline step over a few frames of `src` (cleaned in memory first when a model is given).
  async function traceCheck(src, info, g, model, n = 8) {
    const frames = [], k = Math.max(3, Math.round(4 * g.s));
    await lookAt(src, info, g, n, (img, rr, t) => { const v = outlineStep(img, rr, g, k); if (v != null) frames.push({ t, core: v }); }, model);
    if (!frames.length) return null;
    return { core: median(frames.map((f) => f.core)), frames };
  }
  // ---------- checking the outcome: before it is encoded, and again on the finished file ----------
  const CORE_OK = 5;     // a removal that leaves no more than this (in brightness levels) behind is clean (good ones measure 0 to 2)
  const CORE_LOOK = 12;  // more than this is plainly wrong (a dark sparkle measures about -21, a logo left in place +55)
  const usualPlace = (info) => { const sx = info.w / 1920, sy = info.h / 1080; return { x: (1739.431 + 0.5) * sx - 0.5, y: (899.555 + 0.5) * sy - 0.5, s: Math.min(sx, sy) }; };
  // Where the sparkle sits, when the model is the sparkle's template (else there is nothing to compare with).
  const sparklePlace = (model) => (model && model.ok && model.gemini && model.align && model.align.score >= 0 ? { x: model.align.x, y: model.align.y, s: model.align.s } : null);
  const coreOf = async (it, model, g, n) => { const r = await traceCheck(it.file, it.info, g, model, n); return r ? r.core : null; };
  const noop = () => {};
  // Before the long encode: clean a few frames in memory and see what would be left. When something would,
  // try the other ways of measuring this logo and keep the one that leaves the least.
  async function vetModel(it) {
    it.check = null; it.checkG = null; it.retried = ''; it.vetFirst = it.vetBest = null;
    if (it.kind !== 'video' || !it.model || !it.model.ok) return false;
    const g = sparklePlace(it.model);
    if (!g) return false;            // a Veo mark, or a shape learned from the video: nothing known to compare with
    it.checkG = g;
    const first = await coreOf(it, it.model, g, 6);
    it.vetFirst = it.vetBest = first;
    if (first == null || Math.abs(first) <= CORE_OK) return false;
    let best = { model: it.model, core: first, why: '' };
    const tries = [
      ['its own search', async () => { const d = await detectLogo(it, noop); return d ? learn(it, d.rect, noop, d.tmpl) : null; }],
      ['learned from this video', () => learn(it, it.model.rect, noop, null)],
    ];
    for (const [why, make] of tries) {
      if (Math.abs(best.core) <= CORE_OK) break;
      let m = null;
      try { m = await make(); } catch (e) { if (S.cancel || (e && e.userMsg === 'Stopped.')) throw e; continue; }
      if (!m || !m.ok) continue;
      const c = await coreOf(it, m, g, 6);
      if (c != null && Math.abs(c) < Math.abs(best.core) * 0.6) best = { model: m, core: c, why };
    }
    it.retried = best.why; it.vetBest = best.core;
    if (best.model !== it.model) { it.model = best.model; return true; }
    return false;
  }
  // After the encode: look at the finished file the same way. This is what the card and the bar report.
  async function verifyResult(it) {
    it.check = null;
    if (it.kind !== 'video' || !it.result || !it.checkG) return;
    const r = await traceCheck(it.result, it.info, it.checkG, null, 8);
    if (!r) return;
    const mag = Math.abs(r.core), worst = r.frames.reduce((a, f) => (Math.abs(f.core) > Math.abs(a.core) ? f : a), r.frames[0]);
    it.check = { level: mag <= CORE_OK ? 'ok' : mag <= CORE_LOOK ? 'look' : 'bad', core: r.core, worstT: worst.t, retried: it.retried };
  }
  // Over this the sparkle is not there (the videos that have it measure under 1.2, the ones that don't over 17).
  const SPARKLE_ABSENT = 4;
  async function followModel(it, ref, onP) {
    let rect = null, guess = null, vetted = false;
    if ((!S.sameRect || !S.rectRel || ref.kind === 'image' || (ref.model && ref.model.veo)) && it !== ref) {
      const d = await detectLogo(it, (p) => onP(p * 0.3));
      if (d) { rect = d.rect; guess = d.tmpl; }
    }
    if (!rect && !S.rectRel) return { model: null, borrowed: false };
    if (!rect) {
      rect = fromRel(S.rectRel, it.info.w, it.info.h);
      // the first video's exact logo position, carried over to this frame size
      const ra = ref.model && ref.model.gemini && ref.model.align;
      if (ra) {
        const sx = it.info.w / ref.info.w, sy = it.info.h / ref.info.h;
        guess = { x: (ra.x + 0.5) * sx - 0.5, y: (ra.y + 0.5) * sy - 0.5, s: ra.s * Math.min(sx, sy), usual: !!(ref.detected && ref.detected.tmpl && ref.detected.tmpl.usual) };
        rect = C.placeTemplate(GEMINI, guess.x, guess.y, guess.s, it.info.w, it.info.h).rect;
        // The first video's spot is only a good guess. A video that has no sparkle there (one that was
        // cleaned already, or never had one) would be "cleaned" into a dark sparkle, so check first, and
        // otherwise let the video look for its own logo.
        const ratio = await sparkleRatio(it, guess, (p) => onP(p * 0.15));
        if (ratio != null && ratio > SPARKLE_ABSENT && ratio < Infinity) {
          const d = await detectLogo(it, (p) => onP(0.15 + p * 0.15));
          if (!d) return { model: null, borrowed: false };
          rect = d.rect; guess = d.tmpl;
        } else vetted = true;
      }
    }
    const model = await learn(it, rect, (p) => onP(0.3 + p * 0.7), guess);
    if (!model.ok && ref.model && ref.model.ok && ref.model.W === it.info.w && ref.model.H === it.info.h && S.sameRect) return { model: ref.model, borrowed: true, vetted };
    return { model, borrowed: false, vetted };
  }
  // The one place a file's logo is measured: photos, the lead video, a video with a hand-drawn box, and followers.
  // A logo that was found is only kept when the sparkle is really in the video. A video that was cleaned
  // already (or never had one) can still fit the logo's shape faintly, and removing it would leave a dark sparkle.
  // A box drawn by hand is taken as it is: the person says the logo is there.
  async function sparkleSeen(it, model) {
    if (!(model && model.ok && model.gemini && model.align && model.align.score >= 0)) return true;
    const ratio = await sparkleRatio(it, { x: model.align.x, y: model.align.y, s: model.align.s });
    return ratio == null || ratio === Infinity || ratio <= SPARKLE_ABSENT;
  }
  // the other removers: a Sora video is searched for its (moving) watermark; for any other logo the person draws a box
  async function measureOther(it, manualRect, onP) {
    if (MODE === 'sora') {
      if (it.kind !== 'video') return { model: null, msg: 'The Sora watermark is on videos. Add a video.' };
      const m = await soraDetect(it, onP);
      if (!m || !m.ok) return { model: null, msg: 'No Sora watermark found' };
      return { model: m, msg: '', detected: { rect: m.rect, confidence: null, manual: false, gemini: false, tmpl: null }, rect: m.rect };
    }
    if (!manualRect) return { model: null, msg: 'Draw a box around the logo you want removed.' };
    if (MODE === 'photo') {
      if (it.kind !== 'image') return { model: null, msg: 'This tool is for photos. Add a PNG, JPG or WebP file.' };
      const model = await PH.removeBoxes(it, manualRect, onP);
      return { model, msg: model ? '' : 'That spot could not be filled in', detected: { rect: model ? model.rect : manualRect[0], confidence: null, manual: true, gemini: false, tmpl: null }, rect: model ? model.rect : manualRect[0] };
    }
    const det = { rect: manualRect, confidence: null, manual: true, gemini: false, tmpl: null };
    if (it.kind === 'image') {
      const model = await SR.logoImage(it, manualRect);
      return { model, msg: model ? '' : 'That spot could not be filled in', detected: det, rect: manualRect };
    }
    const model = await logoPrepare(it, manualRect, onP);
    return { model, msg: model && model.ok ? '' : 'That spot could not be read', detected: det, rect: manualRect };
  }
  async function measure(it, manualRect, onP, spotGuess) {
    if (OTHER) return measureOther(it, manualRect, onP);
    if (it.kind === 'image') {
      const model = await analyzeImage(it, manualRect);
      return { model, msg: model ? '' : manualRect ? 'No sparkle logo fits inside this box' : 'No logo found automatically' };
    }
    const ref = refItem();
    if (!manualRect && ref && it !== ref) {
      const r = await followModel(it, ref, onP);
      if (r.model && !r.vetted && !(await sparkleSeen(it, r.model))) return { model: null, borrowed: false, msg: 'No logo found automatically' };
      return { model: r.model, borrowed: r.borrowed, msg: r.model ? '' : 'No logo found automatically' };
    }
    let rect = manualRect, det = null;
    if (!rect) {
      det = await detectLogo(it, (p) => onP(p * 0.3));
      if (!det) return { model: null, msg: 'No logo found automatically' };
      rect = det.rect;
    }
    const detected = { rect, confidence: det ? det.confidence : null, manual: !!manualRect, gemini: !!(det && det.tmpl && !det.tmpl.veo), tmpl: det && det.tmpl };
    const model = await learn(it, rect, (p) => onP(0.3 + p * 0.7), (det && det.tmpl) || spotGuess || null);
    // a drawn box is taken as it is; a confirmed suggestion (the usual spot) is still checked
    if ((!manualRect || spotGuess) && !(await sparkleSeen(it, model))) return { model: null, msg: 'No logo found automatically' };
    return { model, msg: '', detected, rect };
  }
  function applyMeasure(it, r, manualRect) {
    it.manual = !!manualRect;
    it.model = r.model; it.msg = r.msg || ''; it.detected = r.detected || null; it.borrowed = !!r.borrowed;
    if (!(it.model && it.model.ok)) it.cuHas = false;
    if (!OTHER && it.kind === 'video' && it.id === S.refId && r.rect) {
      S.rectRel = toRel(r.rect, it.info.w, it.info.h);
      // the others follow the lead's box, so drop what they measured for the old one
      for (const o of S.items) if (o !== it && o.kind === 'video' && !o.manual && o.status === 'ready' && !o.removed) { o.model = null; o.borrowed = false; o.msg = ''; o.cuHas = false; updItem(o); }
    }
  }
  const idleWaiters = [];
  const waitAnalyzing = () => (S.analyzing ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());
  const progressTick = (fn) => { let last = 0; return (p) => { const now = performance.now(); if (p < 1 && now - last < 90) return; last = now; fn(p); }; };

  async function analyzeOne(it, manualRect, guess) {
    if (S.analyzing || (S.busy && !S.encNow) || it.removed || !it.info) return;
    S.analyzing = true;
    it.status = 'analyzing'; it.stage = 0; it.msg = ''; it.progress = 0; it.borrowed = false;
    updItem(it); renderBar(); rvRender();
    let r = null;
    try {
      r = await measure(it, manualRect, progressTick((p) => { it.progress = p; updItem(it); renderLogo(); }), guess);
    } catch (e) {
      if (!(e && e.userMsg === 'Stopped.')) it.msg = errText(e);
    }
    it.status = 'ready'; S.cancel = false;
    if (!it.removed) {
      if (r) applyMeasure(it, r, manualRect);
      else { it.model = null; it.detected = null; }
    }
    // the card shows the outcome at once; its close-up pictures follow a moment later
    updItem(it); render();
    if (!it.removed) announce(it.name + ': ' + (it.model && it.model.ok ? logoName(it.model) + ' found' : it.msg && !it.model ? 'could not be checked' : 'no logo found'));
    if (P.item === it && !it.removed) { S.splitSet = false; renderPreview(); }
    if (!it.removed && it.model && it.model.ok) await makeCloseups(it, 'preview');
    S.analyzing = false;
    render();
    while (idleWaiters.length) idleWaiters.shift()();
  }
  function nextToAnalyze() {
    const ok = (it) => !it.removed && it.info && it.status === 'ready';
    const mine = S.items.find((it) => ok(it) && it.boxReq);
    if (mine) return mine;
    const lead = refItem();
    if (lead && ok(lead) && !lead.model && !lead.msg) return lead;
    return S.items.find((it) => ok(it) && !it.model && !it.msg) || null;
  }
  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (alive && (!S.busy || (S.encNow && !S.cancel && !P.playing)) && !S.analyzing) {
        const it = nextToAnalyze();
        if (!it) break;
        const rect = it.boxReq || null, guess = it.boxGuess || null; it.boxReq = null; it.boxGuess = null;
        await analyzeOne(it, rect, guess);
        maybeAutoRun();
      }
    } finally { pumping = false; maybeAutoRun(); }
  }
  // Cleaning starts by itself as soon as a logo has been found: nobody has to press a button. Files whose
  // logo was not found wait for a box. After Stop it waits for Continue (or for new files).
  function maybeAutoRun() {
    if (!alive || S.busy || S.stopped || S.analyzing) return;
    if (!S.items.some((i) => isRunnable(i) && i.model && i.model.ok)) return;
    runAll();
  }
  // a hand-drawn box for one file; it is measured as soon as its turn comes
  function requestBox(it, rect, guess) {
    if (!it || !it.info || it.removed || it.status === 'encoding' || it.status === 'learning') return;
    if (S.busy) it.runId = S.runId;
    if (MODE === 'photo') {
      // each new box is added to the ones before it; the photo is cleaned again with all of them
      it.boxes = (it.boxes || []).concat([rect]); rect = it.boxes.slice();
      if (it.status === 'done') { it.result = null; it.saved = false; it.status = 'ready'; }
    }
    it.model = null; it.msg = ''; it.borrowed = false; it.cuHas = false; it.boxReq = rect; it.boxGuess = guess || null; it.skipped = false; it.check = null; it.checkG = null; it.retried = '';
    updItem(it); render(); pump();
  }
  function retryItem(it) {
    if (!it || S.busy || it.removed) return;
    it.msg = ''; it.model = null; it.detected = null; it.borrowed = false; it.manual = false; it.cuHas = false; it.boxReq = null; it.boxes = null; it.skipped = false; it.check = null; it.checkG = null; it.retried = '';
    if (!it.info) { it.status = 'new'; updItem(it); render(); intake(); return; }
    if (it.status === 'done' || it.status === 'error') { it.result = null; it.saved = false; }
    it.status = 'ready';
    updItem(it); render(); pump();
  }

  // ---------- removing the logo ----------
  let wake = null;
  // the screen stays on while files are processed, so a laptop doesn't fall asleep mid-way
  async function keepAwake(on) {
    try {
      if (on && !wake && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) { wake = null; }
  }
  // the tab title shows progress, so it can be followed from another tab
  const OUR_TITLE = /^(\d+% · |✓ Done · )/;
  const plainTitle = () => document.title.replace(OUR_TITLE, '');
  function setTitle(prefix) { document.title = prefix + plainTitle(); }
  function restoreTitle() { if (OUR_TITLE.test(document.title)) document.title = plainTitle(); }

  const isRunnable = (it) => !it.removed && it.info && it.status === 'ready' && (it.model ? it.model.ok : !it.msg);
  function runProgress() {
    let W = 0, D = 0;
    for (const it of S.items) {
      if (it.runId !== S.runId || it.removed) continue;
      if (it.status === 'error' || phase(it) === 'nologo' || phase(it) === 'skipped') continue;
      const w = weight(it);
      W += w;
      D += w * (it.status === 'done' ? 1 : it.status === 'encoding' ? clamp(it.progress, 0, 1) : 0);
    }
    return W ? D / W : 0;
  }
  // frames being cleaned, drawn into the card as they go (a preview only: the output never depends on it)
  function liveFor(it) {
    const c = it.card;
    if (!c || !it.model || it.model.engine) return null;
    const g = cuGeom(it.model.rect, it.info.w, it.info.h), lctx = c.live.getContext('2d'), cr = coverRect(it.info.w, it.info.h, c.live.width / c.live.height);
    it.liveOn = true;
    const dctx = (cv) => cv.getContext('2d');
    return {
      // what a worker needs to draw the pictures, and what to do with the bitmaps it hands back
      spec: { g, cu: [CU_W, CU_H], th: [c.live.width, c.live.height], cr },
      draw: (m) => {
        if (it.removed) { m.b.close(); m.a.close(); m.t.close(); return; }
        dctx(c.b).drawImage(m.b, 0, 0); dctx(c.a).drawImage(m.a, 0, 0); lctx.drawImage(m.t, 0, 0);
        m.b.close(); m.a.close(); m.t.close();
        it.cuHas = true;
      },
      // the same pictures, drawn here, when the work is done on this thread
      local: (s, out) => {
        if (it.removed) return;
        cuDraw(s, c.b, g, true); cuDraw(out, c.a, g, true);
        out.draw(lctx, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, c.live.width, c.live.height);
        it.cuHas = true;
      },
    };
  }

  async function runAll() {
    if (S.busy) return;
    S.busy = true; S.cancel = false; S.stopped = false; S.stopping = false; S.runId++; S.runT0 = performance.now(); S.eta = null; S.lastSecs = 0; S.runDid = 0;
    for (const it of S.items) { it.stopped = false; if (isTodo(it)) it.runId = S.runId; }
    announce('Removing the logo from ' + plural(S.items.filter((i) => i.runId === S.runId).length, 'file', 'files'));
    await stopPlay();
    keepAwake(true);
    render();
    const t0 = performance.now(), verifyJobs = [];
    try {
      await waitAnalyzing();
      for (;;) {
        if (S.cancel) break;
        // a file being looked at in the background is waited for rather than measured twice
        const it = S.items.find((x) => isRunnable(x) && (x.model || !S.analyzing));
        if (!it) {
          // files that were still being opened (or looked at) when the run got to the end of the list
          if (S.analyzing || S.items.some((x) => !x.removed && (x.status === 'new' || x.status === 'probing'))) { await sleep(120); continue; }
          break;
        }
        it.runId = S.runId;
        // a file the background queue hasn't reached yet is measured right here
        if (!it.model) {
          const rect = it.boxReq || null, guess = it.boxGuess || null; it.boxReq = null; it.boxGuess = null;
          it.status = 'learning'; it.stage = 0; it.progress = 0; updItem(it); updTotal();
          try {
            applyMeasure(it, await measure(it, rect, progressTick((p) => { it.progress = p; updItem(it); }), guess), rect);
          } catch (e) {
            if (S.cancel || (e && e.userMsg === 'Stopped.')) { it.status = 'ready'; it.progress = 0; it.stopped = true; updItem(it); break; }
            it.status = 'error'; it.msg = errText(e); updItem(it); updTotal();
            continue;
          }
          it.status = 'ready';
          if (!(it.model && it.model.ok)) { updItem(it); updTotal(); continue; }
          await makeCloseups(it, 'preview');
        }
        if (it.kind === 'video') {
          // see what the model would leave behind before spending the time to encode with it
          it.status = 'learning'; it.stage = 1; it.progress = 0.1; updItem(it); updTotal();
          try {
            if (await vetModel(it)) await makeCloseups(it, 'preview');
          } catch (e) {
            if (S.cancel || (e && e.userMsg === 'Stopped.')) { it.status = 'ready'; it.progress = 0; it.stopped = true; updItem(it); break; }
            // a check that fails never stops the cleaning
          }
        } else { it.check = null; it.checkG = null; }
        it.status = 'encoding'; it.stage = 2; it.progress = it.kind === 'image' ? 0.5 : 0; it.encT0 = performance.now(); it.fps = 0;
        const live = it.kind === 'video' ? liveFor(it) : null;
        updItem(it); render(); updTotal();
        try {
          if (it.kind === 'image') it.result = await encodeImage(it);
          else { S.encNow = true; pump(); it.result = await convert(it, it.model, progressTick((p) => { it.progress = p; updItem(it); updTotal(); }), live, previewHold).finally(() => { S.encNow = false; }); }
          it.status = 'done'; it.msg = ''; it.doneQuality = S.quality; it.saved = false; it.progress = 1; S.runDid++;
          it.liveOn = false; it.verifying = it.kind === 'video' && !!it.checkG; updItem(it); updTotal();
          if (OTHER && P.item === it && !P.playing) { S.splitSet = false; renderPreview(); }   // the preview of these engines is the finished file
          announce(it.name + ' is finished');
          // the finished file is checked and its pictures are shown before anything else is started
          try { await verifyResult(it); } catch (e) { it.check = null; }
          it.verifying = false; updItem(it); updTotal();
          if (it.check && it.check.level !== 'ok') announce(it.name + ' needs a look');
          await makeCloseups(it, 'result');
        } catch (e) {
          it.liveOn = false;
          if (S.cancel || (MB.ConversionCanceledError && e instanceof MB.ConversionCanceledError)) { it.status = 'ready'; it.msg = ''; it.progress = 0; it.result = null; it.stopped = true; updItem(it); break; }
          it.status = 'error'; it.msg = errText(e); it.result = null;
          announce(it.name + ' could not be cleaned');
        }
        updItem(it); updTotal();
      }
    } finally {
      await Promise.all(verifyJobs);
      S.lastSecs = Math.round((performance.now() - t0) / 1000);
      S.busy = false; S.stopped = S.cancel; S.stopping = false;
      keepAwake(false);
      if (S.cancel) announce('Stopped. ' + plural(S.runDid, 'file', 'files') + ' finished and kept.');
      else if (!S.runDid && !counts().error) setNote('No file could be cleaned. Open a file and draw a box around its logo.', 'warn');
      else if (S.runDid) announce('All done. ' + plural(S.runDid, 'file', 'files') + ' ready to download.');
      if (S.runDid && document.visibilityState === 'hidden') setTitle('✓ Done · '); else restoreTitle();
      S.cancel = false;
      for (const it of S.items) it.liveOn = false;
      render();
      pump();
    }
  }
  function cancelAll() {
    if (S.stopping) return;
    S.cancel = true; S.stopping = true;
    if (S.conv) S.conv.cancel().catch(() => {});
    pool.cancel();
    renderBar();
    for (const it of S.items) if (it.status === 'encoding' || it.status === 'learning') updItem(it);
    announce('Stopping');
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (S.busy) keepAwake(true);
    else setTimeout(() => { if (!S.busy) restoreTitle(); }, 2500);
  }, { signal });

  // ---------- downloads ----------
  async function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
  }
  const outName = (it) => baseName(it.name) + '-clean.' + (it.kind === 'image' ? (it.result && it.result.type === 'image/jpeg' ? 'jpg' : 'png') : 'mp4');

  // Store-only ZIP (videos are already compressed, so deflate would gain nothing).
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  async function crc32(blob) {
    let c = 0xFFFFFFFF;
    const step = 8 << 20;
    for (let o = 0; o < blob.size; o += step) {
      const u = new Uint8Array(await blob.slice(o, o + step).arrayBuffer());
      for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8);
      await idle();
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function makeZip(entries) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const used = new Set();
    for (const { name, blob } of entries) {
      let nm = name, k = 2;
      while (used.has(nm)) nm = name.replace(/(\.[^.]+)?$/, '-' + k++ + '$1');
      used.add(nm);
      const nb = enc.encode(nm), crc = await crc32(blob), size = blob.size;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true);
      lh.setUint32(22, size, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nb, blob);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nb.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, nb);
      offset += 30 + nb.length + size;
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength || p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }
  async function saveAll() {
    const done = doneItems();
    if (!done.length || S.zipping) return;
    if (done.length === 1) { saveBlob(done[0].result, outName(done[0])); done[0].saved = true; updItem(done[0]); renderBar(); return; }
    const total = done.reduce((s, i) => s + i.result.size, 0);
    if (total > 3.9 * 1073741824) { setNote('Together the files are over 4 GB, too big for one ZIP. Download them one by one from their cards.', 'warn'); return; }
    S.zipping = true; renderBar();
    try {
      await saveBlob(await makeZip(done.map((i) => ({ name: outName(i), blob: i.result }))), 'clearframe-files.zip');
      done.forEach((i) => { i.saved = true; updItem(i); });
    } catch (e) { setNote('The ZIP could not be built: ' + errText(e), 'warn'); }
    finally { S.zipping = false; renderBar(); }
  }
  // redo the finished files, e.g. after the quality was changed
  function redoDone() {
    if (S.busy) return;
    for (const it of S.items) if (it.status === 'done') { it.status = 'ready'; it.result = null; it.saved = false; it.progress = 0; it.cuKind = 'preview'; it.check = null; it.stripHas = false; }
    render();
    runAll();
  }

  // ---------- the file cards ----------
  const CARD_HTML =
    '<div class="job-media"><button type="button" class="job-thumb" data-act="review" aria-label="Review this file">' +
      '<img class="th-img" alt="" hidden><span class="th-ph"></span><canvas class="th-live" width="320" height="180" hidden></canvas>' +
      '<span class="th-badge"></span><span class="th-live-tag" hidden>Live</span><span class="th-hover">Review</span></button></div>' +
    '<div class="job-body">' +
      '<div class="job-head"><span class="job-name"></span><button type="button" class="icon-btn" data-act="remove" aria-label="Remove from the list">' + ICON.x + '</button></div>' +
      '<div class="job-meta"></div>' +
      '<div class="job-status"><span class="js-ico"></span><span class="js-text"><b></b><span></span></span></div>' +
      '<ol class="steps" hidden><li>Find</li><li>Check</li><li>Remove</li><li>Verify</li></ol>' +
      '<div class="job-bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" hidden><i></i></div>' +
      '<div class="job-foot">' +
        '<div class="cu" hidden><figure><canvas class="cu-b" width="' + CU_W + '" height="' + CU_H + '"></canvas><figcaption class="cu-b-cap">Before</figcaption></figure>' +
          '<span class="cu-arrow">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>' + '</span>' +
          '<figure><canvas class="cu-a" width="' + CU_W + '" height="' + CU_H + '"></canvas><figcaption class="cu-a-cap">After</figcaption></figure></div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn-soft sm" data-act="review">Review</button>' +
          '<button type="button" class="cta cta-sm" data-act="yes">Yes, remove it</button>' +
          '<button type="button" class="btn-soft sm" data-act="skip">Nothing to remove</button>' +
          '<button type="button" class="btn-soft sm" data-act="box">Draw a box</button>' +
          '<button type="button" class="btn-soft sm" data-act="retry">Try again</button>' +
          '<button type="button" class="cta cta-sm" data-act="download">' + ICON.save + '<span>Download</span></button>' +
        '</div></div></div>';
  function ensureCard(it) {
    if (it.card) return it.card;
    const li = document.createElement('li');
    li.className = 'job'; li.dataset.id = it.id;
    li.innerHTML = CARD_HTML;
    const q = (s) => li.querySelector(s);
    it.card = {
      el: li, img: q('.th-img'), ph: q('.th-ph'), live: q('.th-live'), badge: q('.th-badge'), liveTag: q('.th-live-tag'),
      name: q('.job-name'), meta: q('.job-meta'), ico: q('.js-ico'), stWrap: q('.js-text'), stT: q('.js-text b'), stS: q('.js-text span'), bar: q('.job-bar'), barI: q('.job-bar i'),
      cuWrap: q('.cu'), b: q('.cu-b'), a: q('.cu-a'), aCap: q('.cu-a-cap'), bCap: q('.cu-b-cap'),
      steps: [...li.querySelectorAll('.steps li')], stepsEl: q('.steps'), thumbBtn: q('.job-thumb'), removeBtn: q('[data-act="remove"]'),
      review: q('.job-actions [data-act="review"]'), yes: q('[data-act="yes"]'), skip: q('[data-act="skip"]'), box: q('[data-act="box"]'), retry: q('[data-act="retry"]'), download: q('[data-act="download"]'), downloadLabel: q('[data-act="download"] span'),
    };
    // the finished video's before and after at three moments, so it can be judged without opening anything
    const strip = document.createElement('div');
    strip.className = 'strip'; strip.hidden = true;
    const figs = [0, 1, 2].map(() => {
      const f = document.createElement('figure');
      f.innerHTML = '<figcaption></figcaption><div class="st-pair"><canvas class="st-b" width="' + CU_W + '" height="' + CU_H + '"></canvas><canvas class="st-a" width="' + CU_W + '" height="' + CU_H + '"></canvas></div><span class="st-lbl"><i>Before</i><i>After</i></span>';
      strip.appendChild(f);
      return { cap: f.querySelector('figcaption'), b: f.querySelector('.st-b'), a: f.querySelector('.st-a') };
    });
    li.querySelector('.job-foot').insertBefore(strip, li.querySelector('.job-actions'));
    it.card.strip = { el: strip, figs };
    it.card.name.textContent = it.name; it.card.name.title = it.name;
    it.card.thumbBtn.setAttribute('aria-label', 'Review ' + it.name);
    it.card.ph.innerHTML = ICON[it.kind];
    return it.card;
  }
  const setText = (el, t) => { if (el._t !== t) { el._t = t; el.textContent = t; } };
  const setHtml = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };
  function itemMeta(it) {
    if (!it.info) return fmtMB(it.size);
    const i = it.info;
    if (it.kind === 'image') return i.w + '×' + i.h + ' · ' + fmtMB(it.size);
    return i.w + '×' + i.h + ' · ' + (i.dur - i.first).toFixed(1) + 's · ' + Math.round(i.fps) + 'fps · ' + fmtMB(it.size);
  }
  // The words for one file, the same everywhere: opening → in line → finding → logo found / no logo found →
  // waiting in line → removing → finished (or can't open / couldn't clean).
  // finding the logo, checking and removing it are one loading: 0-25% find, 25-30% check, 30-100% remove
  const shownP = (it) => { const p = clamp(it.progress || 0, 0, 1); return it.verifying ? 0.97 : it.stage === 1 ? 0.27 : it.stage === 2 || it.status === 'encoding' ? 0.3 + p * 0.65 : it.status === 'analyzing' || it.status === 'learning' ? p * 0.25 : p; };
  const STAGE_TITLE = ['Finding the logo…', 'Checking before removing…', 'Removing the logo…', 'Checking the result…'];
  const stageOf = (it) => (it.verifying ? 3 : it.status === 'encoding' ? 2 : it.stage || 0);
  function statusOf(it, ph) {
    const p = clamp(it.progress || 0, 0, 1);
    switch (ph) {
      case 'opening': return { tone: 'run', title: 'Opening the file…', sub: '' };
      case 'queued': return { tone: 'idle', title: 'In line to find the logo', sub: '' };
      case 'finding': return { tone: 'run', title: STAGE_TITLE[0], sub: pct(shownP(it)) };
      case 'ready':
        if (S.busy && it.runId === S.runId) return { tone: 'idle', title: 'Waiting in line', sub: 'Starts after the file above' };
        if (it.stopped) return { tone: 'idle', icon: 'stop', title: 'Stopped before it finished', sub: 'It will start again from the beginning' };
        if (it.borrowed) return { tone: 'warn', title: 'Using the first video’s logo settings', sub: 'This video’s own check failed. If traces remain, clean it on its own.' };
        return { tone: 'ok', icon: 'found', title: logoName(it.model) + ' found', sub: (S.stopped ? 'Paused · press Continue to clean it' : 'Cleaning starts by itself') + (it.manual ? ' · your box' : '') };
      case 'nologo':
        if (MODE === 'sora') return { tone: 'idle', icon: 'info', title: 'No Sora watermark found', sub: it.msg && !/^No Sora/.test(it.msg) ? it.msg : 'This video does not seem to carry one.' };
        if (BOXED) return { tone: 'warn', icon: 'info', title: it.manual ? 'That spot could not be cleaned' : 'Choose the logo to remove', sub: it.manual ? it.msg || 'Draw the box again, a little bigger.' : 'Open Review and drag a box around it.' };
        if (it.manual) return { tone: 'warn', title: 'No logo in that box', sub: 'Draw a slightly bigger box around it.' };
        return { tone: 'idle', icon: 'info', title: 'No logo found', sub: 'It may already be clean. If you can see a logo, point it out.' };
      case 'skipped': return { tone: 'idle', icon: 'info', title: 'Left as it is', sub: 'Nothing to remove. Draw a box if you change your mind.' };
      case 'working': return { tone: 'run', title: S.stopping ? 'Stopping…' : STAGE_TITLE[it.kind === 'image' ? 2 : stageOf(it)], sub: it.kind === 'image' ? '' : pct(shownP(it)) };
      case 'done': {
        const size = fmtMB(it.result ? it.result.size : 0), tail = it.saved ? ' · downloaded' : ' · ready to download', ck = it.check;
        if (it.verifying) return { tone: 'run', title: STAGE_TITLE[3], sub: size };
        if (ck && ck.level !== 'ok') {
          const bright = ck.core > 0;
          return {
            tone: 'warn', icon: 'warn', flag: true, title: ck.level === 'bad' ? 'Finished · needs a look' : 'Finished · please check',
            sub: size + ' · ' + (bright ? (ck.level === 'bad' ? 'part of the logo may still show' : 'a faint trace of the logo may be left') : (ck.level === 'bad' ? 'a dark patch may be left where the logo was' : 'the spot may look a little dark')) + tail,
            tip: 'Open Review to see the worst moment.',
          };
        }
        return { tone: 'ok', title: 'Finished', sub: size + (ck ? ' · checked, nothing left behind' : '') + tail };
      }
      default: { const e = explain(it); return { tone: 'bad', title: it.info ? 'Couldn’t clean this file' : 'Can’t open this file', sub: e.text, tip: e.raw }; }
    }
  }
  function updItem(it) {
    const c = it.card;
    if (!c || it.removed) return;
    const ph = phase(it), s = statusOf(it, ph);
    c.el.dataset.phase = ph; c.el.dataset.tone = s.tone;
    setText(c.meta, itemMeta(it));
    if (it.thumb && c.img.dataset.s !== '1') { c.img.src = it.thumb; c.img.dataset.s = '1'; c.img.hidden = false; c.ph.hidden = true; }
    setText(c.badge, it.kind === 'image' ? 'Photo' : it.info ? 'Video · ' + (it.info.dur - it.info.first).toFixed(1) + ' s' : 'Video');
    setHtml(c.ico, ICON[s.icon || (s.tone === 'run' ? 'spin' : s.tone === 'ok' ? 'ok' : s.tone === 'idle' ? 'clock' : 'warn')]);
    setText(c.stT, s.title); setText(c.stS, s.sub); c.stS.hidden = !s.sub; c.stWrap.title = s.tip || '';
    const showSteps = ph === 'finding' || ph === 'working' || !!it.verifying;
    c.stepsEl.hidden = !showSteps || it.kind === 'image';
    if (showSteps) { const k = stageOf(it); c.steps.forEach((el, i) => { el.className = i < k ? 'done' : i === k ? 'now' : ''; }); }
    const barOn = ph === 'finding' || ph === 'working';
    c.bar.hidden = !barOn;
    if (barOn) { const v = (shownP(it) * 100).toFixed(1); c.barI.style.width = v + '%'; c.bar.setAttribute('aria-valuenow', String(Math.round(+v))); }
    const asking = CFG.ask && ph === 'nologo' && !it.manual && !!it.askHas;
    const strip = ph === 'done' && it.kind === 'video' && !!it.stripHas && !it.verifying;
    c.strip.el.hidden = !strip;
    c.cuWrap.hidden = strip || !((it.cuHas && (ph === 'ready' || ph === 'working' || ph === 'done')) || asking);
    c.cuWrap.classList.toggle('ask', asking);
    setText(c.bCap, asking ? 'Is the logo here?' : 'Before');
    setText(c.aCap, ph === 'working' ? 'After (live)' : ph === 'done' && it.cuKind === 'result' ? 'After (result)' : 'After (preview)');
    const live = !!it.liveOn && ph === 'working';
    c.live.hidden = !live; c.liveTag.hidden = !live;
    c.review.hidden = !it.info || ph === 'error';
    c.review.classList.toggle('primary', !!s.flag);
    const firstAsk = CFG.ask && ph === 'nologo' && !it.manual;
    c.yes.hidden = !(firstAsk && it.suggest);
    c.skip.hidden = !firstAsk;
    c.box.hidden = !CFG.box || !(ph === 'nologo' || ph === 'skipped');
    c.box.classList.toggle('primary', ph === 'nologo' && !firstAsk);
    c.retry.hidden = !(ph === 'error' || (ph === 'nologo' && !firstAsk && !BOXED) || (ph === 'ready' && it.borrowed));
    c.yes.disabled = c.retry.disabled = S.busy; c.box.disabled = false;
    c.yes.title = c.retry.title = S.busy ? 'Available when the files being cleaned are finished' : '';
    setText(c.retry, ph === 'error' ? 'Try again' : 'Check again');
    c.download.hidden = ph !== 'done';
    setText(c.downloadLabel, it.saved ? 'Download again' : 'Download');
    c.removeBtn.disabled = S.busy && (ph === 'working' || ph === 'queued' || ph === 'ready' || ph === 'opening');
    c.removeBtn.title = c.removeBtn.disabled ? 'Stop first to change the list' : 'Remove from the list';
  }
  function reconcileCards() {
    for (const li of [...jobsEl.children]) if (!S.items.some((it) => it.card && it.card.el === li)) li.remove();
    S.items.forEach((it, idx) => {
      const c = ensureCard(it), at = jobsEl.children[idx];
      if (at !== c.el) jobsEl.insertBefore(c.el, at || null);
      updItem(it);
      if (CFG.ask && phase(it) === 'nologo' && !it.manual && it.info && !it.askHas && !it.askBusy) makeAsk(it);
    });
  }

  // ---------- the page ----------
  let autoOpening = false;
  const dockWatch = new ResizeObserver(() => {
    const on = roomNow() >= DOCK_MIN;
    if (on === dockOn) return;
    dockOn = on; root.dataset.room = on ? 'wide' : 'narrow';
    if (!docked() && !reviewEl.hidden) closeReview(); else render();
  });
  dockWatch.observe(pageBox);
  cleanups.push(() => dockWatch.disconnect());
  // where the files are, at a glance
  function renderPipe() {
    const c = counts(), fin = doneItems(), flagged = fin.filter((i) => i.check && i.check.level !== 'ok').length;
    const parts = [['', 'Waiting', c.opening + c.queued + c.finding + c.ready], ['on', 'Working', c.working], ['ok', 'Clean', fin.length - flagged], ['warn', 'To check', flagged], ['warn', 'Needs you', c.nologo + c.error]];
    const html = parts.filter((x) => x[2] > 0).map(([k, l, n]) => '<span class="' + k + '">' + l + ' <b>' + n + '</b></span>').join('');
    const shown = parts.filter((x) => x[2] > 0).length;
    pipeEl.hidden = S.items.length < 2 || shown < 2;
    setHtml(pipeEl, html);
  }
  function render() {
    const has = S.items.length > 0;
    document.documentElement.dataset.busy = S.busy ? '1' : '';   // the page's ads wait while a file is being cleaned
    welcomeEl.hidden = has; jobArea.hidden = !has; barEl.hidden = !has;
    studioEl.classList.toggle('on', has); studioEl.classList.toggle('docked', docked());
    reconcileCards();
    renderPipe();
    if (has && docked() && reviewEl.hidden && !autoOpening) {
      const pick = S.items.find((i) => i.info && i.status !== 'error' && !i.removed) || null;
      if (pick) { autoOpening = true; openReview(pick).finally(() => { autoOpening = false; }); }
    }
    fileCount.textContent = has ? String(S.items.length) : '';
    filesTotal.textContent = has ? fmtMB(S.items.reduce((s, x) => s + x.size, 0)) : '';
    clearBtn.disabled = S.busy;
    renderOptions();
    renderBar();
    rvRender();
  }
  function renderOptions() {
    for (const b of [qMax, wqMax]) b.setAttribute('aria-pressed', String(S.quality === 'max'));
    for (const b of [qHigh, wqHigh]) b.setAttribute('aria-pressed', String(S.quality === 'high'));
    const vid = refItem() && refItem().kind === 'video' && refItem().info ? refItem() : S.items.find((i) => i.kind === 'video' && i.info);
    qMax.disabled = qHigh.disabled = S.busy || !vid;
    const videos = S.items.filter((i) => i.kind === 'video').length;
    sameRow.hidden = videos < 2 || !CFG.same;
    sameRectEl.disabled = S.busy;
    optSum.textContent = !videos ? 'Photos keep their format' : (S.quality === 'max' ? 'Best quality' : 'Smaller files') + (videos > 1 && !S.sameRect ? ' · each video on its own' : '');
    qMax.title = qHigh.title = S.busy ? 'Available when no file is being processed' : !vid ? 'Applies to videos' : '';
    clearBtn.title = S.busy ? 'Stop first to clear the list' : '';
    if (!vid) {
      qNote.textContent = S.items.length ? 'Photos keep their format: a PNG stays lossless and a JPEG stays a high-quality JPEG.' : '';
      return;
    }
    const b = targetBitrate(vid.info, S.quality), d = vid.info.dur - vid.info.first;
    qNote.textContent = 'About ' + fmtMB((b + 192000) * d / 8) + (videos > 1 ? ' for the first video' : '') + '. Every frame, the frame rate and the audio stay as they were.';
    qNote.title = 'Changing pixels means re-encoding the video; extra bitrate keeps the difference invisible. ' + fmtMbps(vid.info.bitrate) + ' now → about ' + fmtMbps(b) + ' after.';
  }
  const fmtEta = (s) => (s < 8 ? 'Almost done' : s < 60 ? 'About ' + Math.max(10, Math.round(s / 5) * 5) + ' s left' : s < 5400 ? 'About ' + Math.round(s / 60) + ' min left' : 'About ' + (s / 3600).toFixed(1) + ' h left');
  function updTotal() {
    if (!S.busy) return;
    const p = runProgress();
    abFill.style.width = (p * 100).toFixed(1) + '%';
    setText(abPct, pct(p));
    renderStepper();
    const runItems = S.items.filter((i) => i.runId === S.runId && i.status !== 'error' && phase(i) !== 'nologo' && phase(i) !== 'skipped' && !i.removed);
    const cur = S.items.find((i) => i.status === 'encoding' || i.status === 'learning');
    if (cur && cur.kind === 'video' && cur.status === 'encoding' && cur.encT0 && cur.progress > 0.02) {
      const secs = (performance.now() - cur.encT0) / 1000, frames = (cur.info.dur - cur.info.first) * cur.info.fps;
      if (secs > 0.5) cur.fps = Math.round((cur.progress * frames) / secs);
    }
    const el = (performance.now() - S.runT0) / 1000;
    let eta = 'Estimating the time…';
    if (p > 0.02 && el > 3) {
      const raw = (el * (1 - p)) / p;
      S.eta = S.eta == null ? raw : S.eta * 0.85 + raw * 0.15;
      eta = fmtEta(S.eta);
    }
    const n = runItems.length, k = Math.min(n, runItems.filter((i) => i.status === 'done').length + 1);
    let title = 'Removing the logo', sub;
    if (S.stopping) { title = 'Stopping…'; sub = 'Finishing the file in progress'; }
    else if (!cur && S.analyzing) { title = 'Starting…'; sub = 'Finishing the logo search first'; }
    else sub = (n > 1 ? 'File ' + k + ' of ' + n + ' · ' : '') + eta;
    setText(abTitle, title); setText(abSub, sub);
    abTitle.title = cur && cur.fps ? 'Speed: about ' + cur.fps + ' frames a second' : '';
    setTitle(pct(p) + ' · ');
  }
  function setBar(o) {
    barEl.dataset.state = o.live ? 'running' : o.primary && o.primary.act === 'run' ? 'ready' : o.primary && o.primary.act === 'save' ? 'done' : 'idle';
    abIcon.className = 'ab-icon ' + (o.tone || ''); setHtml(abIcon, o.icon || '');
    setText(abTitle, o.title); abPct.hidden = !o.pct;
    if (!o.live) setText(abSub, o.sub || '');
    abProgress.hidden = !o.live;
    abPrimary.hidden = !o.primary;
    if (o.primary) {
      abPrimary.disabled = !!o.primary.disabled; abPrimary.dataset.act = o.primary.act; abPrimary.classList.toggle('is-busy', !!o.primary.busy);
      setText(abPrimaryLabel, o.primary.label); setHtml($('#abPrimaryIcon'), o.primary.icon || ''); abPrimary.title = o.primary.tip || '';
    }
    abMore.hidden = !o.more; abMore.disabled = !!S.zipping;
    abSecondary.hidden = !o.secondary;
    if (o.secondary) { abSecondary.dataset.act = o.secondary.act; abSecondary.disabled = !!o.secondary.disabled; abSecondary.innerHTML = (o.secondary.icon || '') + '<span></span>'; abSecondary.lastChild.textContent = o.secondary.label; }
  }
  // what is wrong with the files that will not be cleaned, in a few words
  function issueParts(c) {
    const out = [], open = S.items.filter((i) => i.status === 'error' && !i.info && !i.removed).length, clean = c.error - open;
    if (c.nologo) out.push('no logo found in ' + plural(c.nologo, 'file', 'files'));
    if (open) out.push(open === 1 ? '1 file can’t be opened' : open + ' files can’t be opened');
    if (clean) out.push(clean === 1 ? '1 file couldn’t be cleaned' : clean + ' files couldn’t be cleaned');
    return out;
  }
  const spanText = (s) => (s < 90 ? s + ' s' : Math.round(s / 60) + ' min');
  function renderBar() { renderBarCore(); renderStepper(); }
  // where the visitor is (add files, clean, download) and the one thing to do next
  function renderStepper() {
    const has = S.items.length > 0, c = counts(), todo = c.opening + c.queued + c.finding + c.ready;
    let n = 1, hint = 'Drop your files anywhere on this page.', all = false;
    if (has) {
      const fin = doneItems(), flagged = fin.filter((i) => i.check && i.check.level !== 'ok').length;
      if (c.done && !todo && !S.busy) { n = 3; all = true; hint = flagged ? '<b>Done.</b> Have a look at the amber ' + (flagged === 1 ? 'card' : 'cards') + ' before you download.' : c.done > 1 ? '<b>All done.</b> Download your files, all together as one ZIP.' : '<b>Done.</b> Download your file.'; }
      else if (S.busy) { n = 2; hint = '<b>Cleaning</b> · ' + pct(runProgress()) + ' · you can add more files while it runs.'; }
      else if (BOXED && c.nologo) { n = 2; hint = '<b>Drag a box</b> around the logo on the preview. It is removed as soon as you let go.'; }
      else if (c.opening || c.queued || c.finding) { n = 2; hint = 'Looking at your ' + (S.items.length === 1 ? 'file' : 'files') + '…'; }
      else { n = 2; hint = todo ? 'Cleaning starts by itself.' : c.nologo ? 'No logo was found in some files. Point it out or leave it.' : 'Nothing to clean yet.'; }
    }
    root.querySelectorAll('#stepper .st').forEach((li) => {
      const k = +li.dataset.s;
      li.classList.toggle('is-done', k < n || (all && k === 3));
      li.classList.toggle('is-now', k === n && !(all && k === 3));
      if (k === n && !(all && k === 3)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const h = $('#stepHint'); if (h.innerHTML !== hint) h.innerHTML = hint;
  }
  function renderBarCore() {
    if (!S.items.length) return;
    const c = counts(), done = c.done, todo = c.opening + c.queued + c.finding + c.ready, issues = issueParts(c);
    if (S.busy) {
      setBar({ tone: 'run', icon: ICON.spin, title: 'Removing the logo', pct: true, live: true, secondary: { act: 'stop', label: S.stopping ? 'Stopping…' : 'Stop', icon: ICON.stop, disabled: S.stopping } });
      updTotal();
      return;
    }
    const stale = S.items.some((i) => i.status === 'done' && i.doneQuality && i.doneQuality !== S.quality);
    const sizeDone = fmtMB(doneItems().reduce((s, i) => s + i.result.size, 0));
    const saved = unsavedItems().length === 0;
    const took = S.lastSecs ? 'took ' + spanText(S.lastSecs) : '';
    if (done && !todo) {
      // every finished file was looked at again after it was written: say so, and say which ones to look at
      const fin = doneItems(), flagged = fin.filter((i) => i.check && i.check.level !== 'ok').length, verified = fin.every((i) => i.check && i.check.level === 'ok');
      const title = flagged ? plural(done, 'file', 'files') + ' done · ' + flagged + ' to check'
        : issues.length ? plural(done, 'file', 'files') + ' done'
        : verified ? (done === 1 ? 'Your file is clean' : 'All clean') : done === 1 ? 'Your file is done' : 'All done';
      setBar({
        tone: flagged ? 'warn' : 'ok', icon: flagged ? ICON.warn : ICON.ok, title,
        sub: [flagged ? 'Open the amber ' + (flagged === 1 ? 'card' : 'cards') + ' to see what to look at' : '', plural(done, 'file', 'files') + ' · ' + sizeDone, took, saved ? 'downloaded' : '', ...issues].filter(Boolean).join(' · '),
        primary: { act: 'save', label: saved ? (done === 1 ? 'Download again' : 'Download all again (ZIP)') : done === 1 ? 'Download' : 'Download all (ZIP)', icon: ICON.save, disabled: S.zipping, busy: S.zipping },
        secondary: stale ? { act: 'redo', label: 'Redo in ' + (S.quality === 'max' ? 'best quality' : 'smaller files'), icon: ICON.redo } : { act: 'startover', label: 'Start over' },
        more: true,
      });
      if (S.zipping) setText(abPrimaryLabel, 'Building the ZIP…');
      return;
    }
    if (done && todo) {
      setBar({
        tone: S.stopped ? 'warn' : 'ok', icon: S.stopped ? ICON.stop : ICON.ok, title: S.stopped ? 'Stopped' : done + ' of ' + (done + todo) + ' files done',
        sub: S.stopped ? [plural(done, 'file', 'files') + ' finished and kept', todo + ' left', ...issues].join(' · ') : [todo + ' still to clean', ...issues].join(' · '),
        primary: { act: 'run', label: (S.stopped ? 'Continue with ' : 'Clean ') + (S.stopped ? plural(todo, 'file', 'files') : plural(todo, 'more file', 'more files')), icon: S.stopped ? ICON.play : ICON.wand },
        secondary: { act: 'save', label: done === 1 ? 'Download the finished file' : 'Download ' + done + ' finished files', icon: ICON.save, disabled: S.zipping },
      });
      return;
    }
    if (todo) {
      const waiting = c.opening + c.queued + c.finding, label = 'Clean ' + plural(todo, 'file', 'files');
      if (S.stopped) {
        setBar({ tone: 'warn', icon: ICON.stop, title: 'Stopped', sub: ['Nothing was lost', plural(todo, 'file', 'files') + ' left', ...issues].join(' · '), primary: { act: 'run', label: 'Continue with ' + plural(todo, 'file', 'files'), icon: ICON.play } });
        return;
      }
      if (c.ready && (S.analyzing || pumping)) {
        // a logo was just found; its pictures are being made and the cleaning starts right after
        setBar({ tone: 'run', icon: ICON.spin, title: 'Getting your ' + (todo === 1 ? 'file' : 'files') + ' ready…', sub: ['Logo found · starting now', ...issues].join(' · ') });
        return;
      }
      if (waiting && !c.ready) {
        const checked = c.ready + c.nologo, n = todo + c.nologo;
        setBar({
          tone: 'run', icon: ICON.spin, title: 'Getting your ' + (todo === 1 ? 'file' : 'files') + ' ready…',
          sub: [c.opening && !c.finding && !c.queued ? 'Opening your ' + (todo === 1 ? 'file' : 'files') : 'Finding the logo in file ' + Math.min(n, checked + 1) + ' of ' + n, 'cleaning starts by itself', ...issues].join(' · '),
        });
        return;
      }
      const first = S.items.find((i) => phase(i) === 'ready');
      const found = waiting ? 'Still checking ' + waiting + ' more' : todo === 1 ? logoName(first && first.model) + ' found' : issues.length ? 'Logo found in ' + todo + ' files' : 'Logo found in all ' + todo + ' files';
      setBar({
        tone: waiting ? 'run' : 'ok', icon: waiting ? ICON.spin : ICON.found,
        title: todo === 1 ? 'Ready to clean' : todo + ' files ready',
        sub: [found, ...issues].join(' · '),
        primary: { act: 'run', label, icon: ICON.wand, tip: 'Removes the logo from every frame and gets the files ready to download. The previews above are only samples.' },
      });
      return;
    }
    setBar({
      tone: 'idle', icon: ICON.info, title: c.nologo ? (MODE === 'sora' ? 'No Sora watermark found' : BOXED ? 'Choose the logo to remove' : 'No logo found') : 'Nothing to clean',
      sub: c.nologo ? (MODE === 'sora' ? 'Nothing was changed. These videos do not seem to carry the Sora watermark.' : BOXED ? 'Open a file and drag a box around the logo. It is removed as soon as you let go.' : 'Nothing was changed. It may already be clean; if you can see a logo, point it out on the card.') : c.skipped ? 'Every file was left as it is.' : 'Remove the files that can’t be opened, or add others.',
    });
  }
  function pill(text) { stagePill.hidden = !text; stagePillText.textContent = text || ''; }
  // A message under the bar (or on the start page). It dismisses itself after a few seconds and has a close button.
  let noteTimer = 0;
  function setNote(text, kind) {
    clearTimeout(noteTimer);
    noteEl.textContent = text || '';
    noteBox.className = 'note' + (kind ? ' is-' + kind : '');
    noteBox.hidden = !text;
    welcomeNote.textContent = text || '';
    welcomeNote.className = 'msg' + (kind ? ' is-' + kind : '');
    welcomeNote.hidden = !text;
    if (text) noteTimer = setTimeout(() => setNote(''), kind === 'warn' ? 12000 : 7000);
  }
  // what a screen reader should hear when something changes that is not focused
  let announceTimer = 0;
  function announce(text) {
    srStatus.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { srStatus.textContent = text; }, 80);
  }

  // ---------- events ----------
  jobsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) {
      const row = e.target.closest('.job');
      if (row && docked() && !e.target.closest('summary, a, button')) { const x = getItem(+row.dataset.id); if (x && x.info && x.id !== S.reviewId) showInReview(x); }
      return;
    }
    const it = getItem(+btn.closest('[data-id]').dataset.id);
    if (!it) return;
    switch (btn.dataset.act) {
      case 'review': openReview(it); break;
      case 'download': if (it.result) { saveBlob(it.result, outName(it)); it.saved = true; updItem(it); renderBar(); } break;
      case 'retry': retryItem(it); break;
      case 'yes': if (it.suggest) requestBox(it, it.suggest, it.suggestGuess); break;
      case 'skip': it.skipped = true; it.model = null; updItem(it); render(); announce(it.name + ' is left as it is'); break;
      case 'box': await openReview(it); if (canDraw()) { S.boxMode = true; rvRender(); } break;
      case 'remove': removeItem(it); break;
    }
  });
  async function removeItem(it) {
    if (S.busy && ['working', 'queued', 'ready', 'opening'].includes(phase(it))) return;
    if (it.status === 'done' && !it.saved && !(await ask({ title: 'Remove this file?', text: it.name + ' is finished but not downloaded yet. Removing it deletes the result.', yes: 'Remove', no: 'Keep it', danger: true }))) return;
    if (!S.items.includes(it)) return;
    it.removed = true; // a search for its logo that is already under way just finishes; the result is dropped
    S.items = S.items.filter((i) => i !== it);
    if (it.card) it.card.el.remove();
    if (it.bmp && it.bmp.close) { try { it.bmp.close(); } catch (e) { /* closed */ } }
    if (S.reviewId === it.id) { const near = S.items.find((i) => i.info); if (near) await showInReview(near); else await closeReview(); }
    ensureLead();
    render(); pump();
  }
  async function clearAll() {
    if (S.busy || !S.items.length) return;
    if (!(await okToLose('Clearing the list'))) return;
    await closeReview();
    for (const it of S.items) it.removed = true;
    S.items = []; S.refId = null; S.rectRel = null; S.boxMode = false; S.lastSecs = 0; S.stopped = false;
    jobsEl.innerHTML = '';
    setNote('');
    restoreTitle();
    render();
  }
  clearBtn.addEventListener('click', clearAll);
  noteClose.addEventListener('click', () => setNote(''));
  barEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    switch (btn.dataset.act) {
      case 'run': runAll(); break;
      case 'save': saveAll(); break;
      case 'stop': cancelAll(); break;
      case 'redo': redoDone(); break;
      case 'startover': clearAll(); break;
      case 'more': pickFiles(); break;
    }
  });
  const toggleBox = () => { if (!canDraw()) return; S.boxMode = !S.boxMode; rvRender(); };
  boxBtn.addEventListener('click', toggleBox);
  boxBtn2.addEventListener('click', toggleBox);
  redetectBtn.addEventListener('click', () => { const it = reviewItem(); if (it) retryItem(it); });
  viewSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b || b.disabled) return;
    S.view = b.dataset.view; drawView(); rvRender();
  });
  for (const b of [qMax, wqMax]) b.addEventListener('click', () => { S.quality = 'max'; render(); });
  for (const b of [qHigh, wqHigh]) b.addEventListener('click', () => { S.quality = 'high'; render(); });
  sameRectEl.addEventListener('change', () => {
    S.sameRect = sameRectEl.checked;
    for (const o of S.items) if (o.kind === 'video' && o !== refItem() && !o.manual && o.status === 'ready') { o.model = null; o.borrowed = false; o.msg = ''; o.cuHas = false; }
    render(); pump();
  });
  rvClose.addEventListener('click', closeReview);
  rvBackdrop.addEventListener('click', closeReview);
  rvPrev.addEventListener('click', () => reviewStep(-1));
  rvNext.addEventListener('click', () => reviewStep(1));

  // adding files: buttons, drops (folders too), paste
  const pickFiles = () => { if (!fatal) fileEl.click(); };
  const pickFolder = () => { if (!fatal) folderEl.click(); };
  chooseBtn.addEventListener('click', pickFiles);
  chooseFolderBtn.addEventListener('click', pickFolder);
  addFilesBtn.addEventListener('click', pickFiles);
  addFolderBtn.addEventListener('click', pickFolder);
  dropEl.addEventListener('click', (e) => { if (!e.target.closest('button')) pickFiles(); });
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files.length) addFiles(fileEl.files); fileEl.value = ''; });
  folderEl.addEventListener('change', () => { if (folderEl.files && folderEl.files.length) addFiles(folderEl.files, 'folder'); folderEl.value = ''; });
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (hasFiles(e) && !fatal && reviewEl.hidden) { dragDepth++; dropOverlay.hidden = false; } }, { signal });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay.hidden = true; }, { signal });
  document.addEventListener('dragover', (e) => e.preventDefault(), { signal });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; dropOverlay.hidden = true;
    if (fatal || !e.dataTransfer || !reviewEl.hidden) return;
    const { files, folder } = await filesFromDrop(e.dataTransfer);
    if (files.length) addFiles(files, folder ? 'folder' : undefined);
  }, { signal });
  // paste a copied photo or file
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (fatal || !reviewEl.hidden || (t && t.closest && t.closest('input, textarea, [contenteditable]'))) return;
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); addFiles(files); }
  }, { signal });

  // keyboard: in the review window space plays, arrows step a frame, C cycles the view, B draws a box,
  // [ and ] switch files, Esc closes
  function focusables(root) { return [...root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"]), summary')].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null); }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!confirmEl.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); askDone && askDone(false); }
      else if (e.key === 'Tab') { const f = focusables(confirmEl); if (f.length) { const i = f.indexOf(document.activeElement); const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1); e.preventDefault(); f[n].focus(); } }
      return;
    }
    if (reviewEl.hidden) return;
    if (e.key === 'Escape') { if (S.boxMode) { e.preventDefault(); S.boxMode = false; drag = null; rvRender(); } else if (!docked()) { e.preventDefault(); closeReview(); } return; }
    if (e.key === 'Tab' && !docked()) {
      const f = focusables(reviewEl);
      if (f.length) { const i = f.indexOf(document.activeElement); const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1); e.preventDefault(); f[n].focus(); }
      return;
    }
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable], [role="slider"], summary')) return;
    if (e.key === ' ') { e.preventDefault(); if (P.playing) stopPlay(); else play(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepFrame(e.key === 'ArrowLeft' ? -1 : 1); }
    else if (e.key === 'c' || e.key === 'C') { if (P.item && previewModel(P.item)) { const o = ['split', 'result', 'original']; S.view = o[(o.indexOf(S.view) + 1) % o.length]; drawView(); rvRender(); } }
    else if (e.key === 'b' || e.key === 'B') toggleBox();
    else if (e.key === '[') reviewStep(-1);
    else if (e.key === ']') reviewStep(1);
  }, { signal });
  window.addEventListener('beforeunload', (e) => { if (leaveWarning()) { e.preventDefault(); e.returnValue = ''; } }, { signal });

  // a short Gemini clip to try the tool without a file of one's own
  if (import.meta.env.MODE === 'file') sampleCard.hidden = true;
  sampleBtn.addEventListener('click', async () => {
    const label = sampleBtn.querySelector('span'), was = label.textContent;
    sampleBtn.disabled = true; label.textContent = 'Loading the sample…';
    try {
      const r = await fetch('/samples/gemini-sample.mp4');
      if (!r.ok) throw new Error(String(r.status));
      addFiles([new File([await r.blob()], 'gemini-sample.mp4', { type: 'video/mp4', lastModified: 1 })]);
    } catch (e) {
      setNote('The sample could not be loaded. Check your connection and try again.', 'warn');
    } finally { sampleBtn.disabled = false; label.textContent = was; }
  });

  // ---------- start ----------
  const fatal = !('VideoDecoder' in window && 'VideoEncoder' in window)
    ? 'This browser lacks video encoding (WebCodecs), so the tool cannot run here. Use a recent Chrome, Edge or Safari on a computer.'
    : null;
  if (fatal) {
    const f = $('#fatal'); f.textContent = fatal; f.hidden = false;
    for (const b of [chooseBtn, chooseFolderBtn, sampleBtn]) b.disabled = true;
    dropEl.classList.add('is-off');
  }
  layoutStage();
  render();
  window.__tool = { E, SR, S, P, pool, leaveWarning, render: () => render(), vetModel, verifyResult, probeSteps: async (file, g, n) => { const it = { file }; await probe(it); const sx = it.info.w / 1920, sy = it.info.h / 1080; g = g || { x: (1739.431 + 0.5) * sx - 0.5, y: (899.555 + 0.5) * sy - 0.5, s: Math.min(sx, sy) }; return traceCheck(file, it.info, g, null, n || 8); } };

  return {
    isBusy: () => S.busy,
    leaveWarning,
    destroy() {
      alive = false;
      S.cancel = true; P.playing = false;
      if (S.conv) S.conv.cancel().catch(() => {});
      keepAwake(false);
      restoreTitle();
      stopOverlay();
      scrollLocks = 0; document.documentElement.style.overflow = ''; document.documentElement.dataset.busy = '';
      ac.abort();
      cleanups.forEach((f) => f());
      closePreview();
      if (window.__tool && window.__tool.S === S) delete window.__tool;
    },
  };
}
