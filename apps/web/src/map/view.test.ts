import { describe, expect, it } from 'vitest';
import {
  centreOn,
  inkZoomFor,
  layerRaster,
  layerTransform,
  lerpView,
  panBy,
  toScreen,
  toWorld,
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
  });

  it('steps the ink zoom in half powers of two', () => {
    expect(inkZoomFor(1)).toBe(1);
    expect(inkZoomFor(1.1)).toBe(1);
    expect(inkZoomFor(0.37)).toBeCloseTo(Math.SQRT1_2 / 2, 9);
    expect(inkZoomFor(2.3)).toBe(2);
  });
});

describe('layerTransform', () => {
  it('puts every world point where the view puts it, for the layer drawn at any raster scale', () => {
    const parse = (t: string): number[] => (t.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (const v of [
      { x: 120, y: -40, scale: 0.75 },
      { x: -300, y: 260, scale: 1.9 },
    ]) {
      for (const raster of [0.5, 1, 1.4142]) {
        const origin = { x: -500, y: -320 };
        const [tx, ty, k] = parse(layerTransform(v, raster, origin)) as [number, number, number];
        for (const w of [
          { x: 0, y: 0 },
          { x: 210, y: -95 },
        ]) {
          // The layer draws world point w at ((w - origin) · raster); the transform maps that to the screen.
          const sx = tx + k * (w.x - origin.x) * raster;
          const sy = ty + k * (w.y - origin.y) * raster;
          const want = toScreen(v, w);
          expect(sx).toBeCloseTo(want.x, 1);
          expect(sy).toBeCloseTo(want.y, 1);
        }
      }
    }
  });
});

describe('layerRaster', () => {
  const limits = { maxSide: 4096, maxPixels: 16_000_000 };
  it('keeps the wanted step while the bitmap fits', () => {
    expect(layerRaster(1, { width: 1500, height: 1000 }, 2, limits)).toBe(1);
  });

  it('lowers the raster so neither side passes the limit', () => {
    const r = layerRaster(2.8, { width: 1500, height: 900 }, 3, limits);
    expect(1500 * r * 3).toBeLessThanOrEqual(4096 + 1e-6);
    expect(900 * r * 3).toBeLessThanOrEqual(4096);
    expect(r).toBeLessThan(2.8);
  });

  it('lowers the raster so the area stays within the limit', () => {
    const r = layerRaster(4, { width: 1300, height: 1300 }, 1, {
      maxSide: 1e9,
      maxPixels: 16_000_000,
    });
    expect(1300 * 1300 * r * r).toBeCloseTo(16_000_000, -3);
  });

  it('treats a missing device pixel ratio as 1', () => {
    expect(layerRaster(1, { width: 1000, height: 1000 }, Number.NaN, limits)).toBe(1);
  });
});

describe('the frame the map is seen in', () => {
  it('centres a point in a frame below the HUD, not in the whole screen', async () => {
    const { centreOn, toScreen } = await import('./view.ts');
    const frame = { x: 0, y: 120, width: 390, height: 600 };
    const v = centreOn({ x: 50, y: -30 }, 0.8, frame);
    expect(toScreen(v, { x: 50, y: -30 })).toEqual({ x: 195, y: 420 });
    // A bare size is a frame at the top left (as before).
    expect(
      toScreen(centreOn({ x: 0, y: 0 }, 1, { width: 100, height: 80 }), { x: 0, y: 0 }),
    ).toEqual({ x: 50, y: 40 });
  });
});
