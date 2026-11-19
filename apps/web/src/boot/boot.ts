/**
 * Starting the app. Inside Discord it boots as an Activity, as creatures does: the Embedded App SDK
 * authorises, the Worker exchanges the code for a session, and the SDK is authenticated with the access
 * token; an expired session signs in again silently. Outside Discord a deployed build has nothing to sign
 * in with and shows only an "open from Discord" state. Local development (the Vite dev server only, never a
 * production build) signs in with a fake session against `wrangler dev`.
 */
import type { ApiClient } from '../api/client.ts';
import type { AppConfig, PlayerView, Session } from '../api/schema.ts';

export type Boot =
  | { readonly kind: 'outside'; readonly config: AppConfig }
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

async function firstView(api: ApiClient): Promise<PlayerView> {
  const answer = await api.game();
  if ('unchanged' in answer) throw new Error('/api/game answered unchanged without since');
  return answer;
}

export async function boot(deps: BootDeps): Promise<Boot> {
  const { api } = deps;
  const config = await api.config();
  if (!isInsideDiscord(deps.search)) {
    if (!deps.devSession) return { kind: 'outside', config };
    const session = await deps.devSession();
    api.useSession(session);
    return { kind: 'ready', config, session, view: await firstView(api) };
  }
  const sdk = await deps.discord(config.discordClientId);
  await sdk.ready();
  const signIn = async (): Promise<Session> => {
    const { code } = await sdk.commands.authorize({
      client_id: config.discordClientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });
    // The server decides the guild from the instance and verifies the player; the client only passes
    // the code and the instance id.
    const session = await api.signIn(code, sdk.instanceId);
    // Discord requires authenticate() with the access token to unlock the rest of the SDK.
    await sdk.commands.authenticate({ access_token: session.accessToken });
    return session;
  };
  const session = await signIn();
  // Sessions expire; a game lasts weeks. Sign in again silently when the server says so.
  api.setReauthenticator(async () => {
    await signIn();
  });
  return { kind: 'ready', config, session, view: await firstView(api) };
}
