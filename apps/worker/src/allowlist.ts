import { SNOWFLAKE_RE } from './schemas.ts';

/** More servers than this in `ALLOWED_GUILDS` is a configuration mistake: fail closed. */
const MAX_ALLOWED_GUILDS = 200;

/**
 * The Discord servers allowed to play, from the `ALLOWED_GUILDS` var (comma-separated guild ids). The app
 * itself is public (anyone with the install link can add it), so this list is what keeps a game to Misa's
 * servers. Fails closed: an empty value, a value with anything but snowflakes, or an oversized list allows
 * no server at all.
 */
export function allowedGuilds(raw: unknown): ReadonlySet<string> {
  if (typeof raw !== 'string') return new Set();
  const ids = raw.split(',').map((id) => id.trim());
  if (ids.length > MAX_ALLOWED_GUILDS || !ids.every((id) => SNOWFLAKE_RE.test(id)))
    return new Set();
  return new Set(ids);
}
