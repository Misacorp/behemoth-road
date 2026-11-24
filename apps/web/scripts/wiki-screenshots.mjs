#!/usr/bin/env node
/* global URL, console, process, document */
/**
 * Screenshots and checks of the skills wiki (/wiki), written to screenshots/wiki/ at the repo root
 * (gitignored; set WIKI_SHOTS_DIR to write elsewhere). The built app (apps/web/dist) is served with the
 * headers from public/_headers, so a CSP violation fails the run, and /wiki and /wiki/ answer wiki.html the
 * way the Worker's assets do. It plans a build by tapping, checks the cost and the URL hash, and takes a phone
 * and a desktop picture.
 *
 * Usage: pnpm --filter @behemoth-road/web build && node apps/web/scripts/wiki-screenshots.mjs
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
const out = process.env.WIKI_SHOTS_DIR ?? resolve(web, '../../screenshots/wiki');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const headers = Object.fromEntries(
  readFileSync(join(web, 'public/_headers'), 'utf8')
    .split('\n')
    .filter((l) => /^\s+[\w-]+:/.test(l))
    .map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path === '/wiki' || path === '/wiki/') path = '/wiki.html';
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
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};

for (const vp of [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${vp.name}: console ${m.text()}`);
  });
  await page.goto(`${base}/wiki`);
  await page.waitForSelector('[data-skill]');
  const text = (sel) => page.locator(sel).first().innerText();

  check((await text('[data-picks]')) === '0', `${vp.name}: starts with no picks`);
  const first = await page.locator('.wiki-card').first().getAttribute('data-role');
  await page.click(`[data-skill="${first}-a1"]`);
  await page.click(`[data-skill="${first}-a2"]`);
  check((await text('[data-picks]')) === '2', `${vp.name}: two picks`);
  // The other branch closes after the first pick.
  const closed = await page.locator(`[data-skill="${first}-b1"]`).getAttribute('data-state');
  check(closed === 'closed', `${vp.name}: other branch closed (${closed})`);
  await page.click(`[data-skill="${first}-b1"]`);
  check((await text('[data-picks]')) === '2', `${vp.name}: closed branch cannot be planned`);
  check(
    page.url().includes(`#${first}:a1,a2`),
    `${vp.name}: hash follows the plan (${page.url()})`,
  );
  const bad = await page.evaluate(() => document.querySelectorAll('[style]').length);
  check(bad === 0, `${vp.name}: no style attributes`);
  // Every tier is in the game: none is marked planned, and a tier 3 pick plans like any other.
  const planned = await page.locator('[data-planned]').count();
  check(planned === 0, `${vp.name}: no node is marked planned (${planned})`);
  await page.click(`[data-skill="${first}-a3"]`);
  const art = await page.locator(`[data-skill="${first}-a3"] svg`).getAttribute('data-skill-state');
  check(art === 'taken', `${vp.name}: a tier 3 pick is drawn as taken (${art})`);
  await page.click(`[data-skill="${first}-a3"]`);
  await page.screenshot({ path: join(out, `wiki-${vp.name}.png`), fullPage: vp.name === 'phone' });

  // A shared link opens the same plan; a mangled one an empty plan.
  await page.goto(`${base}/wiki#${first}:a1,a2`);
  await page.reload();
  check((await text('[data-picks]')) === '2', `${vp.name}: link restores the plan`);
  await page.goto(`${base}/wiki#nobody:a9`);
  await page.reload();
  check((await text('[data-picks]')) === '0', `${vp.name}: a mangled link gives an empty plan`);
  // The icon glossary: its own tab and hash, with every group drawn.
  await page.goto(`${base}/wiki#glossary`);
  await page.reload();
  await page.waitForSelector('[data-glossary]');
  const entries = await page.locator('[data-entry]').count();
  check(entries > 100, `${vp.name}: glossary lists the icons (${entries})`);
  check(
    (await page.locator('.gl-icon svg').count()) >= entries - 1,
    `${vp.name}: every entry draws`,
  );
  await page.screenshot({ path: join(out, `glossary-${vp.name}.png`), fullPage: true });
  await ctx.close();
}

await browser.close();
server.close();
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`wiki screenshots in ${out}`);
