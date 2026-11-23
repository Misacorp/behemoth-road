/**
 * TIPS: the short texts that appear when you hover over an icon (desktop) or press and hold it (phone).
 *
 * How to edit (Misa):
 * - Change any `text` below; keep it to one or two short lines, in British English.
 * - `title` is optional. Without it the tip shows the thing's own name from the game content
 *   (for example "Scout" or "Iron").
 * - `delays` sets how long the pointer must rest on an icon before its tip opens, in milliseconds, for each
 *   group of icons. One entry can wait longer or shorter with its own `delayMs`.
 * - `holdMs` is how long a finger must press before the tip opens on a phone. A tip then stays until
 *   the next tap anywhere (there is no timer); a mouse tip closes when the mouse leaves.
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
  'role:engineer': {
    text: 'Builds the team’s unlocks from the stores, while riding the creature.',
  },
  'role:warden': {
    text: 'Guards and speaks for the team. Strikes harder, parleys without risk, is never struck, and keeps those beside them safe.',
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
    text: 'From iron deposits and outcrops. Builds the grappling hook, the spikes and the marsh boards.',
  },
  'material:stone': { text: 'From river stones and fieldstones. Builds the lantern.' },
  'material:timber': {
    text: 'From timber stands and deadfall. Builds unlocks, and {fireFuel} fuels a fire.',
  },
  'material:ancient-alloy': { text: 'Found in deep tombs. Builds the climbing spikes.' },
  'material:old-coin': {
    text: 'Found in small tombs. Offer it to a wary settlement for favour, without risk.',
  },
  'material:river-pearl': {
    text: 'Found in sunken shrines. Offer it to a wary settlement for favour, without risk.',
  },
  'material:forage': { text: 'Food from berry bushes. Feed it to the creature from the stores.' },

  // Unlocks (built by engineers, for the whole team).
  'unlock:grappling-hook': {
    text: 'Lets everyone climb cliffs, for {climbCost.grappling-hook} actions a step.',
  },
  'unlock:lantern': { text: 'Light for deep tombs, so a scholar can work them.' },
  'unlock:climbing-spikes': { text: 'Cliffs cost only {climbCost.climbing-spikes} action a step.' },
  'unlock:marsh-boards': { text: 'Swamp costs only {climbCost.marsh-boards} action a step.' },

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
    text: 'Weaken a threat next to you by {strike.other}, or by {strike.warden} as a warden. At 0 it is gone.',
  },
  'action:defend': {
    text: 'Wardens, riding: stand guard over the creature. Every strike on it today lands {defendReduction} weaker, for each warden.',
  },
  'action:parley': {
    text: 'Win a wary settlement’s favour. A warden gains {parleyFavour.warden}; others gain {parleyFavour.other} and may anger it.',
  },
  'action:offer': {
    text: 'Give an old coin or a pearl to a wary settlement: {offerFavour} favour, no risk.',
  },
  'action:ask-boon': { title: 'Ask a boon', text: 'A friendly settlement grants one boon.' },
  // Skills: the tree drawer's tips are below; this one names the action.
  'action:pick-skill': { title: 'Pick', text: 'Take a skill.' },

  // Skills: the first node of each branch (later tiers stay veiled). Names and one line, never numbers.
  'skill:scout-a1': {
    title: 'Trap sense',
    text: 'Hidden traps show themselves, and never spring on you.',
  },
  'skill:scout-b1': { title: 'Glints', text: 'Hexes close by that hold something catch your eye.' },
  'skill:scholar-a1': { title: 'Field kit', text: 'Working a tomb takes less of your day.' },
  'skill:scholar-b1': { title: 'Lamplight', text: 'Better odds in tombs that lie in the dark.' },
  'skill:keeper-a1': { title: 'Good forage', text: 'Gathering food gives more.' },
  'skill:keeper-b1': { title: 'Quiet linger', text: 'Asking the creature to stay costs less.' },
  'skill:warden-a1': { title: 'Bulwark', text: 'Standing guard turns more of each blow.' },
  'skill:warden-a2': {
    title: 'Silver tongue',
    text: 'Words carry further with those who stand beside you.',
  },
  'skill:warden-a3': { title: 'Standing guard', text: 'A guard who never rests.' },
  'skill:warden-b1': { title: 'Ravens', text: 'A parley reaches a settlement further away.' },
  'skill:warden-b2': { title: 'Long reach', text: 'Blows and care travel further from your hand.' },
  'skill:warden-b3': { title: 'Wide guard', text: 'Your shelter spreads wider.' },
  'skill:engineer-a1': { title: 'Double yield', text: 'Each gather brings more home.' },
  'skill:engineer-b1': { title: 'Quick hands', text: 'Each build action does more work.' },
  'skill:veiled': { title: 'Veiled', text: 'Not yet known.' },

  // Boons a friendly settlement can grant (one each).
  'boon:gift': { title: 'Gift', text: 'Food and materials into the team stores.' },
  'boon:mislead': {
    title: 'Mislead',
    text: 'Captor bands lose the trail, and none follow for {misleadDays} days.',
  },
  'boon:shelter': { title: 'Shelter', text: 'Peril falls by {shelterPeril}.' },

  // Why an action is greyed (a tap on it shows one of these, and it never acts). One short line each.
  'why:role-scout': { title: 'Not your role', text: 'A scout can do this.' },
  'why:role-scholar': { title: 'Not your role', text: 'A scholar can do this.' },
  'why:role-keeper': { title: 'Not your role', text: 'A keeper can do this.' },
  'why:role-engineer': { title: 'Not your role', text: 'An engineer can do this.' },
  'why:role-warden': { title: 'Not your role', text: 'A warden can do this.' },
  'why:not-enough-actions': {
    title: 'Not now',
    text: 'Not enough actions left today. They refill when the day turns.',
  },
  'why:pack-full': {
    title: 'Not now',
    text: 'Your pack is full ({packSize}). Board the creature to empty it.',
  },
  'why:needs-unlock': { title: 'Not yet', text: 'The team has yet to build what this needs.' },
  'why:missing-materials': { title: 'Not yet', text: 'The stores lack what this takes.' },
  'why:no-fuel': { title: 'Not now', text: 'You carry no fuel.' },
  'why:no-food': { title: 'Not now', text: 'The stores hold no food.' },
  'why:not-riding': { title: 'Not here', text: 'Only from the creature’s back.' },
  'why:on-creature': { title: 'Not here', text: 'Not from the creature’s back.' },
  'why:elsewhere': { title: 'Not here', text: 'Do it where you stand.' },
  'why:not-near': { title: 'Not here', text: 'Too far. Stand on or next to it.' },
  'why:wrong-place': { title: 'Not here', text: 'Not possible from this place.' },
  'why:lingered-yesterday': { title: 'Not now', text: 'Not two days running.' },
  'why:done': { title: 'Done', text: 'Already done today.' },
  'why:busy': { title: 'Not now', text: 'Another build is under way.' },
  'why:no-fire': { title: 'Not here', text: 'No fire will light here.' },
  'why:settlement': { title: 'Not now', text: 'This settlement is not in that mood.' },
  'why:nothing': { title: 'Not now', text: 'Nothing left to take here.' },
  'why:season-over': { title: 'Over', text: 'The season is over.' },
  'why:no-pick': { title: 'Not yet', text: 'Needs more work in this role first.' },
  'why:branch-closed': { title: 'Closed', text: 'You chose the other path.' },
  'why:tier-order': { title: 'Not yet', text: 'The one before it comes first.' },
  'why:tier-limit': {
    title: 'Not yours',
    text: 'Another role’s tree opens only at its first step.',
  },
  'why:taken': { title: 'Taken', text: 'You already have it.' },
  'why:veiled': { title: 'Veiled', text: 'Not yet known.' },
  'why:other': { title: 'Not now', text: 'Not possible just now.' },

  // The ground a hex shows (in the cards' tile pictures).
  'terrain:plains': { title: 'Plains', text: 'Open grassland. Easy going.' },
  'terrain:forest': { title: 'Forest', text: 'Woods. Easy going, with more to find.' },
  'terrain:desert': { title: 'Desert', text: 'Dry, open sand.' },
  'terrain:swamp': { title: 'Swamp', text: 'Reeds and standing water. Heavy going.' },
  'terrain:river': { title: 'River', text: 'Running water. No fire will light here.' },
  'terrain:cliff': { title: 'Cliff', text: 'Too steep to climb without gear.' },

  // What a hex holds, once found.
  'feature:iron-deposit': { text: 'Gather iron here, until it runs out.' },
  'feature:ore-outcrop': { text: 'Gather iron here, until it runs out.' },
  'feature:river-stones': { text: 'Gather stone here, until it runs out.' },
  'feature:fieldstones': { text: 'Gather stone here, until it runs out.' },
  'feature:timber-stand': { text: 'Gather timber here, until it runs out.' },
  'feature:deadfall': { text: 'Gather timber here, until it runs out.' },
  'feature:berry-bushes': { text: 'Gather food for the creature here, until it runs out.' },
  'feature:tomb': { text: 'An old tomb. Search it for what lies inside.' },
  'feature:deep-tomb': { text: 'Too dark without the lantern. Only scholars can work it.' },
  'feature:snare': { text: 'A snare, found and sprung. Harmless now.' },
  'feature:pitfall': { text: 'A pitfall, found. Harmless now.' },

  'feature:sunken-shrine': { text: 'A shrine in the shallows. Search it for what it keeps.' },
  'feature:undertow': { text: 'An undertow, found. Harmless now.' },

  // Threats on the map.
  'threat:captors': {
    text: 'On the creature’s trail. Strong, and gains on it every day. Tap it to see its next step.',
  },
  'threat:swarm': {
    text: 'Flies in from the side. Fast, but weaker. Tap it to see its next step.',
  },
  'threat:rockslide': {
    text: 'Loose rock on the road ahead. Best not to walk into it.',
  },
  'threat:ambush': {
    text: 'Lies in wait among the trees. Slow, but close. Tap it to see its next step.',
  },
  'threat:stampede': {
    text: 'Charges across open ground. Fast and heavy. Tap it to see its next step.',
  },
  'threat:raiders': { text: 'Sent by an angered settlement. Tap it to see its next step.' },

  // Settlements and the peoples.
  'people:hill-folk': { text: 'Herders of the hills. Win their favour for a boon.' },
  'people:river-folk': { text: 'Fisher folk of the banks. Quick to trust.' },
  'settlement:wary': { title: 'Wary', text: 'Parley or make an offer to win its favour.' },
  'settlement:friendly': { title: 'Friendly', text: 'Ask it for one boon.' },
  'settlement:angry': { title: 'Angry', text: 'It sent raiders and will not be won back.' },

  // Marks on the map.
  'map:fire': {
    title: 'Fire',
    text: 'Burns until the day turns. The creature may take notice.',
  },
  'map:escort': { title: 'Escorted', text: 'Next to a warden: threats will not strike here.' },
  'map:defended': {
    title: 'Defended',
    text: 'Each warden on its back takes {defendReduction} off every strike today.',
  },
  'map:struck': { title: 'Struck', text: 'Hit by a threat: only {struckActions} action tomorrow.' },

  // The heads-up display.
  'hud:day': {
    title: 'Day',
    text: 'Everyone acts, then the creature walks one step as the day turns.',
  },
  'hud:next-day': { title: 'Next day', text: 'Testing only: turn the day now.' },
  'hud:pace-daily': {
    title: 'Slow days',
    text: 'Testing only: the day turns on its own time. Tap for fast days.',
  },
  'hud:pace-fast': {
    title: 'Fast days',
    text: 'Testing only: the day turns soon after everyone has acted. Tap for slow days.',
  },
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
  'hud:skills': {
    title: 'Skills',
    text: 'Your skills. The ring fills as you work; when it glows, take one.',
  },
  'hud:recentre-me': { title: 'Your character', text: 'Back to your character.' },
  'hud:recentre-creature': { title: 'Behemoth', text: 'Back to the creature, and its hub.' },
  'hud:peril': {
    title: 'Peril',
    text: 'Danger to the creature. Strikes and deep hunger raise it; quiet days lower it. Full, and all is lost.',
  },
  // Where peril came from (the ending and the gauge's popover): hints at what to do, nothing more.
  'peril:hunger': { title: 'Hunger', text: 'A hungry creature is in danger. Feed it.' },
  'peril:calm': { title: 'Quiet', text: 'Quiet days ease the danger.' },
  'peril:shelter': { title: 'Shelter', text: 'A friendly settlement eased it.' },
  'peril:held': { title: 'Held off', text: 'Wardens defending kept this off the creature.' },
  'peril:threat:captors': { text: 'They reached the creature. Strike them down, or defend.' },
  'peril:threat:swarm': { text: 'They reached the creature. Strike them down, or defend.' },
  'peril:threat:rockslide': { text: 'It fell on the creature. Clear it, or steer around.' },
  'peril:threat:ambush': { text: 'It reached the creature. Strike it down, or defend.' },
  'peril:threat:stampede': { text: 'It reached the creature. Strike it down, or defend.' },
  'peril:threat:raiders': { text: 'They reached the creature. Keep their people friendly.' },
  'hud:route': { title: 'The way home', text: 'Steps walked toward home.' },
  'hud:appetite': {
    title: 'Appetite',
    text: 'How the creature’s appetite seems: hungry or full. Keepers read it best.',
  },
  'hud:recap': { title: 'The season', text: 'Show or hide how the season went.' },
  'hud:join': { title: 'Join', text: 'Pick a character and a role.' },
  'hud:roster': { title: 'Players', text: 'Everyone in the game: tap one to find them.' },
  'roster:actions': {
    title: 'Actions',
    text: 'What they can still do today. They refill when the day turns.',
    group: 'hud',
  },
  'roster:done': { title: 'Done', text: 'Out of actions for today.', group: 'hud' },
  'roster:lost': { title: 'Lost', text: 'Lost to the fog. Waiting to join again.', group: 'hud' },
  'roster:riding': { title: 'Riding', text: 'On the creature’s back.', group: 'hud' },
  'roster:map': { title: 'Out on the map', text: 'Away from the creature.', group: 'hud' },
  'roster:none': { title: 'No character', text: 'Has not joined yet.', group: 'hud' },

  // The season's recap, on the ending.
  'stat:turned': {
    title: 'Threats turned back',
    text: 'Threats the party struck down.',
    group: 'hud',
  },
  'stat:finds': { title: 'Finds', text: 'Sites opened with something found.', group: 'hud' },
  'stat:unlocks': { title: 'Unlocks', text: 'Team unlocks built.', group: 'hud' },
  'stat:friends': { title: 'Friends', text: 'Settlements won over.', group: 'hud' },
  'stat:explored': { title: 'Explored', text: 'Hexes explored.', group: 'hud' },
  'stat:strikes': { title: 'Strikes', text: 'Blows struck against threats.', group: 'hud' },
  'stat:gathered': { title: 'Gathered', text: 'Units gathered from resource nodes.', group: 'hud' },
  'stat:top': { title: 'Most', text: 'Led the party in this.', group: 'hud' },
} as const satisfies Record<string, Tip>;

export type TipId = keyof typeof tips;

/** The same texts, typed as plain tips for lookups. */
export const TIP_TABLE: Readonly<Record<TipId, Tip>> = tips;
