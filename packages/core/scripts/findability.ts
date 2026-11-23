/**
 * How soon a party meets each kind of resource node: for each seed, a new game
 * with the default config walks its season (the creature's real steps, no
 * players), and records the first day the window holds each node type.
 *
 * Run: `node --experimental-transform-types packages/core/scripts/findability.ts [seeds]`.
 * `test/findability.test.ts` asserts the goal across fixed seeds.
 */

import {
  createGame,
  featureType,
  hexDistance,
  hexKey,
  nextDay,
  windowHexes,
} from '../src/index.ts';

/** The materials measured: a node yielding one counts, whichever node type it is. */
export const MEASURED = ['stone', 'iron', 'timber', 'forage'] as const;

export type FirstDays = Record<(typeof MEASURED)[number], number | null>;

/** Hexes this close to the creature's centre are a day's walk out and back (3 actions). */
export const NEAR = 3;

/** Days measured: the goal is to meet each material within about a week. */
export const DAYS = 8;

/**
 * The first day (1 = the first day) the window holds a node of each measured material, up to `days`;
 * with `within`, only nodes that close to the creature's centre count.
 */
export const firstDays = (seed: number, days: number, within = Infinity): FirstDays => {
  const found: FirstDays = { stone: null, iron: null, timber: null, forage: null };
  let state = createGame(seed, { artSeed: 0 });
  while (state.day <= days) {
    for (const h of windowHexes(state)) {
      if (hexDistance(h, state.creature.centre) > within) continue;
      const f = state.features[hexKey(h)];
      const type = f && f.left > 0 ? featureType(f.type) : null;
      if (type?.kind !== 'node') continue;
      const material = type.yields.material;
      if (material in found) found[material as keyof FirstDays] ??= state.day;
    }
    if (state.season.status === 'over') break;
    state = nextDay(state);
  }
  return found;
};

/** Prints the measure for seeds 1..n (default 40) to the console. */
export const report = (n: number, log: (line: string) => void): void => {
  for (const [label, within] of [
    ['in the window', Infinity],
    [`within ${NEAR} of the creature`, NEAR],
  ] as const) {
    const rows = Array.from({ length: n }, (_, i) => firstDays(i + 1, DAYS, within));
    log(`${label}, days 1-${DAYS}:`);
    for (const m of MEASURED) {
      const known = rows.map((r) => r[m]).filter((d): d is number => d !== null);
      const median = known.sort((a, b) => a - b)[Math.floor(known.length / 2)] ?? '-';
      log(`  ${m}: ${known.length}/${n} seeds, median first day ${median}`);
    }
  }
};

// Run directly with Node (no Node types in this package, so `process` is read loosely).
const { process: proc, console: out } = globalThis as {
  process?: { argv: readonly string[] };
  console?: { log: (line: string) => void };
};
if (proc && out && (proc.argv[1] ?? '').endsWith('findability.ts')) {
  report(Number(proc.argv[2] ?? 40), (line) => out.log(line));
}
