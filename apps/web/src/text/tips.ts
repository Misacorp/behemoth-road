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
    text: 'Builds the party’s unlocks from the stores, while riding the creature.',
  },
  'role:warden': {
    text: 'Guards and speaks for the party. Strikes harder, parleys without risk, is never struck, and keeps those beside them safe.',
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

  // Materials (in packs and the party stores).
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

  // Unlocks (built by engineers, for the whole party).
  'unlock:grappling-hook': {
    text: 'Lets everyone climb cliffs, for {climbCost.grappling-hook} actions a step.',
  },
  'unlock:towline': { text: 'A rope for riders to throw to someone left behind.' },
  'unlock:lantern': { text: 'Light for deep tombs, so a scholar can work them.' },
  'unlock:climbing-spikes': { text: 'Cliffs cost only {climbCost.climbing-spikes} action a step.' },
  'unlock:marsh-boards': { text: 'Swamp costs only {climbCost.marsh-boards} action a step.' },
  'unlock:raft': { text: 'Lets everyone cross deep water, for {climbCost.raft} actions a step.' },

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
  'action:throw-line': {
    text: 'Throw the line to someone left behind. They choose to take it.',
  },
  'action:grab-line': { text: 'Take the line and be pulled aboard.' },
  'action:strike': {
    text: 'Weaken a threat next to you by {strike.other}, or by {strike.warden} as a warden. At 0 it is gone.',
  },
  'action:dig-out': {
    title: 'Dig out',
    text: 'Free someone pinned under a slide, next to you or on your hex.',
  },
  'action:lead': {
    title: 'Lead',
    text: 'Lead the animal one step along a short leash. Each lead uses one of its leads.',
  },
  'action:hitch': {
    title: 'Hitch',
    text: 'Take the cart by its shafts, so it moves with you.',
  },
  'action:board-cart': {
    title: 'Board',
    text: 'Climb into the cart and ride it.',
  },
  'action:load': {
    title: 'Load',
    text: 'Put what you carry into the cart.',
  },
  'action:unload': {
    title: 'Unload',
    text: 'Take what the cart carries out of it.',
  },
  'action:struggle': {
    title: 'Struggle',
    text: 'Push at the stones over you. You might shift them, and you might not.',
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
  'action:set-stance': { title: 'Stance', text: 'Choose where your spare actions go.' },
  'action:wait': {
    title: 'Wait',
    text: 'End your day here. What is left goes to your stance.',
  },

  // Skills: every node of the five trees. Names and one line, never numbers.
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
  'skill:warden-a2': { title: 'Silver tongue', text: 'Your parleys win more favour.' },
  'skill:warden-a3': { title: 'Standing guard', text: 'A guard who never rests.' },
  'skill:warden-b1': { title: 'Ravens', text: 'A parley reaches a settlement further away.' },
  'skill:warden-b2': { title: 'Long reach', text: 'Your blows reach threats a hex further off.' },
  'skill:warden-b3': { title: 'Wide guard', text: 'Your shelter spreads wider.' },
  'skill:engineer-a1': { title: 'Double yield', text: 'Each gather brings more home.' },
  'skill:engineer-b1': { title: 'Quick hands', text: 'Each build action does more work.' },
  'skill:scout-a2': { title: 'Long survey', text: 'A survey reaches hexes further out.' },
  'skill:scout-a3': {
    title: 'Sweep',
    text: 'The hexes around you are explored as the day turns, for everyone.',
  },
  'skill:scout-b2': {
    title: 'Far sight',
    text: 'Things worth finding catch your eye from much further off.',
  },
  'skill:scout-b3': { title: 'Forecast', text: 'Threat paths show further ahead, for everyone.' },
  'skill:scholar-a2': { title: 'Steady hands', text: 'Every tomb gives better odds.' },
  'skill:scholar-a3': { title: 'Second chamber', text: 'A tomb you open holds one more find.' },
  'skill:scholar-b2': { title: 'Relic sense', text: 'Now and then a find brings something rare.' },
  'skill:scholar-b3': {
    title: 'Old maps',
    text: 'Each find points to another site nearby, for everyone.',
  },
  'skill:keeper-a2': {
    title: 'Soothing herbs',
    text: 'Feeding also eases the danger, once a day.',
  },
  'skill:keeper-a3': { title: 'Contented', text: 'The creature goes hungry more slowly.' },
  'skill:keeper-b2': { title: 'Long rest', text: 'The creature will stay for you, day after day.' },
  'skill:keeper-b3': {
    title: 'Beacon',
    text: 'Your fires reach further and sway the creature harder.',
  },
  'skill:engineer-a2': { title: 'Pack mule', text: 'Your pack holds more.' },
  'skill:engineer-a3': {
    title: 'Monkey drone',
    text: 'A small helper gathers for the stores each day.',
  },
  'skill:engineer-b2': { title: 'Thrift', text: 'Unlocks ask for a little less.' },
  'skill:engineer-b3': {
    title: 'Self-winding',
    text: 'The unlock in progress advances a little by itself.',
  },
  'skill:veiled': { title: 'Veiled', text: 'Not yet known.' },

  // Boons a friendly settlement can grant (one each).
  'boon:gift': { title: 'Gift', text: 'Food and materials into the party stores.' },
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
  'why:needs-unlock': { title: 'Not yet', text: 'The party has yet to build what this needs.' },
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
  'why:pinned': { title: 'Pinned', text: 'Under fallen stones. Wait for someone to dig you out.' },
  'why:other': { title: 'Not now', text: 'Not possible just now.' },

  // The ground a hex shows (in the cards' tile pictures).
  'terrain:plains': { title: 'Plains', text: 'Open grassland. Easy going.' },
  'terrain:forest': { title: 'Forest', text: 'Woods. Easy going, with more to find.' },
  'terrain:desert': { title: 'Desert', text: 'Dry, open sand.' },
  'terrain:swamp': { title: 'Swamp', text: 'Reeds and standing water. Heavy going.' },
  'terrain:river': { title: 'River', text: 'Running water. No fire will light here.' },
  'terrain:cliff': { title: 'Cliff', text: 'Too steep to climb without gear.' },
  'terrain:shallows': { title: 'Shallows', text: 'Clear and shallow. Wade on through.' },
  'terrain:lake': { title: 'Deep water', text: 'Too deep to wade. The creature swims it.' },
  'terrain:sea': { title: 'Sea', text: 'Salt water, too deep to wade. The creature swims it.' },
  'terrain:islet': { title: 'Island', text: 'A scrap of land in deep water.' },

  // What a hex holds, once found.
  'feature:iron-deposit': { text: 'Gather iron here, until it runs out.' },
  'feature:ore-outcrop': { text: 'Gather iron here, until it runs out.' },
  'feature:river-stones': { text: 'Gather stone here, until it runs out.' },
  'feature:fieldstones': { text: 'Gather stone here, until it runs out.' },
  'feature:timber-stand': { text: 'Gather timber here, until it runs out.' },
  'feature:deadfall': { text: 'Gather timber here, until it runs out. A fire would burn it away.' },
  'feature:berry-bushes': { text: 'Gather food for the creature here, until it runs out.' },
  'feature:tomb': { text: 'An old tomb. Search it for what lies inside.' },
  'feature:deep-tomb': { text: 'Too dark without the lantern. Only scholars can work it.' },
  'feature:brazier': {
    text: 'An old brazier. Light it with timber and it burns on for nights, showing the land around.',
  },
  'feature:snare': { text: 'A snare, found and sprung. Harmless now. A fire would burn it away.' },
  'feature:pitfall': { text: 'A pitfall, found. Harmless now.' },

  'feature:sunken-shrine': { text: 'A shrine in the shallows. Search it for what it keeps.' },
  'feature:undertow': { text: 'An undertow, found. Harmless now.' },
  'feature:water-temple': { text: 'A temple on the water. Search it for what it keeps.' },

  // Threats on the map.
  'threat:captors': {
    text: 'On the creature’s trail. Strong, and gains on it every day. Tap it to see its next step.',
  },
  'threat:swarm': {
    text: 'Flies in from the side. Fast, but weaker. Keeps clear of fire. Tap it to see its next step.',
  },
  'threat:rockslide': {
    text: 'Loose rock on the way ahead. Best not to walk into it. Striking it may bring stones down on you.',
  },
  'threat:ambush': {
    text: 'Lies in wait among the trees. Slow, but close. Tap it to see its next step.',
  },
  'threat:stampede': {
    text: 'Charges across open ground. Fast and heavy. Keeps clear of fire. Tap it to see its next step.',
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
  'map:fire-brazier': {
    title: 'Lit brazier',
    text: 'Burns {brazierNights} nights, then goes cold. It can be lit again.',
  },
  'map:nights': { title: 'Nights left', text: 'Each ember is a night it still burns.' },
  'map:burnable': { title: 'Burnable', text: 'A fire would take this, for good.' },
  'map:burnt': { title: 'Burnt', text: 'A fire took what stood here.' },
  'map:fears-fire': { title: 'Fears fire', text: 'Will not come near a burning fire.' },
  'map:fire-ring': { title: 'Fire’s reach', text: 'Things that fear fire keep out of this ring.' },
  'map:fall-risk': {
    title: 'Falling stones',
    text: 'A strike may bring them down on you: {slideFall} % for most. Some are surer-footed.',
  },
  'map:pinned': {
    title: 'Pinned',
    text: 'Under fallen stones. Someone beside them can dig them out.',
  },
  'map:escort': { title: 'Escorted', text: 'Next to a warden: threats will not strike here.' },
  'map:defended': {
    title: 'Defended',
    text: 'Each warden on its back takes {defendReduction} off every strike today.',
  },
  'map:towline': { title: 'Tow line', text: 'A line is thrown their way. They can take it.' },
  'map:stranded': { title: 'Cut off', text: 'Out in the fog, with no way back today.' },
  'map:struck': { title: 'Struck', text: 'Hit by a threat: only {struckActions} action tomorrow.' },
  // What the walk leaves behind. The tip adds who made it and at which step.
  'map:trace-fire': { title: 'Fire scar', text: 'A fire burned here.' },
  'map:trace-trail': { title: 'Green trail', text: 'The creature walked here.' },
  'map:trace-cairn': { title: 'Cairn', text: 'The creature stayed here a day.' },
  'map:trace-chain': { title: 'Broken chain', text: 'Its pursuers were turned back here.' },
  'map:trace-gate': { title: 'Open gate', text: 'Someone was lost to the fog here.' },
  'map:standing-stone': { title: 'Standing stone', text: 'Set here before you came.' },

  // Idle stances: where spare actions go at the tick.
  'stance:rest': {
    title: 'Rest',
    text: 'Do nothing with your spare actions.',
    group: 'hud',
  },
  'stance:lie-in-wait': {
    title: 'Lie in wait',
    text: 'Hold your hex. Strike first at what reaches it.',
    group: 'hud',
  },
  'stance:gather': {
    title: 'Gather',
    text: 'Spare actions gather from the node you stand on.',
    group: 'hud',
  },
  'stance:fallback': {
    title: 'Resting instead',
    text: 'This stance has nothing to do where you are.',
    group: 'hud',
  },

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
    text: 'The party’s stores, on the creature. Unlocks and feeding use them.',
  },
  'hud:skills': {
    title: 'Skills',
    text: 'Your skills. The ring fills as you work; when it glows, take one.',
  },
  'hud:stance': {
    title: 'Stance',
    text: 'Where your spare actions go when the day turns. Tap to choose.',
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
  'hud:route': { title: 'The route', text: 'Steps walked so far.' },
  'hud:greyfold': { title: 'The Greyfold', text: 'Where the creature is going.' },
  'hud:date': { title: 'Step', text: 'Steps walked, of all the route.' },
  'hud:story': { title: 'A card waits', text: 'Tap to read the next.' },
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
  'roster:waiting': {
    title: 'Waiting',
    text: 'Ended their day. Their stance takes the rest.',
    group: 'hud',
  },
  'roster:pinned': { title: 'Pinned', text: 'Under fallen stones, unable to act.', group: 'hud' },
  'roster:none': { title: 'No character', text: 'Has not joined yet.', group: 'hud' },

  // The season's recap, on the ending.
  'stat:turned': {
    title: 'Threats turned back',
    text: 'Threats the party struck down.',
    group: 'hud',
  },
  'stat:finds': { title: 'Finds', text: 'Sites opened with something found.', group: 'hud' },
  'stat:unlocks': { title: 'Unlocks', text: 'Unlocks built by the party.', group: 'hud' },
  'stat:friends': { title: 'Friends', text: 'Settlements won over.', group: 'hud' },
  'stat:explored': { title: 'Explored', text: 'Hexes explored.', group: 'hud' },
  'stat:strikes': { title: 'Strikes', text: 'Blows struck against threats.', group: 'hud' },
  'stat:gathered': { title: 'Gathered', text: 'Units gathered from resource nodes.', group: 'hud' },
  'stat:top': { title: 'Most', text: 'Led the party in this.', group: 'hud' },
} as const satisfies Record<string, Tip>;

export type TipId = keyof typeof tips;

/** The same texts, typed as plain tips for lookups. */
export const TIP_TABLE: Readonly<Record<TipId, Tip>> = tips;
