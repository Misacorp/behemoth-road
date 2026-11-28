/**
 * The numbers tips may show, as named placeholders, read from the game's own tuning and content, so a tip
 * says what the rules say even after a change. `fillTip` puts them into a tip's text.
 */
import {
  LURE_TYPES,
  SKILL_NODES,
  STIMULUS_TYPES,
  type SkillEffect,
  type TuningConfig,
  UNLOCKS,
} from '@behemoth-road/core';

const percent = (p: number): string => String(Math.round(p * 100));

/** The effect of a skill node, read from the content so a skill's text follows its numbers. */
function effect<K extends SkillEffect['kind']>(
  id: string,
  kind: K,
): Extract<SkillEffect, { kind: K }> {
  const e = SKILL_NODES.find((n) => n.id === id)?.effect;
  if (e?.kind !== kind) throw new Error(`skill ${id} has no ${kind} effect`);
  return e as Extract<SkillEffect, { kind: K }>;
}

/** The numbers skill texts show (a skill's own number, and the base it replaces). */
function skillValues(config: TuningConfig): Record<string, string> {
  const fire = effect('keeper-b3', 'fire-boost');
  return {
    xpPerPick: String(config.xpPerPick),
    perilMax: String(config.perilMax),
    buildWork: String(config.buildWork),
    lingerCost: String(config.lingerCost),
    // A gather yields 1 unless a skill says more (`gatherYield` in the core).
    gatherYield: '1',
    bulwark: String(effect('warden-a1', 'defend-reduction').amount),
    parleyBonus: String(effect('warden-a2', 'parley-favour').bonus),
    parleyRange: String(effect('warden-b1', 'parley-range').range),
    strikeRange: String(effect('warden-b2', 'strike-range').range),
    escortRange: String(effect('warden-b3', 'escort-range').range),
    surveyRange: String(effect('scout-a2', 'survey-range').range),
    glintRange: String(effect('scout-b1', 'glints').range),
    glintRange2: String(effect('scout-b2', 'glints').range),
    forecastDays: String(effect('scout-b3', 'forecast').days),
    fieldKitCost: String(effect('scholar-a1', 'action-cost').cost),
    steadyBonus: percent(effect('scholar-a2', 'site-chance').bonus),
    siteFinds: String(effect('scholar-a3', 'site-finds').amount),
    lampBonus: percent(effect('scholar-b1', 'site-chance').bonus),
    relicChance: percent(effect('scholar-b2', 'find-bonus').chance),
    mapRange: String(effect('scholar-b3', 'reveal-site').range),
    foodYield: String(effect('keeper-a1', 'gather-yield').amount),
    feedCalm: String(effect('keeper-a2', 'feed-calm').amount),
    hungerDays: String(effect('keeper-a3', 'hunger-slow').everyDays),
    quietCost: String(effect('keeper-b1', 'action-cost').cost),
    beaconRange: String(fire.range),
    beaconNights: String(fire.nights ?? 0),
    doubleYield: String(effect('engineer-a1', 'gather-yield').amount),
    packMule: String(effect('engineer-a2', 'pack-size').capacity),
    droneAmount: String(effect('engineer-a3', 'drone').amount),
    quickWork: String(effect('engineer-b1', 'build-work').amount),
    thrift: String(effect('engineer-b2', 'build-discount').amount),
    tickWork: String(effect('engineer-b3', 'build-tick').amount),
  };
}

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
    actionsPerDay: String(config.actionsPerDay),
    'strike.warden': String(config.clearPowerWarden),
    'strike.other': String(config.clearPowerOther),
    defendReduction: String(config.defendReduction),
    'parleyFavour.warden': String(config.parleyFavourWarden),
    'parleyFavour.other': String(config.parleyFavourOther),
    offerFavour: String(config.offerFavour),
    shelterPeril: String(config.shelterPeril),
    misleadDays: String(config.misleadDays),
    brazierNights: String(config.brazierNights),
    slideFall: percent(config.slideFallChance),
    // Filled per thing when its tip opens (an odds mark's numbers); empty until then.
    note: '',
    // The little animal a lead moves, by its content name.
    lure: (LURE_TYPES[0]?.name ?? 'animal').toLowerCase(),
    struckActions: String(config.struckActions),
    fireFuel: String(
      STIMULUS_TYPES.find((s) => s.tags.includes('fire') && !s.tags.includes('fire-site'))?.fuel
        .amount ?? 1,
    ),
  };
  Object.assign(values, skillValues(config));
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
