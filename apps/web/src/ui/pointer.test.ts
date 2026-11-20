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
    expect(isHeldClick({ type: 'touch', at: 0 }, holdMs + 1)).toBe(true);
    expect(isHeldClick({ type: 'touch', at: 0 }, holdMs - 50)).toBe(false);
    expect(isHeldClick({ type: 'mouse', at: 0 }, holdMs + 500)).toBe(false);
  });
});
