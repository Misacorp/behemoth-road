#!/usr/bin/env node
/* global console, process, window, document, performance, requestAnimationFrame, PerformanceObserver,
   XMLSerializer, Image, MutationObserver */
/**
 * Performance measurements for the map (measure first, no fixes). Loads the app on the Vite dev server (its
 * fake session and a fake game server on the real core, see fake-game.mjs; an unminified dev build, so absolute
 * numbers run a little high) in Chromium, as a phone (390x844, Pixel 7 touch) at 4x and 6x CPU slowdown and as a
 * desktop (1440x900) at 4x, and measures:
 *   - tap latency: a tap on the creature until the bubble popover is painted, and a tap on a hex until its
 *     card is painted (Event Timing `pointerup`);
 *   - frame times and move-to-frame lag during a synthesised touch drag and a pinch (the `lite` phase), and
 *     the frame after release (filters back on, scene redrawn at the new zoom step);
 *   - redraw cost: the `pointerup` that ends a pinch at a new zoom step, and the "Next day" click;
 *   - where main-thread time goes during a drag and release (a trace, self time by kind), and raster time.
 * Experiments change the page after load, never the app: see EXPERIMENTS below.
 *
 * Usage: node apps/web/scripts/perf.mjs
 *   [--rates 4,6] [--profiles phone,desktop] [--only baseline,filters-off] (default: baseline)   (PERF_TRACE_OUT=<path prefix> keeps the raw traces)
 * Writes a Markdown table to stdout and the raw numbers to screenshots/perf.json (gitignored).
 * Not part of the unit test run. Needs the pre-installed Playwright (require('playwright')).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeServer, joinedScenario, startVite } from './fake-game.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const out = resolve(web, '../../screenshots');
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const RATES = (arg('--rates') ?? '4,6').split(',').map(Number);
// The ground-img and ground-bitmap experiments no longer match the scene's structure; ask for them by name.
const ONLY = (arg('--only') ?? 'baseline').split(',');
const PROFILE_NAMES = (arg('--profiles') ?? 'phone,desktop').split(',');

/**
 * Page-side experiments. Each runs once after load, in the page. They hide or add elements through the
 * CSSOM and the DOM (the app's own nodes stay in place for Preact) and are never part of the app.
 */
const EXPERIMENTS = {
  baseline: null,
  // Every SVG filter off, always (not only while a gesture runs).
  'filters-off': () => {
    const s = document.createElement('style');
    s.textContent = 'svg.map [filter], svg.map .fx, svg.map .grain-fx { filter: none !important; }';
    document.head.append(s);
  },
  // Only the screen-wide paper grain off.
  'grain-off': () => {
    const s = document.createElement('style');
    s.textContent = 'svg.map .grain { display: none !important; }';
    document.head.append(s);
  },
  // Half of the drawn paths hidden (every other path in the map's world group).
  'half-nodes': () => {
    const world = document.querySelector('svg.map > g');
    [...world.querySelectorAll('path')].forEach((el, i) => {
      if (i % 2) el.style.display = 'none';
    });
  },
  // A compositor hint on the panned group.
  'will-change': () => {
    const s = document.createElement('style');
    s.textContent = 'svg.map > g:first-of-type { will-change: transform; }';
    document.head.append(s);
  },
  // The pan and zoom as a CSS transform on the map's <svg> element (a compositor layer), instead of the SVG
  // transform on its world group: emulates moving the map in an HTML layer that the compositor slides
  // without re-rasterising. The world group keeps the transform it had when the experiment started.
  'css-layer': () => {
    const svg = document.querySelector('svg.map');
    const world = svg.querySelector(':scope > g');
    const parse = (v) =>
      (/matrix\(([^)]+)\)/.exec(v ?? '')?.[1] ?? '1 0 0 1 0 0').split(/[ ,]+/).map(Number);
    const [s0, , , , x0, y0] = parse(world.getAttribute('transform'));
    svg.style.transformOrigin = '0 0';
    svg.style.willChange = 'transform';
    const set = world.setAttribute.bind(world);
    world.setAttribute = (name, value) => {
      if (name !== 'transform') return set(name, value);
      const [s, , , , x, y] = parse(value);
      const k = s / s0;
      svg.style.transform = `translate(${x - k * x0}px, ${y - k * y0}px) scale(${k})`;
    };
  },
  // The static ground (defs, the washed tiles and the dotted outlines) drawn once into an <image> holding the
  // same SVG as a data URL (`img`), or rasterised once to a PNG on a canvas at the current zoom (`bitmap`).
  'ground-img': () => window.__groundToImage('svg'),
  'ground-bitmap': () => window.__groundToImage('png'),
};

