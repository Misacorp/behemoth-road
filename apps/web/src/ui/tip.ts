/**
 * The tip controller: one tip open at a time, for the whole app (HTML controls, the map's SVG cards and the
 * map itself). With a mouse a tip opens after its group's delay and closes on leaving; on a touch screen it
 * opens on press-and-hold and closes on lifting or moving, and the hold never becomes a tap (the click that
 * follows is swallowed). Escape closes it. Timers are injected, so it is tested with fake ones.
 */
import { delays, holdMs, TIP_TABLE, type TipGroup, type TipId, tips } from '../text/tips.ts';

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
  role: 'content',
  trait: 'content',
  quirk: 'content',
  material: 'content',
  unlock: 'content',
  boon: 'content',
  people: 'content',
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
  private heldOpen = false;
  private swallow = false;
  private swallowTimer: number | null = null;
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
  hover(id: TipId, anchor: () => TipAnchor): void {
    this.cancel();
    const show = (): void => this.show({ id, anchor: anchor() });
    if (this.current !== null) show();
    else this.timer = this.clock.setTimeout(show, delayOf(id));
  }

  /** The mouse left `id`. */
  unhover(id: TipId): void {
    this.cancel();
    if (this.current?.id === id && !this.heldOpen) this.close();
  }

  /** A finger (or pen) went down on `id` at (x, y): its tip opens if it is held. */
  press(id: TipId, anchor: () => TipAnchor, x: number, y: number): void {
    this.cancel();
    if (this.current !== null) this.close();
    this.hold = { x, y };
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.heldOpen = true;
      this.swallow = true;
      this.show({ id, anchor: anchor() });
    }, holdMs);
  }

  /** The finger moved: past the slop it is a drag, not a hold. */
  move(x: number, y: number): void {
    if (!this.hold) return;
    if (Math.hypot(x - this.hold.x, y - this.hold.y) <= HOLD_SLOP) return;
    this.hold = null;
    this.cancel();
    if (this.heldOpen) this.close();
  }

  /**
   * The finger lifted (or the press was cancelled). Returns true when it was a hold that opened a tip: the
   * caller must not treat it as a tap, and the click that follows is swallowed (`takeClick`).
   */
  release(): boolean {
    this.hold = null;
    this.cancel();
    const held = this.heldOpen;
    if (held) {
      this.close();
      if (this.swallowTimer !== null) this.clock.clearTimeout(this.swallowTimer);
      this.swallowTimer = this.clock.setTimeout(() => {
        this.swallow = false;
        this.swallowTimer = null;
      }, SWALLOW_MS);
    }
    return held;
  }

  /** A click arrived: true when it ends a hold and must not act. */
  takeClick(): boolean {
    const s = this.swallow;
    this.swallow = false;
    return s;
  }

  /** A tap on an icon that has no action of its own: its tip opens at once (or closes, if it is open). */
  tap(id: TipId, anchor: TipAnchor): void {
    this.cancel();
    if (this.current?.id === id) this.close();
    else this.show({ id, anchor });
  }

  /** Closes the tip (Escape, a press elsewhere). */
  close(): void {
    this.cancel();
    this.heldOpen = false;
    if (this.current === null) return;
    this.current = null;
    for (const fn of this.listeners) fn(null);
  }

  private show(open: OpenTip): void {
    this.current = open;
    for (const fn of this.listeners) fn(open);
  }

  private cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
