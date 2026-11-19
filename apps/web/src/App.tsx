/**
 * Boots the app and shows one of: nothing yet (a quiet paper page while loading), the "open from Discord"
 * state outside Discord, a visual error with a retry, or the game.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createApiClient } from './api/client.ts';
import { boot, type Boot, type DiscordLike } from './boot/boot.ts';
import { Game } from './game/Game.tsx';
import { OpenFromDiscord, StartFailed } from './ui/states.tsx';

type Status =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'booted'; readonly boot: Boot };

async function loadDiscord(clientId: string): Promise<DiscordLike> {
  const { DiscordSDK } = await import('@discord/embedded-app-sdk');
  return new DiscordSDK(clientId);
}

export function App(): JSX.Element {
  const api = useMemo(() => createApiClient(), []);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'loading' });
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
        if (!cancelled) setStatus({ kind: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status.kind === 'loading') return <main class="game" />;
  if (status.kind === 'failed') return <StartFailed onRetry={() => setAttempt((n) => n + 1)} />;
  if (status.boot.kind === 'outside') return <OpenFromDiscord />;
  return <Game api={api} initial={status.boot.view} />;
}
