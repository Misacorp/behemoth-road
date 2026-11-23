/**
 * Keeps the player view fresh: after the player's own actions (their answer is the new view, then a read
 * of the log since the view before it, for what others did meanwhile), when the page becomes visible or the
 * window regains focus, and by polling while it is visible: every 10 seconds, or only every 60 seconds as a
 * safety net while the live socket is up (`live-socket.ts`), whose `changed` pushes trigger a debounced
 * refresh. Asks with `since`, so an unchanged game costs one small answer. Timers, the socket and
 * visibility are injected, so it is tested without a browser.
 */
import type { ApiClient } from './client.ts';
import type { PlayerView } from './schema.ts';

export const POLL_MS = 10_000;
/** While the live socket is up the poll is only a safety net. */
export const LIVE_POLL_MS = 60_000;
/** A push waits this long for more before the refresh, so a burst of changes is one request. */
export const PUSH_DEBOUNCE_MS = 150;
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
  /** The live socket, started while the page is visible and stopped when it is hidden. */
  readonly live?: { start(): void; stop(): void };
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
  /** The live socket is up: poll slowly, refresh on pushes. */
  private liveUp = false;
  private pushTimer: number | null = null;
  /** The server's clock minus ours, measured when a view arrived. */
  private skew = 0;

  constructor(private readonly deps: SyncDeps) {}

  get current(): PlayerView | null {
    return this.view;
  }

  /** The server's clock now, from ours and the skew measured at the last view. */
  serverNow(): number {
    return this.deps.now() + this.skew;
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
    this.skew = view.now - this.deps.now();
    this.view = view;
    this.scheduleTick();
    this.deps.onView(view);
  }

  /** A new game (a new season): its view replaces the old one whatever their versions. */
  restart(view: PlayerView): void {
    this.gen += 1;
    // A poll still in flight belongs to the old game: the next refresh asks afresh.
    this.inFlight = null;
    this.skew = view.now - this.deps.now();
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
    // The server's time, not ours: a device clock that is off must not move the refresh.
    const delay = Math.max(0, at - this.serverNow()) + TICK_GRACE_MS;
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

  /** The live socket came up or dropped: the poll slows or returns to normal, and a new socket refreshes once. */
  setLive(up: boolean): void {
    if (this.liveUp === up) return;
    this.liveUp = up;
    if (this.timer !== null) this.startPoll();
    if (up) void this.refresh();
  }

  /** A push (or the greeting) says the game is at `version`: refresh, debounced, if that is news. */
  changed(version: number): void {
    if (this.view && version <= this.view.version) return;
    if (this.pushTimer !== null) return;
    this.pushTimer = this.deps.setTimeout(() => {
      this.pushTimer = null;
      void this.refresh();
    }, PUSH_DEBOUNCE_MS);
  }

  private startPoll(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = this.deps.setInterval(
      () => void this.refresh(),
      this.liveUp ? LIVE_POLL_MS : POLL_MS,
    );
  }

  /** The page became visible (or started visible): refresh now, poll while it stays visible, open the socket. */
  visible(): void {
    void this.refresh();
    if (this.timer === null) this.startPoll();
    this.scheduleTick();
    this.deps.live?.start();
  }

  /** The page was hidden (or the game closed): stop polling, close the socket, drop pending timers. */
  hidden(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = null;
    this.deps.live?.stop();
    if (this.pushTimer !== null) this.deps.clearTimeout(this.pushTimer);
    this.pushTimer = null;
    if (this.tickTimer !== null) this.deps.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    // Forget what the timer was for, so becoming visible schedules it again.
    this.tickFor = null;
  }
}
