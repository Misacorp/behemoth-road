import { describe, expect, it } from 'vitest';
import { closesOnRightClick, DRAG_SLOP, onMapSurface, OutsidePress } from './dismiss.ts';

const el = (inside: readonly string[]): { closest(s: string): unknown } => ({
  closest: (s: string) => (inside.includes(s) ? {} : null),
});
const mouse = { pointerType: 'mouse', button: 0, id: 1, x: 100, y: 100, onMap: true };

describe('onMapSurface', () => {
  it('is the map but not its popover, the HUD or nothing', () => {
    expect(onMapSurface(el(['svg.map']))).toBe(true);
    expect(onMapSurface(el(['svg.map', '.popover']))).toBe(false);
    expect(onMapSurface(el([]))).toBe(false);
    expect(onMapSurface(null)).toBe(false);
  });
});

describe('OutsidePress', () => {
  it('a click with no movement closes and swallows', () => {
    const o = new OutsidePress();
    o.down(mouse);
    expect(o.move(1, 100 + DRAG_SLOP, 100)).toBeNull();
    expect(o.up(1)).toBe('close-and-swallow');
    expect(o.tracking).toBe(false);
  });
  it('a drag closes at once and is not swallowed', () => {
    const o = new OutsidePress();
    o.down(mouse);
    expect(o.move(1, 100 + DRAG_SLOP + 1, 100)).toBe('close');
    expect(o.up(1)).toBeNull();
  });
  it('a cancel does nothing', () => {
    const o = new OutsidePress();
    o.down(mouse);
    o.cancel(1);
    expect(o.up(1)).toBeNull();
  });
  it('ignores touch, pen, other buttons, other pointers and presses off the map', () => {
    for (const p of [
      { ...mouse, pointerType: 'touch' },
      { ...mouse, pointerType: 'pen' },
      { ...mouse, button: 2 },
      { ...mouse, onMap: false },
    ]) {
      const o = new OutsidePress();
      o.down(p);
      expect(o.up(1)).toBeNull();
    }
    const o = new OutsidePress();
    o.down(mouse);
    expect(o.up(2)).toBeNull();
    expect(o.move(2, 500, 500)).toBeNull();
  });
});

describe('closesOnRightClick', () => {
  it('closes on the map when the setting allows', () => {
    expect(closesOnRightClick(true, { closeOnRightClick: true })).toBe(true);
    expect(closesOnRightClick(true, { closeOnRightClick: false })).toBe(false);
    expect(closesOnRightClick(false, { closeOnRightClick: true })).toBe(false);
  });
});
