/** Guards for the page's CSP (no inline styles) and the "no new colours" rule. */
import { MORNING, paletteColours } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { MAP_TUNING } from './map/config.ts';
import css from './styles.css?raw';

const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('page guards', () => {
  it('uses only palette colours in the stylesheet', () => {
    expect(MAP_TUNING.paletteId).toBe(MORNING.id);
    const palette = paletteColours(MORNING);
    const found = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) expect(palette.has(c.toLowerCase())).toBe(true);
    expect(css).not.toMatch(/rgb|hsl/);
  });

  it('sets no inline style anywhere (the CSP forbids it)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/\bstyle=|\.style\b|setAttribute\(\s*['"]style/);
    }
  });
});
