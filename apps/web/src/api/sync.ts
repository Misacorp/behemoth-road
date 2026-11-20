/**
 * Keeps the player view fresh: after the player's own actions (their answer is the new view, then a read
 * of the log since the view before it, for what others did meanwhile), when the page becomes visible or the
 * window regains focus, and every 10 seconds while it is visible. Asks with `since`, so an unchanged
 * game costs one small answer. Timers and visibility are injected, so it is tested without a browser.
 */
import type { ApiClient } from './client.ts';
import type { PlayerView } from './schema.ts';

export const POLL_MS = 10_000;

export interface SyncDeps {
  readonly api: Pick<ApiClient, 'game'>;
  readonly onView: (view: PlayerView) => void;
  readonly onError?: (err: unknown) => void;
  readonly setInterval: (fn: () => void, ms: number) => number;
  readonly clearInterval: (handle: number) => void;
}

export class Sync {
  private view: PlayerView | null = null;
  private timer: number | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly deps: SyncDeps) {}

  get current(): PlayerView | null {
    return this.view;
  }

  /** A newer view (from an action's answer, or a refresh). Older versions are ignored. */
  accept(view: PlayerView): void {
    if (this.view && view.version < this.view.version) return;
    this.view = view;
    this.deps.onView(view);
  }

  /** A new game (a new season): its view replaces the old one whatever their versions. */
  restart(view: PlayerView): void {
    this.view = view;
    this.deps.onView(view);
  }

  /** Asks the server for anything newer. Concurrent calls share one request. */
  refresh(): Promise<void> {
    this.inFlight ??= this.deps.api
      .game(this.view?.version)
      .then(
        (answer) => {
          if (!('unchanged' in answer)) this.accept(answer);
        },
        (err: unknown) => this.deps.onError?.(err),
      )
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  /**
   * Reads the log since `version` (the view before your own action): the answer is the same latest view,
   * now with what others and the tick did in between, so their moments play too (yours play once).
   */
  catchUp(version: number): Promise<void> {
    return this.deps.api.game(version).then(
      (answer) => {
        if (!('unchanged' in answer)) this.accept(answer);
      },
      (err: unknown) => this.deps.onError?.(err),
    );
  }

  /** The page became visible (or started visible): refresh now and poll while it stays visible. */
  visible(): void {
    void this.refresh();
    if (this.timer === null) {
      this.timer = this.deps.setInterval(() => void this.refresh(), POLL_MS);
    }
  }

  /** The page was hidden: stop polling. */
  hidden(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = null;
  }
}
