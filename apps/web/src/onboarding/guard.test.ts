/**
 * The practice map must never send a request, open a socket or mix with the real game. Held two ways: the
 * practice modules may not import or call anything that talks to a server (read from their source), and
 * a whole practice day run with every browser channel out trapped makes no call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSandbox } from './sandboxApi.ts';
import { sandboxState, SANDBOX_USERS } from './sandbox.ts';
import { characterOf } from '@behemoth-road/core';

/** The practice modules' source, as text. */
const sources = import.meta.glob<string>(['./sandbox.ts', './sandboxApi.ts', './coach.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const PRACTICE_MODULES = Object.keys(sources);

/** What a module may not mention: ways to reach a server, and the modules that do. */
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /sendBeacon/,
  /createApiClient/,
  /createLiveSocket/,
  /live-socket/,
  /api\/sync/,
  /api\/reauth/,
  /localStorage|sessionStorage|indexedDB/,
];

describe('the practice map stays in the browser', () => {
  for (const file of PRACTICE_MODULES) {
    it(`${file} imports and calls nothing that reaches a server or a store`, () => {
      const source = sources[file] ?? '';
      expect(source.length).toBeGreaterThan(100);
      // Comments may name what they forbid.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const pattern of FORBIDDEN) expect(code, String(pattern)).not.toMatch(pattern);
    });
  }

  it('imports from the API layer only its error and its types', () => {
    expect(PRACTICE_MODULES).toHaveLength(3);
    const source = sources['./sandboxApi.ts'] ?? '';
    const imports = [...source.matchAll(/import\s+([^;]+?)\s+from\s+'(\.\.\/api\/[^']+)'/g)];
    for (const [, what, from] of imports) {
      if (from === '../api/client.ts') expect(what).toBe('{ ApiError, type ApiClient }');
      else expect(what).toMatch(/^type /);
    }
  });

  const real = {
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket,
    XMLHttpRequest: globalThis.XMLHttpRequest,
  };
  afterEach(() => {
    globalThis.fetch = real.fetch;
    globalThis.WebSocket = real.WebSocket;
    globalThis.XMLHttpRequest = real.XMLHttpRequest;
    vi.restoreAllMocks();
  });

  it('makes no request and opens no socket across a whole practice day', async () => {
    const calls: string[] = [];
    const trap = (name: string) => () => {
      calls.push(name);
      throw new Error(`${name} used by the practice map`);
    };
    globalThis.fetch = trap('fetch');
    globalThis.WebSocket = trap('WebSocket') as never;
    globalThis.XMLHttpRequest = trap('XMLHttpRequest') as never;
    const sandbox = createSandbox('scout');
    const view = await sandbox.api.game();
    if ('unchanged' in view) throw new Error('unchanged');
    const id = view.you.characterId ?? '';
    expect(id).not.toBe('');
    // Everything the map UI can ask of its API.
    const c = view.game.creature.centre;
    const moved = await sandbox.api.move(view.version, [
      { kind: 'hex', hex: { q: c.q + 0, r: c.r + 3 } },
    ]);
    await sandbox.api.act(moved.version, {
      kind: 'survey',
      hex: { q: c.q + 1, r: c.r + 3 },
    });
    await sandbox.api.markSeen(['intro']);
    await sandbox.api.visit();
    await sandbox.api.game(moved.version);
    // What a server has and the practice does not: each refuses instead of reaching out.
    for (const call of [
      () => sandbox.api.liveTicket(),
      () => sandbox.api.join('scout', 0),
      () => sandbox.api.replace('scout', 0),
      () => sandbox.api.nextDay(),
      () => sandbox.api.setPace('fast'),
      () => sandbox.api.newSeason(),
      () => sandbox.api.signIn('code', 'instance'),
      () => sandbox.api.config(),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    expect(sandbox.api.liveEnabled()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not touch the real game: its own state, its own ids', () => {
    const state = sandboxState('scout');
    for (const c of state.characters) expect(c.userId).toMatch(/^9000000000000000\d\d$/);
    expect(characterOf(state, SANDBOX_USERS.you)).toBeDefined();
  });
});
