/**
 * The API client for `docs/design/m2-session.md`: relative URLs, a bearer session token kept only in this
 * module (never in storage), every response parsed with a schema, and a silent sign-in again when the
 * session has expired (creatures' approach).
 */
import type { Place } from '@behemoth-road/core';
import * as v from 'valibot';
import { createReauth, type Reauth } from './reauth.ts';
import {
  ActionAnswerSchema,
  ConfigSchema,
  ErrorBodySchema,
  GameResponseSchema,
  LiveTicketSchema,
  PlayerViewSchema,
  SeenAnswerSchema,
  StoryReadAnswerSchema,
  SessionSchema,
  type ActionAnswer,
  type AppConfig,
  type GameAction,
  type GameResponse,
  type PlayerView,
  type Session,
} from './schema.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The server's `error` code (a refusal reason for moves), or null. */
    readonly code: string | null,
  ) {
    super(code === null ? `request failed (${String(status)})` : `request failed (${code})`);
    this.name = 'ApiError';
  }
}

/** A response that did not match its schema: the server and client disagree. */
export class ShapeError extends Error {
  constructor(path: string) {
    super(`${path} returned an unexpected shape`);
    this.name = 'ShapeError';
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  config(): Promise<AppConfig>;
  /** Whether the config said the server offers live sockets (false before it was read). */
  liveEnabled(): boolean;
  /** Exchanges a Discord authorisation code for a session, and keeps the token. */
  signIn(code: string, instanceId: string): Promise<Session>;
  /** Uses a session obtained elsewhere (local development's fake session). */
  useSession(session: Session): void;
  /** Signs in again when a request finds the session expired. */
  setReauthenticator(reauthenticate: () => Promise<void>): void;
  game(since?: number): Promise<GameResponse>;
  /** A one-time ticket for the live socket (404 where the server has it off). */
  liveTicket(): Promise<string>;
  join(role: string, offer: number): Promise<PlayerView>;
  replace(role: string, offer: number): Promise<PlayerView>;
  /** The new view, and the events of the walk (a reveal, a trap that stopped it). */
  move(version: number, path: readonly Place[]): Promise<ActionAnswer>;
  /** Gather, craft or work a site, for your own character where it stands. */
  act(version: number, action: GameAction): Promise<ActionAnswer>;
  /** Adds ids to your seen record (things shown once); answers the whole record. */
  markSeen(ids: readonly string[]): Promise<readonly string[]>;
  /** Records story cards you have read (1 to 12 ids); answers all you have read. */
  markStoryRead(ids: readonly string[]): Promise<readonly string[]>;
  /** Tells the server you are looking at the game now (your next visit's recap starts from here). */
  visit(): Promise<void>;
  nextDay(): Promise<PlayerView>;
  /** Staging only: sets how days advance. */
  setPace(pace: 'daily' | 'fast'): Promise<PlayerView>;
  /** Staging and local only, admins: ends this game and starts a new season (everyone joins again). */
  newSeason(): Promise<void>;
}

function parse<T extends v.GenericSchema>(
  schema: T,
  path: string,
  body: unknown,
): v.InferOutput<T> {
  const result = v.safeParse(schema, body);
  if (!result.success) throw new ShapeError(path);
  return result.output;
}

export function createApiClient(fetchImpl: Fetch = (i, init) => fetch(i, init)): ApiClient {
  let token: string | null = null;
  let reauth: Reauth | null = null;
  let live = false;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    const res = await fetchImpl(path, { ...init, headers, cache: 'no-store' });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Not JSON: an error below, or a shape error for its caller.
    }
    if (!res.ok) {
      const err = v.safeParse(ErrorBodySchema, body);
      throw new ApiError(res.status, err.success ? err.output.error : null);
    }
    return body;
  }

  function authed(path: string, init: RequestInit = {}): Promise<unknown> {
    const attempt = (): Promise<unknown> => {
      if (token === null) return Promise.reject(new ApiError(401, 'not_signed_in'));
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return request(path, { ...init, headers });
    };
    return reauth === null ? attempt() : reauth.run(attempt);
  }

  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
  const view = async (path: string, body: unknown): Promise<PlayerView> =>
    parse(PlayerViewSchema, path, await authed(path, post(body)));
  const answer = async (path: string, body: unknown): Promise<ActionAnswer> =>
    parse(ActionAnswerSchema, path, await authed(path, post(body)));

  return {
    async config() {
      const config = parse(ConfigSchema, '/api/config', await request('/api/config'));
      live = config.live;
      return config;
    },
    liveEnabled: () => live,
    async signIn(code, instanceId) {
      const path = '/api/auth/session';
      const session = parse(SessionSchema, path, await request(path, post({ code, instanceId })));
      token = session.token;
      return session;
    },
    useSession(session) {
      token = session.token;
    },
    setReauthenticator(reauthenticate) {
      reauth = createReauth({
        reauthenticate,
        isSessionExpired: (err) => err instanceof ApiError && err.status === 401,
      });
    },
    async game(since) {
      const path = since === undefined ? '/api/game' : `/api/game?since=${String(since)}`;
      return parse(GameResponseSchema, '/api/game', await authed(path));
    },
    async liveTicket() {
      const path = '/api/live/ticket';
      return parse(LiveTicketSchema, path, await authed(path, post({}))).ticket;
    },
    join: (role, offer) => view('/api/game/join', { role, offer }),
    replace: (role, offer) => view('/api/game/replace', { role, offer }),
    move: (version, path) => answer('/api/game/move', { version, path }),
    act: (version, action) => answer('/api/game/act', { version, action }),
    async markSeen(ids) {
      const path = '/api/me/seen';
      return parse(SeenAnswerSchema, path, await authed(path, post({ ids }))).seen;
    },
    async markStoryRead(ids) {
      const path = '/api/me/story-read';
      return parse(StoryReadAnswerSchema, path, await authed(path, post({ ids }))).storyRead;
    },
    async visit() {
      // The answer is not read.
      await authed('/api/me/visit', post({}));
    },
    nextDay: () => view('/api/dev/next-day', {}),
    setPace: (pace) => view('/api/dev/pace', { pace }),
    async newSeason() {
      // The answer is not read: the caller loads the new game's view afterwards.
      await authed('/api/dev/new-season', post({}));
    },
  };
}
