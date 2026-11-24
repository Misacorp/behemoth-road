#!/usr/bin/env node
/* global URL, console, process, window, document, PointerEvent, getComputedStyle, performance, requestAnimationFrame, MouseEvent, setTimeout */
/**
 * Screenshots and browser checks for the web client, written to screenshots/ at the repo root (gitignored).
 *
 * 1. The built app (apps/web/dist), served with the headers from public/_headers so a CSP violation fails
 *    the run: outside Discord it shows only the "open from Discord" state, and its assets carry no trace of
 *    the local-development sign-in.
 * 2. The Vite dev server (its fake session stands in for Discord) at a phone and a desktop size, with every
 *    /api call answered by a fake server that runs the real core on the hand-written fixtures: the join
 *    wizard, two players on the creature, another player's card, moves, the hub, next day, the grace day,
 *    replacing a lost character, Milestone 3's chain, Milestone 4's fires, creature signs, feeding and
 *    lingering, and frame times during a drag with the CPU slowed 4x.
 *
 * Usage: pnpm --filter @behemoth-road/web build && node apps/web/scripts/screenshots.mjs
 * Not part of the unit test run. Needs the pre-installed Playwright (require('playwright')).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FakeServer, serve, startVite } from './fake-game.mjs';

// The core, the art kit and the fixtures are TypeScript; Node runs them with its type transform (the core
// uses syntax plain type stripping does not cover). Re-run this script with the flag when it is missing.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(res.status ?? 1);
}
const { SPRING } = await import('../../../packages/art/src/palette.ts');
const { act, characterOf, checkAction, hexDistance, hexesInRange, moveAlong, nextDayWithEvents } =
  await import('../../../packages/core/src/index.ts');
const {
  CHAIN_SPOTS,
  chainScenario,
  WATER_ISLET,
  characterIdOf,
  joinedScenario,
  lostScenario,
  seasonScenario,
  toView,
  USERS,
} = await import('../src/api/fixtures.ts');
const { identities } = await import('../src/game/identity.ts');

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const dist = join(web, 'dist');
const out = resolve(web, '../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/** Your character's cloak colour in the joined scenario (the art kit assigns looks in join order). */
const CLOAK = (() => {
  const view = toView(joinedScenario());
  return identities(view).get(characterIdOf(view, USERS.MISA)).accent;
})();

/**
 * You (a scout) stand on a rim hex of the window that the next tick leaves behind: day one ends with it in
 * its grace day, day two with you lost. Found by trying the rim hexes with the real tick.
 */
const EDGE = (() => {
  const base = joinedScenario();
  const c = base.state.creature.centre;
  const R = base.state.config.windowRadius;
  for (const h of hexesInRange(c, R)) {
    if (hexDistance(h, c) !== R) continue;
    const state = {
      ...base.state,
      characters: base.state.characters.map((ch) =>
        ch.userId === USERS.MISA ? { ...ch, at: { kind: 'hex', hex: h } } : ch,
      ),
    };
    const day1 = nextDayWithEvents(state).state;
    const mine = characterOf(day1, USERS.MISA);
    const tile = day1.tiles[`${h.q},${h.r}`];
    if (mine?.status !== 'active' || tile?.leftWindowOnDay === null) continue;
    const day2 = nextDayWithEvents(day1).state;
    if (characterOf(day2, USERS.MISA)?.status === 'lost')
      return { ...base, state, version: base.version + 1 };
  }
  throw new Error('no rim hex the tick leaves behind');
})();

/** A day on which a scholar's (seeded) roll at the staged tomb succeeds, so the find shows. */
const SCHOLAR_DAY = (() => {
  for (let day = 1; day < 30; day += 1) {
    const s = chainScenario({ role: 'scholar', day });
    const id = characterOf(s.state, USERS.MISA).id;
    const c = s.state.creature.centre;
    const tomb = { q: c.q + CHAIN_SPOTS.tomb.q, r: c.r + CHAIN_SPOTS.tomb.r };
    const walked = moveAlong(s.state, id, [tomb]);
    if (!walked.ok) continue;
    const r = act(walked.state, id, { kind: 'work-site' });
    if (r.ok && r.events.some((e) => e.kind === 'find')) return day;
  }
  throw new Error('no day on which the staged tomb opens');
})();