/** Installed before the app loads: frame timing, input lag, Event Timing, and the ground-to-image helper. */
function harness() {
  const perf = { frames: [], lags: [], events: [], lastMove: 0, recording: false };
  window.__perf = perf;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      perf.events.push({
        name: e.name,
        start: e.startTime,
        duration: e.duration,
        processing: e.processingEnd - e.processingStart,
        delay: e.processingStart - e.startTime,
      });
    }
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  window.addEventListener(
    'pointermove',
    (e) => {
      perf.lastMove = e.timeStamp;
    },
    { capture: true },
  );
  let last = 0;
  let seenMove = 0;
  const tick = (now) => {
    if (perf.recording) {
      if (last) perf.frames.push({ at: now, dt: now - last });
      if (perf.lastMove && perf.lastMove !== seenMove) {
        perf.lags.push(now - perf.lastMove);
        seenMove = perf.lastMove;
      }
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.__groundToImage = async (kind) => {
    const svg = document.querySelector('svg.map');
    const world = svg.querySelector(':scope > g');
    const defs = world.querySelector(':scope > defs');
    const wash = [...world.children].find((c) => /wash\)$/.test(c.getAttribute('filter') ?? ''));
    const parts = [defs, wash];
    let next = wash.nextElementSibling;
    while (next && next.tagName === 'path' && next.getAttribute('stroke-dasharray')) {
      parts.push(next);
      next = next.nextElementSibling;
    }
    const box = wash.getBBox();
    const pad = 40;
    const x = box.x - pad;
    const y = box.y - pad;
    const w = box.width + pad * 2;
    const h = box.height + pad * 2;
    const ser = new XMLSerializer();
    const text =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
      parts.map((p) => ser.serializeToString(p)).join('') +
      '</svg>';
    let href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    if (kind === 'png') {
      const scale = Number(svg.getAttribute('data-view').split(' ')[2]) * window.devicePixelRatio;
      const img = new Image();
      img.src = href;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      href = canvas.toDataURL('image/png');
    }
    const ns = 'http://www.w3.org/2000/svg';
    const layer = document.createElementNS(ns, 'g');
    const image = document.createElementNS(ns, 'image');
    for (const [k, v] of Object.entries({ href, x, y, width: w, height: h }))
      image.setAttribute(k, v);
    layer.append(image);
    // Outside the app's world group (Preact owns it), following its transform.
    world.before(layer);
    const follow = () => layer.setAttribute('transform', world.getAttribute('transform') ?? '');
    follow();
    new MutationObserver(follow).observe(world, {
      attributes: true,
      attributeFilter: ['transform'],
    });
    for (const p of parts.slice(1)) p.style.display = 'none';
  };
}

const pct = (values, q) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const med = (v) => pct(v, 0.5);

