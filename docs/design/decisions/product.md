# Product

Features, UX and behaviour the users see.

<!-- Maintained with `node scripts/decisions.mjs`; see README.md. Newest first. -->

## 2026-11-20: Marks for empty hexes, out of reach, a needed role and a mislead

ID: `2026-11-20-marks-for-empty-hexes-out-of` · Status: current

**Decision.** The art kit adds `drawEmptyMark(palette, size, fade)` (a faint dashed ring, fading as `fade` goes 0→1), `drawOutOfReachMark(palette, size, angle)` (a short faded dashed arrow ending in a coral cross), `drawRoleBadge(role, palette, size)` (the role emblem on a paper halo, for the corner of a greyed action), `drawMisledMark(palette, size)` (a slate disc with a hooked arrow turning away) and three moments: `nothing-here`, `misled`, `peril-relieved`. The web decides where each shows and how long a mark lasts.

**Reasoning.** Playtest feedback: surveys that found nothing gave no sign, a tap out of reach opened the inspect card silently, a greyed action did not say which role it needs, and mislead and shelter showed no effect. Each is a picture, not text. Review batch 2026-11-20-5, item `feedback/marks`.

## 2026-11-20: Features stand on a plinth; decorative props do not

ID: `2026-11-20-features-stand-on-a-plinth-decorative` · Status: current

**Decision.** `renderScene` draws every revealed feature (node, site, trap) and every settlement on a plinth: a squashed disc of lighter ground with a soft ink rim (`featurePlinth` in the art kit). Terrain props (rocks, tufts, trees) never get one. The three new open-ground nodes have their own looks: `fieldstones`, `outcrop`, `deadfall`.

**Reasoning.** The fresh-eyes playtest took pebble and stone decorations for loot. A plinth is a shape difference, not a colour one, so it reads at phone zoom (about 0.58) and in lite mode without words. Review batch 2026-11-20-5, item `feedback/phone-features`.

## 2026-11-20: A survey of an empty hex says so

ID: `2026-11-20-a-survey-of-an-empty-hex` · Status: current

**Decision.** A survey of a hex that holds no feature adds `{ kind: 'survey-empty', hex, characterId }` after its `survey` and `explore` events. Entering an empty hex stays an `explore` with no `reveal`; no new event for it.

**Reasoning.** The fresh-eyes playtest surveyed about ten hexes and could not tell an empty hex from a failed look. The web could infer emptiness from a missing `reveal`, but one explicit event is simpler to show as a "nothing here" moment. It is public: once explored, a hex's feature (or its absence) is visible to everyone.

## 2026-11-20: Dev season brings threats from the first tick

ID: `2026-11-20-dev-season-brings-threats-from-the` · Status: current

**Decision.** The dev season (staging and local only) sets `threatsFromDay: 1` and `threatChanceBase: 0.6` on top of its short route. Production keeps the core defaults (from day 3, base 0.25). In the capture's "wounded" season the guardian now also defends, so it still ends wounded rather than lost.

**Reasoning.** The playtest's first season had no peril until day 13. Simulated through the core over 30 seeds of the 12-step dev season with 2 and 3 idle players: before, the first threat was out by day 2 in 15–17 of 30 and by day 3 in 22–23; after, 23–25 and 27–29. Strikes raise peril by day 5 in 22–24 of 30 (was 19–20) and by day 6 in 27–29. The first tick makes day 2, so `threatsFromDay: 1` and `2` behave the same; 1 says "from the start".

## 2026-11-20: Stone, iron and timber also lie on open ground

ID: `2026-11-20-stone-iron-and-timber-also-lie` · Status: current

**Decision.** Three smaller nodes on open ground (content version 7): fieldstones (stone, weight 4), ore outcrop (iron, weight 5) and deadfall (timber, weight 3), 2 charges each, each with its own icon. Iron deposits drop from weight 30 to 15 and timber stands from 40 to 25, so about as many hexes hold something as before (about 15%). `packages/core/scripts/findability.ts` measures it and `test/findability.test.ts` holds the goal.

**Reasoning.** Iron lay only on desert or by cliffs, stone only by rivers and timber only in forest, so a route over open plain could pass a week with none, and the playtest built nothing. Over 100 seeds, default config, the creature's real steps, days 1–8: the window held stone in 90 seeds before and 98 after, iron 89 → 99, timber 81 → 96, forage 100 → 100; within 3 hexes of the creature (a day trip), stone 68 → 89, iron 73 → 85, timber 61 → 82. Older games are wiped by the version bump, as before a stable release.

## 2026-11-20: Threats and settlements near you carry M4-style action badges

ID: `2026-11-20-threats-and-settlements-near-you-carry` · Status: current

