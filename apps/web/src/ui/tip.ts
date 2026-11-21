/**
 * The tip controller: one tip open at a time, for the whole app (HTML controls, the map's SVG cards and the
 * map itself). With a mouse a tip opens after its group's delay and closes on leaving; on a touch screen it
 * opens on press-and-hold and stays after the finger lifts until the next tap anywhere (or `stayMs`); moving
 * the finger first makes it a drag and closes it, and the hold never becomes a tap (the click that
 * follows is swallowed, and only the held thing's own click). A tap elsewhere both closes a stay-open tip
 * and still acts: closing never swallows it. Escape closes it. An icon that is not a button shows its tip on
 * a single tap (`tap`), and it stays like a held one (`stayMs`). Timers are injected, so it is tested with fake ones.
 */
import {
  delays,
  holdMs,
  stayMs,
  TIP_TABLE,
  type TipGroup,
  type TipId,
  tips,
} from '../text/tips.ts';

/** A screen rectangle (CSS px) of the thing a tip is about. */
export interface TipAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OpenTip {
  readonly id: TipId;
  readonly anchor: TipAnchor;
  /** Whether the thing is still on screen (a drawer closing removes it): the tip closes when it is not. */
  readonly alive: () => boolean;
  /** Opened by a tap (not a hover or hold): leaving the thing with the mouse does not close it. */
  readonly tapped: boolean;
  /** More to show under the text (the pack's contents), drawn by the tip layer. */
  readonly extra?: unknown;
}

/**
 * Where a tip points: the thing's screen rectangle now, or null once it is gone (then nothing opens), and
 * whether it is still there.
 */
export interface TipTarget {
  readonly rect: () => TipAnchor | null;
  readonly alive: () => boolean;
  /** Whether a click's target belongs to this thing (only its own next click is swallowed after a hold). */
  readonly owns: (target: unknown) => boolean;
}

export interface TipClock {
  readonly setTimeout: (fn: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
}

/** How far a finger may drift during a hold before it counts as a move (and the tip closes), in px. */
export const HOLD_SLOP = 10;
/** How long after a hold its click may still arrive (and be swallowed), in ms. */
const SWALLOW_MS = 700;

const GROUP_BY_PREFIX: Readonly<Record<string, TipGroup>> = {
  hud: 'hud',
  action: 'action',
  why: 'action',
  role: 'content',
  trait: 'content',
  quirk: 'content',
  material: 'content',
  unlock: 'content',
  boon: 'content',
  people: 'content',
  terrain: 'content',
  feature: 'content',
  threat: 'map',
  settlement: 'map',
  map: 'map',
};

/** How long the pointer rests on `id` before its tip opens, in ms. */
export function delayOf(id: TipId): number {
  const tip = TIP_TABLE[id];
  if (tip.delayMs !== undefined) return tip.delayMs;
  const group = tip.group ?? GROUP_BY_PREFIX[id.split(':')[0] ?? ''] ?? 'default';
  return delays[group];
}

/** A tip id for a content thing (`role`, `trait`, `material`…), or null when the text file has none. */
export function tipFor(kind: string, id: string | null | undefined): TipId | null {
  if (!id) return null;
  const key = `${kind}:${id}`;
  return Object.hasOwn(tips, key) ? (key as TipId) : null;
}

export class TipController {
  private current: OpenTip | null = null;
  private timer: number | null = null;
  private hold: { x: number; y: number } | null = null;
  /** The press under way became a hold (its tip opened), even if the tip has since closed. */
  private wasHold = false;
  /** After a hold: the thing whose next click is swallowed, until the timer clears it. */
  private swallowFor: TipTarget | null = null;
  private swallowTimer: number | null = null;
  /** A held tip stays after the finger lifts, until this closes it (or a tap does sooner). */
  private stayTimer: number | null = null;
  private readonly listeners = new Set<(open: OpenTip | null) => void>();

  constructor(private readonly clock: TipClock) {}

  get open(): OpenTip | null {
    return this.current;
  }

