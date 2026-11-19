import { isometric, MORNING, renderScene, samplePatch } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { chevronFor, placePopover, splitScene } from './compose.ts';

describe('scene layers', () => {
  it('splits the ground from the figures layer, keeping every node', () => {
    const scene = renderScene({
      ...samplePatch(),
      projection: isometric(),
      palette: MORNING,
      seed: 1,
      frame: 'none',
    });
    const layers = splitScene(scene);
    expect(layers.figures[0]?.attrs['data-layer']).toBe('objects');
    expect(layers.ground[0]?.tag).toBe('defs');
    expect([...layers.ground, ...layers.figures]).toEqual(scene.children);
  });
});

describe('popover placement', () => {
  const screen = { width: 390, height: 844 };
  const size = { width: 132, height: 76 };

  it('sits centred above the hex', () => {
    expect(placePopover({ x: 200, y: 400 }, 40, size, screen, 10)).toEqual({
      x: 134,
      y: 318,
      ...size,
    });
  });

  it('flips below the hex when there is no room above', () => {
    expect(placePopover({ x: 200, y: 50 }, 40, size, screen, 10).y).toBe(96);
  });

  it('goes below when asked and there is room, else above', () => {
    expect(placePopover({ x: 200, y: 400 }, 40, size, screen, 10, 'below').y).toBe(446);
    expect(placePopover({ x: 200, y: 780 }, 40, size, screen, 10, 'below').y).toBe(698);
  });

  it('stays on screen at the edges', () => {
    const left = placePopover({ x: 5, y: 400 }, 40, size, screen, 10);
    expect(left.x).toBe(10);
    const right = placePopover({ x: 389, y: 400 }, 40, size, screen, 10);
    expect(right.x + right.width).toBe(380);
    const bottom = placePopover({ x: 200, y: 900 }, 40, size, screen, 10);
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(834);
  });
});

describe('popover chevron', () => {
  const tip = (d: string) => d.split('L')[1]!.split(' ').map(Number) as [number, number];
  const screen = { width: 390, height: 844 };
  const size = { width: 132, height: 76 };

  it('points down at the thing from a card above it, at its x', () => {
    const anchor = { x: 200, y: 400 };
    const rect = placePopover(anchor, 40, size, screen, 10);
    const c = chevronFor(rect, anchor, 40);
    const [x, y] = tip(c.fill);
    expect(rect.x + x).toBeCloseTo(200, 0);
    expect(rect.y + y).toBeGreaterThan(rect.y + rect.height - 2);
    expect(rect.y + y).toBeLessThanOrEqual(anchor.y);
  });

  it('points up from a card below the thing', () => {
    const anchor = { x: 200, y: 50 };
    const rect = placePopover(anchor, 40, size, screen, 10);
    const [, y] = tip(chevronFor(rect, anchor, 40).fill);
    expect(y).toBeLessThan(0);
    expect(rect.y + y).toBeGreaterThanOrEqual(anchor.y + 40);
  });

  it('slides along the edge when the card is clamped, but stays clear of the corners', () => {
    const near = { x: 30, y: 400 };
    const rect = placePopover(near, 40, size, screen, 10);
    expect(rect.x + tip(chevronFor(rect, near, 40).fill)[0]).toBeCloseTo(36, 0);
    const edge = { x: 2, y: 400 };
    const clamped = placePopover(edge, 40, size, screen, 10);
    expect(tip(chevronFor(clamped, edge, 40).fill)[0]).toBe(26);
  });
});
