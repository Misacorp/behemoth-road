/**
 * Starting the app. Inside Discord it boots as an Activity, as creatures does: the Embedded App SDK
 * authorises, the Worker exchanges the code for a session, and the SDK is authenticated with the access
 * token; an expired session signs in again silently. Outside Discord a deployed build has nothing to sign
 * in with and shows only an "open from Discord" state. Local development (the Vite dev server only, never a
 * production build) signs in with a fake session against `wrangler dev`.
 */
import { ApiError, type ApiClient, ShapeError } from '../api/client.ts';
import type { AppConfig, PlayerView, Session } from '../api/schema.ts';

export type Boot =
  | { readonly kind: 'outside'; readonly config: AppConfig }
  /** Inside Discord, but in a server that is not allowed to play (the server answered `guild_not_allowed`). */
  | { readonly kind: 'not-allowed'; readonly config: AppConfig }
  | {
      readonly kind: 'ready';
      readonly config: AppConfig;
      readonly session: Session;
      readonly view: PlayerView;
    };

/** Discord adds `frame_id` (among others) to the URL when it launches an Activity. */
export const isInsideDiscord = (search: string): boolean =>
  new URLSearchParams(search).has('frame_id');

/** The narrow part of `@discord/embedded-app-sdk` the boot uses (so tests can pass a fake). */
export interface DiscordLike {
  readonly instanceId: string;
  ready(): Promise<void>;
  readonly commands: {
    authorize(args: {
      client_id: string;
      response_type: 'code';
      state: string;
      prompt: 'none';
      scope: ('identify' | 'guilds')[];
    }): Promise<{ code: string }>;
    authenticate(args: { access_token: string }): Promise<unknown>;
  };
}

export interface BootDeps {
  readonly api: ApiClient;
  readonly search: string;
  /** Creates the SDK (loaded lazily, so the outside-Discord page never downloads it). */
  readonly discord: (clientId: string) => Promise<DiscordLike>;
  /** Local development only: a fake session from `wrangler dev`. Null in production builds. */
  readonly devSession: (() => Promise<Session>) | null;
}

/** How long `sdk.ready()` may take before the boot gives up on it. */
export const SDK_READY_MS = 15_000;

/**
 * A boot step failed. `code` is a short machine code (`sdk.ready: timeout`, `auth: 401
 * discord_auth_failed`), shown on staging and locally only, never with secrets. `devTools` is the config's
 * flag when the config loaded (null when the config itself failed).
 */
export class BootError extends Error {
  constructor(
    readonly step: string,
    readonly detail: string,
    readonly devTools: boolean | null,
    override readonly cause: unknown,
  ) {
    super(`${step}: ${detail}`);
    this.name = 'BootError';
  }

  /** The code shown under the retry button: step and detail, at most 60 characters. */
  get code(): string {
    const code = `${this.step}: ${this.detail}`;
    return code.length > 60 ? `${code.slice(0, 59)}…` : code;
  }
}

class Timeout extends Error {}

/** A short, safe description of an error: an HTTP status and code, an SDK error code, or its kind. */
export function describeError(err: unknown): string {
  if (err instanceof Timeout) return 'timeout';
  if (err instanceof ApiError) return `${String(err.status)}${err.code ? ` ${err.code}` : ''}`;
  if (err instanceof ShapeError) return 'bad response';
  if (typeof err === 'object' && err !== null) {
    // The Embedded App SDK rejects with { code, message } objects.
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'number' || typeof code === 'string') return `sdk ${String(code)}`;
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name !== 'Error') return name;
  }
  return 'error';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Timeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(describeError(e)));
      },
    );
  });
}

async function firstView(api: ApiClient): Promise<PlayerView> {
  const answer = await api.game();
  if ('unchanged' in answer) throw new Error('/api/game answered unchanged without since');
  return answer;
}

export async function boot(deps: BootDeps): Promise<Boot> {
  const { api } = deps;
  let devTools: boolean | null = null;
  /** Runs one boot step; a failure becomes a `BootError` that names the step. */
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      if (err instanceof BootError) throw err;
      throw new BootError(name, describeError(err), devTools, err);
    }
  };

  const config = await step('config', () => api.config());
  devTools = config.devTools;
  if (!isInsideDiscord(deps.search)) {
    if (!deps.devSession) return { kind: 'outside', config };
    const session = await step('dev login', deps.devSession);
    api.useSession(session);
    return { kind: 'ready', config, session, view: await step('game', () => firstView(api)) };
  }
  const sdk = await step('sdk.load', () => deps.discord(config.discordClientId));
  await step('sdk.ready', () => withTimeout(sdk.ready(), SDK_READY_MS));
  const signIn = async (): Promise<Session> => {
    const { code } = await step('authorize', () =>
      sdk.commands.authorize({
        client_id: config.discordClientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      }),
    );
    // The server decides the guild from the instance and verifies the player; the client only passes
    // the code and the instance id.
    const session = await step('auth', () => api.signIn(code, sdk.instanceId));
    // Discord requires authenticate() with the access token to unlock the rest of the SDK.
    await step('authenticate', () =>
      sdk.commands.authenticate({ access_token: session.accessToken }),
    );
    return session;
  };
  let session: Session;
  try {
    session = await signIn();
  } catch (err) {
    const cause = err instanceof BootError ? err.cause : err;
    if (cause instanceof ApiError && cause.status === 403 && cause.code === 'guild_not_allowed') {
      return { kind: 'not-allowed', config };
    }
    throw err;
  }
  // Sessions expire; a game lasts weeks. Sign in again silently when the server says so.
  api.setReauthenticator(async () => {
    await signIn();
  });
  return { kind: 'ready', config, session, view: await step('game', () => firstView(api)) };
}
