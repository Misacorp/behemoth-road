/** The onboarding stylesheet follows the same rules as the app's: palette colours only, motion that can stop. */
import { SPRING, paletteColours } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { ROLE_CARDS } from './roleCards.ts';
import { ROLE_IDS } from '../ui/emblems.tsx';
import css from './onboarding.css?raw';

describe('onboarding styles', () => {
  it('use only palette colours', () => {
    const palette = paletteColours(SPRING);
    const found = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found.length).toBeGreaterThan(10);
    for (const c of found) expect(palette.has(c.toLowerCase()), c).toBe(true);
    expect(css).not.toMatch(/rgb|hsl/);
  });

  it('stop their motion for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/animation: none !important/);
  });

  it('show no focus outline of their own', () => {
    expect(css).not.toMatch(/outline\s*:\s*(?!none)/);
    expect(css).not.toMatch(/:focus-visible/);
  });
});

describe('role cards', () => {
  it('cover every role once, each with icons and one short line', () => {
    expect(ROLE_CARDS.map((c) => c.role).sort()).toEqual([...ROLE_IDS].sort());
    for (const c of ROLE_CARDS) {
      expect(c.does.length).toBeGreaterThanOrEqual(1);
      expect(c.line.length).toBeLessThanOrEqual(30);
      expect(c.line).not.toMatch(/[.!?]$/);
    }
  });
});
