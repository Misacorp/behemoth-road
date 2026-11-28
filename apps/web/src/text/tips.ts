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
    text: 'Sees ahead. Survey costs {surveyCost.scout} action ({surveyCost.other} for others).',
  },
  'role:scholar': {
    text: 'Searches tombs: {siteChance.scholar.1} % a try ({siteChance.other.1} % for others). Only Scholars can Search deep tombs ({siteChance.scholar.2} %).',
  },
  'role:keeper': { text: 'Tends the creature: Feed it and Linger. Reads its signs.' },
  'role:engineer': { text: 'Builds gear for the party from the stores, while riding.' },
  'role:warden': {
    text: 'Defends, strikes harder, parleys without risk. Foes cannot hurt a Warden or those next to one.',
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
    text: 'From timber stands and deadfall. Builds gear. {fireFuel} lights a fire.',
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
    text: 'Lets everyone climb cliffs for {climbCost.grappling-hook} actions a move.',
  },
  'unlock:towline': { text: 'Riders can Throw it to a character who is cut off.' },
  'unlock:lantern': { text: 'Lets Scholars Search deep tombs.' },
  'unlock:climbing-spikes': {
    text: 'Cliffs cost only {climbCost.climbing-spikes} action a move.',
  },
  'unlock:marsh-boards': { text: 'Swamp costs only {climbCost.marsh-boards} action a move.' },
  'unlock:cart': {
    text: 'A hand cart. Carries materials or one character. Only on open ground and woods.',
  },
  'unlock:raft': { text: 'Lets everyone cross deep water for {climbCost.raft} actions a move.' },

  // Actions (buttons in the cards and the hub). Each is read as "Title. Text. Numbers": the verb, one plain
  // sentence, and where the action rolls, its odds (`{note}`). The same line shows on a first tap and on hover.
  'action:move': { title: 'Move', text: 'Move to this hex along the route.' },
  'action:survey': { title: 'Survey', text: 'Reveal the tile for everyone.' },
  'action:gather': { title: 'Gather', text: 'Collect a resource.' },
  'action:work-site': {
    title: 'Search',
    text: 'Search this site for finds. {note}',
  },
  'action:build': { title: 'Build', text: 'Add {buildWork} work to the gear being built.' },
  'action:light-fire': {
    title: 'Light',
    text: 'Burn {fireFuel} timber on this hex. It burns until the day turns.',
  },
  'action:feed': { title: 'Feed', text: 'Give the creature food from the stores.' },
  'action:linger': {
    title: 'Linger',
    text: 'The creature stays where it is when the day turns. Not on the day after a Linger.',
  },
  'action:throw-line': {
    title: 'Throw',
    text: 'Throw the tow line to a character who is cut off. They can Grab it.',
  },
  'action:grab-line': {
    title: 'Grab',
    text: 'Take the tow line. It pulls you onto the creature.',
  },
  'action:hitch': {
    title: 'Hitch',
    text: 'Pull the cart. It moves with you, and each move costs more actions.',
  },
  'action:unhitch': { title: 'Unhitch', text: 'Let go of the cart. It stays on this hex.' },
  'action:board-cart': {
    title: 'Sit',
    text: 'Sit in the cart. It carries you. You cannot move on your own.',
  },
  'action:leave-cart': { title: 'Climb out', text: 'Climb out of the cart.' },
  'action:load': { title: 'Load', text: 'Put materials from your pack into the cart.' },
  'action:unload': { title: 'Unload', text: 'Take materials from the cart into your pack.' },
  'action:strike': { title: 'Strike', text: 'Deal damage to the foe. {note}' },
  'action:dig-out': {
    title: 'Dig out',
    text: 'Free a pinned character on your hex or next to you.',
  },
  'action:struggle': {
    title: 'Struggle',
    text: 'Try to free yourself. Each try is likelier to work. {note}',
  },
  'action:lead': { title: 'Lead', text: 'Move the {lure} to a neighbouring tile.' },
  'action:defend': {
    title: 'Defend',
    text: 'Every foe attack on the creature adds {defendReduction} less peril today.',
  },
  'action:parley': { title: 'Parley', text: 'Win a wary settlement’s favour. {note}' },
  'action:offer': { title: 'Offer', text: 'Give an old coin or a river pearl to win favour.' },
  'action:ask-boon': { title: 'Ask', text: 'Ask the friendly settlement for a boon.' },
  // Skills: the tree drawer's tips are below; this one names the action.
  'action:pick-skill': { title: 'Pick', text: 'Pick a skill.' },
  'action:set-stance': {
    title: 'Stance',
    text: 'Choose what your spare actions do when the day turns.',
  },
  'action:wait': {
    title: 'Wait',
    text: 'End your day now. Your stance uses any actions you have left.',
  },

  // Skills: every node of the five trees. Names and one line, never numbers.
  'skill:scout-a1': {
    title: 'Trap sense',
    text: 'A hidden trap on a hex you enter is found and does not spring.',
  },
  'skill:scout-b1': {
    title: 'Glints',
    text: 'Unexplored hexes up to {glintRange} away that hold a site or deposit glint, for you only.',
  },
  'skill:scholar-a1': {
    title: 'Field kit',
    text: 'Search costs {fieldKitCost} action, not {workSiteCost}.',
  },
  'skill:scholar-b1': {
    title: 'Lamplight',
    text: 'Search has a {lampBonus} % better chance at dark sites.',
  },
  'skill:keeper-a1': {
    title: 'More food',
    text: 'Gather gives {foodYield} food, not {gatherYield}.',
  },
  'skill:keeper-b1': {
    title: 'Quiet linger',
    text: 'Linger costs {quietCost} action, not {lingerCost}.',
  },
  'skill:warden-a1': {
    title: 'Bulwark',
    text: 'Defend takes {bulwark} peril off each foe attack, not {defendReduction}.',
  },
  'skill:warden-a2': { title: 'Silver tongue', text: 'Parley gives {parleyBonus} more favour.' },
  'skill:warden-a3': {
    title: 'Auto-defend',
    text: 'When the day turns, if you are riding the creature and have an action left, you Defend with it.',
  },
  'skill:warden-b1': {
    title: 'Ravens',
    text: 'Parley works on settlements up to {parleyRange} hexes away.',
  },
  'skill:warden-b2': {
    title: 'Long reach',
    text: 'Strike reaches foes up to {strikeRange} hexes away.',
  },
  'skill:warden-b3': {
    title: 'Wide escort',
    text: 'Your escort covers characters up to {escortRange} hexes away.',
  },
  'skill:engineer-a1': {
    title: 'Double yield',
    text: 'Gather gives {doubleYield} materials, not {gatherYield}.',
  },
  'skill:engineer-b1': {
    title: 'Quick hands',
    text: 'Build adds {quickWork} work, not {buildWork}.',
  },
  'skill:scout-a2': {
    title: 'Long survey',
    text: 'Survey reaches known hexes up to {surveyRange} away, not only neighbours.',
  },
  'skill:scout-a3': {
    title: 'Sweep',
    text: 'When the day turns, every unexplored hex next to you is explored, for everyone.',
  },
  'skill:scout-b2': { title: 'Far sight', text: 'Glints reach {glintRange2} hexes.' },
  'skill:scout-b3': {
    title: 'Forecast',
    text: 'Foe paths show {forecastDays} days ahead, for everyone.',
  },
  'skill:scholar-a2': {
    title: 'Steady hands',
    text: 'Search has a {steadyBonus} % better chance at any site.',
  },
  'skill:scholar-a3': {
    title: 'Extra find',
    text: 'A site you Search gives {siteFinds} more find, if your pack has room.',
  },
  'skill:scholar-b2': {
    title: 'Relic sense',
    text: 'Each find has a {relicChance} % chance of one extra rare material.',
  },
  'skill:scholar-b3': {
    title: 'Old maps',
    text: 'Each find explores the nearest unexplored site within {mapRange} hexes, for everyone.',
  },
  'skill:keeper-a2': {
    title: 'Soothing herbs',
    text: 'Feed also lowers peril by {feedCalm}, once a day.',
  },
  'skill:keeper-a3': {
    title: 'Contented',
    text: 'While you are in the game, the creature gets hungrier every {hungerDays} days, not every day.',
  },
  'skill:keeper-b2': { title: 'Linger again', text: 'You can Linger on two days in a row.' },
  'skill:keeper-b3': {
    title: 'Beacon',
    text: 'Fires you light reach {beaconRange} hexes. A brazier you light burns {beaconNights} more night.',
  },
  'skill:engineer-a2': {
    title: 'Pack mule',
    text: 'Your pack holds {packMule}, not {packSize}. Striking a rockslide never pins you.',
  },
  'skill:engineer-a3': {
    title: 'Monkey drone',
    text: 'When the day turns, {droneAmount} material from a deposit next to the creature goes into the stores.',
  },
  'skill:engineer-b2': {
    title: 'Thrift',
    text: 'Starting gear costs {thrift} less of its biggest material.',
  },
  'skill:engineer-b3': {
    title: 'Self-winding',
    text: 'When the day turns, the gear being built gains {tickWork} work.',
  },
  'skill:veiled': { title: 'Veiled', text: 'Not yet known.' },

  // Boons a friendly settlement can grant (one each).
  'boon:gift': { title: 'Gift', text: 'Adds food and other materials to the stores.' },
  'boon:mislead': {
    title: 'Mislead',
    text: 'Captor bands turn away. None come for {misleadDays} days.',
  },
  'boon:shelter': { title: 'Shelter', text: 'Peril falls by {shelterPeril}.' },

  // Why an action is greyed (a tap on it shows one of these, and it never acts). One short line each.
  'why:role-scout': { title: 'Not your role', text: 'Only a Scout can do this.' },
  'why:role-scholar': { title: 'Not your role', text: 'Only a Scholar can do this.' },
  'why:role-keeper': { title: 'Not your role', text: 'Only a Keeper can do this.' },
  'why:role-engineer': { title: 'Not your role', text: 'Only an Engineer can do this.' },
  'why:role-warden': { title: 'Not your role', text: 'Only a Warden can do this.' },
  'why:too-far': { title: 'Too far', text: 'More than {actionsPerDay} actions away.' },
  'why:not-enough-actions': {
    title: 'Not now',
    text: 'Not enough actions left today. They refill when the day turns.',
  },
  'why:pack-full': {
    title: 'Not now',
    text: 'Your pack is full ({packSize}). Ride the creature to empty it into the stores.',
  },
  'why:needs-unlock': { title: 'Not yet', text: 'The party must build the gear this needs.' },
  'why:missing-materials': {
    title: 'Not yet',
    text: 'The stores do not hold the materials this needs.',
  },
  'why:no-fuel': { title: 'Not now', text: 'You carry no timber.' },
  'why:no-food': { title: 'Not now', text: 'The stores hold no food.' },
  'why:not-riding': { title: 'Not here', text: 'You must be riding the creature.' },
  'why:on-creature': { title: 'Not here', text: 'You must be on foot.' },
  'why:elsewhere': { title: 'Not here', text: 'You must be on that hex.' },
  'why:not-near': { title: 'Not here', text: 'Too far. Stand on or next to it.' },
  'why:wrong-place': { title: 'Not here', text: 'You cannot do this here.' },
  'why:lingered-yesterday': {
    title: 'Not now',
    text: 'You cannot Linger the day after a Linger.',
  },
  'why:done': { title: 'Done', text: 'Already done today.' },
  'why:busy': { title: 'Not now', text: 'Another build is under way.' },
  'why:cart-in-use': { title: 'Not now', text: 'The cart is already in use.' },
  'why:no-fire': { title: 'Not here', text: 'A fire cannot be lit here.' },
  'why:not-wary': { title: 'Not now', text: 'Needs a wary settlement.' },
  'why:not-friendly': { title: 'Not now', text: 'Needs a friendly settlement.' },
  'why:nothing': { title: 'Not now', text: 'Nothing left to take here.' },
  'why:season-over': { title: 'Over', text: 'The season is over.' },
  'why:no-pick': { title: 'Not yet', text: 'Not enough XP yet.' },
  'why:branch-closed': { title: 'Closed', text: 'You picked a skill on the other branch.' },
  'why:tier-order': { title: 'Not yet', text: 'Pick the skill before it first.' },
  'why:tier-limit': {
    title: 'Not yours',
    text: 'From another role you can pick only the first tier.',
  },
  'why:taken': { title: 'Taken', text: 'You already have it.' },
  'why:veiled': { title: 'Veiled', text: 'Not yet known.' },
  'why:pinned': {
    title: 'Pinned',
    text: 'You are pinned under a rockslide. Struggle, or wait for someone to Dig you out.',
  },
  'why:aboard': { title: 'In the cart', text: 'You are in the cart. Climb out to move.' },
  'why:hitched': { title: 'Hitched', text: 'You are pulling the cart. Unhitch it first.' },
  'why:cart-terrain': {
    title: 'Too rough',
    text: 'The cart cannot go there. Unhitch it to move on.',
  },
  'why:settled': { title: 'Settled', text: 'It has settled and will not be led any more.' },
  'why:other': { title: 'Not now', text: 'Not possible just now.' },

  // The ground a hex shows (in the cards' tile pictures).
  'terrain:plains': { title: 'Plains', text: 'Open grassland.' },
  'terrain:forest': { title: 'Forest', text: 'Forest. More finds.' },
  'terrain:desert': { title: 'Desert', text: 'Dry, open sand.' },
  'terrain:swamp': {
    title: 'Swamp',
    text: 'Reeds and standing water. Moving costs more actions.',
  },
  'terrain:river': { title: 'River', text: 'Running water. No fire will light here.' },
  'terrain:cliff': { title: 'Cliff', text: 'Too steep to climb without gear.' },
  'terrain:shallows': { title: 'Shallows', text: 'Shallow water. You can cross it.' },
  'terrain:lake': { title: 'Deep water', text: 'Too deep to wade. The creature swims it.' },
  'terrain:sea': { title: 'Sea', text: 'Salt water, too deep to wade. The creature swims it.' },
  'terrain:islet': { title: 'Island', text: 'A scrap of land in deep water.' },
  'terrain:poisoned-lake': {
    title: 'Poisoned lake',
    text: 'If the creature steps in, peril rises.',
  },
  'terrain:glass-waste': {
    title: 'Glass waste',
    text: 'Sharp and bright. Moving costs more actions.',
  },

  // What a hex holds, once found.
  'feature:iron-deposit': { text: 'Gather iron here, until it runs out.' },
  'feature:ore-outcrop': { text: 'Gather iron here, until it runs out.' },
  'feature:river-stones': { text: 'Gather stone here, until it runs out.' },
  'feature:fieldstones': { text: 'Gather stone here, until it runs out.' },
  'feature:timber-stand': { text: 'Gather timber here, until it runs out.' },
  'feature:deadfall': { text: 'Gather timber here, until it runs out. A fire would burn it away.' },
  'feature:berry-bushes': { text: 'Gather food for the creature here, until it runs out.' },
  'feature:tomb': { text: 'An old tomb. Search it for finds.' },
  'feature:deep-tomb': { text: 'Only a Scholar with the lantern can Search it.' },
  'feature:brazier': {
    text: 'An old brazier. Light it with timber: it burns {brazierNights} nights and explores hexes near it.',
  },
  'feature:snare': { text: 'A snare, found and sprung. Harmless now. A fire would burn it away.' },
  'feature:pitfall': { text: 'A pitfall, found. Harmless now.' },

  'feature:sunken-shrine': { text: 'A shrine in the shallows. Search it for finds.' },
  'feature:undertow': { text: 'An undertow, found. Harmless now.' },
  'feature:water-temple': { text: 'A temple on the water. Search it for finds.' },

  // Threats on the map.
  'threat:captors': { text: 'Follows the creature from behind. Strong. Tap it to see its path.' },
  'threat:swarm': {
    text: 'Flies in from the side. Fast, but weak. Avoids fire. Tap it to see its path.',
  },
  'threat:rockslide': {
    text: 'Loose rock ahead. It never moves. Walking onto it pins you. Striking it may pin you.',
  },
  'threat:ambush': { text: 'Hides in the forest. Slow, but close. Tap it to see its path.' },
  'threat:stampede': {
    text: 'Charges across open ground. Fast. Avoids fire. Tap it to see its path.',
  },
  'threat:raiders': { text: 'Sent by an angry settlement. Tap it to see its path.' },

  // Settlements and the peoples.
  'people:hill-folk': { text: 'Herders of the hills. Win their favour for a boon.' },
  'people:river-folk': { text: 'Fisher folk of the banks. Quick to give favour.' },
  'settlement:wary': { title: 'Wary', text: 'Parley or Offer to win its favour.' },
  'settlement:friendly': { title: 'Friendly', text: 'Ask it for one boon.' },
  'settlement:angry': { title: 'Angry', text: 'It sent raiders. It cannot be won back.' },

  // Marks on the map.
  'map:fire': { title: 'Fire', text: 'Burns until the day turns. The creature may react.' },
  'map:fire-brazier': {
    title: 'Lit brazier',
    text: 'Burns {brazierNights} nights, then goes cold. It can be lit again.',
  },
  'map:nights': { title: 'Nights left', text: 'Each ember is a night it still burns.' },
  'map:burnable': { title: 'Burnable', text: 'A fire would burn this away for good.' },
  'map:burnt': { title: 'Burnt', text: 'A fire burnt this away.' },
  'map:fears-fire': { title: 'Fears fire', text: 'Will not come near a burning fire.' },
  'map:blocked': { title: 'Kept out', text: 'Foes will not enter the striped hexes.' },
  'map:odds': { title: 'Odds', text: '{note}' },
  'map:pinned': {
    title: 'Pinned',
    text: 'Pinned under a rockslide. Someone on or next to the hex can Dig them out, or they can Struggle.',
  },
  'map:escort': {
    title: 'Escorted',
    text: 'On or next to a Warden: foes cannot hurt characters here.',
  },
  'map:defended': {
    title: 'Defended',
    text: 'Each Warden who Defended today takes {defendReduction} peril off every foe attack on the creature.',
  },
  'map:towline': { title: 'Tow line', text: 'A tow line was thrown to them. They can Grab it.' },
  'map:stranded': { title: 'Cut off', text: 'Too far from the creature to get back today.' },
  'map:lure': { title: 'Capybara', text: 'Lead it one hex, from its hex or next to it.' },
  'map:lure-settled': {
    title: 'Settled',
    text: 'It has settled here and cannot be led any more.',
  },
  'map:leads': { title: 'Leads left', text: 'Each paw is one Lead left.' },
  'map:cart': {
    title: 'Hand cart',
    text: 'Pull it (Hitch) or sit in it. It carries materials. Only on open ground and woods.',
  },
  'map:cargo': { title: 'Cargo', text: 'Each crate is one material in the cart.' },
  'map:step-harm': { title: 'Harmful ground', text: 'If the creature steps here, peril rises.' },
  'map:scree-field': {
    title: 'Scree field',
    text: 'Loose stones. Rockslides lie across it; each pins a character who walks in.',
  },
  'map:struck': {
    title: 'Hurt',
    text: 'A foe attacked you: only {struckActions} action tomorrow.',
  },
  // What the walk leaves behind. The tip adds who made it and at which step.
  'map:trace-fire': { title: 'Fire scar', text: 'A fire burned here.' },
  'map:trace-trail': { title: 'Green trail', text: 'The creature walked here.' },
  'map:trace-cairn': { title: 'Cairn', text: 'The creature stayed here a day.' },
  'map:trace-chain': { title: 'Broken chain', text: 'Foes that followed it were beaten here.' },
  'map:trace-gate': { title: 'Open gate', text: 'Someone was lost to the fog here.' },
  'map:standing-stone': { title: 'Standing stone', text: 'Set here before you came.' },

  // Idle stances: where spare actions go at the tick.
  'stance:rest': {
    title: 'Rest',
    text: 'Spare actions do nothing when the day turns.',
    group: 'hud',
  },
  'stance:lie-in-wait': {
    title: 'Lie in wait',
    text: 'On foot: when the day turns, Strike any foe that stops on or crosses your hex, before it attacks.',
    group: 'hud',
  },
  'stance:gather': {
    title: 'Gather',
    text: 'Spare actions Gather from the deposit on your hex when the day turns.',
    group: 'hud',
  },
  'stance:fallback': {
    title: 'Resting instead',
    text: 'This stance needs something this hex does not have.',
    group: 'hud',
  },

  // The recap's marks: what happened near the creature while you were away.
  'recap:threat': { title: 'Foe', text: 'A foe came close to the creature.', group: 'map' },
  'recap:strike': { title: 'Attacked', text: 'A foe attacked the creature.', group: 'map' },
  'recap:trap': { title: 'Trap', text: 'A trap sprang.', group: 'map' },
  'recap:hungry': { title: 'Hungry', text: 'The creature went without food.', group: 'map' },
  'recap:find': { title: 'Find', text: 'A site gave a find.', group: 'map' },
  'recap:reveal': { title: 'Found', text: 'Something hidden was found.', group: 'map' },
  'recap:fire': { title: 'Fire', text: 'A fire was lit.', group: 'map' },
  'recap:cleared': { title: 'Beaten', text: 'A foe was beaten.', group: 'map' },
  'recap:befriended': { title: 'Friends', text: 'A settlement became friendly.', group: 'map' },
  'recap:angered': { title: 'Angry', text: 'A settlement became angry.', group: 'map' },

  // The heads-up display.
  'hud:day': {
    title: 'Day',
    text: 'Everyone acts. When the day turns, the creature walks one step.',
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
    text: 'What you carry, up to {packSize}. Ride the creature to empty it into the stores.',
  },
  'hud:stores': {
    title: 'Stores',
    text: 'The party’s stores, on the creature. Gear and Feed use them.',
  },
  'hud:skills': {
    title: 'Skills',
    text: 'Your skills. The ring fills as you earn XP; when it glows, Pick one.',
  },
  'hud:stance': {
    title: 'Stance',
    text: 'What your spare actions do when the day turns. Tap to choose.',
  },
  'hud:recentre-me': { title: 'Your character', text: 'Back to your character.' },
  'hud:recentre-creature': { title: 'Creature', text: 'Back to the creature, and its hub.' },
  'hud:peril': {
    title: 'Peril',
    text: 'The creature’s peril. Foe attacks and hunger raise it; quiet days lower it. At {perilMax} the season is lost.',
  },
  // Where peril came from (the ending and the gauge's popover): hints at what to do, nothing more.
  'peril:hunger': { title: 'Hunger', text: 'Hunger raised peril. Feed the creature.' },
  'peril:calm': { title: 'Quiet', text: 'A quiet day lowered peril.' },
  'peril:shelter': { title: 'Shelter', text: 'A settlement’s Shelter lowered peril.' },
  'peril:held': { title: 'Held off', text: 'Defending Wardens took this much peril off.' },
  'peril:threat:captors': { text: 'They attacked the creature. Strike them, or Defend.' },
  'peril:threat:swarm': { text: 'They attacked the creature. Strike them, or Defend.' },
  'peril:threat:rockslide': { text: 'The creature walked into it. Strike it first.' },
  'peril:threat:ambush': { text: 'It attacked the creature. Strike it, or Defend.' },
  'peril:threat:stampede': { text: 'It attacked the creature. Strike it, or Defend.' },
  'peril:threat:raiders': { text: 'They attacked the creature. Keep settlements friendly.' },
  'hud:route': { title: 'The route', text: 'Steps walked so far.' },
  'hud:greyfold': { title: 'The Greyfold', text: 'Where the creature is going.' },
  'hud:date': { title: 'Step', text: 'Steps walked, of all the route.' },
  'hud:story': { title: 'A card waits', text: 'Tap to read the next.' },
  'hud:appetite': {
    title: 'Appetite',
    text: 'Whether the creature is hungry or full. Keepers read it best.',
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
  'roster:map': { title: 'On foot', text: 'Not riding the creature.', group: 'hud' },
  'roster:waiting': {
    title: 'Waiting',
    text: 'Ended their day. Their stance uses the rest.',
    group: 'hud',
  },
  'roster:pinned': {
    title: 'Pinned',
    text: 'Pinned under a rockslide. Cannot act.',
    group: 'hud',
  },
  'roster:none': { title: 'No character', text: 'Has not joined yet.', group: 'hud' },

  // The season's recap, on the ending.
  'stat:turned': {
    title: 'Foes beaten',
    text: 'Foes the party struck down to zero.',
    group: 'hud',
  },
  'stat:finds': { title: 'Finds', text: 'Sites searched that gave a find.', group: 'hud' },
  'stat:unlocks': { title: 'Gear', text: 'Gear built by the party.', group: 'hud' },
  'stat:friends': { title: 'Friends', text: 'Settlements won over.', group: 'hud' },
  'stat:explored': { title: 'Explored', text: 'Hexes explored.', group: 'hud' },
  'stat:strikes': { title: 'Strikes', text: 'Strikes on foes.', group: 'hud' },
  'stat:gathered': { title: 'Gathered', text: 'Materials gathered.', group: 'hud' },
  'stat:top': { title: 'Most', text: 'Led the party in this.', group: 'hud' },
} as const satisfies Record<string, Tip>;

export type TipId = keyof typeof tips;

/** The same texts, typed as plain tips for lookups. */
export const TIP_TABLE: Readonly<Record<TipId, Tip>> = tips;
