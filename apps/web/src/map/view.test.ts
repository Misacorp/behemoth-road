import { describe, expect, it } from 'vitest';
import {
  centreOn,
  inkZoomFor,
  lerpView,
  panBy,
  toScreen,
  toWorld,
  transformAttr,
  zoomAt,
} from './view.ts';

const limits = { min: 0.5, max: 2 };

describe('view transform', () => {
  it('maps world to screen and back', () => {
    const v = { x: 30, y: -12, scale: 1.7 };
    const p = { x: 123.4, y: -56.7 };
    const back = toWorld(v, toScreen(v, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('zooms around a point: the world point under it stays put', () => {
    const v = { x: 40, y: 25, scale: 1 };
    const at = { x: 200, y: 150 };
    const before = toWorld(v, at);
    const z = zoomAt(v, at, 1.5, limits);
    expect(z.scale).toBe(1.5);
    const after = toScreen(z, before);
    expect(after.x).toBeCloseTo(at.x, 9);
    expect(after.y).toBeCloseTo(at.y, 9);
  });

  it('clamps zoom and still keeps the anchor fixed', () => {
    const v = { x: 0, y: 0, scale: 1.8 };
    const at = { x: 50, y: 70 };
    const z = zoomAt(v, at, 10, limits);
    expect(z.scale).toBe(2);
    const p = toScreen(z, toWorld(v, at));
    expect(p.x).toBeCloseTo(at.x, 9);
    expect(p.y).toBeCloseTo(at.y, 9);
    expect(zoomAt(v, at, 0.01, limits).scale).toBe(0.5);
  });

  it('centres a world point on the screen', () => {
    const v = centreOn({ x: 100, y: -40 }, 2, { width: 390, height: 844 });
    expect(toScreen(v, { x: 100, y: -40 })).toEqual({ x: 195, y: 422 });
  });

  it('pans, interpolates and writes the transform', () => {
    const a = { x: 0, y: 0, scale: 1 };
    expect(panBy(a, 5, -3)).toEqual({ x: 5, y: -3, scale: 1 });
    expect(lerpView(a, { x: 10, y: 20, scale: 2 }, 0.5)).toEqual({ x: 5, y: 10, scale: 1.5 });
    expect(transformAttr({ x: 5, y: -3, scale: 1.5 })).toBe('matrix(1.5 0 0 1.5 5 -3)');
  });

  it('steps the ink zoom in half powers of two', () => {
    expect(inkZoomFor(1)).toBe(1);
    expect(inkZoomFor(1.1)).toBe(1);
    expect(inkZoomFor(0.37)).toBeCloseTo(Math.SQRT1_2 / 2, 9);
    expect(inkZoomFor(2.3)).toBe(2);
  });
});
