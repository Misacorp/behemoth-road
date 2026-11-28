/**
 * Hazards as the web reads them from the player view: terrain that harms a creature stepping onto it (the
 * core's `perilOnStep`, read through `stepPeril`), and scree fields (rockslides laid together, which carry
 * the field's `patch` id). Nothing here knows a rule.
 */
import {
  type CreatureStepOption,
  type GameStateView,
  type Hex,
  hexKey,
  stepPeril,
  terrainById,
} from '@behemoth-road/core';

/** The art kit's hazard icon key for a terrain, or null when the terrain is not a hazard. */
export function hazardIconOf(terrain: string): string | null {
  try {
    return (terrainById(terrain).perilOnStep ?? 0) > 0 ? terrain : null;
  } catch {
    return null;
  }
}

/** The hazard icon key for the terrain of a known hex, or null. */
export function hazardIconAt(state: GameStateView, h: Hex): string | null {
  const t = state.tiles[hexKey(h)]?.terrain;
  return t ? hazardIconOf(t) : null;
}

/** A creature step that would end on harmful ground. */
export interface HarmfulStep {
  readonly direction: string;
  /** The hex it would step onto (its new centre). */
  readonly centre: Hex;
  readonly terrain: string;
  /** The peril it adds. */
  readonly amount: number;
}

/**
 * The creature's possible steps that end on harmful ground (a poisoned lake, a glass waste), from the core's
 * `stepPeril` on what the view shows. A lingering creature takes no step, so none.
 */
export function harmfulSteps(
  state: GameStateView,
  predicted: readonly CreatureStepOption[],
): HarmfulStep[] {
  return predicted.flatMap((o) => {
    if (o.stay === true) return [];
    const peril = stepPeril(state.tiles, o.centre);
    return peril
      ? [{ direction: o.direction, centre: o.centre, terrain: peril.terrain, amount: peril.amount }]
      : [];
  });
}

/** The scree fields on the map: each field's id and the hexes of its rockslides, in field order. */
export function screeFields(
  state: GameStateView,
): { readonly patch: string; readonly hexes: Hex[] }[] {
  const fields = new Map<string, Hex[]>();
  for (const t of state.threats) {
    if (t.patch === undefined) continue;
    const list = fields.get(t.patch) ?? [];
    list.push(t.hex);
    fields.set(t.patch, list);
  }
  return [...fields].map(([patch, hexes]) => ({ patch, hexes }));
}
