/* global URL, process */
/**
 * Shared set-up for the browser scripts (screenshots.mjs, perf.mjs): a static server for the built app with
 * the headers from public/_headers, the Vite dev server (its fake session stands in for Discord), and a fake
 * game server that runs the real core on the hand-written fixtures and answers /api like the Worker.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The core and the fixtures are TypeScript; Node runs them with its type transform. Re-run the calling
// script with the flag when it is missing.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(res.status ?? 1);
}
const { act, characterOf, moveAlong, nextDayWithEvents } =
  await import('../../../packages/core/src/index.ts');
const {
  CONFIG,
  joinedScenario,
  joinScenario,
  newSeasonScenario,
  notJoinedScenario,
  SESSION,
  toView,
} = await import('../src/api/fixtures.ts');

export { joinedScenario };

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** Headers for every path from public/_headers (only the `/*` block is used). */
export function readHeaders() {
  const headers = {};
  for (const line of readFileSync(join(web, 'public/_headers'), 'utf8').split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) headers[m[1]] = m[2].trim();
  }
  return headers;
}

export function serve() {
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
export class FakeServer {
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
    if (path === '/api/dev/new-season') {
      if (this.failNewSeason) {
        this.failNewSeason = false;
        return [500, { error: 'internal' }];
      }
      // Like the Worker: a new game with a new seed; the client reads its view afterwards.
      this.reset(newSeasonScenario());
      return [200, { ok: true }];
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
export function startVite() {
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
