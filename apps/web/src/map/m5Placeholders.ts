/**
 * Stand-in drawings for Milestone 5 until the art kit's own (`m5/art`) land: threats with strength marks,
 * settlements by attitude with favour marks, the escort ring, shield and bandage marks, the peril gauge, the
 * route strip and the ending scenes. Plain shapes in the palette's colours, each returned as an `<svg>` node
 * with its own viewBox, so the map and the HUD place them by size alone. `art.ts` re-exports them: swapping
 * in the art kit's drawings is one edit there.
 */
import { el, type Palette, type SvgNode } from '@behemoth-road/art';

const n = (v: number): string => (Math.round(v * 100) / 100).toString();
const disc = (cx: number, cy: number, r: number): string =>
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
const line = (colour: string, width: number) => ({
  fill: 'none',
  stroke: colour,
  'stroke-width': width,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
});
const box = (children: SvgNode[], size: number, view = '-24 -24 48 48'): SvgNode =>
  el('svg', { viewBox: view, width: size, height: size }, children);

/** A row of `total` small marks centred at (0, y), the first `filled` inked. */
function marks(
  palette: Palette,
  total: number,
  filled: number,
  y: number,
  colour: string,
): SvgNode[] {
  const gap = 5.6;
  const out: SvgNode[] = [];
  for (let i = 0; i < total; i += 1) {
    const x = (i - (total - 1) / 2) * gap;
    out.push(
      el('path', {
        d: disc(x, y, 2.1),
        fill: i < filled ? colour : palette.paper,
        stroke: palette.ink,
        'stroke-width': 1,
      }),
    );
  }
  return out;
}

/** A small standing figure (a captor, a raider): head and body. */
const figure = (palette: Palette, x: number, y: number, fill: string): SvgNode[] => [
  el('path', {
    d: `M${n(x - 3.2)} ${n(y + 7)}L${n(x - 2.4)} ${n(y)}Q${n(x)} ${n(y - 2)} ${n(x + 2.4)} ${n(y)}L${n(x + 3.2)} ${n(y + 7)}Z`,
    fill,
    stroke: palette.ink,
    'stroke-width': 1.2,
  }),
  el('path', {
    d: disc(x, y - 3, 2.4),
    fill: palette.skin,
    stroke: palette.ink,
    'stroke-width': 1,
  }),
];

const THREAT_MOTIFS: Readonly<Record<string, (p: Palette) => SvgNode[]>> = {
  captors: (p) => [
    ...figure(p, -7, -2, p.accents.slate.base),
    ...figure(p, 7, -2, p.accents.slate.base),
    ...figure(p, 0, -5, p.accents.slate.shade),
    el('path', { d: 'M-12 6q12 5 24 0', ...line(p.ink, 1.4) }),
  ],
  swarm: (p) =>
    [
      [-8, -6],
      [6, -9],
      [0, 1],
    ].map(([x, y]) =>
      el('path', {
        d: `M${n(x! - 6)} ${n(y!)}q3 -3 6 1q3 -4 6 -1q-3 1 -6 4q-3 -3 -6 -4Z`,
        fill: p.accents.plum.base,
        stroke: p.ink,
        'stroke-width': 1.1,
      }),
    ),
  rockslide: (p) => [
    el('path', {
      d: 'M-13 7L-8 -2L-2 1L2 -8L9 -3L13 7Z',
      fill: p.ramps.rock.base,
      stroke: p.ink,
      'stroke-width': 1.3,
    }),
    el('path', { d: disc(5, -11, 3), fill: p.ramps.rock.shade, stroke: p.ink, 'stroke-width': 1 }),
    el('path', { d: 'M3 -6l-2 3M8 -8l1 3', ...line(p.inkSoft, 1) }),
  ],
  raiders: (p) => [
    ...figure(p, -6, -2, p.accents.coral.base),
    ...figure(p, 6, -2, p.accents.coral.base),
    el('path', { d: 'M9 -9l4 -6M-9 -9l-4 -6', ...line(p.ink, 1.4) }),
  ],
};

/**
 * A threat on its hex: a paper disc with its motif (by content icon; a plain mark for one this build does
 * not draw) and its strength as filled marks beneath.
 */
export function drawThreat(
  palette: Palette,
  icon: string,
  strength: number,
  size: number,
): SvgNode {
  const motif = THREAT_MOTIFS[icon]?.(palette) ?? [
    el('path', {
      d: 'M0 -10L9 7H-9Z',
      fill: palette.hint,
      stroke: palette.ink,
      'stroke-width': 1.3,
    }),
  ];
  const shown = Math.min(strength, 8);
  return box(
    [
      el('path', {
        d: disc(0, -1, 17),
        fill: palette.paper,
        stroke: palette.accents.coral.shade,
        'stroke-width': 2,
      }),
      ...motif,
      ...marks(palette, shown, shown, 19, palette.accents.coral.shade),
    ],
    size,
  );
}