**Decision.** Like the M4 node and site badges, a small strike glyph sits on each threat you could strike (on or next to it, from the core's check, also when your actions are spent), and a settlement where you stand or next to you shows what it offers: a parley glyph while wary, a gift glyph while friendly with no boon taken. Angry or spent settlements show none. The settlement card names its people.

**Reasoning.** The polish round's pattern: hint what can be done nearby with the action's own glyph, without saying what it does. The names follow M4's "names on icons".

## 2026-11-20: Escort and struck marks read the core's rule through one web function until the core exports it

ID: `2026-11-20-escort-and-struck-marks-read-the` · Status: current

**Decision.** The web's escort ring and shield marks come from `escortedIds` / `escortCentres` in `apps/web/src/game/season.ts`, which read the core's rule (an active guardian on a hex covers every active character within 1, itself excepted) with the core's own `ESCORT_TAG` and `roleHas`. The bandage reads `Character.struckDay === day` through `struckToday` there too. When the core exports its escort check, those functions call it instead.

**Reasoning.** The core keeps `isEscorted` private for now; the marks are display only (the server decides who is struck), and one function is one place to switch.

## 2026-11-20: The new-season button shows for admins with dev tools on

ID: `2026-11-20-the-new-season-button-shows-for` · Status: current

**Decision.** The ending's new-season button shows when the server offers dev tools and you are an admin (the same condition as "next day"). It calls `POST /api/dev/new-season`, then loads the new game's view, which replaces the old one whatever its version; with the characters gone, the join drawer follows.

**Reasoning.** The route exists only with dev tools on (staging and local), so showing the button in production would offer something that always fails. Production keeps the ended season on screen.

## 2026-11-20: Settlement actions live in the here card; from afar its card shows only attitude and favour

ID: `2026-11-20-settlement-actions-live-in-the-here` · Status: current

**Decision.** Parley, offer (one button per trade good carried, showing that good's icon) and the boons are buttons in your own hex's here card when you stand on a settlement, like gather and work-site on a feature. A settlement you do not stand on opens a small card when tapped: its drawing by attitude and, while wary, its favour marks; no buttons. Selected, a tap on a reachable settlement plans the walk there. Parley's risk mark shows when the core's check gives a chance below 1.

**Reasoning.** Matches "the action is only reachable when standing there, as with other here-actions"; the core refuses these actions anywhere else, and the risk is only known from the check where you stand. Keeps the settlement's own card to visuals.

## 2026-11-20: A tap on a threat opens its card, even while selected

ID: `2026-11-20-a-tap-on-a-threat-opens` · Status: current

**Decision.** A tap on a threat's hex opens the threat's card (name, strength marks, and the strike with its pips when you stand on or next to it, faded without the actions), even while your character is selected; the same tap again closes it. After a strike the card stays open while the threat stands.

**Reasoning.** No one plans a walk onto a threat, and the card is the way to strike. Keeping it open after a hit makes a second strike one tap. A walk next to a threat is still planned by tapping a neighbouring hex.

## 2026-11-20: Milestone 5 art: threats, settlements and the guardian's marks are drawn by the art kit from content keys

ID: `2026-11-20-milestone-5-art-threats-settlements-and` · Status: current

**Decision.** The art kit draws threats (`captors`, `swarm`, `rockslide`, `raiders`) and settlements (`hill-folk`) by content icon key as scene cells, drawn in full under the veil, with strength and favour as small marks, a coral ground stain under threats, an approach arrow and a pulse for a threat arriving tomorrow. Escorted, struck and defending are marks on the character figure; the escort ring is an overlay. The peril gauge (wounded threshold marked), the route strip, the peril vignette and the three ending scenes are standalone SVGs drawn from state, with no text. Review batch 2026-11-20-1.

**Reasoning.** Same pattern as features and fires, so the web app passes data, not drawings. Threats need to read apart from features at a glance, hence the stain. Endings carry no text so the web app sets the only title.

## 2026-11-20: Milestone 5 core: readings of the season contract

ID: `2026-11-20-milestone-5-core-readings-of-the` · Status: current

**Decision.** Where `docs/design/m5-season.md` leaves room, the core reads it so:

- Guardians: strike power and `defend` read the role tag `defend`; not being struck and escorting read `escort` (both on the Guardian).
- Added tuning values: action costs (`strikeCost`, `defendCost`, `parleyCost`, `offerCost`, `askBoonCost`, all 1), `threatPathDistance` (4, the rockslide's distance ahead) and `perilHungryLevel` (2).
- "From day 3" means the day the tick starts. A threat within contact does not move. Characters on a hex the creature just stepped onto count as riders (never struck). A threat spent on the creature strikes no characters that tick.
- Approach order: `behind` and `flank` take the window edge hex nearest the edge hex straight behind (or ahead-left / ahead-right, a seeded side); `path` takes the straight-ahead line from 4 hexes out. A rolled threat never appears on water (any type, so a rockslide never lands in a river) or on another threat's hex. Raiders sent by an angered settlement ignore `threatsMax`.
- A settlement is never placed on a threat's hex; when no leading-edge hex fits, none appears that time.
- Ids need no counter: rolled threats `t<day>`, raiders `t<settlement id>`, settlements `s<day>`.
- A mislead on day d sets `misleadUntilDay` to d + `misleadDays`; ticks that start days up to it roll no pursuers; it clears afterwards.
- `ask-boon` refuses `unknown-boon` before `not-friendly`. Once the season is over, `planPath` refuses and `reachablePlaces` is empty, like moves.

**Reasoning.** The simplest readings that keep the other options open: every number is in the tuning config, ids derive from the day so state stays small, and tag reads follow the role data already in content. A struck character records the day in a public `Character.struckDay`, so the bandage shows after a reload.

## 2026-11-20: Threats are tagged data that appear at the window's edge and walk in openly

ID: `2026-11-20-threats-are-tagged-data-that-appear` · Status: current

**Decision.** Milestone 5's attack system (`docs/design/m5-season.md`): threat types in content with strength, speed, approach and weight (a captor band from behind, a pterodactyl swarm from the flanks, a rockslide on the path ahead, raiders from an angered settlement). Threats are public from the moment they appear; their approach is the forecast. They move after the creature's step, strike the creature at contact (peril rises by strength less defence) and strike unescorted characters within one hex (one action the next day). Appearance chance and strength scale with active players and days, from the tuning config. Terrain does not slow threats yet.

**Reasoning.** The plan's picks, made concrete with the fewest new rules: one movement rule and one contact rule cover all flavours, and the flavours differ by data (a speed-0 rockslide is dodged by steering, which ties threats to the keeper's fire). Striking characters gives the guardian's escort a purpose without a combat system. A struck character losing actions, not the character, keeps losses rare.

## 2026-11-20: Guardians strike, defend and escort; anyone can strike a threat

ID: `2026-11-20-guardians-strike-defend-and-escort-anyone` · Status: current

**Decision.** Strike: anyone on or next to a threat, 1 action, strength −2 for a guardian, −1 for others. Defend: guardians riding, 1 action, each strike on the creature until the tick is reduced by 2 per defender. Escort: passive; characters within one hex of a guardian standing on a hex are not struck, nor is the guardian.

**Reasoning.** Basics for all, mastery for specialists: striking is open to everyone but risky without a guardian nearby; defending is the guardian's lever, as lingering is the keeper's. Escort as position, not an action, keeps the daily cost low. Speciality against tags (`flying`) stays a future upgrade.

## 2026-11-20: Settlements appear on the route; parley or offer to befriend, or anger them

ID: `2026-11-20-settlements-appear-on-the-route-parley` · Status: current

**Decision.** A settlement appears at the leading edge on fixed step counts (first at step 4, then every 10; steps 3 and 9 on staging), visible at once. Parley: envoys +2 favour; others +1 with a 25 % chance to anger it. Offer a `trade` material (old coin) for +2 without risk. At 3 favour it is friendly and grants one boon, picked by whoever asks: a gift to the stores, misleading the pursuers (they vanish and none come for 4 days), or shelter (peril −3). Angered, it sends raiders at once and stays angry.

**Reasoning.** Placing settlements by the route guarantees every season meets a people (the plan's "at least one"). A risk for non-envoys, shown before acting, gives the envoy a clear part without locking others out, and the coin ties the scholar's find into diplomacy. A choice of boon lets the team answer what is pressing (food, pursuers, peril).

## 2026-11-20: Peril is a public track; the season ends at home or at full peril

ID: `2026-11-20-peril-is-a-public-track-the` · Status: current

**Decision.** Peril (0 to 10) rises by strike damage and by 1 at a tick that ends with the creature underfed at level 2 or more, and falls by 1 at a tick where it did not rise. The route is `routeLength` steps (40; 12 on staging and locally); lingering adds none. Peril at 10 loses the season; reaching the route's end wins it, safe below 5 peril, wounded at 5 or more. Once over, actions, moves and ticks do nothing; the ending shows a title only.

**Reasoning.** The design's graded failure: pressure builds visibly so the team can react, and calm days heal it. Counting steps (not days) makes lingering a real trade-off. Peril being public is fine: hunger was already partly visible from level 2.

## 2026-11-20: The day's step uses Milestone 3's creature walk; a linger plays the stayed mark

ID: `2026-11-20-the-day-s-step-uses-milestone` · Status: current · Supersedes: `2026-11-20-the-step-ghost-walks-for-one` · Amends: `2026-11-20-step-hints-scale-with-chance-the`

**Decision.** The Milestone 4 web's step ghost (a faded copy of the creature, hiding the scene's creature and its riders) is dropped. A `creature-step` event that moves plays Milestone 3's walk (the creature and its riders slid by `slideFrom`), drawn with your signs so it looks as it does on the map. One that stays (`from` equals `to`, a linger) plays the art kit's stayed mark on the creature instead. The step hints and their sizing by chance stay as they are.

**Reasoning.** One walk for both milestones: Milestone 3's carries the riders and holds the camera still, which the minimal ghost could not.

## 2026-11-20: The step hints, appetite badge and stayed mark use the art kit's drawings

ID: `2026-11-20-the-step-hints-appetite-badge-and` · Status: current · Amends: `2026-11-20-the-creature-card-s-heading-loses`

**Decision.** The web's stubs are replaced: the step hints are the art kit's `drawStepHint` (one per predicted option, pointing the walk, at least about 26 screen px), the bubble's badge is `drawAppetiteBadge` at 20 px inside the creature entry's corner (kept within the bubble card), and the stayed moment is `drawMoment('stayed')`. The step decision's size range (`pawScale`) is gone: the art kit sizes the hint by chance.

**Reasoning.** The art kit now draws all three; one drawing language and one place to tune them.

## 2026-11-20: The creature card's heading loses its ring; the bubble carries an appetite badge

ID: `2026-11-20-the-creature-card-s-heading-loses` · Status: current, amended by `2026-11-20-the-step-hints-appetite-badge-and`

**Decision.** The dashed ring around the heading arrow on the creature card is removed: the arrow stays, the ring was decoration that looked like a button (a playtester tapped it). The hub bubble's creature entry carries a badge of your read of the creature's appetite (`signs.appetite`) for everyone: sharp for keepers, faint for others, rings per level; a stub drawing until the art kit's appetite badge lands.

**Reasoning.** Nothing real needed a control there, so removing beats wiring a fake action. The badge lets every player notice hunger from the bubble without opening the hub; a keeper's read is sharper, in line with the signs.

## 2026-11-20: Step hints scale with chance; the day's step plays as a walk or a stayed mark

ID: `2026-11-20-step-hints-scale-with-chance-the` · Status: current, amended by `2026-11-20-the-day-s-step-uses-milestone`, `2026-11-20-the-step-ghost-walks-for-one`

**Decision.** Each of the creature's step options from `predictCreature` shows as a paw mark whose size (0.7 to 1.5 of the base) and opacity grow with its chance, so the likelier straight step and the rarer veers read at a glance. At day change a `creature-step` event plays a walk: a ghost of the creature slides from yesterday's centre to today's and fades (SVG SMIL started on mount; the CSP forbids inline styles). A step with `from` equal to `to` (a linger) plays a stayed mark on the creature: the art's `stayed` moment when it exists, the linger mark until then.

**Reasoning.** Playtesters could not tell the creature veers, nor see that it walked sideways or stayed. The ghost walk is minimal on purpose: Milestone 3's day-change step animation may replace it. Scale range is one function (`pawScale`).

## 2026-11-20: A timber stand hints at a fire, on your here card and its inspect card

ID: `2026-11-20-a-timber-stand-hints-at-a` · Status: current · Amends: `2026-11-20-light-a-fire-hints-faded-without`

**Decision.** A revealed node whose yield carries the fire's fuel tag (`wood`, read from content, never by id) hints at a fire whether or not you have seen one: on your own here card the faded light-fire (timber faded) shows without fuel; on the stand's inspect card a faded fire button with its timber and pip shows, never actionable (a fire is lit where you stand). The seen-a-fire rule still applies to other features.

**Reasoning.** M4 coordinator's call after a playtest: wood is where players first meet the fuel, so that is where the hint teaches what timber is for, without words.

## 2026-11-20: Hunger drains every second day

ID: `2026-11-20-hunger-drains-every-second-day` · Status: current · Amends: `2026-11-20-hunger-has-a-comfortable-band-underfed`

**Decision.** Satiety drops by `drainPerDay` (1) only on the ticks into a day that is a multiple of the creature type's `hunger.drainEveryDays` (2 for the Mossback: the ticks into days 2, 4, 6…), so it drains half as fast as before. One forage (+2) now lasts four days.

**Reasoning.** Halving the drain was asked for in the polish round. A whole-number cadence keeps satiety an integer and the rule deterministic from the day alone, with no fractions in stored state; the cadence lives in the creature's data beside the rest of its hunger.

## 2026-11-20: Appetite reads at game zoom: a ground aura, bigger shape changes, a hub badge and weighted step hints

ID: `2026-11-20-appetite-reads-at-game-zoom-a` · Status: current · Amends: `2026-11-20-milestone-4-art-appetite-cues-lying`

**Decision.** A playtest at the real game zoom (a hex is about 32 px on a phone) showed no hunger at all, so the appetite sign is made much stronger:

- A ground aura under the creature: a cool slate wash when underfed and a warm ochre wash when overfed, stronger with the level.
- Bigger shape changes. Underfed: up to 38 % narrower, flatter, thin legs, the moss mostly gone, and a heavier grey wash. Overfed: up to 50 % wider and taller. Levels step 0.5, 0.75, 1.
- Faint (non-keepers): 75 % of the level's strength, never below level 1's, with the marks in lighter ink. Faint level 3 still reads as starving.
- `drawAppetiteBadge(palette, size, appetite | null)` for the hub bubble's creature entry: a small head on a disc (narrow, grey, drooping ears on a cool disc when underfed; wide with heavy lids and a doze bubble on a warm disc when overfed). A keeper's badge shows the level as one to three dots; the faint badge is paler and has no dots.
- `drawStepHint(palette, size, chance, angle)`: a paw print sized and darkened by its chance, for showing all three step options with their weights.
- Moment `stayed`: settling dust and curled rest marks on the creature when it lingered over the day change.

**Reasoning.** At game zoom the creature is about 100 px, so marks on its body vanish. A ground wash and a changed outline read at a glance. The badge repeats the sign where the hub lists the creature, at a size where only a glyph works.

## 2026-11-20: The keeper's cue shows the creature's true attitude for the tame first creature

ID: `2026-11-20-the-keeper-s-cue-shows-the` · Status: current

**Decision.** For the first, tame creature the keeper's reaction cue keeps showing the creature's hidden attitude to a fire in range (toward, away, unmoved), not the rolled outcome of its step, so a single well-placed fire answers the question for a keeper. Later, harder creatures can blur or delay the cue; nothing in the data shape prevents that. The lead's call after the Milestone 4 playtest, listed for Misa.

**Reasoning.** The fresh-eyes playtest never worked out the reaction at all; making the first creature's puzzle answerable in one experiment keeps the loop learnable, and difficulty can grow with later creatures as the design intends.

## 2026-11-20: Light a fire hints faded without fuel once you have seen a fire

ID: `2026-11-20-light-a-fire-hints-faded-without` · Status: current, amended by `2026-11-20-a-timber-stand-hints-at-a` · Amends: `2026-11-20-light-a-fire-shows-on-your`

**Decision.** When your own hex's card is open for something else (a revealed feature) and you have seen a fire on the map this session (a fire in any view you received, remembered in memory only), the card also shows light-fire faded, with its timber faded, when you carry no fuel. The fuel shown is the core check's `missing` material and the pips its refusal `cost`. Without fuel the card still never opens on an empty hex just for the fire. Moments for fire, feeding and lingering, a fire going out and the creature eating from the stores come only from events.

**Reasoning.** The M4 coordinator's call: once players know fires exist, a faded fire hints that timber makes one, without opening the card everywhere. Reading cost and material from the core's refusal keeps the web free of its own copy of the rules. The earlier view-diff moments could misread an unlock spending food as a feeding.

## 2026-11-20: A lingering creature's stay mark sits on its footprint's near edge

ID: `2026-11-20-a-lingering-creature-s-stay-mark` · Status: current

**Decision.** While `predictCreature` returns the `stay` option, the paw prints ahead are not drawn; the art kit's stay mark is drawn once over the map at the hex on the near (screen-bottom) edge of the creature's footprint, at least about 40 screen px across at any zoom.

**Reasoning.** At the creature's centre the body and riders would hide it, and drawn ahead it would read as where the creature goes. The near edge is at its feet, always in view. Its place is one line in `apps/web/src/map/overlays.ts` (`stayHint`).

## 2026-11-20: Feed and linger sit in the hub drawer as unlock-style cards

ID: `2026-11-20-feed-and-linger-sit-in-the` · Status: current

**Decision.** The creature's hub drawer has a care row above the unlocks, using the unlock card layout: the action icon, the food it takes (faded when the stores hold none), the action pips and the go button. Feed shows for every active character, faded unless riding with the actions and food. Linger shows only for keepers (hidden on `needs-keeper`), faded when not riding, out of actions or the day after a linger, and sealed (done icon, no button) once asked for today. Feeding keeps the drawer open; lingering closes it so the creature is seen lying down with the stay mark.

**Reasoning.** Reuses the hub's existing card and its second-tap button, so no new control to learn. A faded feed card hints that the creature eats without saying how; linger is the keeper's lever, so others never see it.

## 2026-11-20: Light a fire shows on your hex's card only when you carry fuel

ID: `2026-11-20-light-a-fire-shows-on-your` · Status: current, amended by `2026-11-20-light-a-fire-hints-faded-without`

**Decision.** Your own hex's card offers light-fire (the fire icon, a small timber icon and the action pip) when you stand on a hex with fuel in your pack: enabled when `checkAction` allows it, faded when only actions are short. It is not offered without fuel, on water, on the creature or where a fire already burns. The card now opens on a hex without a revealed feature when an action is offered there.

**Reasoning.** Offering a faded fire on every hex without timber would open the card each time you select your character and cover the neighbours you tap to move. Carrying timber is the player's own signal that they mean to burn it.

## 2026-11-20: M4 tick events: a linger is a creature-step that stays; fire-out and creature-ate are public

ID: `2026-11-20-m4-tick-events-a-linger-is` · Status: current

**Decision.** In `nextDayWithEvents`, a creature that lingered still gets its `creature-step` event, with `from` equal to `to`, rather than a separate `lingered` event. Each fire that burns out gives `{ kind: 'fire-out', hex, stimulus }`. A starving creature that eats from the stores gives `{ kind: 'creature-ate', material }`. Order: step, ate, fires out, deposits, losses, day. No event, from an action or the tick, carries the creature's reaction, satiety or cues: signs stay per viewer in the view. M4 refusals carry `cost` like M3's; `no-fuel` and `no-food` also carry `missing` (the first material with the fuel or food tag).

**Reasoning.** Every tick has exactly one step event, so the web needs no special case to find it; lingering is already public on the creature (`lingering`, `lingeredDay`). The stores and fires are public, so these events reveal nothing hidden.

## 2026-11-20: Poll every 10 seconds while the game is visible

ID: `2026-11-20-poll-every-10-seconds-while-the` · Status: current · Amends: `2026-11-20-polish-after-the-m3-playtest-icon`

**Decision.** The client polls `GET /api/game?since=` every 10 seconds while the page is visible (was 30), in addition to refreshing after your own actions and on focus. `POLL_MS` in `apps/web/src/api/sync.ts`.

**Reasoning.** Other players' moves showed up too late in the playtest. Cost (estimated): about 8 players × 6 requests a minute, only while the page is visible; an hour of play each is about 2,900 requests a day, far under the Workers free tier's 100,000 a day. An unchanged game answers with a tiny `{ unchanged: true }`.

## 2026-11-20: Polish after the M3 playtest: icon names, the window edge, a lost moment, the creature's walk and action hints

ID: `2026-11-20-polish-after-the-m3-playtest-icon` · Status: current, amended by `2026-11-20-poll-every-10-seconds-while-the`

**Decision.** From the fresh-eyes playtest (`docs/playtests/2026-11-20-m3-fresh-eyes.md`):

- Role, trait and quirk icons show their content name (only the name) in a small tip on hover or tap; in the join drawer a trait or quirk tap does not pick the card, and a chosen role shows its name. On a character card the tapped icon's name shows in the name row for a moment. Role buttons are labelled with their names.
- The pack box closes on a tap elsewhere, Escape and right-click, and shows one slot per unit of capacity, so an empty pack reads as empty.
- The window's edge is always drawn as a faint dashed ink line. On your grace day the hourglass sits by your figure and your HUD pips pulse in the warning tint. When your character is lost, its figure fades into the fog for 2.2 s before the join drawer opens (the tick's `lost` event).
- On a new day the camera holds still while the creature (with its riders) walks its step for 1.2 s, then eases after it (the tick's `creature-step` event).
- An explored node or site with something left, where you stand or next to you, carries its action glyph (the gather hand, the work key) as a small badge; while your character is selected, unexplored neighbours you could survey show a faint spyglass.
- The client refreshes right after each of your own actions (a read of the log since the view the action started from), when the window regains focus, and every 30 s while visible (later 10 s).

**Reasoning.** Each answers a point the tester could not read from the screen, keeping to names and glyphs rather than explanatory text. The walk uses a Web Animation of a transform (in `cssTransform.ts`, still the one module that writes styles), so it costs no per-frame renders.

## 2026-11-20: Moments play only from the server's event log, once per event

ID: `2026-11-20-moments-play-only-from-the-server` · Status: current · Amends: `2026-11-20-the-revised-chain-in-the-interface`

**Decision.** Every view the client receives carries the server's events: a move or an action answers its own; a read with `since` answers every logged event after that version (others' actions and the tick). The map plays each event once, keyed by its version and its place among that version's events, and plays nothing when the log reports `eventsTruncated`. The comparison of two views is gone (no more guessing a find from a pack growing or a trap from actions dropping to zero). A trap shows its snap wherever it sprang; your pips shake only when the trap caught your own character. Because the dev "next day" answer carries no events, the client reads the log `since` its previous view right after it. What the client can do and what it costs comes from the core's checks, including the cost and the missing materials on a refusal.

**Reasoning.** The lead's review: events are the record of what happened, so moments built from them are exact and work the same for your own moves, other players and the tick, while view diffs were guesses that could miss or misread changes.

## 2026-11-20: The revised chain in the interface: survey in the inspect card, the pack on the HUD, stores and unlocks in the hub drawer

ID: `2026-11-20-the-revised-chain-in-the-interface` · Status: current, amended by `2026-11-20-moments-play-only-from-the-server` · Supersedes: `2026-11-20-chain-actions-live-in-the-popover`

**Decision.** Following Misa's revised rules (`docs/design/m3-chain.md`). Unexplored hexes in the window are drawn under the art kit's veil (cell state `unexplored`); a newly explored hex's veil lifts away as a moment. Tapping an unexplored hex next to your character opens its inspect card with a survey button (a spyglass and its cost pips: 1 for a scout, 2 for others), faded when you lack the actions. Selecting your character on a revealed feature opens the compact here card (gather, work the site) as before. Your pack is the round button at the bottom left, drawn as a satchel whose fill shows how full it is; a tap shows its materials as icons with counts in a small card above it. The bubble's creature entry now opens the hub drawer instead of the creature card: the creature and its heading at the top, the team stores (crates icon and material counts), then one card per unlock: done ones carry the seal; the one in progress shows its work bar; the others show their material cost, faded where the stores fall short. Each open card has a build button with its cost pips, enabled only for an engineer riding the creature. A finished unlock closes the drawer so its moment shows. The stores also show as crates on the creature's back. Moments: veil lift, survey and reveal blooms, a find (burst and rising material), a trap (snap, pips shake), a deposit (the material drops onto the creature) and a finished unlock (its sealed icon rises from the creature). The recipe cards and the team inventory satchel are gone.

**Reasoning.** Survey lives where you already look at a hex, so it needs no new gesture; it only shows next to you. The hub was already the creature's place in the flow, and the drawer built for joining holds the longer list of unlocks. Reading every check from the core's `checkAction` keeps what the client offers the same as what the server accepts.

## 2026-11-20: The here card is compact and lets taps through its body; moments use the art kit's marks

ID: `2026-11-20-the-here-card-is-compact-and` · Status: current · Amends: `2026-11-20-chain-actions-live-in-the-popover`

**Decision.** The here card is compact (a small drawing of your tile with its feature, then one 48 px action button each), and taps on its body pass through to the map, so only the action buttons catch them. Gather shows an open hand and working a site a key (art kit icons). The inspect card draws a revealed feature or the glint on its tile miniature instead of beside it. Moments use the art kit's marks (`drawMoment`): the reveal bloom grows, holds, then fades over 1.4 s; a find bursts and the found material's icon rises; the trap snaps. The art kit's staged parts appear a beat after the first. The via mark is the art kit's `drawViaMark`. What the client offers comes from the core's `actionsHere` (the same checks the server runs): an action refused for not enough actions, a missing item, a role that cannot work the site or a specialist-only recipe shows faded; any other refusal hides it.

**Reasoning.** On a phone a wider card covered the neighbouring hexes above your figure, so you could not walk on from a feature. Making it pass through keeps the second-tap rule without a new step. Reading the rules from the core keeps the client and server in agreement.

## 2026-11-20: Unexplored hexes sit under one hatched paper veil; packs, stores and unlocks have their own marks

ID: `2026-11-20-milestone-4-art-appetite-cues-lying` · Status: current, amended by `2026-11-20-appetite-reads-at-game-zoom-a`

**Decision.** The creature drawing takes a mood (`CreatureArt.appetite`, `pose`, `cues`; `drawCreature(..., stores, mood)`), and the scene draws it:

- **Underfed:** a narrow, low, sunken body on thin legs, the moss shrunk back, head and tail drooping, a cool grey wash over hide and moss, no blush, and ribs on the near flank, one per level.
- **Overfed:** a wide body bulging a little past the footprint on thicker legs, a sheen low on the flank, heavy lids, and large doze bubbles rising from the crown, one per level.
- **Levels** step up by strength 0.4, 0.7 and 1 (`APPETITE_STEPS` in `creature.ts`), so each level is clearly stronger at map scale.
- **Faint** (what non-keepers see): the shape at level-1 strength and the marks in lighter ink at full opacity, so it stays visible at map scale; the count of ribs or bubbles still matches the level the core gives them.
- **Cues** take the core's `{ hex, reaction }` (the scene turns hexes into offsets from the centre). Toward: the head turns to the first such fire, ears prick, and a dashed look-line with two alert strokes points at each such fire. Away: three heavy coral shiver arcs outside the rim on the fire's side, ears flat, head turned away. Unmoved: still sage rings on the ground on the fire's side, head straight.
- **Lying** (`pose: 'lying'`): the body flattens onto the ground in a wide shadow pool, legs tucked with two front paws showing, head resting low, tail flat; riders sit lower (`riderAnchor` takes the same mood).
- **Fires:** `ArtCell.fire` draws a small campfire (stones, sticks, flame, glow, smoke with `data-fire` parts to animate) on its hex, in full even under the veil, clearing the terrain props like a feature does.
- **Keys:** feature `berries` (bushes; picked bare when depleted), material `forage`, actions `light-fire`, `feed`, `linger` on a round tile with a dashed inner ring, moments `fire`, `feed`, `linger`, and `drawStayMark` for the step hint when the creature stays put (two paws side by side in a dashed ring; the paw-print hints live in the web app).

**Reasoning.** Counting the level in ribs and bubbles keeps the sign readable without text or numbers, and the two kinds use different shapes and colours so they never look alike. The look-line, shiver arcs and calm rings are three unlike marks, so a keeper cannot mistake one reaction for another, and each sits on the fire's side so several cues can be told apart.

## 2026-11-20: M4 core: hunger cap in creature data, starving meals nourish, lingering twice refused

ID: `2026-11-20-m4-core-hunger-cap-in-creature` · Status: current

**Decision.** Calls the M4 contract left open, made in the core:

- The hunger cap (10), start, drain and comfortable band live in the creature type's data (`hunger.max` and so on), not in the tuning config: they are properties of the creature, and later creatures differ. The appetite levels derive from the band (level = distance outside it, up to 3).
- A starving creature (underfed level 3 after the drain) that eats a food unit gets its nourishment, as if fed; a non-food unit just goes. The non-food pick is seeded by the game seed and day among the materials held.
- Lingering again on a day the creature already lingers is refused with the existing `already-have`, rather than a new refusal.
- A step option for a lingering creature is `{ direction: heading, centre: current centre, chance: 1, stay: true }`; other options have no `stay`, so existing callers keep working.
- A creature's reaction to a stimulus is found by the stimulus's tags (the first the nature lists); a tag it has none for is indifference. Fire is found by its `fire` tag, fuel by the stimulus's fuel tag, food by `food`, the keeper by the role tag `tend`.
- Berry bushes have placement weight 10 (about 3 in a new game's window, one more every two or three days). They slow the scripted M3 chain test (spikes by day 70 on 10 of 12 maps, was 46 on 9), so its bound moved to 70 days.

**Reasoning.** Each is the simplest option that keeps the others possible, and every number stays in one place (content or tuning config).

## 2026-11-20: Lingering is the keeper's action and never runs two days in a row

ID: `2026-11-20-lingering-is-the-keeper-s-action` · Status: current

**Decision.** A keeper riding the creature can spend 2 actions to make it stay put at the next tick. It cannot linger on the day after a linger. Whether it lingers is public. Other roles cannot linger.

**Reasoning.** Pace is the keeper's lever in the design, and the creature must always move: allowing only every other day keeps a whole team of keepers from stalling the journey. The cost is in the tuning config.

## 2026-11-20: Hunger has a comfortable band; underfed is erratic, overfed is sluggish; anyone can feed

ID: `2026-11-20-hunger-has-a-comfortable-band-underfed` · Status: current, amended by `2026-11-20-hunger-drains-every-second-day`

**Decision.** Satiety is a hidden 0 to 10, starting at 6, dropping 1 per day; 4 to 7 is comfortable. Feeding (riding, 1 action, 1 food from the stores) adds the food's `nourishes` (2). Underfed makes the creature's steps erratic (even veer weights) and, at the worst level, it eats from the team stores. Overfed weakens how much stimuli pull it. Anyone can feed; the keeper's edge is reading the signs. Herbs and illness are left for later.

**Reasoning.** Both failure directions need a cost, or players would always overfeed. Erratic and sluggish are distinct and both hurt steering, so keeping it comfortable is what lets the team steer. Feeding for all follows "basics for all"; the keeper's mastery is information and pace, and more comes later as upgrades.

## 2026-11-20: Symptoms are computed per viewer; keepers see them earlier and see reaction cues

ID: `2026-11-20-symptoms-are-computed-per-viewer-keepers` · Status: current

**Decision.** The view's `signs` are computed per viewer by the core. A keeper sees the appetite kind and level from level 1, plus a cue for each fire the creature noticed at the last tick (toward, away, unmoved), showing its hidden attitude rather than the rolled outcome. Others see appetite only from level 2, always faint, and no cues.

**Reasoning.** The plan asks for clearer signals for the keeper and a puzzle solvable by experiment. The step is a weighted roll, so outcomes alone can mislead; the keeper's cue makes one well-placed fire a fair experiment while others still have to trust the keeper's reading, as the design describes. Clearer or earlier signs can grow into keeper upgrades.

## 2026-11-20: Fires pull the creature's step by a weighted score; the public prediction stays blind

ID: `2026-11-20-fires-pull-the-creature-s-step` · Status: current

**Decision.** For each fire within 3 hexes of the creature's centre, each of the three step options scores +1 closer, -1 farther or 0; its weight is multiplied by `stimulusPull` (6) to the power of the score (negated if repelled, ignored if indifferent), then the seeded roll picks. The heading stays fixed; fires shift the path sideways. `predictCreature` keeps the base weights, so the step hints never reveal the reaction or the hunger.

**Reasoning.** A strong but not certain pull makes steering reliable enough to plan with and keeps the walk lively. Keeping the prediction blind is the only way the reaction stays something to learn. Turning the heading itself is left possible for later.

## 2026-11-20: The creature's nature is hidden server data; the first creature is drawn to fire or shies from it

ID: `2026-11-20-the-creature-s-nature-is-hidden` · Status: current

**Decision.** Creature types are content (`CREATURE_TYPES`), with a need and, per stimulus tag, the reactions they may roll. A new game rolls the creature's reactions from the seed and keeps them, with its satiety, in server-only state fields that the player view never lists. The first creature, the Mossback, rolls its fire reaction from attracted or repelled.

**Reasoning.** Hidden properties are the keeper's puzzle and must never reach the client. An indifferent first creature would make the milestone's done criterion (turning it with fire) impossible; the tame first creature keeps indifference for later ones.

**Reasoning.** Milestone 3's chain has to be readable on the map without text: what a hex holds, whether it is used up, and what just happened. Keying everything by content's icon names keeps content as data; staging marks as parts lets the web animate them without the art kit knowing about time.

## 2026-11-20: Milestone 3 rules after Misa's notes: the calls the plan left open

ID: `2026-11-20-milestone-3-rules-after-misa-s` · Status: current · Supersedes: `2026-11-20-milestone-3-rules-the-calls-the`

**Decision.**

- Roles count by their tags: `survey` (Scout), `build` (Engineer), `sites` (Scholar). The later upgrades (the scout's trap sense and glints, the engineer's double yield) are `perks` on the role with `requiresUpgrade: true`, and no rule reads them yet.
- Survey works on any hex adjacent to the character's place (from the creature, the hexes beside its footprint), that is in reach and unexplored. It explores the hex and reveals its feature; a trap there becomes harmless and is not sprung.
- A pack holds `packCapacity` (6) units. Gathering or a find that would overfill it is refused (`pack-full`). The tick empties the pack of anyone the creature picks up into the stores, and a lost character's pack is emptied (lost).
- Building: the first build step of an unlock takes its whole cost from the stores and starts the project; every step (`buildCost`, 1 action) adds 1 work. Any engineer riding the creature can add work. A second unlock is refused while one is in progress (`busy`), and a finished one cannot be built again (`already-have`).
- For a site, "can this character ever work it" (`cannot-work`) is checked before "the team lacks the unlock" (`needs-unlock`).
- A site roll is per (game seed, day, character, site): a retry by the same character on the same day repeats the result.
- Tier-1 tombs find old coin (no use yet); only tier-2 tombs find ancient alloy, so the spikes need the lantern.

**Reasoning.** Misa's notes fixed the shape (exploration, survey, packs and stores, unlocks, no scout immunity). These are the details left open, each the simplest choice that keeps the chain intact.

## 2026-11-20: Features are placed by terrain tags with absolute weights

ID: `2026-11-20-features-are-placed-by-terrain-tags` · Status: current

**Decision.** Each feature type has a placement: terrain tags it sits `on`, optionally tags it sits `near` (cliff edges, river banks, forest edges), and a weight against a scale of 20. A hex holds a given fitting feature with probability `featureChance × weight / 20`, and the fitting features' slices add up, so a rare feature stays rare wherever it fits. Starting values: `featureChance` 0.08; iron 30 (desert, cliff edges), stones 20 (river and banks), timber 40 (forest and edges), tomb 2, deep tomb 4, snare 2, pitfall 2 (open or dry ground). That leaves about 88% of hexes empty. A resource node and a tomb are in view from the first day, and a deep tomb typically within a few days. A scripted party of three (scout, engineer, scholar) completes the chain to climbing spikes on 10 of 12 maps, on days 21–45 (median about 34). Most of the wait is for timber and iron to come into view, then for a deep tomb after the lantern.

**Reasoning.** Relative weights let plains (most of the map) fill up with tombs and traps, because nothing else fits there. Absolute weights keep each feature's frequency under control on its own. The chain timing is a tuning question for Misa: raising `featureChance` or the node weights shortens it.

## 2026-11-20: Unexplored hexes sit under one hatched paper veil; packs, stores and unlocks have their own marks

ID: `2026-11-20-unexplored-hexes-sit-under-one-hatched` · Status: current

**Decision.** A new cell state, `unexplored`, draws a hex's terrain under a veil: one shared SVG `<pattern>` (paper at about 60 % with a fine slanted inkSoft hatch, in the scene's defs, also in lite mode) filling one merged path over every unexplored hex, with that hex's props at 60 % opacity and no feature. It is clearly unlike explored ground, blank paper (unseen) and the plain paper veil of fading tiles. `drawVeilLift(projection, hex)` gives one hex's veil (`data-veil="q,r"`) for the map to fade and lift when the hex becomes explored. `drawPackIcon(palette, px, units, capacity)` draws a satchel with a rising wash and one ochre pip per unit; `drawStoresIcon` draws crates and a basket, and `CreatureArt.stores` puts one to three crates on the creature's back near the tail, clear of the rider slots. Unlock icons stay hook, lantern and spikes; `drawIcon(key, …, { done: true })` adds a wax seal (`drawUnlockSeal` alone), and `drawWorkBar(palette, width, fraction, steps)` is an ink bar filled to a fraction with a tick per unit of work. The survey mark is a fourth moment kind (`drawMoment('survey')`): a spyglass sweeping a fan of looking-lines, in staged parts.

**Reasoning.** Misa's revised Milestone 3 makes exploration visible on the map and moves materials through packs into the creature's stores. A single pattern on one path keeps 91 hexes cheap on phones; the per-hex lift element lets the web animate a reveal without the scene drawing hexes one by one.

## 2026-11-20: The Stubborn quirk's icon is a boulder, so icon keys never clash

ID: `2026-11-20-the-stubborn-quirk-s-icon-is` · Status: current · Amends: `2026-11-20-features-glints-moments-and-the-via`

**Decision.** The quirk motif formerly keyed `stone` is keyed `boulder` (content renames the Stubborn quirk's icon to match), and `drawIcon` no longer chooses between a quirk and a material by the tile option: every icon key names one drawing. `stone` is the material.

**Reasoning.** One key for one drawing is simpler and cannot surprise a caller that forgets the tile option.

## 2026-11-20: Features, glints, moments and the via mark are drawn by the art kit from content keys

ID: `2026-11-20-features-glints-moments-and-the-via` · Status: current, amended by `2026-11-20-the-stubborn-quirk-s-icon-is`

**Decision.** A revealed feature is drawn on its tile from the `icon` key content gives it (`ore`, `stones`, `logs`, `tomb`, `deep-tomb`, `snare`, `pitfall`; `ArtCell.feature = { look, state }`), upright like the props, 1.6 times their size (`ART_TUNING.featureScale`) so it reads on a phone, and it replaces the terrain's props on that tile. Nodes have a `depleted` look, tombs a `spent` one (the door open, the seal rolled aside); traps are drawn only once revealed, as a cut snare and a marked pit. Unknown keys draw a small cairn. The glint is the hint mark made quieter (a light four-point twinkle and two specks, parts tagged `data-glint` for the map to animate). Materials sit on a rounded-square tile and items on a double-ring roundel; where a key names both a quirk and a material (`stone`), a `quirk` or `trait` tile asks for the quirk drawing and anything else gets the material. Moments (`drawMoment`: an ink bloom for a reveal, a burst for a find, a snap for a trap) are finished frames in three parts tagged `data-part` for the map to stage. `drawViaMark` draws a hook for a step taken with the grappling hook, spikes for the climbing spikes, and a plain dot otherwise.

**Reasoning.** Milestone 3's chain has to be readable on the map without text: what a hex holds, whether it is used up, and what just happened. Keying everything by content's icon names keeps content as data; staging marks as parts lets the web animate them without the art kit knowing about time.

## 2026-11-20: Explored and unexplored hexes look clearly different **[Misa]**

ID: `2026-11-20-explored-and-unexplored-hexes-look-clearly` · Status: current

**Decision.** A hex in the window stays **unexplored** until a character enters or surveys it, then is **explored** for everyone. Unexplored hexes show their terrain under a light veil, clearly different from explored ground and from the blank paper beyond the window. Exploring reveals the hex's feature.

**Reasoning.** Misa: revealing on entry needs a clear fog-of-war indicator of which hexes have been explored.

## 2026-11-20: Characters carry packs; team stores live on the creature

ID: `2026-11-20-characters-carry-packs-team-stores-live` · Status: current

**Decision.** Gathering and finds go into the pack of the character who did them (capacity 6 units, config). The team's stores live on the creature: a character riding or boarding it puts their whole pack into the stores automatically. Unlocks are built only from the stores. A lost character's pack is lost. Unlocked equipment is common to the whole team.

**Reasoning.** Misa asked whether resources are personal or shared. This was the lead's call. Packs plus stores on the creature make gathering a trip out and back, which suits a map that moves every day and the creature as the party's hub, and it gives a lost character a real cost. Revisit after playtests.

## 2026-11-20: Engineers build permanent team unlocks with a cost and a duration **[Misa]**

ID: `2026-11-20-engineers-build-permanent-team-unlocks-with` · Status: current

**Decision.** Engineers build **unlocks**: permanent abilities or equipment for the whole team, such as the grappling hook, lantern and climbing spikes. Each unlock has its own material cost, taken from the team stores when work starts, and a duration in work: engineers riding the creature spend actions on it, one action per unit of work, and several engineers may work together. One unlock is in progress at a time. There is no per-day crafting limit and no crafting by other roles.

**Reasoning.** Misa: engineers craft permanent unlocks for the entire team, each with its own crafting cost and duration. This replaces the night's first draft (one craft a day, non-specialists at a surcharge).

## 2026-11-20: Everyone springs traps; scout and engineer bonuses come later as upgrades **[Misa]**

ID: `2026-11-20-everyone-springs-traps-scout-and-engineer` · Status: current

**Decision.** Everyone, scouts included, springs a hidden trap when entering its hex. For now a trap ends the character's day; trap effects are meant to vary a lot later. In this milestone the scout's base ability is **survey**: reveal an adjacent hex without entering it, 1 action for a scout and 2 for anyone else. A surveyed trap is harmless. The scout's trap sense, glints and immunity, and the engineer's better gathering, are future **upgrades**: kept in data, not active.

**Reasoning.** Misa: scouts detect traps only as their skills and tools grow; engineers gather double only after upgrades. Survey gives the scout a role from day one ("basics for all, mastery for specialists") without pre-empting the upgrade system.

## 2026-11-19: Joining is a drawer wizard; characters look distinct on the map

ID: `2026-11-19-joining-is-a-drawer-wizard-each` · Status: current

**Decision.** Joining and replacing a lost character share one drawer. On phones it is the bottom drawer, which can be dragged between half and full height and closed from half; it shows one step at a time (character, role, confirm) with a back arrow. On desktop it is a side drawer from the left showing every step at once. Characters are shown as figures with trait and quirk icons, and their names are the only text. Roles are six ink emblems: a spyglass, a book, a lantern, a shield, a cog and a pennant. The drawer opens by itself when you have no active character, and a round join button reopens it after you close it. On the map, characters' looks and cloak colours come from the art kit's `assignLooks` in join order, so no two look alike while combinations last. Each offer and character carries a public `lookSeed`; the map assigns looks over the party's seeds in join order, and the drawer previews an offer as the party's seeds plus its own, so the look shown when choosing is the look it keeps on the map. Another player's character opens a small card with its figure, name, role emblem, trait and quirk, from its figure on a hex or from the hub bubble. "Next day" shows only when the server offers dev tools and you are an admin; "New game" is gone.

**Reasoning.** This follows the M2 plan and Misa's "show, don't tell". Players need to tell characters apart on a shared map; the art kit owns how distinct looks are assigned.

## 2026-11-19: Character looks come from content's look seeds, so a preview matches the joined look

ID: `2026-11-19-character-looks-come-from-content-s` · Status: current · Amends: `2026-11-19-role-emblems-share-one-frame-icons`

**Decision.** `assignLooks` takes the public `lookSeed`s of the party's characters in join order (not ids), and `characterLookFor` takes a seed. A join preview is `assignLooks([...partySeeds, offerSeed]).at(-1)`, which is exactly the look the character gets on joining; earlier characters keep their looks and the party stays distinct. Icons of the creature come from `drawCreatureIcon(palette, look, px)`, which picks the ink for the size shown (about 1.1 px), so it stays light from a button to a 96 px page.

**Reasoning.** The core gives offers and characters a public look seed so the look is the same from the join preview to the map. The fixed ink of the creature icon looked heavy at 96 px.

## 2026-11-19: Icons follow content's icon keys; quirks sit on a split tile

ID: `2026-11-19-icons-follow-content-s-icon-keys` · Status: current · Amends: `2026-11-19-role-emblems-share-one-frame-icons`

**Decision.** `drawIcon` takes the `icon` keys that content gives roles, traits and quirks. A role's key (`spyglass`, `book`, `crook`, `shield`, `hammer`, `banner`) draws that role's emblem, as `role:<id>` does, so the keeper's motif is a crook, the guardian's a round shield, the engineer's a hammer and the envoy's a banner. The 12 trait and 12 quirk keys each have a motif on a plain round tile; with `{ tile: 'quirk' }` the tile gets a ring split into two colours (sage and coral), a wordless hint that a quirk helps and hinders. A web test checks that every content icon key has a drawing.

**Reasoning.** Content is data and names its icons; the art follows it rather than inventing other keys. The split ring keeps the quirk's double nature visible without text.

## 2026-11-19: Role emblems share one frame; icons are drawn by key; characters vary by seeded look

ID: `2026-11-19-role-emblems-share-one-frame-icons` · Status: current, amended by `2026-11-19-character-looks-come-from-content-s`, `2026-11-19-icons-follow-content-s-icon-keys`

**Decision.** The art kit draws icons by key with `drawIcon(id, palette, size)`, a self-contained `<svg>` on a 48-unit grid; unknown keys draw a neutral dotted mark. The six role emblems (`role:scout` … `role:envoy`) share one frame, round or shield (Misa picks; round is the default until then), each with its own tint and an ink motif: spyglass, open book, herb sprig, upright sword, cog, sealed scroll. Trait and quirk icons register under `trait:…` and `quirk:…` as content gains them. Characters take a look from data, `{ headwear, garment, carry, skin }`; `characterLookFor(id)` seeds one by id, and `assignLooks(ids)` gives characters in join order distinct accent, headwear and garment combinations (8 accents × 4 × 3). The palettes gain four accents (sage, slate, coral, sky) and three skin tones. A character without a look draws as the default explorer, so the current app is unchanged until it passes looks.

**Reasoning.** The join drawer shows characters and roles with names as the only text, so icons must carry the meaning, read at 32 px and look like one set. Fifteen riders on the creature's back must tell apart at a glance; seeding by id keeps a character's look stable, and assigning in join order keeps it stable as others join.

## 2026-11-19: Character choices are rolled from the game, the player and the attempt; players pick by index

ID: `2026-11-19-character-choices-are-rolled-from-the` · Status: current

**Decision.** `characterOffers(state, userId)` returns two or three characters, each with a generated name, a trait and a quirk (none repeated), followed by a plain one with a name only. The roll is seeded by the game seed, the user id and the number of characters that user has had, so a reload shows the same list and a replacement gets a fresh one. `addCharacter` and `replaceCharacter` take the index of the chosen entry and roll again on the server, so a client cannot invent a trait. Character ids are `<userId>.<attempt>`. The cap counts active characters only, so a lost character frees a place.

**Reasoning.** Picking by index keeps the server authoritative over what was rolled. Because rolls need the seed, the server must send the choices to the joining player: the contract needs a field or a call for them.

## 2026-11-19: Popovers point at their subject; grace-day tiles and figures warn without words

ID: `2026-11-19-popovers-point-at-their-subject-grace` · Status: current

**Decision.** Every popover, bubble and card has a small paper chevron with ink sides on the edge facing its subject: the hex, the destination, or the creature. The chevron slides along that edge to keep pointing when the card is clamped to the screen, and stays clear of the card's corners. Tiles in their grace day (out of the window, lost at the next tick) get a paler wash and a dashed ink edge on top of the art's fading look. A character standing on one carries a small hourglass mark above its figure. Both keep a minimum on-screen size when zoomed out. The grace rule itself is unchanged and checked end to end through the map's flow and overlays: a hex that leaves the window at the tick into day D stays reachable through day D and is lost at the next tick. Escape and right-click close everything back to idle, cancelling a plan or selection. Right-click reads `closeOnRightClick` from `apps/web/src/settings.ts` (default on), and the browser menu never opens over the map, whatever the setting.

**Reasoning.** Misa expected one more move before being left behind; the rule already gave it, but the tile did not look different enough to say so. The chevron ties a card to its subject when cards move above or below to stay on screen.

## 2026-11-19: Three actions a day, and moving costs actions **[Misa]**

ID: `2026-11-19-three-actions-a-day-and-moving` · Status: current

**Decision.** A character keeps three actions a day, and moving one hex costs one of them. The alternative, three free moves plus one action on top, is not used.

**Reasoning.** Misa tried the prototype: three actions is hard to judge before there is more to do, but one budget for everything is much simpler than separate move and action budgets, so the game works within it.

## 2026-11-19: Escape and right-click close popovers on desktop; right-click is a setting **[Misa]**

ID: `2026-11-19-escape-and-right-click-close-popovers` · Status: current · Amends: `2026-11-19-touch-first-drag-to-pan-pinch`

**Decision.** On desktop, Escape closes the open popover or bubble, and right-clicking anywhere on the map closes it too (and never opens the browser's menu over the map). Right-click closing sits behind a player setting that is on by default; for now the setting lives in the map's settings module, and an options screen can expose it later. Nothing else needs a keyboard.

**Reasoning.** Misa asked for both as desktop conveniences, with right-click closing switchable because some players may dislike it.

## 2026-11-19: The map's hub bubble: a generic list of characters plus a place entry

ID: `2026-11-19-the-map-s-hub-bubble-a` · Status: current · Amends: `2026-11-19-on-the-map-the-creature-is`

**Decision.** This implements Misa's "The creature is the party's hub" on the map. A tap on the creature never lands on a rider's figure; riders are not tap targets. If you ride, it selects you (the step-off hexes light up) and opens a bubble above the creature. If you don't ride, it opens the same bubble without selecting anyone; if you are selected beside the creature, it plans boarding instead. The bubble (`Bubble` in `apps/web/src/map/Popover.tsx`) takes a list of characters (your own drawn with a selection ring, the others inert for now) and an optional place entry: a round creature mini that opens the creature card. A tap on your own hex selects your character. Rider seats come from the art kit's `riderSeats`, the same function the scene seats riders with, and a test checks every figure position the map computes against the positions the scene reports drawing.

**Reasoning.** Keeping the bubble generic lets Milestone 2 reuse it for any hex with several characters. One seat function, plus a test against the scene's own output, keeps picking and drawing from drifting apart.

## 2026-11-19: On the map the creature is one place: one outline, a seat at the arrow's end, its own popover

ID: `2026-11-19-on-the-map-the-creature-is` · Status: current, amended by `2026-11-19-the-map-s-hub-bubble-a`

**Decision.** When your character is selected and can board, the creature lights up as one target: a soft wash over its whole footprint and one dashed outline around its outside edge, not seven hex washes. Tapping any footprint hex plans to board. The arrow ends at the rider slot the character would take, and the confirm card shows the pip cost. A rider is selected by tapping its figure on the creature's back; the stepping-off hexes light up and the arrow starts from its seat. A selected rider's ring is drawn over the creature, as an outline only. Tapping the creature when not planning opens a small card with a drawing of the creature turned to its heading, plus a compass arrow for the heading. Tapping your own figure with no actions left looks at your place (the hex or the creature) instead of selecting it. The confirm card sits below the destination when the arrow arrives from above, so it never covers the arrow. "Recentre on me" centres on a rider's seat.

**Reasoning.** This follows the riding decision (the footprint is one place) and the lead's brief. Picking a figure before the hex under it is what lets a rider select itself while a tap anywhere else on the footprint means the creature.

## 2026-11-19: The creature is the party's hub; a tap picks your own character first **[Misa]**

ID: `2026-11-19-the-creature-is-the-party-s` · Status: current · Amends: `2026-11-19-moving-tap-your-character-tap-a`

**Decision.** The creature is the party's hub: tapping it is where the shared expedition information will live (later milestones open it into a drawer). A tap on a place picks the player's own character first, because players can only move their own:

- **You ride the creature:** tapping anywhere on it selects your character, so the hexes you can step off to light up at once, and opens a small bubble by the creature. The bubble holds your character (shown selected), the other riders, and the creature itself as the way into the hub.
- **You don't ride it:** tapping the creature opens the same bubble without selecting anyone, and the hub is the main thing in it.
- **Any hex with several characters**, from Milestone 2: the same bubble lists who is there. Your own character is preselected for moving, and choosing another character opens their details (loadout, stats) when those exist.

Riders' figures on the creature's back are not tap targets of their own; the whole creature is.

**Reasoning.** Misa's intuition: the game should assume a player means their own character, since they cannot move anyone else's, and a lightweight bubble can name the others when there is a real choice. This also fixes a figure on the creature's back being a tiny tap target that hid a footprint hex.

## 2026-11-19: A character's place is a hex or the creature; paths treat the creature as one node

ID: `2026-11-19-a-character-s-place-is-a-2` · Status: current

## 2026-11-19: Riders stand in numbered slots on the creature's back

ID: `2026-11-19-riders-stand-in-numbered-slots-on` · Status: current · Amends: `2026-11-19-the-art-kit-draws-a-compact`

**Decision.** Characters on footprint hexes ride the creature. The art kit places riders by rider index, not by hex: slot 0 is the middle of the back, then a ring of six, then a wider ring of eight (fifteen, the player cap), shifted a little towards the viewer where the high view shows the back best (`riderSlot`, `riderAnchor`). Riders draw just after the creature, back to front among themselves, each with a firm contact shadow. The trees, rock and pond on the back sit out at the rim, clear of the inner slots. The footprint keeps its trodden-ground look. `riderAnchor(look, heading, index, origin, size, squash)` is exported so the map's picking finds riders where they are drawn.

**Reasoning.** Misa: characters start on the creature, can board and step off, and end up on it when it walks onto them. Slots by index keep several riders apart whichever footprint hex the core records them on.

## 2026-11-19: The art kit draws a compact creature on trodden ground, measured against its footprint

ID: `2026-11-19-the-art-kit-draws-a-compact` · Status: current, amended by `2026-11-19-riders-stand-in-numbered-slots-on` · Amends: `2026-11-19-the-creature-stays-mostly-inside-its`

**Decision.** The default build is `highback`: the high, mossy back with its trees, rock and pond, a moderately long neck and a longer tail, sized so that at `scale` 1 the body stays over its footprint. A test draws it for all six headings at tilt 0.8 and requires that no hex beyond the footprint has a third or more of its top face covered, that no such hex's centre is covered, and that the centre hex is covered. The seven footprint hexes are drawn as trodden ground (palette ramp `trodden`, scuffed earth) in place of their terrain. Characters are no longer drawn as riders: no contact shadow and no special order. The `broad`, `longneck` and `low` builds stay as data.

**Reasoning.** Misa's pick: a compact creature keeps the map readable, and the trodden ground keeps it feeling huge. Measuring coverage on the drawn outlines keeps "never a whole hex" true as the drawing changes; the old large build covered up to 70% of a neighbouring hex.

## 2026-11-19: Characters start riding the creature **[Misa]**

ID: `2026-11-19-characters-start-riding-the-creature` · Status: current · Supersedes: `2026-11-19-characters-start-on-a-free-hex`

**Decision.** New characters start on the creature, riding it (see "Characters ride the creature…").

**Reasoning.** Misa: starting on the creature means no one spends a move to reach it.

## 2026-11-19: Characters ride the creature; its footprint is one place, not seven hexes **[Misa]**

ID: `2026-11-19-characters-ride-the-creature-its-footprint` · Status: current · Supersedes: `2026-11-19-the-creature-s-hexes-are-occupied`

**Decision.** The creature's 7 footprint hexes are not hexes a character stands on; together they are one place, "on the creature".

- Characters start on the creature, riding it, and riders move with it each day, so they are never left behind.
- Riders take no hex slot; they are drawn on its back, side by side.
- Boarding from a hex next to the footprint costs one step, and so does stepping off onto any passable hex next to the footprint. A path may cross the creature by boarding and stepping off.
- When the creature steps onto a hex where a character stands, that character ends up riding it, at no cost.
- Tapping any footprint hex means the creature.
- Players can do their duties from the creature's back (later milestones).

This supersedes the rule that characters cannot enter the creature's hexes and the push-aside rule in it. It also replaces "Characters start on a free hex next to the creature".

**Reasoning.** Misa: riding the creature is a thing in this game. It keeps characters off the hex grid while they travel with it, and starting on it means no one spends a move to get there.

## 2026-11-19: The creature stays mostly inside its footprint so the map stays readable **[Misa]**

ID: `2026-11-19-the-creature-stays-mostly-inside-its` · Status: current, amended by `2026-11-19-the-art-kit-draws-a-compact` · Amends: `2026-11-19-the-creature-is-a-behemoth-it`

**Decision.** The creature is drawn smaller, between the broad high back and the long-neck, long-tail shapes. Its body stays mostly within its 7-hex footprint; the head, neck and tail may reach a little into neighbouring hexes, but never cover a whole hex outside the footprint. The footprint hexes are drawn in their own colour (ground the creature is standing on), so its size reads from the ground as well as the body. The map is not rotatable.

**Reasoning.** Misa: a big creature hid the tiles behind it and its neck crossed other hexes, which hurts readability without a way to rotate the map. Marking the occupied hexes keeps it feeling huge while the drawing stays compact. Rotation (and true 3D) is not planned.

## 2026-11-19: The creature is a behemoth: it fills its footprint and carries a small landscape

ID: `2026-11-19-the-creature-is-a-behemoth-it` · Status: current, amended by `2026-11-19-the-creature-stays-mostly-inside-its` · Amends: `2026-11-19-the-creature-is-modelled-as-small`

**Decision.** At `scale` 1 (a creature data value) the creature's body fills its seven-hex footprint, and its head and tail reach past it, so a character beside it looks tiny. It reads as an ancient walking hill: a broad hide body under a lumpy moss blanket, with two or three small trees, a rock, a tiny pond and grass on its back, a long strong neck, a large calm head with closed eyes and small swept horns, small ears, thick legs with mossy feet, and a tail tucked under the body. Its build is data: `broad` (high tortoise-like back, the default), `longneck` (narrower body, neck rising high, long tail) or `low` (wide, low, mossier), offered to Misa as the pick "Which creature shape?". A character standing on a footprint hex is drawn over the creature with a firm contact shadow, so it reads as standing on its back.

**Reasoning.** The lead's review: at the old size it covered about one hex and read as a pet, not a behemoth. The landscape on its back is its signature and shows its size against the trees on the map.

## 2026-11-19: The creature is modelled as small solids and turns to all six headings; upright props shrink part way at the high view

ID: `2026-11-19-the-creature-is-modelled-as-small` · Status: current, amended by `2026-11-19-the-creature-is-a-behemoth-it` · Amends: `2026-11-19-the-creature-faces-where-it-walks`

**Decision.** The art kit draws the creature as a few soft solids (body, head, snout, legs, ears, tail) in its own frame, turned to its heading and projected like the ground, so one drawing covers all six hex directions and shows its back, spots and the garden on it from above. `CreatureArt` takes a `heading` (an axial step) instead of a facing; the side view, the view from behind and `facingFor` are gone. Upright props and characters keep their side view but shrink in height halfway between upright and the true foreshortening (`riseFor`, 0.875 at tilt 0.8), and tile side faces are thinner (`sideDepth` 0.26). The kit's defaults are now Spring and tilt 0.8, and the map uses them. Whether the creature's back is round or long is offered to Misa as a pick.

**Reasoning.** This follows Misa's picks: a high view at 0.8 with the creature seen from above. Projecting solids gives correct turns and overlaps for every heading without hand-drawing six views. Fully foreshortened props looked like flat cut-outs from above, while unshrunk ones looked too tall, so they meet halfway.

## 2026-11-19: The creature is drawn from above, at the map's view angle **[Misa]**

ID: `2026-11-19-the-creature-is-drawn-from-above` · Status: current · Amends: `2026-11-19-the-creature-faces-where-it-walks`

**Decision.** The creature is drawn from the same high viewpoint as the map, looking down on it at about the tilt the map uses, so its back and shape read from above and its head points where it walks. It replaces both the side view and the rear view. Props and characters stay upright but should be checked against the higher view and given a little top-down foreshortening where they look like cut-outs.

**Reasoning.** Misa: the side view is very side-on; bringing the view angle upward makes the creature easier to draw and read, and it matches the higher map view.

## 2026-11-19: Spring palette and a high view: tilt 0.8 **[Misa]**

ID: `2026-11-19-spring-palette-and-a-high-view` · Status: current · Amends: `2026-11-19-first-map-art-a-squashed-hex`

**Decision.** The game uses the Spring palette and a view tilt of 0.8 (vertical squash of the hex plane; 1 is top-down). Both are the defaults in the art kit and the map.

**Reasoning.** Misa picked Spring because desert, plains and forest are the most clearly told apart. Top-down was too flat and 0.6 was the best of the samples, but they want the view higher up, at around 0.8.

## 2026-11-19: Map popovers are drawn in SVG; the view follows the creature each day

ID: `2026-11-19-map-popovers-are-drawn-in-svg` · Status: current

**Decision.** Map popovers (what is known about a hex; the cost pips and confirm button of a planned move) are drawn inside the map's SVG in screen space, placed by maths above the tapped hex (below it when there is no room) and clamped inside the screen. A hex popover shows the terrain as a one-tile miniature from the art kit and the fog state as an eye mark (open, half-lidded, mist, dotted). After a confirmed move the character stays selected while it has actions left. A tap on a character's upright figure selects it, even where the figure overlaps the hex behind. When a day passes, the view eases along with the creature so the map scrolls under it; a new game jumps to the character. The first zoom fits about 3.5 hexes around the character on a phone and the whole window on a wide screen (at most zoom 1).

**Reasoning.** The CSP forbids inline styles, so an HTML popover could not be positioned without CSSOM tricks; an SVG group takes a `transform` attribute instead and shares the map's ink look. Keeping the selection makes walking several single steps quick. Following the creature is what makes the map visibly move day by day.

## 2026-11-19: Moving: tap your character, tap a tile, see the arrow, confirm **[Misa]**

ID: `2026-11-19-moving-tap-your-character-tap-a` · Status: current, amended by `2026-11-19-the-creature-is-the-party-s` · Amends: `2026-11-19-touch-first-drag-to-pan-pinch`

**Decision.** Moving a character takes three taps:

1. Tap your character. The tiles it can reach with the actions it has left light up.
2. Tap one of those tiles. An arrow, drawn as a dashed ink line, runs along the path to it, with the cost shown as action pips. Where the path relies on something special, such as a rope over a cliff, a tunnel or a boat across a river, the arrow shows it with a small mark on that stretch, so the means of travel is visible in the arrow itself.
3. Confirm the move in a small popover by the destination.

Tapping elsewhere, or another reachable tile, changes or cancels the plan before anything is spent. This replaces the "Acting" bullet of the touch-first decision for movement; other actions still use tap-to-select and confirm in the popover.

**Reasoning.** Misa's design: selecting the character first makes its range visible at a glance, and the arrow makes both the cost and the tools of travel readable without text, which suits later gear and vehicles (grappling hook, boats).

## 2026-11-19: No focus outlines or other visible accessibility aids in the game **[Misa]**

ID: `2026-11-19-no-focus-outlines-or-other-visible` · Status: current · Amends: `2026-11-19-accessibility-is-not-traded-away`

**Decision.** Visible accessibility aids are not built into the game: no focus outlines or focus rings anywhere (`outline: none` on focus, including `:focus-visible`), and no other highlight that exists only for accessibility. Focus management stays: focus moves into a dialog, popover or drawer when it opens and back to where it was when it closes, without drawing a ring. Invisible extras that cost nothing (button elements, labels) are fine. The colour-plus-shape rule and `prefers-reduced-motion` are no longer requirements, though they may still be used where they help the look.

**Reasoning.** Misa: this is a game, accessibility is not a priority, and focus outlines keep appearing where they spoil the look. Focus management still matters so dialogs behave.

## 2026-11-19: Touch first: drag to pan, pinch or wheel to zoom, tap or click to act **[Misa]**

ID: `2026-11-19-touch-first-drag-to-pan-pinch` · Status: current, amended by `2026-11-19-escape-and-right-click-close-popovers`, `2026-11-19-moving-tap-your-character-tap-a`

**Decision.** The whole game is played with taps and drags; nothing needs a keyboard.

- **Phone:** one finger drags the map; pinch zooms around the fingers; a tap selects. A drag that moves more than a few pixels never counts as a tap.
- **Desktop:** drag with the mouse to pan; the wheel or trackpad zooms around the pointer; a click is a tap. Hover may add a light highlight but is never needed to see or do anything.
- **Acting:** tapping a hex selects it and opens a small popover with what is known about it and what can be done there. Spending actions always takes a second tap on the action in the popover, so panning or a stray tap never spends anything. Tapping a hex a few steps away shows the path and its cost in action pips; one confirm walks it.
- **Getting back:** one small floating button recentres on your character, and another on the creature.
- Bigger views open in drawers (bottom drawer on phones, side drawers on desktop), as in CLAUDE.md.
- Buttons stay ordinary focusable buttons, so a keyboard or screen reader still works where the browser gives that for free, but no keyboard shortcuts or keyboard-only controls are built.

**Reasoning.** Misa's standard: tapping, pinching and dragging on a phone, and dragging and clicking on desktop, with as little keyboard as possible. Two-step actions guard scarce actions (three a day) against mistakes while panning. Path previews were the lead's call, so a player can plan a trip out and back in one go.

## 2026-11-19: The map starts isometric, with flat ground first and heights later **[Misa]**

ID: `2026-11-19-the-map-starts-isometric-with-flat` · Status: current · Amends: `2026-11-19-isometric-3d-hexes-are-the-long`

**Decision.** The map is drawn in an isometric-style view from Milestone 1: the hex plane is tilted (squashed vertically), tiles show a thin side face, and props, characters and the creature stand upright and are drawn back to front. All tiles sit at one height at first; terrain heights (cliffs, plateaus) come later through terrain data. It stays SVG, and tapping uses the tile shapes themselves, so no hand-written hit testing is needed. One projection function in the renderer turns hex coordinates into screen positions; a flat top-down projection remains available for debugging.

**Reasoning.** Misa asked to go straight for isometric if it does not slow prototyping. With flat ground, a tilted SVG hex map costs little more than a top-down one: the core is unchanged, and upright props were already the plan. Heights are what make isometric hard (tiles hiding tiles, harder tapping), so they wait.

## 2026-11-19: Movement reads one entry rule that can name what makes a step possible

ID: `2026-11-19-movement-reads-one-entry-rule-that` · Status: current · Amends: `2026-11-19-paths-are-planned-by-cheapest-cost`

**Decision.** One rule, `entryInto(state, hex)`, decides whether a character may enter a hex. It returns the cost and an optional `via` tag naming what makes the step possible, or null. `move`, `planPath` and the new `reachableHexes(state, id)` all read it. `reachableHexes` lists every hex the character can reach with its actions left, with its cheapest cost, using the same search as `planPath`. `planPath` now returns steps (`{ hex, cost, via? }`), and `moveAlong` accepts steps or bare hexes. Nothing sets `via` in Milestone 1.

**Reasoning.** Misa's movement design lights up the reachable hexes when the character is tapped, then draws an arrow that can mark the stretch that needs gear (a rope, a tunnel, a boat). With one entry rule, gear can plug in later without changing the API.

## 2026-11-19: Paths are planned by cheapest cost and walked all or nothing

ID: `2026-11-19-paths-are-planned-by-cheapest-cost` · Status: current, amended by `2026-11-19-movement-reads-one-entry-rule-that`

**Decision.** `planPath(state, id, to)` runs a uniform-cost search over reachable, passable hexes, breaking ties in a fixed order. It returns the steps and their total cost, or a refusal: `not-enough-actions` when the cheapest path costs more than the actions left, `no-path` when nothing connects. `moveAlong(state, id, path)` applies each step through `move` and returns either the final state or the refusal and the index of the refused step, changing nothing. Both refuse non-integer or non-finite coordinates (`invalid-hex`).

**Reasoning.** The interface previews a multi-hex path and its cost on a tap, then walks it on one confirm. Reusing `move` for each step keeps a single set of rules for the server to check.

## 2026-11-19: The window is always in play; lost characters stay lost

ID: `2026-11-19-the-window-is-always-in-play` · Status: current

**Decision.** Every hex within the window radius of the creature's centre is `seen` and reachable, even one that was lost before and came back into range when the creature veered. A hex that leaves the window records the day it left and becomes `lost` once `graceDays` have passed (1: reachable for one more day). A character standing on a lost hex at the tick is lost for good, with no way back in Milestone 1. Hexes never in view are `hidden`.

**Reasoning.** The design says trailing tiles are lost to the fog and left-behind characters are lost for good; it does not say what happens to a tile the window touches again. Keeping the whole window in play avoids holes in the area around the creature. A later rule (for example a fog that lingers) can still mark such hexes differently.

## 2026-11-19: Cliffs are impassable to characters in Milestone 1

ID: `2026-11-19-cliffs-are-impassable-to-characters-in` · Status: current, amended by `2026-11-19-the-creature-s-hexes-are-always`

**Decision.** Terrain has a `passable` property; cliffs set it to false and no character can enter them. All terrain costs the base move cost (an `extraMoveCost` of 0 everywhere).

**Reasoning.** Milestone 3's grappling hook is meant to let everyone cross cliff edges, which needs cliffs to block first. Per-terrain costs exist as data so traits and gear can change them later.

## 2026-11-19: The creature veers by a seeded daily roll and ignores terrain for now

ID: `2026-11-19-the-creature-veers-by-a-seeded` · Status: current

**Decision.** The creature keeps one general heading for the whole game (north by default). Each tick it steps one hex: anticlockwise of the heading, straight, or clockwise, picked by weight (1 : 2 : 1, in the tuning config) with a roll that is a pure hash of the seed and the day. It never turns back and walks over any terrain, cliffs included. `predictCreature` returns the three possible next centres with their chances.

**Reasoning.** Matches the documented starting rule and keeps the step a function of (seed, day), so no random state is stored. Steering by stimuli (Milestone 4) can change the weights without changing the shape.

## 2026-11-19: The creature faces where it walks; cliffs are escarpments

ID: `2026-11-19-the-creature-faces-where-it-walks` · Status: current, amended by `2026-11-19-the-creature-is-drawn-from-above`, `2026-11-19-the-creature-is-modelled-as-small`

**Decision.** The creature's side view mirrors to face the east or west part of its heading (`facingFor`). For a heading straight north there are two options, the side view facing right or a three-quarter view from behind walking up the screen, and Misa picks one in the review batch (pick `creature-facing`). Cliffs are drawn as an escarpment, a rock face with a plateau strip running across the tile, not a single standing rock.

**Reasoning.** The lead asked for the creature to face where it walks and for cliffs that read as terrain. Both straight-north options stay available until Misa chooses.

## 2026-11-19: First map art: a squashed hex plane with open-edge sides, upright props and four fog states

ID: `2026-11-19-first-map-art-a-squashed-hex` · Status: current, amended by `2026-11-19-spring-palette-and-a-high-view`

**Decision.** The first map art draws flat-top hexes on a plane squashed vertically (tilt 0.6 in `ART_TUNING`, Misa to pick against 0.5 and top-down). Each tile has a watercolour top and shows its thin side face only where no tile stands in front of it. Props, characters and the creature stand upright in side view and are drawn back to front. Unseen tiles are blank paper with a faint dotted outline; fading tiles are veiled with paper and their props half transparent; lost tiles are a fog wash with mist curls; the hint mark is a small glint that never says what is there. Three palettes (Morning, Mist, Spring) go to Misa as a pick; the first creature is a gentle, round, spotted beast with leaf ears, horn nubs and a small garden on its back.

**Reasoning.** This follows Misa's ink-and-wash atlas look and the isometric goal while keeping all tiles at one height. Drawing sides only on open edges keeps the plane reading as one raised landmass instead of a stack of tiles. The tilt and palette stay in one config so Misa's picks are one edit each.

## 2026-11-19: Isometric 3D hexes are the long-term goal; the map is built to allow it **[Misa]**

ID: `2026-11-19-isometric-3d-hexes-are-the-long` · Status: current, amended by `2026-11-19-the-map-starts-isometric-with-flat`

**Decision.** The long-term goal is an isometric 3D hex map with tile heights; the first milestones use a flat top-down view. To keep the way open, the game core knows only hex coordinates and never screen positions, the map renderer converts coordinates to the screen through one projection function, tiles draw their top face separately from any sides, and props (trees, hills, ruins, the creature) are drawn upright in side view, as on old maps, so they can stand on a tilted map later.

**Reasoning.** Misa would like the hex grid to become isometric 3D eventually, but not to start there. Keeping projection in one place and drawing props upright costs little now and avoids redrawing every asset later.

## 2026-11-19: The look is a light ink-and-wash atlas in pastel, broken colours **[Misa]**

ID: `2026-11-19-the-look-is-a-light-ink` · Status: current

**Decision.** The game looks like an explorer's atlas drawn in ink and watercolour wash, in a light, approachable palette of pastel, broken (slightly greyed) colours on paper, closer to a storybook than to retro or high-contrast games. Unexplored land is blank paper. Pixel art and dark, contrasty looks are out.

**Reasoning.** Misa chose the ink-atlas and storybook directions over flat vector and pixel art, because retro and pixel styles tend towards darker, more contrasty moods than this game wants.

## 2026-11-19: Phone first, desktop too

ID: `2026-11-19-phone-first-desktop-too` · Status: current

**Decision.** Every screen is designed and checked at a phone width (390 px, and 360 px for tight spots) and at a desktop width (1100 px). Nothing overflows its parent or scrolls sideways by accident, and long names are cut with "…". On a wide window the layout uses the space instead of a narrow fixed column.

**Reasoning.** Most use is on phones, but layouts tuned only at phone width looked wrong on desktop, and the owner asked for desktop more than once.

## 2026-11-19: Accessibility is not traded away

ID: `2026-11-19-accessibility-is-not-traded-away` · Status: current, amended by `2026-11-19-no-focus-outlines-or-other-visible`

**Decision.** Colour is never the only cue: a state or category also has an icon, a shape or a word. `prefers-reduced-motion` is respected everywhere, and every control has a spoken name. Only errors use `role="alert"`; other notices use `role="status"` so they never interrupt a screen reader.

**Reasoning.** These cost little when built in from the start and are hard to add later. A notice that interrupts a screen reader for good news is worse than none.

## 2026-11-19: Focus returns to the opener only for keyboard users

ID: `2026-11-19-focus-returns-to-the-opener-only` · Status: current

**Decision.** Closing a drawer, popover or sheet returns focus to the control that opened it only when that control had keyboard focus (`:focus-visible`). After a tap or click, closing leaves no focus ring behind.

**Reasoning.** A leftover ring after a tap looks like a bug to touch and mouse users, but keyboard users still need focus to come back where they were. Following how the thing was opened serves both.

## 2026-11-19: One overlay at a time

ID: `2026-11-19-one-overlay-at-a-time` · Status: current

**Decision.** Only one drawer or sheet is open at a time: a choice made inside a drawer opens inside it as a step with "‹ Back", never as a second sheet on top. While a modal is open, the page behind it does not scroll and shows no second scrollbar. Small popovers on their own layer are the only thing that may open over a drawer.

**Reasoning.** The owner found a sheet opening over a drawer stressful, and two scrollbars side by side looked broken. A drill-in step keeps the user in one place.

## 2026-11-19: Don't choose for the user; destructive actions go last

ID: `2026-11-19-don-t-choose-for-the-user` · Status: current

**Decision.** A picker opens with nothing selected; the app never preselects an item for the user. In a row of actions, a destructive one comes last.

**Reasoning.** The owner did not want the app to choose for them. A destructive action placed last is the hardest to hit by accident.

## 2026-11-19: Every clickable thing looks clickable, without hover

ID: `2026-11-19-every-clickable-thing-looks-clickable-without` · Status: current

**Decision.** Every clickable thing has a visible cue that shows without hover, and decoration has none and is not a target. Hover may add to the cue but never carries it alone. A click that ends a drag is swallowed in one shared place, so a drag never opens a popover.

**Reasoning.** Phones have no hover, so a hover-only cue shows nothing before the tap. When some targets had labels and others did not, the owner could not tell what was clickable.

## 2026-11-19: Hidden overflow gets a hint

ID: `2026-11-19-hidden-overflow-gets-a-hint` · Status: current

**Decision.** A box that scrolls without a visible scrollbar shows a hint that there is more: an edge fade, and where it suits, one shared pan hint that is the same on every sideways-scrolling area and goes away once the user scrolls. Phones keep the system's own overlay scrollbar; a styled scrollbar is for mouse users only.

**Reasoning.** Users did not notice that panels without a scrollbar scrolled. One shared hint keeps the cue the same everywhere, and a permanent bar on touch looks cramped.

## 2026-11-19: Nothing fills in after the page has drawn

ID: `2026-11-19-nothing-fills-in-after-the-page` · Status: current

**Decision.** A card or row never adds text after the page has drawn. If it needs data that arrives later, it reserves its space or is left out.

**Reasoning.** Late text made the layout jump under the user's finger, which the owner saw on their phone.

## 2026-11-19: Touch targets fit their context

ID: `2026-11-19-touch-targets-fit-their-context` · Status: current

**Decision.** A control on its own gets a touch target of at least 44 px. A control nested inside a tappable tile gets a target only a little larger than the drawn control, so the tile itself stays easy to tap. Pressed and focused states of a new control are screenshotted too.

**Reasoning.** A 44 px checkbox inside a tile took over most of the tile. Pressed and focus states were where visual glitches hid.

## 2026-11-19: Show, don't tell; fewer boxes

ID: `2026-11-19-show-don-t-tell-fewer-boxes` · Status: current

**Decision.** Icons and fixed places come before words, with short labels where text is needed; no prose about what just happened when the screen already shows it, and no titles where the position already says what something is. No boxes inside boxes and few coloured outlines. No hidden rules or behaviour the user cannot reason about.

**Reasoning.** These are the owner's standing priorities for every UI review. A busy screen hides the thing the user came for.

## 2026-11-19: One spacing scale, set by containers

ID: `2026-11-19-one-spacing-scale-set-by-containers` · Status: current

**Decision.** Panels, drawers and popovers use one spacing scale defined as tokens (for example 4 px within a group, 8 px between blocks, 12 px above a button on its own line, 16 px between sections). Containers space their children; parts set no outer margins of their own. A test fails when a stylesheet gives such a part its own vertical margin.

**Reasoning.** A measured pass found gaps in seven sizes with no rule, caused by parts setting their own margins and global rules leaking in. Spacing owned by containers stays the same wherever a part is placed.

## 2026-11-19: Shared components are listed, guarded and reused

ID: `2026-11-19-shared-components-are-listed-guarded-and` · Status: current

**Decision.** Standing UX rules and a lookup table of shared components ("for this job, use this") are kept in one doc that UI work reads first. A new interaction that other screens could use ships as shared parts in the same PR, with a row in the table and a guard test that fails when it is built again elsewhere. Small, rare duplication is acceptable.

**Reasoning.** Without the table, agents rebuilt pickers and layouts that already existed. The guard test is what makes later agents find the shared part.

## 2026-11-19: Drag and drop always has a tap and keyboard alternative

ID: `2026-11-19-drag-and-drop-always-has-a` · Status: current

**Decision.** Drag and drop is built on pointer events, not the HTML5 drag API, and lifts only after a few pixels of movement. Every drag action can also be done by tapping and by keyboard.

**Reasoning.** The HTML5 drag API fails on mobile. Drag alone excludes keyboard users and anyone who finds dragging awkward.

## 2026-11-19: Counts read "1 / 3", and terms explain themselves without "?" icons

ID: `2026-11-19-counts-read-1-3-and-terms` · Status: current

**Decision.** A count against a total is written with a spaced slash ("1 / 3", "200 / 2500 XP"), never "1 of 3", and a guard test checks the strings. A tappable term opens its explanation from the term itself (a chip, or a dotted underline on a word); no "?" icon is added to it. A small help button is kept only beside a heading or a control.

**Reasoning.** Both are the owner's standing wording and style preferences. A guard test keeps the count rule from slipping back in new code.

<!-- Superseded entries below: kept for history, no longer in force. -->

# Superseded

## 2026-11-20: The step ghost walks for one second, then the creature itself returns

ID: `2026-11-20-the-step-ghost-walks-for-one` · Status: superseded by `2026-11-20-the-day-s-step-uses-milestone` · Amends: `2026-11-20-step-hints-scale-with-chance-the`

**Decision.** The day-step ghost slides fully visible for `STEP_MS` (1 s, in `apps/web/src/game/moments.ts`), then disappears at the same instant the scene's creature (hidden by `is-stepping`) and its riders show again. It no longer fades.

**Reasoning.** Fading while the real creature stayed hidden for the whole moment made it end dim and then pop in; a hand-over at the end of the walk reads as one creature walking.

## 2026-11-20: Chain actions live in the popover and the team inventory in a satchel drawer; moments come from events

ID: `2026-11-20-chain-actions-live-in-the-popover` · Status: superseded by `2026-11-20-the-revised-chain-in-the-interface`

**Decision.** Selecting your character on a hex with a revealed feature opens a "here" card above your figure: the feature's drawing and one button per possible action (gather, work the site), each with its action icon and cost pips. Tapping an action is the second tap that spends; an action you cannot take now (too few actions, a missing lantern, a tier your role cannot try) shows faded and does nothing. Tapping any other hex shows its terrain and fog state as before, plus the revealed feature, or the glint when the hex is only sensed. The team inventory opens from a round satchel button at the bottom left, with a small count of everything the team holds. Its drawer comes from the right on desktop and from the bottom on phones, and shows materials and items as icons with counts, then one card per recipe: inputs, an arrow, the output, the cost pips and a craft button. For a non-engineer the extra material sits inside a dashed ring. Moments are short CSS animations on their own map layer, so a running moment never redraws the map: an ink bloom for a reveal, the find's icon rising from the site, a snap mark plus your pips shaking for a trap. They come from the events the server returns with your own move or action, and otherwise from the difference between two views (what others did, the tick). They end after 1.4 seconds or at your next tap. The path arrow marks a step with a `via` with that thing's icon on a paper disc.

**Reasoning.** This follows `docs/design/m3-chain.md` and the M1 rule that spending takes a second tap in the popover. The satchel keeps the map clear, and the drawer is the one already built for joining. Moments on a separate CSS-animated layer respect the earlier performance work (no per-frame Preact renders, no world-layer redraw).

## 2026-11-20: Milestone 3 rules: the calls the plan left open

ID: `2026-11-20-milestone-3-rules-the-calls-the` · Status: superseded by `2026-11-20-milestone-3-rules-after-misa-s`

**Decision.**

- Roles are read by their tags: `reveal` (Scout: reveals, senses within `senseRadius`, never triggers a trap), `gather` (Engineer: yield × `specialistYield`), `craft` (Engineer: every recipe at its listed cost), `sites` (Scholar: the better site chances, tier 2 allowed).
- Every character may craft at most `craftsPerDay` (1) times a day, not just engineers. Others may craft tier-1 recipes only, paying `nonSpecialistExtraMaterial` (1) more of the recipe's first material.
- Items marked `unique` (all three now) cannot be crafted twice; the craft is refused (`already-have`) rather than wasting materials.
- A tier-1 tomb finds an old coin, a new rare material with no recipe yet (kept for the Envoy's trade). Only a tier-2 tomb finds ancient alloy, so the climbing spikes need the lantern, as the chain intends.
- A site roll is seeded by game seed, day, character and site, so a second try by the same character on the same day gives the same result (and costs 2 actions of 3, so there is rarely time anyway).
- Crafting works from anywhere, riding included. Gathering and working a site need the character on the hex.
- A path walk is checked as a whole first (all or nothing). It then reveals step by step, and a hidden trap stops it there: the result says `stopped: { step, reason: 'trap' }`, and the rest is not taken or spent. Entering a revealed trap is harmless.
- Glints belong to the team: one scout's sensing shows for everyone.

**Reasoning.** The plan fixed the chain and the perks but left these open. Each is the simplest choice that keeps the chain intact and leaves room to change it. The old coin is the one addition to the content list: without it, a tier-1 tomb would make the lantern pointless.

## 2026-11-19: Characters start on a free hex next to the creature **[Misa]**

ID: `2026-11-19-characters-start-on-a-free-hex` · Status: superseded by `2026-11-19-characters-start-riding-the-creature` · Supersedes: `2026-11-19-characters-start-on-the-creature-s`

**Decision.** New characters start on a free, passable hex next to the creature's footprint, chosen by a fixed order so it is deterministic. Several characters may share it.

**Reasoning.** The creature's hexes are now off limits (see "The creature's hexes are occupied"), so the old start on its centre no longer works.

## 2026-11-19: The creature's hexes are occupied: characters cannot enter them **[Misa]**

ID: `2026-11-19-the-creature-s-hexes-are-occupied` · Status: superseded by `2026-11-19-characters-ride-the-creature-its-footprint` · Supersedes: `2026-11-19-the-creature-s-hexes-are-always`

**Decision.** The creature's hexes are occupied: characters cannot enter, stand on or pass through them, and they offer no actions. Paths go around the creature. Characters start on a free hex next to it. When the creature steps onto a hex where a character stands, the character is moved to the nearest free hex the character could stand on, preferring the hexes beside and behind the creature (a fixed order, so it is deterministic), and the move costs no actions.

**Reasoning.** Misa: the occupied hexes are the creature's own ground; making them off limits lets the creature be drawn smaller without losing its size. Being pushed aside rather than lost or blocked keeps the daily step simple; the push rule was the lead's call.

## 2026-11-19: Characters start on the creature's centre

ID: `2026-11-19-characters-start-on-the-creature-s` · Status: superseded by `2026-11-19-characters-start-on-a-free-hex` · Supersedes: `2026-11-19-characters-start-together-on-the-passable`

**Decision.** `createGame` puts every character on the creature's centre. That hex is always passable, so no search for a nearby free hex is needed.

**Reasoning.** Follows from the creature's hexes always being passable. It is the simplest start.

## 2026-11-19: The creature's hexes are always passable to characters

ID: `2026-11-19-the-creature-s-hexes-are-always` · Status: superseded by `2026-11-19-the-creature-s-hexes-are-occupied` · Amends: `2026-11-19-cliffs-are-impassable-to-characters-in`

**Decision.** A character may enter any of the creature's hexes whatever terrain lies under it, cliffs included. Outside the creature, cliffs still block. Move cost is still the terrain's.

**Reasoning.** The creature walks over any terrain, and characters can climb onto and through it, so its back is a way across a ridge. It also means the start hex (the creature's centre) is always legal.

## 2026-11-19: Characters start together on the passable hex nearest the creature

ID: `2026-11-19-characters-start-together-on-the-passable` · Status: superseded by `2026-11-19-characters-start-on-the-creature-s`

**Decision.** `createGame` puts every character on the same hex: the creature's centre if it is passable, otherwise the first passable hex found ring by ring outwards. Characters may share a hex.

**Reasoning.** Simplest start that is always legal. Spreading characters out or letting players choose a start can come later without changing the state shape.
