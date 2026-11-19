import { beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../src/index.ts';
import { GUILD_ID, ORIGIN, STRANGER_GUILD_ID, callHandler } from './helpers.ts';

const NOW = Date.UTC(2030, 0, 1);
const handler = createHandler({ now: () => NOW });

interface Keys {
  privateKey: CryptoKey;
  publicHex: string;
}

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function makeKeys(): Promise<Keys> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer;
  return { privateKey: pair.privateKey, publicHex: toHex(raw) };
}

interface Send {
  body: string;
  keys: Keys;
  timestamp?: string;
  signedBody?: string;
  signature?: string | null;
  method?: string;
}

async function interact(send: Send, publicKey: string): Promise<Response> {
  const timestamp = send.timestamp ?? String(Math.floor(NOW / 1000));
  const signed = await crypto.subtle.sign(
    'Ed25519',
    send.keys.privateKey,
    new TextEncoder().encode(timestamp + (send.signedBody ?? send.body)),
  );
  const signature = send.signature === undefined ? toHex(signed) : send.signature;
  const headers: Record<string, string> = { 'X-Signature-Timestamp': timestamp };
  if (signature !== null) headers['X-Signature-Ed25519'] = signature;
  const method = send.method ?? 'POST';
  return callHandler(
    handler,
    new Request(`${ORIGIN}/api/discord/interactions`, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: send.body }),
    }),
    { DISCORD_PUBLIC_KEY: publicKey },
  );
}

let keys: Keys;
let other: Keys;
beforeAll(async () => {
  keys = await makeKeys();
  other = await makeKeys();
});

const PING = JSON.stringify({ type: 1 });

describe('POST /api/discord/interactions', () => {
  it('is a 404 without a usable public key', async () => {
    for (const key of ['', 'abc', 'z'.repeat(64)]) {
      expect((await interact({ keys, body: PING }, key)).status).toBe(404);
    }
  });

  it('answers a signed PING with a PONG, and only takes POST', async () => {
    const res = await interact({ keys, body: PING }, keys.publicHex);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
    expect((await interact({ keys, body: PING, method: 'GET' }, keys.publicHex)).status).toBe(405);
  });

  it('rejects a missing, malformed, wrong or stale signature with 401', async () => {
    for (const send of [
      { signature: null },
      { signature: 'not hex' },
      { signature: '00'.repeat(64) },
      { signedBody: JSON.stringify({ type: 2 }) },
      { timestamp: String(Math.floor(NOW / 1000) - 6 * 60) },
      { timestamp: String(Math.floor(NOW / 1000) + 6 * 60) },
    ]) {
      expect((await interact({ keys, body: PING, ...send }, keys.publicHex)).status).toBe(401);
    }
    expect((await interact({ keys: other, body: PING }, keys.publicHex)).status).toBe(401);
  });

  it('answers 413 to a body over 64 KiB and 400 to an unknown type', async () => {
    const big = JSON.stringify({ type: 1, pad: 'x'.repeat(70_000) });
    expect((await interact({ keys, body: big }, keys.publicHex)).status).toBe(413);
    for (const body of ['{"type":3}', '{}', '[1]', 'nope', '{"type":2}']) {
      expect((await interact({ keys, body }, keys.publicHex)).status).toBe(400);
    }
  });

  it('launches the Activity from the entry point command and answers others privately', async () => {
    for (const body of [
      { type: 2, guild_id: GUILD_ID, data: { name: 'launch', type: 4 } },
      { type: 2, guild_id: GUILD_ID, data: { name: 'launch' } },
    ]) {
      const res = await interact({ keys, body: JSON.stringify(body) }, keys.publicHex);
      expect(await res.json()).toEqual({ type: 12 });
    }
    const other = await interact(
      { keys, body: JSON.stringify({ type: 2, guild_id: GUILD_ID, data: { name: 'feedback' } }) },
      keys.publicHex,
    );
    expect(await other.json()).toEqual({
      type: 4,
      data: {
        content: "That command isn't available here.",
        flags: 64,
        allowed_mentions: { parse: [] },
      },
    });
  });

  it('answers Launch privately outside an allowed server: another server, a DM, a user install', async () => {
    const unavailable = {
      type: 4,
      data: {
        content: "That command isn't available here.",
        flags: 64,
        allowed_mentions: { parse: [] },
      },
    };
    for (const body of [
      { type: 2, guild_id: STRANGER_GUILD_ID, data: { name: 'launch', type: 4 } },
      { type: 2, data: { name: 'launch', type: 4 } },
    ]) {
      const res = await interact({ keys, body: JSON.stringify(body) }, keys.publicHex);
      expect(await res.json()).toEqual(unavailable);
    }
  });
});
