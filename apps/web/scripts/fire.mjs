#!/usr/bin/env node
/* global console, process, document */
/**
 * Screenshots and browser checks for the fire rework: a cold brazier, a lit brazier with its embers, the
 * glow, a swarm selected with its blocked stripes, the rockslide's strike odds, parley odds, a pinned
 * character lying down with dig-out offered, your own pinned card with struggle and its odds, and the burnt deadfall, on a phone and a desktop size, against
 * the fake game server. Phone: a long-press sweep over every tipped element of each popover. Written to
 * screenshots/ (gitignored) as `fire-*`. Any problem is listed and exits 1.
 *
 * Usage: FAKE_GAME_PORT=5183 node apps/web/scripts/fire.mjs
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
const { seasonScenario } = await import('../src/api/fixtures.ts');

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

/** A season scenario for a player who has seen everything, with the story read. */
const staged = (stage) => {
  const s = seasonScenario(stage);
  return { ...s, seen: veteran, storyRead: s.state.story.fired };
};

// Offsets from the creature's centre (the chain's spots).
const START = { q: 1, r: 2 };
const NEAR = { q: 1, r: 3 };
const OLA = { q: 0, r: 2 };

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
  console.log('\nfire: no problems');
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
  const shot = (name) => page.screenshot({ path: join(out, `fire-${vp.name}-${name}.png`) });
  const fail = (msg) => problems.push(`${vp.name}: ${msg}`);
  const wait = (ms) => page.waitForTimeout(ms);
  const count = (sel) => page.locator(sel).count();
  const open = async (scenario) => {
    fake.reset(scenario);
    await page.goto(vite.url);
    await page.locator('svg.map').waitFor();
    await wait(900);
  };
  const tapAt = async (x, y) => {
    if (vp.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(350);
  };
  const nums = async (name) =>
    (await page.locator('svg.map').getAttribute(name)).split(' ').map(Number);
  const hexOnScreen = async (q, r, lift = 0) => {
    const [vx, vy, scale] = await nums('data-view');
    const [size, squash] = await nums('data-projection');
    return [
      vx + size * 1.5 * q * scale,
      vy + size * Math.sqrt(3) * (r + q / 2) * squash * scale - lift,
    ];
  };
  const centre = async () => {
    // The creature's centre is the view's origin: offsets are relative to it.
    return fake.scenario.state.creature.centre;
  };
  const tapHex = async (h, lift = 0) => {
    const c = await centre();
    const [x, y] = await hexOnScreen(c.q + h.q, c.r + h.r, lift);
    await tapAt(x, y);
  };
  /** Phone: long-press each tipped element in the open popover; a tip must show and the popover stay. */
  const holdAll = async (kind) => {
    if (!cdp) return;
    const sel = `[data-popover=${kind}]`;
    const targets = await page.evaluate((q) => {
      const root = document.querySelector(q);
      if (!root) return [];
      const seen = new Set();
      return [...root.querySelectorAll('[data-tip],[data-tile-tip]')].flatMap((el) => {
        const b = el.getBoundingClientRect();
        if (b.width < 3 || b.height < 3) return [];
        const x = b.x + b.width / 2;
        const y = b.y + b.height / 2;
        const top = document.elementFromPoint(x, y);
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (!top || !el.contains(top) || seen.has(key)) return [];
        seen.add(key);
        return [{ x, y, name: el.getAttribute('data-tip') ?? 'tile' }];
      });
    }, sel);
    if (!targets.length) fail(`holdAll(${kind}): no tipped elements`);
    for (const t of targets) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: t.x, y: t.y }],
      });
      await wait(520);
      const shown = await count('.tip');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await wait(200);
      if (!shown) fail(`long press on ${t.name} in ${kind} showed no tip`);
      if (!(await count(sel))) {
        fail(`long press on ${t.name} closed the ${kind} popover`);
        return;
      }
      await page.keyboard.press('Escape');
      await wait(150);
    }
    console.log(`holdAll ${vp.name} ${kind}: ${targets.length} elements long-pressed`);
  };
  /** Hover (desktop) or hold (phone) an odds mark: its tip shows the numbers. */
  const oddsTip = async (sel, text) => {
    const box = await page.locator(sel).first().boundingBox();
    if (!box) return fail(`no ${sel}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await wait(520);
    } else {
      await page.mouse.move(x, y);
      await wait(900);
    }
    const shown = await page
      .locator('.tip')
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => '');
    if (!shown || !shown.includes(text)) fail(`odds tip says "${shown}", wanted "${text}"`);
    await shot(`odds-tip-${text.replace(/\W+/g, '-')}`);
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.move(2, 2);
    await page.keyboard.press('Escape');
    await wait(200);
  };
  /** The popover and the open tip must lie inside the screen. */
  const onScreen = async (sel, what) => {
    const box = await page.locator(sel).first().boundingBox();
    if (
      !box ||
      box.x < -1 ||
      box.y < -1 ||
      box.x + box.width > vp.width + 1 ||
      box.y + box.height > vp.height + 1
    )
      fail(`${what} is off screen: ${JSON.stringify(box)}`);
  };

  // 1. A cold brazier: tapped from the next hex, then lit from your own hex's card.
  await open(staged({ brazier: true, at: 'tomb', explored: ['tomb'], pack: { timber: 2 } }));
  if ((await count('svg.map')) !== 1) fail('no map');
  await tapHex(START, 20);
  if (!(await count('[data-popover=inspect][data-feature=brazier]'))) fail('no brazier card');
  if (await count('[data-mark=nights]')) fail('a cold brazier shows embers');
  await shot('brazier-cold');
  await holdAll('inspect');
  await page.keyboard.press('Escape');
  await open(staged({ brazier: true, pack: { timber: 2 } }));
  await tapHex(START, 8);
  if (!(await count('[data-action=light-fire]'))) fail('no light-fire on a brazier');
  await shot('brazier-here-card');

  // 2. A lit brazier: its embers in the card.
  await open(staged({ brazierLit: 3, at: 'tomb', explored: ['tomb'] }));
  await tapHex(START, 20);
  if ((await count('[data-mark=nights]')) !== 1) fail('no nights-left embers on a lit brazier');
  await shot('brazier-lit');
  await holdAll('inspect');

  // 3. No ring on the map at all; selecting a swarm shows the blocked stripes near a lit brazier.
  const stripes = '[data-blocked]:not([data-blocked="0"])';
  await open(staged({ brazierLit: 3, threats: [{ type: 'swarm', at: { q: 2, r: 4 } }] }));
  if (await count('[data-fire-ring]')) fail('an always-on fire ring is still drawn');
  if (await count(stripes)) fail('blocked stripes show with nothing selected');
  if (!(await count('[data-fire-glow]'))) fail('no glow under a lit brazier');
  await shot('swarm-unselected');
  await tapHex({ q: 2, r: 4 }, 20);
  if (!(await count('[data-popover=threat]'))) fail('no swarm card');
  if (!(await count(stripes))) fail('no blocked stripes on a selected swarm');
  if (!(await count('[data-popover=threat] [data-mark=fears-fire]')))
    fail('no fears-fire mark in the swarm popover');
  await shot('swarm-blocked');
  await holdAll('threat');
  await page.keyboard.press('Escape');
  await wait(300);
  if (await count(stripes)) fail('blocked stripes stay after the popover closed');
  await open(staged({ brazierLit: 3 }));
  if (await count('[data-blocked]')) fail('blocked stripes without a threat');
  await shot('fire-no-ring');
  await open(staged({ threats: [{ type: 'swarm', at: { q: 2, r: 4 } }] }));
  await tapHex({ q: 2, r: 4 }, 20);
  if (!(await count('[data-mark=fears-fire]'))) fail('no fears-fire mark on a swarm');
  if (await count(stripes)) fail('stripes with no fire burning');
  await shot('swarm-card');
  await holdAll('threat');

  // 3b. A lit brazier's glow, and none round a cold one.
  await open(staged({ brazierLit: 3 }));
  if ((await count('[data-fire-glow]')) !== 1) fail('the lit brazier has no single glow');
  await shot('brazier-glow');
  await open(staged({ brazier: true }));
  if (await count('[data-fire-glow]')) fail('a cold brazier has a glow');
  await shot('brazier-no-glow');

  // 4. The rockslide's strike option with its odds.
  await open(staged({ threats: [{ type: 'rockslide', at: NEAR }] }));
  await tapHex(NEAR, 20);
  if (!(await count('[data-popover=threat] [data-mark=odds]')))
    fail('no odds on the rockslide card');
  if (!(await count('[data-action=strike]'))) fail('no strike on the rockslide card');
  await onScreen('[data-popover=threat]', 'the rockslide card');
  await shot('rockslide-odds');
  await oddsTip('[data-popover=threat] [data-mark=odds]', 'Success 80%');
  await holdAll('threat');

  // 4b. Parley odds at a wary settlement.
  await open(staged({ settlements: [{ at: START }] }));
  await tapHex(START, 8);
  if (!(await count('[data-popover=here] [data-action=parley] [data-mark=odds]')))
    fail('no odds on parley');
  await onScreen('[data-popover=here]', 'the parley card');
  await shot('parley-odds');
  await holdAll('here');

  // 5. A pinned character beside you: dig-out in their card. Then you, pinned, with struggle.
  await open(staged({ pinned: ['ola'] }));
  if (!(await count('[data-ola-pin],svg.map'))) fail('no map');
  await shot('pinned-lying');
  await tapHex(OLA, 8);
  if (!(await count('[data-action=dig-out]'))) fail('no dig-out on a pinned character');
  if (await count('[data-popover=character]'))
    await onScreen('[data-popover=character]', 'the pinned character card');
  await shot('pinned-dig-out');
  await holdAll('character');
  await open(
    staged({ pinned: ['me'], pinnedActions: 2, struggles: 1, brazier: true, pack: { timber: 1 } }),
  );
  if (!(await count('.hud-pinned'))) fail('no pinned mark in the HUD');
  await tapHex(START, 8);
  if (!(await count('[data-popover=here] [data-action=struggle]:not([aria-disabled=true])')))
    fail('no struggle on the pinned self card');
  if (
    !(await count('[data-popover=here] [data-action=struggle] [data-mark=odds][data-success="40"]'))
  )
    fail('struggle odds are not 40% after one failed try');
  const grey = await page
    .locator('[data-popover=here] [data-action=light-fire][aria-disabled=true]')
    .count();
  if (!grey) fail('the pinned player’s fire is not greyed');
  await onScreen('[data-popover=here]', 'the pinned self card');
  await shot('pinned-self');
  await oddsTip('[data-popover=here] [data-mark=odds]', 'Success 40%');
  await holdAll('here');

  // 6. A burnable (deadfall) with its hint, and what a fire left of one.
  await open(
    staged({ deposit: 'deadfall', explored: ['iron'], at: 'start', burnt: [{ q: 2, r: 2 }] }),
  );
  await tapHex(NEAR, 20);
  if (!(await count('[data-mark=burnable]'))) fail('no burnable mark on a deadfall');
  await shot('deadfall-burnable');
  await holdAll('inspect');
  await page.keyboard.press('Escape');
  // The scar is drawn from `burnt[]` in the scene (covered by the unit tests); only the shot shows it.
  await shot('burnt');

  await context.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
