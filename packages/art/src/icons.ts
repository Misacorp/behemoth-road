/**
 * Small ink icons on a 48-unit grid: the six role emblems in one shared frame, and the trait and quirk
 * icons, looked up by id. `drawIcon` returns a self-contained `<svg>` sized for the interface (readable at
 * 32 to 48 px). Unknown ids draw a neutral mark, never an error. Icons are drawn as data, so a content
 * entry names its icon by key (`role:scout`, `trait:…`, `quirk:…`).
 */
import { ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import { accentRamp, type Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

export const ROLE_IDS = ['scout', 'scholar', 'keeper', 'guardian', 'engineer', 'envoy'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export type EmblemFrame = 'roundel' | 'shield';

export interface IconOptions {
  /** The shared frame of the role emblems (default `roundel`). */
  readonly frame?: EmblemFrame;
}

/** What an icon draws inside its frame, on the 48-unit grid (centre 24, 24; keep within a radius of 13). */
export type IconMotif = (palette: Palette) => SvgNode[];

const P = (x: number, y: number): Point => ({ x, y });
const INK = 2.1;

function ink(palette: Palette, d: string, width = INK, colour?: string): SvgNode {
  return el('path', {
    d,
    fill: 'none',
    stroke: colour ?? palette.ink,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

function solid(palette: Palette, d: string, fill: string, width = INK): SvgNode {
  return el('path', {
    d,
    fill,
    stroke: palette.ink,
    'stroke-width': width,
    'stroke-linejoin': 'round',
  });
}

/** A rectangle from (x0, y0) to (x1, y1) turned by `a` radians about (cx, cy), as path data. */
function turnedRect(
  cx: number,
  cy: number,
  a: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = (x: number, y: number): Point => P(cx + x * c - y * s, cy + x * s + y * c);
  return poly([t(x0, y0), t(x1, y0), t(x1, y1), t(x0, y1)]);
}

/** Scout: a spyglass, drawn out, with a glint at its lens. */
const scout: IconMotif = (pal) => {
  const a = -Math.PI / 4;
  return [
    solid(pal, turnedRect(23, 25, a, -12, -2.6, -4, 2.6), pal.ramps.bark.base),
    solid(pal, turnedRect(23, 25, a, -4.5, -3.4, 3.5, 3.4), pal.ramps.stone.light),
    solid(pal, turnedRect(23, 25, a, 3, -4.4, 10.5, 4.4), pal.ramps.bark.base),
    solid(pal, ellipsePath(31.1, 16.9, 2.3, 2.3), pal.ramps.water.light, 1.6),
    ink(pal, 'M34.6 11.8l1.3-1.3M36 15.3h1.8M31.6 10.2V8.4', 1.5),
  ];
};

/** Scholar: an open book with lines of writing. */
const scholar: IconMotif = (pal) => [
  solid(
    pal,
    'M24 16.5C20 14 15.5 13.5 11 14.5V33c4.5-1 9-0.5 13 2zM24 16.5C28 14 32.5 13.5 37 14.5V33c-4.5-1-9-0.5-13 2z',
    pal.paper,
  ),
  ink(pal, 'M24 16.5V35'),
  ink(
    pal,
    'M14.5 19.5c2.6-.5 4.8-.3 6.5.5M14.5 23.5c2.6-.5 4.8-.3 6.5.5M14.5 27.5c2.6-.5 4.8-.3 6.5.5M27 20c1.7-.8 3.9-1 6.5-.5M27 24c1.7-.8 3.9-1 6.5-.5',
    1.4,
    pal.inkSoft,
  ),
];

/** Keeper: a sprig of three herb leaves on a curving stem. */
const keeper: IconMotif = (pal) => {
  const leaf = (x: number, y: number, a: number, l: number): string => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = (u: number, v: number): Point => P(x + u * c - v * s, y + u * s + v * c);
    return smoothClosed([t(0, 0), t(l * 0.45, -l * 0.26), t(l, 0), t(l * 0.45, l * 0.26)]);
  };
  return [
    ink(pal, smoothOpen([P(17, 36), P(22, 28), P(24, 21), P(25, 12)])),
    solid(pal, leaf(22.6, 27.5, -2.55, 11.5), pal.ramps.foliage.base, 1.8),
    solid(pal, leaf(24, 21, -0.5, 11.5), pal.ramps.foliage.base, 1.8),
    solid(pal, leaf(25, 13.5, -1.6, 9), pal.ramps.foliage.light, 1.8),
  ];
};

/** Guardian: an upright sword with a crossguard. */
const guardian: IconMotif = (pal) => [
  solid(pal, 'M24 9.5L26.6 13V29H21.4V13Z', pal.ramps.stone.light, 1.8),
  ink(pal, 'M24 13.5V27.5', 1.1, pal.inkSoft),
  solid(pal, 'M16 29H32V32.2H16Z', pal.ramps.bark.base, 1.8),
  solid(pal, 'M22.4 32.2H25.6V37.5H22.4Z', pal.ramps.bark.shade, 1.6),
  solid(pal, ellipsePath(24, 39.2, 2.2, 2.2), pal.ramps.bark.base, 1.6),
];

/** Engineer: a cog with eight teeth around a hub. */
const engineer: IconMotif = (pal) => {
  const pts: Point[] = [];
  const teeth = 8;
  for (let i = 0; i < teeth; i += 1) {
    const a0 = (Math.PI * 2 * i) / teeth;
    const step = (Math.PI * 2) / teeth;
    for (const [f, r] of [
      [0.0, 9.5],
      [0.12, 12.5],
      [0.38, 12.5],
      [0.5, 9.5],
    ] as const) {
      pts.push(P(24 + Math.cos(a0 + f * step) * r, 24 + Math.sin(a0 + f * step) * r));
    }
  }
  return [
    solid(pal, `${poly(pts)}${ellipsePath(24, 24, 3.6, 3.6)}`, pal.ramps.stone.base),
    el('path', { d: ellipsePath(24, 24, 3.6, 3.6), fill: pal.paper }),
    ink(pal, ellipsePath(24, 24, 3.6, 3.6), 1.6),
  ];
};

/** Envoy: a rolled scroll with a hanging seal. */
const envoy: IconMotif = (pal) => [
  solid(pal, 'M14 17h20v13H14z', pal.paper),
  solid(pal, ellipsePath(14, 23.5, 2.6, 6.5), pal.ramps.stone.light, 1.8),
  solid(pal, ellipsePath(34, 23.5, 2.6, 6.5), pal.ramps.stone.light, 1.8),
  ink(pal, 'M18.5 21.5h11M18.5 25.5h8', 1.4, pal.inkSoft),
  ink(pal, 'M27 30l-1 6M29 30l2 5.5', 1.6, pal.accents.rose.shade),
  solid(pal, ellipsePath(28, 30.5, 2.8, 2.8), pal.accents.rose.base, 1.6),
];

/** The wash colour behind each role's motif, so the set tells apart by colour too. */
const ROLE_TINT: Readonly<Record<RoleId, string>> = {
  scout: 'sky',
  scholar: 'plum',
  keeper: 'sage',
  guardian: 'slate',
  engineer: 'ochre',
  envoy: 'rose',
};

const ROLE_MOTIFS: Readonly<Record<RoleId, IconMotif>> = {
  scout,
  scholar,
  keeper,
  guardian,
  engineer,
  envoy,
};

/**
 * Icons that are not role emblems, by key (`trait:…`, `quirk:…`). Drawn in a plain round tile; each
 * motif follows the same 48-unit grid. Filled from content as traits and quirks gain icons.
 */
export const ICON_MOTIFS: Record<string, IconMotif> = {};

function frameShape(frame: EmblemFrame): string {
  return frame === 'shield'
    ? 'M24 4.5L40 9.5V23c0 10-7 17-16 20.5C15 40 8 33 8 23V9.5z'
    : ellipsePath(24, 24, 20, 20);
}

/** A role emblem's frame, tint and motif, on the 48-unit grid. */
function emblem(palette: Palette, role: RoleId, frame: EmblemFrame): SvgNode[] {
  const tint = accentRamp(palette, ROLE_TINT[role]);
  const shape = frameShape(frame);
  const inner =
    frame === 'shield'
      ? 'M24 7.8L37.2 12v11c0 8.2-5.7 14-13.2 17.1C16.5 37 10.8 31.2 10.8 23V12z'
      : ellipsePath(24, 24, 17, 17);
  return [
    el('path', { d: shape, fill: palette.paper, stroke: palette.ink, 'stroke-width': 2.2 }),
    el('path', { d: inner, fill: tint.light, stroke: tint.shade, 'stroke-width': 1.2 }),
    ...ROLE_MOTIFS[role](palette),
  ];
}

/** The neutral mark for an id with no icon: a dotted ring around a small diamond. */
function neutral(palette: Palette): SvgNode[] {
  return [
    el('path', {
      d: ellipsePath(24, 24, 18, 18),
      fill: palette.paper,
      stroke: palette.inkSoft,
      'stroke-width': 2,
      'stroke-dasharray': '0.1 4.6',
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: poly([P(24, 18.5), P(29.5, 24), P(24, 29.5), P(18.5, 24)]),
      fill: palette.inkSoft,
    }),
  ];
}

/** Whether an id names an icon the kit draws (otherwise `drawIcon` draws the neutral mark). */
export function hasIcon(id: string): boolean {
  const role = id.startsWith('role:') ? id.slice(5) : '';
  return (ROLE_IDS as readonly string[]).includes(role) || Object.hasOwn(ICON_MOTIFS, id);
}

/** An icon as a self-contained `<svg>` of `size` px. */
export function drawIcon(
  id: string,
  palette: Palette,
  size: number,
  options: IconOptions = {},
): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const role = id.startsWith('role:') ? id.slice(5) : '';
  let children: SvgNode[];
  if ((ROLE_IDS as readonly string[]).includes(role)) {
    children = emblem(palette, role as RoleId, options.frame ?? 'roundel');
  } else if (Object.hasOwn(ICON_MOTIFS, id)) {
    children = [
      el('path', {
        d: ellipsePath(24, 24, 20, 20),
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2.2,
      }),
      ...ICON_MOTIFS[id]!(palette),
    ];
  } else {
    children = neutral(palette);
  }
  return el('svg', { viewBox: '0 0 48 48', width: px, height: px }, children);
}