  subscribe(fn: (open: OpenTip | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A mouse came to rest on `id`: its tip opens after the delay (at once when another tip is showing). */
  hover(id: TipId, target: TipTarget): void {
    this.cancel();
    if (this.current !== null) this.show(id, target);
    else this.timer = this.clock.setTimeout(() => this.show(id, target), delayOf(id));
  }

  /** The mouse left `id`. */
  unhover(id: TipId): void {
    this.cancel();
    if (this.current?.id === id && !this.current.tapped && this.hold === null) this.close();
  }

  /** A finger (or pen) went down on `id` at (x, y): its tip opens if it is held. */
  press(id: TipId, target: TipTarget, x: number, y: number): void {
    this.cancel();
    this.close();
    this.hold = { x, y };
    this.wasHold = false;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (this.show(id, target)) {
        this.wasHold = true;
        this.swallowNextClick(target);
      }
    }, holdMs);
  }

  /** The finger moved: past the slop it is a drag, not a hold (a tip it opened closes). */
  move(x: number, y: number): void {
    if (!this.hold) return;
    if (Math.hypot(x - this.hold.x, y - this.hold.y) <= HOLD_SLOP) return;
    this.hold = null;
    this.cancel();
    if (this.wasHold) this.close();
    this.endSwallowSoon();
  }

  /**
   * The finger lifted (or the press was cancelled). Returns true when the press was a hold (its tip opened,
   * even if Escape or a move has closed it since): the caller must not treat it as a tap, and its click is
   * swallowed (`takeClick`).
   */
  release(): boolean {
    this.hold = null;
    this.cancel();
    const held = this.wasHold;
    this.wasHold = false;
    // A held tip stays to be read once the finger is off it; the next tap anywhere, or the time, closes it.
    if (held && this.current !== null) {
      this.stayTimer = this.clock.setTimeout(() => {
        this.stayTimer = null;
        this.close();
      }, stayMs);
    }
    this.endSwallowSoon();
    return held;
  }

  /** A click arrived on `target`: true when it ends a hold on that same thing and must not act. */
  takeClick(target: unknown): boolean {
    const owner = this.swallowFor;
    if (!owner || !owner.owns(target)) return false;
    this.clearSwallow();
    return true;
  }

  /**
   * A tap on an icon that has no action of its own: its tip opens at once, with `extra` under its text (or,
   * when a tap had opened it, closes).
   */
  tap(id: TipId, target: TipTarget, extra?: unknown): void {
    this.cancel();
    if (this.current?.id === id && this.current.tapped) this.close();
    else if (this.show(id, target, true, extra)) {
      // Like a held tip it stays to be read, then goes by itself.
      this.stayTimer = this.clock.setTimeout(() => {
        this.stayTimer = null;
        this.close();
      }, stayMs);
    }
  }

  /** Closes the tip and drops anything pending (Escape, a press elsewhere, its thing gone). */
  close(): void {
    this.cancel();
    this.clearStay();
    if (this.current === null) return;
    this.current = null;
    for (const fn of this.listeners) fn(null);
  }

  /** Opens `id` at its target, unless the target is gone. */
  private show(id: TipId, target: TipTarget, tapped = false, extra?: unknown): boolean {
    const rect = target.alive() ? target.rect() : null;
    if (rect === null) {
      this.close();
      return false;
    }
    this.clearStay();
    this.current = {
      id,
      anchor: rect,
      alive: target.alive,
      tapped,
      ...(extra === undefined ? {} : { extra }),
    };
    for (const fn of this.listeners) fn(this.current);
    return true;
  }

  private swallowNextClick(target: TipTarget): void {
    this.clearSwallow();
    this.swallowFor = target;
  }

  /** The finger is up (or dragged away): its click comes now or never, so the swallow ends soon after. */
  private endSwallowSoon(): void {
    if (this.swallowFor === null) return;
    if (this.swallowTimer !== null) this.clock.clearTimeout(this.swallowTimer);
    this.swallowTimer = this.clock.setTimeout(() => this.clearSwallow(), SWALLOW_MS);
  }

  private clearSwallow(): void {
    if (this.swallowTimer !== null) this.clock.clearTimeout(this.swallowTimer);
    this.swallowTimer = null;
    this.swallowFor = null;
  }

  private clearStay(): void {
    if (this.stayTimer !== null) this.clock.clearTimeout(this.stayTimer);
    this.stayTimer = null;
  }

  private cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