/** A short ink arrow from a threat toward its next step: `dx`, `dy` is the step's direction (unit vector). */
export function drawApproach(palette: Palette, dx: number, dy: number, length: number): SvgNode[] {
  const tip = { x: dx * length, y: dy * length };
  const base = { x: dx * length * 0.55, y: dy * length * 0.55 };
  const w = length * 0.16;
  return [
    el('path', {
      d: `M${n(dx * length * 0.2)} ${n(dy * length * 0.2)}L${n(base.x)} ${n(base.y)}`,
      ...line(palette.accents.coral.shade, length * 0.07),
      'stroke-dasharray': `${n(length * 0.08)} ${n(length * 0.07)}`,
    }),
    el('path', {
      d: `M${n(base.x - dy * w)} ${n(base.y + dx * w)}L${n(tip.x)} ${n(tip.y)}L${n(base.x + dy * w)} ${n(base.y - dx * w)}Z`,
      fill: palette.accents.coral.shade,
      stroke: palette.ink,
      'stroke-width': length * 0.03,
      'stroke-linejoin': 'round',
    }),
  ];
}

const hut = (palette: Palette, x: number, y: number, s: number, roof: string): SvgNode[] => [
  el('path', {
    d: `M${n(x - 5 * s)} ${n(y + 5 * s)}V${n(y)}H${n(x + 5 * s)}V${n(y + 5 * s)}Z`,
    fill: palette.ramps.bark.light,
    stroke: palette.ink,
    'stroke-width': 1.1,
  }),
  el('path', {
    d: `M${n(x - 7 * s)} ${n(y + 0.5 * s)}L${n(x)} ${n(y - 6 * s)}L${n(x + 7 * s)} ${n(y + 0.5 * s)}Z`,
    fill: roof,
    stroke: palette.ink,
    'stroke-width': 1.2,
  }),
];

/**
 * A settlement: huts on its hex, its attitude readable at a glance (wary: smoke; friendly: a raised banner;
 * angry: torches and red roofs), and its favour toward friendship as marks beneath.
 */
export function drawSettlement(
  palette: Palette,
  attitude: 'wary' | 'friendly' | 'angry',
  favour: number,
  needed: number,
  size: number,
): SvgNode {
  const roof = attitude === 'angry' ? palette.accents.coral.base : palette.ramps.heath.base;
  const out: SvgNode[] = [...hut(palette, -7, 0, 1, roof), ...hut(palette, 7, 2, 0.9, roof)];
  if (attitude === 'wary') {
    out.push(el('path', { d: 'M-7 -8q-3 -4 0 -7t0 -7', ...line(palette.inkSoft, 1.4) }));
  } else if (attitude === 'friendly') {
    out.push(
      el('path', { d: 'M1 8V-18', ...line(palette.ink, 1.5) }),
      el('path', {
        d: 'M1 -18h10l-3 4 3 4H1Z',
        fill: palette.accents.sage.base,
        stroke: palette.ink,
        'stroke-width': 1.1,
      }),
    );
  } else {
    for (const x of [-14, 14]) {
      out.push(
        el('path', { d: `M${x} 8V-6`, ...line(palette.ink, 1.4) }),
        el('path', {
          d: `M${x} -6q-3 -4 0 -8q3 4 0 8Z`,
          fill: palette.accents.coral.base,
          stroke: palette.accents.coral.shade,
          'stroke-width': 1,
        }),
      );
    }
  }
  if (attitude === 'wary' && needed > 0) {
    out.push(...marks(palette, needed, favour, 16, palette.accents.sage.shade));
  }
  return box(out, size);
}

/** The shield a guardian's escort or defence gives: a small kite shield. */
export function drawShieldMark(palette: Palette, size: number): SvgNode {
  return box(
    [
      el('path', {
        d: 'M0 -14L12 -9Q12 6 0 14Q-12 6 -12 -9Z',
        fill: palette.accents.sky.light,
        stroke: palette.ink,
        'stroke-width': 2.4,
        'stroke-linejoin': 'round',
      }),
      el('path', { d: 'M0 -9V9M-7 -3H7', ...line(palette.accents.sky.shade, 2.2) }),
    ],
    size,
    '-16 -16 32 32',
  );
}

/** A bandage: a character a threat struck today. */
export function drawBandageMark(palette: Palette, size: number): SvgNode {
  return box(
    [
      el('path', {
        d: 'M-12 -4L4 -12L12 4L-4 12Z',
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      }),
      el('path', { d: 'M-2 -2l4 4M2 -2l-4 4', ...line(palette.accents.coral.shade, 2) }),
    ],
    size,
    '-16 -16 32 32',
  );
}

/**
 * The peril gauge: `max` marks, the first `peril` filled, with a notch before the mark where a homecoming
 * turns wounded (`woundedAt`). `width` × `width / 5` px.
 */
