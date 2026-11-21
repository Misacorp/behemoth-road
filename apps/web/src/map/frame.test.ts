import { describe, expect, it } from 'vitest';
import { type Box, FrameCache, frameFrom, type FrameInputs } from './frame.ts';

const box = (top: number, height: number): Box => ({ top, height, bottom: top + height });
const base: FrameInputs = {
  size: { width: 400, height: 800 },
  map: box(0, 800),
  hudTop: box(0, 60),
  pips: box(740, 50),
  coverBottom: 0,
  pad: 10,
};

describe('frameFrom', () => {
  it('sits below the top HUD and above the pips', () => {
    expect(frameFrom(base)).toEqual({ x: 0, y: 70, width: 400, height: 730 - 70 });
  });

  it('is the whole screen without a HUD, or with one of height 0', () => {
    expect(frameFrom({ ...base, hudTop: null, pips: null })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 800,
    });
    expect(frameFrom({ ...base, hudTop: box(0, 0), pips: box(740, 0) }).height).toBe(800);
  });

  it('stops above a drawer when that is higher than the pips', () => {
    expect(frameFrom({ ...base, coverBottom: 400 }).height).toBe(400 - 70);
  });

  it('is never less than one px tall', () => {
    expect(frameFrom({ ...base, coverBottom: 790 }).height).toBe(1);
  });
});

describe('FrameCache', () => {
  it('measures once, however often it is read, until refreshed', () => {
    let reads = 0;
    const cache = new FrameCache(() => {
      reads += 1;
      return { x: 0, y: reads, width: 1, height: 1 };
    });
    expect(reads).toBe(0);
    for (let i = 0; i < 100; i += 1) expect(cache.get().y).toBe(1);
    expect(reads).toBe(1);
    expect(cache.refresh().y).toBe(2);
    expect(cache.get().y).toBe(2);
    expect(reads).toBe(2);
  });
});
