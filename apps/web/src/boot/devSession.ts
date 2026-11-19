/**
 * LOCAL DEVELOPMENT ONLY. Loaded only behind `import.meta.env.DEV` (the Vite dev server), so production
 * builds never contain it; the screenshot script checks the built assets for its route.
 *
 * Signs in against `wrangler dev` as a fake player of a fake server (`POST /api/dev/login`, which the
 * Worker offers only in its local environment). `?player=<1-9>` picks who you are, so two browser tabs
 * can play as two players.
 */
import * as v from 'valibot';
import { SessionSchema, type Session } from '../api/schema.ts';

export function devPlayer(search: string): number {
  const n = Number(new URLSearchParams(search).get('player') ?? '1');
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : 1;
}

export async function devSession(search: string): Promise<Session> {
  const res = await fetch('/api/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ player: devPlayer(search) }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`dev login failed (${String(res.status)})`);
  return v.parse(SessionSchema, await res.json());
}
