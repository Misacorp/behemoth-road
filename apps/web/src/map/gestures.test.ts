import { describe, expect, it } from 'vitest';
import { type Gesture, GestureTracker } from './gestures.ts';
import { toScreen, toWorld, zoomAt, panBy, type View } from './view.ts';

const at = (x: number, y: number) => ({ x, y });

describe('gesture classification', () => {
  it('a press held past the hold time is never a tap', () => {
    const t = new GestureTracker(8, 450);
    t.down(1, at(100, 100), 1000);
    expect(t.up(1, at(100, 100), 1451)).toEqual([]);
    t.down(1, at(100, 100), 2000);
    expect(t.up(1, at(100, 100), 2300)).toEqual([{ type: 'tap', at: at(100, 100) }]);
  });

  it('a press that does not move is a tap', () => {
    const t = new GestureTracker(8);
    expect(t.down(1, at(100, 100))).toEqual([]);
    expect(t.up(1, at(100, 100))).toEqual([{ type: 'tap', at: at(100, 100) }]);
  });

  it('a small wobble within the slop is still a tap, at the press point', () => {
    const t = new GestureTracker(8);
    t.down(1, at(100, 100));
    expect(t.move(1, at(104, 105))).toEqual([]);
    expect(t.up(1, at(103, 104))).toEqual([{ type: 'tap', at: at(100, 100) }]);
  });

  it('moving past the slop is a drag and never a tap, even if it comes back', () => {
    const t = new GestureTracker(8);
    t.down(1, at(100, 100));
    expect(t.move(1, at(120, 100))).toEqual([{ type: 'start' }, { type: 'pan', dx: 20, dy: 0 }]);
    expect(t.move(1, at(101, 100))).toEqual([{ type: 'pan', dx: -19, dy: 0 }]);
    expect(t.up(1, at(100, 100))).toEqual([{ type: 'pan', dx: -1, dy: 0 }, { type: 'end' }]);
  });

  it('two fingers pinch: zoom around the old midpoint, then pan by the midpoint shift', () => {
    const t = new GestureTracker(8);
    t.down(1, at(100, 100));
    expect(t.down(2, at(200, 100))).toEqual([{ type: 'start' }]);
    const out = t.move(2, at(300, 100));
    expect(out).toEqual([
      { type: 'zoom', factor: 2, at: at(150, 100) },
      { type: 'pan', dx: 50, dy: 0 },
    ]);
    // The world points under both fingers stay under them.
    let v: View = { x: 0, y: 0, scale: 1 };
    const a = toWorld(v, at(100, 100));
    const b = toWorld(v, at(200, 100));
    for (const g of out) {
      if (g.type === 'zoom') v = zoomAt(v, g.at, g.factor, { min: 0.1, max: 10 });
      if (g.type === 'pan') v = panBy(v, g.dx, g.dy);
    }
    expect(toScreen(v, a)).toEqual(at(100, 100));
    expect(toScreen(v, b)).toEqual(at(300, 100));
  });

  it('a pinch never ends in a tap, and the remaining finger pans', () => {
    const t = new GestureTracker(8);
    t.down(1, at(100, 100));
    t.down(2, at(200, 100));
    expect(t.up(2, at(200, 100))).toEqual([]);
    expect(t.move(1, at(110, 100))).toEqual([{ type: 'pan', dx: 10, dy: 0 }]);
    expect(t.up(1, at(110, 100))).toEqual([{ type: 'end' }]);
  });

  it('a cancelled pointer is not a tap', () => {
    const t = new GestureTracker(8);
    t.down(1, at(100, 100));
    expect(t.cancel(1)).toEqual([]);
    expect(t.up(1, at(100, 100))).toEqual([]);
    // The next press starts fresh.
    t.down(3, at(5, 5));
    expect(t.up(3, at(5, 5))).toEqual<Gesture[]>([{ type: 'tap', at: at(5, 5) }]);
  });

  it('ignores a third finger', () => {
    const t = new GestureTracker(8);
    t.down(1, at(0, 0));
    t.down(2, at(10, 0));
    expect(t.down(3, at(20, 0))).toEqual([]);
    expect(t.move(3, at(40, 0))).toEqual([]);
  });

  it('a reset (window blur or hidden) drops stuck pointers, ends the gesture, and the next one works', () => {
    const t = new GestureTracker(8);
    t.down(1, at(0, 0));
    t.down(2, at(50, 0));
    expect(t.count).toBe(2);
    expect(t.reset()).toEqual([{ type: 'end' }]);
    expect(t.count).toBe(0);
    expect(t.up(1, at(0, 0))).toEqual([]);
    t.down(7, at(10, 10));
    expect(t.up(7, at(10, 10))).toEqual<Gesture[]>([{ type: 'tap', at: at(10, 10) }]);
    expect(new GestureTracker(8).reset()).toEqual([]);
  });
});