/** Main-thread self time by kind, and raster time, from a Chromium trace. */
function summariseTrace(json) {
  const events = (json.traceEvents ?? json).filter((e) => e.ph === 'X' && e.dur !== undefined);
  const threads = new Map();
  for (const e of json.traceEvents ?? json) {
    if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const main = [...threads.entries()].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
  const bucket = (name) => {
    if (/^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)$/.test(name)) return 'style';
    if (/^(Layout|UpdateLayerTree|LayoutShift)$/.test(name)) return 'layout';
    if (/^(PrePaint|Paint|PaintImage)$/.test(name)) return 'paint';
    if (/^(Layerize|Commit|UpdateLayer|CompositeLayers)$/.test(name)) return 'composite';
    if (
      /^(FunctionCall|EvaluateScript|v8\.|RunMicrotasks|TimerFire|FireAnimationFrame|EventDispatch|V8\.)/.test(
        name,
      )
    )
      return 'script';
    if (/^(MajorGC|MinorGC|V8\.GC)/.test(name)) return 'gc';
    return null;
  };
  const totals = { script: 0, style: 0, layout: 0, paint: 0, composite: 0, gc: 0, raster: 0 };
  for (const key of main) {
    const list = events
      .filter((e) => `${e.pid}:${e.tid}` === key)
      .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const stack = [];
    const self = new Map();
    for (const e of list) {
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts)
        stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) self.set(parent, (self.get(parent) ?? parent.dur) - e.dur);
      self.set(e, self.get(e) ?? e.dur);
      stack.push(e);
    }
    for (const [e, t] of self) {
      const b = bucket(e.name);
      if (b) totals[b] += Math.max(0, t) / 1000;
    }
  }
  for (const e of events) {
    if (/^(RasterTask|ImageDecodeTask|GpuRasterization)$/.test(e.name))
      totals.raster += e.dur / 1000;
  }
  // Input to presentation, per touch event (EventLatency), and presented versus dropped frames.
  const open = new Map();
  const latency = { TOUCH_MOVED: [], TOUCH_RELEASED: [], TOUCH_PRESSED: [] };
  const frames = { presented: 0, dropped: 0 };
  for (const e of json.traceEvents ?? json) {
    if (e.name === 'EventLatency') {
      const key = `${e.pid}:${e.id2?.local ?? e.id}`;
      if (e.ph === 'b') open.set(key, e);
      else if (e.ph === 'e' && open.has(key)) {
        const b = open.get(key);
        open.delete(key);
        const type = b.args?.event_latency?.event_type;
        if (latency[type]) latency[type].push((e.ts - b.ts) / 1000);
      }
    }
    if (e.name === 'PipelineReporter' && e.ph === 'b') {
      const state = e.args?.frame_reporter?.state ?? '';
      if (/PRESENTED/.test(state)) frames.presented += 1;
      else if (/DROPPED/.test(state)) frames.dropped += 1;
    }
  }
  return { ...totals, latency, frames };
}

const PROFILES = {
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, bypassCSP: true },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false, bypassCSP: true },
};

