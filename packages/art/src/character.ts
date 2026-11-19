/**
 * A character as a small upright ink standee. Its look comes from data: the accent colour of its garment,
 * its headwear, the cut of its garment, what it carries and its skin tone, so many characters on the map
 * (fifteen on the creature's back) tell apart at a glance. Looks are seeded by character id.
 */
import { ART_TUNING } from './config.ts';
import { boxOf, ellipsePath, mapper, poly, smoothClosed, type Point } from './geom.ts';
import { ACCENTS, accentRamp, type Palette } from './palette.ts';
import { inkAttrs, riseFor, type Drawn } from './props.ts';
import { rngFor } from './rng.ts';
import { el, type SvgNode } from './svg.ts';

export interface CharacterLook {
  readonly headwear: 'brim' | 'hood' | 'cap' | 'none';
  readonly garment: 'cloak' | 'coat' | 'robe';
  readonly carry: 'staff' | 'pack' | 'both' | 'none';
  /** Index into the palette's skin tones. */
  readonly skin: number;
}

/** The explorer every character used to be: brimmed hat, cloak, staff and pack. */
export const DEFAULT_LOOK: CharacterLook = {
  headwear: 'brim',
  garment: 'cloak',
  carry: 'both',
  skin: 0,
};

const HEADWEAR = ['brim', 'hood', 'cap', 'none'] as const;
const GARMENTS = ['cloak', 'coat', 'robe'] as const;
const CARRY = ['staff', 'pack', 'both', 'none'] as const;

export interface CharacterArt {
  readonly id: string;
  readonly q: number;
  readonly r: number;
  /** An accent key from the palette (`ACCENTS`); unknown keys fall back to the first accent. */
  readonly accent: string;
  /** Its look (`characterLookFor(id)` or `assignLooks`); when absent, the default explorer (`DEFAULT_LOOK`). */
  readonly look?: CharacterLook;
}

/** A look seeded by the character's look seed (or id): the same seed always looks the same. */
export function characterLookFor(seed: number | string): CharacterLook {
  const rng = rngFor('character-look', seed);
  return {
    headwear: rng.pick(HEADWEAR),
    garment: rng.pick(GARMENTS),
    carry: rng.pick(CARRY),
    skin: rng.int(0, 2),
  };
}

/**
 * Looks and accents for characters from their look seeds (content's public `lookSeed`), in join order, such
 * that no two share the same accent, headwear and garment while there are combinations left (8 × 4 × 3 =
 * 96). Each seed tries its own seeded order of combinations and takes the first one still free, so a
 * character keeps its look as long as the characters before it stay. A join preview is
 * `assignLooks([...partySeeds, offerSeed]).at(-1)`: exactly the look the character gets on joining.
 */
export function assignLooks(seeds: readonly number[]): { accent: string; look: CharacterLook }[] {
  const taken = new Set<string>();
  return seeds.map((seed) => {
    const rng = rngFor('character-assign', seed);
    const combos: [string, CharacterLook['headwear'], CharacterLook['garment']][] = [];
    for (const a of ACCENTS)
      for (const h of HEADWEAR) for (const g of GARMENTS) combos.push([a, h, g]);
    // A seeded shuffle of all combinations.
    for (let i = combos.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      [combos[i], combos[j]] = [combos[j]!, combos[i]!];
    }
    const free = combos.find(([a, h, g]) => !taken.has(`${a}|${h}|${g}`)) ?? combos[0]!;
    taken.add(free.join('|'));
    const base = characterLookFor(seed);
    return { accent: free[0], look: { ...base, headwear: free[1], garment: free[2] } };
  });
}

const HEIGHT_UNITS = 50;

