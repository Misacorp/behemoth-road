import { isometric, MORNING, renderScene, samplePatch } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { placePopover, splitScene } from './compose.ts';

describe('scene layers', () => {
  it('splits ground, figures and grain, drops the page vignette and stretches the grain to the screen', () => {
    const scene = renderScene({
      ...samplePatch(),
      projection: isometric(),
      palette: MORNING,
      seed: 1,
    });
    const layers = splitScene(scene);
    expect(layers.figures[0]?.attrs['filter']).toBe('url(#br-ink)');
    expect(layers.ground.some((n) => n.attrs['filter'] === 'url(#br-wash)')).toBe(true);
    expect(layers.ground.some((n) => String(n.attrs['fill']).includes('vignette'))).toBe(false);
    expect(layers.grain).toHaveLength(1);
    expect(layers.grain[0]?.attrs).toMatchObject({ x: 0, y: 0, width: '100%', height: '100%' });
    const total = layers.ground.length + layers.figures.length + layers.grain.length;
    expect(total).toBe(scene.children.length - 1);
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

  it('stays on screen at the edges', () => {
    const left = placePopover({ x: 5, y: 400 }, 40, size, screen, 10);
    expect(left.x).toBe(10);
    const right = placePopover({ x: 389, y: 400 }, 40, size, screen, 10);
    expect(right.x + right.width).toBe(380);
    const bottom = placePopover({ x: 200, y: 900 }, 40, size, screen, 10);
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(834);
  });
});
