/**
 * The numbers tips may show, as named placeholders, read from the game's own tuning and content, so a tip
 * says what the rules say even after a change. `fillTip` puts them into a tip's text.
 */
import {
  baseGatherYield,
  LURE_TYPES,
  roleEffects,
  STIMULUS_TYPES,
  type SkillEffect,
  type TuningConfig,
  UNLOCKS,
} from '@behemoth-road/core';

const percent = (p: number): string => String(Math.round(p * 100));

/**
 * The one effect of this kind in a role's tree that `pick` accepts (any when it is left out), read from the
 * content so a skill's text follows its numbers. Missing is an error: a tip must never show a guess.
 */
function effect<K extends SkillEffect['kind']>(
  role: string,
  kind: K,
  pick: (e: Extract<SkillEffect, { kind: K }>) => boolean = () => true,
): Extract<SkillEffect, { kind: K }> {
  const e = roleEffects(role, kind).find(pick);
  if (!e) throw new Error(`role ${role} has no matching ${kind} effect`);
  return e;
}

/** The little animal a lead moves: the lure tagged `small-beast`, by its content name. */
function leadName(): string {
  const lure = LURE_TYPES.find((l) => l.tags.includes('small-beast'));
  if (!lure) throw new Error('no lure is tagged small-beast');
  return lure.name.toLowerCase();
}

/** The numbers skill texts show (a skill's own number, and the base it replaces). */
function skillValues(config: TuningConfig): Record<string, string> {
  // The scout's two sight skills: the nearer first, the further second.
  const nearest = Math.min(...roleEffects('scout', 'glints').map((e) => e.range));
  const fire = effect('keeper', 'fire-boost');
  return {
    xpPerPick: String(config.xpPerPick),
    perilMax: String(config.perilMax),
    buildWork: String(config.buildWork),
    lingerCost: String(config.lingerCost),
    // A gather yields the node's own amount unless a skill says more.
    gatherYield: String(baseGatherYield()),
    bulwark: String(effect('warden', 'defend-reduction').amount),
    parleyBonus: String(effect('warden', 'parley-favour').bonus),
    parleyRange: String(effect('warden', 'parley-range').range),
    strikeRange: String(effect('warden', 'strike-range').range),
    escortRange: String(effect('warden', 'escort-range').range),
    surveyRange: String(effect('scout', 'survey-range').range),
    glintRange: String(effect('scout', 'glints', (e) => e.range === nearest).range),
    glintRange2: String(effect('scout', 'glints', (e) => e.range !== nearest).range),
    forecastDays: String(effect('scout', 'forecast').days),
    fieldKitCost: String(effect('scholar', 'action-cost', (e) => e.action === 'work-site').cost),
    steadyBonus: percent(effect('scholar', 'site-chance', (e) => e.tag === undefined).bonus),
    siteFinds: String(effect('scholar', 'site-finds').amount),
    lampBonus: percent(effect('scholar', 'site-chance', (e) => e.tag !== undefined).bonus),
    relicChance: percent(effect('scholar', 'find-bonus').chance),
    mapRange: String(effect('scholar', 'reveal-site').range),
    foodYield: String(effect('keeper', 'gather-yield', (e) => e.tag !== undefined).amount),
    feedCalm: String(effect('keeper', 'feed-calm').amount),
    hungerDays: String(effect('keeper', 'hunger-slow').everyDays),
    quietCost: String(effect('keeper', 'action-cost', (e) => e.action === 'linger').cost),
    beaconRange: String(fire.range),
    beaconNights: String(fire.nights ?? 0),
    doubleYield: String(effect('engineer', 'gather-yield', (e) => e.tag === undefined).amount),
    packMule: String(effect('engineer', 'pack-size').capacity),
    droneAmount: String(effect('engineer', 'drone').amount),
    quickWork: String(effect('engineer', 'build-work').amount),
    thrift: String(effect('engineer', 'build-discount').amount),
    tickWork: String(effect('engineer', 'build-tick').amount),
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
    lure: leadName(),
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
