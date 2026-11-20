import { describe, expect, it } from 'vitest';
import { holdMs } from '../text/tips.ts';
import { contextMenuDismisses, isHeldClick } from './pointer.ts';

describe('pointer rules', () => {
  it('only a mouse context menu dismisses', () => {
    expect(contextMenuDismisses('mouse')).toBe(true);
    expect(contextMenuDismisses('touch')).toBe(false);
    expect(contextMenuDismisses('pen')).toBe(false);
  });
  it('a touch click after a hold is dropped, a quick one and a mouse click are not', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs + 1 }, holdMs + 5)).toBe(true);
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs - 50 }, holdMs - 40)).toBe(false);
    expect(isHeldClick({ type: 'mouse', id: 1, at: 0, up: holdMs + 500 }, holdMs + 505)).toBe(
      false,
    );
  });
  it('a click long after a quick touch press is not held, even if the press was long ago', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: 100 }, 10_000)).toBe(false);
  });
  it('a press whose lift never came drops nothing', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: null }, holdMs + 1)).toBe(false);
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: null }, 60_000)).toBe(false);
  });
  it("a click long after a held press's lift is not that press's click", () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs + 100 }, holdMs + 5_000)).toBe(
      false,
    );
  });
});
