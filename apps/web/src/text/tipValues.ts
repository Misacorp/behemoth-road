/**
 * The numbers tips may show, as named placeholders, read from the game's own tuning and content, so a tip
 * says what the rules say even after a change. `fillTip` puts them into a tip's text.
 */
import { STIMULUS_TYPES, type TuningConfig, UNLOCKS } from '@behemoth-road/core';

const percent = (p: number): string => String(Math.round(p * 100));

/** Every placeholder and its value for a game with this tuning. */
export function tipValues(config: TuningConfig): Readonly<Record<string, string>> {
  const values: Record<string, string> = {
    'surveyCost.scout': String(config.surveyCostSpecialist),
    'surveyCost.other': String(config.surveyCostOther),
    'siteChance.scholar.1': percent(config.siteChanceSpecialistTier1),
    'siteChance.scholar.2': percent(config.siteChanceSpecialistTier2),
    'siteChance.other.1': percent(config.siteChanceOtherTier1),
    workSiteCost: String(config.workSiteCost),
    packSize: String(config.packCapacity),
    'strike.guardian': String(config.clearPowerGuardian),
    'strike.other': String(config.clearPowerOther),
    defendReduction: String(config.defendReduction),
    'parleyFavour.envoy': String(config.parleyFavourEnvoy),
    'parleyFavour.other': String(config.parleyFavourOther),
    offerFavour: String(config.offerFavour),
    shelterPeril: String(config.shelterPeril),
    misleadDays: String(config.misleadDays),
    struckActions: String(config.struckActions),
    fireFuel: String(STIMULUS_TYPES.find((s) => s.id === 'fire')?.fuel.amount ?? 1),
  };
  for (const u of UNLOCKS) {
    if (u.movement) values[`climbCost.${u.id}`] = String(u.movement.cost);
  }
  return values;
}

/** The placeholders in a text, without their braces. */
export const placeholdersIn = (text: string): string[] =>
  [...text.matchAll(/\{([a-zA-Z0-9.-]+)\}/g)].map((m) => m[1]!);

/** A tip's text with its placeholders filled (an unknown one is left as written, and a test catches it). */
export const fillTip = (text: string, values: Readonly<Record<string, string>>): string =>
  text.replace(/\{([a-zA-Z0-9.-]+)\}/g, (all, key: string) => values[key] ?? all);
