/* global Response */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APP_HANDLER,
  EMBEDDED_FLAG,
  allowedGuildsOf,
  discordStatus,
  createDiscord,
  endpointFor,
  parseArgs,
  readPublicKey,
  setEntryPointHandler,
} from './discord-app.mjs';

const EXPECTED = 'https://game.example/api/discord/interactions';
const APP_ID = '123456789012345678';
const KEY = 'ab'.repeat(32);

/** A fake fetch answering by "METHOD path"; records each call. */
function fakeFetch(routes) {
  const calls = [];
  const doFetch = async (url, init = {}) => {
    const route = `${init.method ?? 'GET'} ${url.replace('https://discord.com/api/v10', '')}`;
    calls.push({ route, init });
    const answer = routes[route];
    if (answer === undefined) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
  };
  return { calls, doFetch };
}

const app = (extra = {}) => ({
  'GET /applications/@me': {
    body: { id: APP_ID, verify_key: KEY, interactions_endpoint_url: EXPECTED, ...extra },
  },
});

describe('parseArgs', () => {
  it('takes a mode and a target', () => {
    assert.deepEqual(parseArgs(['public-key', 'staging']), {
      mode: 'public-key',
      target: 'staging',
    });
    assert.deepEqual(parseArgs(['register', 'production']), {
      mode: 'register',
      target: 'production',
    });
    for (const bad of [[], ['public-key'], ['nope', 'staging'], ['register', 'local']]) {
      assert.ok('error' in parseArgs(bad));
    }
  });
});

describe('endpointFor', () => {
  it('builds the interactions URL from project.config.json', () => {
    const config = { environments: { staging: { url: 'https://game.example' } } };
    assert.equal(endpointFor(config, 'staging'), EXPECTED);
    assert.throws(() => endpointFor(config, 'production'));
    assert.throws(() => endpointFor({ environments: { staging: { url: 'http://x' } } }, 'staging'));
  });
});

describe('readPublicKey', () => {
  it('returns the key and sends the bot token only to Discord', async () => {
    const { calls, doFetch } = fakeFetch(app());
    const warnings = [];
    assert.equal(
      await readPublicKey(createDiscord('tok', doFetch), EXPECTED, (w) => warnings.push(w)),
      KEY,
    );
    assert.deepEqual(warnings, []);
    assert.equal(calls[0].init.headers.Authorization, 'Bot tok');
  });

  it('warns about another endpoint URL and refuses a key of the wrong shape', async () => {
    const warnings = [];
    const other = fakeFetch(app({ interactions_endpoint_url: 'https://elsewhere' }));
    await readPublicKey(createDiscord('t', other.doFetch), EXPECTED, (w) => warnings.push(w));
    assert.equal(warnings.length, 1);
    const bad = fakeFetch(app({ verify_key: 'xyz' }));
    await assert.rejects(readPublicKey(createDiscord('t', bad.doFetch), EXPECTED, () => {}));
  });
});

describe('setEntryPointHandler', () => {
  const commands = (handler) => ({
    [`GET /applications/${APP_ID}/commands`]: {
      body: [
        { id: '223456789012345678', type: 4, handler },
        { id: '323456789012345678', type: 1 },
      ],
    },
    [`PATCH /applications/${APP_ID}/commands/223456789012345678`]: { body: {} },
  });

  it('points Launch at our endpoint once', async () => {
    const { calls, doFetch } = fakeFetch({ ...app(), ...commands(2) });
    assert.equal(
      await setEntryPointHandler(createDiscord('t', doFetch), EXPECTED, () => {}),
      'set',
    );
    const patch = calls.find((c) => c.route.startsWith('PATCH'));
    assert.deepEqual(JSON.parse(patch.init.body), { handler: APP_HANDLER });
    const again = fakeFetch({ ...app(), ...commands(APP_HANDLER) });
    assert.equal(
      await setEntryPointHandler(createDiscord('t', again.doFetch), EXPECTED, () => {}),
      'unchanged',
    );
  });

  it('leaves Launch alone while the endpoint URL is not ours, and warns without Activities', async () => {
    const warnings = [];
    const other = fakeFetch({ ...app({ interactions_endpoint_url: null }), ...commands(2) });
    assert.equal(
      await setEntryPointHandler(createDiscord('t', other.doFetch), EXPECTED, (w) =>
        warnings.push(w),
      ),
      'skipped',
    );
    assert.ok(!other.calls.some((c) => c.route.startsWith('PATCH')));
    const none = fakeFetch({ ...app(), [`GET /applications/${APP_ID}/commands`]: { body: [] } });
    assert.equal(
      await setEntryPointHandler(createDiscord('t', none.doFetch), EXPECTED, (w) =>
        warnings.push(w),
      ),
      'missing',
    );
    assert.equal(warnings.length, 2);
  });
});