export function drawCharacter(
  palette: Palette,
  accent: string,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  look: CharacterLook = DEFAULT_LOOK,
): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  const T = mapper(origin, k, 1, k * riseFor(squash));
  const ramp = accentRamp(palette, accent);
  const skin = palette.skins[look.skin] ?? palette.skin;
  const w = ink * 0.95;
  const pts = (raw: readonly (readonly [number, number])[]): Point[] =>
    raw.map(([x, y]) => T(x, y));
  const inkLine = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const sq = squash / 0.6;
  const nodes: SvgNode[] = [];
  const all: Point[] = [T(-10.5, 0), T(10.5, 0)];

  nodes.push(
    fill(
      ellipsePath(origin.x + 2 * k, origin.y + 0.6 * k, 13 * k, 4 * k * sq),
      palette.shadow,
      0.18,
    ),
  );
  const base = ellipsePath(origin.x, origin.y, 10 * k, 3.2 * k * sq);
  nodes.push(fill(base, palette.paperDeep), inkLine(base, w * 0.8));

  // A pack on the back, behind the figure.
  if (look.carry === 'pack' || look.carry === 'both') {
    const pack = pts([
      [-12.5, -28],
      [-6, -29],
      [-5, -13],
      [-12, -12.5],
    ]);
    all.push(...pack);
    nodes.push(fill(poly(pack), palette.ramps.bark.base), inkLine(poly(pack), w * 0.8));
  }

  // The garment: a wide cloak, a short belted coat with legs below, or a long robe with a sash.
  let body: Point[];
  let shade: Point[];
  if (look.garment === 'coat') {
    const legs = pts([
      [-4.5, -12],
      [-1, -12],
      [-1.2, -2.5],
      [-4.6, -2.5],
    ]).concat(
      pts([
        [1, -12],
        [4.5, -12],
        [4.6, -2.5],
        [1.2, -2.5],
      ]),
    );
    nodes.push(
      fill(poly(legs.slice(0, 4)) + poly(legs.slice(4)), palette.ramps.bark.shade),
      inkLine(poly(legs.slice(0, 4)) + poly(legs.slice(4)), w * 0.7),
    );
    body = pts([
      [0, -33],
      [6.5, -30],
      [7.5, -20],
      [8, -11],
      [0, -10],
      [-8, -11],
      [-7.5, -20],
      [-6.5, -30],
    ]);
    shade = pts([
      [1.5, -32],
      [6.5, -30],
      [7.5, -20],
      [8, -11],
      [2, -10.5],
    ]);
  } else if (look.garment === 'robe') {
    body = pts([
      [0, -33],
      [6.5, -29.5],
      [8.5, -16],
      [9.5, -3],
      [0, -2],
      [-9.5, -3],
      [-8.5, -16],
      [-6.5, -29.5],
    ]);
    shade = pts([
      [1.5, -32],
      [6.5, -29.5],
      [8.5, -16],
      [9.5, -3],
      [2.5, -2.2],
    ]);
  } else {
    body = pts([
      [0, -33],
      [7, -29.5],
      [9, -16],
      [11, -5],
      [4, -3],
      [-4, -3],
      [-11, -5],
      [-9, -16],
      [-7, -29.5],
    ]);
    shade = pts([
      [1.5, -32],
      [7, -29.5],
      [9, -16],
      [11, -5],
      [4, -3],
      [2.5, -16],
    ]);
  }
  all.push(...body);
  if (look.garment !== 'coat') {
    const feet = [T(-3.6, -2.2), T(3.6, -2.2)];
    nodes.push(
      fill(
        feet.map((p) => ellipsePath(p.x, p.y, 2.4 * k, 1.5 * k)).join(''),
        palette.ramps.bark.shade,
      ),
    );
  }
  nodes.push(fill(smoothClosed(body), ramp.base), fill(smoothClosed(shade), ramp.shade, 0.6));
  if (look.garment === 'coat') {
    const belt = pts([
      [-7.6, -19],
      [7.6, -19],
    ]);
    nodes.push(inkLine(poly(belt, false), w * 1.6, palette.ramps.bark.shade));
  } else if (look.garment === 'robe') {
    const sash = pts([
      [-6.5, -27],
      [7.5, -17],
    ]);
    nodes.push(inkLine(poly(sash, false), w * 2.2, ramp.light));
  }
  nodes.push(inkLine(smoothClosed(body)));

  // A walking staff held in the right hand.
  if (look.carry === 'staff' || look.carry === 'both') {
    const staff = pts([
      [12.5, -1],
      [14, -42],
    ]);
    const hand = T(12.8, -20);
    all.push(...staff);
    nodes.push(
      inkLine(poly(staff, false), w * 1.3, palette.ramps.bark.shade),
      fill(ellipsePath(hand.x, hand.y, 2.2 * k, 2.2 * k), skin),
      inkLine(ellipsePath(hand.x, hand.y, 2.2 * k, 2.2 * k), w * 0.7),
    );
  }

  // Head and face.
  const head = T(0, -38.5);
  if (look.headwear === 'hood') {
    const hood = pts([
      [0, -48],
      [7, -45],
      [9, -38],
      [7.5, -31],
      [-7.5, -31],
      [-9, -38],
      [-7, -45],
    ]);
    all.push(...hood);
    nodes.push(fill(smoothClosed(hood), ramp.shade), inkLine(smoothClosed(hood)));
  }
  nodes.push(
    fill(ellipsePath(head.x, head.y, 7 * k, 7 * k), skin),
    inkLine(ellipsePath(head.x, head.y, 7 * k, 7 * k)),
  );
  const eyes = [T(-2.4, -38.5), T(2.4, -38.5)];
  nodes.push(
    fill(eyes.map((p) => ellipsePath(p.x, p.y, 0.85 * k, 0.95 * k)).join(''), palette.ink),
  );

  if (look.headwear === 'brim') {
    const brim = T(0, -43);
    const crown = pts([
      [-5.5, -43],
      [-4.8, -48],
      [-1, -50],
      [3.5, -49],
      [5.5, -43],
    ]);
    all.push(...crown, T(-10.5, -43));
    nodes.push(
      fill(smoothClosed(crown), palette.ramps.bark.base),
      fill(ellipsePath(brim.x, brim.y, 10.5 * k, 2.6 * k), palette.ramps.bark.base),
      inkLine(smoothClosed(crown) + ellipsePath(brim.x, brim.y, 10.5 * k, 2.6 * k), w * 0.9),
    );
  } else if (look.headwear === 'cap') {
    const cap = pts([
      [-7, -40.5],
      [-6, -45.5],
      [0, -47.5],
      [6, -45.5],
      [7, -40.5],
    ]);
    const bill = pts([
      [3, -41.5],
      [11, -41],
      [10, -39.5],
      [3, -40],
    ]);
    all.push(...cap, ...bill);
    nodes.push(
      fill(smoothClosed(cap), ramp.shade),
      fill(poly(bill), ramp.shade),
      inkLine(smoothClosed(cap) + poly(bill), w * 0.9),
    );
  } else if (look.headwear === 'none') {
    const hair = pts([
      [-7, -39],
      [-6, -44],
      [0, -46.5],
      [6, -44],
      [7, -39],
      [3, -42.5],
      [-3, -42.5],
    ]);
    all.push(...hair);
    nodes.push(
      fill(smoothClosed(hair), palette.ramps.bark.shade),
      inkLine(smoothClosed(hair), w * 0.8),
    );
  } else {
    // The hood's rim over the forehead.
    const rim = pts([
      [-7, -40],
      [0, -44.5],
      [7, -40],
    ]);
    nodes.push(inkLine(poly(rim, false), w * 0.9));
  }

  return { nodes, box: boxOf(all) };
}
