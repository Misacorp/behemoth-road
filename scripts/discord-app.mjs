// Deploy-time Discord setup, run by the deploy job with plain `node` and the target environment's
// DISCORD_BOT_TOKEN (adapted from creatures' apps/worker/scripts/discord-app.mjs):
//
//   node scripts/discord-app.mjs public-key <production|staging>
//     Reads the app's public key (`verify_key`, not a secret) and writes `public_key=<hex>` to
//     $GITHUB_OUTPUT, so the Worker can check interaction signatures. Warns when the app's
//     Interactions Endpoint URL is not this game's.
//   node scripts/discord-app.mjs status <production|staging>
//     Prints non-secret facts about the app as ::notice lines (Activities flag, install types, public bot,
//     the bot's membership of each ALLOWED_GUILDS server, the entry point command) and warns on problems.
//   node scripts/discord-app.mjs register <production|staging>
//     Sets the handler of the Activity's entry point command (Launch) to APP_HANDLER, so Launch reaches
//     our interactions endpoint and opens the Activity without posting a "game invitation" card. Only
//     while the Interactions Endpoint URL is this game's; otherwise Launch keeps Discord's handler.
//
// Every failure is a warning and exit code 0: the game is already deployed, and Discord setup must
// never fail a deploy. The bot token is only sent to discord.com and never printed. The host comes from
// project.config.json, the one place it is written besides wrangler.jsonc.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 15_000;
/** 1: Discord sends Launch to our endpoint (no channel message). 2 is Discord's default, which posts a card. */
export const APP_HANDLER = 1;
const PRIMARY_ENTRY_POINT = 4;
const SNOWFLAKE = /^\d{15,22}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `{ mode, target }` from the arguments, or an error message. */
export function parseArgs(argv) {
  const [mode, target] = argv;
  if (
    !['public-key', 'register', 'status'].includes(mode) ||
    (target !== 'production' && target !== 'staging')
  ) {
    return { error: 'usage: discord-app.mjs <public-key|register|status> <production|staging>' };
  }
  return { mode, target };
}

/** The interactions URL Discord should have for the target, from project.config.json's `url`. */
export function endpointFor(config, target) {
  const url = config?.environments?.[target]?.url;
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(url)) {
    throw new Error(`project.config.json has no plain https url for ${target}`);
  }
  return `${url}/api/discord/interactions`;
}

