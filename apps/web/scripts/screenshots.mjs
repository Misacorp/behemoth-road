#!/usr/bin/env node
/* global URL, console, process, window, document, performance, requestAnimationFrame, MouseEvent, setTimeout */
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
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

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
const { act, characterOf, hexDistance, hexesInRange, moveAlong, nextDayWithEvents } =
  await import('../../../packages/core/src/index.ts');
const {
  CHAIN_SPOTS,
  chainScenario,
  characterIdOf,
  CONFIG,
  joinScenario,
  joinedScenario,
  lostScenario,
  notJoinedScenario,
  SESSION,
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

/** A fake game server on the real core: it holds a scenario and answers the API like the Worker. */
class FakeServer {
  constructor() {
    this.scenario = notJoinedScenario();
    this.log = [];
    this.reads = [];
  }

  reset(scenario) {
    this.scenario = scenario;
    this.log = [];
    this.reads = [];
  }

  /** Answers one request: [status, body]. */
  answer(method, path, body) {
    const s = this.scenario;
    // Like the Worker: each change's events are logged with its version; a move or an action answers its
    // own, and a read with `since` answers every logged one after it.
    const ok = (next, events = []) => {
      if (next) this.scenario = { ...next, version: next.version ?? s.version + 1 };
      const stamped = events.map((e) => ({ ...e, version: this.scenario.version }));
      this.log.push(...stamped);
      return [200, { ...toView(this.scenario), events: stamped }];
    };
    if (path === '/api/config') return [200, CONFIG];
    if (path === '/api/dev/login') return [200, SESSION];
    if (method === 'GET' && path === '/api/game') {
      const since = Number(new URL(`http://x${this.lastUrl}`).searchParams.get('since') ?? NaN);
      if (since === s.version) return [200, { unchanged: true }];
      const events = Number.isNaN(since) ? [] : this.log.filter((e) => e.version > since);
      return [200, { ...toView(s), events }];
    }
    if (path === '/api/game/join' || path === '/api/game/replace') {
      const base =
        path === '/api/game/replace'
          ? {
              ...s,
              state: { ...s.state, characters: s.state.characters.filter((c) => c.id !== s.you) },
            }
          : s;
      return ok(joinScenario(base, body.role, body.offer));
    }
    if (path === '/api/game/move') {
      if (body.version !== s.version) return [409, { error: 'stale' }];
      const result = moveAlong(s.state, characterOf(s.state, s.you)?.id ?? '', body.path);
      if (!result.ok) return [409, { error: result.reason }];
      return ok({ ...s, state: result.state, version: s.version + 1 }, result.events);
    }
    if (path === '/api/game/act') {
      if (body.version !== s.version) return [409, { error: 'stale' }];
      const result = act(s.state, characterOf(s.state, s.you)?.id ?? '', body.action);
      if (!result.ok) return [409, { error: result.reason }];
      return ok({ ...s, state: result.state, version: s.version + 1 }, result.events);
    }
    if (path === '/api/dev/next-day') {
      // Like the Worker, the tick answers the view alone; its events wait in the log.
      const ticked = nextDayWithEvents(s.state);
      ok({ ...s, state: ticked.state, version: s.version + 1 }, ticked.events);
      return [200, toView(this.scenario)];
    }
    return [404, { error: 'not_found' }];
  }

  async route(route) {
    const req = route.request();
    const url = new URL(req.url());
    this.lastUrl = `${url.pathname}${url.search}`;
    if (req.method() === 'GET' && url.pathname === '/api/game') this.reads.push(url.search);
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const [status, payload] = this.answer(req.method(), url.pathname, body);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  }
}

/** Starts the Vite dev server on a free port and resolves with its URL. */
function startVite() {
  return new Promise((ok, fail) => {
    const vite = spawn(
      join(web, 'node_modules/.bin/vite'),
      ['--port', '5199', '--strictPort', '--host', '127.0.0.1'],
      {
        cwd: web,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let text = '';
    const onData = (d) => {
      text += String(d);
      if (/Local:\s+http/.test(text))
        ok({ url: 'http://127.0.0.1:5199/', stop: () => vite.kill() });
    };
    vite.stdout.on('data', onData);
    vite.stderr.on('data', onData);
    vite.on('exit', (code) => fail(new Error(`vite exited (${code}): ${text}`)));
  });
}

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

      // Join: the drawer opens by itself. Phones step through the wizard; desktop shows it all.
      await page.goto(vite.url);
      await page.waitForSelector('.drawer .offer');
      await page.waitForTimeout(400);
      await shot('join-1-characters');
      // A trait icon names itself on a tap, without picking the card.
      const shotP = (name) => page.screenshot({ path: join(out, `polish-${vp.name}-${name}.png`) });
      await page.locator('.offer .named').first().click();
      await page.waitForTimeout(150);
      if (!(await page.locator('.offer .name-tip').count()))
        problems.push(`${vp.name}: a trait icon does not show its name`);
      if (await page.locator('.offer[aria-selected=true]').count())
        problems.push(`${vp.name}: tapping a trait icon picked the card`);
      await shotP('02-name-trait');
      await press('.offer >> nth=0');
      if (vp.touch) await shot('join-2-role');
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
      // The card's role emblem names its role on a tap.
      await page.locator('[data-popover=character] [data-name]').first().click();
      await page.waitForTimeout(150);
      if (!(await page.locator('[data-popover=character] text[data-label]').count()))
        problems.push(`${vp.name}: the card's role emblem does not show its name`);
      await shotP('02-name-card');
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

      // Next day (dev tools and admin): the server ticks and the map follows the creature.
      await press('[aria-label="Next day"]');
      await page.waitForTimeout(700);
      if (fake.scenario.state.day !== 2)
        problems.push(`${vp.name}: next day did not reach the server`);
      await shot('next-day');

      // The hub entry opens the creature card; right-click (desktop) and Escape close.
      const [q1, r1] = await creature();
      await tap(...(await hexOnScreen(q1, r1)));
      await press('[data-popover=bubble] [aria-label=Behemoth]');
      if (!(await has('creature'))) problems.push(`${vp.name}: no creature card`);
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
        await shot3('01-survey-offer');
        await press('[data-popover=inspect] [data-action=survey]');
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
        await shot3('03-here-gather');
        await press('[data-popover=here] [data-action=gather]');
        await page.waitForTimeout(300);
        if (!(charOf(USERS.MISA)?.pack.iron > 0))
          problems.push(`${vp.name}: gather did not fill the pack`);
        await idle();
        await press('.hud-pack');
        await page.waitForTimeout(200);
        if (!(await page.locator('.hud-pack-contents [data-item=iron]').count()))
          problems.push(`${vp.name}: the pack does not show the iron`);
        await shot3('04-pack');
        await press('.hud-pack-contents');

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

        // A scholar enters the tomb (it is revealed) and works it: the find rises into the pack.
        await stage({ role: 'scholar', day: SCHOLAR_DAY });
        await walkTo('tomb');
        await settle();
        await openHere();
        if (!(await page.locator('[data-popover=here] [data-action=work-site]').count()))
          problems.push(`${vp.name}: no work-site on the tomb`);
        await shot3('10-here-site');
        await press('[data-popover=here] [data-action=work-site]');
        await page.waitForTimeout(450);
        await expectMoment('find');
        await shot3('11-find');
        await settle();

        // Anyone entering a hidden trap springs it: the snap, and your pips go dark.
        await stage({ role: 'guardian' });
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
        await press('[data-popover=here] [data-action=light-fire]');
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
        await stage({ role: 'keeper', satiety: 2, cues: [cueAt], fires: [cueAt.at] });
        await shot4('04-keeper-signs');
        // Anyone else sees the same hunger only faintly, and no cue.
        await stage({ role: 'scout', satiety: 2, cues: [cueAt], fires: [cueAt.at] });
        await shot4('05-faint-sign');

        // A keeper riding: the hub offers feeding (the forage it takes) and lingering, each with pips.
        await stage({ role: 'keeper', at: 'creature', stores: { forage: 2, timber: 1 } });
        await openHub();
        if ((await page.locator('.drawer [data-care]').count()) !== 2)
          problems.push(`${vp.name}: the hub does not offer feed and linger to a keeper`);
        await shot4('06-hub-care');
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
        await stage({ role: 'keeper', at: 'creature', satiety: 2 });
        {
          const c = fake.scenario.state.creature.centre;
          await idle();
          await tap(...(await hexOnScreen(c.q, c.r)));
        }
        if (!(await page.locator('[data-popover=bubble] [data-appetite]').count()))
          problems.push(`${vp.name}: no appetite badge on the bubble`);
        await shot4('13-bubble-badge');
        await idle();
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
  } finally {
    await browser.close();
    server.close();
    vite.stop();
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
