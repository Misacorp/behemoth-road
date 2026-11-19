#!/usr/bin/env node
/* global URL, console, process, window, document, performance, requestAnimationFrame, MouseEvent */
/**
 * Screenshots and browser checks for the web client, written to screenshots/ at the repo root (gitignored).
 *
 * 1. The built app (apps/web/dist), served with the headers from public/_headers so a CSP violation fails
 *    the run: outside Discord it shows only the "open from Discord" state, and its assets carry no trace of
 *    the local-development sign-in.
 * 2. The Vite dev server (its fake session stands in for Discord) at a phone and a desktop size, with every
 *    /api call answered by a fake server that runs the real core on the hand-written fixtures: the join
 *    wizard, two players on the creature, another player's card, moves, the hub, next day, the grace day,
 *    replacing a lost character, and frame times during a drag with the CPU slowed 4x.
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
const { characterOf, moveAlong, nextDay } = await import('../../../packages/core/src/index.ts');
const {
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
  }

  reset(scenario) {
    this.scenario = scenario;
  }

  /** Answers one request: [status, body]. */
  answer(method, path, body) {
    const s = this.scenario;
    const ok = (next) => {
      if (next) this.scenario = { ...next, version: next.version ?? s.version + 1 };
      return [200, toView(this.scenario)];
    };
    if (path === '/api/config') return [200, CONFIG];
    if (path === '/api/dev/session') return [200, SESSION];
    if (method === 'GET' && path === '/api/game') {
      const since = Number(new URL(`http://x${this.lastUrl}`).searchParams.get('since') ?? NaN);
      return since === s.version ? [200, { unchanged: true }] : ok(null);
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
      return ok({ ...s, state: result.state, version: s.version + 1 });
    }
    if (path === '/api/dev/next-day') {
      return ok({ ...s, state: nextDay(s.state), version: s.version + 1 });
    }
    return [404, { error: 'not_found' }];
  }

  async route(route) {
    const req = route.request();
    const url = new URL(req.url());
    this.lastUrl = `${url.pathname}${url.search}`;
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
      await context.close();
      for (const file of readdirSync(join(dist, 'assets'))) {
        const text = readFileSync(join(dist, 'assets', file), 'utf8');
        if (text.includes('/api/dev/session'))
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
