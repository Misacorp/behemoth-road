/**
 * Boots the app and shows one of: nothing yet (a quiet paper page while loading), the "open from Discord"
 * state outside Discord, a visual error with a retry, or the game.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createApiClient } from './api/client.ts';
import { boot, type Boot, BootError, type DiscordLike } from './boot/boot.ts';
import { Game } from './game/Game.tsx';
import { OpenFromDiscord, StartFailed } from './ui/states.tsx';

type Status =
  | { readonly kind: 'loading' }
  /** A boot failed; `retrying` while the retry runs. */
  | { readonly kind: 'failed'; readonly code: string | null; readonly retrying: boolean }
  | { readonly kind: 'booted'; readonly boot: Boot };

/**
 * One SDK per page: a retry reuses it (and its `ready()`) instead of opening a second connection to
 * Discord, which would never become ready.
 */
let discordSdk: Promise<DiscordLike> | null = null;
function loadDiscord(clientId: string): Promise<DiscordLike> {
  discordSdk ??= import('@discord/embedded-app-sdk').then(({ DiscordSDK }) => {
    const sdk = new DiscordSDK(clientId);
    let ready: Promise<void> | null = null;
    return {
      get instanceId() {
        return sdk.instanceId;
      },
      ready: () => (ready ??= sdk.ready()),
      commands: sdk.commands,
    };
  });
  return discordSdk;
}

/**
 * What a failed start shows under its retry button: the step's machine code where dev tools are on
 * (staging, local), and nothing in production. When the config itself failed there is no flag to read;
 * its code is only an HTTP status, so it is shown.
 */
export function failureCode(err: unknown): string | null {
  if (!(err instanceof BootError)) return null;
  if (err.devTools === false) return null;
  return err.code;
}

export function App(): JSX.Element {
  const api = useMemo(() => createApiClient(), []);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // A retry keeps the failure on screen, marked busy, until the new attempt ends.
    setStatus((s) => (s.kind === 'failed' ? { ...s, retrying: true } : { kind: 'loading' }));
    const search = window.location.search;
    boot({
      api,
      search,
      discord: loadDiscord,
      // Vite replaces import.meta.env.DEV with false in builds, so this branch and the module it loads
      // are left out of production entirely.
      devSession: import.meta.env.DEV
        ? () => import('./boot/devSession.ts').then((m) => m.devSession(search))
        : null,
    }).then(
      (b) => {
        if (!cancelled) setStatus({ kind: 'booted', boot: b });
      },
      (err: unknown) => {
        console.warn('start failed', err);
        if (!cancelled) setStatus({ kind: 'failed', code: failureCode(err), retrying: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status.kind === 'loading') return <main class="game" />;
  if (status.kind === 'failed') {
    return (
      <StartFailed
        code={status.code}
        busy={status.retrying}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  // A server that may not play sees the same state as outside Discord: the game opens elsewhere.
  if (status.boot.kind === 'outside' || status.boot.kind === 'not-allowed')
    return <OpenFromDiscord />;
  return <Game api={api} initial={status.boot.view} />;
}
