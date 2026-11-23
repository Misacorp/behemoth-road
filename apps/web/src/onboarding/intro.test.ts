import { describe, expect, it } from 'vitest';
import { cardAfter, INTRO_CARDS, SWIPE_PX, swipeTo } from './intro.ts';

describe('the intro cards', () => {
  it('are a few, each with one short British-English line', () => {
    expect(INTRO_CARDS.length).toBeGreaterThanOrEqual(3);
    expect(INTRO_CARDS.length).toBeLessThanOrEqual(5);
    for (const c of INTRO_CARDS) {
      expect(c.line.length).toBeLessThanOrEqual(60);
      expect(c.line.split(/[.!?]/).filter(Boolean)).toHaveLength(1);
      expect(c.line).not.toMatch(/\b(color|defense|neighbor)\b/i);
    }
    expect(new Set(INTRO_CARDS.map((c) => c.id)).size).toBe(INTRO_CARDS.length);
  });

  it('turn by a swipe, not by a tap, and never before the first', () => {
    expect(swipeTo(1, -SWIPE_PX)).toBe(2);
    expect(swipeTo(1, SWIPE_PX)).toBe(0);
    expect(swipeTo(1, SWIPE_PX - 1)).toBeNull();
    expect(swipeTo(0, SWIPE_PX * 2)).toBeNull();
    // Past the last card the swipe says done (its index is the count).
    expect(swipeTo(INTRO_CARDS.length - 1, -SWIPE_PX)).toBe(INTRO_CARDS.length);
  });

  it('keep a step inside the cards', () => {
    expect(cardAfter(0, -1)).toBe(0);
    expect(cardAfter(INTRO_CARDS.length - 1, 1)).toBe(INTRO_CARDS.length - 1);
    expect(cardAfter(1, 1)).toBe(2);
  });
});
