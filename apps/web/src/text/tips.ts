/**
 * TIPS: the short texts that appear when you hover over an icon (desktop) or press and hold it (phone).
 *
 * How to edit (Misa):
 * - Change any `text` below; keep it to one or two short lines, in British English.
 * - `title` is optional. Without it the tip shows the thing's own name from the game content
 *   (for example "Scout" or "Iron").
 * - `delays` sets how long the pointer must rest on an icon before its tip opens, in milliseconds, for each
 *   group of icons. One entry can wait longer or shorter with its own `delayMs`.
 * - `holdMs` is how long a finger must press before the tip opens on a phone.
 * - Numbers come from the game's rules: write a placeholder in curly brackets, such as {packSize} or
 *   {surveyCost.scout}, and the tip shows the current number in its place. Then a change to the rules never
 *   leaves a tip saying something old. The placeholders you can use are listed in `tipValues.ts` next to
 *   this file; a test fails if a tip uses one that does not exist.
 * - Never say what something undiscovered does, or how the creature secretly reacts.
 * - Every icon in the game needs an entry here; a test fails if one is missing.
 */

export type TipGroup = 'hud' | 'action' | 'content' | 'map' | 'default';

export interface Tip {
  /** Shown in bold. Leave it out to use the thing's name from the game content. */
  readonly title?: string;
  /** One or two short lines. */
  readonly text: string;
  /** Which delay applies (by default worked out from the start of the tip's id). */
  readonly group?: TipGroup;
  /** Overrides the group's delay for this one tip, in milliseconds. */
  readonly delayMs?: number;
}

/** How long to rest the pointer on an icon before its tip opens, in milliseconds, per group. */
export const delays = {
  hud: 0,
  action: 300,
  content: 500,
  map: 700,
  default: 400,
} as const satisfies Record<TipGroup, number>;

/** How long a finger presses before the tip opens on a touch screen, in milliseconds. */
export const holdMs = 450;

