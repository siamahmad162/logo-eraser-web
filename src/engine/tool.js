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
  const stageEmpty = $('#stageEmpty'), stagePill = $('#stagePill'), stagePillText = $('#stagePillText');
  const scrub = $('#scrub'), tcEl = $('#tc'), compareEl = $('#compare');
  const loupes = $('#loupes'), loupeA = $('#loupeA'), loupeB = $('#loupeB');
  const fileEl = $('#file'), dropEl = $('#drop'), queueEl = $('#queue');
  const logoInfo = $('#logoInfo'), redetectBtn = $('#redetect'), sameRectEl = $('#sameRect');
  const qMax = $('#qMax'), qHigh = $('#qHigh'), qNote = $('#qNote');
  const runBtn = $('#runBtn'), runLabel = $('#runLabel'), cancelBtn = $('#cancelBtn');
  const totalEl = $('#total'), totalFill = $('#totalFill'), totalText = $('#totalText');
  const zipBtn = $('#zipBtn'), zipLabel = $('#zipLabel'), noteEl = $('#note');

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
    noteEl.textContent = text || '';
    noteEl.className = 'msg' + (kind ? ' is-' + kind : '');
    noteEl.hidden = !text;
  }
  const baseName = (n) => (n || 'video').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90) || 'video';

  // ---------- state ----------
  const S = {
    items: [], refId: null, selId: null, rectRel: null, sameRect: true, quality: 'max',
    busy: false, analyzing: false, cancel: false, compare: false, frac: 0.25, conv: null, intake: false,
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
  const P = { item: null, input: null, sink: null, busy: false, pending: false, holder: {}, orig: null, proc: null, has: false, token: 0 };
  function closePreview() {
    if (P.input) { try { P.input.dispose(); } catch (e) { /* closed */ } }
    P.input = null; P.sink = null; P.item = null; P.has = false;
  }
  async function openPreview(item) {
    closePreview();
    if (!item || !item.info) return;
    P.token++;
    if (item.kind === 'image') {
      const { w, h } = item.info;
      P.item = item; P.orig = makeCanvas(w, h); P.proc = makeCanvas(w, h);
      view.width = w; view.height = h;
      stage.style.aspectRatio = w + ' / ' + h;
      layoutStage();
      await renderPreview();
      return;
    }
    const input = openInput(item.file);
    const track = await input.getPrimaryVideoTrack();
    P.input = input; P.sink = new MB.VideoSampleSink(track); P.item = item;
    const { w, h } = item.info;
    P.orig = makeCanvas(w, h); P.proc = makeCanvas(w, h);
    view.width = w; view.height = h;
    stage.style.aspectRatio = w + ' / ' + h;
    layoutStage();
    await renderPreview();
  }
  function previewModel(item) {
    if (!item) return null;
    if (item.kind === 'image') return item.model && item.model.ok ? item.model : null;
    if (item.model && item.model.ok) return item.model;
    const ref = refItem();
    if (ref && ref !== item && ref.model && ref.model.ok && item.info && ref.model.W === item.info.w && ref.model.H === item.info.h && S.sameRect) return ref.model;
    return null;
  }
  function previewTime(item) { const i = item.info; return i.first + S.frac * Math.max(0, i.dur - i.first - 1 / i.fps); }
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
    if (!P.sink) return;
    if (P.busy) { P.pending = true; return; }
    P.busy = true;
    try {
      do {
        P.pending = false;
        const item = P.item, tok = P.token, t = previewTime(item);
        const s = await P.sink.getSample(t);
        if (!s || tok !== P.token) { if (s) s.close(); break; }
        try {
          const ox = P.orig.getContext('2d'), px = P.proc.getContext('2d');
          s.draw(ox, 0, 0, P.orig.width, P.orig.height);
          const model = previewModel(item);
          if (model) {
            const out = await cleanSample(s, model, P.holder);
            try { out.draw(px, 0, 0, P.proc.width, P.proc.height); } finally { if (out !== s) out.close(); }
          } else { px.drawImage(P.orig, 0, 0); }
          P.has = true;
          tcEl.innerHTML = '<b>' + tc(t) + '</b> / ' + tc(item.info.dur);
        } finally { s.close(); }
        drawView();
      } while (P.pending);
    } catch (e) {
      setNote('Could not show the preview: ' + errText(e), 'warn');
    } finally { P.busy = false; }
  }
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
    vctx.drawImage(S.compare ? P.orig : P.proc, 0, 0);
    const r = currentRect(), model = previewModel(P.item);
    loupes.hidden = !r;
    if (!r) return;
    const side = Math.min(P.orig.width, P.orig.height, Math.round(Math.max(r.w, r.h) * 1.5));
    const sx = clamp(Math.round(r.x + r.w / 2 - side / 2), 0, P.orig.width - side), sy = clamp(Math.round(r.y + r.h / 2 - side / 2), 0, P.orig.height - side);
    [[loupeA, P.orig], [loupeB, model ? P.proc : P.orig]].forEach(([cv, src]) => {
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(src, sx, sy, side, side, 0, 0, cv.width, cv.height);
    });
    const shown = loupeA.getBoundingClientRect().width || cv0w;
    const z = (shown * (window.devicePixelRatio || 1)) / side;
    $('#zoomA').textContent = $('#zoomB').textContent = (z >= 1 ? z.toFixed(1) : z.toFixed(2)) + '×';
  }
  const cv0w = 360;

  // ---------- stage + overlay ----------
  let dpr = 1;
  function layoutStage() {
    const avail = stageWrap.clientWidth;
    if (!avail) return;
    const W = view.width || 16, H = view.height || 9;
    const maxH = Math.max(220, Math.min(window.innerHeight * 0.6, 760));
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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTokens, { signal });
  const mo = new MutationObserver(readTokens);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  cleanups.push(() => mo.disconnect());

  function drawOverlay(ts) {
    if (!alive) return;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const r = P.has ? currentRect() : null;
    if (r && view.width) {
      const k = overlay.width / view.width;
      const x = Math.round(r.x * k) + 0.5, y = Math.round(r.y * k) + 0.5, w = Math.round(r.w * k), h = Math.round(r.h * k);
      const dash = 6 * dpr, gap = 4 * dpr, off = reduceMotion ? 0 : -((ts / 45) % (dash + gap));
      octx.lineWidth = 1.5 * dpr; octx.setLineDash([dash, gap]);
      octx.lineDashOffset = off; octx.strokeStyle = '#FFFFFF'; octx.strokeRect(x, y, w, h);
      octx.lineDashOffset = off + dash; octx.strokeStyle = tokens.mask; octx.strokeRect(x, y, w, h);
      octx.setLineDash([]);
      octx.font = '600 ' + Math.round(12 * dpr) + 'px "Inter Variable", system-ui, sans-serif';
      const label = drag && drag.rect ? 'New box' : 'Logo';
      const tw = octx.measureText(label).width + 10 * dpr, th = 18 * dpr;
      const ly = y - th >= 0 ? y - th : y + h;
      octx.fillStyle = tokens.mask; octx.fillRect(x - 0.5, ly, tw, th);
      octx.fillStyle = tokens.maskInk; octx.textBaseline = 'middle'; octx.fillText(label, x + 4.5 * dpr, ly + th / 2 + 0.5);
    }
    requestAnimationFrame(drawOverlay);
  }
  requestAnimationFrame(drawOverlay);

  let drag = null;
  const canDraw = () => P.has && !S.busy && !S.analyzing && P.item;
  function toFrame(e) {
    const b = overlay.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) * view.width / b.width, 0, view.width), y: clamp((e.clientY - b.top) * view.height / b.height, 0, view.height) };
  }
  overlay.addEventListener('pointerdown', (e) => {
    if (!canDraw() || e.button > 0) return;
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
    const item = P.item;
    analyze(item, evenRect(r, view.width, view.height));
  }
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', () => { drag = null; drawView(); });

  scrub.addEventListener('input', () => { S.frac = +scrub.value / 1000; renderPreview(); });
  compareEl.addEventListener('change', () => { S.compare = compareEl.checked; drawView(); });

  // ---------- intake ----------
  function addFiles(list) {
    const isVideo = (f) => (f.type && f.type.startsWith('video/')) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);
    const files = [...list].filter((f) => isVideo(f) || isImageFile(f));
    const skipped = list.length - files.length;
    if (!files.length) { setNote('No videos or photos found. Add MP4, MOV, WebM or PNG, JPG, WebP files.', 'warn'); return; }
    files.forEach((file) => S.items.push({ id: nextId++, file, name: file.name, size: file.size, kind: isVideo(file) ? 'video' : 'image', status: 'new', progress: 0, info: null, model: null, detected: null, result: null, msg: '' }));
    setNote(skipped ? skipped + (skipped === 1 ? ' file is' : ' files are') + ' not a video or photo and ' + (skipped === 1 ? 'was' : 'were') + ' skipped.' : '', skipped ? 'warn' : '');
    render();
    intake();
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
    S.selId = item.id;
    render();
    try { await openPreview(item); } catch (e) { setNote('Could not open the preview: ' + errText(e), 'warn'); }
    render();
  }

  function pill(text) { stagePill.hidden = !text; stagePillText.textContent = text || ''; }

  async function analyze(item, manualRect) {
    if (!item || !item.info || S.busy) return;
    if (S.analyzing) { if (!manualRect && !item.model) item.waiting = true; return; }
    S.analyzing = true;
    item.status = 'analyzing'; item.msg = ''; item.progress = 0;
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
        det = await detectLogo(item, (p) => { item.progress = p * 0.3; updItem(item); });
        if (!det) {
          item.model = null; item.detected = null; item.status = 'ready';
          item.msg = 'No logo found automatically';
          return;
        }
        rect = det.rect;
      }
      item.detected = { rect, confidence: det ? det.confidence : null, manual: !!manualRect, gemini: !!(det && det.tmpl && !det.tmpl.veo), tmpl: det && det.tmpl };
      pill('Learning the logo’s transparency…');
      drawView();
      item.model = await learn(item, rect, (p) => { item.progress = 0.3 + p * 0.7; updItem(item); }, det && det.tmpl);
      item.manual = !!manualRect;
      item.status = 'ready';
      if (item.id === S.refId) {
        S.rectRel = toRel(rect, item.info.w, item.info.h);
        // other videos follow the reference box, so drop what they learned for the old one
        S.items.forEach((o) => { if (o !== item && o.kind !== 'image' && !o.manual && o.status !== 'done') { o.model = null; } });
      }
    } catch (e) {
      item.status = 'ready'; item.msg = errText(e);
    } finally {
      S.analyzing = false; S.cancel = false;
      pill('');
      render();
      if (P.item === item) renderPreview();
      // files that arrived while this was busy (the lead video first)
      const ref = refItem(), next = ref && ref.waiting ? ref : S.items.find((i) => i.waiting);
      if (next) { next.waiting = false; if (!next.model) analyze(next); }
    }
  }

  // ---------- batch ----------
  async function runAll() {
    const ref = refItem();
    if (S.busy || S.analyzing || !ref || !ref.model || !ref.model.ok) return;
    S.busy = true; S.cancel = false;
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
            let rect = null, guess = null;
            if ((!S.sameRect || !S.rectRel || ref.kind === 'image' || (ref.model && ref.model.veo)) && it !== ref) {
              const d = await detectLogo(it, (p) => { it.progress = p * 0.3; updItem(it); });
              if (d) { rect = d.rect; guess = d.tmpl; }
            }
            if (!rect && !S.rectRel) { it.status = 'skipped'; it.msg = 'No logo found automatically in this video. Select it and draw a box around the logo.'; updItem(it); continue; }
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
            it.model = await learn(it, rect, (p) => { it.progress = 0.3 + p * 0.7; updItem(it); }, guess);
            if (!it.model.ok && ref.model.W === it.info.w && ref.model.H === it.info.h && S.sameRect) it.model = ref.model;
          }
          if (S.cancel) break;
          if (!it.model.ok) { it.status = 'skipped'; it.msg = 'No logo at that spot in this video. Select it, draw a box around the logo and run again.'; updItem(it); continue; }
          it.status = 'encoding'; it.progress = 0; updItem(it); updTotal();
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
      const secs = Math.round((performance.now() - t0) / 1000);
      S.busy = false;
      if (S.cancel) setNote('Stopped. Finished files can still be downloaded.');
      else if (done) setNote(done + (done === 1 ? ' file' : ' files') + ' ready in ' + secs + ' s. Download from the list' + (done > 1 ? ' or as one ZIP below.' : '.'), 'ok');
      S.cancel = false;
      render();
    }
  }
  function cancelAll() {
    S.cancel = true;
    if (S.conv) S.conv.cancel().catch(() => {});
    cancelBtn.disabled = true;
  }

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
  zipBtn.addEventListener('click', async () => {
    const done = S.items.filter((i) => i.status === 'done' && i.result);
    if (!done.length) return;
    const total = done.reduce((s, i) => s + i.result.size, 0);
    if (total > 3.9 * 1073741824) { setNote('Together the files are over 4 GB, too big for one ZIP. Download them one by one.', 'warn'); return; }
    zipBtn.disabled = true; zipLabel.textContent = 'Building ZIP…';
    try { await saveBlob(await makeZip(done.map((i) => ({ name: outName(i), blob: i.result }))), 'clearframe-files.zip'); }
    finally { zipBtn.disabled = false; render(); }
  });

  // ---------- rendering ----------
  const STATUS = {
    new: 'Waiting', probing: 'Opening…', ready: 'Ready', analyzing: 'Looking for the logo…', learning: 'Learning the logo…',
    encoding: 'Removing the logo…', done: 'Done', skipped: 'Skipped', error: 'Could not open',
  };
  function itemMeta(it) {
    if (!it.info) return fmtMB(it.size);
    const i = it.info;
    if (it.kind === 'image') return 'Photo · ' + i.w + '×' + i.h + ' · ' + fmtMB(it.size);
    return i.w + '×' + i.h + ' · ' + (i.dur - i.first).toFixed(1) + 's · ' + Math.round(i.fps) + 'fps · ' + fmtMB(it.size);
  }
  function render() {
    stageEmpty.hidden = S.items.length > 0;
    overlay.classList.toggle('is-off', !canDraw());
    scrub.disabled = !P.has || !!(P.item && P.item.kind === 'image');
    compareEl.disabled = !P.has;
    fileEl.disabled = false;

    // queue
    queueEl.innerHTML = '';
    S.items.forEach((it) => {
      const li = document.createElement('li');
      li.className = 'item' + (it.id === S.selId ? ' is-sel' : '');
      li.dataset.id = it.id;
      li.innerHTML =
        '<div class="item-row">' +
          '<button type="button" class="item-pick" data-act="pick"><span class="item-name"></span><span class="item-meta"></span></button>' +
          '<button type="button" class="icon-btn" data-act="save" title="Download" aria-label="Download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"></path></svg></button>' +
          '<button type="button" class="icon-btn" data-act="del" title="Remove from list" aria-label="Remove from list"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg></button>' +
        '</div>' +
        '<div class="item-status"></div>' +
        '<div class="bar"><i></i></div>';
      li.querySelector('.item-name').textContent = it.name;
      queueEl.appendChild(li);
      updItem(it);
    });
    if (!S.items.length) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'No files yet.';
      queueEl.appendChild(li);
    }

    renderLogo();
    renderQuality();

    const ref = refItem();
    const todo = S.items.filter((i) => i.info && i.status !== 'done' && i.status !== 'error').length;
    runBtn.hidden = S.busy;
    cancelBtn.hidden = !S.busy; cancelBtn.disabled = false;
    runBtn.disabled = !(ref && ref.model && ref.model.ok) || S.analyzing || !todo;
    runLabel.textContent = todo > 1 ? 'Remove logo from ' + todo + ' files' : 'Remove logo';
    const done = S.items.filter((i) => i.status === 'done');
    zipBtn.hidden = done.length < 2;
    zipLabel.textContent = 'Download all (ZIP · ' + fmtMB(done.reduce((s, i) => s + i.result.size, 0)) + ')';
    updTotal();
    redetectBtn.disabled = !selItem() || !selItem().info || S.busy || S.analyzing;
    sameRectEl.disabled = S.busy;
  }
  function updItem(it) {
    const li = queueEl.querySelector('[data-id="' + it.id + '"]');
    if (!li) return;
    li.querySelector('.item-meta').textContent = itemMeta(it);
    const st = li.querySelector('.item-status');
    st.className = 'item-status' + (it.status === 'done' ? ' is-ok' : it.status === 'error' || it.status === 'skipped' || it.msg ? ' is-warn' : '');
    st.innerHTML = '';
    if (it.id === S.refId) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = 'Lead file'; st.appendChild(c); }
    const working = ['probing', 'analyzing', 'learning', 'encoding'].includes(it.status);
    const label = document.createElement('span');
    let text = STATUS[it.status] || '';
    if (working && it.progress) text += ' ' + pct(it.progress);
    if (it.status === 'done' && it.result) text += ' · ' + fmtMB(it.result.size) + (it.outCodec ? ' · ' + it.outCodec.toUpperCase() : '');
    if (it.msg) text = (it.status === 'ready' ? '' : text + ' · ') + it.msg;
    label.textContent = text;
    st.appendChild(label);
    const bar = li.querySelector('.bar');
    bar.hidden = !working;
    bar.querySelector('i').style.width = (clamp(it.progress, 0, 1) * 100).toFixed(1) + '%';
    li.querySelector('[data-act="save"]').hidden = it.status !== 'done';
    li.querySelector('[data-act="del"]').disabled = S.busy || S.analyzing;
  }
  function updTotal() {
    const items = S.items.filter((i) => i.info && i.status !== 'error');
    totalEl.hidden = !S.busy;
    if (!S.busy || !items.length) return;
    let sum = 0;
    for (const i of items) sum += i.status === 'done' || i.status === 'skipped' ? 1 : i.status === 'encoding' ? 0.15 + 0.85 * i.progress : i.status === 'learning' ? 0.15 * i.progress : 0;
    const p = sum / items.length;
    totalFill.style.width = (p * 100).toFixed(1) + '%';
    const n = items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
    totalText.textContent = pct(p) + ' overall · ' + n + ' of ' + items.length + ' files finished';
  }
  function renderLogo() {
    const it = selItem();
    let html = '', cls = '';
    if (!it) { logoInfo.innerHTML = '<p class="help">Add a file and the logo is found automatically.</p>'; return; }
    const m = it.model, ref = refItem(), isRef = it.id === S.refId;
    if (it.status === 'analyzing') {
      html = '<div class="t">' + (it.progress < 0.3 ? 'Looking for the logo…' : 'Learning the logo’s transparency…') + '</div><div class="bar"><i style="width:' + (it.progress * 100).toFixed(0) + '%"></i></div>';
    } else if (m && m.ok && m.kind === 'image') {
      cls = 'is-ok';
      html = '<div class="t">Sparkle logo found <span class="chip ok">' + (it.manual ? 'your box' : m.exact ? 'standard spot' : 'shape match') + '</span></div>' +
        '<dl class="kv">' +
          '<dt>Position</dt><dd>x ' + m.rect.x + ' · y ' + m.rect.y + ' · logo ' + Math.round(m.size) + ' px</dd>' +
          '<dt>Opacity</dt><dd>max ' + Math.round(m.max * 100) + '%</dd>' +
          '<dt>Method</dt><dd>known logo shape, fitted to this photo and reversed</dd>' +
        '</dl><div class="help">The preview shows the result. Turn on “Show original” to compare.</div>';
    } else if (m && m.ok) {
      cls = 'is-ok';
      const opaque = m.max >= C.OPAQUE;
      html = '<div class="t">' + (m.gemini ? 'Sparkle logo found' : m.veo ? 'Veo text mark found' : 'Logo found') + ' <span class="chip ok">' + (it.manual ? 'your box' : m.gemini ? 'shape match' : m.veo ? 'standard spot' : 'auto') + '</span></div>' +
        '<dl class="kv">' +
          '<dt>Position</dt><dd>x ' + m.rect.x + ' · y ' + m.rect.y + ' · ' + m.rect.w + '×' + m.rect.h + '</dd>' +
          '<dt>Opacity</dt><dd>mean ' + Math.round(m.mean * 100) + '% · max ' + Math.round(m.max * 100) + '%</dd>' +
          '<dt>Method</dt><dd>' + (m.method === 'template' ? (m.planeAlpha ? 'known logo shape, matched to this video pixel by pixel' : 'known logo shape (still background)') : 'learned from the video') + '</dd>' +
          '<dt>Analysed</dt><dd>' + m.frames + ' frames · ' + (m.mode === 'yuv' ? 'YUV, no colour conversion' : 'RGB') + '</dd>' +
          (m.resp ? '<dt>Dark scenes</dt><dd>extra correction on (from ' + m.resp.frames + ' frames)</dd>' : '') +
        '</dl>' +
        '<div class="help">' + (opaque ? 'Parts of the logo are fully opaque; those pixels are filled from their surroundings.' : 'The logo is see-through, so the real picture underneath can be restored.') + '</div>';
    } else if (m && !m.ok) {
      cls = 'is-warn';
      html = '<div class="t">No steady logo found in this box</div><div class="help">Draw a slightly larger box around the logo on the preview.</div>';
    } else if (!isRef && ref && ref.model && ref.model.ok && S.sameRect) {
      html = '<div class="t">Uses the lead file’s logo spot</div><div class="help">The logo’s transparency is learned from this video when it is processed. The preview shows the lead file’s settings.</div>';
    } else if (it.msg || (isRef && it.status === 'ready')) {
      cls = 'is-warn';
      html = '<div class="t">' + (it.msg || 'No logo found automatically') + '</div><div class="help">Draw a box around the logo on the preview, a little larger than the logo.</div>';
    } else {
      html = '<div class="help">Opening…</div>';
    }
    logoInfo.innerHTML = '<div class="logo-card ' + cls + '">' + html + '</div>';
  }
  function renderQuality() {
    qMax.setAttribute('aria-pressed', String(S.quality === 'max'));
    qHigh.setAttribute('aria-pressed', String(S.quality === 'high'));
    qMax.disabled = qHigh.disabled = S.busy;
    const ref = refItem();
    if (!ref || !ref.info) return;
    const b = targetBitrate(ref.info, S.quality), d = ref.info.dur - ref.info.first;
    qNote.textContent = 'Lead video: ' + fmtMbps(ref.info.bitrate) + ' now → about ' + fmtMbps(b) + ' after (file about ' + fmtMB((b + 192000) * d / 8) + '). Changing pixels means re-encoding; the extra bitrate keeps the difference invisible. Resolution, frame rate and every frame stay the same, and the audio is copied untouched.';
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
      if (S.selId === it.id) { S.selId = null; closePreview(); vctx.clearRect(0, 0, view.width, view.height); loupes.hidden = true; }
      if (S.refId === it.id) {
        S.refId = null;
        const ref = S.items.find((i) => i.info && i.status !== 'error');
        if (ref) { S.refId = ref.id; await select(ref); if (!ref.model) analyze(ref); }
      } else if (!S.selId && S.items.length) { const r = refItem(); if (r) select(r); }
      render();
    }
  });
  redetectBtn.addEventListener('click', () => { const it = selItem(); if (it) analyze(it, null); });
  sameRectEl.addEventListener('change', () => { S.sameRect = sameRectEl.checked; render(); renderPreview(); });
  qMax.addEventListener('click', () => { S.quality = 'max'; render(); });
  qHigh.addEventListener('click', () => { S.quality = 'high'; render(); });
  runBtn.addEventListener('click', runAll);
  cancelBtn.addEventListener('click', cancelAll);
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files.length) addFiles(fileEl.files); fileEl.value = ''; });
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; stage.classList.add('is-drop'); dropEl.classList.add('is-drop'); } }, { signal });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { stage.classList.remove('is-drop'); dropEl.classList.remove('is-drop'); } }, { signal });
  document.addEventListener('dragover', (e) => e.preventDefault(), { signal });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0;
    stage.classList.remove('is-drop'); dropEl.classList.remove('is-drop');
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, { signal });
  window.addEventListener('beforeunload', (e) => { if (S.busy) { e.preventDefault(); e.returnValue = ''; } }, { signal });

  // ---------- start ----------
  const fatal = !('VideoDecoder' in window && 'VideoEncoder' in window)
    ? 'This browser lacks video encoding (WebCodecs), so the tool cannot run here. Use a recent Chrome, Edge or Safari on a computer.'
    : null;
  if (fatal) {
    const f = $('#fatal'); f.textContent = fatal; f.hidden = false;
    dropEl.style.pointerEvents = 'none'; dropEl.style.opacity = '0.5'; fileEl.disabled = true;
  }
  layoutStage();
  render();
  window.__tool = { S, P };

  return {
    isBusy: () => S.busy,
    destroy() {
      alive = false;
      S.cancel = true;
      if (S.conv) S.conv.cancel().catch(() => {});
      ac.abort();
      cleanups.forEach((f) => f());
      closePreview();
      if (window.__tool && window.__tool.S === S) delete window.__tool;
    },
  };
}
