/**
 * PROVISIONAL ADAPTER, until `m3/core` lands: the one module that knows how Milestone 3's chain appears in
 * the player view (revealed features, glints, the team inventory). Everything else in the web client reads
 * the chain through this file, so switching to the core's real types and rule functions is one edit here.
 *
 * Shape assumed (`docs/design/m3-chain.md` leaves it open): `game.features` maps a hex key to a revealed
 * feature, `game.glints` lists sensed hex keys, `game.inventory` maps content ids to counts.
 */
import { hexKey, type Hex } from '@behemoth-road/core';

export type FeatureKind = 'node' | 'site' | 'trap';

export interface Feature {
  readonly kind: FeatureKind;
  /** Content id (`iron-deposit`, `tomb`, `snare`…). */
  readonly id: string;
  /** Nodes: gathers left. */
  readonly charges?: number;
  /** Sites: 1 or 2. */
  readonly tier?: number;
  /** Sites: opened (the find taken); nodes: no charges left. */
  readonly spent?: boolean;
}

export interface Chain {
  readonly features: ReadonlyMap<string, Feature>;
  readonly glints: ReadonlySet<string>;
  readonly inventory: ReadonlyMap<string, number>;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function asFeature(x: unknown): Feature | null {
  if (!isRecord(x)) return null;
  const { kind, id } = x;
  if ((kind !== 'node' && kind !== 'site' && kind !== 'trap') || typeof id !== 'string')
    return null;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const charges = num(x['charges']);
  const tier = num(x['tier']);
  return {
    kind,
    id,
    ...(charges === undefined ? {} : { charges }),
    ...(tier === undefined ? {} : { tier }),
    ...(x['spent'] === true ? { spent: true } : {}),
  };
}

/** The chain parts of a view's game; absent parts are empty (a Milestone 2 view). */
export function chainOf(game: unknown): Chain {
  const g = isRecord(game) ? game : {};
  const features = new Map<string, Feature>();
  if (isRecord(g['features'])) {
    for (const [key, raw] of Object.entries(g['features'])) {
      const f = asFeature(raw);
      if (f) features.set(key, f);
    }
  }
  const glints = new Set<string>(
    Array.isArray(g['glints']) ? g['glints'].filter((k): k is string => typeof k === 'string') : [],
  );
  const inventory = new Map<string, number>();
  if (isRecord(g['inventory'])) {
    for (const [id, n] of Object.entries(g['inventory'])) {
      if (typeof n === 'number' && n > 0) inventory.set(id, n);
    }
  }
  return { features, glints, inventory };
}

export const featureAt = (chain: Chain, h: Hex): Feature | null =>
  chain.features.get(hexKey(h)) ?? null;
