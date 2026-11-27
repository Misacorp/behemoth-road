#!/usr/bin/env node
/* global console, process */
/**
 * Screenshots and browser checks for the season-one story: the passing card on load (one, oldest first),
 * the badge that plays the rest one tap at a time, reads posted in batches and never again, traces and a
 * standing stone on the map with their tips (who and which step), the date and the Greyfold mark, and the
 * endings with their lines, on a phone and a desktop size, against the fake game server. Written to
 * screenshots/ (gitignored) as `story-*`. Any problem is listed and exits 1.
 *
 * Usage: FAKE_GAME_PORT=5183 node apps/web/scripts/story.mjs
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
const { joinedScenario, seasonScenario, toView, characterIdOf, USERS } =
  await import('../src/api/fixtures.ts');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'laptop', width: 1280, height: 720, touch: false, endingsOnly: true },
];
const problems = [];
const veteran = [...SEEN_IDS];

/** The joined scenario with the story staged: what fired, what was read, the route walked, the traces. */
function staged({ fired, read = [], steps = 0, traces = [] }) {
  const base = joinedScenario();
  const me = characterIdOf(toView(base), USERS.MISA);
  const state = {
    ...base.state,
    creature: { ...base.state.creature, steps },
    story: { ...base.state.story, fired },
    traces: traces.map((t) => ({ ...t, ...(t.by ? { by: me } : {}) })),
  };
  return { ...base, state, seen: veteran, storyRead: read };
}

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
  console.log('\nstory: no problems');
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
  const shot = (name) => page.screenshot({ path: join(out, `story-${vp.name}-${name}.png`) });
  const fail = (msg) => problems.push(`${vp.name}: ${msg}`);
  const wait = (ms) => page.waitForTimeout(ms);
  const count = (sel) => page.locator(sel).count();
  const open = async (scenario) => {
    fake.reset(scenario);
    fake.storyPosts = [];
    await page.goto(vite.url);
    await page.locator('svg.map, .ending').first().waitFor();
    await wait(900);
  };
  const tapAt = async (x, y) => {
    if (vp.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(200);
  };
  const nums = async (name) =>
    (await page.locator('svg.map').getAttribute(name)).split(' ').map(Number);
  const hexOnScreen = async (q, r) => {
    const [vx, vy, scale] = await nums('data-view');
    const [size, squash] = await nums('data-projection');
    return [vx + size * 1.5 * q * scale, vy + size * Math.sqrt(3) * (r + q / 2) * squash * scale];
  };
  const cardId = () => page.locator('.story-card').first().getAttribute('data-story');
  const posts = () => (fake.storyPosts ?? []).map((p) => p.join(','));
  /** A hold on a point: a long press on a phone, a rest of the mouse on desktop. */
  const holdAt = async (x, y) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await wait(620);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await wait(1100);
    }
    await wait(150);
  };

  /** The recap players: `n` characters (the scenario's own, then clones), each with a few tallies. */
  const withPlayers = (scenario, n) => {
    const base = scenario.state.characters;
    const roles = ['scout', 'scholar', 'keeper', 'engineer', 'warden'];
    const characters = Array.from({ length: n }, (_, i) =>
      i < base.length
        ? base[i]
        : {
            ...base[i % base.length],
            id: `extra-${i}`,
            userId: `user-extra-${i}`,
            name: `Player ${i + 1}`,
            role: roles[i % roles.length],
          },
    );
    const byCharacter = Object.fromEntries(
      characters.map((c, i) => [
        c.id,
        { explored: (i * 7) % 20, strikes: (i * 3) % 7, gathered: i % 4, fed: 0 },
      ]),
    );
    const state = {
      ...scenario.state,
      characters,
      stats: { ...scenario.state.stats, byCharacter },
    };
    return { ...scenario, state, you: characters[0].userId };
  };
  /** The ending layout: the title and story card never overlap the recap, and everything is on screen. */
  const checkEndingLayout = async (name) => {
    const box = async (sel) =>
      (await count(sel)) ? page.locator(sel).first().boundingBox() : null;
    const story = await box('.ending-story');
    const recap = await box('.recap');
    const title = await box('.ending-title');
    const foot = await box('.ending-foot');
    const hit = (a, b) =>
      a &&
      b &&
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    if (hit(story, recap)) fail(`ending ${name}: the story card overlaps the recap`);
    if (hit(title, recap)) fail(`ending ${name}: the title overlaps the recap`);
    if (hit(recap, foot)) fail(`ending ${name}: the recap overlaps the foot`);
    if (hit(story, foot)) fail(`ending ${name}: the story card overlaps the foot`);
    if (hit(title, story)) fail(`ending ${name}: the title overlaps the story card`);
    for (const [what, b] of [
      ['title', title],
      ['story card', story],
      ['recap', recap],
      ['foot', foot],
    ]) {
      if (
        b &&
        (b.x < -0.5 ||
          b.y < -0.5 ||
          b.x + b.width > vp.width + 0.5 ||
          b.y + b.height > vp.height + 0.5)
      )
        fail(`ending ${name}: the ${what} is off screen`);
    }
    const clipped = await page.evaluate(() => {
      const r = document.querySelector('.recap');
      return r ? r.scrollWidth > r.clientWidth + 1 : false;
    });
    if (clipped) fail(`ending ${name}: the recap clips sideways`);
  };
  const endings = async () => {
    const lostBy = (added) => ({
      season: { status: 'over', outcome: 'lost', day: 9 },
      stats: { peril: { added, eased: {}, held: 0 } },
    });
    const lostHunger = lostBy({ hunger: 4 });
    // As Misa's screenshot: captors the biggest source, then hunger and a swarm.
    const lostPursuer = lostBy({ hunger: 3, 'threat:captors': 6, 'threat:swarm': 1 });
    const over = (outcome) => ({ season: { status: 'over', outcome, day: 9 } });
    const variants = [
      ['safe', over('safe'), 'mossback.safe', 3],
      ['wounded', over('wounded'), 'mossback.wounded', 3],
      ['lost-hunger', lostHunger, 'ending.lost.hunger', 3],
      ['lost-plain', over('lost'), null, 3],
      ['lost-pursuer', lostPursuer, 'ending.lost.pursuer', 3],
      ['lost-pursuer-1', lostPursuer, 'ending.lost.pursuer', 1],
      ['lost-pursuer-8', lostPursuer, 'ending.lost.pursuer', 8],
      ['safe-8', over('safe'), 'mossback.safe', 8],
    ];
    for (const [name, stage, line, players] of variants) {
      await open(withPlayers({ ...seasonScenario(stage), seen: veteran, storyRead: [] }, players));
      if ((await count('.story-card')) !== 0) fail(`a card over the ending (${name})`);
      const got = (await count('.ending-story'))
        ? await page.locator('.ending-story').getAttribute('data-line')
        : null;
      if (got !== line) fail(`ending ${name} shows line ${got}, wanted ${line}`);
      if ((await count('.recap-section')) !== 3) fail(`ending ${name}: the recap has no sections`);
      await checkEndingLayout(name);
      await shot(`ending-${name}`);
    }
  };

  if (vp.endingsOnly) {
    await endings();
    await context.close();
    return;
  }

  // 1. A new game: its opening beat (fired at creation, no event) plays once on load, and is read once.
  await open({ ...joinedScenario(), seen: veteran, storyRead: [] });
  if ((await count('.story-card')) !== 1) fail('no story card on load');
  else {
    if ((await cardId()) !== 'beat.setting-out') fail(`first card is ${await cardId()}`);
    const box = await page.locator('.story-card').boundingBox();
    if (
      !box ||
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > vp.width ||
      box.y + box.height > vp.height
    )
      fail('the story card is off screen');
    await shot('card-setting-out');
  }
  await wait(2200);
  if (posts().join('|') !== 'beat.setting-out') fail(`reads posted: ${posts().join('|')}`);
  await tapAt(vp.width / 2, vp.height * 0.7);
  if ((await count('.story-card')) !== 0) fail('a tap did not close the card');
  if ((await count('[data-popover]')) !== 0) fail('the closing tap also acted');
  await shot('after-card');

  // 2. Three unread: one on load, the rest one at a time from the badge; each read once.
  const three = ['beat.setting-out', 'beat.terrain.wooded', 'beat.first.settlement'];
  await open(staged({ fired: three, steps: 2 }));
  if ((await cardId()) !== three[0]) fail('the oldest unread card did not play first');
  if ((await count('.hud-story')) !== 0) fail('the badge shows while a card plays');
  await tapAt(vp.width / 2, vp.height * 0.7);
  if ((await count('.hud-story')) !== 1) fail('no badge while cards wait');
  await shot('badge');
  await page.locator('.hud-story').click({ force: true });
  await wait(300);
  if ((await cardId()) !== three[1]) fail(`badge played ${await cardId()}`);
  await shot('card-wooded');
  await tapAt(vp.width / 2, vp.height * 0.7);
  await page.locator('.hud-story').click({ force: true });
  await wait(300);
  if ((await cardId()) !== three[2]) fail(`badge played ${await cardId()}`);
  await shot('card-settlement');
  await tapAt(vp.width / 2, vp.height * 0.7);
  if ((await count('.hud-story')) !== 0) fail('the badge stays after the last card');
  await wait(700);
  if (posts().join('|') !== three.join('|') && posts().flat().join(',') !== three.join(','))
    fail(`reads posted: ${posts().join('|')}`);
  await page.reload();
  await page.locator('svg.map').waitFor();
  await wait(900);
  if ((await count('.story-card')) + (await count('.hud-story')) !== 0)
    fail('read cards came back after a reload');

  // 3. Phone: a long press on the badge shows its tip and neither plays nor changes anything.
  if (vp.touch) {
    await open(staged({ fired: three, steps: 2 }));
    await tapAt(vp.width / 2, vp.height * 0.7);
    const b = await page.locator('.hud-story').boundingBox();
    await holdAt(b.x + b.width / 2, b.y + b.height / 2);
    if ((await count('.story-card')) !== 0) fail('a long press on the badge played a card');
    if ((await count('.hud-story')) !== 1) fail('a long press on the badge changed it');
    if ((await count('.tip[data-tip-open="hud:story"]')) !== 1) fail('no tip on the badge');
    await tapAt(vp.width / 2, vp.height * 0.7);
  }

  // 4. Traces, a standing stone and the date. Everything read, so the map is clear.
  const quarter = Math.ceil(0.25 * 40);
  const base = joinedScenario();
  const c = base.state.creature.centre;
  const at = (dq, dr) => ({ q: c.q + dq, r: c.r + dr });
  const traces = [
    { kind: 'fire', hex: at(2, 0), step: 6, by: true },
    { kind: 'cairn', hex: at(-2, 2), step: 8, by: true },
    { kind: 'chain', hex: at(3, 1), step: 9, by: true },
    { kind: 'gate', hex: at(-3, 1), step: 7, by: true },
    { kind: 'trail', hex: at(0, -2), step: 8 },
    { kind: 'trail', hex: at(1, -3), step: 9 },
    { kind: 'trail', hex: at(-1, -2), step: quarter },
  ];
  const firedAll = [...three, 'beat.waymark.quarter'];
  await open(staged({ fired: firedAll, read: firedAll, steps: 9, traces }));
  if ((await count('.story-card')) + (await count('.hud-story')) !== 0) fail('read cards showed');
  const date = await page.locator('.hud-date').textContent();
  if (date?.trim() !== '9 of 40') fail(`the date reads "${date}"`);
  if ((await count('.hud-greyfold')) !== 1) fail('no Greyfold mark on the route strip');
  if ((await count('[data-stone="beat.waymark.quarter"]')) !== 1) fail('no standing stone');
  if ((await count('[data-trace]')) !== traces.length) fail('traces missing on the map');
  await shot('traces');
  const tipOf = async (dq, dr, id, text) => {
    const [x, y] = await hexOnScreen(c.q + dq, c.r + dr);
    await holdAt(x, y - 4);
    const open = await count(`.tip[data-tip-open="${id}"]`);
    if (open !== 1) fail(`no ${id} tip`);
    else {
      const t = await page.locator('.tip').first().textContent();
      for (const part of text) if (!t.includes(part)) fail(`${id} tip lacks "${part}": ${t}`);
    }
    return shot(`tip-${id.split(':')[1]}`);
  };
  await tipOf(2, 0, 'map:trace-fire', ['Fire scar', 'Step 6']);
  await tapAt(vp.width / 2, vp.height * 0.8);
  if (vp.touch) {
    // A long press on a plain trail hex does not open a tip (it behaves as an ordinary tile).
    const [x, y] = await hexOnScreen(c.q, c.r - 2);
    await holdAt(x, y - 4);
    if ((await count('.tip')) !== 0) fail('a long press on a trail hex opened a tip');
  } else {
    await tipOf(0, -2, 'map:trace-trail', ['Green trail', 'Step 8']);
  }
  await tapAt(vp.width / 2, vp.height * 0.8);
  await tipOf(-1, -2, 'map:standing-stone', ['Standing stone']);
  await tapAt(vp.width / 2, vp.height * 0.8);
  if ((await count('.tip')) !== 0) fail('a tap did not close the tip');

  // 5. Endings with their lines, and the layout of every variant.
  await endings();
  await context.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
