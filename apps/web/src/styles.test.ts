/** Guards for the page's CSP (no inline styles) and the "no new colours" rule. */
import { SPRING, paletteColours } from '@behemoth-road/art';
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
    expect(MAP_TUNING.paletteId).toBe(SPRING.id);
    const palette = paletteColours(SPRING);
    const found = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) expect(palette.has(c.toLowerCase())).toBe(true);
    expect(css).not.toMatch(/rgb|hsl/);
  });

  it('sets no inline style anywhere (the CSP forbids it)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) {
      // The world layer's CSS transform is the one CSSOM write (allowed by the CSP), kept in one file.
      if (file === './map/cssTransform.ts') continue;
      expect(text, file).not.toMatch(/\bstyle=|\.style\b|setAttribute\(\s*['"]style/);
    }
  });

  it('writes CSS from script only as the world transform, through the CSSOM', () => {
    const text = sources['./map/cssTransform.ts'] ?? '';
    expect(text.match(/\.style\b/g)).toEqual(['.style']);
    expect(text).toMatch(/\.style\.transform = value/);
    expect(text).not.toMatch(/style=|setAttribute|cssText/);
  });
});
