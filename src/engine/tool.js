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
  const stagePill = $('#stagePill'), stagePillText = $('#stagePillText');
  const scrub = $('#scrub'), tcEl = $('#tc'), playBtn = $('#playBtn'), splitEl = $('#split');
  const boxHint = $('#boxHint'), boxHintText = $('#boxHintText'), viewSeg = $('#viewSeg'), boxBtn = $('#boxBtn'), boxBtn2 = $('#boxBtn2');
  const loupes = $('#loupes'), loupeA = $('#loupeA'), loupeB = $('#loupeB'), viewerHint = $('#viewerHint');
  const vName = $('#vName'), vMeta = $('#vMeta'), stageMsg = $('#stageMsg');
  const fileEl = $('#file'), dropEl = $('#drop'), queueEl = $('#queue'), dropOverlay = $('#dropOverlay');
  const welcomeEl = $('#welcome'), workspaceEl = $('#workspace'), stepperEl = $('#stepper');
  const sampleCard = $('#sampleCard'), sampleBtn = $('#sampleBtn'), welcomeNote = $('#welcomeNote');
  const fileCount = $('#fileCount'), filesTotal = $('#filesTotal'), clearBtn = $('#clearBtn');
  const logoInfo = $('#logoInfo'), logoChip = $('#logoChip'), redetectBtn = $('#redetect'), sameRectEl = $('#sameRect'), sameRow = $('#sameRow');
  const qMax = $('#qMax'), qHigh = $('#qHigh'), qNote = $('#qNote');
  const readyBox = $('#readyBox'), runBtn = $('#runBtn'), runLabel = $('#runLabel'), runWhy = $('#runWhy'), cancelBtn = $('#cancelBtn');
  const totalEl = $('#total'), totalFill = $('#totalFill'), totalText = $('#totalText'), totalPct = $('#totalPct'), totalEta = $('#totalEta'), totalSub = $('#totalSub');
  const doneBox = $('#doneBox'), doneTitle = $('#doneTitle'), doneSub = $('#doneSub'), saveBtn = $('#saveBtn'), saveLabel = $('#saveLabel');
  const moreBtn = $('#moreBtn'), noteEl = $('#note');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- small helpers ----------
  const bn = (n) => String(n);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const idle = () => new Promise((r) => setTimeout(r, 0));
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
  function setNote(text, kind) {
    for (const el of [noteEl, welcomeNote]) {
      el.textContent = text || '';
      el.className = 'msg' + (kind ? ' is-' + kind : '');
      el.hidden = !text;
    }
  }
  const baseName = (n) => (n || 'video').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90) || 'video';

  // ---------- state ----------
  const S = {
    items: [], refId: null, selId: null, rectRel: null, sameRect: true, quality: 'max',
    busy: false, analyzing: false, cancel: false, frac: 0.25, conv: null, intake: false,
    view: 'split', split: 0.5, splitSet: false, boxMode: false, runT0: 0, eta: null, lastSecs: 0,
  };
  let nextId = 1;
  const getItem = (id) => S.items.find((i) => i.id === id) || null;
  const refItem = () => getItem(S.refId);
  const selItem = () => getItem(S.selId);

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
  async function convert(item, model, onP) {
    const input = openInput(item.file);
    try {
      const target = new MB.BufferTarget();
      const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      const quality = new MB.Quality({ bitrate: targetBitrate(item.info, S.quality), bitrateMode: 'variable' });
      const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: item.info.w, height: item.info.h, quality });
      if (!codec) throw uerr('This browser cannot encode video at this resolution. Use a recent Chrome or Edge on a computer.');
      const holder = {};
      const conv = await MB.Conversion.init({
        input, output, showWarnings: false,
        video: { codec, quality, forceTranscode: true, process: (s) => cleanSample(s, model, holder) },
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

  // ---------- preview ----------
  const P = { item: null, input: null, sink: null, busy: false, pending: false, holder: {}, orig: null, proc: null, has: false, token: 0, playing: false, loop: null };
  function closePreview() {
    P.playing = false;
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
    P.token++;
    S.splitSet = false;
    const { w, h } = item.info;
    if (item.kind === 'image') {
      P.item = item; P.orig = makeCanvas(w, h); P.proc = makeCanvas(w, h);
    } else {
      const input = openInput(item.file);
      const track = await input.getPrimaryVideoTrack();
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
      drawView();
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
  }

  // Plays the preview from the timeline position, cleaning each frame as it goes (slower than real
  // time on big videos, never faster).
  function play() {
    const item = P.item;
    if (!item || item.kind !== 'video' || !P.sink || P.playing || S.busy) return;
    P.playing = true;
    renderTransport();
    P.loop = (async () => {
      while (P.busy) await new Promise((r) => setTimeout(r, 16));
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
    loupes.hidden = !r; viewerHint.hidden = !!r;
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
    const shown = loupeA.getBoundingClientRect().width || cv0w;
    const z = shown / sw;
    $('#zoomA').textContent = $('#zoomB').textContent = z >= 1.05 ? z.toFixed(1) + '× zoom' : '';
  }
  const cv0w = 480;

  // ---------- stage + overlay ----------
  let dpr = 1;
  function layoutStage() {
    const avail = stageWrap.clientWidth;
    if (!avail) return;
    const W = view.width || 16, H = view.height || 9;
    const maxH = clamp(window.innerHeight - 300, 260, 720);
    let w = avail, h = w * H / W;
    if (h > maxH) { h = maxH; w = h * W / H; }
    stage.style.width = Math.floor(w) + 'px'; stage.style.height = Math.floor(h) + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(Math.floor(w) * dpr); overlay.height = Math.round(Math.floor(h) * dpr);
  }
  const ro = new ResizeObserver(() => { layoutStage(); drawView(); });
  ro.observe(stageWrap);
  cleanups.push(() => ro.disconnect());

  let tokens = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    tokens = { mask: cs.getPropertyValue('--mask').trim() || '#CC2156', maskInk: cs.getPropertyValue('--mask-ink').trim() || '#fff' };
  }
  readTokens();

  let drag = null;
  const canDraw = () => P.has && !S.busy && !S.analyzing && P.item;
  // a box is needed when the shown file has no logo to work with
  const needsBox = (it) => !!(it && it.info && it.status === 'ready' && !previewModel(it) && (it.msg || (it.model && !it.model.ok)));
  const boxOn = () => !!canDraw() && (S.boxMode || needsBox(P.item));

  function drawOverlay(ts) {
    if (!alive) return;
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
    requestAnimationFrame(drawOverlay);
  }
  requestAnimationFrame(drawOverlay);

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
    analyze(P.item, evenRect(r, view.width, view.height));
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

  // ---------- intake ----------
  function addFiles(list) {
    const isVideo = (f) => (f.type && f.type.startsWith('video/')) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);
    const files = [...list].filter((f) => isVideo(f) || isImageFile(f));
    const skipped = list.length - files.length;
    if (!files.length) { setNote('No videos or photos found. Add MP4, MOV, WebM or PNG, JPG, WebP files.', 'warn'); return; }
    files.forEach((file) => S.items.push({ id: nextId++, file, name: file.name, size: file.size, kind: isVideo(file) ? 'video' : 'image', status: 'new', progress: 0, info: null, model: null, detected: null, result: null, msg: '', thumb: null }));
    setNote(skipped ? skipped + (skipped === 1 ? ' file is' : ' files are') + ' not a video or photo and ' + (skipped === 1 ? 'was' : 'were') + ' skipped.' : '', skipped ? 'warn' : '');
    render();
    intake();
  }
  // A small picture of each file for the list.
  async function makeThumb(item) {
    try {
      const TW = 128, TH = 80, c = document.createElement('canvas');
      c.width = TW; c.height = TH;
      const cx = c.getContext('2d'), { w, h } = item.info, k = Math.max(TW / w, TH / h);
      const dw = w * k, dh = h * k, dx = (TW - dw) / 2, dy = (TH - dh) / 2;
      if (item.kind === 'image') cx.drawImage(item.bmp, dx, dy, dw, dh);
      else {
        await withTrack(item, async (track) => {
          const sink = new MB.VideoSampleSink(track), i = item.info;
          const s = await sink.getSample(i.first + Math.min(1, (i.dur - i.first) * 0.3));
          if (s) { try { s.draw(cx, dx, dy, dw, dh); } finally { s.close(); } }
        });
      }
      item.thumb = c.toDataURL('image/jpeg', 0.8);
      updItem(item);
    } catch (e) { /* the list shows an icon instead */ }
  }
  async function intake() {
    if (S.intake) return;
    S.intake = true;
    try {
      for (let k = 0; k < S.items.length; k++) {
        const it = S.items[k];
        if (it.info || it.status === 'error') continue;
        it.status = 'probing'; updItem(it);
        try { await (it.kind === 'image' ? probeImage(it) : probe(it)); it.status = 'ready'; } catch (e) { it.status = 'error'; it.msg = errText(e); }
        updItem(it);
        if (it.info) await makeThumb(it);
        if (!refItem() || refItem().status === 'error' || (refItem().kind === 'image' && it.kind === 'video' && it.info)) {
          // a video leads when there is one (the others follow its logo box); else the first photo
          const ref = S.items.find((i) => i.info && i.status !== 'error' && i.kind === 'video') || S.items.find((i) => i.info && i.status !== 'error');
          if (ref && ref.id !== S.refId) { S.refId = ref.id; await select(ref); if (!ref.model) analyze(ref); }
        }
        if (it.kind === 'image' && it.info && it.id !== S.refId && !it.model) analyze(it);
      }
    } finally { S.intake = false; render(); }
  }

  async function select(item) {
    if (!item || !item.info) return;
    S.selId = item.id; S.boxMode = false;
    render();
    try { await openPreview(item); } catch (e) { setNote('Could not open the preview: ' + errText(e), 'warn'); }
    render();
    prepareFollower(item);
  }

  function pill(text) { stagePill.hidden = !text; stagePillText.textContent = text || ''; }

  async function analyze(item, manualRect) {
    if (!item || !item.info || S.busy) return;
    if (S.analyzing) { if (!manualRect && !item.model) item.waiting = true; return; }
    S.analyzing = true;
    item.status = 'analyzing'; item.msg = ''; item.progress = 0; item.borrowed = false;
    render();
    try {
      if (item.kind === 'image') {
        pill(manualRect ? 'Fitting the logo inside your box…' : 'Looking for the logo…');
        item.model = await analyzeImage(item, manualRect);
        item.manual = !!manualRect; item.status = 'ready';
        if (!item.model) item.msg = manualRect ? 'No sparkle logo fits inside this box' : 'No logo found automatically';
        return;
      }
      let rect = manualRect, det = null;
      if (!rect) {
        pill('Looking for the logo…');
        det = await detectLogo(item, (p) => { item.progress = p * 0.3; updItem(item); renderLogo(); });
        if (!det) {
          item.model = null; item.detected = null; item.status = 'ready';
          item.msg = 'No logo found automatically';
          return;
        }
        rect = det.rect;
      }
      item.detected = { rect, confidence: det ? det.confidence : null, manual: !!manualRect, gemini: !!(det && det.tmpl && !det.tmpl.veo), tmpl: det && det.tmpl };
      pill('Measuring the logo’s transparency…');
      drawView();
      item.model = await learn(item, rect, (p) => { item.progress = 0.3 + p * 0.7; updItem(item); renderLogo(); }, det && det.tmpl);
      item.manual = !!manualRect;
      item.status = 'ready';
      if (item.id === S.refId) {
        S.rectRel = toRel(rect, item.info.w, item.info.h);
        // other videos follow the reference box, so drop what they learned for the old one
        S.items.forEach((o) => { if (o !== item && o.kind !== 'image' && !o.manual && o.status !== 'done') { o.model = null; o.borrowed = false; } });
      }
    } catch (e) {
      item.status = 'ready'; item.msg = errText(e);
    } finally {
      S.analyzing = false; S.cancel = false;
      pill('');
      render();
      if (P.item === item) { S.splitSet = false; renderPreview(); }
      // files that arrived while this was busy (the lead video first)
      const ref = refItem(), next = ref && ref.waiting ? ref : S.items.find((i) => i.waiting);
      if (next) { next.waiting = false; if (!next.model) analyze(next); }
      else if (selItem() && selItem() !== ref) prepareFollower(selItem());
    }
  }

  // ---------- batch ----------
  // the screen stays on while files are processed, so a laptop doesn't fall asleep mid-way
  let wake = null;
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

  // The logo model of a video that follows the lead file: its own logo when "same spot" is off (or
  // the lead is a photo or a Veo clip), else the lead's spot and exact position, measured in this video.
  async function followModel(it, ref, onP) {
    let rect = null, guess = null;
    if ((!S.sameRect || !S.rectRel || ref.kind === 'image' || (ref.model && ref.model.veo)) && it !== ref) {
      const d = await detectLogo(it, (p) => onP(p * 0.3));
      if (d) { rect = d.rect; guess = d.tmpl; }
    }
    if (!rect && !S.rectRel) return null;
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
    it.borrowed = false;
    if (!model.ok && ref.model.W === it.info.w && ref.model.H === it.info.h && S.sameRect) { it.borrowed = true; return ref.model; }
    return model;
  }
  // measures a following video when it is picked, so its preview shows its own result
  async function prepareFollower(it) {
    const ref = refItem();
    if (!it || !ref || it === ref || it.kind !== 'video' || !it.info || it.model || it.status !== 'ready' || it.msg || S.busy || S.analyzing || !(ref.model && ref.model.ok)) return;
    S.analyzing = true;
    it.status = 'analyzing'; it.progress = 0;
    render();
    pill('Measuring this video’s logo…');
    try {
      const m = await followModel(it, ref, (p) => { it.progress = p; updItem(it); renderLogo(); });
      if (m) it.model = m; else it.msg = 'No logo found automatically';
    } catch (e) { it.msg = errText(e); }
    finally {
      it.status = 'ready'; S.analyzing = false;
      pill('');
      render();
      if (P.item === it) { S.splitSet = false; renderPreview(); }
    }
  }

  async function runAll() {
    const ref = refItem();
    if (S.busy || S.analyzing || !ref || !ref.model || !ref.model.ok) return;
    await stopPlay();
    S.busy = true; S.cancel = false; S.runT0 = performance.now(); S.eta = null;
    keepAwake(true);
    setNote('');
    render();
    const t0 = performance.now();
    try {
      for (let k = 0; k < S.items.length; k++) {
        const it = S.items[k];
        if (S.cancel) break;
        if (it.status === 'done' || !it.info || it.status === 'error') continue;
        if (it.kind === 'image') {
          try {
            if (!it.model || !it.model.ok) { it.status = 'learning'; it.progress = 0.5; updItem(it); it.model = await analyzeImage(it); }
            if (!it.model || !it.model.ok) { it.status = 'skipped'; it.msg = 'No logo found in this photo. Select it, draw a box around the logo and run again.'; updItem(it); continue; }
            it.status = 'encoding'; it.progress = 0.5; updItem(it);
            it.result = await encodeImage(it);
            it.status = 'done'; it.msg = '';
          } catch (e) { it.status = 'error'; it.msg = errText(e); }
          updItem(it); updTotal();
          continue;
        }
        try {
          if (!it.model || !it.model.ok) {
            it.status = 'learning'; it.progress = 0; updItem(it); updTotal();
            const m = await followModel(it, ref, (p) => { it.progress = p; updItem(it); });
            if (!m) { it.status = 'skipped'; it.msg = 'No logo found automatically in this video. Select it and draw a box around the logo.'; updItem(it); continue; }
            it.model = m;
          }
          if (S.cancel) break;
          if (!it.model.ok) { it.status = 'skipped'; it.msg = 'No logo at that spot in this video. Select it, draw a box around the logo and run again.'; updItem(it); continue; }
          it.status = 'encoding'; it.progress = 0; it.encT0 = performance.now(); updItem(it); updTotal();
          it.result = await convert(it, it.model, (p) => { it.progress = p; updItem(it); updTotal(); });
          it.status = 'done'; it.msg = '';
        } catch (e) {
          if (S.cancel || (MB.ConversionCanceledError && e instanceof MB.ConversionCanceledError)) { it.status = 'ready'; it.msg = ''; it.progress = 0; break; }
          it.status = 'error'; it.msg = errText(e);
        }
        updItem(it); updTotal();
      }
    } finally {
      const done = S.items.filter((i) => i.status === 'done').length;
      S.lastSecs = Math.round((performance.now() - t0) / 1000);
      S.busy = false;
      keepAwake(false);
      if (S.cancel) setNote('Stopped. Files that finished can still be downloaded.');
      if (done && document.visibilityState === 'hidden') setTitle('✓ Done · '); else restoreTitle();
      S.cancel = false;
      render();
    }
  }
  function cancelAll() {
    S.cancel = true;
    if (S.conv) S.conv.cancel().catch(() => {});
    cancelBtn.disabled = true;
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
  const doneItems = () => S.items.filter((i) => i.status === 'done' && i.result);
  async function saveAll() {
    const done = doneItems();
    if (!done.length) return;
    if (done.length === 1) { saveBlob(done[0].result, outName(done[0])); return; }
    const total = done.reduce((s, i) => s + i.result.size, 0);
    if (total > 3.9 * 1073741824) { setNote('Together the files are over 4 GB, too big for one ZIP. Download them one by one from the list.', 'warn'); return; }
    saveBtn.disabled = true; saveLabel.textContent = 'Building the ZIP…';
    try { await saveBlob(await makeZip(done.map((i) => ({ name: outName(i), blob: i.result }))), 'clearframe-files.zip'); }
    finally { saveBtn.disabled = false; render(); }
  }

  // ---------- rendering ----------
  const STATUS = {
    new: 'Waiting', probing: 'Opening…', ready: 'Ready', analyzing: 'Finding the logo…', learning: 'Measuring the logo…',
    encoding: 'Removing the logo…', done: 'Done', skipped: 'Skipped', error: 'Can’t open',
  };
  const WORKING = ['probing', 'analyzing', 'learning', 'encoding'];
  const ICON = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9.5v5l4-2.5z"></path></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M21 16l-5-5-8 8"></path></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"></path></svg>',
    del: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11v5M12 7.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>',
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function itemMeta(it) {
    if (!it.info) return fmtMB(it.size);
    const i = it.info;
    if (it.kind === 'image') return i.w + '×' + i.h + ' · ' + fmtMB(it.size);
    return i.w + '×' + i.h + ' · ' + (i.dur - i.first).toFixed(1) + 's · ' + Math.round(i.fps) + 'fps · ' + fmtMB(it.size);
  }
  const fmtEta = (s) => (s < 8 ? 'Almost done' : s < 60 ? 'About ' + Math.max(10, Math.round(s / 5) * 5) + ' s left' : s < 5400 ? 'About ' + Math.round(s / 60) + ' min left' : 'About ' + (s / 3600).toFixed(1) + ' h left');

  function render() {
    const has = S.items.length > 0;
    welcomeEl.hidden = has; workspaceEl.hidden = !has;
    const it = P.item, mode = viewMode(), box = boxOn();
    stage.classList.toggle('is-boxing', box);
    boxHint.hidden = !box || !!drag;
    boxHintText.textContent = needsBox(it) && !S.boxMode ? 'No logo found automatically. Drag a box around it.' : 'Drag a box around the logo';
    for (const b of [boxBtn, boxBtn2]) { b.disabled = !canDraw(); b.setAttribute('aria-pressed', String(!!S.boxMode)); }
    boxBtn2.textContent = S.boxMode ? 'Cancel box' : 'Draw a box';
    viewSeg.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.view === mode)); b.disabled = !(it && previewModel(it)); });
    // what the empty preview says
    const allBad = has && S.items.every((x) => x.status === 'error');
    stageMsg.hidden = P.has || !has;
    stageMsg.innerHTML = allBad ? '<b>This file can’t be opened here</b><span>' + esc(S.items[0].msg) + '</span>'
      : S.items.some((x) => x.status === 'new' || x.status === 'probing') ? '<b>Opening your file…</b>' : '<b>Select a file to preview it</b>';
    vName.textContent = it ? it.name : '';
    vMeta.textContent = it && it.info ? itemMeta(it) : '';
    renderTransport();

    // file list (keeps keyboard focus on the same button across redraws)
    const focus = document.activeElement && queueEl.contains(document.activeElement) ? [document.activeElement.closest('[data-id]')?.dataset.id, document.activeElement.dataset.act] : null;
    queueEl.innerHTML = '';
    S.items.forEach((x) => {
      const li = document.createElement('li');
      li.className = 'file' + (x.id === S.selId ? ' is-sel' : '');
      li.dataset.id = x.id;
      li.innerHTML =
        '<button type="button" class="file-pick" data-act="pick"><span class="thumb"></span><span class="file-text"><span class="file-name"></span><span class="file-meta"></span></span></button>' +
        '<div class="file-acts"><button type="button" class="icon-btn" data-act="save" title="Download" aria-label="Download">' + ICON.save + '</button>' +
        '<button type="button" class="icon-btn" data-act="del" title="Remove from list" aria-label="Remove from list">' + ICON.del + '</button></div>' +
        '<div class="file-status"></div><div class="bar"><i></i></div>';
      li.querySelector('.file-name').textContent = x.name;
      li.querySelector('.file-pick').setAttribute('aria-label', 'Show ' + x.name);
      queueEl.appendChild(li);
      updItem(x);
    });
    if (focus && focus[0]) queueEl.querySelector('[data-id="' + focus[0] + '"] [data-act="' + focus[1] + '"]')?.focus();
    fileCount.textContent = has ? String(S.items.length) : '';
    filesTotal.textContent = has ? S.items.length + (S.items.length === 1 ? ' file' : ' files') + ' · ' + fmtMB(S.items.reduce((s, x) => s + x.size, 0)) : '';
    clearBtn.disabled = S.busy || S.analyzing;

    renderLogo();
    renderQuality();
    renderAction();
    renderStepper();
    redetectBtn.disabled = !selItem() || !selItem().info || S.busy || S.analyzing;
    sameRow.hidden = S.items.filter((x) => x.kind === 'video').length < 2;
    sameRectEl.disabled = S.busy;
  }
  function renderTransport() {
    const it = P.item, video = !!(it && it.kind === 'video' && P.has);
    scrub.disabled = !video;
    playBtn.disabled = !video || S.busy;
    playBtn.classList.toggle('is-playing', P.playing);
    playBtn.setAttribute('aria-label', P.playing ? 'Pause preview' : 'Play preview');
  }
  function updItem(it) {
    const li = queueEl.querySelector('[data-id="' + it.id + '"]');
    if (!li) return;
    li.querySelector('.file-meta').textContent = itemMeta(it);
    const th = li.querySelector('.thumb');
    if (th.dataset.src !== (it.thumb || it.kind)) {
      th.dataset.src = it.thumb || it.kind;
      th.innerHTML = (it.thumb ? '<img alt="" src="' + it.thumb + '">' : ICON[it.kind]) + '<span class="kind">' + (it.kind === 'image' ? 'Photo' : 'Video') + '</span>';
    }
    const working = WORKING.includes(it.status);
    const tone = it.status === 'done' ? (it.borrowed ? 'warn' : 'ok') : it.status === 'error' || it.status === 'skipped' || (it.msg && !working) ? 'warn' : working ? 'run' : 'idle';
    li.dataset.tone = tone;
    let text = it.status === 'analyzing' && it.progress >= 0.3 ? 'Measuring the logo…' : STATUS[it.status] || '';
    if (working && it.progress) text += ' ' + pct(it.progress);
    if (it.status === 'done' && it.result) text = 'Done · ' + fmtMB(it.result.size) + (it.borrowed ? ' · used the lead video’s logo measurement; if you see traces, process it on its own' : '');
    if (it.msg && !working) text = it.msg;
    const st = li.querySelector('.file-status');
    st.innerHTML = '<span class="st st-' + tone + '">' + (tone === 'run' ? '<span class="spin"></span>' : tone === 'ok' ? ICON.ok : tone === 'warn' ? ICON.warn : '') + '<span></span></span>' + (it.id === S.refId && S.items.length > 1 ? '<span class="lead" title="The other videos follow this file’s logo spot">Lead</span>' : '');
    st.querySelector('.st > span:last-child').textContent = text;
    if (it.status === 'encoding' && !it.encT0) it.encT0 = performance.now();
    const bar = li.querySelector('.bar');
    bar.hidden = !working;
    bar.querySelector('i').style.width = (clamp(it.progress, 0, 1) * 100).toFixed(1) + '%';
    li.querySelector('[data-act="save"]').hidden = it.status !== 'done';
    li.querySelector('[data-act="del"]').disabled = S.busy || S.analyzing;
  }
  function updTotal() {
    const items = S.items.filter((i) => i.info && i.status !== 'error');
    if (!S.busy || !items.length) return;
    let sum = 0;
    for (const i of items) sum += i.status === 'done' || i.status === 'skipped' ? 1 : i.status === 'encoding' ? 0.15 + 0.85 * i.progress : i.status === 'learning' ? 0.15 * i.progress : 0;
    const p = sum / items.length;
    totalFill.style.width = (p * 100).toFixed(1) + '%';
    totalPct.textContent = pct(p);
    const n = items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
    const cur = items.find((i) => i.status === 'learning' || i.status === 'encoding');
    totalText.textContent = cur ? (items.length > 1 ? 'File ' + (items.indexOf(cur) + 1) + ' of ' + items.length + ' · ' : '') + cur.name : n + ' of ' + items.length + ' finished';
    let sub = cur ? STATUS[cur.status] + ' ' + pct(cur.progress) : '';
    if (cur && cur.kind === 'video' && cur.status === 'encoding' && cur.encT0 && cur.progress > 0.02) {
      const secs = (performance.now() - cur.encT0) / 1000, frames = (cur.info.dur - cur.info.first) * cur.info.fps;
      if (secs > 0.5) sub += ' · ' + Math.round((cur.progress * frames) / secs) + ' frames/s';
    }
    totalSub.textContent = sub;
    const el = (performance.now() - S.runT0) / 1000;
    if (p > 0.02 && el > 3) {
      const raw = (el * (1 - p)) / p;
      S.eta = S.eta == null ? raw : S.eta * 0.85 + raw * 0.15;
      totalEta.textContent = fmtEta(S.eta);
    } else totalEta.textContent = 'Estimating time…';
    setTitle(pct(p) + ' · ');
  }
  function renderAction() {
    const ref = refItem(), done = doneItems();
    const todo = S.items.filter((i) => i.info && i.status !== 'done' && i.status !== 'error').length;
    const showDone = !S.busy && done.length > 0;
    totalEl.hidden = !S.busy;
    cancelBtn.disabled = false;
    doneBox.hidden = !showDone;
    readyBox.hidden = S.busy || (showDone && !todo);
    runBtn.disabled = !(ref && ref.model && ref.model.ok) || S.analyzing || !todo;
    runLabel.textContent = showDone ? 'Remove logo from ' + todo + ' more ' + (todo === 1 ? 'file' : 'files') : todo > 1 ? 'Remove logo from ' + todo + ' files' : 'Remove logo';
    let why = '', wait = false;
    if (S.items.length && !ref && S.items.some((i) => i.status === 'new' || i.status === 'probing')) { why = 'Opening your files…'; wait = true; }
    else if (S.items.length && !ref) why = 'None of these files could be opened.';
    else if (ref && (S.analyzing || ref.status === 'analyzing' || ref.status === 'probing')) { why = 'Checking the logo first…'; wait = true; }
    else if (ref && !(ref.model && ref.model.ok)) why = 'Draw a box around the logo on the preview first.';
    else if (todo) why = S.items.some((i) => i.kind === 'video' && i.info && i.status !== 'done') ? 'Same resolution, frame rate and audio as the original.' : 'Photos keep their format and size.';
    runWhy.textContent = why;
    runWhy.classList.toggle('is-wait', wait);
    if (showDone) {
      const total = done.reduce((s, i) => s + i.result.size, 0), skipped = S.items.filter((i) => i.status === 'skipped' || i.status === 'error').length;
      doneTitle.textContent = done.length === 1 ? 'Your file is ready' : done.length + ' files are ready';
      doneSub.textContent = fmtMB(total) + (S.lastSecs ? ' · took ' + (S.lastSecs < 90 ? S.lastSecs + ' s' : Math.round(S.lastSecs / 60) + ' min') : '') + (skipped ? ' · ' + skipped + ' not done, see the list' : '');
      saveLabel.textContent = done.length === 1 ? 'Download' : 'Download all (ZIP)';
      saveBtn.title = done.length === 1 ? outName(done[0]) : 'One ZIP with ' + done.length + ' files';
      moreBtn.hidden = false; moreBtn.textContent = 'Start over with new files';
    }
  }
  function renderStepper() {
    const ref = refItem(), has = S.items.length > 0, logoOk = !!(ref && ref.model && ref.model.ok), anyDone = doneItems().length > 0;
    const doneMap = { add: has, check: logoOk, remove: anyDone && !S.busy, save: false };
    let cur = ['add', 'check', 'remove', 'save'].find((k) => !doneMap[k]);
    if (S.busy) cur = 'remove';
    stepperEl.querySelectorAll('li').forEach((li) => {
      const k = li.dataset.step;
      li.dataset.state = k === cur ? 'cur' : doneMap[k] ? 'done' : 'todo';
      if (k === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  function logoState(tone, title, text) {
    return '<div class="logo-state ' + tone + '">' + (tone === 'run' ? '<span class="spin"></span>' : '<span class="ico">' + ICON[tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'info'] + '</span>') +
      '<div><b>' + title + '</b>' + (text ? '<span>' + text + '</span>' : '') + '</div></div>';
  }
  function renderLogo() {
    const it = selItem();
    let html = '', chip = '';
    if (!it) {
      const bad = S.items.length && S.items.every((x) => x.status === 'error');
      logoInfo.innerHTML = bad ? logoState('warn', 'No file could be opened', 'Use a recent Chrome or Edge on a computer, and the original MP4, MOV or WebM file.') : '<p class="help">Add a file and the logo is found automatically.</p>';
      logoChip.innerHTML = ''; return;
    }
    const m = it.model, ref = refItem(), isRef = it.id === S.refId;
    if (it.status === 'analyzing' || it.status === 'probing' || it.status === 'new') {
      const p = it.progress || 0;
      html = logoState('run', it.status !== 'analyzing' ? 'Opening the file…' : p < 0.3 ? 'Finding the logo…' : 'Measuring the logo…', 'This takes a few seconds.') +
        (it.status === 'analyzing' ? '<div class="bar"><i style="width:' + (p * 100).toFixed(0) + '%"></i></div>' : '');
    } else if (m && m.ok && it.borrowed) {
      html = logoState('warn', 'Using the lead video’s measurement', 'This video’s own measurement failed, so the lead file’s is used. If traces remain, remove this video on its own, or draw a box around its logo.');
    } else if (m && m.ok) {
      const name = m.kind === 'image' || m.gemini ? 'Gemini sparkle' : m.veo ? 'Veo text mark' : 'Logo';
      chip = it.manual ? 'Your box' : 'Automatic';
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
      html = logoState('ok', name + ' found', opaque ? 'Parts of it are fully solid; those pixels are filled in from around them.' : 'It is see-through, so the real picture underneath is restored.') +
        '<details class="details"><summary>Technical details</summary><dl class="kv">' + kv + '</dl></details>';
    } else if (m && !m.ok) {
      html = logoState('warn', 'No steady logo in this box', 'Draw a slightly larger box around the logo.');
    } else if (it.status === 'error') {
      html = logoState('warn', 'This file could not be opened', esc(it.msg));
    } else if (!isRef && ref && ref.model && ref.model.ok && S.sameRect && it.kind !== 'image') {
      html = logoState('info', 'Same spot as the lead file', 'This video’s logo is measured when you pick it or when it is processed. Until then the preview shows the original.');
    } else if (it.msg || (isRef && it.status === 'ready')) {
      html = logoState('warn', esc(it.msg || 'No logo found automatically'), 'Click “Draw a box”, then drag around the logo on the preview, a little larger than the logo.');
    } else {
      html = logoState('info', 'Waiting for its turn…', '');
    }
    logoInfo.innerHTML = html;
    logoChip.innerHTML = chip ? '<span class="chip">' + chip + '</span>' : '';
  }
  function renderQuality() {
    qMax.setAttribute('aria-pressed', String(S.quality === 'max'));
    qHigh.setAttribute('aria-pressed', String(S.quality === 'high'));
    const vid = refItem() && refItem().kind === 'video' && refItem().info ? refItem() : S.items.find((i) => i.kind === 'video' && i.info);
    qMax.disabled = qHigh.disabled = S.busy || !vid;
    if (!vid) {
      qNote.textContent = S.items.length ? 'Photos keep their format: a PNG stays lossless and a JPEG stays a high-quality JPEG.' : 'Resolution, frame rate and every frame stay the same, and the audio is copied untouched.';
      qNote.title = '';
      return;
    }
    const b = targetBitrate(vid.info, S.quality), d = vid.info.dur - vid.info.first;
    qNote.textContent = 'About ' + fmtMB((b + 192000) * d / 8) + (S.items.filter((i) => i.kind === 'video').length > 1 ? ' for the lead video' : '') + '. Every frame, the frame rate and the audio stay as they were.';
    qNote.title = 'Changing pixels means re-encoding the video; extra bitrate keeps the difference invisible. ' + fmtMbps(vid.info.bitrate) + ' now → about ' + fmtMbps(b) + ' after.';
  }

  // ---------- events ----------
  queueEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const it = getItem(+btn.closest('[data-id]').dataset.id);
    if (!it) return;
    const act = btn.dataset.act;
    if (act === 'pick') { if (it.id !== S.selId) select(it); }
    else if (act === 'save' && it.result) saveBlob(it.result, outName(it));
    else if (act === 'del' && !S.busy && !S.analyzing) {
      S.items = S.items.filter((i) => i !== it);
      if (S.selId === it.id) { S.selId = null; await stopPlay(); closePreview(); vctx.clearRect(0, 0, view.width, view.height); loupes.hidden = true; }
      if (S.refId === it.id) {
        S.refId = null;
        const ref = S.items.find((i) => i.info && i.status !== 'error');
        if (ref) { S.refId = ref.id; await select(ref); if (!ref.model) analyze(ref); }
      } else if (!S.selId && S.items.length) { const r = refItem(); if (r) select(r); }
      render();
    }
  });
  async function clearAll() {
    if (S.busy || S.analyzing) return;
    await stopPlay();
    S.items = []; S.refId = null; S.selId = null; S.rectRel = null; S.boxMode = false;
    closePreview();
    vctx.clearRect(0, 0, view.width, view.height); loupes.hidden = true;
    setNote('');
    render();
  }
  clearBtn.addEventListener('click', clearAll);
  moreBtn.addEventListener('click', clearAll);
  redetectBtn.addEventListener('click', () => { const it = selItem(); if (it) analyze(it, null); });
  const toggleBox = () => { if (!canDraw()) return; S.boxMode = !S.boxMode; render(); };
  boxBtn.addEventListener('click', toggleBox);
  boxBtn2.addEventListener('click', toggleBox);
  viewSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b || b.disabled) return;
    S.view = b.dataset.view; drawView(); render();
  });
  sameRectEl.addEventListener('change', () => { S.sameRect = sameRectEl.checked; render(); renderPreview(); });
  qMax.addEventListener('click', () => { S.quality = 'max'; render(); });
  qHigh.addEventListener('click', () => { S.quality = 'high'; render(); });
  runBtn.addEventListener('click', runAll);
  cancelBtn.addEventListener('click', cancelAll);
  saveBtn.addEventListener('click', saveAll);
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files.length) addFiles(fileEl.files); fileEl.value = ''; });

  // drop files anywhere on the page
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (hasFiles(e) && !fatal) { dragDepth++; dropOverlay.hidden = false; } }, { signal });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay.hidden = true; }, { signal });
  document.addEventListener('dragover', (e) => e.preventDefault(), { signal });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; dropOverlay.hidden = true;
    if (!fatal && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, { signal });
  // paste a copied photo or file
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (fatal || (t && t.closest && t.closest('input, textarea, [contenteditable]'))) return;
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); addFiles(files); }
  }, { signal });
  // keyboard: space plays, arrows step a frame, C cycles the view, B draws a box, Esc cancels it
  document.addEventListener('keydown', (e) => {
    if (workspaceEl.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable], [role="slider"], summary')) return;
    if (e.key === ' ') { e.preventDefault(); if (P.playing) stopPlay(); else play(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepFrame(e.key === 'ArrowLeft' ? -1 : 1); }
    else if (e.key === 'c' || e.key === 'C') { if (P.item && previewModel(P.item)) { const o = ['split', 'result', 'original']; S.view = o[(o.indexOf(S.view) + 1) % o.length]; drawView(); render(); } }
    else if (e.key === 'b' || e.key === 'B') toggleBox();
    else if (e.key === 'Escape' && S.boxMode) { S.boxMode = false; drag = null; render(); }
  }, { signal });
  window.addEventListener('beforeunload', (e) => { if (S.busy) { e.preventDefault(); e.returnValue = ''; } }, { signal });

  // a short Gemini clip to try the tool without a file of one's own
  if (import.meta.env.MODE === 'file') sampleCard.hidden = true;
  sampleBtn.addEventListener('click', async () => {
    const label = sampleBtn.querySelector('span'), was = label.textContent;
    sampleBtn.disabled = true; label.textContent = 'Loading the sample…';
    try {
      const r = await fetch('/samples/gemini-sample.mp4');
      if (!r.ok) throw new Error(String(r.status));
      addFiles([new File([await r.blob()], 'gemini-sample.mp4', { type: 'video/mp4' })]);
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
    dropEl.classList.add('is-off'); fileEl.disabled = true; sampleBtn.disabled = true;
  }
  layoutStage();
  render();
  window.__tool = { S, P };

  return {
    isBusy: () => S.busy,
    destroy() {
      alive = false;
      S.cancel = true; P.playing = false;
      if (S.conv) S.conv.cancel().catch(() => {});
      keepAwake(false);
      restoreTitle();
      ac.abort();
      cleanups.forEach((f) => f());
      closePreview();
      if (window.__tool && window.__tool.S === S) delete window.__tool;
    },
  };
}
