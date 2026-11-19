/**
 * Turns pointer events into map gestures: one pointer drags, two pinch, and a press that never moves past
 * the slop is a tap. Pure (no DOM), so the classification is tested directly. Positions are screen px.
 */
import type { Point } from './pick.ts';

export type Gesture =
  /** A drag or pinch began: the map may switch to lighter effects until `end`. */
  | { readonly type: 'start' }
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  /** Zoom by `factor` around the screen point `at`. A pinch sends this, then a `pan` for the midpoint. */
  | { readonly type: 'zoom'; readonly factor: number; readonly at: Point }
  | { readonly type: 'tap'; readonly at: Point }
  | { readonly type: 'end' };

interface Tracked {
  readonly start: Point;
  last: Point;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export class GestureTracker {
  private readonly pointers = new Map<number, Tracked>();
  /** The current press sequence can no longer be a tap. */
  private spoilt = false;
  /** A drag or pinch is under way. */
  private active = false;

  constructor(private readonly slop: number) {}

  get isActive(): boolean {
    return this.active;
  }

  down(id: number, at: Point): Gesture[] {
    if (this.pointers.size >= 2) return [];
    this.pointers.set(id, { start: at, last: at });
    if (this.pointers.size === 2) {
      this.spoilt = true;
      return this.activate();
    }
    return [];
  }

  move(id: number, at: Point): Gesture[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    const out: Gesture[] = [];
    if (this.pointers.size === 1) {
      if (!this.active) {
        if (dist(at, p.start) <= this.slop) return [];
        this.spoilt = true;
        out.push(...this.activate());
      }
      if (at.x !== p.last.x || at.y !== p.last.y) {
        out.push({ type: 'pan', dx: at.x - p.last.x, dy: at.y - p.last.y });
      }
      p.last = at;
      return out;
    }
    const other = [...this.pointers.entries()].find(([key]) => key !== id)?.[1];
    if (!other) return [];
    const before = mid(p.last, other.last);
    const span = dist(p.last, other.last);
    p.last = at;
    const after = mid(at, other.last);
    const newSpan = dist(at, other.last);
    if (span > 0 && newSpan > 0 && newSpan !== span) {
      out.push({ type: 'zoom', factor: newSpan / span, at: before });
    }
    if (after.x !== before.x || after.y !== before.y) {
      out.push({ type: 'pan', dx: after.x - before.x, dy: after.y - before.y });
    }
    return out;
  }

  up(id: number, at: Point): Gesture[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    const out = this.move(id, at);
    this.pointers.delete(id);
    if (this.pointers.size > 0) return out;
    if (!this.spoilt && dist(at, p.start) <= this.slop) out.push({ type: 'tap', at: p.start });
    return [...out, ...this.reset()];
  }

  /** The browser took the pointer away (scroll, system gesture): never a tap. */
  cancel(id: number): Gesture[] {
    if (!this.pointers.delete(id)) return [];
    this.spoilt = true;
    return this.pointers.size > 0 ? [] : this.reset();
  }

  private activate(): Gesture[] {
    if (this.active) return [];
    this.active = true;
    return [{ type: 'start' }];
  }

  private reset(): Gesture[] {
    const wasActive = this.active;
    this.active = false;
    this.spoilt = false;
    return wasActive ? [{ type: 'end' }] : [];
  }
}
