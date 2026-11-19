import { describe, expect, it } from 'vitest';
import { assignLooks, characterLookFor, drawCharacter } from '../src/character.ts';
import { drawIcon, hasIcon, ICON_MOTIFS, ROLE_IDS } from '../src/icons.ts';
import { PALETTES, paletteColours, SPRING } from '../src/palette.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';

const colours = (node: SvgNode): string[] => {
  const out: string[] = [];
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none') out.push(v.toLowerCase());
    }
  });
  return out;
};

describe('icons', () => {
  it('draws the six role emblems, each different, in both frames, within the allowlist and palette', () => {
    for (const frame of ['roundel', 'shield'] as const) {
      const svgs = ROLE_IDS.map((r) => toSvgString(drawIcon(`role:${r}`, SPRING, 48, { frame })));
      expect(new Set(svgs).size).toBe(6);
      for (const svg of svgs) expect(svg).not.toMatch(/NaN|undefined/);
    }
    for (const palette of PALETTES) {
      const allowed = paletteColours(palette);
      for (const r of ROLE_IDS) {
        for (const c of colours(drawIcon(`role:${r}`, palette, 48)))
          expect(allowed.has(c), c).toBe(true);
      }
    }
  });

  it('draws a neutral mark for unknown ids and a bad size, never an error', () => {
    const neutral = toSvgString(drawIcon('trait:no-such-thing', SPRING, 40));
    expect(toSvgString(drawIcon('whatever', SPRING, 40))).toBe(neutral);
    expect(toSvgString(drawIcon('constructor', SPRING, 40))).toBe(neutral);
    expect(hasIcon('role:scout')).toBe(true);
    expect(hasIcon('role:pathfinder')).toBe(false);
    expect(drawIcon('role:scout', SPRING, Number.NaN).attrs.width).toBe(48);
  });

  it('draws trait and quirk icons by key, quirks on a split tile, all within the palette', () => {
    const allowed = paletteColours(SPRING);
    for (const key of Object.keys(ICON_MOTIFS)) {
      const plain = drawIcon(key, SPRING, 48);
      const quirk = drawIcon(key, SPRING, 48, { tile: 'quirk' });
      expect(toSvgString(quirk)).not.toBe(toSvgString(plain));
      for (const c of colours(quirk)) expect(allowed.has(c), `${key} ${c}`).toBe(true);
      expect(toSvgString(quirk)).not.toMatch(/NaN|undefined/);
    }
    expect(Object.keys(ICON_MOTIFS).length).toBe(24);
    // A role's content icon key draws the role's emblem.
    expect(toSvgString(drawIcon('crook', SPRING, 48))).toBe(
      toSvgString(drawIcon('role:keeper', SPRING, 48)),
    );
  });
});

describe('character looks', () => {
  it('are seeded by id: the same id always looks the same', () => {
    expect(characterLookFor('ada')).toEqual(characterLookFor('ada'));
  });

  it('give fifteen characters fifteen different accent, headwear and garment combinations', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `c${i}`);
    const looks = assignLooks(ids);
    const keys = looks.map(({ accent, look }) => `${accent}|${look.headwear}|${look.garment}`);
    expect(new Set(keys).size).toBe(15);
    // A character keeps its look when characters join after it.
    expect(assignLooks(ids.slice(0, 5))).toEqual(looks.slice(0, 5));
  });

  it('draw every look within the palette and with no bad numbers', () => {
    const allowed = paletteColours(SPRING);
    for (const headwear of ['brim', 'hood', 'cap', 'none'] as const) {
      for (const garment of ['cloak', 'coat', 'robe'] as const) {
        for (const carry of ['staff', 'pack', 'both', 'none'] as const) {
          const drawn = drawCharacter(SPRING, 'sky', { x: 0, y: 0 }, 64, 0.8, 1.4, {
            headwear,
            garment,
            carry,
            skin: 2,
          });
          const svg = el('g', {}, drawn.nodes);
          expect(toSvgString(svg)).not.toMatch(/NaN|undefined/);
          for (const c of colours(svg)) expect(allowed.has(c), c).toBe(true);
        }
      }
    }
  });
});
