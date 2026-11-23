#!/usr/bin/env node
/* global console, process, document, window, MouseEvent, getComputedStyle */
/**
 * Screenshots and browser checks for the onboarding: the intro cards, the practice map's guided day (every
 * role), the role cards in the join drawer, the first-encounter hints, the "while you were away" recap and
 * the day readout's menu, on a phone and a desktop size, against the fake game server (the real core on
 * fixtures, see fake-game.mjs) and the Vite dev server. Written to screenshots/ (gitignored) as `onb-*`.
 *
 * Checks as it goes (any failure is listed and exits 1): the practice makes no /api request and opens no
 * socket; the seen record is posted once per piece; a long press on anything of these screens neither acts
 * nor closes it; the console stays clean.
 *
 * Usage: FAKE_GAME_PORT=5181 node apps/web/scripts/onboarding.mjs
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
const { joinScenario, notJoinedScenario, joinedScenario, seasonScenario } =
  await import('../src/api/fixtures.ts');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];
const problems = [];
const ROLES = ['scout', 'scholar', 'keeper', 'engineer', 'warden'];
const veteran = [...SEEN_IDS];
/** `ONB_ONLY=recap,menu` runs only those parts (intro, hints, recap, menu); default all. */
const only = process.env.ONB_ONLY?.split(',');
const on = (part) => !only || only.includes(part);

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
  console.log('\nonboarding: no problems');
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
  let requests = [];
  let sockets = 0;
  await page.route(
    (u) => u.pathname.startsWith('/api/'),
    (r) => {
      const u = new URL(r.request().url());
      requests.push(`${r.request().method()} ${u.pathname}`);
      return fake.route(r);
    },
  );
  // Vite's own hot-reload socket is not the game's: only a socket to the API counts.
  page.on('websocket', (ws) => {
    if (ws.url().includes('/api/')) sockets += 1;
  });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${vp.name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
  const cdp = vp.touch ? await context.newCDPSession(page) : null;
  const shot = (name) => page.screenshot({ path: join(out, `onb-${vp.name}-${name}.png`) });
  const fail = (msg) => problems.push(`${vp.name}: ${msg}`);
  const wait = (ms) => page.waitForTimeout(ms);
  const count = (sel) => page.locator(sel).count();

  const tapAt = async (x, y) => {
    if (vp.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(180);
  };
  const press = async (sel) => {
    await page.locator(sel).first().click();
    await wait(180);
  };
  const centreOf = (sel) =>
    page.evaluate((q) => {
      const el = document.querySelector(q);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [b.x + b.width / 2, b.y + b.height / 2];
    }, sel);

  /** A sideways drag from `from` by `dx` px (a finger on a phone, the mouse on desktop). */
  const swipe = async ([x, y], dx) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (dx * i) / 6, y }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y, { steps: 6 });
      await page.mouse.up();
    }
    await wait(350);
  };

  /** A long press (the contextmenu Android sends at about 500 ms), then lift. Phone only. */
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

  /**
   * Phone only: long-press every visible control inside `root`; `stillThere` (a selector) must be on the
   * page afterwards and `state()` must read the same: a long press never acts and never closes a screen.
   */
  const sweep = async (label, root, stillThere, state = () => Promise.resolve('')) => {
    if (!cdp) return;
    const targets = await page.evaluate((q) => {
      const found = [];
      for (const el of document.querySelectorAll(
        `${q} button, ${q} a, ${q} [role=button], ${q} [role=option], ${q} [data-action]`,
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
    const before = await state();
    for (const t of targets) {
      await hold(t.x, t.y);
      if (!(await count(stillThere))) {
        fail(`long press on ${String(t.name)} closed ${label}`);
        return;
      }
      if ((await state()) !== before) {
        fail(`long press on ${String(t.name)} changed ${label}`);
        return;
      }
      // A tip left open by the hold goes with the next tap elsewhere; Escape closes it here.
      if (await count('.tip[role=tooltip]')) await page.keyboard.press('Escape');
    }
    console.log(`sweep ${vp.name} ${label}: ${targets.length} controls long-pressed`);
  };

  const open = async (scenario, wanted) => {
    fake.reset(scenario);
    requests = [];
    sockets = 0;
    fake.seenPosts = [];
    fake.visits = 0;
    await page.goto(vite.url);
    await page.waitForSelector(wanted, { timeout: 15000 });
    await wait(500);
  };

  // ---- 1. The intro cards, for a new player (with 2 and 3: the practice and the role cards) ----
  if (on('intro')) {
    await open({ ...notJoinedScenario(), seen: [] }, '.onb-intro');
    const cardId = () => page.locator('.onb-card').getAttribute('data-card');
    const ids = [];
    for (let i = 0; i < 4; i += 1) {
      ids.push(await cardId());
      await shot(`intro-${i + 1}`);
      if (i < 3) {
        if (i === 1) {
          // Back, then forward again by a swipe.
          await press('.onb-back');
          if ((await cardId()) !== ids[0]) fail('intro: back did not return to the first card');
          await swipe([vp.width / 2, vp.height / 2], -160);
          if ((await cardId()) !== ids[1]) fail('intro: a swipe did not turn the card');
        }
        await press('.onb-next');
      }
    }
    if (new Set(ids).size !== 4) fail(`intro: cards were ${ids.join(',')}`);
    await sweep('the intro', '.onb-intro', '.onb-intro', cardId);
    // The last card's tick goes on to the practice, and records the intro.
    await press('.onb-next');
    await page.waitForSelector('.coach-bar');
    await wait(600);
    if (JSON.stringify(fake.seenPosts) !== JSON.stringify([['intro']]))
      fail(`intro: seen posts were ${JSON.stringify(fake.seenPosts)}`);

    // ---- 2. The practice map, a scout's guided day; nothing leaves the browser ----
    requests = [];
    await driveGuidedDay(page, { shot, press, tapAt, centreOf, wait, count, fail, name: 'scout' });
    await sweep('the practice guide', '.coach-bar', '.coach-bar');
    if (requests.length) fail(`practice made requests: ${requests.join(', ')}`);
    if (sockets) fail('practice opened a socket');
    // Leaving by "Join the expedition" goes to the real game (the join drawer, as there is no character).
    await press('.coach-join');
    await page.waitForSelector('.drawer .offer');
    await wait(500);
    if (JSON.stringify(fake.seenPosts.at(-1)) !== JSON.stringify(['intro', 'practice']))
      fail(`practice: seen posts were ${JSON.stringify(fake.seenPosts)}`);
    if (!requests.some((r) => r === 'GET /api/game'))
      fail('leaving the practice did not fetch the game');
    await shot('join-1-characters');

    // ---- 3. Role cards in the join drawer ----
    await press('.drawer .offer');
    await page.waitForSelector('.join-roles .role');
    await wait(400);
    await shot('role-cards-1');
    if ((await count('.join-roles .role')) !== 5) fail('role cards: not five');
    const strip = await centreOf('.role-strip');
    await swipe(strip, -(vp.width * 0.5));
    await shot('role-cards-2');
    await sweep('the role cards', '.join-roles', '.join-roles .role', () =>
      page.locator('.role[aria-selected=true]').count().then(String),
    );
    if (!(await count('.join-wiki[href="/wiki"][target=_blank]')))
      fail('join drawer: no wiki link');
    await shot('role-cards-3');
    // Picking a role still works, and the join confirms as before.
    await page.locator('.role[data-role=warden]').click();
    await page.waitForSelector('.join-confirm .join-go:not([disabled])');
    await press('.join-confirm .join-go');
    await page.waitForSelector('.hud-day');
    await wait(900);
    await shot('first-hint-fog');
    if (!(await count('.onb-hint[data-hint="hint:fog"]'))) fail('hints: no fog hint after joining');
  }
  // ---- 4. First-encounter hints ----
  if (on('hints')) {
    const hintScenario = seasonScenario({
      role: 'engineer',
      threats: [{ type: 'captors', at: { q: 0, r: 4 } }],
      settlements: [{ at: { q: 3, r: 3 } }],
    });
    await open({ ...hintScenario, seen: [], lastDay: hintScenario.state.day }, '.onb-hint');
    const seenHints = [];
    for (let i = 0; i < 6 && seenHints.length < 3; i += 1) {
      const id = await page
        .locator('.onb-hint')
        .getAttribute('data-hint')
        .catch(() => null);
      if (id && !seenHints.includes(id)) {
        seenHints.push(id);
        await shot(`hint-${id.replace('hint:', '')}`);
      }
      await wait(1500);
    }
    await wait(5000);
    const posted = fake.seenPosts.flat();
    for (const id of ['hint:fog', 'hint:threat', 'hint:settlement']) {
      if (!posted.includes(id)) fail(`hints: ${id} was not recorded (${posted.join(',')})`);
      if (!seenHints.includes(id)) fail(`hints: ${id} never showed (${seenHints.join(',')})`);
    }
    if (new Set(posted).size !== posted.length) fail('hints: an id was recorded twice');
    // Seen is seen: a reload shows none of them again.
    await page.goto(vite.url);
    await page.waitForSelector('.hud-day');
    await wait(1500);
    if (await count('.onb-hint')) fail('hints: shown again after a reload');
    // A hint is not a popover to tap: the map under it takes the tap.
    await open({ ...hintScenario, seen: [], lastDay: hintScenario.state.day }, '.onb-hint');
    const pe = await page.locator('.onb-hint').evaluate((el) => getComputedStyle(el).pointerEvents);
    if (pe !== 'none') fail('hints: a hint takes taps');
  }
  // ---- 5. The "while you were away" recap ----
  if (on('recap')) {
    const base = joinedScenario();
    const day = 4;
    const away = {
      ...base,
      state: { ...base.state, day },
      version: 30,
      seen: veteran,
      lastDay: 1,
      lastVersion: 20,
    };
    fake.reset(away);
    const c = base.state.creature.centre;
    const someone = '100000000000000002.0';
    fake.log.push(
      { kind: 'trap', hex: { q: c.q + 1, r: c.r + 2 }, characterId: someone, version: 22 },
      { kind: 'trap', hex: { q: c.q + 1, r: c.r + 3 }, characterId: someone, version: 23 },
      {
        kind: 'find',
        hex: { q: c.q, r: c.r + 2 },
        characterId: someone,
        material: 'forage',
        amount: 1,
        version: 24,
      },
      {
        kind: 'fire-lit',
        hex: { q: c.q - 1, r: c.r + 1 },
        characterId: someone,
        stimulus: 'fire',
        version: 26,
      },
    );

    requests = [];
    await page.goto(vite.url);
    await page.waitForSelector('.onb-sheet');
    await wait(500);
    await shot('recap-1-days');
    if (!(await count('.onb-day'))) fail('recap: no days');
    await sweep('the recap', '.onb-sheet', '.onb-sheet', () =>
      page
        .locator('.onb-sheet-title, .onb-marks')
        .first()
        .innerText()
        .catch(() => ''),
    );
    await press('.onb-sheet-go');
    await wait(900);
    await shot('recap-2-marks');
    if (!(await count('.onb-mark'))) fail('recap: no marks');
    await press('.onb-sheet-go');
    await wait(500);
    await shot('recap-3-now');
    await press('.onb-sheet-go');
    await wait(400);
    if (await count('.onb-sheet')) fail('recap: did not close');
    if (!requests.some((r) => r.startsWith('GET /api/game'))) fail('recap: log not read');
    if (!fake.visits) fail('recap: the visit was not recorded');
    await page.goto(vite.url);
    await page.waitForSelector('.hud-day');
    await wait(900);
    if (await count('.onb-sheet')) fail('recap: shown again with no new day');
  }
  // ---- 6. The day readout's menu, the replay and each role's practice ----
  if (on('menu')) {
    for (const role of ROLES) {
      const player = joinScenario(notJoinedScenario(), role, 0);
      await open({ ...player, seen: veteran }, '.hud-day');
      if (role === 'scout') {
        await holdDay(page, vp, hold);
        await page.waitForSelector('.day-menu');
        await shot('day-menu');
        await sweep('the day menu', '.day-menu', '.day-menu');
        await press('.day-menu [data-menu=intro]');
        await page.waitForSelector('.onb-intro');
        await shot('replay-intro');
        await press('.onb-skip');
        await wait(300);
        if (await count('.onb-intro')) fail('replay: skip did not close the intro');
        if (fake.seenPosts?.length) fail('replay: marked something seen again');
        await holdDay(page, vp, hold);
        await page.waitForSelector('.day-menu');
      } else {
        await holdDay(page, vp, hold);
        await page.waitForSelector('.day-menu');
      }
      await press('.day-menu [data-menu=practice]');
      await page.waitForSelector('.coach-bar');
      await wait(500);
      requests = [];
      await driveGuidedDay(page, { shot, press, tapAt, centreOf, wait, count, fail, name: role });
      if (requests.length) fail(`${role} practice made requests: ${requests.join(', ')}`);
      await press('.coach-join');
      await page.waitForSelector('.hud-day');
      await wait(700);
      if (await count('.coach-bar')) fail(`${role}: still in the practice`);
    }
  }
  await context.close();
}

/** Holds the day readout (a long press on a phone, a held mouse press on desktop). */
async function holdDay(page, vp, hold) {
  const b = await page.locator('.hud-day').boundingBox();
  const x = b.x + 14;
  const y = b.y + b.height / 2;
  if (vp.touch) {
    await hold(x, y, 520);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(560);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
}

/** Plays the guided day by tapping what the guide lights, taking a picture of each step the first time. */
async function driveGuidedDay(page, h) {
  const seen = new Set();
  for (let i = 0; i < 16; i += 1) {
    const step = await page.locator('.coach-bar').getAttribute('data-step');
    if (!seen.has(step)) {
      seen.add(step);
      await h.shot(`practice-${h.name}-${step}`);
    }
    if (process.env.ONB_DEBUG) console.log('step', h.name, i, step);
    if (step === 'done') return;
    if (step === 'stuck') {
      h.fail(`practice (${h.name}) got stuck`);
      return;
    }
    if (step === 'confirm') {
      await h.press('[data-popover=confirm] .svg-button');
      await h.wait(500);
      continue;
    }
    const lit = (await h.centreOf('.coach-glow')) ?? (await h.centreOf('.coach-ring'));
    if (step === 'select' || step === 'tile') {
      if (!lit) {
        h.fail(`practice (${h.name}) ${step}: nothing lit`);
        return;
      }
      await h.tapAt(...lit);
      continue;
    }
    // The role's action.
    if (await h.count('.hub-care [data-care] .unlock-go:not([aria-disabled=true])')) {
      const kind = await page.locator('.game').getAttribute('data-coach-do');
      await h.press(`.hub-care [data-care=${kind}] .unlock-go`);
      await h.wait(600);
      continue;
    }
    if (await h.count('[data-popover=bubble] [aria-label=Behemoth]')) {
      await h.press('[data-popover=bubble] [aria-label=Behemoth]');
      await h.wait(500);
      continue;
    }
    if (await h.count('.map-root[data-coach=act] [data-action]:not(.is-off)')) {
      const sel = '.map-root[data-coach=act] [data-action]:not(.is-off)';
      await h.press(sel);
      if (await h.count(`${sel}[data-armed]`)) await h.press(sel);
      await h.wait(700);
      continue;
    }
    if (!lit) {
      h.fail(`practice (${h.name}) ${step}: nothing lit`);
      return;
    }
    await h.tapAt(...lit);
  }
  h.fail(`practice (${h.name}) did not finish its day`);
}

run().catch((err) => {
  console.error(err);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
});
