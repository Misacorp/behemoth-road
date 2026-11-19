#!/usr/bin/env node
/* global URL, console, process, window, document, performance, requestAnimationFrame */
/**
 * Loads the built app (apps/web/dist) in Chromium at a phone and a desktop size, plays a scripted
 * tap, tap, confirm move and a next day, and writes screenshots to screenshots/ at the repo root
 * (gitignored). Serves dist/ with the headers from public/_headers, so a CSP violation fails the run.
 * It also measures frame times during a scripted drag, with the CPU slowed down 4x.
 *
 * Usage: pnpm --filter @behemoth-road/web build && node apps/web/scripts/screenshots.mjs
 * Not part of the unit test run. Needs the pre-installed Playwright (require('playwright')).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const dist = join(web, 'dist');
const out = resolve(web, '../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** Headers for every path from public/_headers (only the `/*` block is used). */
function readHeaders() {
  const headers = {};
  for (const line of readFileSync(join(web, 'public/_headers'), 'utf8').split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) headers[m[1]] = m[2].trim();
  }
  return headers;
}

function serve() {
  const headers = readHeaders();
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(dist, 'index.html');
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];

async function run() {
  if (!existsSync(join(dist, 'index.html')))
    throw new Error('Build first: pnpm --filter @behemoth-road/web build');
  mkdirSync(out, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  const report = [];
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        hasTouch: vp.touch,
        isMobile: vp.touch,
      });
      const page = await context.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error' || /Content Security Policy/i.test(m.text()))
          problems.push(`${vp.name}: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
      await page.goto(url);
      await page.waitForSelector('svg.map g');
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(out, `m1-map-${vp.name}-1-start.png`) });

      const tap = async (x, y) => {
        if (vp.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(150);
      };
      const svg = page.locator('svg.map');
      const nums = async (name) => (await svg.getAttribute(name)).split(' ').map(Number);
      /** Screen position of a hex centre, plus an offset in hex sizes on the plane. */
      const hexOnScreen = async (q, r, dx = 0, dy = 0) => {
        const [vx, vy, scale] = await nums('data-view');
        const [size, squash] = await nums('data-projection');
        const x = size * 1.5 * q + dx * size;
        const y = (size * Math.sqrt(3) * (r + q / 2) + dy * size) * squash;
        return [vx + x * scale, vy + y * scale];
      };
      const creature = async () => nums('data-creature');
      const shot = (name) => page.screenshot({ path: join(out, `m1-map-${vp.name}-${name}.png`) });
      const cx = vp.width / 2;
      const cy = vp.height / 2;
      const has = async (kind) => (await page.locator(`[data-popover=${kind}]`).count()) > 0;
      // The character starts riding: a tap anywhere on the creature selects it and opens the bubble.
      const [q0, r0] = await creature();
      const tapCreature = async () => tap(...(await hexOnScreen(q0, r0)));
      await tapCreature();
      if (!(await has('bubble'))) problems.push(`${vp.name}: no bubble while riding`);
      await shot('2-bubble-riding');

      // Step off: try the hexes around the footprint, south side first.
      const ring = [
        [0, 2],
        [-1, 2],
        [1, 1],
        [-2, 2],
        [2, 0],
        [-2, 1],
        [2, -1],
        [1, -2],
      ];
      let off = null;
      for (const [dq, dr] of ring) {
        await tap(...(await hexOnScreen(q0 + dq, r0 + dr)));
        if (await page.locator('[data-popover=confirm]').count()) {
          off = [q0 + dq, r0 + dr];
          break;
        }
        await tapCreature();
      }
      if (!off) problems.push(`${vp.name}: no hex to step off to`);
      await shot('3-plan-step-off');
      if (off) await page.locator('[aria-label=Confirm]').click();
      await page.waitForTimeout(200);
      await shot('4-stepped-off');

      // Board again: the character stays selected after a move; tap any footprint hex.
      if (off) {
        await tap(...(await hexOnScreen(q0, r0 - 1)));
        if (!(await page.locator('[data-popover=confirm]').count()))
          problems.push(`${vp.name}: could not plan boarding`);
        await shot('5-plan-board');
        await page.locator('[aria-label=Confirm]').click();
        await page.waitForTimeout(200);
      }
      await page.locator('[aria-label="Next day"]').click();
      await page.waitForTimeout(700);
      await shot('6-next-day-riding');

      // The hub: the bubble's creature entry opens the creature card.
      const [q1, r1] = await creature();
      await tap(...(await hexOnScreen(q1, r1)));
      await page.locator('[data-popover=bubble] [aria-label=Behemoth]').click();
      await page.waitForTimeout(150);
      if (!(await has('creature'))) problems.push(`${vp.name}: no creature card`);
      await shot('7-creature');
      // Inspect a hex a few steps away.
      await tap(...(await hexOnScreen(q1 - 3, r1 + 1)));
      if (!(await page.locator('[data-popover=inspect]').count()))
        problems.push(`${vp.name}: no inspect popover`);
      await shot('8-inspect');

      // Frame times during a drag, CPU slowed 4x.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.evaluate(() => {
        window.__frames = [];
        let last = performance.now();
        const tick = (now) => {
          window.__frames.push(now - last);
          last = now;
          if (window.__frames.length < 400) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const world = page.locator('svg.map > g').first();
      const before = await world.getAttribute('transform');
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 60; i += 1) await page.mouse.move(cx - i * 4, cy - i * 2);
      await page.mouse.up();
      if ((await world.getAttribute('transform')) === before)
        problems.push(`${vp.name}: drag did not pan`);
      const scaleBefore = await svg.getAttribute('data-view');
      // Mobile emulation sends no wheel events; the desktop run checks wheel zoom.
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(100);
      if (!vp.touch && (await svg.getAttribute('data-view')) === scaleBefore) {
        problems.push(`${vp.name}: wheel did not zoom`);
      }
      const frames = await page.evaluate(() => window.__frames.slice(2));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const sorted = [...frames].sort((a, b) => a - b);
      const pct = (q) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]?.toFixed(1);
      report.push(
        `${vp.name}: drag at 4x CPU slowdown, ${frames.length} frames, median ${pct(0.5)} ms, p95 ${pct(0.95)} ms`,
      );
      const nodes = await page.evaluate(() => document.querySelectorAll('svg.map *').length);
      report.push(`${vp.name}: ${nodes} SVG elements in the map`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  for (const line of report) console.log(line);
  console.log(`Screenshots in ${out}`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
