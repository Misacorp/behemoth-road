#!/usr/bin/env node
/* global console, process, document */
/**
 * Screenshots and browser checks for round 13's web part B: glass waste and a poisoned lake with their
 * popovers, the creature's step hint onto harmful ground, a scree field, the capybara (popover, lead targets,
 * confirm, settled), the cart in each state, its popover with load and unload, the hub's cart unlock and the
 * path arrow while pulling (and the rider's refusal tip), on a phone and a desktop size, against the fake game
 * server. Phone: a long-press sweep over every tipped element of each popover. Written to screenshots/
 * as `r13b-*`. Any problem is listed and exits 1.
 *
 * Usage: FAKE_GAME_PORT=5184 node apps/web/scripts/r13b.mjs
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
const { SEEN_IDS, predictCreature } = await import('../../../packages/core/src/index.ts');
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
  console.log('\nr13b: no problems');
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
  const shot = (name) => page.screenshot({ path: join(out, `r13b-${vp.name}-${name}.png`) });
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

  /** The creature's likely first step, as an offset from its centre. */
  const firstStep = () => {
    const probe = seasonScenario({}).state;
    const first = predictCreature(probe).sort((a, b) => b.chance - a.chance)[0];
    return {
      q: first.centre.q - probe.creature.centre.q,
      r: first.centre.r - probe.creature.centre.r,
    };
  };
  const hasTip = async () => (await count('.tip')) > 0;
  const closeAll = async () => {
    await page.keyboard.press('Escape');
    await wait(150);
  };
  const tapMe = async () => {
    const c = fake.scenario.state.creature.centre;
    const [x, y] = await hexOnScreen(c.q + START.q, c.r + START.r, 8);
    await tapAt(x, y);
  };

  // 1. Glass waste and a poisoned lake, with their popovers and hazard icons.
  const GLASS = { q: 3, r: 2 };
  const LAKE = { q: 3, r: 3 };
  await open(
    staged({
      terrains: [
        { at: GLASS, terrain: 'glass-waste' },
        { at: LAKE, terrain: 'poisoned-lake' },
      ],
    }),
  );
  await shot('hazard-terrain');
  await tapHex(GLASS, 20);
  if (!(await count('[data-popover=inspect] [data-hazard=glass-waste]')))
    fail('no glass-waste icon');
  await onScreen('[data-popover=inspect]', 'the glass waste card');
  await shot('glass-waste-popover');
  await holdAll('inspect');
  await closeAll();
  await tapHex(LAKE, 20);
  if (!(await count('[data-popover=inspect] [data-hazard=poisoned-lake]'))) fail('no lake icon');
  await shot('poisoned-lake-popover');
  await holdAll('inspect');
  await closeAll();

  // 2. The creature's step hint that lands on harmful ground.
  await open(staged({ terrains: [{ at: firstStep(), terrain: 'poisoned-lake' }] }));
  if (!(await count('[data-mark=step-harm]'))) fail('no harm mark on the step hint');
  await shot('step-harm');

  // 3. A scree field.
  await open(
    staged({
      threats: [
        { type: 'rockslide', at: { q: 0, r: 4 }, patch: 'h1' },
        { type: 'rockslide', at: { q: 1, r: 4 }, patch: 'h1' },
        { type: 'rockslide', at: { q: 0, r: 5 }, patch: 'h1' },
      ],
    }),
  );
  if (!(await count('[data-scree=h1]'))) fail('no scree field');
  await shot('scree-field');

  // 4. The capybara: popover, lead targets, the confirm, then it moves.
  const CAPY = { q: 1, r: 3 };
  await open(staged({ lures: [{ at: CAPY }] }));
  await shot('capybara-map');
  await tapHex(CAPY, 12);
  if (!(await count('[data-popover=lure]'))) fail('no capybara popover');
  await onScreen('[data-popover=lure]', 'the capybara card');
  await shot('capybara-popover');
  await holdAll('lure');
  await page.locator('[data-popover=lure] [data-action=lead]').first().click();
  await wait(300);
  if (!(await count('[data-mark=lead-targets]'))) fail('no lead targets');
  await shot('capybara-lead-targets');
  const target = { q: CAPY.q + 1, r: CAPY.r };
  await tapHex(target);
  if (!(await count('[data-mark=lead-arrow]'))) fail('no lead arrow');
  if (!(await count('[data-popover=confirm]'))) fail('no lead confirm');
  await shot('capybara-lead-confirm');
  await page.locator('[aria-label=Confirm]').first().click();
  await wait(600);
  const lure = fake.scenario.state.lures[0];
  const c0 = fake.scenario.state.creature.centre;
  if (lure.hex.q !== c0.q + target.q || lure.hex.r !== c0.r + target.r)
    fail('the lure did not move');
  if (lure.leadsLeft !== 2) fail('the lure did not lose a lead');
  await shot('capybara-led');

  // 5. A settled capybara.
  await open(staged({ lures: [{ at: CAPY, leadsLeft: 0 }] }));
  await shot('capybara-settled');
  await tapHex(CAPY, 12);
  await shot('capybara-settled-popover');
  await holdAll('lure');

  // 6. The cart in each state.
  const CART = { q: 1, r: 3 };
  const states = {
    empty: { carts: [{ at: CART }] },
    loaded: { carts: [{ at: CART, cargo: { timber: 3, stone: 2 } }] },
    rider: { carts: [{ at: START, rider: 'me' }] },
    hitched: { carts: [{ at: START, puller: 'me' }] },
  };
  for (const [name, stage] of Object.entries(states)) {
    await open(staged(stage));
    if (!(await count(`[data-cart][data-look=${name}]`))) fail(`no ${name} cart on the map`);
    await shot(`cart-${name}`);
  }

  // 7. The cart's popover with load and unload: one unit per tap.
  await open(staged({ pack: { timber: 2 }, carts: [{ at: CART, cargo: { stone: 2 } }] }));
  await tapHex(CART, 12);
  if (!(await count('[data-popover=cart]'))) fail('no cart popover');
  await onScreen('[data-popover=cart]', 'the cart card');
  await shot('cart-popover');
  await holdAll('cart');
  await page.locator('[data-popover=cart] [data-move=load][data-material=timber]').click();
  await wait(500);
  const loaded = fake.scenario.state.carts[0].cargo;
  if (loaded.timber !== 1) fail(`a tap did not load one unit: ${JSON.stringify(loaded)}`);
  await page.locator('[data-popover=cart] [data-move=unload][data-material=stone]').click();
  await wait(500);
  if (fake.scenario.state.carts[0].cargo.stone !== 1) fail('a tap did not unload one unit');
  await shot('cart-popover-after');

  // 8. The hub with the cart unlock.
  await open(staged({ role: 'engineer', at: 'creature', stores: { timber: 3 } }));
  await tapHex({ q: 0, r: 0 }, 0);
  await page.locator('[data-popover=bubble] [aria-label=Behemoth]').first().click();
  await wait(500);
  if (!(await count('[data-unlock=cart]'))) fail('no cart in the hub');
  await shot('hub-cart');

  // 9. The path arrow while pulling: each step's cost carries the pull extra.
  await open(staged({ carts: [{ at: START, puller: 'me' }] }));
  await tapMe();
  await tapHex({ q: 0, r: 3 });
  if (!(await count('[data-popover=confirm]'))) fail('no plan while pulling');
  if ((await count('[data-mark=cost]')) < 1) fail('no cost strip on the pulled path');
  await shot('pull-arrow');

  // 10. A rider cannot walk: its tap on another hex gives the aboard tip.
  await open(staged({ carts: [{ at: START, rider: 'me' }] }));
  await tapMe();
  await tapHex({ q: 2, r: 3 });
  await wait(300);
  if (!(await hasTip())) fail('no aboard tip for the rider');
  await shot('rider-refusal');

  // 11. Hitched: your own card has the cart button, and the cart's card offers to let it go.
  await open(
    staged({ pack: { timber: 1 }, carts: [{ at: START, puller: 'me', cargo: { stone: 1 } }] }),
  );
  await tapMe();
  await page.locator('[data-popover=here] [data-action=cart]').first().click();
  await wait(300);
  if (!(await count('[data-popover=cart] [data-action=unhitch]')))
    fail('no unhitch on the cart card');
  await onScreen('[data-popover=cart]', 'the hitched cart card');
  await shot('cart-popover-hitched');
  await holdAll('cart');

  await context.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