/** Long enough for the slowest tip delay and the touch hold. */
const TIP_WAIT = 900;

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
  const vite = await startVite();
  const browser = await chromium.launch();
  const problems = [];
  const report = [];
  const m5Shots = [];
  try {
    // 1. The built app outside Discord: only the visual "open from Discord" state, under the real CSP.
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const fake = new FakeServer();
      await page.route(
        (u) => u.pathname.startsWith('/api/'),
        (r) => fake.route(r),
      );
      page.on('console', (m) => {
        if (m.type() === 'error' || /Content Security Policy/i.test(m.text()))
          problems.push(`built: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`built: ${e.message}`));
      await page.goto(url);
      await page.waitForSelector('[data-state=outside]');
      await page.screenshot({ path: join(out, 'm2-outside-discord.png') });

      // A failed start: the config answers 502 once. The page shows the failure with its code; the retry
      // really runs the boot again (the button turns meanwhile) and reaches the next state.
      let configCalls = 0;
      await page.unroute((u) => u.pathname.startsWith('/api/'));
      await page.route(
        (u) => u.pathname.startsWith('/api/'),
        async (r) => {
          if (new URL(r.request().url()).pathname === '/api/config' && configCalls++ === 0) {
            await new Promise((ok) => setTimeout(ok, 0));
            return r.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
          }
          if (new URL(r.request().url()).pathname === '/api/config') {
            // Slow enough to see the busy state.
            await new Promise((ok) => setTimeout(ok, 400));
          }
          return fake.route(r);
        },
      );
      const quiet = problems.length;
      await page.goto(url);
      await page.waitForSelector('[data-state=failed]');
      const code = await page.locator('.state-code').textContent();
      if (code !== 'config: 502') problems.push(`built: failure code was ${String(code)}`);
      await page.screenshot({ path: join(out, 'm2-start-failed.png') });
      await page.locator('[aria-label=Retry]').click();
      await page.waitForSelector('.state-retry.is-busy', { timeout: 300 }).catch(() => {
        problems.push('built: retry shows no busy state');
      });
      await page.waitForSelector('[data-state=outside]', { timeout: 5000 }).catch(() => {
        problems.push('built: retry did not re-run the boot');
      });
      if (configCalls !== 2) problems.push(`built: config asked ${String(configCalls)} times`);
      // The 502 itself logs a console error; that one is expected.
      problems.splice(
        quiet,
        problems.length - quiet,
        ...problems.slice(quiet).filter((p) => !/502/.test(p)),
      );
      await context.close();
      for (const file of readdirSync(join(dist, 'assets'))) {
        const text = readFileSync(join(dist, 'assets', file), 'utf8');
        if (text.includes('/api/dev/login'))
          problems.push(`built: ${file} contains the dev sign-in`);
      }
    }

    // 2. The game, on the Vite dev server with its fake session and a fake game server.
    for (const vp of VIEWPORTS) {
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
      const shot = (name) => page.screenshot({ path: join(out, `m2-${vp.name}-${name}.png`) });
      const has = async (kind) => (await page.locator(`[data-popover=${kind}]`).count()) > 0;
      const tap = async (x, y) => {
        if (vp.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(150);
      };
      const press = async (selector) => {
        await page.locator(selector).first().click();
        await page.waitForTimeout(150);
      };
      /** An action on a map card spends on the second tap: the first arms it (a tick replaces its pips). */
      const spend = async (selector) => {
        await press(selector);
        if (!(await page.locator(`${selector}[data-armed]`).count()))
          problems.push(`${vp.name}: ${selector} did not arm on its first tap`);
        await press(selector);
      };

      /**
       * Phone only: long-press every visible element inside the open `kind` popover, firing the `contextmenu`
       * Android sends at about 500 ms, then lifting. The same popover must still be open; an element with a
       * tip must show it. Nothing inside a popover may be closed (or acted on) by a long press.
       */
      const holdAll = async (kind, label = kind, rootSel = `[data-popover=${kind}]`) => {
        if (!cdp0) return;
        const sel = rootSel;
        const ident = () =>
          page.evaluate((q) => {
            const el = document.querySelector(q);
            return el
              ? `${el.getAttribute('data-popover')}:${el.getAttribute('data-character') ?? ''}`
              : null;
          }, sel);
        const before = await ident();
        if (!before) {
          problems.push(`${vp.name}: holdAll(${label}): no ${kind} popover open`);
          return;
        }
        const targets = await page.evaluate((q) => {
          const root = document.querySelector(q);
          const out = [];
          const seen = new Set();
          const list = root.querySelectorAll(
            '[data-tip],[data-tile-tip],button,a,[role=button],[data-action],[data-character],[aria-label],[data-mark],svg g,svg use,svg image,svg path',
          );
          for (const el of list) {
            const b = el.getBoundingClientRect();
            if (b.width < 3 || b.height < 3) continue;
            const x = b.x + b.width / 2;
            const y = b.y + b.height / 2;
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
            const top = document.elementFromPoint(x, y);
            if (!top || !el.contains(top)) continue;
            const key = `${Math.round(x)},${Math.round(y)},${el.tagName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const name =
              el.getAttribute('data-tip') ??
              el.getAttribute('data-action') ??
              el.getAttribute('aria-label') ??
              el.getAttribute('class') ??
              el.tagName;
            out.push({
              plain:
                el.hasAttribute('data-tip') &&
                (el.hasAttribute('data-tip-tap') ||
                  !el.closest(
                    'button, a, [role=button], [role=option], [data-action], [data-acts]',
                  )),
              x,
              y,
              name: `${el.tagName.toLowerCase()}[${name}]`,
              tip: el.hasAttribute('data-tip'),
            });
          }
          return out;
        }, sel);
        let n = 0;
        let plainTaps = 0;
        for (const t of targets) {
          await cdp0.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: t.x, y: t.y }],
          });
          await page.waitForTimeout(500);
          await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x, y);
              el?.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: x,
                  clientY: y,
                }),
              );
            },
            [t.x, t.y],
          );
          await page.waitForTimeout(60);
          const tipShown = await page.locator('.tip').count();
          await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(150);
          n += 1;
          // A held tip stays after the finger lifts (about a second later it is still there).
          await page.waitForTimeout(1000);
          const tipStays = await page.locator('.tip').count();
          if (t.tip && tipShown && !tipStays)
            problems.push(
              `${vp.name}: the tip on ${t.name} in ${label} did not stay after release`,
            );
          if ((await ident()) !== before) {
            problems.push(
              `${vp.name}: long press on ${t.name} closed or changed the ${label} popover`,
            );
            return;
          }
          if (t.tip && !tipShown)
            problems.push(`${vp.name}: long press on ${t.name} in ${label} showed no tip`);
          // A plain icon (not a button) shows its tip on a single tap and the container stays open.
          if (t.plain) {
            if (await page.locator('.tip').count()) {
              await page.keyboard.press('Escape');
              await page.waitForTimeout(150);
            }
            await page.touchscreen.tap(t.x, t.y);
            await page.waitForTimeout(250);
            if (!(await page.locator('.tip').count()))
              problems.push(`${vp.name}: a tap on ${t.name} in ${label} showed no tip`);
            if ((await ident()) !== before) {
              problems.push(`${vp.name}: a tap on ${t.name} closed or changed the ${label}`);
              return;
            }
            plainTaps += 1;
          }
          // Clear any tip left to be read (a tap on a HUD button closes it).
          if (await page.locator('.tip').count()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);
            if ((await ident()) !== before) {
              problems.push(
                `${vp.name}: closing the tip after ${t.name} closed the ${label} popover`,
              );
              return;
            }
          }
        }
        console.log(
          `holdAll ${vp.name} ${label}: ${n} elements long-pressed, ${plainTaps} plain icons tapped`,
        );
      };

      // Join: the drawer opens by itself. Phones step through the wizard; desktop shows it all.
      await page.goto(vite.url);
      await page.waitForSelector('.drawer .offer');
      await page.waitForTimeout(400);
      await shot('join-1-characters');
      // Tips: hover (desktop) or press-and-hold (phone) on an icon shows its name and a line or two; a hold
      // never acts, and a plain tap on a trait (which has no action) shows its tip without picking the card.
      const shotT = (name) => page.screenshot({ path: join(out, `tips-${vp.name}-${name}.png`) });
      const cdp0 = vp.touch ? await context.newCDPSession(page) : null;
      const centreOf = async (selector) => {
        // A role card in the swiped strip may sit past the edge: bring it into view first.
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        const b = await page.locator(selector).first().boundingBox();
        return [b.x + b.width / 2, b.y + b.height / 2];
      };
      /** Opens the tip on `selector` the way this device does; returns once it shows (or the wait ran out). */
      const openTip = async (selector) => {
        const [x, y] = await centreOf(selector);
        if (cdp0) {
          await cdp0.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }],
          });
        } else {
          await page.mouse.move(x, y);
        }
        await page.waitForTimeout(TIP_WAIT);
        return page.locator('.tip').count();
      };
      const endTip = async () => {
        if (cdp0)
          await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.mouse.move(2, vp.height - 2);
        await page.waitForTimeout(200);
      };
      const tipCheck = async (selector, name) => {
        if (!(await openTip(selector))) problems.push(`${vp.name}: no tip on ${selector}`);
        await shotT(name);
        await endTip();
        if (cdp0) {
          // On touch a held tip stays to be read after the finger lifts, with no timer; the next tap closes it.
          await page.waitForTimeout(4500);
          if (!(await page.locator('.tip').count()))
            problems.push(`${vp.name}: the tip on ${selector} closed when the finger lifted`);
          // Escape closes a tip left to be read (a tap on the day would open its own tip).
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }
        if (await page.locator('.tip').count())
          problems.push(`${vp.name}: the tip on ${selector} stayed open`);
      };
      await tipCheck('.offer .icon-tip', 'join-trait');
      if (await page.locator('.offer[aria-selected=true]').count())
        problems.push(`${vp.name}: a hold or hover on a trait picked the card`);
      await page.locator('.offer .icon-tip').first().click();
      await page.waitForTimeout(150);
      if (!(await page.locator('.tip').count()))
        problems.push(`${vp.name}: a tap on a trait does not show its tip`);
      if (await page.locator('.offer[aria-selected=true]').count())
        problems.push(`${vp.name}: tapping a trait icon picked the card`);
      // A second tap closes it (Escape would close the drawer too).
      await page.locator('.offer .icon-tip').first().click();
      await page.waitForTimeout(100);
      if (await page.locator('.tip').count())
        problems.push(`${vp.name}: a second tap did not close the trait's tip`);
      await press('.offer >> nth=0');
      if (vp.touch) await shot('join-2-role');
      // A hold (or hover) on a role names it and says what it does, without choosing it.
      await tipCheck('.role[data-role=keeper]', 'join-role');
      if (await page.locator('.role[data-role=keeper][aria-selected=true]').count())
        problems.push(`${vp.name}: a hold or hover on a role chose it`);
      await press('.role[data-role=scout]');
      await shot(vp.touch ? 'join-3-confirm' : 'join-2-chosen');
      await press('.join-go');
      await page.waitForTimeout(700);
      if (await page.locator('.drawer').count())
        problems.push(`${vp.name}: drawer still open after joining`);
      const charOf = (user) => characterOf(fake.scenario.state, user);
      const idOf = (user) => characterIdOf(toView(fake.scenario), user);
      if (!charOf(USERS.MISA)) problems.push(`${vp.name}: join did not reach the server`);
      await shot('two-players-riding');
      // The opening view frames the creature and the way ahead between the top HUD and the pips.
      {
        const box = async (sel) => page.locator(sel).first().boundingBox();
        const top = await box('.hud-top');
        const pips = await box('.hud-actions');
        const [cq, cr] = (await page.locator('svg.map').getAttribute('data-creature'))
          .split(' ')
          .map(Number);
        const [vx, vy, scale] = (await page.locator('svg.map').getAttribute('data-view'))
          .split(' ')
          .map(Number);
        const [size, squash] = (await page.locator('svg.map').getAttribute('data-projection'))
          .split(' ')
          .map(Number);
        const y = vy + size * Math.sqrt(3) * (cr + cq / 2) * squash * scale;
        if (top && !(y > top.y + top.height))
          problems.push(`${vp.name}: the creature opens under the HUD`);
        if (pips && !(y < pips.y)) problems.push(`${vp.name}: the creature opens under the pips`);
        void vx;
      }

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
      const cx = vp.width / 2;
      const cy = vp.height / 2;

      // The hub bubble lists both riders; tapping the other rider opens their card.
      const [q0, r0] = await creature();
      const tapCreature = async () => tap(...(await hexOnScreen(q0, r0)));
      await tapCreature();
      if (!(await has('bubble'))) problems.push(`${vp.name}: no bubble while riding`);
      await holdAll('bubble');
      if ((await page.locator('[data-popover=bubble] [data-character]').count()) !== 2)
        problems.push(`${vp.name}: the bubble does not list both riders`);
      await shot('bubble');
      // Focus moves into the bubble when it opens, and back to the map when it closes.
      const focused = () =>
        page.evaluate(() => {
          const a = document.activeElement;
          if (a?.closest('.popover')) return 'popover';
          return a?.matches('svg.map') ? 'map' : `${a?.tagName ?? 'none'}`;
        });
      if ((await focused()) !== 'popover') problems.push(`${vp.name}: focus not in the bubble`);
      await press(`[data-popover=bubble] [data-character="${idOf(USERS.PIP)}"]`);
      if (!(await has('character'))) problems.push(`${vp.name}: no card for the other rider`);
      await shot('other-player-card');
      // The card's role emblem has its tip, and the HUD's controls theirs.
      // Opened from the bubble, the card continues in the same popup, with a back button to the bubble.
      if (!(await page.locator('[data-popover=character][data-back]').count()))
        problems.push(`${vp.name}: the rider's card has no back to the bubble`);
      await holdAll('character', 'character');
      await press('[data-popover=character] [data-back]');
      if (!(await has('bubble'))) problems.push(`${vp.name}: back did not return to the bubble`);
      await page.screenshot({ path: join(out, `feedback-${vp.name}-bubble-back.png`) });
      await press(`[data-popover=bubble] [data-character="${idOf(USERS.PIP)}"]`);
      await tipCheck('[data-popover=character] [data-tip^="role:"]', 'card-role');
      if (!(await has('character'))) problems.push(`${vp.name}: the tip closed the card`);
      await tipCheck('.hud-actions', 'hud-actions');
      if (await page.locator('.hud-peril, [aria-label=Peril]').count())
        await tipCheck('[aria-label=Peril]', 'hud-peril');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (await has('character')) problems.push(`${vp.name}: Escape did not close the card`);
      if ((await focused()) !== 'map') problems.push(`${vp.name}: focus not back on the map`);
      // Ola stands beside the creature: a tap on her figure opens her card.
      await tap(...(await hexOnScreen(q0, r0 + 2, -0.05, 0.1)));
      if (
        !(await page
          .locator(`[data-popover=character][data-character="${idOf(USERS.OLA)}"]`)
          .count())
      )
        problems.push(`${vp.name}: tapping another player's figure did not open their card`);
      await page.keyboard.press('Escape');

      // The roster: the party button opens a drawer listing every player; a row finds the character.
      {
        const shotR = (name) =>
          page.screenshot({ path: join(out, `roster-${vp.name}-${name}.png`) });
        const rowFor = (user) => `.roster-row[data-character="${idOf(user)}"]`;
        await press('.hud-roster');
        await page.waitForSelector('.drawer[aria-label=Players] .roster-row');
        await page.waitForTimeout(300);
        const names = await page.locator('.roster-row .roster-name').allTextContents();
        if (names.length !== 3)
          problems.push(`${vp.name}: the roster lists ${names.length} players`);
        if (!(await page.locator('.roster-row').first().getAttribute('data-mine')))
          problems.push(`${vp.name}: the roster does not list you first`);
        const rest = names.slice(1);
        if (rest.join('|') !== [...rest].sort((a, b) => a.localeCompare(b)).join('|'))
          problems.push(`${vp.name}: the roster's other players are not by name`);
        if (!(await page.locator('.roster-row [data-role-icon]').count()))
          problems.push(`${vp.name}: the roster rows have no role emblem`);
        if (!(await page.locator('.roster-row svg[data-arrows]').count()))
          problems.push(`${vp.name}: the roster rows have no action arrows`);
        await shotR('open');
        // A long press on anything in the roster neither closes it nor taps a row.
        await holdAll('roster', 'roster', '.drawer[aria-label=Players]');
        if (!(await page.locator('.drawer[aria-label=Players]').count()))
          problems.push(`${vp.name}: a long press closed the roster`);
        if (await has('character'))
          problems.push(`${vp.name}: a long press in the roster opened a card`);
        // Another player on the map: the map centres on her, her card opens, the roster stays.
        await press(rowFor(USERS.OLA));
        await page.waitForTimeout(900);
        if (
          !(await page
            .locator(`[data-popover=character][data-character="${idOf(USERS.OLA)}"]`)
            .count())
        )
          problems.push(`${vp.name}: tapping her roster row did not open her card`);
        if (!(await page.locator('.drawer[aria-label=Players]').count()))
          problems.push(`${vp.name}: tapping a roster row closed the roster`);
        if (!(await page.locator(`${rowFor(USERS.OLA)}[data-selected]`).count()))
          problems.push(`${vp.name}: her roster row is not marked`);
        if (vp.touch) {
          const snap = await page.locator('.drawer[aria-label=Players]').getAttribute('data-snap');
          if (snap !== 'peek')
            problems.push(`${vp.name}: the roster did not lower to a peek (${snap})`);
          const card = await page.locator('[data-popover=character]').boundingBox();
          const drawer = await page.locator('.drawer[aria-label=Players]').boundingBox();
          if (card && drawer && card.y + card.height > drawer.y)
            problems.push(`${vp.name}: the card is under the lowered roster`);
        }
        {
          // She stands centred in the space the roster leaves (about, after the move animation).
          const card = await page.locator('[data-popover=character]').boundingBox();
          const drawer = await page.locator('.drawer[aria-label=Players]').boundingBox();
          const left = vp.touch ? 0 : (drawer?.x ?? 0) + (drawer?.width ?? 0);
          const bottom = vp.touch ? (drawer?.y ?? vp.height) : vp.height;
          if (
            card &&
            !(
              card.x >= left - 2 &&
              card.x + card.width <= vp.width + 2 &&
              card.y >= 0 &&
              card.y + card.height <= bottom + 2
            )
          )
            problems.push(`${vp.name}: her card is outside the space the roster leaves`);
        }
        await shotR('found');
        // A rider: the creature's bubble card in its place, with a back to the bubble.
        await press(rowFor(USERS.PIP));
        await page.waitForTimeout(900);
        if (!(await page.locator('[data-popover=character][data-back]').count()))
          problems.push(`${vp.name}: a rider's roster row did not open the rider card with a back`);
        await shotR('rider');
        await press('[data-popover=character] [data-back]');
        if (!(await has('bubble')))
          problems.push(`${vp.name}: back from the rider card did not show the bubble`);
        // The party button closes the roster.
        await press('.hud-roster');
        await page.waitForTimeout(200);
        if (await page.locator('.drawer[aria-label=Players]').count())
          problems.push(`${vp.name}: the party button did not close the roster`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.mouse.move(2, vp.height - 2);
        await page.waitForTimeout(150);
        await tipCheck('.hud-roster', 'hud-roster');
      }

      // Step off: try the hexes around the footprint, south side first (Ola stands on one).
      await tapCreature();
      const ring = [
        [-1, 2],
        [1, 1],
        [-2, 2],
        [2, 0],
        [-2, 1],
        [2, -1],
      ];
      let off = null;
      for (const [dq, dr] of ring) {
        await tap(...(await hexOnScreen(q0 + dq, r0 + dr)));
        if (await has('confirm')) {
          off = [q0 + dq, r0 + dr];
          break;
        }
        await tapCreature();
      }
      if (!off) problems.push(`${vp.name}: no hex to step off to`);
      await shot('plan-step-off');
      if (off) await press('[aria-label=Confirm]');
      await page.waitForTimeout(300);
      const mine = charOf(USERS.MISA);
      if (off && mine?.at.kind !== 'hex')
        problems.push(`${vp.name}: the move did not reach the server`);
      await shot('stepped-off');

      // Stances: the control by your character button opens a popover of three bubbles; a pick sticks (free)
      // and shows on your figure on the map and in the roster; the wait button ends your day in two taps.
      {
        const shotS = (name) =>
          page.screenshot({ path: join(out, `stances-${vp.name}-${name}.png`) });
        const mineNow = () => charOf(USERS.MISA);
        if (mineNow()?.stance !== 'rest')
          problems.push(`${vp.name}: the default stance is not rest`);
        const actionsBefore = mineNow()?.actionsLeft;
        await press('.hud-stance');
        await page.waitForSelector('[data-stance-pop] .stance-bubble');
        await page.waitForTimeout(250);
        if ((await page.locator('.stance-bubble').count()) !== 3)
          problems.push(`${vp.name}: the stance picker does not show three bubbles`);
        if ((await focused()) === 'map')
          problems.push(`${vp.name}: focus did not move into the picker`);
        // Standing on a hex with no node: gather has nothing to work on, so it is faded; lie in wait is not.
        if (!(await page.locator('.stance-bubble[data-stance=gather][data-unfit]').count()))
          problems.push(`${vp.name}: gather is not faded where there is no node`);
        if (await page.locator('.stance-bubble[data-stance=lie-in-wait][data-unfit]').count())
          problems.push(`${vp.name}: lie in wait is faded on a hex`);
        await shotS('picker');
        // Long-press every bubble: nothing closes or picks, and each shows its tip.
        await holdAll('stance', 'stance picker', '[data-stance-pop]');
        if (!(await page.locator('[data-stance-pop]').count()))
          problems.push(`${vp.name}: a long press closed the stance picker`);
        if (mineNow()?.stance !== 'rest') problems.push(`${vp.name}: a long press picked a stance`);
        // Escape closes it; reopen and choose lie in wait.
        await page.mouse.move(2, vp.height - 2);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        if (await page.locator('[data-stance-pop]').count())
          problems.push(`${vp.name}: Escape did not close the stance picker`);
        await press('.hud-stance');
        await page.waitForSelector('[data-stance-pop]');
        await press('.stance-bubble[data-stance=lie-in-wait]');
        await page.waitForTimeout(400);
        if (mineNow()?.stance !== 'lie-in-wait')
          problems.push(`${vp.name}: choosing a stance did not reach the server`);
        if (mineNow()?.actionsLeft !== actionsBefore)
          problems.push(`${vp.name}: choosing a stance cost actions`);
        if (await page.locator('[data-stance-pop]').count())
          problems.push(`${vp.name}: the picker stays open after a choice`);
        if ((await page.locator('.hud-stance').getAttribute('data-stance')) !== 'lie-in-wait')
          problems.push(`${vp.name}: the control does not show the chosen stance`);
        await page.waitForSelector('g[data-mark=stance]', { timeout: 3000 }).catch(() => {});
        if (!(await page.locator('g[data-mark=stance]').count()))
          problems.push(`${vp.name}: no stance mark on your figure`);
        await shotS('map-mark');
        // Wait: the first tap arms, a tap elsewhere disarms, then two taps end the day.
        await press('.hud-wait');
        if (!(await page.locator('.hud-wait[data-armed]').count()))
          problems.push(`${vp.name}: the wait button did not arm on its first tap`);
        await shotS('wait-armed');
        // A press elsewhere (not a map tap, which would open a popover): the button disarms.
        await page.evaluate(() =>
          document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
        );
        await page.waitForTimeout(200);
        if (await page.locator('.hud-wait[data-armed]').count())
          problems.push(`${vp.name}: a tap elsewhere did not disarm the wait button`);
        if (mineNow()?.waiting) problems.push(`${vp.name}: a tap elsewhere ended the day`);
        await press('.hud-wait');
        await press('.hud-wait');
        await page.waitForTimeout(400);
        if (!mineNow()?.waiting) problems.push(`${vp.name}: wait did not reach the server`);
        if (!(await page.locator('.hud-wait[data-waiting]').count()))
          problems.push(`${vp.name}: the wait button does not rest after waiting`);
        await page.waitForSelector('g[data-mark=waiting]', { timeout: 3000 }).catch(() => {});
        if (!(await page.locator('g[data-mark=waiting]').count()))
          problems.push(`${vp.name}: no waiting mark on your figure`);
        await page.locator('.hud-wait').click({ force: true });
        await page.waitForTimeout(150);
        if (await page.locator('.hud-wait[data-armed]').count())
          problems.push(`${vp.name}: the wait button arms again after waiting`);
        // The roster shows each player's stance and the waiting mark.
        await press('.hud-roster');
        await page.waitForSelector('.drawer[aria-label=Players] .roster-row');
        await page.waitForTimeout(300);
        const mineRow = '.roster-row[data-mine]';
        if (!(await page.locator(`${mineRow} [data-mark=stance]`).count()))
          problems.push(`${vp.name}: the roster shows no stance`);
        if (!(await page.locator(`${mineRow} [data-mark=waiting]`).count()))
          problems.push(`${vp.name}: the roster shows no waiting mark`);
        await shotS('roster');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        await page.mouse.move(2, vp.height - 2);
      }

      // Next day (dev tools and admin): the server ticks and the map follows the creature.
      await press('[aria-label="Next day"]');
      await page.waitForTimeout(700);
      if (fake.scenario.state.day !== 2)
        problems.push(`${vp.name}: next day did not reach the server`);
      await shot('next-day');

      // The day banner: the day went up, so a band with the sun and the numeral shows over the map and
      // takes no pointer; it fades out again after its four seconds.
      const banner = await page.$('.day-banner');
      if (!banner) problems.push(`${vp.name}: no day banner after the day went up`);
      else {
        if ((await banner.evaluate((el) => getComputedStyle(el).pointerEvents)) !== 'none')
          problems.push(`${vp.name}: the day banner takes the pointer`);
        const box = await banner.boundingBox();
        if (box && box.height > vp.height * 0.4)
          problems.push(`${vp.name}: the day banner covers too much of the screen`);
        await shot('day-banner');
      }
      await page.waitForTimeout(4200);
      if (await page.$('.day-banner')) problems.push(`${vp.name}: the day banner stays`);

      // Fast pace (the admin's toggle) and its countdown ring round the day sun.
      await press('[aria-label="Pace"]');
      await page.waitForTimeout(300);
      if (fake.scenario.pace !== 'fast')
        problems.push(`${vp.name}: the pace toggle did not reach the server`);
      await page.waitForSelector('.day-ring', { timeout: 3000 }).catch(() => {
        problems.push(`${vp.name}: no countdown ring in fast pace`);
      });
      await page.waitForTimeout(1500);
      await shot('fast-countdown');
      await press('[aria-label="Pace"]');
      await page.waitForTimeout(300);
      if (fake.scenario.pace !== 'daily') problems.push(`${vp.name}: pace did not switch back`);

      // The hub entry opens the creature card; right-click (desktop) and Escape close.
      const [q1, r1] = await creature();
      await tap(...(await hexOnScreen(q1, r1)));
      await press('[data-popover=bubble] [aria-label=Behemoth]');
      if (!(await has('creature'))) problems.push(`${vp.name}: no creature card`);
      await holdAll('creature');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (await has('creature'))
        problems.push(`${vp.name}: Escape did not close the creature card`);
      if (!vp.touch) {
        const spot = await hexOnScreen(q1 - 3, r1 + 1);
        await tap(...spot);
        const blocked = await page.evaluate(
          ([x, y]) =>
            !document.elementFromPoint(x, y).dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
              }),
            ),
          spot,
        );
        await page.waitForTimeout(100);
        if (!blocked) problems.push(`${vp.name}: right-click menu not suppressed`);
        if (await has('inspect'))
          problems.push(`${vp.name}: right-click did not close the popover`);
      }

      // Milestone 3's chain, staged south of the creature (`chainScenario`), on the real core's rules.
      {
        const shot3 = (name) => page.screenshot({ path: join(out, `m3-${vp.name}-${name}.png`) });
        const stage = async (st) => {
          fake.reset(chainScenario(st));
          await page.reload();
          await page.waitForSelector('.map-world svg g');
          await page.waitForTimeout(500);
        };
        const spot = async (name) => {
          const c = fake.scenario.state.creature.centre;
          return hexOnScreen(c.q + CHAIN_SPOTS[name].q, c.r + CHAIN_SPOTS[name].r);
        };
        const meAt = async () => {
          const m = charOf(USERS.MISA);
          return m?.at.kind === 'hex' ? hexOnScreen(m.at.hex.q, m.at.hex.r, -0.05, 0.1) : null;
        };
        const settle = () => page.waitForTimeout(1600);
        const idle = async () => {
          for (let i = 0; i < 3 && (await page.locator('.popover > *').count()); i += 1) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
          }
        };
        // After a move or an action your character stays selected, so the here card may be open already.
        const openHere = async () => {
          if (!(await has('here'))) await tap(...(await meAt()));
        };
        const plan = async (to) => {
          await idle();
          await tap(...(await meAt()));
          await tap(...to);
          return has('confirm');
        };
        const walkTo = async (name) => {
          if (!(await plan(await spot(name)))) {
            problems.push(`${vp.name}: no plan to the ${name}`);
            await shot3(`x-no-plan-${name}`);
            return;
          }
          await press('[aria-label=Confirm]');
        };
        const expectMoment = async (kind) => {
          if (!(await page.locator(`[data-moment=${kind}]`).count()))
            problems.push(`${vp.name}: no ${kind} moment`);
        };
        const freshDay = async () => {
          const s0 = fake.scenario;
          const actionsLeft = s0.state.config.actionsPerDay;
          const characters = s0.state.characters.map((c) => ({ ...c, actionsLeft }));
          fake.reset({ ...s0, state: { ...s0.state, characters }, version: s0.version + 1 });
          await page.reload();
          await page.waitForSelector('.map-world svg g');
          await page.waitForTimeout(500);
        };
        const openHub = async () => {
          const c = fake.scenario.state.creature.centre;
          await idle();
          await tap(...(await hexOnScreen(c.q, c.r)));
          await press('[data-popover=bubble] [aria-label=Behemoth]');
          await page.waitForSelector('.drawer [data-unlock]');
          await page.waitForTimeout(400);
        };

        // A scout: the hexes around are under the veil; tapping one next to you offers a survey.
        await stage({});
        await tap(...(await spot('iron')));
        if (!(await page.locator('[data-popover=inspect] [data-action=survey]').count()))
          problems.push(`${vp.name}: no survey on an unexplored neighbour`);
        await holdAll('inspect');
        await shot3('01-survey-offer');
        await spend('[data-popover=inspect] [data-action=survey]');
        await page.waitForTimeout(450);
        await expectMoment('reveal');
        await shot3('02-surveyed');
        await settle();

        // Walk onto the deposit and gather: the iron goes into your pack.
        await walkTo('iron');
        await settle();
        await openHere();
        if (!(await page.locator('[data-popover=here] [data-action=gather]').count()))
          problems.push(`${vp.name}: no gather on the deposit`);
        await holdAll('here');
        await shot3('03-here-gather');
        // The card names what it is about, and its tile picture has a tip.
        if (!(await page.locator('[data-popover=here] [data-title]').count()))
          problems.push(`${vp.name}: the here card has no noun title`);
        await tipCheck('[data-popover=here] [data-tile-tip]', 'here-tile');
        await openHere();
        // Action labels are on by default: each action's verb sits under it; `?labels=0` hides them.
        if (!(await page.locator('[data-popover=here] [data-verb=Gather]').count()))
          problems.push(`${vp.name}: the actions have no verb labels by default`);
        await page.goto(`${vite.url}?labels=0`);
        await page.waitForSelector('.map-world svg g');
        await page.waitForTimeout(500);
        await openHere();
        if (await page.locator('[data-popover=here] [data-verb]').count())
          problems.push(`${vp.name}: ?labels=0 still labels the actions`);
        await shot3('03b-here-gather-no-labels');
        await page.goto(vite.url);
        await page.waitForSelector('.map-world svg g');
        await page.waitForTimeout(500);
        await openHere();
        await spend('[data-popover=here] [data-action=gather]');
        await page.waitForTimeout(300);
        if (!(charOf(USERS.MISA)?.pack.iron > 0))
          problems.push(`${vp.name}: gather did not fill the pack`);
        await idle();
        await press('.hud-pack');
        await page.waitForTimeout(200);
        if (!(await page.locator('.hud-pack-contents [data-item=iron]').count()))
          problems.push(`${vp.name}: the pack does not show the iron`);
        await shot3('04-pack');
        // The contents are the pack's tip: Escape (or a tap anywhere) closes it.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);

        // A fresh day (staged without the creature's step): carry it home; boarding empties the pack.
        await freshDay();
        const c0 = fake.scenario.state.creature.centre;
        if (!(await plan(await hexOnScreen(c0.q, c0.r))))
          problems.push(`${vp.name}: no plan onto the creature`);
        else await press('[aria-label=Confirm]');
        await page.waitForTimeout(450);
        await expectMoment('deposit');
        if (!(fake.scenario.state.stores.iron > 0))
          problems.push(`${vp.name}: boarding did not fill the stores`);
        await shot3('05-deposit');
        await settle();

        // An engineer riding: the hub drawer shows the stores and the unlocks; start the hook.
        await stage({ role: 'engineer', at: 'creature', stores: { iron: 2, timber: 1 } });
        await openHub();
        await shot3('06-hub');
        await holdAll('hub', 'hub drawer', '.drawer');
        await press('[data-unlock=grappling-hook] [aria-label=Build]');
        await page.waitForTimeout(400);
        if (fake.scenario.state.project?.unlock !== 'grappling-hook')
          problems.push(`${vp.name}: building did not start the hook`);
        await shot3('07-building');
        await page.keyboard.press('Escape');

        // The last work finishes it: the sealed hook rises from the creature.
        await stage({
          role: 'engineer',
          at: 'creature',
          project: { unlock: 'grappling-hook', work: 3 },
        });
        await openHub();
        await press('[data-unlock=grappling-hook] [aria-label=Build]');
        await page.waitForTimeout(450);
        await expectMoment('unlock');
        if (!fake.scenario.state.unlocks.includes('grappling-hook'))
          problems.push(`${vp.name}: the hook did not finish`);
        await shot3('08-unlock-done');
        await settle();
        await page.keyboard.press('Escape');

        // With the hook, the cliff beside the deposit is a step: the arrow carries the hook mark.
        await stage({ at: 'iron', explored: ['iron'], unlocks: ['grappling-hook'] });
        await plan(await spot('cliff'));
        if (!(await page.locator('[data-mark="via:grappling-hook"]').count()))
          problems.push(`${vp.name}: the cliff step has no hook mark`);
        await shot3('09-via-hook');

        // Water: an island with a water temple in the lake, sea beyond, shallows towards you. With the raft the
        // way over deep water is a step, and the arrow carries the raft mark.
        await stage({ role: 'engineer', water: true, unlocks: ['raft'] });
        const centre = fake.scenario.state.creature.centre;
        await plan(await hexOnScreen(centre.q + WATER_ISLET.q, centre.r + WATER_ISLET.r));
        if (!(await page.locator('[data-mark="via:raft"]').count()))
          problems.push(`${vp.name}: the lake step has no raft mark`);
        await shot3('09b-water-raft');

        // A scholar enters the tomb (it is revealed) and works it: the find rises into the pack.
        await stage({ role: 'scholar', day: SCHOLAR_DAY });
        await walkTo('tomb');
        await settle();
        await openHere();
        if (!(await page.locator('[data-popover=here] [data-action=work-site]').count()))
          problems.push(`${vp.name}: no work-site on the tomb`);
        await shot3('10-here-site');
        await spend('[data-popover=here] [data-action=work-site]');
        await page.waitForTimeout(450);
        await expectMoment('find');
        await shot3('11-find');
        await settle();

        // Anyone entering a hidden trap springs it: the snap, and your pips go dark.
        await stage({ role: 'warden' });
        await walkTo('snare');
        await page.waitForTimeout(200);
        await expectMoment('trap');
        if (charOf(USERS.MISA)?.actionsLeft !== 0)
          problems.push(`${vp.name}: the trap did not end the day`);
        await shot3('12-trap');
        await settle();

        // Milestone 4: fires, the creature's signs, feeding and lingering.
        const shot4 = (name) => page.screenshot({ path: join(out, `m4-${vp.name}-${name}.png`) });
        // The hidden state holds the core's Reaction (attracted); a keeper's signs read it as 'toward'.
        const cueAt = { at: { q: 3, r: -1 }, reaction: 'attracted' };

        // Carrying timber, your own hex offers a fire (its timber and pip); lighting it draws it on the map.
        await stage({ pack: { timber: 1 } });
        await openHere();
        if (!(await page.locator('[data-popover=here] [data-action=light-fire]').count()))
          problems.push(`${vp.name}: no light-fire with timber in the pack`);
        await shot4('01-fire-offer');
        await spend('[data-popover=here] [data-action=light-fire]');
        await page.waitForTimeout(450);
        await expectMoment('fire');
        if (fake.scenario.state.stimuli.length !== 1)
          problems.push(`${vp.name}: lighting did not reach the server`);
        await shot4('02-fire-lit');
        await settle();
        await idle();
        await shot4('03-fire-burning');

        // No timber, on a deposit, with a fire seen: the here card hints at a fire, faded, its timber faded.
        await stage({ at: 'iron', explored: ['iron'], fires: [cueAt.at] });
        await openHere();
        if (
          !(await page.locator('[data-popover=here] [data-action=light-fire] [data-short]').count())
        )
          problems.push(`${vp.name}: no faded fire hint without fuel`);
        await shot4('03b-fire-hint');

        // A keeper: the hungry creature droops (level 2) and turns its head toward yesterday's fire.
        await stage({ role: 'keeper', satiety: 4, cues: [cueAt], fires: [cueAt.at] });
        await shot4('04-keeper-signs');
        // Anyone else sees the same hunger only faintly, and no cue.
        await stage({ role: 'scout', satiety: 4, cues: [cueAt], fires: [cueAt.at] });
        await shot4('05-faint-sign');

        // A keeper riding: the hub offers feeding (the forage it takes) and lingering, each with pips.
        await stage({ role: 'keeper', at: 'creature', stores: { forage: 2, timber: 1 } });
        await openHub();
        // (Defend shows too, greyed with the warden's emblem.)
        if (
          !(await page.locator('.drawer [data-care=feed]').count()) ||
          !(await page.locator('.drawer [data-care=linger]').count()) ||
          !(await page.locator('.drawer [data-care=defend] [data-needs=warden]').count())
        )
          problems.push(`${vp.name}: the hub does not offer feed and linger to a keeper`);
        await shot4('06-hub-care');
        await holdAll('hub', 'hub drawer (care)', '.drawer');
        await press('[data-care=feed] [aria-label=feed]');
        await page.waitForTimeout(300);
        if ((fake.scenario.state.stores.forage ?? 0) !== 1)
          problems.push(`${vp.name}: feeding did not reach the server`);
        await press('[data-care=linger] [aria-label=linger]');
        await page.waitForTimeout(450);
        await expectMoment('linger');
        if (!fake.scenario.state.creature.lingering)
          problems.push(`${vp.name}: lingering did not reach the server`);
        await shot4('07-linger');
        await settle();
        await idle();
        if (!(await page.locator('[data-mark=stay]').count()))
          problems.push(`${vp.name}: no stay mark while the creature lingers`);
        await shot4('08-lingering');

        // The day turns on a lingering creature: it stays, and the stayed mark plays on it.
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(350);
        await expectMoment('stayed');
        await shot4('09-stayed');
        await settle();

        // The day turns again: the creature walks its step; the step hints ahead are larger for the likelier
        // step.
        await freshDay();
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(350);
        await expectMoment('step');
        await shot4('10-step');
        await settle();
        await idle();
        if ((await page.locator('[data-mark^="step:"]').count()) < 2)
          problems.push(`${vp.name}: the step hints do not show the veers`);
        await shot4('11-step-hints');

        // A timber stand next to you: its inspect card hints at a fire, faded, with its timber.
        await stage({ deposit: 'timber-stand', explored: ['iron'] });
        await idle();
        await tap(...(await spot('iron')));
        if (!(await page.locator('[data-popover=inspect] [data-action=light-fire]').count()))
          problems.push(`${vp.name}: no fire hint on the timber stand's card`);
        await shot4('12-stand-hint');

        // A keeper riding a hungry creature: the bubble's creature entry carries the appetite badge.
        await stage({ role: 'keeper', at: 'creature', satiety: 4 });
        {
          const c = fake.scenario.state.creature.centre;
          await idle();
          await tap(...(await hexOnScreen(c.q, c.r)));
        }
        if (!(await page.locator('[data-popover=bubble] [data-appetite]').count()))
          problems.push(`${vp.name}: no appetite badge on the bubble`);
        await shot4('13-bubble-badge');
        await idle();

        // Milestone 5: threats, settlements, defending, peril and the route, and the season's end, staged
        // (`seasonScenario`) and then played through the real core (strikes, a boon, a defence, the ticks).
        const shot5 = async (name) => {
          const file = `m5-${vp.name}-${name}.png`;
          await page.screenshot({ path: join(out, file) });
          m5Shots.push(file);
        };
        const stage5 = async (st) => {
          fake.reset(seasonScenario(st));
          await page.reload();
          await page.waitForSelector('.map-world svg g');
          await page.waitForTimeout(500);
        };
        const offset = async (h) => {
          const c = fake.scenario.state.creature.centre;
          return hexOnScreen(c.q + h.q, c.r + h.r);
        };
        const count = (sel) => page.locator(sel).count();
        /** A real tap on the middle of an element (touch on a phone, a click on desktop). */
        const tapEl = async (selector) => {
          await page.locator(selector).first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
          const b = await page.locator(selector).first().boundingBox();
          await tap(b.x + b.width / 2, b.y + b.height / 2);
          await page.waitForTimeout(100);
        };

        // Threats coming in: a captor band behind, a swarm on the flank, a rockslide on the road ahead.
        await stage5({
          role: 'scout',
          threats: [
            { type: 'captors', at: { q: 0, r: 4 } },
            { type: 'swarm', at: { q: -4, r: 1 }, strength: 2 },
            { type: 'rockslide', at: { q: 0, r: -4 } },
          ],
          peril: 2,
          steps: 3,
        });
        if ((await count('.map-world [data-threat=figure]')) !== 3)
          problems.push(`${vp.name}: not every threat is drawn`);
        if (!(await count('.map-world [data-threat=arrow]')))
          problems.push(`${vp.name}: no approach arrows`);
        await shot5('01-threats');
        // The tick moves them (the real core): the arrows follow.
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(900);
        await shot5('02-threats-next-day');

        // A swarm next to you: its card shows its name and strength and the strike; striking it is a hit.
        await stage5({
          role: 'warden',
          threats: [{ type: 'swarm', at: { q: 1, r: 3 }, strength: 3 }],
        });
        await tap(...(await offset({ q: 1, r: 3 })));
        if (!(await count('[data-popover=threat] [data-action=strike]')))
          problems.push(`${vp.name}: no strike on a threat next to you`);
        await shot5('03-threat-card');
        await spend('[data-popover=threat] [data-action=strike]');
        await page.waitForTimeout(300);
        await expectMoment('hit');
        if (fake.scenario.state.threats[0]?.strength !== 1)
          problems.push(`${vp.name}: the strike did not reach the server`);
        await shot5('04-threat-hit');
        await settle();
        // A far threat's card has no strike.
        await stage5({ role: 'scout', threats: [{ type: 'captors', at: { q: 3, r: 4 } }] });
        await tap(...(await offset({ q: 3, r: 4 })));
        if (!(await has('threat')) || (await count('[data-popover=threat] [data-action=strike]')))
          problems.push(`${vp.name}: a far threat's card offers a strike`);
        await shot5('05-threat-card-far');
        // Its card open, the threat's next-tick path is on the map as an ink trail to a ringed end hex, and the
        // card shows how far it goes; the trail clears when the card closes.
        await stage5({ role: 'scout', threats: [{ type: 'captors', at: { q: 0, r: 5 } }] });
        if ((await count('.map-world [data-threat=figure]')) !== 1)
          problems.push(`${vp.name}: the threat with a trail is not drawn`);
        await tap(...(await offset({ q: 0, r: 5 })));
        if (!(await has('threat'))) problems.push(`${vp.name}: no card on a far threat`);
        await holdAll('threat');
        if ((await count('.map-world [data-mark=threat-trail]')) !== 2)
          problems.push(`${vp.name}: no threat trail with its card open`);
        if ((await count('.map-world [data-mark=threat-end]')) !== 1)
          problems.push(`${vp.name}: the threat trail's end is not marked`);
        const distance = Number(
          await page
            .locator('[data-popover=threat] [data-mark=distance]')
            .getAttribute('data-distance'),
        );
        if (!(distance > 0)) problems.push(`${vp.name}: the threat card shows no distance`);
        const cardBox = await page.locator('[data-popover=threat]').boundingBox();
        const endBox = await page.locator('.map-world [data-mark=threat-end]').boundingBox();
        const inset = (b) => ({ x: b.x + 4, y: b.y + 4, w: b.width - 8, h: b.height - 8 });
        if (cardBox && endBox) {
          const [a, b] = [inset(cardBox), inset(endBox)];
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
            problems.push(`${vp.name}: the threat card covers its trail's end`);
        }
        await shot5('05b-threat-path');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if (await count('.map-world [data-mark=threat-trail], .map-world [data-mark=threat-end]'))
          problems.push(`${vp.name}: the threat trail stays after its card closes`);

        // The tile picker: you, Ola (a warden) and a swarm on one tile. A tap shows one round bubble each,
        // above the tile; a bubble opens its card with a back to the picker.
        await stage5({
          role: 'scout',
          wardenAt: { q: 1, r: 2 },
          threats: [{ type: 'swarm', at: { q: 1, r: 2 }, strength: 3 }],
        });
        {
          const [hx, hy] = await offset({ q: 1, r: 2 });
          await tap(hx, hy);
          if (!(await has('pick'))) problems.push(`${vp.name}: no picker on a shared tile`);
          if ((await count('[data-popover=pick] [data-pick]')) !== 3)
            problems.push(`${vp.name}: the picker is not one bubble per thing`);
          const box = await page.locator('[data-popover=pick]').boundingBox();
          if (box && !(box.y + box.height <= hy + 4))
            problems.push(`${vp.name}: the picker is not above the tile`);
          await holdAll('pick');
          await shot5('07-picker');
          await page.locator('[data-pick="threat:threat-1"]').click();
          await page.waitForTimeout(300);
          if (!(await has('threat')))
            problems.push(`${vp.name}: the swarm's bubble opened no card`);
          if (!(await count('[data-popover=threat] [data-action=strike]')))
            problems.push(`${vp.name}: no strike on the card opened from the picker`);
          if (!(await count('[data-back]')))
            problems.push(`${vp.name}: the card from the picker has no back`);
          await shot5('07b-picker-threat');
          await page.locator('[data-back]').first().click();
          await page.waitForTimeout(300);
          if (!(await has('pick'))) problems.push(`${vp.name}: back did not return to the picker`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }
        // Near the top of the screen there is no room above: the bubbles open below the tile.
        await stage5({
          role: 'scout',
          wardenAt: { q: 0, r: -5 },
          threats: [{ type: 'swarm', at: { q: 0, r: -5 }, strength: 3 }],
        });
        {
          const [hx, hy] = await offset({ q: 0, r: -5 });
          await tap(hx, hy);
          if (!(await has('pick')))
            problems.push(`${vp.name}: no picker on a shared tile at the top`);
          const box = await page.locator('[data-popover=pick]').boundingBox();
          if (box && !(box.y >= hy - 4))
            problems.push(`${vp.name}: the picker did not flip below a tile near the top`);
          await shot5('07c-picker-below');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

        // A wary settlement where you stand: parley with the risk mark (a scout), and an offer of old coin.
        await stage5({
          role: 'scout',
          settlements: [{ at: { q: 1, r: 2 }, favour: 1 }],
          pack: { 'old-coin': 1 },
        });
        await openHere();
        if (!(await count('[data-popover=here] [data-action=parley] [data-risk]')))
          problems.push(`${vp.name}: no risk mark on a scout's parley`);
        if (!(await count('[data-popover=here] [data-action="offer:old-coin"]')))
          problems.push(`${vp.name}: no offer with a coin carried`);
        await shot5('06-settlement-wary');
        await spend('[data-popover=here] [data-action="offer:old-coin"]');
        await page.waitForTimeout(400);
        if (fake.scenario.state.settlements[0]?.attitude !== 'friendly')
          problems.push(`${vp.name}: the offer did not befriend the settlement`);
        await expectMoment('befriended');
        await shot5('07-befriended');
        await settle();
        // Friendly: the three boons; shelter lowers peril.
        await stage5({
          role: 'warden',
          settlements: [{ at: { q: 1, r: 2 }, attitude: 'friendly', favour: 3 }],
          peril: 5,
        });
        await openHere();
        if ((await count('[data-popover=here] [data-action^="boon:"]')) !== 3)
          problems.push(`${vp.name}: a friendly settlement does not offer three boons`);
        await shot5('08-settlement-friendly');
        await spend('[data-popover=here] [data-action="boon:shelter"]');
        await page.waitForTimeout(400);
        await expectMoment('boon');
        // The peril gauge drops with a moment: relief on the creature, the gauge swelling softly.
        await expectMoment('relieved');
        if (!(await count('.hud-peril.is-relieved')))
          problems.push(`${vp.name}: the peril gauge shows no relief after a shelter`);
        if (fake.scenario.state.peril !== 2)
          problems.push(`${vp.name}: shelter did not lower peril`);
        await shot5('09-boon');
        await settle();
        // The settlement where you stand stays tappable once its boon is taken: its card shows the boon.
        await idle();
        await openHere();
        if (
          !(await count(
            '[data-popover=here][data-boon=shelter], [data-popover=settlement][data-boon=shelter]',
          ))
        )
          problems.push(
            `${vp.name}: a used settlement where you stand shows no card with its boon`,
          );
        await shot5('09b-settlement-used');
        await idle();

        // A mislead: the captors turn away with a moment, and the misled mark shows while it lasts.
        await stage5({
          role: 'warden',
          settlements: [{ at: { q: 1, r: 2 }, attitude: 'friendly', favour: 3 }],
          threats: [{ type: 'captors', at: { q: 0, r: 4 } }],
        });
        await openHere();
        await spend('[data-popover=here] [data-action="boon:mislead"]');
        await page.waitForTimeout(400);
        await expectMoment('misled');
        if (fake.scenario.state.threats.length !== 0)
          problems.push(`${vp.name}: the mislead did not lead the captors away`);
        await shot5('09c-misled-moment');
        await settle();
        await idle();
        if (!(await count('.map-world [data-mark=misled]')))
          problems.push(`${vp.name}: no misled mark while the mislead lasts`);
        await shot5('09d-misled-mark');
        // From afar, a settlement's card: its attitude and favour, no actions.
        await stage5({ role: 'scout', settlements: [{ at: { q: 3, r: 4 }, favour: 2 }] });
        await tap(...(await offset({ q: 3, r: 4 })));
        if (!(await has('settlement'))) problems.push(`${vp.name}: no settlement card from afar`);
        await holdAll('settlement');
        await shot5('10-settlement-card');

        // The HUD at high peril, far along the route: the gauge past its wounded notch, the edges darker.
        await stage5({ role: 'scout', peril: 7, steps: 28 });
        if ((await page.locator('.hud-peril').getAttribute('data-peril')) !== '7')
          problems.push(`${vp.name}: the peril gauge does not show the peril`);
        if (!(await count('.peril-edge'))) problems.push(`${vp.name}: no edge shade at peril 7`);
        await shot5('11-hud-peril-route');

        // A warden riding: the hub's defend card; defending raises its shield on the creature.
        await stage5({ role: 'warden', at: 'creature' });
        await openHub();
        if (!(await count('.drawer [data-care=defend]')))
          problems.push(`${vp.name}: no defend card for a riding warden`);
        await shot5('12-defend-card');
        await press('[data-care=defend] [aria-label=defend]');
        await page.waitForTimeout(450);
        await expectMoment('defend');
        if (!fake.scenario.state.creature.defenders.length)
          problems.push(`${vp.name}: the defence did not reach the server`);
        await settle();
        await idle();
        if (!(await count('[data-mark=defending]')))
          problems.push(`${vp.name}: no shield on the defending warden`);
        await shot5('13-defending');
        // A defended creature: the hub's creature card and a threat's card show the shields, and a tap on the
        // mark gives a hint. Defending is staged (the warden has defended today).
        await stage5({
          role: 'warden',
          at: 'creature',
          defending: true,
          threats: [{ type: 'captors', at: { q: 0, r: 4 }, strength: 4 }],
        });
        await openHub();
        if (!(await count('.drawer [data-mark=defended]')))
          problems.push(`${vp.name}: the hub's creature card does not show it is defended`);
        await shot5('15-defended-creature');
        await tapEl('.drawer [data-mark=defended]');
        if (!(await count('.tip')))
          problems.push(`${vp.name}: a tap on the defended mark showed no tip`);
        if (!(await count('.drawer [data-care=defend]')))
          problems.push(`${vp.name}: the tip on the defended mark closed the hub`);
        await shot5('15b-defended-tip');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await tap(...(await offset({ q: 0, r: 4 })));
        if (!(await count('[data-popover=threat] [data-mark=defence]')))
          problems.push(`${vp.name}: a threat's card shows no shields against its strength`);
        await shot5('15c-defended-threat-card');
        await idle();

        // A greyed action: a tap shows why in a tip, the card stays open, and nothing acts (the server's
        // state is the same afterwards). The hub: a scout's linger, defend and an unlock; a card: a strike
        // with no actions left.
        const snapshot = () => JSON.stringify(fake.scenario.state);
        const greyedTap = async (selector, label) => {
          const before = snapshot();
          await tapEl(selector);
          await page.waitForTimeout(250);
          if (!(await count('.tip')))
            problems.push(`${vp.name}: a tap on greyed ${label} showed no tip`);
          if (!(await count(selector)))
            problems.push(`${vp.name}: greyed ${label} closed its card`);
          if (snapshot() !== before) problems.push(`${vp.name}: greyed ${label} acted on a tap`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        };
        await stage5({ role: 'scout', at: 'creature', stores: { forage: 2 } });
        await openHub();
        await greyedTap('.drawer [data-care=linger] .unlock-go', 'linger');
        await greyedTap('.drawer [data-care=defend] .unlock-go', 'defend');
        await greyedTap('.drawer [data-unlock] .unlock-go[aria-disabled=true]', 'build');
        await tapEl('.drawer [data-care=linger] .unlock-go');
        await shot5('16-greyed-reason-tip');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await stage5({
          role: 'warden',
          threats: [{ type: 'swarm', at: { q: 1, r: 3 }, strength: 3 }],
        });
        {
          const s0 = fake.scenario;
          const characters = s0.state.characters.map((c) => ({ ...c, actionsLeft: 0 }));
          fake.reset({ ...s0, state: { ...s0.state, characters }, version: s0.version + 1 });
          await page.reload();
          await page.waitForSelector('.map-world svg g');
          await page.waitForTimeout(500);
        }
        await tap(...(await offset({ q: 1, r: 3 })));
        if (!(await count('[data-popover=threat] [data-action=strike][aria-disabled=true]')))
          problems.push(`${vp.name}: no greyed strike without actions`);
        await greyedTap('[data-popover=threat] [data-action=strike]', 'strike');
        await holdAll('threat', 'threat (greyed strike)');
        await shot5('16b-greyed-strike-tip');
        await idle();

        // A warden on a hex beside you: its escort ring and your shield.
        await stage5({ role: 'scout', wardenAt: { q: 2, r: 2 } });
        if (
          !(await count('.map-world [data-escort]')) ||
          !(await count('.map-world [data-mark=escorted]'))
        )
          problems.push(`${vp.name}: no escort ring or shield`);
        await shot5('14-escort');

        // The fresh-eyes playtest of Milestone 5 (docs/playtests/2026-11-20-m5-fresh-eyes.md).
        const meNow = () => fake.scenario.state.characters.find((ch) => ch.userId === USERS.MISA);
        /** A hex's top face on screen, corner by corner (flat-topped hexes). */
        const hexFace = async (h) => {
          const out = [];
          for (let i = 0; i < 6; i += 1) {
            const a = (Math.PI / 3) * i;
            const [x, y] = await hexOnScreen(h.q, h.r, Math.cos(a), Math.sin(a));
            out.push({ x, y });
          }
          return out;
        };
        /** Whether a box and a convex polygon share area (separating axes). */
        const boxCovers = (b, poly) => {
          const box = [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x + b.width, y: b.y + b.height },
            { x: b.x, y: b.y + b.height },
          ];
          const axes = [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ];
          for (let i = 0; i < poly.length; i += 1) {
            const a = poly[i];
            const c = poly[(i + 1) % poly.length];
            axes.push({ x: a.y - c.y, y: c.x - a.x });
          }
          for (const ax of axes) {
            const pr = (pts) => pts.map((pt) => pt.x * ax.x + pt.y * ax.y);
            const [p0, p1] = [Math.min(...pr(box)), Math.max(...pr(box))];
            const [q0, q1] = [Math.min(...pr(poly)), Math.max(...pr(poly))];
            if (p1 <= q0 + 0.5 || q1 <= p0 + 0.5) return false;
          }
          return true;
        };
        /** Your hex's card covers none of your hex and its six neighbours. */
        const cardClear = async (kind, name) => {
          const at = meNow()?.at;
          const box = await page.locator(`[data-popover=${kind}]`).boundingBox();
          if (at?.kind !== 'hex' || !box) {
            problems.push(`${vp.name}: no ${kind} card on your own hex (${name})`);
            return;
          }
          for (const h of hexesInRange(at.hex, 1)) {
            if (boxCovers(box, await hexFace(h)))
              problems.push(`${vp.name}: the ${kind} card covers ${h.q},${h.r} (${name})`);
          }
        };
        const meTile = async () => {
          const at = meNow()?.at;
          // The lower half of your tile, below your figure's feet.
          return at?.kind === 'hex' ? hexOnScreen(at.hex.q, at.hex.r, 0.35, 0.45) : null;
        };

        // 1. Your own tile on a settlement with three boons: the card sits clear of the six neighbours, and
        // one tap on the tile opens and closes it, every time. An action's first tap only arms it.
        await stage5({
          role: 'warden',
          settlements: [{ at: { q: 1, r: 2 }, attitude: 'friendly', favour: 3 }],
          pack: { forage: 1 },
        });
        await idle();
        const flips = [];
        for (let i = 0; i < 4; i += 1) {
          await tap(...(await meTile()));
          flips.push(await has('here'));
        }
        if (flips.join() !== 'true,false,true,false')
          problems.push(`${vp.name}: taps on your own tile went ${flips.join()}`);
        await tap(...(await meTile()));
        await cardClear('here', 'settlement');
        await shot5('p1-own-tile-card');
        const actionsBefore = meNow()?.actionsLeft;
        await press('[data-popover=here] [data-action="boon:gift"]');
        if (meNow()?.actionsLeft !== actionsBefore)
          problems.push(`${vp.name}: one tap on an action spent it`);
        if (!(await count('[data-popover=here] [data-action="boon:gift"][data-armed]')))
          problems.push(`${vp.name}: the first tap did not arm the action`);
        await shot5('p1-armed');
        await idle();
        // The same on a bare tile with a feature, near the bottom of the screen on a phone.
        await stage5({ role: 'scout', at: 'iron', explored: ['iron'] });
        await openHere();
        await cardClear('here', 'deposit');

        // 2. Out of reach: a tap on the cliff (impassable) while selected shows the mark, not the card;
        // a second tap looks at it.
        await stage5({ role: 'scout' });
        await idle();
        await tap(...(await meTile()));
        await tap(...(await offset(CHAIN_SPOTS.cliff)));
        if (!(await count('.map-world [data-mark=out-of-reach]')))
          problems.push(`${vp.name}: no out-of-reach mark on the cliff`);
        if (await has('inspect'))
          problems.push(`${vp.name}: an out-of-reach tap opened the inspect card`);
        await page.waitForTimeout(150);
        await shot5('p2-out-of-reach');
        await tap(...(await offset(CHAIN_SPOTS.cliff)));
        if (!(await has('inspect')))
          problems.push(`${vp.name}: a second tap out of reach does not inspect`);
        await idle();

        // 3. An empty survey: the "nothing here" moment, then the explored-empty mark stays.
        await stage5({ role: 'scout' });
        {
          const st = fake.scenario.state;
          const me = meNow();
          const empty = hexesInRange(me.at.hex, 1).find(
            (h) =>
              // Not straight behind your figure, which takes taps on its hex's upper part.
              !(h.q === me.at.hex.q && h.r === me.at.hex.r - 1) &&
              // Nor where another character stands (a tap there opens their card).
              !st.characters.some(
                (ch) => ch.at.kind === 'hex' && ch.at.hex.q === h.q && ch.at.hex.r === h.r,
              ) &&
              hexDistance(h, me.at.hex) === 1 &&
              !st.features[`${h.q},${h.r}`] &&
              checkAction(st, me.id, { kind: 'survey', hex: h }).ok,
          );
          if (!empty) problems.push(`${vp.name}: no empty neighbour to survey`);
          else {
            const before = await count('.map-world [data-mark=explored-empty]');
            await tap(...(await hexOnScreen(empty.q, empty.r)));
            if (!(await count('[data-popover=inspect] [data-action=survey]'))) {
              problems.push(
                `${vp.name}: no survey offered on the empty neighbour ${empty.q},${empty.r}`,
              );
              await shot5('x-no-survey');
            }
            await spend('[data-popover=inspect] [data-action=survey]');
            await page.waitForTimeout(300);
            await expectMoment('nothing-here');
            await shot5('p3-nothing-here');
            await settle();
            if ((await count('.map-world [data-mark=explored-empty]')) <= before)
              problems.push(`${vp.name}: no explored-empty mark after an empty survey`);
            await shot5('p3-explored-empty');
          }
        }

        // 4. Greyed actions show the role that can: a scout at a deep tomb (the scholar), and riding, the
        // keeper's linger, the warden's defence and the engineer's unlocks in the hub.
        await stage5({ role: 'scout', at: 'iron', explored: ['iron'], deposit: 'deep-tomb' });
        await openHere();
        if (!(await count('[data-popover=here] [data-action=work-site][data-needs=scholar]')))
          problems.push(`${vp.name}: no scholar badge on a deep tomb for a scout`);
        await shot5('p4-greyed-role');
        await idle();
        await stage5({ role: 'scout', at: 'creature' });
        await openHub();
        for (const [care, role] of [
          ['linger', 'keeper'],
          ['defend', 'warden'],
        ]) {
          if (!(await count(`.drawer [data-care=${care}] [data-needs=${role}]`)))
            problems.push(`${vp.name}: no ${role} badge on ${care} in the hub`);
        }
        if (!(await count('.drawer [data-unlock] [data-needs=engineer]')))
          problems.push(`${vp.name}: no engineer badge on the unlocks`);
        await shot5('p4-hub-roles');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // 5. A used (and an angry) settlement from afar: its card shows its state and the boon taken.
        await stage5({
          role: 'scout',
          settlements: [
            { at: { q: 3, r: 4 }, attitude: 'friendly', favour: 3, boon: 'gift' },
            { at: { q: -2, r: 4 }, attitude: 'angry' },
          ],
        });
        await tap(...(await offset({ q: 3, r: 4 })));
        if (!(await count('[data-popover=settlement][data-boon=gift]')))
          problems.push(`${vp.name}: a used settlement's card does not show its boon`);
        await shot5('p5-settlement-used');
        await idle();
        await tap(...(await offset({ q: -2, r: 4 })));
        if (!(await count('[data-popover=settlement][data-attitude=angry]')))
          problems.push(`${vp.name}: an angry settlement gives no card`);
        await shot5('p5-settlement-angry');
        await idle();

        // Where peril came from: a tap on the HUD gauge opens the breakdown as a popover (hunger beside the
        // threats that struck, and what eased it); a hungry tick shows its cause at the gauge and on the creature.
        const PERIL_LOG = {
          added: { hunger: 4, 'threat:captors': 5, 'threat:swarm': 2 },
          eased: { calm: 1, shelter: 3 },
          held: 2,
        };
        await stage5({ role: 'scout', at: 'creature', peril: 7, stats: { peril: PERIL_LOG } });
        await tapEl('.hud-peril');
        await page.waitForTimeout(300);
        if ((await count('.tip .peril-breakdown .peril-row[data-kind=added]')) !== 3)
          problems.push(`${vp.name}: the gauge's popover does not list the three sources`);
        if (!(await count('.tip .peril-breakdown .peril-row[data-source=hunger]')))
          problems.push(`${vp.name}: the gauge's popover does not show hunger`);
        if (!(await count('.tip .peril-eased .peril-row')))
          problems.push(`${vp.name}: the gauge's popover shows nothing that eased peril`);
        const popBox = await page.locator('.tip').boundingBox();
        if (!popBox || popBox.x < 0 || popBox.x + popBox.width > vp.width)
          problems.push(`${vp.name}: the gauge's popover leaves the screen`);
        await shot5('16-peril-popover');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        if (await count('.tip'))
          problems.push(`${vp.name}: Escape did not close the gauge's popover`);
        // A tick that ends with the creature underfed: hunger raises peril, and says so.
        await stage5({ role: 'scout', at: 'creature', satiety: 6 });
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(500);
        if (!(await count('.hud-peril-cause[data-cause=hunger]')))
          problems.push(`${vp.name}: no hunger mark at the gauge when hunger raised peril`);
        if (!(await count('[data-moment=hungry]')))
          problems.push(`${vp.name}: no hunger mark on the creature when hunger raised peril`);
        await shot5('16b-peril-hunger');
        await page.waitForTimeout(1500);

        // The season's end, each outcome reached by a tick of the real core: home safe on the last step,
        // home wounded at high peril, lost when a strike fills the gauge.
        const routeLength = fake.scenario.state.config.routeLength;
        const RECAP_STATS = {
          shared: { threatsTurned: 3, finds: 2, unlocks: 1, befriended: 1, peakPeril: 8 },
          byUser: {
            '100000000000000001': { explored: 14, strikes: 2, gathered: 5 },
            '100000000000000002': { explored: 6, strikes: 5, gathered: 9 },
            '100000000000000003': { explored: 6, strikes: 0, gathered: 0 },
          },
        };
        const WOUNDED_LOG = {
          added: { hunger: 4, 'threat:captors': 5, 'threat:swarm': 2 },
          eased: { calm: 1, shelter: 3 },
          held: 2,
        };
        const LOST_LOG = {
          added: { hunger: 5, 'threat:swarm': 6, 'threat:rockslide': 3 },
          eased: { calm: 2, shelter: 3 },
          held: 0,
        };
        const endings = [
          ['safe', { steps: routeLength - 1, peril: 0, stats: RECAP_STATS }],
          [
            'wounded',
            {
              steps: routeLength - 1,
              peril: 7,
              stats: { ...RECAP_STATS, peril: WOUNDED_LOG },
            },
          ],
          [
            'lost',
            {
              steps: 2,
              peril: 9,
              stats: { ...RECAP_STATS, peril: LOST_LOG },
              threats: [
                { type: 'swarm', at: { q: 0, r: -3 }, strength: 4 },
                { type: 'swarm', at: { q: 3, r: -3 }, strength: 4 },
                { type: 'swarm', at: { q: -3, r: 0 }, strength: 4 },
              ],
            },
          ],
        ];
        for (const [outcome, st] of endings) {
          await stage5({ role: 'scout', at: 'creature', ...st });
          await press('[aria-label="Next day"]');
          await page.waitForTimeout(900);
          const shown = await page
            .locator('.ending')
            .getAttribute('data-outcome')
            .catch(() => null);
          if (shown !== outcome)
            problems.push(`${vp.name}: ending ${String(shown)}, not ${outcome}`);
          if (!(await count('.ending [aria-label="New season"]')))
            problems.push(`${vp.name}: no new-season button for an admin`);
          // The route and the days sit low on the screen, clear of the scene's middle.
          const foot = await page.locator('.ending-route').boundingBox();
          if (!foot || foot.y < vp.height * 0.6)
            problems.push(`${vp.name}: the ending's route sits at ${String(foot?.y)} px`);
          // The scene (and the party in it) ends above the foot: the summary never covers the characters.
          const sceneBox = await page.locator('.ending-scene svg').boundingBox();
          const footBox = await page.locator('.ending-foot').boundingBox();
          if (!sceneBox || !footBox || sceneBox.y + sceneBox.height > footBox.y + 0.5)
            problems.push(
              `${vp.name}: the ending's foot (top ${String(footBox?.y)}) covers the scene (bottom ${String(sceneBox && sceneBox.y + sceneBox.height)})`,
            );
          // The recap is part of the ending: three players by name with a role emblem, and the foot stays clear.
          if ((await count('.ending .recap-player')) < 2)
            problems.push(`${vp.name}: no recap on the ${String(outcome)} ending`);
          if (!(await count('.ending .recap-player [data-top]')))
            problems.push(`${vp.name}: the recap highlights no one`);
          const recapBox = await page.locator('.ending .recap').boundingBox();
          if (!recapBox || recapBox.y + recapBox.height > footBox.y + 0.5)
            problems.push(`${vp.name}: the recap runs into the ending's foot`);
          // Where peril came from, on the endings that had some: icons with numbers, the biggest first.
          if (outcome !== 'safe') {
            const rows = await page.locator('.ending .peril-row[data-kind=added]').count();
            if (rows < 3)
              problems.push(`${vp.name}: the ${outcome} ending lists ${rows} peril sources`);
            const nums = await page
              .locator('.ending .peril-row[data-kind=added]')
              .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-amount'))));
            if (nums.some((n, i) => i > 0 && n > nums[i - 1]))
              problems.push(
                `${vp.name}: the ${outcome} ending's peril sources are not biggest first`,
              );
            if (!(await count('.ending .peril-row[data-source=hunger]')))
              problems.push(`${vp.name}: the ${outcome} ending does not show hunger`);
          }
          await shot5(`15-ending-${outcome}`);
        }
        // A new season that fails: the button shakes and fades back, the ending stays.
        fake.failNewSeason = true;
        const quiet5 = problems.length;
        await press('.ending [aria-label="New season"]');
        await page.waitForTimeout(250);
        if (!(await count('.ending-new.is-failed')))
          problems.push(`${vp.name}: no sign that the new season failed`);
        await shot5('15b-new-season-failed');
        await page.waitForTimeout(900);
        // The failed request logs a console error; that one is expected.
        problems.splice(
          quiet5,
          problems.length - quiet5,
          ...problems.slice(quiet5).filter((p) => !/500/.test(p)),
        );
        // A new season: the ending gives way to the join drawer of a new game.
        await press('.ending [aria-label="New season"]');
        await page.waitForTimeout(800);
        if (await count('.ending'))
          problems.push(`${vp.name}: the ending stayed after a new season`);
        if (!(await count('.drawer .offer')))
          problems.push(`${vp.name}: no join drawer in the new season`);
        await shot5('16-new-season');
      }

      // Polish round (the fresh-eyes playtest), on the staged chain and an edge-of-the-window stage.
      {
        const shotP = (name) =>
          page.screenshot({ path: join(out, `polish-${vp.name}-${name}.png`) });
        const load = async (scenario) => {
          fake.reset(scenario);
          await page.reload();
          await page.waitForSelector('.map-world svg g');
          await page.waitForTimeout(500);
        };
        const meHex = () => charOf(USERS.MISA)?.at;
        const meOnScreen = async () => {
          const at = meHex();
          return at?.kind === 'hex' ? hexOnScreen(at.hex.q, at.hex.r, -0.05, 0.1) : null;
        };

        // 1. The pack box: an empty pack reads as empty; it closes on a tap elsewhere, Escape, right-click.
        await load(chainScenario({}));
        await press('.hud-pack');
        await page.waitForTimeout(150);
        if (!(await page.locator('.hud-pack-contents[data-empty]').count()))
          problems.push(`${vp.name}: the empty pack does not read as empty`);
        await shotP('01-pack-empty');
        await tap(cx, cy * 0.5);
        if (await page.locator('.hud-pack-contents').count())
          problems.push(`${vp.name}: the pack box stays open after a tap elsewhere`);
        await press('.hud-pack');
        // Off the button, so its tip is not open (Escape closes an open tip first, and only that).
        if (!vp.touch) await page.mouse.move(cx, cy * 0.5);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        if (await page.locator('.hud-pack-contents').count())
          problems.push(`${vp.name}: Escape does not close the pack box`);
        if (!vp.touch) {
          await press('.hud-pack');
          await page.mouse.click(cx, cy * 0.5, { button: 'right' });
          await page.waitForTimeout(100);
          if (await page.locator('.hud-pack-contents').count())
            problems.push(`${vp.name}: right-click does not close the pack box`);
        }

        // 5. Hints: the gather hand by an explored deposit; faint spyglasses on surveyable neighbours.
        await load(chainScenario({ explored: ['iron'] }));
        if (!(await page.locator('[data-mark="action:hand"]').count()))
          problems.push(`${vp.name}: no gather badge by the explored deposit`);
        await shotP('05-action-badge');
        await tap(...(await meOnScreen()));
        if (!(await page.locator('[data-mark=survey-hint]').count()))
          problems.push(`${vp.name}: no survey hints while selected`);
        await shotP('05-survey-hints');
        await page.keyboard.press('Escape');

        // 6. Your own action refreshes: a read of the log since the view before it follows the answer.
        const readsBefore = fake.reads.length;
        await tap(...(await meOnScreen()));
        await tap(
          ...(await hexOnScreen(
            fake.scenario.state.creature.centre.q + CHAIN_SPOTS.iron.q,
            fake.scenario.state.creature.centre.r + CHAIN_SPOTS.iron.r,
          )),
        );
        if (await has('confirm')) await press('[aria-label=Confirm]');
        await page.waitForTimeout(400);
        if (!fake.reads.slice(readsBefore).some((q) => q.includes('since=')))
          problems.push(`${vp.name}: no refresh after your own action`);

        // 4. A new day: the camera holds while the creature walks its step, then follows.
        await load(chainScenario({}));
        const viewBefore = await svg.getAttribute('data-view');
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(450);
        if (!(await page.locator('[data-moment=step]').count()))
          problems.push(`${vp.name}: no creature step on a new day`);
        if ((await svg.getAttribute('data-view')) !== viewBefore)
          problems.push(`${vp.name}: the camera moved while the creature walked`);
        await shotP('04-creature-step');
        await page.waitForTimeout(1800);
        if ((await svg.getAttribute('data-view')) === viewBefore)
          problems.push(`${vp.name}: the camera did not follow the creature`);
        await shotP('04-after-step');

        // 3. Left behind: the window's edge is drawn; on the grace day an hourglass and tinted pips; then
        // a fog moment before the join drawer opens.
        if (!(await page.locator('[data-mark=window-edge]').count()))
          problems.push(`${vp.name}: no window edge`);
        await load(EDGE);
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(2000);
        if (!(await page.locator('[data-mark=grace-warning]').count()))
          problems.push(`${vp.name}: no hourglass on the grace day`);
        if (!(await page.locator('.hud-actions.is-warned').count()))
          problems.push(`${vp.name}: the pips are not tinted on the grace day`);
        await shotP('03-grace-day');
        await press('[aria-label="Next day"]');
        await page.waitForTimeout(600);
        if (!(await page.locator('[data-moment=lost]').count()))
          problems.push(`${vp.name}: no fog moment when your character is lost`);
        if (await page.locator('.drawer .offer').count())
          problems.push(`${vp.name}: the join drawer opened before the fog moment ended`);
        await shotP('03-lost-moment');
        await page.waitForTimeout(2200);
        if (!(await page.locator('.drawer .offer').count()))
          problems.push(`${vp.name}: the join drawer did not open after the fog moment`);
        await shotP('03-lost-drawer');
      }

      // Skill trees: a scout with a pick ready in two trees (her own, and the warden's tier 1), Pip with a
      // node taken. The HUD emblem glows; the tree drawer arms a node on one tap and takes it on the second.
      {
        const per = chainScenario().state.config.xpPerPick;
        const shotS = (name) =>
          page.screenshot({ path: join(out, `skills-${vp.name}-${name}.png`) });
        fake.reset(
          chainScenario({
            role: 'scout',
            at: 'creature',
            xp: per * 2,
            pipTaken: ['keeper-a1'],
          }),
        );
        await page.reload();
        await page.waitForSelector('.hud-skills');
        await page.waitForTimeout(500);
        if (!(await page.locator('.hud-skills[data-ready] [data-glow=ready]').count()))
          problems.push(`${vp.name}: the skills emblem does not glow with a pick ready`);
        await shotS('1-hud-ready');
        // A hold (or hover) on the emblem shows its tip and opens nothing.
        await tipCheck('.hud-skills', 'skills-hud');
        if (await page.locator('[data-skills]').count())
          problems.push(`${vp.name}: a hold on the skills emblem opened the tree`);
        await press('.hud-skills');
        await page.waitForSelector('[data-skills]');
        await page.waitForTimeout(400);
        const takenNow = () => characterOf(fake.scenario.state, USERS.MISA).skills.taken;
        if ((await page.locator('[data-skill][data-state=available]').count()) !== 2)
          problems.push(`${vp.name}: the tree does not offer both first nodes`);
        if ((await page.locator('[data-tab]').count()) !== 5)
          problems.push(`${vp.name}: the tree does not have five role tabs`);
        if (await page.locator('[data-skill][data-state=veiled]').count())
          problems.push(`${vp.name}: tiers 2 and 3 are still veiled`);
        await shotS('2-tree-ready');
        await holdAll('skills', 'skills drawer', '.drawer');

        // One tap shows the node's tip and arms it (the node lifts, the tick shows) and sends nothing; the tick
        // takes it. A tap on the armed node again keeps it armed; another available node moves the arm.
        await press('[data-skill=scout-b1]');
        if (!(await page.locator('[data-skill=scout-b1][data-armed]').count()))
          problems.push(`${vp.name}: a tap on an available node did not arm it`);
        if (!(await page.locator('.tip').count()))
          problems.push(`${vp.name}: a tap on an available node showed no tip`);
        if (takenNow().length !== 0) problems.push(`${vp.name}: a single tap sent the pick`);
        await shotS('3-armed');
        await press('[data-skill=scout-b1]');
        await page.waitForTimeout(200);
        if (!(await page.locator('[data-skill=scout-b1][data-armed]').count()))
          problems.push(`${vp.name}: a second tap on the armed node dropped the arm`);
        if (takenNow().length !== 0) problems.push(`${vp.name}: a second tap sent the pick`);
        await press('[data-skill=scout-a1]');
        if (!(await page.locator('[data-skill=scout-a1][data-armed]').count()))
          problems.push(`${vp.name}: the arm did not move to the other node`);
        await press('[data-skill=scout-b1]');
        await press('[data-go]');
        await page.waitForTimeout(120);
        if (!(await page.locator('[data-skill=scout-b1].is-inked').count()))
          problems.push(`${vp.name}: the taken node did not ink`);
        await shotS('4-inked');
        await page.waitForTimeout(1000);
        if (takenNow().join() !== 'scout-b1')
          problems.push(`${vp.name}: the pick did not reach the server`);
        if ((await page.locator('[data-skill=scout-a1][data-state=closed]').count()) !== 1)
          problems.push(`${vp.name}: the other branch did not close`);
        if ((await page.locator('[data-skill=scout-b1][data-state=taken]').count()) !== 1)
          problems.push(`${vp.name}: the node is not drawn taken`);
        await shotS('5-closed-branch');

        // A tap on a closed, a locked (tier order) or a taken node shows a tip and never acts.
        for (const id of ['scout-a1', 'scout-a2', 'scout-b1']) {
          await press(`[data-skill=${id}]`);
          if (!(await page.locator('.tip').count()))
            problems.push(`${vp.name}: a tap on ${id} showed no tip`);
          if (id === 'scout-a1') await shotS('6-closed-tip');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }
        if (takenNow().length !== 1) problems.push(`${vp.name}: a tap on a closed node acted`);
        // Held on a closed and a taken node, the tip shows too.
        for (const id of ['scout-a1', 'scout-b1']) {
          if (!(await openTip(`[data-skill=${id}]`)))
            problems.push(`${vp.name}: no hold tip on ${id}`);
          await endTip();
          if (cdp0) await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }

        // Another role's tab: its first nodes only, open to you with the one pool of XP.
        await press('[data-tab=warden]');
        await page.waitForTimeout(250);
        if ((await page.locator('.skills-tree [data-skill]').count()) !== 2)
          problems.push(`${vp.name}: another role's tree is not its first nodes only`);
        if ((await page.locator('.skills-tree [data-skill][data-state=available]').count()) !== 2)
          problems.push(
            `${vp.name}: the warden's first nodes are not open to a scout with XP to spend`,
          );
        await shotS('7-other-tab');
        await press('[data-tab=keeper]');
        await page.waitForTimeout(250);
        if ((await page.locator('.skills-tree [data-skill][data-state=available]').count()) !== 2)
          problems.push(`${vp.name}: the keeper's first nodes are not open with XP to spend`);
        await press('[data-tab=scout]');

        // Closing the drawer: the emblem no longer glows (the warden pick still waits, so it does).
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if (await page.locator('[data-skills]').count())
          problems.push(`${vp.name}: the tree did not close`);
        if (!(await page.locator('.hud-skills[data-ready]').count()))
          problems.push(`${vp.name}: the emblem lost its glow with a pick still waiting`);
        await shotS('8-hud-after');
        // The scout-b1 glints: a hex on the map shows the glint (ring, glow, star), at the game's own zoom.
        if (!(await page.locator('[data-glint=star]').count()))
          problems.push(`${vp.name}: no glint on the map after taking the glints node`);
        await shotS('8b-glint');

        // The card of another character (Pip, riding) shows what they have taken, with a tip.
        await press('.hud-roster');
        await page.waitForSelector('.roster-row');
        await press('.roster-row:has-text("Pip")');
        await page.waitForSelector('[data-popover=character]');
        await page.waitForTimeout(400);
        if (!(await page.locator('[data-popover=character] [data-skill-taken=keeper-a1]').count()))
          problems.push(`${vp.name}: the character card does not show the taken node`);
        await shotS('9-card');
        await holdAll('character', 'character card (skills)');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Lost and replace: the drawer opens by itself; replacing starts a new character on the creature.
      fake.reset(lostScenario());
      await page.reload();
      await page.waitForSelector('.drawer .offer');
      await page.waitForTimeout(400);
      await shot('lost-replace');
      await press('.offer >> nth=1');
      await press('.role[data-role=keeper]');
      await press('.join-go');
      await page.waitForTimeout(500);
      const replaced = charOf(USERS.MISA);
      if (replaced?.status !== 'active' || replaced.at.kind !== 'creature')
        problems.push(`${vp.name}: replace did not start a new character on the creature`);

      // Back to the joined scenario for the drag and zoom measurements.
      fake.reset(joinedScenario());
      await page.reload();
      await page.waitForSelector('.map-world svg g');
      await page.waitForTimeout(400);

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
      // The view the map reports (it pans its world layer by a CSS transform).
      const before = await svg.getAttribute('data-view');
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 60; i += 1) await page.mouse.move(cx - i * 4, cy - i * 2);
      await page.mouse.up();
      if ((await svg.getAttribute('data-view')) === before)
        problems.push(`${vp.name}: drag did not pan`);
      const scaleBefore = await svg.getAttribute('data-view');
      // Mobile emulation sends no wheel events; the desktop run checks wheel zoom.
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(100);
      if (!vp.touch && (await svg.getAttribute('data-view')) === scaleBefore) {
        problems.push(`${vp.name}: wheel did not zoom`);
      }
      // No jump when a zoom settles: the world layer is redrawn at a new ink-zoom step, and known world
      // points (the creature's trodden footprint, your figure's cloak) must stay put on screen.
      if (!vp.touch) {
        await page.waitForTimeout(400);
        const marks = () =>
          page.evaluate(
            ({ trodden, cloak }) => {
              const box = (el) => {
                const r = el.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
              };
              const world = document.querySelector('.map-world svg');
              const foot = world.querySelector(`[fill="${trodden}"]`);
              const cloaks = [...world.querySelectorAll(`[fill="${cloak}"]`)].map(box);
              cloaks.sort((a, b) => b.w * b.h - a.w * a.h);
              return { width: world.getAttribute('width'), points: [box(foot), cloaks[0]] };
            },
            {
              trodden: SPRING.ramps.trodden.base,
              cloak: SPRING.accents[CLOAK].base,
            },
          );
        await page.mouse.move(cx, cy);
        // A zoom out by more than a half power of two always crosses an ink-zoom step.
        await page.mouse.wheel(0, 320);
        await page.waitForTimeout(60);
        const pre = await marks();
        await page.waitForTimeout(700);
        const post = await marks();
        if (pre.width === post.width) problems.push(`${vp.name}: no redraw after the zoom settled`);
        pre.points.forEach((a, i) => {
          const b = post.points[i];
          const moved = Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.w - b.w),
            Math.abs(a.h - b.h),
          );
          if (!(moved <= 1))
            problems.push(`${vp.name}: point ${i} jumped ${moved.toFixed(2)} px at a zoom settle`);
        });
        report.push(
          `${vp.name}: zoom settle redraw, largest shift ${Math.max(
            ...pre.points.map((a, i) => Math.hypot(a.x - post.points[i].x, a.y - post.points[i].y)),
          ).toFixed(2)} px`,
        );
      }
      const frames = await page.evaluate(() => window.__frames.slice(2));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const sorted = [...frames].sort((a, b) => a - b);
      const pct = (q) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]?.toFixed(1);
      report.push(
        `${vp.name}: drag at 4x CPU slowdown, ${frames.length} frames, median ${pct(0.5)} ms, p95 ${pct(0.95)} ms`,
      );
      const nodes = await page.evaluate(() => document.querySelectorAll('.map-root svg *').length);
      report.push(`${vp.name}: ${nodes} SVG elements in the map`);
      await context.close();
    }
  } catch (e) {
    // Report what was found before the run broke off.
    if (problems.length) console.error(problems.join('\n'));
    throw e;
  } finally {
    await browser.close();
    server.close();
    vite.stop();
  }
  for (const line of report) console.log(line);
  if (m5Shots.length) await contactSheet(m5Shots, join(out, 'm5-sheet.png'));
  console.log(`Screenshots in ${out}`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

/** One page of the Milestone 5 screenshots side by side, phones and desktops apart, for review. */
async function contactSheet(files, path) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    // The images load from the screenshots folder (inlining them all would exhaust the page).
    const cell = (f) => `<figure><img src="${f}"><figcaption>${f}</figcaption></figure>`;
    const group = (kind) =>
      files
        .filter((f) => f.includes(`-${kind}-`))
        .map(cell)
        .join('');
    const html = join(out, 'm5-sheet.html');
    writeFileSync(
      html,
      `<!doctype html><body style="margin:12px;font:12px system-ui;background:#eee">` +
        `<div style="display:flex;flex-wrap:wrap;gap:10px">${group('phone')}</div>` +
        `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">${group('desktop')}</div>` +
        `<style>figure{margin:0}img{display:block;height:300px}</style></body>`,
    );
    await page.goto(`file://${html}`);
    await page.waitForLoadState('load');
    await page.screenshot({ path, fullPage: true });
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
