/**
 * Small ink glyphs for idle stances and waiting (docs/design/stances.md): a crescent for rest, an eye for
 * watch, grass for lying in wait, a basket for gather, a grab handle for helping aboard, an hourglass for
 * waiting. Each is drawn in a 24-unit box centred on (0, 0) from straight and curved strokes only, then
 * mapped to wherever it is wanted: `drawGlyph` on its own (the HUD, the roster, the picker) and
 * `glyphBadge` on a paper disc (the mark on a map figure). Names come from content (`Stance.icon`); an
 * unknown name draws nothing.
 */
import { ellipsePath } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export const GLYPH_NAMES = ['moon', 'eye', 'grass', 'basket', 'rope', 'hourglass'] as const;
export type GlyphName = (typeof GLYPH_NAMES)[number];

/** A stroke or fill: path commands over points in the glyph's own 24-unit box. */
type Cmd = readonly [op: 'M' | 'L' | 'Q' | 'C' | 'Z', ...number[]];
interface Part {
  readonly cmds: readonly Cmd[];
  readonly fill?: 'ink' | 'wash';
  /** An open stroke, or a closed shape. */
}

const GLYPHS: Readonly<Record<GlyphName, readonly Part[]>> = {
  moon: [
    {
      cmds: [
        ['M', 3, -9],
        ['C', -6, -9, -10, 0, -6, 6],
        ['C', -3, 10, 4, 11, 9, 6],
        ['C', 2, 5, -1, -3, 3, -9],
        ['Z'],
      ],
      fill: 'wash',
    },
  ],
  eye: [
    {
      cmds: [['M', -10, 0], ['Q', 0, -9, 10, 0], ['Q', 0, 9, -10, 0], ['Z']],
    },
    { cmds: [['M', -3, 0], ['Q', 0, -3.4, 3, 0], ['Q', 0, 3.4, -3, 0], ['Z']], fill: 'ink' },
  ],
  grass: [
    {
      cmds: [
        ['M', -7, 9],
        ['Q', -9, 0, -4, -8],
      ],
    },
    {
      cmds: [
        ['M', -2, 9],
        ['Q', -2, -1, 0, -10],
      ],
    },
    {
      cmds: [
        ['M', 3, 9],
        ['Q', 3, 0, 8, -6],
      ],
    },
    {
      cmds: [
        ['M', 8, 9],
        ['Q', 8, 4, 10, 0],
      ],
    },
    {
      cmds: [
        ['M', -10, 9],
        ['L', 11, 9],
      ],
    },
  ],
  basket: [
    { cmds: [['M', -9, -2], ['L', 9, -2], ['L', 6, 9], ['L', -6, 9], ['Z']], fill: 'wash' },
    {
      cmds: [
        ['M', -6, -2],
        ['Q', 0, -12, 6, -2],
      ],
    },
    {
      cmds: [
        ['M', -7.6, 3],
        ['L', 7.6, 3],
      ],
    },
  ],
  rope: [
    {
      cmds: [
        ['M', -7, 9],
        ['C', -9, -11, 9, -11, 7, 9],
      ],
    },
    {
      cmds: [
        ['M', -10, 9],
        ['L', -4, 9],
      ],
    },
    {
      cmds: [
        ['M', 4, 9],
        ['L', 10, 9],
      ],
    },
    {
      cmds: [
        ['M', -3.4, -5],
        ['L', 3.4, -5],
      ],
    },
  ],
  hourglass: [
    {
      cmds: [
        ['M', -7, -10],
        ['L', 7, -10],
      ],
    },
    {
      cmds: [
        ['M', -7, 10],
        ['L', 7, 10],
      ],
    },
    {
      cmds: [
        ['M', -5, -10],
        ['Q', -5, -2, 0, 0],
        ['Q', 5, -2, 5, -10],
      ],
    },
    {
      cmds: [['M', -5, 10], ['Q', -5, 2, 0, 0], ['Q', 5, 2, 5, 10], ['Z']],
      fill: 'wash',
    },
  ],
};

/** Whether a string names a glyph. */
export const isGlyph = (name: string): name is GlyphName =>
  (GLYPH_NAMES as readonly string[]).includes(name);

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

/** A part's path mapped to centre (cx, cy) at `k` px per glyph unit. */
const pathOf = (cmds: readonly Cmd[], cx: number, cy: number, k: number): string =>
  cmds
    .map(([op, ...n]) => {
      if (op === 'Z') return 'Z';
      const pts: string[] = [];
      for (let i = 0; i < n.length; i += 2) {
        pts.push(`${f(cx + (n[i] as number) * k)} ${f(cy + (n[i + 1] as number) * k)}`);
      }
      return `${op}${pts.join(' ')}`;
    })
    .join('');

/**
 * A glyph's strokes centred on (cx, cy), `k` px per glyph unit (the box is 24 units), inked `width` thick.
 * `wash` fills the closed shapes. Nothing for an unknown name.
 */
export function glyphNodes(
  name: string,
  palette: Palette,
  cx: number,
  cy: number,
  k: number,
  width: number,
  wash: string = palette.paper,
): SvgNode[] {
  if (!isGlyph(name)) return [];
  return GLYPHS[name].map((part) => {
    const d = pathOf(part.cmds, cx, cy, k);
    if (part.fill === 'ink') return el('path', { d, fill: palette.ink, stroke: 'none' });
    const attrs = inkAttrs(palette.ink, width);
    return el('path', { d, ...attrs, ...(part.fill === 'wash' ? { fill: wash } : {}) });
  });
}

/** A glyph on its own, as a centred `<svg>` of `px` px (the HUD, the roster and the picker). */
export function drawGlyph(name: string, palette: Palette, px: number): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 24;
  return el(
    'svg',
    {
      viewBox: '-12 -12 24 24',
      width: size,
      height: size,
      'data-glyph': isGlyph(name) ? name : '',
    },
    glyphNodes(name, palette, 0, 0, 1, 1.6, palette.paper),
  );
}

/**
 * A glyph on a paper disc centred on (cx, cy) of radius `r` (a mark on a map figure), with a coloured
 * rim. `kind` is the part's `data-mark`.
 */
export function glyphBadge(
  palette: Palette,
  kind: string,
  name: string,
  cx: number,
  cy: number,
  r: number,
  rim: string,
  width: number,
): SvgNode {
  return el('g', { 'data-mark': kind }, [
    el('path', {
      d: ellipsePath(cx, cy, r, r),
      fill: palette.paper,
      stroke: rim,
      'stroke-width': width * 1.4,
    }),
    ...glyphNodes(name, palette, cx, cy, (r * 1.45) / 24, width * 0.9, palette.ramps.stone.light),
  ]);
}
