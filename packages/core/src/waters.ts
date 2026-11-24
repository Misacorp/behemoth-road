/**
 * Ponds, lakes and seas, laid over the terrain rules. Each kind sits on a coarse grid of cells; a
 * cell holds at most one body of a kind, centred well inside it, so two bodies of a kind never
 * touch and a body's reach is known. A body is a ragged disc (`WaterKind`): deep water to its
 * radius and no further, so the longest line of deep hexes is bounded by the content, never by
 * luck. A pure function of (seed, hex), like the rest of the map.
 */

import type { WaterGeneration, WaterKind } from './content/index.ts';
import { type Hex, hexDistance, hexKey } from './hex.ts';
import { hashString, hashToUnit, type Seed } from './random.ts';

const STREAM = hashString('water');
const SQRT3 = Math.sqrt(3);

/** A hex's centre on the plane in hex steps (flat-top layout: x east, y south, neighbours 1 apart). */
const plane = (h: Hex): readonly [number, number] => [(1.5 * h.q) / SQRT3, h.r + h.q / 2];

/** The hex nearest a point of the plane (cube rounding). */
const nearestHex = (x: number, y: number): Hex => {
  const q = (x * SQRT3) / 1.5;
  const r = y - q / 2;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs + q + r);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
};

interface Body {
  readonly kind: WaterKind;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  /** The island's hex, when the body has one. */
  readonly island: Hex | null;
}

/**
 * Bodies already worked out, per water config (its identity) and then by seed and cell, so a game made
 * with other water settings never reads another's bodies.
 */
const bodyCaches = new WeakMap<WaterGeneration, Map<string, Body | null>>();

const bodyCacheFor = (waters: WaterGeneration): Map<string, Body | null> => {
  let cache = bodyCaches.get(waters);
  if (cache === undefined) {
    cache = new Map();
    bodyCaches.set(waters, cache);
  }
  return cache;
};

const distance = (body: Body, h: Hex): number => {
  const [x, y] = plane(h);
  return Math.hypot(x - body.cx, y - body.cy);
};

/** Per-hex edge erosion, 0 to ragged. */
const erosion = (seed: Seed, body: Body, h: Hex): number =>
  hashToUnit(seed, STREAM, 9, hashString(body.kind.id), h.q, h.r) * body.kind.ragged;

const isDeep = (seed: Seed, body: Body, h: Hex): boolean =>
  // The ring round an island is always deep, so it is never a headland reached on foot.
  (body.island !== null && hexDistance(body.island, h) <= 1) ||
  distance(body, h) <= body.radius - erosion(seed, body, h);

const isShore = (seed: Seed, body: Body, h: Hex): boolean =>
  distance(body, h) <= body.radius + body.kind.shore - erosion(seed, body, h);

/**
 * The body of a kind centred in a cell, or null. A body is whole or absent, never cut: it is
 * dropped when it would reach the dry start, or sit within a step and a half of an earlier kind's
 * body (ponds never merge into lakes, nor lakes into the sea).
 */
const bodyIn = (
  seedKey: string,
  seed: Seed,
  waters: WaterGeneration,
  index: number,
  gx: number,
  gy: number,
): Body | null => {
  const key = `${seedKey}/${index}/${gx}/${gy}`;
  const bodyCache = bodyCacheFor(waters);
  const cached = bodyCache.get(key);
  if (cached !== undefined) return cached;
  const kind = waters.kinds[index] as WaterKind;
  let body: Body | null = null;
  if (hashToUnit(seed, STREAM, index, gx, gy, 0) < kind.chance) {
    const [lo, hi] = kind.radius;
    const radius = lo + hashToUnit(seed, STREAM, index, gx, gy, 1) * (hi - lo);
    const reach = radius + kind.shore;
    const margin = reach + 0.01;
    const span = Math.max(0, kind.cell - 2 * margin);
    // Cell sides are in hex steps; the plane is too.
    const cx = gx * kind.cell + margin + hashToUnit(seed, STREAM, index, gx, gy, 2) * span;
    const cy = gy * kind.cell + margin + hashToUnit(seed, STREAM, index, gx, gy, 3) * span;
    body = { kind, cx, cy, radius, island: null };
    if (
      kind.island &&
      radius >= kind.island.minRadius &&
      hashToUnit(seed, STREAM, index, gx, gy, 4) < kind.island.chance
    ) {
      body = { ...body, island: nearestHex(cx, cy) };
    }
    if (Math.hypot(cx, cy) - reach <= waters.startClear) body = null;
    else if (index > 0 && touchesEarlier(seedKey, seed, waters, index, body)) body = null;
  }
  if (bodyCache.size > 20_000) bodyCache.clear();
  bodyCache.set(key, body);
  return body;
};

/** The bodies of a kind that can reach a hex: those centred in its cell or the eight around it. */
const bodiesNear = (
  seedKey: string,
  seed: Seed,
  waters: WaterGeneration,
  index: number,
  h: Hex,
): Body[] => {
  const cell = (waters.kinds[index] as WaterKind).cell;
  const [x, y] = plane(h);
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const found: Body[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const body = bodyIn(seedKey, seed, waters, index, gx + dx, gy + dy);
      if (body) found.push(body);
    }
  }
  return found;
};

/** Whether a body reaches within a step and a half of any earlier kind's body. */
const touchesEarlier = (
  seedKey: string,
  seed: Seed,
  waters: WaterGeneration,
  index: number,
  body: Body,
): boolean => {
  const centre = nearestHex(body.cx, body.cy);
  const reach = body.radius + body.kind.shore;
  for (let i = 0; i < index; i++) {
    const earlier = waters.kinds[i] as WaterKind;
    for (const other of bodiesNear(seedKey, seed, waters, i, centre)) {
      const gap = Math.hypot(other.cx - body.cx, other.cy - body.cy);
      if (gap <= reach + other.radius + earlier.shore + 1.5) return true;
    }
  }
  return false;
};

/**
 * The water terrain id at a hex (deep water, shallows or an island), or null when it is dry
 * land. Nothing within `startClear` of the origin, where the creature starts.
 */
export const waterIdAt = (seed: Seed, h: Hex, waters: WaterGeneration): string | null => {
  const seedKey = seed.join('.');
  for (const [index, kind] of waters.kinds.entries()) {
    const bodies = bodiesNear(seedKey, seed, waters, index, h);
    if (bodies.length === 0) continue;
    for (const body of bodies) {
      if (body.island && kind.island && hexKey(body.island) === hexKey(h)) {
        return kind.island.terrain;
      }
      if (isDeep(seed, body, h)) return kind.deep;
      if (kind.shallows && isShore(seed, body, h)) return kind.shallows;
    }
  }
  return null;
};
