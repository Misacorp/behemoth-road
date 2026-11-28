#!/usr/bin/env node
/* global console, process, document, window, MouseEvent */
/**
 * Screenshots and browser checks for round 16's screens: the skill tree with its locked nodes' text, the
 * creature menu with its verbs, the ending on desktop (the recap drawer open and closed) and on a phone, the
 * fog's darker veil beside explored ground, and the destination's glow on the map and in the route strip.
 * Phone 390x844 and desktop 1440x900 against the fake game server. Written to screenshots/ as `r16-*`.
 * (The welcome-back recap is in onboarding.mjs: `ONB_ONLY=recap`.)
 *
 * Checks as it goes (any failure is listed and exits 1): every skill node shows its title and line, none says
 * "Not yet"; every care button in the creature menu has a verb; the desktop ending keeps its recap out of the
 * page until the recap button opens the drawer, which closes by its cross, Escape and the button; no recap
 * section on a phone changes with a long press; the glow is on the map and the eye mark is gone from cards.
 *
 * Usage: FAKE_GAME_PORT=5185 node apps/web/scripts/r16screens.mjs
 * Not part of the unit test run. Needs the pre-installed Playwright (require('playwright')).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FakeServer, startVite } from './fake-game.mjs';

if (!process.execArgv.includes('--experimental-transform-types')) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(res.status ?? 1);
}
const { SEEN_IDS } = await import('../../../packages/core/src/index.ts');
const { chainScenario, joinedScenario, seasonScenario } = await import('../src/api/fixtures.ts');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];
const problems = [];
const veteran = [...SEEN_IDS];

async function run() {
  mkdirSync(out, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) await runViewport(browser, vite, vp);
  } finally {
    await browser.close();
    vite.stop();
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log('\nr16 screens: no problems');
}

async function runViewport(browser, vite, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await context.newPage();
  const fake = new FakeServer();
  await page.route(
    (u) => u.pathname.startsWith('/api/'),
    (r) => fake.route(r),
  );
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${vp.name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
  const cdp = vp.touch ? await context.newCDPSession(page) : null;
  const shot = (name) => page.screenshot({ path: join(out, `r16-${vp.name}-${name}.png`) });
  const fail = (msg) => problems.push(`${vp.name}: ${msg}`);
  const wait = (ms) => page.waitForTimeout(ms);
  const count = (sel) => page.locator(sel).count();
  const open = async (scenario, ready = 'svg.map, .ending') => {
    fake.reset({ ...scenario, seen: veteran, storyRead: scenario.state.story?.fired ?? [] });
    await page.goto(vite.url);
    await page.locator(ready).first().waitFor();
    await wait(900);
  };
  const tapAt = async (x, y) => {
    if (vp.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(250);
  };
  const press = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    await tapAt(b.x + b.width / 2, b.y + b.height / 2);
  };
  const hold = async (x, y, ms = 560) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await wait(ms);
    await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px, py)?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: px,
            clientY: py,
          }),
        ),
      [x, y],
    );
    await wait(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(200);
  };
  /** Phone only: long-press each control in `root`; `still` must stay on the page. */
  const sweep = async (label, root, still) => {
    if (!cdp) return;
    const targets = await page.evaluate((q) => {
      const found = [];
      for (const el of document.querySelectorAll(
        `${q} button, ${q} [data-tip], ${q} [role=button]`,
      )) {
        const b = el.getBoundingClientRect();
        if (b.width < 3 || b.height < 3) continue;
        const x = b.x + b.width / 2;
        const y = b.y + b.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        found.push({ x, y, name: el.getAttribute('aria-label') ?? el.className ?? el.tagName });
      }
      return found;
    }, root);
    if (targets.length === 0) fail(`sweep(${label}): nothing to long-press in ${root}`);
    for (const t of targets) {
      await hold(t.x, t.y);
      if (!(await count(still))) {
        fail(`long press on ${String(t.name)} closed ${label}`);
        return;
      }
      if (await count('.tip[role=tooltip]')) await page.keyboard.press('Escape');
    }
    console.log(`sweep ${vp.name} ${label}: ${targets.length} controls long-pressed`);
  };
  const nums = async (name) =>
    (await page.locator('svg.map').getAttribute(name)).split(' ').map(Number);
  const hexOnScreen = async (q, r) => {
    const [vx, vy, scale] = await nums('data-view');
    const [size, squash] = await nums('data-projection');
    return [vx + size * 1.5 * q * scale, vy + size * Math.sqrt(3) * (r + q / 2) * squash * scale];
  };

  // 1. The skill tree: every node shows its title and line, locked or not.
  await open(chainScenario({ role: 'scout', xp: 0 }));
  await press('.hud-skills');
  await page.locator('.drawer[aria-label=Skills]').waitFor();
  await wait(400);
  const nodes = await count('.skill-caption');
  if (nodes !== 6) fail(`skills: ${nodes} captions, wanted 6`);
  if ((await count('.skill-caption-text')) !== 6) fail('skills: a node has no line');
  const text = await page.locator('.skills').innerText();
  if (/not yet/i.test(text)) fail('skills: "Not yet" is on screen');
  if (!(await count('.skill-lock[data-lock=tier]'))) fail('skills: no tier lock on a tier 2 node');
  await shot('skills-locked');
  await sweep('the skill tree', '.skills', '.skills');
  // A pick taken in one branch closes the other: its nodes keep their text, with the cut mark.
  await open(chainScenario({ role: 'scout', xp: 12, taken: ['scout-b1'] }));
  await press('.hud-skills');
  await page.locator('.drawer[aria-label=Skills]').waitFor();
  await wait(400);
  if (!(await count('.skill-lock[data-lock=closed]')))
    fail('skills: no cut mark on the closed branch');
  await shot('skills-closed');

  // 2. The creature menu: the creature alone (no arrow), each care action with its verb.
  await open(
    chainScenario({
      role: 'keeper',
      at: 'creature',
      stores: { forage: 3 },
    }),
  );
  const c = fake.scenario.state.creature.centre;
  const [cx, cy] = await hexOnScreen(c.q, c.r);
  await tapAt(cx, cy);
  await page.locator('[data-popover=bubble] [aria-label=Behemoth]').click();
  await page.locator('.drawer[aria-label=Behemoth]').waitFor();
  await wait(500);
  const care = await page.locator('.hub-care [data-care]').count();
  if (care < 2) fail(`hub: ${care} care actions, wanted feed and linger`);
  const verbs = await page.locator('.hub-care [data-care] .unlock-icon .verb').allInnerTexts();
  if (verbs.length !== care || verbs.some((t) => !t))
    fail(`hub: care verbs are ${verbs.join(',')}`);
  if (await count('.hub-creature [data-mark=heading]')) fail('hub: the heading arrow is back');
  await shot('hub');
  await sweep('the creature menu', '.hub', '.hub');

  // 3. The ending: desktop keeps the recap in a right drawer; a phone keeps its layout.
  const ended = (n) =>
    seasonScenario({ season: { status: 'over', outcome: 'safe', day: 9 }, steps: n });
  await open(ended(12), '.ending');
  if (!vp.touch) {
    if (await count('.recap'))
      fail('ending: the recap is on the page before its button is pressed');
    await shot('ending-closed');
    await press('.ending-recap-toggle');
    await page.locator('.drawer[aria-label=Recap] .recap-section').first().waitFor();
    await wait(400);
    if ((await count('.drawer .recap-section')) !== 3)
      fail('ending: the drawer lacks its sections');
    await shot('ending-drawer');
    await page.locator('.drawer .drawer-close').click();
    await wait(300);
    if (await count('.drawer')) fail('ending: the cross did not close the drawer');
    await press('.ending-recap-toggle');
    await page.locator('.drawer').waitFor();
    // The pointer leaves the button first (its hover tip would take the first Escape).
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await wait(200);
    await page.keyboard.press('Escape');
    await wait(300);
    if (await count('.drawer')) fail('ending: Escape did not close the drawer');
    await press('.ending-recap-toggle');
    await page.locator('.drawer').waitFor();
    await press('.ending-recap-toggle');
    await wait(300);
  } else {
    if (!(await count('.ending > .recap'))) fail('ending: the phone lost its inline recap');
    await shot('ending');
    await sweep('the ending', '.ending', '.ending');
  }

  // 4. Fog and the destination's glow on the map.
  // The band's near edge three rows ahead of the creature: the core's `inDestination` decides the hexes.
  const glowStage = { role: 'scout', destinationAhead: 3 };
  await open(joinedScenario());
  await shot('fog');
  await open(chainScenario(glowStage));
  if (!(await count('[data-destination-glow]'))) fail('map: no destination glow');
  if (!(await count('[data-destination]'))) fail('map: no destination hex glows');
  await shot('glow');
  if (!(await count('.hud-greyfold [data-destination-badge]'))) fail('route strip: no badge');
  await context.close();
}

await run();
