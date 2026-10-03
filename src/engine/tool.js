// The tool page: wires the removal engine (core.js) to the markup in tool-markup.html.
// Everything runs in the visitor's browser; Mediabunny (MPL-2.0) reads, decodes, encodes and writes the files.
import * as MB from 'mediabunny';
import C from './core.js';

export function mountTool(root) {
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
  const abPrimary = $('#abPrimary'), abPrimaryLabel = $('#abPrimaryLabel'), abSecondary = $('#abSecondary'), noteEl = $('#note'), noteBox = $('#noteBox'), noteClose = $('#noteClose'), srStatus = $('#srStatus'), rvHint = $('#rvHint');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    view: 'split', split: 0.5, splitSet: false, boxMode: false,
    runId: 0, runT0: 0, runDid: 0, eta: null, lastSecs: 0, stopped: false, stopping: false, zipping: false,
  };
  let nextId = 1;
  const getItem = (id) => S.items.find((i) => i.id === id) || null;
  const refItem = () => getItem(S.refId);

  // ---------- media access ----------
  function openInput(file) {
    return new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  }
  async function withTrack(item, fn) {
    const input = openInput(item.file);
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw uerr('No video track was found in this file.');
      return await fn(track, input);
    } finally { try { input.dispose(); } catch (e) { /* already closed */ } }
  }
  async function probe(item) {
    await withTrack(item, async (track) => {
      const codec = await track.getCodec();
      if (!(await track.canDecode())) throw uerr('Your browser cannot decode this video format (' + (codec || 'unknown') + '). Try Chrome or Edge.');
      const [w, h, first, dur, stats] = await Promise.all([
        track.getDisplayWidth(), track.getDisplayHeight(), track.getFirstTimestamp(), track.computeDuration(), track.computePacketStats(300),
      ]);
      item.info = { w, h, first, dur, codec, fps: stats.averagePacketRate || 30, bitrate: stats.averageBitrate || 0 };
    });
  }
  function stamps(info, n) {
    const span = Math.max(0, info.dur - info.first - 1 / info.fps);
    n = Math.max(1, Math.min(n, Math.floor(span * info.fps) + 1));
    const out = [];
    for (let i = 0; i < n; i++) out.push(info.first + (n === 1 ? 0 : span * i / (n - 1)));
    return out;
  }

  // A decoded frame is edited either straight in its YUV planes (no colour conversion at all),
  // or, for rotated/unusual frames, through a canvas in RGB.
  const YUV8 = new Set(['I420', 'I420A', 'I422', 'I422A', 'I444', 'I444A', 'NV12']);
  function frameMode(s) {
    const vr = s.visibleRect;
    return !window.__forceRgb && s.rotation === 0 && !s.flip && YUV8.has(s.format)
      && s.displayWidth === vr.width && s.displayHeight === vr.height ? 'yuv' : 'rgb';
  }
  function csInit(cs) {
    if (!cs) return undefined;
    return { primaries: cs.primaries ?? null, transfer: cs.transfer ?? null, matrix: cs.matrix ?? null, fullRange: cs.fullRange ?? null };
  }
  async function readYuv(s) {
    const W = s.visibleRect.width, H = s.visibleRect.height, f = s.format;
    const buf = new Uint8Array(s.allocationSize());
    const layout = await s.copyTo(buf);
    const full = !!(s.colorSpace && s.colorSpace.fullRange);
    let sx = 2, sy = 2;
    if (f.startsWith('I422')) sy = 1; else if (f.startsWith('I444')) { sx = 1; sy = 1; }
    const cw = Math.ceil(W / sx), ch = Math.ceil(H / sy);
    const planes = [{ data: buf, off: layout[0].offset, stride: layout[0].stride, step: 1, w: W, h: H, white: full ? 255 : 235, sx: 1, sy: 1 }];
    if (f === 'NV12') {
      planes.push({ data: buf, off: layout[1].offset, stride: layout[1].stride, step: 2, w: cw, h: ch, white: 128, sx, sy });
      planes.push({ data: buf, off: layout[1].offset + 1, stride: layout[1].stride, step: 2, w: cw, h: ch, white: 128, sx, sy });
    } else {
      planes.push({ data: buf, off: layout[1].offset, stride: layout[1].stride, step: 1, w: cw, h: ch, white: 128, sx, sy });
      planes.push({ data: buf, off: layout[2].offset, stride: layout[2].stride, step: 1, w: cw, h: ch, white: 128, sx, sy });
    }
    return {
      mode: 'yuv', W, H, planes, key: 'yuv' + sx + sy,
      toSample: () => new MB.VideoSample(buf, { format: f, codedWidth: W, codedHeight: H, layout, timestamp: s.timestamp, duration: s.duration, colorSpace: csInit(s.colorSpace) }),
    };
  }
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function readRgb(s, rect, holder) {
    const W = s.displayWidth, H = s.displayHeight;
    if (!holder.c || holder.c.width !== W || holder.c.height !== H) { holder.c = makeCanvas(W, H); holder.x = holder.c.getContext('2d', { willReadFrequently: true }); }
    s.draw(holder.x, 0, 0, W, H);
    const x0 = Math.max(0, rect.x - 1), y0 = Math.max(0, rect.y - 1);
    const x1 = Math.min(W, rect.x + rect.w + 1), y1 = Math.min(H, rect.y + rect.h + 1);
    const img = holder.x.getImageData(x0, y0, x1 - x0, y1 - y0);
    const stride = (x1 - x0) * 4, base = -(y0 * stride + x0 * 4);
    const planes = [0, 1, 2].map((c) => ({ data: img.data, off: base + c, stride, step: 4, w: W, h: H, white: 255, sx: 1, sy: 1 }));
    return {
      mode: 'rgb', W, H, planes, key: 'rgb',
      toSample: () => { holder.x.putImageData(img, x0, y0); return new MB.VideoSample(holder.c, { timestamp: s.timestamp, duration: s.duration }); },
    };
  }
  const readFrame = (s, rect, holder) => (frameMode(s) === 'yuv' ? readYuv(s) : Promise.resolve(readRgb(s, rect, holder)));

  // Colour conversions (BT.709) for when a model learned in one form meets frames in the other.
  function yuvToRgb([Y, U, V], full) {
    const y = full ? Y : (Y - 16) * 255 / 219, k = full ? 1 : 255 / 224, u = (U - 128) * k, v = (V - 128) * k;
    return [y + 1.5748 * v, y - 0.1873 * u - 0.4681 * v, y + 1.8556 * u].map((x) => clamp(x, 0, 255));
  }
  function rgbToYuv([R, G, B], full) {
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B, u = (B - y) / 1.8556, v = (R - y) / 1.5748;
    return full ? [y, u + 128, v + 128] : [16 + y * 219 / 255, 128 + u * 224 / 255, 128 + v * 224 / 255];
  }

  // Per-plane restore settings for one frame layout, built once per model and layout.
  function planeModels(model, fr) {
    if (model.cache[fr.key]) return model.cache[fr.key];
    let L = model.L;
    if (fr.mode !== model.mode) L = fr.mode === 'rgb' ? yuvToRgb(L, model.full) : rgbToYuv(L, fr.planes[0].white === 255);
    // per-plane opacity measured in this video, when the frames come in the same layout
    const own = model.planeAlpha && fr.key === model.key ? model.planeAlpha : null;
    const shared = {}; // what the first plane measures in a frame, for the others
    const out = fr.planes.map((p, i) => {
      const resp = fr.mode === 'yuv' && model.mode === 'yuv' && i === 0 ? model.resp : null;
      if (p.sx === 1 && p.sy === 1) return { r: model.rect, alpha: own ? own[i] : model.alpha, dark: own && i === 0 ? model.darkY : null, L: L[i], denoise: 6, flatHeal: true, finish: true, repair: model.method === 'template' || !model.gemini, edgeFix: model.method !== 'template', resp, despeckle: true, shared, lead: i === 0 };
      const r = C.planeRect(model.rect, p.sx, p.sy, p.w, p.h);
      return { r, alpha: own ? own[i] : C.alphaOnPlane(model.alpha, model.rect, r, p.sx, p.sy), L: L[i], soften: true, flatHeal: true, finish: true, repair: model.method === 'template' || !model.gemini, edgeFix: model.method !== 'template', shared, lead: i === 0 };
    });
    model.cache[fr.key] = out;
    return out;
  }
  async function cleanSample(s, model, holder) {
    const fr = await readFrame(s, model.rect, holder);
    if (fr.W !== model.W || fr.H !== model.H) return s;
    const pms = planeModels(model, fr);
    fr.planes.forEach((p, i) => C.restorePlane(p, pms[i]));
    return fr.toSample();
  }

  // Built-in opacity map of the Gemini sparkle, learned from real Gemini videos (centre at
  // 1739.4, 899.6 in a 1920×1080 frame). Used to find the logo by its shape and to remove it when the
  // background under it never changes.
  const GEMINI = C.decodeTemplate({"w": 89, "h": 90, "cx": 44.431, "cy": 44.555, "refW": 1920, "refH": 1080, "refCx": 1739.431, "refCy": 899.555, "scale": 600, "L": 232.6}, Uint8Array.from(atob('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAgICAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIDAwMCAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECAz+CgjgEAwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAgIDAwICAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAgICAgEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), (ch) => ch.charCodeAt(0)));

  // The same logo as it shows in newer, sharpened Gemini videos (a thin bright rim inside the edge and
  // a faint dark ring outside), measured on plain-background videos of that kind.
  const GEMINI_SHARP = C.decodeTemplate({"w": 144, "h": 146, "cx": 71.431, "cy": 73.555, "refW": 1920, "refH": 1080, "refCx": 1739.431, "refCy": 899.555, "scale": 200, "offset": 40, "L": 235}, Uint8Array.from(atob('KCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnJyUoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJiMkKB8lKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoICpxdCIaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkqHkSJhEMVJSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCgoGll5dl8QIikoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCknKCggJW5ya3kYGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcbOH9nYIouECcnKSgnKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKigSX3dkXINiDSInKCkoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSIhe2phXm2EIhcoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkpJhlMgGBhY2WDWQ4mKSopKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcrIBh6aGFjZGJphBQaKSooKCcoJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCoqEUd5YmNkZGRheksNIysoJyknJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKCohG3ZnYGNlZGNiZ3wVGSgoJygnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcRUXNhYmRlZGNiYYBLDCQoKCYoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoJhspd2hjY2RkY2RjY299HxklKScnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJykmIgticWRjZGRkZGNkY2V6XgwjIikoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSUmDjp5ZmNkZGRkZGRkY2JvdzMNKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgaHHVtYWZjZGRkZGRkZGVmcHQUGyopKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKScLW3JhY2NjZGRkZGRkZGNmZ3tUCSQvKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpJhRDeGNiY2RkZGRkZGRkZGVlY2qAMAsmKScoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkpGC56amJjY2NkZGRkZGRkZWRkYWRzdx8WKCgoKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkpKCshIG90YmJkZGRkZGRkZGRkZGRkZWVkeGsXHSgoKSgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKSopKxsYaXZiYWJlY2NkZGRkZGRkZGRkZGJkYntjEBUrJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKSkoGRZddmJhY2NkY2NkZGRkZGRkZGRkZGRjY2d1WxEWKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKiocFlZ8YWFjZGVkY2VkZGRkZGRkZGRkZGRkZGNjeFQSGicpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpJhwUWX1nYWRkZGRkZGRkZGRkZGRkZGRkZGRkZGRjanxXERwnKSkoKCgoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygpKCgoKSsqFhddeGNgYmRjY2NjY2NkZGRkZGRkZGRkY2RkZGRjYmt3XxQYKiopKScnKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCcoKConKSMOJWZ2Y2FkZGNjY2NjY2NkZGRkZGRkZGRkY2NkZGRkZmRpfGkiECAoJygnJygnJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKykrHgw7dXVgYmJlZGRjY2RkZGRkZGRkZGRkZGRkZGNkZGRkZWViZ3lzNg4gKicoKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKCkoKiUVFlV8cmFiYmRjY2NjY2RkZGRkZGRkZGRkZGRkZGNkZGRkZGRlY2NvfFQaFCQoKCcmJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgqKisoGQ0uZXxqYGFjZGRkZGRkZGNjY2NjY2NjY2NjY2NjZGRkZGRkZGVkY2NjaXdtMA4ZKCooJycnKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpJhkOHVJ7d2RgYWRkZGRkZGRkZGNjY2NjZGRkY2NjZGRkZGRkZGRkZWRkZGRkZGRxf1QdCxknKCgnKCgoJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcfDRdEcHZuY2NjZGRkZGVkZGRkZGRjY2NkZGRkZGRkZGRkZGRkZGRkZGVlZGRkZGRhanZvSRsRIScoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnIBgZRHl+cWRhYmNkZGRkY2NkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZWVlZGNjYWZvd3BCFxYeJSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKScpKikkGxIMJlByd29lYmJiY2NkZGRjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGNkZGRkZGRjY2JhYml4e1ggChQYIyYkJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKScfDwwNI0Ble3lrZWFiYmNjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkY2JjYmFgZXyCazsjEQwXJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCknKCQaMFdsdnhxaWZiYmNjY2RkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkY2RkZGVjYWJoeIJ6Y1MxJigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJyImg4RzaGBgYWJjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkYmRhXmJnbn96IycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJyIidHtqYV9eYF9iYmNkY2RkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGNkY2NhYWBpa39uHScoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCUdOGV5fXhsZF9fYWJjZGRkZGNkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkY2NjYmFkcX16aFgoICcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgjDw0UKUxzg3pkY2JjZGRjY2RkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRjY2BfZXuDaj0hDw8WJigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKSgpKSkhFxASNWeBe2lgYWFiY2NjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkY2JgXmZ3gV0lDREUISMnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcmHRchVHl8a2BhZGNjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZWRlZGRiXF9rfnxMGRIZJCgpKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcpKicbESBPdHFoYmVkYmNjZGNjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGVlY2RjZWJeZnh8URwUISsrKygqKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKSkqJx0TJ1x1cWBiY2NjZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkY2RkZGRjYlxsfF8kDx4nKSgoKCkoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkrKSgnGhA1bHpmYmVkY2RkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRlZGNhYnd2Nw8VJCUoKSgoJygnKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCgoKCUQF1yBcGZkZGNkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGVjY19sf14ZEiIoJigpKCgoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJycnKSUqHxA7anhqY2NkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRjYXh1QxAbJyYoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnJycnKCcnKigbHmB/Z2RkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGJhc28wDSEoJygnKCgoJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKCgoKCMsHhVmemVkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkYWN3bx0RJCwoKigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoJxsWXoBqZGVkZGRjY2NkZGRkZGRkZGRkZGRkZGZiZn5dGBsnKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnJygbFFR7ZWRiY2NkY2RkZGRkZGRkZGRkZGRkYmRlf1sXGiYrKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoKCkrGxVTeGRjZGRkY2RkZGRkZGRkZGRkY2RkYmR2YBgaKisqKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkpKxwXW3xmZGRkZGRkZGRkZGRkZWRkY2RjYnluGhcsKCgpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkcHWp9ZWRiY2RkZGRkZGRkZGRkY2JgdnQkGCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSopHCNydmVjY2RkZGRkZGRkZGRjYWFyeTYWJCgpKiooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgqJhMwfnBiZWRkZGRkZGRkZWRkZGp/QhIhKScpKSkpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCQNV3xkY2RkZGRkZGRkZGRjZH1YDyEqKCkpKSopKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkdGnN1YmJjZGRkZGNjZGNfcXIbHConKCgoKSkpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpJygmFDR2aWJjY2RkZGRjY2FrezIUJygpKCgpKSkoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKCgoIg1bdWRjY2RkZGRjZGJ4Vg4lJykoJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygoJxQjd2xiY2RkZGRkYm5vHxorKScoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoKCUJTHtiY2RlZGRkYntHDigqKSgoKCgoKCgoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJycoKCobGXNrYWNkZGRibXMXHCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgrEEF3Y2NlY2Nle0EOKCooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygoKSorIRl7aWBkY2BufBgcKikoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpJxdVf2VjYWN/UBYmKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKB8qeHVjYWx2KSIpKCgpKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKScVWIFnYnZdFCcpKCcpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKSkaNXtwYns+FicoKCgpKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCkiImt0b3YjGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcnKCgnH1d6d2kWHygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoIkt6glAVJSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCklIDZteTEWKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoIiEnKB4lKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCYjISYnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygpJykoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo'), (ch) => ch.charCodeAt(0)));

  // ... and as it shows over dark backgrounds in such videos (rim and ring a little stronger).
  const GEMINI_SHARP_DARK = C.decodeTemplate({"w": 146, "h": 146, "cx": 73.431, "cy": 73.555, "refW": 1920, "refH": 1080, "refCx": 1739.431, "refCy": 899.555, "scale": 200, "offset": 40, "L": 235}, Uint8Array.from(atob('KCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJigpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJyIfGxkbIicoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkkGypwjxETIygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgqKywSXnyTOwohKSkpKSkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCorJhF0X3l2CB8pKSkpKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKisVGn5ebIoYFygoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCoqKhEtgllcmDEOJCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSgmBnBwXVqDcAYgKSgpKCgoKCcnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCopKBsMil9cXWiOHBMqKikpKCgoJycnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKisoEUp9WF1mYn1tCScrKikoKCgoJycnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkqLRsTh19fYmZlXJQPGiksKCcoKCgoJycnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCooDFN3W19lZ2hYfU8JIyooKCgoKCgoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKR4agmFeYmRlZF9giAwaKigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKCklCltyXmFhY2NkXlyGTwslKygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJiYpJhUrf19hY2RjZGRjX2qAHBonKyYoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKicgCW9tY2JkY2RkY2NiYXhhBiMlKygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKAREe2BjYmNjZGRjY2Nga3wxCSwnKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgQIIViX2VhY2JkY2NiZGRibXwPGC0rKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJigpHwhsb19hYmJjY2NjY2NkZGVgeVwHJDEpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCopKSAKU3pdY2JiY2NjY2NjY2RkZGRhhzUJJCooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgwDTCCYGJhYmJjY2NjY2NkZWVlYWBufxwXJykqKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSsqLhcdf21eYmNjYmNjY2NjY2NjY2NjY192cA4dKyspKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgqKCwZD31yXWJiY2NjY2NjY2NjY2NjY2NhZF18aQkXLigpKCgoKCgoKCgoJycnJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKiwpGRFkd15jYmNjY2NjY2NjY2NjYmJjY2JiYGN3Xg0YKiopKCgoKCgoKCgoJycnJycoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCosKBoRXIRbYGJjY2NjY2NjY2NjY2NjZGRkY2NjY2B/Vg8aJysqKSgoKCgoKCgnJycnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSgqLCgcDmKDX2FiY2NjY2NjY2NjY2NjY2NjY2NjZWNjYmN/WQ4cKCsqKCgoKCgoKCcnJicoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygpJysrEBNpdl1eYWJjY2NjY2NjY2NjY2NjY2NjY2NkY2JjYmZ5ZQ0XKiooKSgnJygoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoKCopIwkkdHRbYGFiYmJjY2NjY2NjY2NjY2NjY2NjY2NjY2NkY2N8dCALIComKigoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSgpKiopLR8HPoBzWmNgYWJiYmJjY2NjY2NjY2NjY2NjY2NjY2NjY2VjYl92gDoJHywnKSgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSopKicREV2Ha1thYWNkY2JiYmNjY2NjY2NjY2NjY2NjY2NjY2NkZGVkYV5qh10TESYpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkoKi0rLCYVCTBwg2FaYWNjYmNiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NiZGRiYWFjeXgsCR0rKyooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkpKCgpKikYDRpZhHtdXmFiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjZGRkYWZgcYNXFgkZKCooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKikhDBNGe3tsXWFhZGNkYmJjY2NiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2VjZGNkY2VdZnZ2ShQOJCooKCopKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSghFRFEholxYV1hYmRkZGNiZGNjY2JjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NkY2VjY2NfYGt6e0IPEh4nKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoJhsPCB1XhYFrYl9hYmJiY2NjY2JjY2NiYmJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjZGNjZGJiY19nfolZFAUXGSYmJScoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCgoKCkpKSYfEAgLIEFwjYFkXF5gYGNjY2NjY2NjY2NjY2JiYmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjYWJjYmBbYH+KbzsjCwkOISkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpIBs2XnmEgm9gYGJgY2NjY2NjY2NjY2NjY2NiYmJiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2JjY2NjYWNgW15wgX9xYzcYKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCYTQp2MeWpeX11gY2NjZGRjY2NjY2NjY2NjY2NiYmJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NlZGNiY2FkYF5bYmuAiRQiKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKBY2gXBhXl1cX1xeYWFiZGNiY2NjY2NjY2NjYmJiYmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2RjY2NiZWBgYWFiY2FmY3p2DyMoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoIBY5ZX6AgHBkXV5eYGJiY2NjY2NjY2NjY2NjY2JiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjYmFhX2FhXVpodHx5cDEWKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCglHwcGCB9Gd4yCZmVhYmNjY2JjY2NjY2NjY2NjYmJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NiYWReXF50iXxVMRIKDiMnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgmKConKCwjGg4ML2N8fWdbX2BiY2JjY2NjY2NjY2NiYmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjZGNjY2FhYGFfXF91iGwxCwoOHSMlJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCoqKiwsKyccEBlThIFnXV9jYmRjY2NjY2NjY2JiY2NjY2NjY2NjY2NjY2NjY2NjY2NjYmNjZGNkY2NcW2J4hFUZDhYfJikoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkpKSoqLCwrLS4oGQ0bU4F2ZF5iY2JjYmNiY2NjYmJiYmJjY2NjY2NjY2NjY2NjY2NjY2NjZGNjY2JkXmF1gF0aDBkoLSwqKSgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKCgoKSkpKisrKSsuLC0vKxwKIWJ+b1tiX2FjY2NjYmNiYmJiYmNjY2NjY2NjY2NjY2NjY2NjY2NjYmJhY1hnf2UnBhcmKCgoKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygoKCkpKSsrKisrLTAtLCoZCTV0e15hYmNiYmJiY2JiYmJiY2NjY2NjY2NjY2NjY2NjY2NjY2NjYmFcdX84CA4jJigpKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSkoKCkpKioqKisrKywtLSwsLC4qDAxei2tiY2NjY2JiYmJiYmJiY2NjY2NjY2NjY2NjY2NjY2NkYWFcZIBmEggeKCgqJScoJycnKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkpKSkpKysrKy0sLCwqLiw0HQY5fHZhX2FhYmJiYmJiYmJiYmJiYmJiY2NjY2JjY2JiYmNhWnN9RgUWJygnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkqKispKS0tLS0tLCwtLCsxKRMeaH9mY2JiYmJiYmJiYmJiYmJiYmJjY2NjY2NjYmJjY1t0ejAGHSskKigoKCgpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSoqKCwsLS0sLCwtLSwqLB8OZn5hYWFhYmJiYmJiY2NiY2NiY2NjY2NjYmNiYWFee3gVCSEsKCknJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKigoKCgoKCgoKCgoLSkoKh0LWoJiYmFiY2JiYmJjY2NjY2NjY2NjY2NjY2JiYYZeDRgrKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCsoKBYLWYRgYmJiYWNjYmNjY2NjY2NjY2JiYmNeYF6GWQ4bKSorKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgvKCgqKxYRXHleZGJjYmJiY2NjY2NjY2NjY2JiX2Bfd2AKHCkqKysnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJigoKCgoJigoKCIoMCgoKSkqKxcJX39hYmNiYmJjY2NjY2NjY2NiYmJiW3l1DhkuKCcmJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCYnJCQmJSgoKDIoKCEoKCgqKB4RbH1gYWJjYWRkZGRjY2NjY2JhY11zghsSLyooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJig1KCUoKCgoKCkrLBsYfHBiYGRjY2RkZGNjY2NkYmJfa4MwECopKCcoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnJigkJCgoKCgoKCgvKhEtg2lhY2RkZGRkY2NjY2NiYmOFRwwgJykpKigoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCYoKCgoKCgoKC4rKgVZe2JhYmJjY2NjY2JiYWJcgl4HISkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgkKCgoKCgoKCgoLi4vGxF8cV5hYWJiYmJiYmJlW3F7ERwqKCgoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpLy8uDjN9YmBgYWFiYmJhYVxpgycRKiYqKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJigoKCgoKC4uMS8mBWJyX2JiYWFiYmBgWXtUBisoKigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoLS8tMDAWHHxjYmJiYmJiX2BrdxccKionKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoLSwuLS0HS39fYmJjY2JgXYdDCysrKiYnJygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSgoKCgnLC0sLyMRfWdgX2RhYV5pgggeKSopKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgtLi4wMxA7fWBiYWBgXIU9CSoqKCcpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCcoKCgoJy4tLS4vKAyFZGJfYF1pjQkeKiooKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoLi0sLi0vD06IW2BhV4VUCygqKSgpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgtLSwsLC0iGIptXGJkhR4dKigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKC0sLCspKjAJUYNZX3ZoCigpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCwsKywqLxkYg11chC0SKigoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgmKCgoKCgoKCwrLCssJBZ2YWh/GB0qKCcoKSgpKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCsrKysqGGNseGsHKCgoKCcoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCsrKywcQoaLRw4qKCgoKCgnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCoqKBwoeIIdGCsoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKigoKComFxojGhMiKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgnKysqKCgoKSgmIBocIygoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoJygqKikpKCgpKSkpKigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKSkoKCkpKSoqKSopKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKSooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgpKCgoKCcnKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCkoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKSgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKA=='), (ch) => ch.charCodeAt(0)));
  // The "Veo" text mark of Veo videos, as measured in real ones: its opacity shape at 720p (short
  // side) and its right and bottom margins in pixels.
  const VEO = (() => { const r = atob('AAEBAQECAgMEBAUFBQUFBQQEAwMCAQEBAAAAAgEBAQIDAwQGBQUFBQUFBQQDAwICAQEAAeyCAwICCu9QBQUFBQYGBgYHBQQDAwIBCAaD8gIGBmjmBwYGBwYGBgcGBQUEBAMDAgsKRP1CCg3qqBEimMeECwgHC3ytpw8EAwIODgvFlw4+/zcl7KmG1ccHCNvehKj2OQMDDxEPkPQQpukUrMclJDX/M2bqEwkKqLgEAwkOEBj9ROd3E8LfyMvMzDWF1wgKCGXtBAQCBQkQyt3/Ig+vwxMSEyAVausWCwiquAUEBQMECXP/zQoLJeytZ8LdFhnj5XKs+1AEBAAABQUNr1kHBwwXt7ylGA0PG7HCt0sEBAQAAAcGBQMCAgIFBwcHCAgLDAsKCgsKCgUEAAABBwgGAwEBAQICAgQHCAoKCQkLDhADBA=='); return { w: 25, h: 13, mr: 14, mb: 14, a: Float32Array.from(r, (c) => c.charCodeAt(0) / 255) }; })();
  const VEO_MIN = 0.7;
  // ---------- detect + learn ----------
  function padRect(r, W, H) {
    const pad = Math.max(8, Math.round(Math.max(r.w, r.h) * 0.3));
    const x0 = Math.max(0, Math.floor((r.x - pad) / 2) * 2), y0 = Math.max(0, Math.floor((r.y - pad) / 2) * 2);
    const x1 = Math.min(W, Math.ceil((r.x + r.w + pad) / 2) * 2), y1 = Math.min(H, Math.ceil((r.y + r.h + pad) / 2) * 2);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function evenRect(r, W, H) {
    const x0 = clamp(Math.floor(r.x / 2) * 2, 0, W - 4), y0 = clamp(Math.floor(r.y / 2) * 2, 0, H - 4);
    const x1 = clamp(Math.ceil((r.x + r.w) / 2) * 2, x0 + 4, W), y1 = clamp(Math.ceil((r.y + r.h) / 2) * 2, y0 + 4, H);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const toRel = (r, W, H) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });
  const fromRel = (q, W, H) => evenRect({ x: q.x * W, y: q.y * H, w: q.w * W, h: q.h * H }, W, H);

  async function detectLogo(item, onP) {
    return withTrack(item, async (track) => {
      const { w: W, h: H } = item.info;
      const f = Math.max(1, Math.ceil(W / 640)), sw = Math.floor(W / f), sh = Math.floor(H / f);
      const cv = makeCanvas(sw, sh), cx = cv.getContext('2d', { willReadFrequently: true });
      // the bottom-right corner at full size too, for the small "Veo" text mark
      const sc0 = Math.min(W, H) / 720, cw = Math.min(W, Math.round(90 * sc0)), ch = Math.min(H, Math.round(48 * sc0));
      const cc = makeCanvas(cw, ch), ccx = cc.getContext('2d', { willReadFrequently: true }), corners = [];
      const sink = new MB.VideoSampleSink(track);
      const ts = stamps(item.info, 48), frames = [];
      for await (const s of sink.samplesAtTimestamps(ts)) {
        if (S.cancel) break;
        if (!s) continue;
        try {
          s.draw(cx, 0, 0, sw, sh);
          const d = cx.getImageData(0, 0, sw, sh).data, y = new Uint8Array(sw * sh);
          for (let k = 0, o = 0; k < y.length; k++, o += 4) y[k] = (d[o] * 54 + d[o + 1] * 183 + d[o + 2] * 19) >> 8;
          frames.push(y);
          s.draw(ccx, cw - W, ch - H, W, H);
          const e = ccx.getImageData(0, 0, cw, ch).data, z = new Uint8Array(cw * ch);
          for (let q = 0, o = 0; q < z.length; q++, o += 4) z[q] = (e[o] * 54 + e[o + 1] * 183 + e[o + 2] * 19) >> 8;
          corners.push(z);
        } finally { s.close(); }
        onP(frames.length / ts.length);
        if (frames.length % 6 === 0) await idle();
      }
      const k = W / sw;
      // first look for the Gemini logo by its shape (works on still backgrounds too)
      if (frames.length) {
        const mean = new Float32Array(sw * sh);
        for (const fr of frames) for (let q = 0; q < mean.length; q++) mean[q] += fr[q];
        for (let q = 0; q < mean.length; q++) mean[q] /= frames.length;
        const tm = C.findTemplate(mean, sw, sh, GEMINI, Math.min(W, H) / 1080 * (sw / W), W, H);
        if (tm) {
          const X = (tm.x + 0.5) * k - 0.5, Y = (tm.y + 0.5) * k - 0.5, s = tm.s * k;
          return { rect: C.placeTemplate(GEMINI, X, Y, s, W, H).rect, confidence: tm.score, tmpl: { x: X, y: Y, s, usual: tm.usual } };
        }
      }
      // then the "Veo" text mark at its usual place (from a low percentile over time, so bright
      // things passing behind it don't hide it)
      if (corners.length >= 8) {
        const n = cw * ch, low = new Float32Array(n), col = new Uint8Array(corners.length), at = Math.floor(corners.length * 0.1);
        for (let q = 0; q < n; q++) { for (let j = 0; j < corners.length; j++) col[j] = corners[j][q]; col.sort(); low[q] = col[at]; }
        const v = C.findVeo(low, cw, ch, VEO, sc0);
        if (v && v.score >= VEO_MIN) {
          const s = v.s, X = W - cw + v.x, Y = H - ch + v.y;
          return { rect: evenRect({ x: X - 11 * s, y: Y - 9 * s, w: 46 * s, h: 30 * s }, W, H), confidence: v.score, tmpl: { veo: true } };
        }
      }
      // otherwise: any logo that stays put while the scene changes
      const d = C.detect(frames, sw, sh);
      if (!d) return null;
      return { rect: padRect({ x: d.x * k, y: d.y * k, w: d.w * k, h: d.h * k }, W, H), confidence: d.confidence };
    });
  }

  async function learn(item, rect, onP, guess) {
    return withTrack(item, async (track) => {
      const sink = new MB.VideoSampleSink(track);
      const ts = stamps(item.info, 160), holder = {};
      let learners = null, first = null, n = 0;
      for await (const s of sink.samplesAtTimestamps(ts)) {
        if (S.cancel) break;
        if (!s) continue;
        try {
          const fr = await readFrame(s, rect, holder);
          if (!first) {
            first = fr;
            // learners keep their frames' pixels for the colour and near-black checks
            learners = fr.planes.map((p) => new C.PlaneLearner(p.sx === 1 && p.sy === 1 ? rect : C.planeRect(rect, p.sx, p.sy, p.w, p.h), true));
          }
          if (fr.key === first.key) fr.planes.forEach((p, i) => learners[i].add(p));
        } finally { s.close(); }
        onP(++n / ts.length);
        if (n % 6 === 0) await idle();
      }
      if (S.cancel) throw uerr('Stopped.');
      if (!learners || learners[0].frames < 6) throw uerr('Not enough frames to learn the logo from.');
      const yuv = first.mode === 'yuv', li = yuv ? 0 : 1;
      // Is the Gemini logo in this box? Align the built-in template on the long-run average.
      const N = learners[li].frames, meanR = new Float32Array(rect.w * rect.h);
      for (let q = 0; q < meanR.length; q++) meanR[q] = learners[li].so[q] / N;
      // try the detected guess and the standard Gemini size at that spot; keep the better fit
      const sStd = Math.min(first.W, first.H) / 1080, gx = guess ? guess.x - rect.x : rect.w / 2, gy = guess ? guess.y - rect.y : rect.h / 2;
      // at Gemini's usual spot only fine-tune (the logo is always exactly there); elsewhere align freely
      const opts = guess && guess.usual ? { maxShift: 1.5, sizeRange: 0.03 } : {};
      // the "Veo" text mark (found, or boxed by hand) is learned from the video, never fitted with the sparkle
      const veo = !!(guess && guess.veo) || (!guess && (() => { const v = C.findVeo(meanR, rect.w, rect.h, VEO, Math.min(first.W, first.H) / 720, true); return !!v && v.score >= VEO_MIN; })());
      let al = null;
      if (veo) al = { x: rect.w / 2, y: rect.h / 2, s: sStd, score: { score: 0, inside: 0 } };
      else for (const s0 of guess && Math.abs(guess.s - sStd) > 0.005 ? [guess.s, sStd] : [sStd]) {
        const a = C.alignTemplate(meanR, rect.w, rect.h, GEMINI, gx, gy, s0, opts);
        if (!al || a.score.score > al.score.score) al = a;
      }
      // detection already confirmed the logo (a faint logo on a light background fits only moderately;
      // at Gemini's usual spot a busy background can lower the fit further); a box drawn by hand
      // needs a clear fit
      const need = guess ? (guess.usual ? 0 : 0.5) : 0.7;
      // (a sparkle too big for the box drawn around a logo is not that logo)
      const fits = !!guess || 0.8 * GEMINI.w * al.s <= 1.15 * Math.min(rect.w, rect.h);
      const tpl = !veo && fits && al.score.score >= need && al.score.inside >= 0.3 ? { ...C.templateIn(GEMINI, rect.x + al.x, rect.y + al.y, al.s, rect), score: al.score.score } : null;
      // Learn the logo from the video itself (best when the scene moves): per-frame regression
      // finds the shape, long-run means and spreads give unbiased opacity and colour.
      const fit0 = C.fitLuma(learners[li], first.planes[li].white, rect.w, rect.h);
      const mom = C.refineByMoments(learners[li], fit0, rect.w, rect.h);
      let fit = mom ? { ...fit0, alpha: mom.alpha, L: mom.L } : fit0, mask = mom ? mom.mask : fit0.mask;
      const colourOf = (alphaFull, maskFull, k, useTemplate) => learners.map((l, i) => {
        const p = first.planes[i], full = p.sx === 1 && p.sy === 1;
        const a = full ? alphaFull : C.alphaOnPlane(alphaFull, rect, l.r, p.sx, p.sy);
        if (useTemplate) {
          const c = C.fitTemplateColour(l, a, full ? maskFull : Uint8Array.from(a, (v) => (v > 0 ? 1 : 0)), i === li ? undefined : k);
          return c ? c.L : p.white;
        }
        const v = l.colourFor(a);
        return v == null ? p.white : v;
      });
      let L = colourOf(fit.alpha, mask, 1, false);
      L[li] = fit.L;
      let method = 'learned', check = null, colourMeasured = true, toTemplate = null;
      if (tpl) {
        // The built-in template with its colour fitted here is the reference. What was learned from
        // the video is kept only when it matches it in shape, strength and colour; on still or
        // low-contrast backgrounds learning goes astray and the template is used instead.
        // The Gemini sparkle is white and its strength is known; a fit far from that means the
        // backgrounds misled it (stripes, busy patterns), so the strength is held and only the
        // colour is taken, or the template's own value when that is off too.
        const sane = (c) => c && c.from === 'flat' && c.k >= 0.85 && c.k <= 1.2 && c.L >= 205 && c.L <= 260;
        // the templates' logo colours are limited-range luma values
        const inRange = (v) => (first.planes[li].white === 255 ? (v - 16) * 255 / 219 : v);
        // Strength and colour only from frames where the logo sits over a plain background; without
        // such frames (something always under the logo) the logo's own known values are used.
        let cY = C.fitTemplateColour(learners[li], tpl.alpha, tpl.mask, undefined, inRange(GEMINI.L));
        if (!sane(cY)) {
          const c1 = C.fitTemplateColour(learners[li], tpl.alpha, tpl.mask, 1, inRange(GEMINI.L));
          cY = sane(c1) ? c1 : null;
        }
        const measured = !!cY;
        colourMeasured = measured;
        if (!cY) cY = { k: 1, L: inRange(GEMINI.L), from: 'template' };
        {
          // match the logo's edge softness in this video (low bitrates smear it)
          const ed = measured ? C.fitTemplateEdge(learners[li], GEMINI, rect.x + al.x, rect.y + al.y, al.s, cY.L, cY.k) : { sigma: 0 };
          if (ed.sigma > 0 || ed.sharpen) {
            Object.assign(tpl, C.templateIn(ed.T, rect.x + al.x, rect.y + al.y, al.s, rect), { blur: ed.sharpen ? -ed.sharpen.amount : ed.sigma });
            const c2 = C.fitTemplateColour(learners[li], tpl.alpha, tpl.mask, undefined, cY.L);
            if (sane(c2)) cY = c2;
          }
          // Final choice by what removal leaves behind (works with things under the logo too): the
          // look (the built-in soft logo of older videos or the crisp one of newer, sharpened ones,
          // as fitted above or not) and the exact placement and size.
          const looks = [ed.T || GEMINI, GEMINI, GEMINI_SHARP, C.blurTemplate(GEMINI_SHARP, 0.7), C.blurTemplate(GEMINI_SHARP, 1.3), C.sharpenTemplate(GEMINI_SHARP, 1, 0.3), C.sharpenTemplate(GEMINI_SHARP, 1, 0.6), GEMINI_SHARP_DARK, C.blurTemplate(GEMINI_SHARP, 0.4), C.blurTemplate(GEMINI_SHARP_DARK, 0.4), C.sharpenTemplate(GEMINI_SHARP_DARK, 1, 0.3)];
          for (const sg of [0.7, 1.3, 2.2]) looks.push(C.blurTemplate(GEMINI, sg));
          const cal = C.calibrateOutline(learners[li].crops, rect, looks, rect.x + al.x, rect.y + al.y, al.s, cY.k, (T) => (measured ? cY.L : inRange(T.L)));
          if (cal) {
            Object.assign(tpl, C.templateIn(cal.T, cal.X, cal.Y, cal.s, rect), { look: looks.indexOf(cal.T), blur: cal.T.sigma || (cal.T.sharpen ? -cal.T.sharpen : 0) });
            al.x = cal.X - rect.x; al.y = cal.Y - rect.y; al.s = cal.s;
            if (measured) {
              const c3 = C.fitTemplateColour(learners[li], tpl.alpha, tpl.mask, undefined, cY.L);
              if (sane(c3)) cY = c3;
            } else cY = { k: 1, L: inRange(cal.T.L), from: 'template' };
          }
          const tAlpha = tpl.alpha.map((v) => v * cY.k);
          const tL = colourOf(tpl.alpha, tpl.mask, cY.k, true);
          tL[li] = cY.L;
          // the Gemini sparkle is white (grey where it is faint): its colour is neutral, whatever
          // the backgrounds seemed to suggest
          if (yuv) for (let i = 1; i < tL.length; i++) tL[i] = 128;
          let dot = 0, n1 = 0, n2 = 0, pl = 0, pt = 0;
          for (let q = 0; q < tAlpha.length; q++) { dot += fit.alpha[q] * tAlpha[q]; n1 += fit.alpha[q] ** 2; n2 += tAlpha[q] ** 2; pl = Math.max(pl, fit.alpha[q]); pt = Math.max(pt, tAlpha[q]); }
          const agree = n1 > 0 ? dot / Math.sqrt(n1 * n2) : 0;
          // how much each model lifts a mid-grey and a light background at the logo's strongest point
          const lift = (a, Lv, bg) => a * (Lv - bg);
          // (when the logo's colour couldn't be measured here, the learned colour need only be a
          // plausible white for the logo)
          const white = first.planes[li].white, Lmin = white === 255 ? 226 : 210, Lmax = white === 255 ? 272 : 250;
          const liftOk = colourMeasured
            ? [110, 200].every((bg) => { const a = lift(pl, L[li], bg), b = lift(pt, tL[li], bg); return Math.abs(a - b) <= Math.max(3, 0.15 * Math.abs(b)); })
            : L[li] >= Lmin && L[li] <= Lmax && Math.abs(pl - pt) <= 0.25 * pt;
          const colourOk = L.every((v, i) => i === li || Math.abs(v - tL[i]) <= 4);
          check = { look: tpl.look, blur: tpl.blur || 0, agree: +agree.toFixed(3), liftOk, colourOk, learned: L.map((v) => +v.toFixed(1)), template: tL.map((v) => +v.toFixed(1)), k: +cY.k.toFixed(3), peaks: [+pl.toFixed(3), +pt.toFixed(3)] };
          const useTemplate = () => {
            fit = { ...fit, alpha: tAlpha, L: cY.L };
            mask = tpl.mask; L = tL; method = 'template';
          };
          if (agree >= 0.9 && liftOk && colourOk) {
            fit = { ...fit, alpha: fit.alpha.map((v, q) => (tpl.mask[q] ? v : 0)) };
            mask = tpl.mask; toTemplate = useTemplate;
          } else useTemplate();
        }
      }
      // The template is a close match, not an exact one: this video's encoder blurs the logo's edge,
      // adds a faint halo and subsamples its colour in its own way. Where the logo's surroundings are
      // flat in a frame, the background under it is known, so each pixel's real opacity on each plane
      // is measured from those frames (pixels with little such evidence keep the template's value).
      // Over dark backgrounds the logo looks different again (its thin light rim and faint dark
      // shadow show up, and compression treats it differently), so luma gets a second opacity map
      // measured on the dark frames themselves.
      // What was learned from a moving scene is kept as it is; but where the background under the
      // logo is plain in most frames, the direct measurement is better there too.
      let planeAlpha = null, darkY = null;
      const refineAll = (learnedPath) => {
        // on the learned path near-black frames stay with the near-black correction below when the
        // video lifts its blacks (as before); the template path measures them itself
        const lifted = learnedPath && yuv && !!C.fitBlackLift(learners[0], fit.alpha, fit.L, mask);
        let dk = null, sup = null;
        const maps = learners.map((l, i) => {
          const p = first.planes[i], full = p.sx === 1 && p.sy === 1;
          const a0 = full ? fit.alpha : C.alphaOnPlane(fit.alpha, rect, l.r, p.sx, p.sy);
          const m0 = full ? mask : Uint8Array.from(a0, (v) => (v !== 0 ? 1 : 0));
          // luma only: colour planes have no "near black"
          const isY = yuv && i === 0;
          const rf = C.refineAlphaFlat(l, a0, m0, L[i], { grow: full ? 3 : 2, darkRegime: isY && !learnedPath, skipDark: isY && lifted, minD: isY ? 25 : 8 });
          if (rf && isY) dk = rf.dark;
          if (i === li && rf) sup = rf.plain;
          return rf ? rf.alpha : a0;
        });
        return { maps, dark: dk, support: sup };
      };
      if (method === 'template') {
        const r0 = refineAll();
        planeAlpha = r0.maps; darkY = r0.dark;
      } else if (tpl) {
        const r0 = refineAll(true);
        let n0 = 0, n1 = 0;
        // share of the learning frames in which each logo pixel's background was plain
        if (r0.support) for (let q = 0; q < fit.alpha.length; q++) if (fit.alpha[q] > 0.05) { n0++; if (r0.support[q] >= 0.8) n1++; }
        if (n0 && n1 >= 0.8 * n0) { planeAlpha = r0.maps; darkY = r0.dark; }
        else if (toTemplate) {
          // Learned from a moving scene, the map is a statistical estimate: where things keep passing
          // under the logo it leaves a faint outline and specks. The template's way (its measured
          // edge, the outline repair and a map of its own for dark frames) does better there.
          toTemplate();
          const r1 = refineAll();
          planeAlpha = r1.maps; darkY = r1.dark;
        }
      }
      const alphaY = planeAlpha ? planeAlpha[li] : fit.alpha;
      // the near-black correction is only needed where dark frames did not give their own map
      // (on the template path only when plain frames were seen: with things always under the logo
      // this check would be misled by them)
      const resp = yuv && !darkY && (method !== 'template' || colourMeasured) ? C.fitBlackLift(learners[0], alphaY, fit.L, mask) : null;
      learners.forEach((l) => { l.crops = []; });
      let px = 0, sum = 0, max = 0;
      for (const v of fit.alpha) if (v > 0) { px++; sum += v; if (v > max) max = v; }
      const mean = px ? sum / px : 0;
      return {
        mode: first.mode, full: first.planes[0].white === 255, W: first.W, H: first.H, rect, alpha: fit.alpha, L, resp, method, gemini: !!tpl, veo, cache: {},
        key: first.key, planeAlpha, darkY,
        align: { x: rect.x + al.x, y: rect.y + al.y, s: al.s, score: al.score.score, guess, check },
        frames: learners[0].frames, px, mean, max, ok: px >= 12 && mean >= 0.04,
      };
    });
  }

  // ---------- photos ----------
  // A photo has no other frames to learn from, so the logo is the known Gemini sparkle, fitted to
  // this photo (place, size, look and strength) and removed from each colour channel.
  const isImageFile = (f) => (f.type && /^image\/(png|jpeg|webp)$/.test(f.type)) || /\.(png|jpe?g|webp)$/i.test(f.name);
  async function probeImage(item) {
    let bmp;
    try { bmp = await createImageBitmap(item.file); } catch (e) { throw uerr('This image could not be opened.'); }
    item.bmp = bmp;
    item.info = { w: bmp.width, h: bmp.height, image: true };
  }
  async function analyzeImage(item, manualRect) {
    const { w: W, h: H } = item.info;
    const cv = makeCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(item.bmp, 0, 0);
    const data = cx.getImageData(0, 0, W, H), px = data.data, lum = new Float32Array(W * H);
    for (let q = 0, o = 0; q < W * H; q++, o += 4) lum[q] = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
    await idle();
    let found;
    if (manualRect) {
      // inside a box drawn by hand: the sparkle about as big as the box, wherever it fits best
      const size = 0.8 * Math.min(manualRect.w, manualRect.h);
      const a = C.alignTemplate(lum, W, H, GEMINI, manualRect.x + manualRect.w / 2 - 0.5, manualRect.y + manualRect.h / 2 - 0.5, size / (0.8 * GEMINI.w), { sizeRange: 0.4, maxShift: Math.max(4, Math.min(manualRect.w, manualRect.h) / 3) });
      found = a.score.score >= 0.2 ? { T: GEMINI, x: a.x, y: a.y, s: a.s, score: a.score.score } : null;
    } else found = C.findImageLogo(lum, W, H, [GEMINI]);
    if (!found) return null;
    await idle();
    const looks = [GEMINI, GEMINI_SHARP, C.blurTemplate(GEMINI_SHARP, 0.7), C.blurTemplate(GEMINI_SHARP, 1.3), C.sharpenTemplate(GEMINI_SHARP, 1, 0.3), GEMINI_SHARP_DARK, C.blurTemplate(GEMINI, 0.7)];
    const fit = C.fitImageLogo(lum, W, H, found, looks);
    await idle();
    const planes = [0, 1, 2].map((c) => ({ data: px, off: c, stride: W * 4, step: 4, w: W, h: H, white: 255, sx: 1, sy: 1 }));
    C.cleanImage(planes, fit, { denoise: isJpeg(item) ? 4 : 0 });
    const out = makeCanvas(W, H);
    out.getContext('2d').putImageData(data, 0, 0);
    let max = 0;
    for (const v of fit.alpha) max = Math.max(max, v);
    return { kind: 'image', ok: true, rect: fit.rect, out, max, size: fit.s * 0.8 * GEMINI.w, exact: !!found.exact, gemini: true, method: 'image' };
  }
  const isJpeg = (item) => /jpe?g/i.test(item.file.type || '') || /\.jpe?g$/i.test(item.name);
  async function encodeImage(item) {
    // the same kind of file as came in: PNG stays lossless, a JPEG stays a JPEG at high quality
    const type = isJpeg(item) ? 'image/jpeg' : 'image/png', c = item.model.out;
    if (c.convertToBlob) return c.convertToBlob({ type, quality: 0.95 });
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(uerr('The image could not be saved.'))), type, 0.95));
  }

  // ---------- encode ----------
  function targetBitrate(info, q) {
    const pps = info.w * info.h * info.fps, src = info.bitrate || pps * 0.1;
    return Math.round(q === 'max' ? clamp(src * 2.5, pps * 0.12, 150e6) : clamp(src * 1.5, pps * 0.07, 100e6));
  }
  async function convert(item, model, onP, live) {
    const input = openInput(item.file);
    try {
      const target = new MB.BufferTarget();
      const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      const quality = new MB.Quality({ bitrate: targetBitrate(item.info, S.quality), bitrateMode: 'variable' });
      const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: item.info.w, height: item.info.h, quality });
      if (!codec) throw uerr('This browser cannot encode video at this resolution. Use a recent Chrome or Edge on a computer.');
      const holder = {};
      let frameNo = 0;
      const conv = await MB.Conversion.init({
        input, output, showWarnings: false,
        video: {
          codec, quality, forceTranscode: true,
          process: async (s) => {
            const out = await cleanSample(s, model, holder);
            if (live && frameNo++ % 6 === 0) { try { live(s, out); } catch (e) { /* only a preview */ } }
            return out;
          },
        },
      });
      if (!conv.isValid) {
        const why = conv.discardedTracks.map((d) => d.track.type + ': ' + d.reason).join(', ');
        throw uerr('This video cannot be converted (' + why + ').');
      }
      conv.onProgress = (p) => onP(p);
      S.conv = conv;
      await conv.execute();
      S.conv = null;
      item.outCodec = codec;
      return new Blob([target.buffer], { type: 'video/mp4' });
    } finally { S.conv = null; try { input.dispose(); } catch (e) { /* closed */ } }
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
    if (it.msg || it.model) return 'nologo';
    return 'queued';
  }
  const TODO = new Set(['opening', 'queued', 'finding', 'ready']);
  const isTodo = (it) => !it.removed && TODO.has(phase(it));
  const doneItems = () => S.items.filter((i) => i.status === 'done' && i.result);
  const unsavedItems = () => doneItems().filter((i) => !i.saved);
  function counts() {
    const c = { opening: 0, queued: 0, finding: 0, ready: 0, nologo: 0, working: 0, done: 0, error: 0 };
    for (const it of S.items) c[phase(it)]++;
    return c;
  }
  const weight = (it) => (it.kind === 'video' && it.info ? Math.max(1, (it.info.dur - it.info.first) * it.info.fps) : 24);
  const logoName = (m) => (m && (m.kind === 'image' || m.gemini) ? 'Gemini sparkle' : m && m.veo ? 'Veo text mark' : 'Logo');

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
    const g = cuGeom(m.rect, it.info.w, it.info.h);
    try {
      if (it.kind === 'image') {
        cuDraw(it.bmp, c.b, g, false);
        if (from === 'result' && it.result) {
          const bmp = await createImageBitmap(it.result);
          try { cuDraw(bmp, c.a, g, false); } finally { bmp.close(); }
        } else cuDraw(m.out, c.a, g, false);
      } else {
        const t = thumbTime(it);
        await withSampleAt(it.file, t, async (s) => {
          cuDraw(s, c.b, g, true);
          if (from === 'result' && it.result) return;
          const out = await cleanSample(s, m, {});
          try { cuDraw(out, c.a, g, true); } finally { if (out !== s) out.close(); }
        });
        if (from === 'result' && it.result) await withSampleAt(it.result, t, async (r) => cuDraw(r, c.a, g, true));
      }
      it.cuHas = true; it.cuKind = from;
    } catch (e) { /* no close-ups for this file; the card still works */ }
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
  const P = { item: null, input: null, sink: null, busy: false, pending: false, holder: {}, orig: null, proc: null, has: false, token: 0, playing: false, loop: null };
  function closePreview() {
    P.token++; P.playing = false;
    if (P.input) { try { P.input.dispose(); } catch (e) { /* closed */ } }
    P.input = null; P.sink = null; P.item = null; P.has = false;
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
    S.splitSet = false;
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
    return item.model && item.model.ok ? item.model : null;
  }
  function previewTime(item) { const i = item.info; return i.first + S.frac * Math.max(0, i.dur - i.first - 1 / i.fps); }
  const setTc = (t, dur) => { tcEl.innerHTML = '<b>' + tc(t) + '</b> / ' + tc(dur); };
  async function drawSample(s, item) {
    s.draw(P.orig.getContext('2d'), 0, 0, P.orig.width, P.orig.height);
    const px = P.proc.getContext('2d'), model = previewModel(item);
    if (model) {
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
  function play() {
    const item = P.item;
    if (!item || item.kind !== 'video' || !P.sink || P.playing || S.busy) return;
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
    const m = previewModel(item);
    if (m) return m.rect;
    if (item.detected) return item.detected.rect;
    return null;
  }
  function drawView() {
    if (!P.has) return;
    const model = previewModel(P.item), mode = viewMode(), W = view.width, H = view.height, r = currentRect();
    if (r && !S.splitSet) S.split = clamp((r.x + r.w / 2) / W, 0.08, 0.92);
    if (mode === 'original') vctx.drawImage(P.orig, 0, 0);
    else {
      vctx.drawImage(P.proc, 0, 0);
      const x = Math.round(S.split * W);
      if (mode === 'split' && x > 0) vctx.drawImage(P.orig, 0, 0, x, H, 0, 0, x, H);
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
    const maxH = clamp(window.innerHeight - 290, 220, 720);
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
  const canDraw = () => !!(P.has && !S.busy && P.item);
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
    const r = P.has && (boxOn() || viewMode() === 'original') ? currentRect() : null;
    if (r && view.width) {
      const k = overlay.width / view.width;
      const x = Math.round(r.x * k) + 0.5, y = Math.round(r.y * k) + 0.5, w = Math.round(r.w * k), h = Math.round(r.h * k);
      const dash = 6 * dpr, gap = 4 * dpr, off = reduceMotion ? 0 : -((ts / 45) % (dash + gap));
      octx.lineWidth = 1.5 * dpr; octx.setLineDash([dash, gap]);
      octx.lineDashOffset = off; octx.strokeStyle = '#FFFFFF'; octx.strokeRect(x, y, w, h);
      octx.lineDashOffset = off + dash; octx.strokeStyle = tokens.mask; octx.strokeRect(x, y, w, h);
      octx.setLineDash([]);
      octx.font = '600 ' + Math.round(12 * dpr) + 'px "Geist Variable", system-ui, sans-serif';
      const label = drag && drag.rect ? 'New box' : 'Logo';
      const tw = octx.measureText(label).width + 10 * dpr, th = 18 * dpr;
      const ly = y - th >= 0 ? y - th : y + h;
      octx.fillStyle = tokens.mask; octx.fillRect(x - 0.5, ly, tw, th);
      octx.fillStyle = tokens.maskInk; octx.textBaseline = 'middle'; octx.fillText(label, x + 4.5 * dpr, ly + th / 2 + 0.5);
    }
    overlayRaf = requestAnimationFrame(drawOverlay);
  }
  const startOverlay = () => { if (!overlayRaf) overlayRaf = requestAnimationFrame(drawOverlay); };
  const stopOverlay = () => { if (overlayRaf) cancelAnimationFrame(overlayRaf); overlayRaf = 0; };

  function toFrame(e) {
    const b = overlay.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) * view.width / b.width, 0, view.width), y: clamp((e.clientY - b.top) * view.height / b.height, 0, view.height) };
  }
  overlay.addEventListener('pointerdown', (e) => {
    if (!boxOn() || e.button > 0) return;
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
  stage.addEventListener('pointerdown', (e) => {
    if (boxOn() || viewMode() !== 'split' || e.button > 0) return;
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
    playBtn.disabled = !video || S.busy;
    playBtn.classList.toggle('is-playing', P.playing);
    playBtn.setAttribute('aria-label', P.playing ? 'Pause preview' : 'Play preview');
  }

  // ---------- the review window ----------
  const reviewItem = () => getItem(S.reviewId);
  let rvOpener = null;
  async function openReview(it) {
    if (!it || !it.info || it.removed) return;
    S.reviewId = it.id; S.boxMode = false;
    if (reviewEl.hidden) { rvOpener = document.activeElement; reviewEl.hidden = false; lockScroll(true); }
    layoutStage(); rvRender(); startOverlay();
    $('#rvCard').focus({ preventScroll: true });
    try { await openPreview(it); } catch (e) { setNote('Could not open the preview: ' + errText(e), 'warn'); }
    rvRender();
  }
  async function closeReview() {
    if (reviewEl.hidden) return;
    reviewEl.hidden = true; lockScroll(false); stopOverlay();
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
  function rvRender() {
    if (reviewEl.hidden) return;
    const it = reviewItem();
    if (!it) return;
    const mode = viewMode(), box = boxOn(), idx = S.items.indexOf(it);
    rvTitle.textContent = it.name;
    rvMeta.textContent = it.info ? itemMeta(it) : '';
    rvNav.hidden = S.items.length < 2;
    rvCount.textContent = (idx + 1) + ' / ' + S.items.length;
    rvPrev.disabled = idx <= 0; rvNext.disabled = idx >= S.items.length - 1;
    stage.classList.toggle('is-boxing', box);
    boxHint.hidden = !box || !!drag;
    boxHintText.textContent = needsBox(it) && !S.boxMode ? 'No logo found. Drag a box around it.' : 'Drag a box around the logo';
    for (const b of [boxBtn, boxBtn2]) { b.disabled = !canDraw(); b.setAttribute('aria-pressed', String(!!S.boxMode)); }
    boxBtn.querySelector('span').textContent = S.boxMode ? 'Cancel box' : 'Draw a box';
    boxBtn2.textContent = S.boxMode ? 'Cancel box' : 'Draw a box';
    viewSeg.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.view === mode)); b.disabled = !previewModel(it); });
    const ph = phase(it);
    const afterName = it.status === 'done' && it.result ? 'Result' : 'Preview';
    setText(viewSeg.querySelector('[data-view="result"]'), afterName); setText(stageTagR, afterName);
    stageMsg.hidden = P.has;
    stageMsg.innerHTML = it.status === 'error' ? '<b>Can’t show this file</b><span>' + esc(explain(it).text) + '</span>' : '<b>Opening the preview…</b>';
    pill(ph === 'finding' ? (it.progress < 0.3 ? 'Finding the logo…' : 'Measuring the logo…') : ph === 'queued' ? 'In line to find the logo…' : '');
    // controls that are off say why
    const paused = S.busy ? 'Paused while files are being processed' : '';
    playBtn.title = paused; boxBtn.title = paused; boxBtn2.title = paused; redetectBtn.title = paused;
    rvHint.hidden = !S.busy; rvHint.textContent = S.busy ? 'Playback and drawing are paused while files are being processed.' : '';
    redetectBtn.disabled = !it.info || S.busy || ph === 'finding';
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
      html = logoState('ok', logoName(m) + ' found', (it.manual ? 'Your box. ' : '') + (opaque ? 'Parts of it are fully solid; those pixels are filled in from around them.' : 'It is see-through, so the real picture underneath is restored.')) +
        '<details class="details"><summary>Technical details</summary><dl class="kv">' + kv + '</dl></details>';
    } else if (m && !m.ok) {
      html = logoState('warn', 'No logo in that box', 'Draw a slightly bigger box around it.');
    } else if (ph === 'error') {
      html = logoState('warn', it.info ? 'Couldn’t clean this file' : 'Can’t open this file', esc(explain(it).text));
    } else {
      html = logoState('warn', it.manual ? 'No logo in that box' : 'No logo found', 'Click “Draw a box”, then drag a rectangle around it, a little bigger than the logo.');
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
    const files = all.filter((f) => isVideoFile(f) || isImgFile(f));
    const ignored = all.length - files.length;
    if (!files.length) { setNote(source === 'folder' ? 'There are no videos or photos in that folder.' : 'No videos or photos found. Add MP4, MOV, WebM or PNG, JPG, WebP files.', 'warn'); return; }
    const have = new Set(S.items.map((i) => i.key)), fresh = [];
    let dupes = 0;
    for (const f of files) { const k = keyOf(f); if (have.has(k)) { dupes++; continue; } have.add(k); fresh.push(f); }
    const notes = [];
    if (ignored) notes.push(source === 'folder' ? plural(ignored, 'other file', 'other files') + ' in the folder ' + (ignored === 1 ? 'was' : 'were') + ' left out.' : plural(ignored, 'file is', 'files are') + ' not a video or photo and ' + (ignored === 1 ? 'was' : 'were') + ' left out.');
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
  async function followModel(it, ref, onP) {
    let rect = null, guess = null;
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
      }
    }
    const model = await learn(it, rect, (p) => onP(0.3 + p * 0.7), guess);
    if (!model.ok && ref.model && ref.model.ok && ref.model.W === it.info.w && ref.model.H === it.info.h && S.sameRect) return { model: ref.model, borrowed: true };
    return { model, borrowed: false };
  }
  // The one place a file's logo is measured: photos, the lead video, a video with a hand-drawn box, and followers.
  async function measure(it, manualRect, onP) {
    if (it.kind === 'image') {
      const model = await analyzeImage(it, manualRect);
      return { model, msg: model ? '' : manualRect ? 'No sparkle logo fits inside this box' : 'No logo found automatically' };
    }
    const ref = refItem();
    if (!manualRect && ref && it !== ref) {
      const r = await followModel(it, ref, onP);
      return { model: r.model, borrowed: r.borrowed, msg: r.model ? '' : 'No logo found automatically' };
    }
    let rect = manualRect, det = null;
    if (!rect) {
      det = await detectLogo(it, (p) => onP(p * 0.3));
      if (!det) return { model: null, msg: 'No logo found automatically' };
      rect = det.rect;
    }
    const detected = { rect, confidence: det ? det.confidence : null, manual: !!manualRect, gemini: !!(det && det.tmpl && !det.tmpl.veo), tmpl: det && det.tmpl };
    const model = await learn(it, rect, (p) => onP(0.3 + p * 0.7), det && det.tmpl);
    return { model, msg: '', detected, rect };
  }
  function applyMeasure(it, r, manualRect) {
    it.manual = !!manualRect;
    it.model = r.model; it.msg = r.msg || ''; it.detected = r.detected || null; it.borrowed = !!r.borrowed;
    if (!(it.model && it.model.ok)) it.cuHas = false;
    if (it.kind === 'video' && it.id === S.refId && r.rect) {
      S.rectRel = toRel(r.rect, it.info.w, it.info.h);
      // the others follow the lead's box, so drop what they measured for the old one
      for (const o of S.items) if (o !== it && o.kind === 'video' && !o.manual && o.status === 'ready' && !o.removed) { o.model = null; o.borrowed = false; o.msg = ''; o.cuHas = false; updItem(o); }
    }
  }
  const idleWaiters = [];
  const waitAnalyzing = () => (S.analyzing ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());
  const progressTick = (fn) => { let last = 0; return (p) => { const now = performance.now(); if (p < 1 && now - last < 90) return; last = now; fn(p); }; };

  async function analyzeOne(it, manualRect) {
    if (S.analyzing || S.busy || it.removed || !it.info) return;
    S.analyzing = true;
    it.status = 'analyzing'; it.msg = ''; it.progress = 0; it.borrowed = false;
    updItem(it); renderBar(); rvRender();
    let r = null;
    try {
      r = await measure(it, manualRect, progressTick((p) => { it.progress = p; updItem(it); renderLogo(); }));
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
      while (alive && !S.busy && !S.analyzing) {
        const it = nextToAnalyze();
        if (!it) break;
        const rect = it.boxReq || null; it.boxReq = null;
        await analyzeOne(it, rect);
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
  function requestBox(it, rect) {
    if (!it || !it.info || S.busy || it.removed) return;
    it.model = null; it.msg = ''; it.borrowed = false; it.cuHas = false; it.boxReq = rect;
    updItem(it); render(); pump();
  }
  function retryItem(it) {
    if (!it || S.busy || it.removed) return;
    it.msg = ''; it.model = null; it.detected = null; it.borrowed = false; it.manual = false; it.cuHas = false; it.boxReq = null;
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
      if (it.status === 'error' || phase(it) === 'nologo') continue;
      const w = weight(it);
      W += w;
      D += w * (it.status === 'done' ? 1 : it.status === 'encoding' ? clamp(it.progress, 0, 1) : 0);
    }
    return W ? D / W : 0;
  }
  // frames being cleaned, drawn into the card as they go (a preview only: the output never depends on it)
  function liveFor(it) {
    const c = it.card;
    if (!c || !it.model) return null;
    const g = cuGeom(it.model.rect, it.info.w, it.info.h), lctx = c.live.getContext('2d'), cr = coverRect(it.info.w, it.info.h, c.live.width / c.live.height);
    it.liveOn = true;
    return (s, out) => {
      if (it.removed) return;
      cuDraw(s, c.b, g, true); cuDraw(out, c.a, g, true);
      out.draw(lctx, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, c.live.width, c.live.height);
      it.cuHas = true;
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
    const t0 = performance.now();
    try {
      await waitAnalyzing();
      for (;;) {
        if (S.cancel) break;
        const it = S.items.find(isRunnable);
        if (!it) {
          // files that were still being opened when the run got to the end of the list
          if (S.items.some((x) => !x.removed && (x.status === 'new' || x.status === 'probing'))) { await sleep(120); continue; }
          break;
        }
        it.runId = S.runId;
        // a file the background queue hasn't reached yet is measured right here
        if (!it.model) {
          const rect = it.boxReq || null; it.boxReq = null;
          it.status = 'learning'; it.progress = 0; updItem(it); updTotal();
          try {
            applyMeasure(it, await measure(it, rect, progressTick((p) => { it.progress = p; updItem(it); })), rect);
          } catch (e) {
            if (S.cancel || (e && e.userMsg === 'Stopped.')) { it.status = 'ready'; it.progress = 0; it.stopped = true; updItem(it); break; }
            it.status = 'error'; it.msg = errText(e); updItem(it); updTotal();
            continue;
          }
          it.status = 'ready';
          if (!(it.model && it.model.ok)) { updItem(it); updTotal(); continue; }
          await makeCloseups(it, 'preview');
        }
        it.status = 'encoding'; it.progress = it.kind === 'image' ? 0.5 : 0; it.encT0 = performance.now(); it.fps = 0;
        const live = it.kind === 'video' ? liveFor(it) : null;
        updItem(it); render(); updTotal();
        try {
          if (it.kind === 'image') it.result = await encodeImage(it);
          else it.result = await convert(it, it.model, progressTick((p) => { it.progress = p; updItem(it); updTotal(); }), live);
          it.status = 'done'; it.msg = ''; it.doneQuality = S.quality; it.saved = false; it.progress = 1; S.runDid++;
          it.liveOn = false; updItem(it); updTotal();
          announce(it.name + ' is finished');
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
    for (const it of S.items) if (it.status === 'done') { it.status = 'ready'; it.result = null; it.saved = false; it.progress = 0; it.cuKind = 'preview'; }
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
      '<div class="job-bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" hidden><i></i></div>' +
      '<div class="job-foot">' +
        '<div class="cu" hidden><figure><canvas class="cu-b" width="' + CU_W + '" height="' + CU_H + '"></canvas><figcaption>Before</figcaption></figure>' +
          '<span class="cu-arrow">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>' + '</span>' +
          '<figure><canvas class="cu-a" width="' + CU_W + '" height="' + CU_H + '"></canvas><figcaption class="cu-a-cap">After</figcaption></figure></div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn-soft sm" data-act="review">Review</button>' +
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
      cuWrap: q('.cu'), b: q('.cu-b'), a: q('.cu-a'), aCap: q('.cu-a-cap'),
      thumbBtn: q('.job-thumb'), removeBtn: q('[data-act="remove"]'),
      review: q('.job-actions [data-act="review"]'), box: q('[data-act="box"]'), retry: q('[data-act="retry"]'), download: q('[data-act="download"]'), downloadLabel: q('[data-act="download"] span'),
    };
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
  function statusOf(it, ph) {
    const p = clamp(it.progress || 0, 0, 1);
    switch (ph) {
      case 'opening': return { tone: 'run', title: 'Opening the file…', sub: '' };
      case 'queued': return { tone: 'idle', title: 'In line to find the logo', sub: '' };
      case 'finding': return { tone: 'run', title: p < 0.3 ? 'Finding the logo…' : 'Measuring the logo…', sub: pct(p) };
      case 'ready':
        if (S.busy && it.runId === S.runId) return { tone: 'idle', title: 'Waiting in line', sub: 'Starts after the file above' };
        if (it.stopped) return { tone: 'idle', icon: 'stop', title: 'Stopped before it finished', sub: 'It will start again from the beginning' };
        if (it.borrowed) return { tone: 'warn', title: 'Using the first video’s logo settings', sub: 'This video’s own check failed. If traces remain, clean it on its own.' };
        return { tone: 'ok', icon: 'found', title: logoName(it.model) + ' found', sub: (S.stopped ? 'Paused · press Continue to clean it' : 'Cleaning starts by itself') + (it.manual ? ' · your box' : '') };
      case 'nologo':
        if (it.manual || (it.model && !it.model.ok)) return { tone: 'warn', title: 'No logo in that box', sub: 'Draw a slightly bigger box around it.' };
        return { tone: 'warn', title: 'No logo found', sub: 'Draw a box around the logo to clean this file.' };
      case 'working': return { tone: 'run', title: it.status === 'learning' ? 'Measuring the logo…' : S.stopping ? 'Stopping…' : 'Removing the logo…', sub: it.kind === 'image' ? '' : pct(p) };
      case 'done': return { tone: 'ok', title: 'Finished', sub: fmtMB(it.result ? it.result.size : 0) + (it.saved ? ' · downloaded' : ' · ready to download') };
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
    const barOn = ph === 'finding' || ph === 'working';
    c.bar.hidden = !barOn;
    if (barOn) { const v = (clamp(it.progress, 0, 1) * 100).toFixed(1); c.barI.style.width = v + '%'; c.bar.setAttribute('aria-valuenow', String(Math.round(+v))); }
    c.cuWrap.hidden = !(it.cuHas && (ph === 'ready' || ph === 'working' || ph === 'done'));
    setText(c.aCap, ph === 'working' ? 'After (live)' : ph === 'done' && it.cuKind === 'result' ? 'After (result)' : 'After (preview)');
    const live = !!it.liveOn && ph === 'working';
    c.live.hidden = !live; c.liveTag.hidden = !live;
    c.review.hidden = !it.info || ph === 'error';
    c.box.hidden = ph !== 'nologo';
    c.box.classList.toggle('primary', ph === 'nologo');
    c.retry.hidden = !(ph === 'error' || ph === 'nologo' || (ph === 'ready' && it.borrowed));
    c.box.disabled = c.retry.disabled = S.busy;
    c.box.title = c.retry.title = S.busy ? 'Available when the files being cleaned are finished' : '';
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
    });
  }

  // ---------- the page ----------
  function render() {
    const has = S.items.length > 0;
    welcomeEl.hidden = has; jobArea.hidden = !has; barEl.hidden = !has;
    reconcileCards();
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
    sameRow.hidden = videos < 2;
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
    const runItems = S.items.filter((i) => i.runId === S.runId && i.status !== 'error' && phase(i) !== 'nologo' && !i.removed);
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
    abSecondary.hidden = !o.secondary;
    if (o.secondary) { abSecondary.dataset.act = o.secondary.act; abSecondary.disabled = !!o.secondary.disabled; abSecondary.innerHTML = (o.secondary.icon || '') + '<span></span>'; abSecondary.lastChild.textContent = o.secondary.label; }
  }
  // what is wrong with the files that will not be cleaned, in a few words
  function issueParts(c) {
    const out = [], open = S.items.filter((i) => i.status === 'error' && !i.info && !i.removed).length, clean = c.error - open;
    if (c.nologo) out.push(c.nologo === 1 ? '1 file needs a box' : c.nologo + ' files need a box');
    if (open) out.push(open === 1 ? '1 file can’t be opened' : open + ' files can’t be opened');
    if (clean) out.push(clean === 1 ? '1 file couldn’t be cleaned' : clean + ' files couldn’t be cleaned');
    return out;
  }
  const spanText = (s) => (s < 90 ? s + ' s' : Math.round(s / 60) + ' min');
  function renderBar() {
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
      setBar({
        tone: 'ok', icon: ICON.ok, title: issues.length ? plural(done, 'file', 'files') + ' done' : done === 1 ? 'Your file is done' : 'All done',
        sub: [plural(done, 'file', 'files') + ' · ' + sizeDone, took, saved ? 'downloaded' : '', ...issues].filter(Boolean).join(' · '),
        primary: { act: 'save', label: saved ? (done === 1 ? 'Download again' : 'Download all again (ZIP)') : done === 1 ? 'Download' : 'Download all (ZIP)', icon: ICON.save, disabled: S.zipping, busy: S.zipping },
        secondary: stale ? { act: 'redo', label: 'Redo in ' + (S.quality === 'max' ? 'best quality' : 'smaller files'), icon: ICON.redo } : { act: 'startover', label: 'Start over' },
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
      tone: 'warn', icon: ICON.warn, title: c.nologo ? 'No logo found yet' : 'Nothing to clean',
      sub: c.nologo ? 'Open a file marked in amber and draw a box around the logo.' : 'Remove the files that can’t be opened, or add others.',
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
    if (!btn) return;
    const it = getItem(+btn.closest('[data-id]').dataset.id);
    if (!it) return;
    switch (btn.dataset.act) {
      case 'review': openReview(it); break;
      case 'download': if (it.result) { saveBlob(it.result, outName(it)); it.saved = true; updItem(it); renderBar(); } break;
      case 'retry': retryItem(it); break;
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
    if (e.key === 'Escape') { e.preventDefault(); if (S.boxMode) { S.boxMode = false; drag = null; rvRender(); } else closeReview(); return; }
    if (e.key === 'Tab') {
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
  window.__tool = { S, P, leaveWarning };

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
      scrollLocks = 0; document.documentElement.style.overflow = '';
      ac.abort();
      cleanups.forEach((f) => f());
      closePreview();
      if (window.__tool && window.__tool.S === S) delete window.__tool;
    },
  };
}
