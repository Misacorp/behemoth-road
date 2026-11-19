import { isometric, MORNING, renderScene, samplePatch } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { placePopover, splitScene } from './compose.ts';

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