export function createDiscord(token, doFetch = fetch) {
  const call = (route, init = {}) =>
    doFetch(`${API}${route}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'DiscordBot (https://github.com/Misacorp/behemoth-road, 1)',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  async function currentApp() {
    const res = await call('/applications/@me');
    if (!res.ok) throw new Error(`GET /applications/@me answered HTTP ${res.status}`);
    const app = await res.json();
    if (typeof app?.id !== 'string' || !SNOWFLAKE.test(app.id)) {
      throw new Error('the application id has the wrong shape');
    }
    return app;
  }

  return { call, currentApp };
}

/** Returns the public key, warning (through `warn`) when the endpoint URL is not ours yet. */
export async function readPublicKey(discord, expected, warn) {
  const app = await discord.currentApp();
  const key = app.verify_key;
  if (typeof key !== 'string' || !PUBLIC_KEY.test(key))
    throw new Error('verify_key has the wrong shape');
  if (app.interactions_endpoint_url !== expected) {
    warn(`the Interactions Endpoint URL in the Discord developer portal is not ${expected} yet.`);
  }
  return key;
}

/** Points Launch at our endpoint. Returns what it did, for the log. */
export async function setEntryPointHandler(discord, expected, warn) {
  const app = await discord.currentApp();
  if (app.interactions_endpoint_url !== expected) {
    warn(`Launch keeps Discord's handler: the Interactions Endpoint URL is not ${expected}.`);
    return 'skipped';
  }
  const listed = await discord.call(`/applications/${app.id}/commands`);
  if (!listed.ok) throw new Error(`listing commands answered HTTP ${listed.status}`);
  const commands = await listed.json();
  const entry = Array.isArray(commands)
    ? commands.find((c) => c?.type === PRIMARY_ENTRY_POINT)
    : undefined;
  if (entry === undefined || typeof entry.id !== 'string' || !SNOWFLAKE.test(entry.id)) {
    warn('the Activity has no entry point command; is Activities enabled?');
    return 'missing';
  }
  if (entry.handler === APP_HANDLER) return 'unchanged';
  const res = await discord.call(`/applications/${app.id}/commands/${entry.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ handler: APP_HANDLER }),
  });
  if (!res.ok) throw new Error(`setting the Launch handler answered HTTP ${res.status}`);
  return 'set';
}

/** EMBEDDED in `GET /applications/@me` flags: the app can run as an Activity. */
export const EMBEDDED_FLAG = 1 << 17;
const INTEGRATION_NAMES = { 0: 'guild install', 1: 'user install' };
const CONTEXT_NAMES = { 0: 'guilds', 1: 'bot DMs', 2: 'private channels' };

const named = (ids, names) =>
  Array.isArray(ids) && ids.length > 0
    ? ids.map((id) => names[id] ?? `unknown (${String(id)})`).join(', ')
    : 'none';

/** wrangler.jsonc without its whole-line comments (none of its strings contain `//`). */
function readWrangler() {
  const text = readFileSync(path.join(root, 'apps/worker/wrangler.jsonc'), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

/** The guild ids in the target's `ALLOWED_GUILDS`, snowflakes only. */
export function allowedGuildsOf(wrangler, target) {
  const raw = wrangler?.env?.[target]?.vars?.ALLOWED_GUILDS;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => SNOWFLAKE.test(id));
}

/**
 * Non-secret facts about the app for the deploy log: no token, no key value, only ids, names, flags and
 * settings. Returns `{ notices, warnings }`; a failed lookup becomes a warning, never a thrown error.
 */
export async function discordStatus(discord, allowedIds) {
  const notices = [];
  const warnings = [];
  const app = await discord.currentApp();
  const embedded = typeof app.flags === 'number' && (app.flags & EMBEDDED_FLAG) !== 0;
  const installs = Object.keys(app.integration_types_config ?? {})
    .map(Number)
    .sort();
  notices.push(
    `app ${app.id} "${String(app.name ?? '').slice(0, 100)}"; Activities (EMBEDDED) ${embedded ? 'on' : 'off'}; installs: ${named(installs, INTEGRATION_NAMES)}; public bot: ${app.bot_public === true ? 'yes' : 'no'}`,
  );
  if (!embedded) warnings.push('the app has no EMBEDDED flag: Activities are not enabled.');

  const guildsRes = await discord.call('/users/@me/guilds?limit=200');
  if (guildsRes.ok) {
    const guilds = await guildsRes.json();
    const ids = new Set(Array.isArray(guilds) ? guilds.map((g) => g?.id) : []);
    notices.push(`the bot is in ${String(ids.size)} server(s)`);
    if (allowedIds.length === 0) warnings.push('ALLOWED_GUILDS lists no server.');
    for (const id of allowedIds) {
      const member = ids.has(id);
      notices.push(`allowed server ${id}: bot ${member ? 'is a member' : 'is not a member'}`);
      if (!member) warnings.push(`the bot is not in allowed server ${id}; add the app to it.`);
    }
  } else {
    warnings.push(`listing the bot's servers answered HTTP ${String(guildsRes.status)}`);
  }

  const listed = await discord.call(`/applications/${app.id}/commands`);
  if (listed.ok) {
    const commands = await listed.json();
    const entry = Array.isArray(commands)
      ? commands.find((c) => c?.type === PRIMARY_ENTRY_POINT)
      : undefined;
    if (entry === undefined) {
      notices.push('entry point command: missing');
      warnings.push('the Activity has no entry point command (Launch).');
    } else {
      notices.push(
        `entry point command: present, type ${String(entry.type)}, handler ${String(entry.handler)}, installs: ${named(entry.integration_types, INTEGRATION_NAMES)}, contexts: ${named(entry.contexts, CONTEXT_NAMES)}`,
      );
      if (!Array.isArray(entry.contexts) || !entry.contexts.includes(0)) {
        warnings.push(
          'the entry point command is not available in servers (contexts lack guilds).',
        );
      }
    }
  } else {
    warnings.push(`listing commands answered HTTP ${String(listed.status)}`);
  }
  return { notices, warnings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ('error' in args) {
    console.log(`::error::${args.error}`);
    process.exitCode = 1;
    return;
  }
  const warn = (message) => console.log(`::warning::Discord (${args.target}): ${message}`);
  const token = process.env.DISCORD_BOT_TOKEN ?? '';
  if (token === '') {
    warn('DISCORD_BOT_TOKEN is empty; skipping.');
    return;
  }
  try {
    const config = JSON.parse(readFileSync(path.join(root, 'project.config.json'), 'utf8'));
    const expected = endpointFor(config, args.target);
    const discord = createDiscord(token);
    if (args.mode === 'public-key') {
      const key = await readPublicKey(discord, expected, warn);
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `public_key=${key}\n`);
      console.log(`public key read (${key === '' ? 'missing' : 'present'})`);
    } else if (args.mode === 'status') {
      const status = await discordStatus(discord, allowedGuildsOf(readWrangler(), args.target));
      for (const line of status.notices)
        console.log(`::notice::Discord status (${args.target}): ${line}`);
      for (const line of status.warnings) warn(line);
    } else {
      console.log(`Launch handler: ${await setEntryPointHandler(discord, expected, warn)}`);
    }
  } catch (err) {
    // Only our own messages: a response body could carry anything.
    warn(err instanceof Error && err.message !== '' ? err.message : 'failed');
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