export function drawPerilGauge(
  palette: Palette,
  peril: number,
  max: number,
  woundedAt: number,
  width: number,
): SvgNode {
  const w = 100;
  const h = 20;
  const gap = w / Math.max(1, max);
  const out: SvgNode[] = [];
  for (let i = 0; i < max; i += 1) {
    const x = i * gap + 1;
    out.push(
      el('path', {
        d: `M${n(x + 1.5)} 5h${n(gap - 5)}a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h${n(-(gap - 5))}a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z`,
        fill:
          i < peril
            ? i >= woundedAt
              ? palette.accents.coral.shade
              : palette.accents.coral.base
            : palette.paper,
        stroke: palette.ink,
        'stroke-width': 1,
        ...(i < peril ? { 'data-filled': 'true' } : {}),
      }),
    );
  }
  const notch = woundedAt * gap - 0.5;
  out.push(el('path', { d: `M${n(notch)} 1V19`, ...line(palette.ink, 1.6) }));
  return el('svg', { viewBox: `0 0 ${w} ${h}`, width, height: width / 5 }, out);
}

/** The route: a thin strip of `length` steps, the first `steps` walked, with home at the end. */
export function drawRouteStrip(
  palette: Palette,
  steps: number,
  length: number,
  width: number,
): SvgNode {
  const w = 200;
  const h = 20;
  const end = w - 18;
  const x = (i: number): number => 6 + (i / Math.max(1, length)) * (end - 6);
  const walked = x(Math.min(steps, length));
  return el('svg', { viewBox: `0 0 ${w} ${h}`, width, height: (width * h) / w }, [
    el('path', { d: `M6 10H${n(end)}`, ...line(palette.inkSoft, 1.4), 'stroke-dasharray': '2 3' }),
    el('path', { d: `M6 10H${n(walked)}`, ...line(palette.ramps.trodden.shade, 3.2) }),
    el('path', {
      d: disc(walked, 10, 3.4),
      fill: palette.ramps.hide.base,
      stroke: palette.ink,
      'stroke-width': 1.2,
      'data-mark': 'route-at',
    }),
    el('path', {
      d: `M${n(end + 3)} 16V9L${n(end + 9)} 3L${n(end + 15)} 9V16Z`,
      fill: steps >= length ? palette.accents.ochre.base : palette.paper,
      stroke: palette.ink,
      'stroke-width': 1.3,
      'stroke-linejoin': 'round',
      'data-mark': 'route-home',
    }),
  ]);
}

/** A full-width ending scene for an outcome (a stand-in): home in the sun, home at dusk, or fog. */
export function drawEndingScene(
  palette: Palette,
  outcome: 'safe' | 'wounded' | 'lost',
  width: number,
): SvgNode {
  const w = 320;
  const h = 180;
  const sky =
    outcome === 'safe'
      ? palette.accents.sky.light
      : outcome === 'wounded'
        ? palette.accents.ochre.light
        : palette.fog;
  const out: SvgNode[] = [
    el('path', { d: `M0 0H${w}V${h}H0Z`, fill: sky }),
    el('path', { d: `M0 130Q160 110 320 132V180H0Z`, fill: palette.ramps.grass.base }),
  ];
  if (outcome !== 'lost') {
    out.push(
      el('path', {
        d: disc(outcome === 'safe' ? 250 : 270, outcome === 'safe' ? 40 : 108, 18),
        fill: outcome === 'safe' ? palette.accents.ochre.base : palette.accents.coral.base,
      }),
      ...hut(palette, 230, 110, 2.4, palette.ramps.heath.base),
      // The creature, resting by its home: a body, a head and legs.
      el('path', {
        d: 'M70 128q0 -36 44 -36q40 0 44 30q0 8 -8 8H78q-8 0 -8 -2Z',
        fill: palette.ramps.hide.base,
        stroke: palette.ink,
        'stroke-width': 2,
      }),
      el('path', {
        d: 'M150 104q18 -10 26 4q-6 10 -20 6Z',
        fill: palette.ramps.hide.base,
        stroke: palette.ink,
        'stroke-width': 2,
      }),
    );
    if (outcome === 'wounded') {
      out.push(
        el('path', {
          d: 'M100 100l16 -6l4 10l-16 6Z',
          fill: palette.paper,
          stroke: palette.ink,
          'stroke-width': 1.5,
        }),
      );
    }
  } else {
    out.push(
      el('path', { d: 'M40 150Q120 140 170 128T300 120', ...line(palette.ramps.trodden.shade, 4) }),
      el('path', {
        d: 'M0 70Q80 50 160 74T320 64V140H0Z',
        fill: palette.fog,
        opacity: 0.85,
      }),
      el('path', { d: 'M120 140l6 -4M140 136l6 -4M160 132l6 -4', ...line(palette.inkSoft, 2) }),
    );
  }
  return el('svg', { viewBox: `0 0 ${w} ${h}`, width, height: (width * h) / w }, out);
}
