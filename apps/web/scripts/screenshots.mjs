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

/** Offsets (in hexes) to try for the move target, nearest-looking first. */
const CANDIDATES = [
  [0, -3],
  [1, -3],
  [-1, -2],
  [2, -3],
  [0, -2],
  [1, -2],
  [-2, -1],
  [2, -2],
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
        await page.waitForTimeout(120);
      };
      const cx = vp.width / 2;
      const cy = vp.height / 2;
      // The first view centres on the character's feet; tap its body.
      await tap(cx, cy - 12);
      const scale = Number(await page.locator('svg.map').getAttribute('data-scale'));
      const size = 64 * scale;
      let planned = false;
      for (const [q, r] of CANDIDATES) {
        const x = cx + 0.05 * size + 1.5 * size * q;
        const y = cy - 0.3 * size * 0.6 + Math.sqrt(3) * size * (r + q / 2) * 0.6;
        await tap(x, y);
        if (await page.locator('[data-popover=confirm]').count()) {
          planned = true;
          break;
        }
        // Not reachable: that tap opened an inspect popover; reselect the character.
        await tap(cx, cy - 12);
      }
      if (!planned) problems.push(`${vp.name}: no reachable target found`);
      await page.screenshot({ path: join(out, `m1-map-${vp.name}-2-planned.png`) });
      if (planned) await page.locator('[aria-label=Confirm]').click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(out, `m1-map-${vp.name}-3-moved.png`) });
      await page.locator('[aria-label="Next day"]').click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(out, `m1-map-${vp.name}-4-next-day.png`) });
      // Inspect a hex: tap one up and left of the centre.
      await tap(cx - 1.5 * size, cy - 2 * size * 0.6);
      await page.screenshot({ path: join(out, `m1-map-${vp.name}-5-inspect.png`) });

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
      const scaleBefore = await page.locator('svg.map').getAttribute('data-scale');
      // Mobile emulation sends no wheel events; the desktop run checks wheel zoom.
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(100);
      if (!vp.touch && (await page.locator('svg.map').getAttribute('data-scale')) === scaleBefore) {
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