async function measure(browser, url, experiment, rate, profile) {
  const touch = profile === 'phone';
  const context = await browser.newContext(PROFILES[profile]);
  const page = await context.newPage();
  // The radius-6 window (the config default) in the hand-written joined scenario, on the real core.
  const fake = new FakeServer();
  fake.reset(joinedScenario());
  await page.route(
    (u) => u.pathname.startsWith('/api/'),
    (r) => fake.route(r),
  );
  await page.addInitScript(harness);
  await page.goto(url);
  await page.waitForSelector('.map-world svg g');
  await page.waitForTimeout(400);
  const fn = EXPERIMENTS[experiment];
  if (fn) {
    await page.evaluate(fn);
    await page.waitForTimeout(300);
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const vp = page.viewportSize();
  const svg = page.locator('svg.map');
  const nums = async (name) => (await svg.getAttribute(name)).split(' ').map(Number);
  const hexOnScreen = async (q, r) => {
    const [vx, vy, scale] = await nums('data-view');
    const [size, squash] = await nums('data-projection');
    return [vx + size * 1.5 * q * scale, vy + size * Math.sqrt(3) * (r + q / 2) * squash * scale];
  };
  const events = () => page.evaluate(() => window.__perf.events.splice(0));
  const record = (on) =>
    page.evaluate((v) => {
      window.__perf.recording = v;
      if (v) {
        window.__perf.frames = [];
        window.__perf.lags = [];
      }
    }, on);
  const settle = () => page.waitForTimeout(600);

  const traced = async (action) => {
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'v8',
        'cc',
        'benchmark',
        'input',
        'gpu',
      ],
    });
    const result = await action();
    const raw = JSON.parse((await browser.stopTracing()).toString('utf8'));
    if (process.env.PERF_TRACE_OUT)
      writeFileSync(
        `${process.env.PERF_TRACE_OUT}-${profile}-${experiment}-${rate}.json`,
        JSON.stringify(raw),
      );
    return { result, trace: summariseTrace(raw) };
  };

  const tapAt = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

  // (a) Tap latency: open and close the bubble on the creature, several times.
  const [cq, cr] = await nums('data-creature');
  const taps = [];
  await events();
  const tapTraced = await traced(async () => {
    for (let i = 0; i < 6; i += 1) {
      const [x, y] = await hexOnScreen(cq, cr);
      await tapAt(x, y);
      await page.waitForTimeout(350);
      const ups = (await events()).filter((e) => e.name === 'pointerup');
      const opened = (await page.locator('[data-popover]').count()) > 0;
      if (opened && ups.length) taps.push(Math.max(...ups.map((e) => e.duration)));
      else if (opened) taps.push(16); // under the Event Timing threshold
    }
  });
  if ((await page.locator('[data-popover]').count()) > 0) {
    const [x, y] = await hexOnScreen(cq, cr);
    await tapAt(x, y);
    await page.waitForTimeout(300);
  }

  // (a2) Tap on a hex: its card (the inspect popover) painted. Two empty hexes beside the creature, in turn.
  const hexTaps = [];
  await events();
  {
    for (let i = 0; i < 6; i += 1) {
      const [x, y] = await hexOnScreen(cq + (i % 2 ? -2 : 2), cr + (i % 2 ? 0 : -1));
      await tapAt(x, y);
      await page.waitForTimeout(350);
      const ups = (await events()).filter((e) => e.name === 'pointerup' || e.name === 'click');
      const shown = (await page.locator('[data-popover=inspect]').count()) > 0;
      if (shown && ups.length) hexTaps.push(Math.max(...ups.map((e) => e.duration)));
      else if (shown) hexTaps.push(16); // under the Event Timing threshold
    }
  }

  // (b) A touch drag: frames and move-to-frame lag while it runs, then the frames after release.
  await settle();
  await events();
  const dragTraced = await traced(async () => {
    await record(true);
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(vp.width / 2),
      y: Math.round(vp.height / 2),
      xDistance: -160,
      yDistance: -220,
      speed: 600,
      gestureSourceType: touch ? 'touch' : 'mouse',
      repeatCount: 1,
    });
    const dragEnd = await page.evaluate(() => performance.now());
    await settle();
    await record(false);
    return dragEnd;
  });
  const dragEnd = dragTraced.result;
  const drag = await page.evaluate(() => ({
    frames: window.__perf.frames,
    lags: window.__perf.lags,
  }));
  const dragFrames = drag.frames.filter((f) => f.at <= dragEnd).map((f) => f.dt);
  const releaseFrame = Math.max(0, ...drag.frames.filter((f) => f.at > dragEnd).map((f) => f.dt));
  const dragUp = (await events()).filter((e) => e.name === 'pointerup').map((e) => e.duration);

  // A pinch out (zooms in by a step, so the scene redraws on release).
  const pinchTraced = await traced(async () => {
    await record(true);
    if (touch) {
      await cdp.send('Input.synthesizePinchGesture', {
        x: Math.round(vp.width / 2),
        y: Math.round(vp.height / 2),
        scaleFactor: 1.6,
        relativeSpeed: 400,
        gestureSourceType: 'touch',
      });
    } else {
      // Desktop zooms with the wheel (a pinch is a touch gesture).
      await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, -60);
        await page.waitForTimeout(16);
      }
    }
    const pinchEnd = await page.evaluate(() => performance.now());
    await settle();
    await record(false);
    return pinchEnd;
  });
  const pinchEnd = pinchTraced.result;
  const pinch = await page.evaluate(() => ({
    frames: window.__perf.frames,
    lags: window.__perf.lags,
  }));
  const pinchFrames = pinch.frames.filter((f) => f.at <= pinchEnd).map((f) => f.dt);
  const pinchRelease = Math.max(0, ...pinch.frames.filter((f) => f.at > pinchEnd).map((f) => f.dt));
  const pinchEvents = await events();
  // (c) The redraw at the new zoom step happens in the pointerup that ends the pinch.
  const zoomRedraw = Math.max(
    0,
    ...pinchEvents.filter((e) => e.name === 'pointerup').map((e) => e.duration),
  );

  // (c) Next day: the click redraws the whole scene.
  await page.locator('[aria-label="Next day"]').click();
  await settle();
  const day = (await events()).filter((e) => /^(click|pointerup|pointerdown)$/.test(e.name));
  const nextDay = Math.max(0, ...day.map((e) => e.duration));

  const nodes = await page.evaluate(() => document.querySelectorAll('.map-root svg *').length);
  await context.close();
  return {
    experiment,
    profile,
    rate,
    nodes,
    tap: med(taps),
    tapP95: pct(taps, 0.95),
    hexTap: med(hexTaps),
    hexTapP95: pct(hexTaps, 0.95),
    hexTapCount: hexTaps.length,
    dragP50: med(dragFrames),
    dragP95: pct(dragFrames, 0.95),
    dragLag: med(drag.lags),
    dragLagP95: pct(drag.lags, 0.95),
    dragRelease: releaseFrame,
    dragUp: Math.max(0, ...dragUp),
    pinchP50: med(pinchFrames),
    pinchP95: pct(pinchFrames, 0.95),
    pinchRelease,
    zoomRedraw,
    nextDay,
    taps: tapTraced.trace,
    drag: dragTraced.trace,
    pinch: pinchTraced.trace,
  };
}

