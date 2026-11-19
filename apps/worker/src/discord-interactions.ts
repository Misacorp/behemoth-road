/**
 * `POST /api/discord/interactions`: Discord's interactions endpoint, used only for the Activity's entry
 * point command (Launch), as in creatures.
 *
 * - Every request must carry a valid Ed25519 signature (`X-Signature-Ed25519` over
 *   `X-Signature-Timestamp` plus the raw body) made with the app's public key. A missing or bad
 *   signature, or a timestamp more than 5 minutes from now, is a 401 before any JSON is parsed.
 * - With no public key configured (`DISCORD_PUBLIC_KEY` empty or not 64 hex characters) the route is a 404.
 * - The body is capped at 64 KiB. Discord's payloads are parsed loosely (Discord adds fields), but every
 *   field that is read is checked.
 * - The entry point command is answered with LAUNCH_ACTIVITY, which opens the Activity and posts nothing,
 *   but only in a server on the allowlist (`ALLOWED_GUILDS`); anywhere else it gets a private reply.
 */
import * as v from 'valibot';
import {
  errorResponse,
  json,
  methodNotAllowed,
  notFound,
  parseJsonObject,
  readLimitedText,
} from './http.ts';
import { allowedGuilds } from './allowlist.ts';
import { SNOWFLAKE_RE } from './schemas.ts';

export const INTERACTIONS_PATH = '/api/discord/interactions';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const PUBLIC_KEY_RE = /^[0-9a-f]{64}$/i;
const SIGNATURE_RE = /^[0-9a-f]{128}$/i;
const TIMESTAMP_RE = /^\d{1,12}$/;

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG_RESPONSE = 1;
const MESSAGE_RESPONSE = 4;
const LAUNCH_ACTIVITY_RESPONSE = 12;
/** Application command type of the Activity's entry point command (PRIMARY_ENTRY_POINT). */
const PRIMARY_ENTRY_POINT = 4;
const LAUNCH_COMMAND = 'launch';
const EPHEMERAL = 64;

export interface InteractionDeps {
  now(): number;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

let cachedPublicKey: { hex: string; key: Promise<CryptoKey> } | null = null;

function importPublicKey(hex: string): Promise<CryptoKey> {
  if (cachedPublicKey?.hex === hex) return cachedPublicKey.key;
  const key = crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'Ed25519' }, false, [
    'verify',
  ]);
  const entry = { hex, key };
  cachedPublicKey = entry;
  key.catch(() => {
    if (cachedPublicKey === entry) cachedPublicKey = null;
  });
  return key;
}

async function signatureValid(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicKeyHex);
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

const TypeOnlySchema = v.object({ type: v.pipe(v.number(), v.integer()) });

const CommandSchema = v.object({
  guild_id: v.optional(v.pipe(v.string(), v.regex(SNOWFLAKE_RE))),
  data: v.object({
    name: v.pipe(v.string(), v.maxLength(64)),
    type: v.optional(v.pipe(v.number(), v.integer())),
  }),
});

const unavailable = (): Response =>
  json({
    type: MESSAGE_RESPONSE,
    data: {
      content: "That command isn't available here.",
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });

function handleCommand(payload: unknown, allowed: ReadonlySet<string>): Response {
  const parsed = v.safeParse(CommandSchema, payload);
  if (!parsed.success) return errorResponse('invalid_interaction', 400);
  const { data, guild_id: guildId } = parsed.output;
  // Only an allowed server can play; a DM, a user install or another server gets the private reply.
  if (guildId === undefined || !allowed.has(guildId)) return unavailable();
  if (data.type === PRIMARY_ENTRY_POINT || data.name === LAUNCH_COMMAND) {
    return json({ type: LAUNCH_ACTIVITY_RESPONSE });
  }
  return unavailable();
}

export async function handleInteraction(
  request: Request,
  env: Env,
  deps: InteractionDeps,
): Promise<Response> {
  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (typeof publicKey !== 'string' || !PUBLIC_KEY_RE.test(publicKey)) return notFound();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (
    signature === null ||
    timestamp === null ||
    !SIGNATURE_RE.test(signature) ||
    !TIMESTAMP_RE.test(timestamp) ||
    Math.abs(Number(timestamp) * 1000 - deps.now()) > MAX_TIMESTAMP_SKEW_MS
  ) {
    return errorResponse('invalid_signature', 401);
  }
  const body = await readLimitedText(request, MAX_BODY_BYTES);
  if (body === null) return errorResponse('payload_too_large', 413);
  if (!(await signatureValid(publicKey, signature, timestamp, body))) {
    return errorResponse('invalid_signature', 401);
  }

  const payload = parseJsonObject(body);
  const kind = v.safeParse(TypeOnlySchema, payload);
  if (!kind.success) return errorResponse('invalid_interaction', 400);
  switch (kind.output.type) {
    case PING:
      return json({ type: PONG_RESPONSE });
    case APPLICATION_COMMAND:
      return handleCommand(payload, allowedGuilds(env.ALLOWED_GUILDS));
    default:
      return errorResponse('invalid_interaction', 400);
  }
}
