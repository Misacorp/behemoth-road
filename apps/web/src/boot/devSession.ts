/**
 * LOCAL DEVELOPMENT ONLY. Loaded only behind `import.meta.env.DEV` (the Vite dev server), so production
 * builds never contain it; the screenshot script checks the built assets for its route.
 *
 * Signs in against `wrangler dev` with a fake user: `?as=<name>` picks who you are, so two browser tabs
 * can play as two players. The route (`POST /api/dev/session`) exists only in the Worker's local mode.
 */
import * as v from 'valibot';
import { SessionSchema, type Session } from '../api/schema.ts';

export async function devSession(search: string): Promise<Session> {
  const name = (new URLSearchParams(search).get('as') ?? 'Dev').slice(0, 32);
  const res = await fetch('/api/dev/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`dev session failed (${String(res.status)})`);
  return v.parse(SessionSchema, await res.json());
}