export const tips = {
  // Roles (the six emblems).
  'role:scout': {
    text: 'Explores ahead. Surveys a neighbouring hex for {surveyCost.scout} action (others pay {surveyCost.other}).',
  },
  'role:scholar': {
    text: 'Works tombs: {siteChance.scholar.1} % a try, against {siteChance.other.1} % for others. Only scholars can work deep tombs ({siteChance.scholar.2} %).',
  },
  'role:keeper': {
    text: 'Reads the creature’s signs and tends it. Riding, can make it stay put for a day.',
  },
  'role:guardian': {
    text: 'Strikes threats harder ({strike.guardian} against {strike.other}) and is never struck. Standing on a hex, keeps those next to them safe.',
  },
  'role:engineer': {
    text: 'Builds the team’s unlocks from the stores, while riding the creature.',
  },
  'role:envoy': {
    text: 'Speaks for the team. A parley wins {parleyFavour.envoy} favour (others {parleyFavour.other}), with no risk of anger.',
  },

  // Traits: a character's knack. Not in play yet.
  'trait:sure-footed': { text: 'At home on steep ground. Not in play yet.' },
  'trait:sand-born': { text: 'At home in dry country. Not in play yet.' },
  'trait:river-wise': { text: 'At home by water. Not in play yet.' },
  'trait:woodwise': { text: 'At home in woods. Not in play yet.' },
  'trait:keen-eyed': { text: 'Spots what others miss. Not in play yet.' },
  'trait:night-sighted': { text: 'Sees well after dark. Not in play yet.' },
  'trait:broad-backed': { text: 'Carries more than most. Not in play yet.' },
  'trait:deft-handed': { text: 'Good with tools and fine work. Not in play yet.' },
  'trait:herb-wise': { text: 'Knows plants: good at foraging and tending. Not in play yet.' },
  'trait:lore-learned': { text: 'Knows old places and their stories. Not in play yet.' },
  'trait:fair-spoken': { text: 'Easy to trust: good with the peoples. Not in play yet.' },
  'trait:beast-friend': { text: 'Animals take to them, the creature too. Not in play yet.' },

  // Quirks: help in one way, hinder in another.
  'quirk:restless': { text: 'Helps: getting about. Hinders: resting. Not in play yet.' },
  'quirk:magpie': { text: 'Helps: finding things. Hinders: carrying. Not in play yet.' },
  'quirk:night-owl': { text: 'Helps: at night. Hinders: in the morning. Not in play yet.' },
  'quirk:stubborn': {
    text: 'Helps: holding ground. Hinders: talking with the peoples. Not in play yet.',
  },
  'quirk:curious': { text: 'Helps: discovering. Hinders: avoiding traps. Not in play yet.' },
  'quirk:superstitious': { text: 'Helps: old lore. Hinders: working old sites. Not in play yet.' },
  'quirk:hoarder': { text: 'Helps: carrying. Hinders: making things. Not in play yet.' },
  'quirk:loud': { text: 'Helps: with the creature. Hinders: going unseen. Not in play yet.' },
  'quirk:squeamish': { text: 'Helps: staying careful. Hinders: gathering. Not in play yet.' },
  'quirk:daydreamer': { text: 'Helps: old lore. Hinders: noticing things. Not in play yet.' },
  'quirk:gourmand': { text: 'Helps: tending. Hinders: saving food. Not in play yet.' },
  'quirk:old-bones': { text: 'Helps: old lore. Hinders: getting about. Not in play yet.' },

  // Materials (in packs and the team stores).
  'material:iron': {
    text: 'From iron deposits and outcrops. Builds the grappling hook and the spikes.',
  },
  'material:stone': { text: 'From river stones and fieldstones. Builds the lantern.' },
  'material:timber': {
    text: 'From timber stands and deadfall. Builds unlocks, and {fireFuel} fuels a fire.',
  },
  'material:ancient-alloy': { text: 'Found in deep tombs. Builds the climbing spikes.' },
  'material:old-coin': {
    text: 'Found in small tombs. Offer it to a wary settlement for favour, without risk.',
  },
  'material:forage': { text: 'Food from berry bushes. Feed it to the creature from the stores.' },

  // Unlocks (built by engineers, for the whole team).
  'unlock:grappling-hook': {
    text: 'Lets everyone climb cliffs, for {climbCost.grappling-hook} actions a step.',
  },
  'unlock:lantern': { text: 'Light for deep tombs, so a scholar can work them.' },
  'unlock:climbing-spikes': { text: 'Cliffs cost only {climbCost.climbing-spikes} action a step.' },

  // Actions (buttons in the cards and the hub).
  'action:survey': {
    text: 'Look into a neighbouring hex without entering it. {surveyCost.scout} action for a scout, {surveyCost.other} for others.',
  },
  'action:gather': { text: 'Take one unit from here into your pack.' },
  'action:work-site': {
    text: 'Search the tomb ({workSiteCost} actions). If nothing turns up, try again another day.',
  },
  'action:build': {
    text: 'Engineers, riding: start or work on an unlock. Each action is one work.',
  },
  'action:light-fire': {
    title: 'Light a fire',
    text: 'Burn {fireFuel} timber from your pack here. It burns until the day turns; the creature may take notice.',
  },
  'action:feed': {
    text: 'Riding: give the creature food from the stores.',
  },
  'action:linger': {
    text: 'Keepers, riding: the creature stays put when the day turns. Not two days running.',
  },
  'action:strike': {
    text: 'Weaken a threat next to you by {strike.other}, or by {strike.guardian} as a guardian. At 0 it is gone.',
  },
  'action:defend': {
    text: 'Guardians, riding: each strike on the creature today is {defendReduction} weaker.',
  },
  'action:parley': {
    text: 'Win a wary settlement’s favour. An envoy gains {parleyFavour.envoy}; others gain {parleyFavour.other} and may anger it.',
  },
  'action:offer': { text: 'Give an old coin to a wary settlement: {offerFavour} favour, no risk.' },
  'action:ask-boon': { title: 'Ask a boon', text: 'A friendly settlement grants one boon.' },

  // Boons a friendly settlement can grant (one each).
  'boon:gift': { title: 'Gift', text: 'Food and timber into the team stores.' },
  'boon:mislead': {
    title: 'Mislead',
    text: 'Captor bands lose the trail, and none follow for {misleadDays} days.',
  },
  'boon:shelter': { title: 'Shelter', text: 'Peril falls by {shelterPeril}.' },

  // Threats on the map.
  'threat:captors': { text: 'On the creature’s trail. Strong, and gains on it every day.' },
  'threat:swarm': { text: 'Flies in from the side. Fast, but weaker.' },
  'threat:rockslide': {
    text: 'Blocks the path ahead. Steer around it with fires, or strike it apart.',
  },
  'threat:raiders': { text: 'Sent by an angered settlement.' },

  // Settlements and the peoples.
  'people:hill-folk': { text: 'Herders of the hills. Win their favour for a boon.' },
  'settlement:wary': { title: 'Wary', text: 'Parley or make an offer to win its favour.' },
  'settlement:friendly': { title: 'Friendly', text: 'Ask it for one boon.' },
  'settlement:angry': { title: 'Angry', text: 'It sent raiders and will not be won back.' },

  // Marks on the map.
  'map:fire': {
    title: 'Fire',
    text: 'Burns until the day turns. The creature may take notice.',
  },
  'map:escort': { title: 'Escorted', text: 'Next to a guardian: threats will not strike here.' },
  'map:struck': { title: 'Struck', text: 'Hit by a threat: only {struckActions} action tomorrow.' },

  // The heads-up display.
  'hud:day': {
    title: 'Day',
    text: 'Everyone acts, then the creature walks one step as the day turns.',
  },
  'hud:next-day': { title: 'Next day', text: 'Testing only: turn the day now.' },
  'hud:actions': {
    title: 'Actions',
    text: 'What you can still do today. They refill when the day turns.',
  },
  'hud:pack': {
    title: 'Your pack',
    text: 'What you carry, up to {packSize}. Board the creature to empty it into the stores.',
  },
  'hud:stores': {
    title: 'Stores',
    text: 'The team’s stores, on the creature. Unlocks and feeding use them.',
  },
  'hud:recentre-me': { title: 'Your character', text: 'Back to your character.' },
  'hud:recentre-creature': { title: 'Behemoth', text: 'Back to the creature, and its hub.' },
  'hud:peril': {
    title: 'Peril',
    text: 'Danger to the creature. Strikes and deep hunger raise it; quiet days lower it. Full, and all is lost.',
  },
  'hud:route': { title: 'The way home', text: 'Steps walked toward home.' },
  'hud:appetite': {
    title: 'Appetite',
    text: 'How the creature’s appetite seems: hungry or full. Keepers read it best.',
  },
  'hud:join': { title: 'Join', text: 'Pick a character and a role.' },
} as const satisfies Record<string, Tip>;

export type TipId = keyof typeof tips;

/** The same texts, typed as plain tips for lookups. */
export const TIP_TABLE: Readonly<Record<TipId, Tip>> = tips;
