/**
 * Keeps the player view fresh: after the player's own actions (their answer is the new view, then a read
 * of the log since the view before it, for what others did meanwhile), when the page becomes visible or the
 * window regains focus, and every 10 seconds while it is visible. Asks with `since`, so an unchanged
 * game costs one small answer. Timers and visibility are injected, so it is tested without a browser.
 */
import type { ApiClient } from './client.ts';
import type { PlayerView } from './schema.ts';

export const POLL_MS = 10_000;
/** After `fastTickAt` the extra refresh waits this long (the server runs the tick at that time). */
export const TICK_GRACE_MS = 300;
/** If the day has not turned by then, one more refresh. */
export const TICK_RETRY_MS = 2_000;

export interface SyncDeps {
  readonly api: Pick<ApiClient, 'game'>;
  readonly onView: (view: PlayerView) => void;
  readonly onError?: (err: unknown) => void;
  readonly setInterval: (fn: () => void, ms: number) => number;
  readonly clearInterval: (handle: number) => void;
  /** For the one refresh after the early next day is due (fast pace). */
  readonly setTimeout: (fn: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  readonly now: () => number;
}

export class Sync {
  private view: PlayerView | null = null;
  private timer: number | null = null;
  /** The pending refresh for the early next day, and the `fastTickAt` it is for. */
  private tickTimer: number | null = null;
  private tickFor: number | null = null;
  private inFlight: Promise<void> | null = null;
  /** Counts restarts (new seasons): an answer to a request made before the last one is dropped. */
  private gen = 0;

  constructor(private readonly deps: SyncDeps) {}

  get current(): PlayerView | null {
    return this.view;
  }

  /** The current generation, for a caller that asks the server itself (an action) to pass back to `accept`. */
  get generation(): number {
    return this.gen;
  }

  /**
   * A newer view (from an action's answer, or a refresh). Older versions are ignored, and so is an answer
   * to a request made before a restart (`generation` then differs): it belongs to the old game.
   */
  accept(view: PlayerView, generation = this.gen): void {
    if (generation !== this.gen) return;
    if (this.view && view.version < this.view.version) return;
    this.view = view;
    this.scheduleTick();
    this.deps.onView(view);
  }

  /** A new game (a new season): its view replaces the old one whatever their versions. */
  restart(view: PlayerView): void {
    this.gen += 1;
    // A poll still in flight belongs to the old game: the next refresh asks afresh.
    this.inFlight = null;
    this.view = view;
    this.scheduleTick();
    this.deps.onView(view);
  }

  /**
   * While the view has `fastTickAt`, one extra refresh just after it (the normal poll stays slow, so the
   * server is not asked more often), and one more two seconds later if the view still shows the same
   * countdown. A new or cleared `fastTickAt` replaces the pending one.
   */
  private scheduleTick(): void {
    const at = this.view?.fastTickAt ?? null;
    if (at === this.tickFor) return;
    if (this.tickTimer !== null) this.deps.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.tickFor = at;
    if (at === null) return;
    const delay = Math.max(0, at - this.deps.now()) + TICK_GRACE_MS;
    this.tickTimer = this.deps.setTimeout(() => {
      this.tickTimer = null;
      void this.refresh().then(() => {
        if (this.tickFor !== at || this.view?.fastTickAt !== at) return;
        this.tickTimer = this.deps.setTimeout(() => {
          this.tickTimer = null;
          void this.refresh();
        }, TICK_RETRY_MS);
      });
    }, delay);
  }

  /** Asks the server for anything newer. Concurrent calls share one request. */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const gen = this.gen;
    const request = this.deps.api
      .game(this.view?.version)
      .then(
        (answer) => {
          if (!('unchanged' in answer)) this.accept(answer, gen);
        },
        (err: unknown) => this.deps.onError?.(err),
      )
      .finally(() => {
        if (this.inFlight === request) this.inFlight = null;
      });
    this.inFlight = request;
    return request;
  }

  /**
   * Reads the log since `version` (the view before your own action): the answer is the same latest view,
   * now with what others and the tick did in between, so their moments play too (yours play once).
   */
  catchUp(version: number): Promise<void> {
    const gen = this.gen;
    return this.deps.api.game(version).then(
      (answer) => {
        if (!('unchanged' in answer)) this.accept(answer, gen);
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