async function run() {
  mkdirSync(out, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const experiment of Object.keys(EXPERIMENTS)) {
      if (ONLY && !ONLY.includes(experiment)) continue;
      for (const profile of PROFILE_NAMES) {
        // Desktop is measured at 4x only (a desktop is not throttled harder than that).
        for (const rate of profile === 'desktop' ? RATES.slice(0, 1) : RATES) {
          const r = await measure(browser, vite.url, experiment, rate, profile);
          results.push(r);
          console.error(`done: ${profile} ${experiment} at ${rate}x`);
        }
      }
    }
  } finally {
    await browser.close();
    vite.stop();
  }
  const f = (n) => (Number.isFinite(n) ? n.toFixed(0) : '–');
  const lat = (t, type, q) => pct(t.latency[type], q);
  console.log(
    'Summary (ms; frame times are main-thread rAF during a drag; tap = pointerup to paint):\n',
  );
  console.log(
    '| device | experiment | CPU | drag frame p95 | tap creature p50/p95 | tap hex p50/p95 (n) | SVG elements |',
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.profile} | ${r.experiment} | ${r.rate}× | ${f(r.dragP95)} | ${f(r.tap)}/${f(r.tapP95)} | ${f(r.hexTap)}/${f(r.hexTapP95)} (${r.hexTapCount}) | ${r.nodes} |`,
    );
  }
  console.log(
    '\nInput to presentation (EventLatency, ms) and frames, from traces of a touch drag and a pinch:\n',
  );
  console.log(
    '| device | experiment | CPU | tap ms | drag move→screen p50/p95 | drag release | drag frames shown/dropped | pinch move→screen p50/p95 | pinch release (zoom redraw) | next day ms | nodes |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const d = r.drag;
    const p = r.pinch;
    console.log(
      `| ${r.profile} | ${r.experiment} | ${r.rate}× | ${f(r.tap)} | ${f(lat(d, 'TOUCH_MOVED', 0.5))}/${f(lat(d, 'TOUCH_MOVED', 0.95))} | ${f(lat(d, 'TOUCH_RELEASED', 0.5))} | ${d.frames.presented}/${d.frames.dropped} | ${f(lat(p, 'TOUCH_MOVED', 0.5))}/${f(lat(p, 'TOUCH_MOVED', 0.95))} | ${f(Math.max(lat(p, 'TOUCH_RELEASED', 0.5), r.zoomRedraw))} | ${f(r.nextDay)} | ${r.nodes} |`,
    );
  }
  console.log(
    '\nWhere time goes during six taps (ms; main-thread self time, raster on all threads):\n',
  );
  console.log(
    '| device | experiment | CPU | script | style | layout | paint | layerize+commit | raster |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const t = r.taps;
    console.log(
      `| ${r.profile} | ${r.experiment} | ${r.rate}× | ${f(t.script)} | ${f(t.style)} | ${f(t.layout)} | ${f(t.paint)} | ${f(t.composite)} | ${f(t.raster)} |`,
    );
  }
  console.log(
    '\nWhere time goes during the drag and its release (ms; main-thread self time, raster on all threads):\n',
  );
  console.log(
    '| device | experiment | CPU | script | style | layout | paint | layerize+commit | raster | main-thread rAF p50/p95 |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const t = r.drag;
    console.log(
      `| ${r.profile} | ${r.experiment} | ${r.rate}× | ${f(t.script)} | ${f(t.style)} | ${f(t.layout)} | ${f(t.paint)} | ${f(t.composite)} | ${f(t.raster)} | ${f(r.dragP50)}/${f(r.dragP95)} |`,
    );
  }
  writeFileSync(join(out, 'perf.json'), `${JSON.stringify(results, null, 2)}\n`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