describe('discordStatus', () => {
  const ALLOWED = '215386000132669440';
  const status = (appExtra, guilds, commands) => {
    const { doFetch } = fakeFetch({
      'GET /applications/@me': {
        body: {
          id: APP_ID,
          name: 'Behemoth Road (staging)',
          verify_key: KEY,
          flags: EMBEDDED_FLAG,
          bot_public: true,
          integration_types_config: { 0: {}, 1: {} },
          ...appExtra,
        },
      },
      'GET /users/@me/guilds?limit=200': guilds,
      [`GET /applications/${APP_ID}/commands`]: commands,
    });
    return discordStatus(createDiscord('secret-token', doFetch), [ALLOWED]);
  };
  const entry = (extra = {}) => ({
    body: [
      {
        id: '223456789012345678',
        type: 4,
        handler: 1,
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        ...extra,
      },
    ],
  });

  it('reports a healthy app with notices only, and no secret', async () => {
    const { notices, warnings } = await status(
      {},
      { body: [{ id: ALLOWED }, { id: '1'.repeat(18) }] },
      entry(),
    );
    assert.deepEqual(warnings, []);
    const text = notices.join('\n');
    assert.match(
      text,
      /Activities \(EMBEDDED\) on; installs: guild install, user install; public bot: yes/,
    );
    assert.match(text, /bot is in 2 server/);
    assert.match(text, new RegExp(`allowed server ${ALLOWED}: bot is a member`));
    assert.match(
      text,
      /entry point command: present, type 4, handler 1, installs: guild install, user install, contexts: guilds, bot DMs, private channels/,
    );
    assert.ok(!text.includes('secret-token') && !text.includes(KEY));
  });

  it('warns on a missing EMBEDDED flag, a missing server, a missing or server-less entry point', async () => {
    const a = await status({ flags: 0 }, { body: [] }, { body: [] });
    assert.equal(a.warnings.length, 3);
    assert.match(a.warnings.join('\n'), /EMBEDDED/);
    assert.match(a.warnings.join('\n'), /not in allowed server/);
    assert.match(a.warnings.join('\n'), /no entry point command/);
    const b = await status({}, { body: [{ id: ALLOWED }] }, entry({ contexts: [1] }));
    assert.deepEqual(b.warnings.length, 1);
    assert.match(b.warnings[0], /contexts lack guilds/);
  });

  it('turns failed lookups into warnings', async () => {
    const c = await status({}, { status: 403 }, { status: 500 });
    assert.equal(c.warnings.length, 2);
  });
});

describe('allowedGuildsOf', () => {
  it('reads the target env list, snowflakes only', () => {
    const wrangler = { env: { staging: { vars: { ALLOWED_GUILDS: '215386000132669440, x' } } } };
    assert.deepEqual(allowedGuildsOf(wrangler, 'staging'), ['215386000132669440']);
    assert.deepEqual(allowedGuildsOf(wrangler, 'production'), []);
  });
});
