#!/usr/bin/env node
/* global console, process, document */
/**
 * Screenshots and browser checks for round 16's move and tips work, on a phone (390 x 844) and a desktop
 * (1440 x 900) size, against the fake game server:
 *   - a tile's popover with Move and Survey;
 *   - Move armed (its first tap) with the route arrow, then the second tap walking;
 *   - an out-of-reach Move with its three pips and a plus, and the "too far" tip on a tap;
 *   - the action tip on the first tap of Gather, Strike (with odds) and Parley (with odds);
 *   - the stance fan by the hourglass;
 *   - the long survey's icons on every hex it reaches.
 * Phone: a long-press sweep over every tipped element of the popovers. Written to screenshots/ (gitignored)
 * as `r16-*`. Any problem is listed and exits 1.
 *
 * Usage: FAKE_GAME_PORT=5184 node apps/web/scripts/r16-move.mjs
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
const { SEEN_IDS, characterOf, hexDistance, toPlayerView } =
  await import('../../../packages/core/src/index.ts');
const { moveOption } = await import('../src/game/move.ts');
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
const IRON = { q: 1, r: 3 };
const NEAR = { q: 1, r: 3 };

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
  console.log('\nr16-move: no problems');
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
  const tapHex = async (h, lift = 0) => {
    const c = fake.scenario.state.creature.centre;
    const [x, y] = await hexOnScreen(c.q + h.q, c.r + h.r, lift);
    await tapAt(x, y);
  };
  /** A tap or click on an element of the popover (the card's buttons are SVG groups). */
  const press = async (sel) => {
    const box = await page.locator(sel).first().boundingBox();
    if (!box) return fail(`no ${sel} to press`);
    await tapAt(box.x + box.width / 2, box.y + box.height / 2);
  };
  const tipText = async () =>
    (await page
      .locator('.tip')
      .first()
      .textContent({ timeout: 800 })
      .catch(() => '')) ?? '';
  const expectTip = async (what, ...parts) => {
    const text = await tipText();
    for (const part of parts)
      if (!text.includes(part)) fail(`${what}: tip says "${text}", wanted "${part}"`);
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

  // 1. A tile's popover with Move and Survey (a veiled tile beside you).
  await open(staged({}));
  await tapHex(IRON, 20);
  if (!(await count('[data-popover=inspect] [data-action=move]'))) fail('no Move on the tile card');
  if (!(await count('[data-popover=inspect] [data-action=survey]')))
    fail('no Survey on the tile card');
  if (await count('[data-popover=confirm]')) fail('a confirm card shows before Move is tapped');
  await onScreen('[data-popover=inspect]', 'the tile card');
  await shot('tile-move-survey');
  await holdAll('inspect');

  // 2. Move armed: the first tap draws the route and arms it, with its tip; the second walks.
  await open(staged({}));
  await tapHex(IRON, 20);
  await press('[data-popover=inspect] [data-action=move]');
  if (!(await count('[data-popover=inspect] [data-action=move][data-armed]')))
    fail('Move is not armed after its first tap');
  if (!(await count('.map-world [data-arrow=ready]'))) fail('no route arrow after the first tap');
  await expectTip('armed Move', 'Move', 'Walk to this tile');
  await onScreen('[data-popover=inspect]', 'the armed tile card');
  await shot('move-armed-route');
  const before = JSON.stringify(
    fake.scenario.state.characters.map((c) => [c.id, c.at, c.actionsLeft]),
  );
  await press('[data-popover=inspect] [data-action=move]');
  await wait(500);
  const after = JSON.stringify(
    fake.scenario.state.characters.map((c) => [c.id, c.at, c.actionsLeft]),
  );
  if (before === after) fail('the second tap on Move did not walk');
  await shot('move-walked');

  // 3. Out of reach: Move greyed with three pips and a plus; a tap says it is too far.
  await open(staged({}));
  // A tile the core says takes more than a day's actions to reach.
  const state = fake.scenario.state;
  const view = toPlayerView(state);
  const mine = characterOf(state, fake.scenario.you);
  const centre = state.creature.centre;
  const candidates = Object.keys(state.tiles)
    .map((k) => ({ q: Number(k.split(',')[0]), r: Number(k.split(',')[1]) }))
    .filter((h) => hexDistance(h, mine.at.hex) >= 5)
    .filter((h) => moveOption(view, mine.id, { kind: 'hex', hex: h })?.plus)
    .sort((x, y) => hexDistance(x, mine.at.hex) - hexDistance(y, mine.at.hex));
  let far = null;
  for (const h of candidates) {
    const [x, y] = await hexOnScreen(h.q, h.r, 20);
    if (x > 30 && x < vp.width - 30 && y > 200 && y < vp.height - 200) {
      far = h;
      break;
    }
  }
  if (!far) fail('no tile more than a day away on the scene');
  await tapHex({ q: far.q - centre.q, r: far.r - centre.r }, 20);
  if (!(await count('[data-popover=inspect] [data-action=move][aria-disabled=true]')))
    fail('Move on a far tile is not greyed');
  if (!(await count('[data-popover=inspect] [data-action=move] [data-mark=plus]')))
    fail('no plus on the far Move');
  const pips = (await count('[data-popover=inspect] [data-action=move] [data-arrows]'))
    ? await page
        .locator('[data-popover=inspect] [data-action=move] [data-arrows]')
        .first()
        .getAttribute('data-arrows')
    : null;
  if (pips !== '3') fail(`the far Move shows ${pips} pips, not 3`);
  await press('[data-popover=inspect] [data-action=move]');
  await expectTip('far Move', 'Too far');
  if (await count('.map-world [data-arrow=ready]')) fail('a route is drawn to a tile too far away');
  await shot('move-too-far');

  // 4. The first tap of Gather, Strike with odds and Parley with odds shows its tip.
  await open(staged({ at: 'iron', explored: ['iron'] }));
  await tapHex(IRON, 8);
  await press('[data-popover=here] [data-action=gather]');
  if (!(await count('[data-popover=here] [data-action=gather][data-armed]')))
    fail('Gather is not armed by its first tap');
  await expectTip('Gather', 'Gather', 'Collect a resource.');
  await shot('tip-gather');
  await page.keyboard.press('Escape');

  await open(staged({ threats: [{ type: 'rockslide', at: NEAR }] }));
  await tapHex(NEAR, 20);
  await press('[data-popover=threat] [data-action=strike]');
  await expectTip('Strike', 'Strike', 'Deal damage to the foe.', 'Success 80%');
  await onScreen('.tip', 'the strike tip');
  await shot('tip-strike-odds');
  await page.keyboard.press('Escape');

  await open(staged({ settlements: [{ at: START }] }));
  await tapHex(START, 8);
  await press('[data-popover=here] [data-action=parley]');
  await expectTip('Parley', 'Parley', 'Win the village over.', 'Success');
  await onScreen('.tip', 'the parley tip');
  await shot('tip-parley-odds');
  await page.keyboard.press('Escape');

  // 5. The stance fan by the hourglass.
  await open(staged({}));
  const wait0 = await page.locator('.hud-wait').boundingBox();
  const stanceButton = await page.locator('.hud-stance').boundingBox();
  if (!wait0 || !stanceButton) fail('no hourglass or stance button');
  else if (Math.abs(wait0.y - stanceButton.y) > 12 || stanceButton.x < wait0.x)
    fail('the stance button is not beside the hourglass');
  await page.locator('.hud-stance').click();
  await wait(300);
  const fan = await page.locator('[data-stance-pop]').boundingBox();
  if (!fan) fail('the stance fan did not open');
  else if (wait0 && fan.y + fan.height > wait0.y + 2)
    fail('the stance fan is not above the hourglass');
  if ((await count('[data-stance-pop] [data-stance]')) !== 3)
    fail('the fan does not show 3 stances');
  await onScreen('[data-stance-pop]', 'the stance fan');
  // Rest the pointer on a stance so its own tip shows beside the fan, not the button's.
  const bubble = await page.locator('[data-stance-pop] [data-stance]').nth(1).boundingBox();
  if (bubble) await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2);
  await wait(500);
  await shot('stance-fan');
  await page.keyboard.press('Escape');

  // 6. Long survey: every hex the scout can survey carries the icon, not only the neighbours.
  await open(staged({ taken: ['scout-a1', 'scout-a2'] }));
  await tapHex(START, 8);
  const reached = await count('[data-mark=survey-hint]');
  await shot('long-survey');
  await open(staged({}));
  await tapHex(START, 8);
  const neighbours = await count('[data-mark=survey-hint]');
  if (!(reached > neighbours))
    fail(`the long survey shows ${reached} icons, no more than the ${neighbours} neighbours`);

  await context.close();
}

run().catch((err) => {
  console.error(err);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
});
