/**
 * Small ink icons on a 48-unit grid: the six role emblems in one shared frame, and the trait and quirk
 * icons, looked up by id. `drawIcon` returns a self-contained `<svg>` sized for the interface (readable at
 * 32 to 48 px). Unknown ids draw a neutral mark, never an error. Icons are drawn as data: a role is named
 * `role:<id>` or by its content icon key (`spyglass`, `crook`…), a trait or quirk by its content icon key
 * (`boot`, `owl`…).
 */
import { ellipsePath, poly, type Point } from './geom.ts';
import { ink, ITEM_MOTIFS, MATERIAL_MOTIFS, MOTIFS, solid, type IconMotif } from './icon-motifs.ts';
import { accentRamp, type Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

export type { IconMotif } from './icon-motifs.ts';

export const ROLE_IDS = ['scout', 'scholar', 'keeper', 'guardian', 'engineer', 'envoy'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export type EmblemFrame = 'roundel' | 'shield';

export interface IconOptions {
  /** The shared frame of the role emblems (default `roundel`). */
  readonly frame?: EmblemFrame;
  /**
   * The tile behind a trait or quirk icon: `quirk` adds a ring split into two colours (it helps and
   * hinders); `trait` and `plain` draw a plain tile.
   */
  readonly tile?: 'trait' | 'quirk' | 'plain';
}

const P = (x: number, y: number): Point => ({ x, y });

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

/** Keeper: a shepherd's crook with a leaf tied on. */
const keeper: IconMotif = (pal) => [
  ink(pal, 'M22 38V17c0-6 9-7 10-1 .5 3-2 5-4 4', 3.4, pal.ramps.bark.shade),
  ink(pal, 'M22 38V17c0-6 9-7 10-1 .5 3-2 5-4 4', 1.2, pal.ramps.bark.light),
  solid(pal, 'M22 24c-4-1-7 1-8 4 4 1 7-1 8-4z', pal.ramps.foliage.base, 1.6),
  ink(pal, 'M20.5 23.5l3 2', 1.4, pal.accents.rose.shade),
];

/** Guardian: a round shield with a boss and a band. */
const guardian: IconMotif = (pal) => [
  solid(pal, ellipsePath(24, 24, 11.5, 11.5), pal.ramps.stone.light),
  ink(pal, 'M24 12.5v23M12.5 24h23', 2.4, pal.ramps.bark.base),
  solid(pal, ellipsePath(24, 24, 3.4, 3.4), pal.ramps.stone.base, 1.6),
  ink(pal, ellipsePath(24, 24, 9, 9), 1.1, pal.inkSoft),
];

/** Engineer: a hammer. */
const engineer: IconMotif = (pal) => [
  solid(
    pal,
    'M15.6 34.6l12.8-12.8 2.3 2.3-12.8 12.8c-.6.6-1.7.6-2.3 0-.6-.6-.6-1.7 0-2.3z',
    pal.ramps.bark.base,
    1.8,
  ),
  solid(pal, 'M22.5 15.5l6-6 3 3 3-1 2 2-1 3 3 3-6 6z', pal.ramps.stone.base),
];

/** Envoy: a swallow-tailed banner on a pole. */
const envoy: IconMotif = (pal) => [
  ink(pal, 'M16 38V10', 2.6, pal.ramps.bark.shade),
  solid(pal, 'M16.5 12h17l-4 6 4 6h-17z', pal.accents.rose.base),
  ink(pal, 'M20 16.5h6', 1.4, pal.accents.rose.shade),
  solid(pal, ellipsePath(16, 9.5, 1.8, 1.8), pal.accents.ochre.base, 1.4),
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

/** Trait and quirk icons by the `icon` key content gives them; each motif follows the same 48-unit grid. */
export const ICON_MOTIFS: Readonly<Record<string, IconMotif>> = MOTIFS;
/** Materials sit on a rounded square tile, items on a round tile with a double ring. */
export { ITEM_MOTIFS, MATERIAL_MOTIFS };

/** Role icon keys as content names them, drawn as that role's emblem. */
export const ROLE_ICON_KEYS: Readonly<Record<string, RoleId>> = {
  spyglass: 'scout',
  book: 'scholar',
  crook: 'keeper',
  shield: 'guardian',
  hammer: 'engineer',
  banner: 'envoy',
};

/** The role an id names: `role:<role id>` or a role's icon key. */
function roleOf(id: string): RoleId | null {
  const role = id.startsWith('role:') ? id.slice(5) : '';
  if ((ROLE_IDS as readonly string[]).includes(role)) return role as RoleId;
  return Object.hasOwn(ROLE_ICON_KEYS, id) ? ROLE_ICON_KEYS[id]! : null;
}

function frameShape(frame: EmblemFrame): string {
  return frame === 'shield'
    ? 'M24 4.5L40 9.5V23c0 10-7 17-16 20.5C15 40 8 33 8 23V9.5z'
    : ellipsePath(24, 24, 20, 20);
}

/** A role emblem's frame, tint and motif, on the 48-unit grid. */
function emblem(palette: Palette, role: RoleId, frame: EmblemFrame): SvgNode[] {
  const tint = accentRamp(palette, ROLE_TINT[role]);
  const inner =
    frame === 'shield'
      ? 'M24 7.8L37.2 12v11c0 8.2-5.7 14-13.2 17.1C16.5 37 10.8 31.2 10.8 23V12z'
      : ellipsePath(24, 24, 17, 17);
  return [
    el('path', {
      d: frameShape(frame),
      fill: palette.paper,
      stroke: palette.ink,
      'stroke-width': 2.2,
    }),
    el('path', { d: inner, fill: tint.light, stroke: tint.shade, 'stroke-width': 1.2 }),
    ...ROLE_MOTIFS[role](palette),
  ];
}

/** A quirk's ring inside its tile: one half in the helping colour, one in the hindering colour. */
function quirkRing(palette: Palette): SvgNode[] {
  const r = 17;
  const arc = (from: number, to: number): string => {
    const a = (t: number): Point => P(24 + Math.cos(t) * r, 24 + Math.sin(t) * r);
    const p0 = a(from);
    const p1 = a(to);
    return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}A${r} ${r} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  };
  return [
    ink(palette, arc(Math.PI * 0.6, Math.PI * 1.4), 2.6, palette.accents.sage.base),
    ink(palette, arc(-Math.PI * 0.4, Math.PI * 0.4), 2.6, palette.accents.coral.base),
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
  return (
    roleOf(id) !== null ||
    Object.hasOwn(ICON_MOTIFS, id) ||
    Object.hasOwn(MATERIAL_MOTIFS, id) ||
    Object.hasOwn(ITEM_MOTIFS, id)
  );
}

/** An icon as a self-contained `<svg>` of `size` px. */
export function drawIcon(
  id: string,
  palette: Palette,
  size: number,
  options: IconOptions = {},
): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const role = roleOf(id);
  // A key can name both a quirk and a material (`stone`): a trait or quirk tile asks for the trait and quirk
  // drawing, anything else gets the material or item.
  const personal = options.tile === 'quirk' || options.tile === 'trait';
  const asMotif =
    Object.hasOwn(ICON_MOTIFS, id) &&
    (personal || !(Object.hasOwn(MATERIAL_MOTIFS, id) || Object.hasOwn(ITEM_MOTIFS, id)));
  let children: SvgNode[];
  if (role) {
    children = emblem(palette, role, options.frame ?? 'roundel');
  } else if (asMotif) {
    children = [
      el('path', {
        d: ellipsePath(24, 24, 20, 20),
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2.2,
      }),
      ...(options.tile === 'quirk' ? quirkRing(palette) : []),
      ...ICON_MOTIFS[id]!(palette),
    ];
  } else if (Object.hasOwn(MATERIAL_MOTIFS, id)) {
    children = [
      el('path', {
        d: 'M12 5h24a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7V12a7 7 0 0 1 7-7z',
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2.2,
      }),
      ...MATERIAL_MOTIFS[id]!(palette),
    ];
  } else if (Object.hasOwn(ITEM_MOTIFS, id)) {
    children = [
      el('path', {
        d: ellipsePath(24, 24, 20, 20),
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2.2,
      }),
      el('path', {
        d: ellipsePath(24, 24, 17.2, 17.2),
        fill: 'none',
        stroke: palette.inkSoft,
        'stroke-width': 1,
      }),
      ...ITEM_MOTIFS[id]!(palette),
    ];
  } else {
    children = neutral(palette);
  }
  return el('svg', { viewBox: '0 0 48 48', width: px, height: px }, children);
}
