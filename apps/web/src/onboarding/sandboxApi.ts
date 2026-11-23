/**
 * The practice map's API: the same `ApiClient` the real game uses, answered here by the pure core. It makes
 * no request (it imports nothing that can: no fetch, no socket), so the practice can never reach, or be
 * mixed with, the real game. `guard.test.ts` holds it to that. A refusal throws the same `ApiError` a
 * server's 409 would, so the map UI behaves the same.
 */
import { act, characterOf, type GameEvent, type GameState, moveAlong } from '@behemoth-road/core';
import { ApiError, type ApiClient } from '../api/client.ts';
import type { ActionAnswer, GameResponse, PlayerView } from '../api/schema.ts';
import { sandboxState, sandboxView, SANDBOX_USERS } from './sandbox.ts';

export interface Sandbox {
  readonly api: ApiClient;
  /** The practice map as it stands now. */
  state(): GameState;
}

type Logged = GameEvent & { readonly version: number };

const never = (what: string) => (): Promise<never> =>
  Promise.reject(new ApiError(404, `practice:${what}`));

/** A practice map for `role`, as an API. Starting over is a new one. */
export function createSandbox(role: string): Sandbox {
  let state = sandboxState(role);
  let version = 1;
  let log: Logged[] = [];

  const view = (): PlayerView => sandboxView(state, version);
  /** Applies a result like the server: a new version, its events logged and answered. */
  const apply = (next: GameState, events: readonly GameEvent[]): ActionAnswer => {
    state = next;
    version += 1;
    const stamped = events.map((e) => ({ ...e, version }));
    log = [...log, ...stamped].slice(-200);
    return { ...view(), events: stamped, stopped: null };
  };
  const mine = (): string => characterOf(state, SANDBOX_USERS.you)?.id ?? '';

  const api: ApiClient = {
    config: never('config'),
    liveEnabled: () => false,
    signIn: never('sign-in'),
    useSession: () => undefined,
    setReauthenticator: () => undefined,
    game(since?: number): Promise<GameResponse> {
      if (since === version) return Promise.resolve({ unchanged: true });
      const events = since === undefined ? [] : log.filter((e) => e.version > since);
      return Promise.resolve({ ...view(), events });
    },
    liveTicket: never('live'),
    join: never('join'),
    replace: never('replace'),
    move(v, path) {
      if (v !== version) return Promise.reject(new ApiError(409, 'stale'));
      const result = moveAlong(state, mine(), path);
      if (!result.ok) return Promise.reject(new ApiError(409, result.reason));
      return Promise.resolve(apply(result.state, result.events));
    },
    act(v, action) {
      if (v !== version) return Promise.reject(new ApiError(409, 'stale'));
      const result = act(state, mine(), action);
      if (!result.ok) return Promise.reject(new ApiError(409, result.reason));
      return Promise.resolve(apply(result.state, result.events));
    },
    // Nothing is stored or sent: the practice is never "seen" on the server by these.
    markSeen: () => Promise.resolve([]),
    visit: () => Promise.resolve(),
    nextDay: never('next-day'),
    setPace: never('pace'),
    newSeason: never('new-season'),
  };

  return {
    api,
    state: () => state,
  };
}
