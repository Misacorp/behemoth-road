# Milestone 5: threats and an ending

The plan and contract for Milestone 5 (`docs/PROTOTYPE_PLAN.md`): a complete, short season that can be won or lost. It builds on Milestone 4 (`docs/design/m4-creature.md`). Every number below is a starting value in the tuning config or content data; change it there.

Done when the group can play a full short season to a win or a loss. On staging and locally the season is short (12 steps) and the admin "next day" plays it through in minutes.

This is a prototype slice. Three threat flavours, one people, three boons. They are placeholders to prove the loop; threats, peoples and boons are meant to grow varied, and guardian and envoy abilities beyond the base ones come later as upgrades.

## Threats (the attack system)

- Threats are content: `THREAT_TYPES` in `packages/core/src/content/threats.ts`. A type has an id, name, tags, icon, `strength` (base), `speed` (hexes per tick), `approach` (where it appears), `reach` (how far from its hex it strikes: 1, next to it, for every type but the rockslide; 0, only on its hex) and `weight` (how often it is picked). Rules read tags and properties, never ids.
  - **Captor band**: tags `ground`, `pursuer`, `people`. Strength 3, speed 2, approach `behind` (the window's edge opposite the heading). It gains about one hex a day on the walking creature: four days of warning from the edge of the window (radius 6).
  - **Pterodactyl swarm**: tags `flying`, `beast`. Strength 2, speed 2, approach `flank` (the window's edge, ahead-left or ahead-right). Two or three days of warning.
  - **Rockslide**: tags `terrain`, `stone`. Strength 3, speed 0, approach `path` (on the straight-ahead line, `threatPathDistance` 5 hexes from the centre). `reach` 0: it strikes only the creature whose footprint covers its hex, and only a character who walks into its hex (the walk stops and the day ends, like a trap; the tick then strikes whoever still stands there). It never strikes its neighbours. Steering around it (fire) is a way through.
  - **Raiders**: tags `ground`, `people`. Strength 2, speed 1, weight 0 (never rolled): an angered settlement sends them, from its hex, often near the creature, so they are the slow one.
- **A threat on the map** is public: `GameStateView.threats = [{ id, type, hex, strength, appearedDay }]`. Everyone sees it from the moment it appears; seeing it come is the forecast.
- **Appearing.** At each tick from day `threatsFromDay` (3), a seeded roll (game seed, day) adds a threat with chance `min(threatChanceMax, threatChanceBase + threatChancePerPlayer × active players + threatChancePerDay × day)` (0.9; 0.25, 0.05, 0.01), while fewer than `threatsMax` (3) are on the map. The type is a weighted seeded pick among types with weight above 0 (pursuers are left out while a mislead lasts). It appears on the first fitting hex of its approach that is in the window, not water for ground threats, and not on the creature or a settlement. New threats appear after the others have acted, so none strikes the tick it appears.
- **Scaling.** Strength is the type's base `+ floor((active players − 1) / threatStrengthPlayers)` (3) `+ floor((day − 1) / threatStrengthDays)` (14). More players and later days: more and stronger threats.
- **Approach.** At each tick, after the creature's step, every threat moves up to `speed` hexes toward the creature's centre (each step to the neighbour closest to it, ties broken by a fixed direction order), and stops at **contact**: `creatureRadius + reach` from the centre (next to the footprint for reach 1). Terrain does not slow threats for now.
- **Striking the creature.** A threat at contact after moving strikes: peril rises by `max(0, strength − defence)` and the threat is spent (gone).
- **Striking a character.** After moving, a threat strikes every active character standing on a hex within its `reach` of it, unless that character is a guardian or is escorted (within 1 of an active guardian on a hex). A struck character starts the next day with `struckActions` (1) actions. Riders are never struck. The threat goes on.
- **Gone.** A threat whose hex leaves the window (a rockslide left behind) is gone.
- `threatOutlook(view)` (public core function, for the interface): for each threat, whether it reaches contact at the next tick if the creature walks straight on (`arrives: 'tomorrow' | 'later' | 'never'`), and the neighbour it would step to first. Blind to the creature's real step, like `predictCreature`.
- `threatNextPath(view, threatId)` (public core function, for the interface): the hexes the threat will cross at the next tick, end hex last, under the same straight-walk guess (a lingering creature stays put); empty when it does not move. The interface draws it as the threat's path for the next day.
- **Telegraphed** (decision "Threats are telegraphed"): the window is radius 6 (`windowRadius`), speeds are 0 to 2, and a threat's next path is shown. A scout perk `far-sight` (seeing threats beyond the window's edge) is data only, for a later upgrade.
- **Balance**: `packages/core/scripts/balance.ts` plays seeded seasons with scripted careful and careless parties. With these numbers (200 seeds), careful parties of 3 or 6 lose 12–14 % of full seasons and about 1 % of dev seasons; careless ones never win safe. See the decision "A seeded balance simulation".

## Guardian (base abilities)

- **Strike a threat** (anyone): standing on or next to a threat's hex, 1 action, its strength drops by `clearPowerGuardian` (2) for a role tagged `defend`, `clearPowerOther` (1) for anyone else. At 0 it is cleared (gone). Basics for all; standing next to a threat at the tick is a risk for anyone who is not a guardian or escorted.
- **Defend** (guardians, riding): 1 action. Until the next tick, each strike on the creature is reduced by `defendReduction` (2) per defending guardian still riding at the tick. Public: `creature.defenders` (character ids), cleared at the tick. Once per guardian per day.
- **Escort** (guardians, passive): a character within 1 of an active guardian standing on a hex is not struck. The guardian is not struck either. No action: it is where the guardian stands.

## Envoy and the peoples

- Peoples are content: `PEOPLE_TYPES` in `content/peoples.ts`. The first, the **Hill folk** (tags `people`, `herders`): `favourNeeded` 3, boons `gift`, `mislead` and `shelter`, gift `[2 forage, 1 timber]`, angered they send `raiders`.
- **Settlements** are placed by the route, not by chance, so every season meets them: at the tick on which the creature's step count reaches `settlementFirst` (4) and then every `settlementEvery` (10) steps, one settlement appears on a seeded hex at the window's leading edge (within a sixth of a turn of the heading, not water, not steep, no feature). A settlement is visible from the start (a village is not hidden). Public: `GameStateView.settlements = [{ id, type, hex, attitude: 'wary' | 'friendly' | 'angry', favour, boon }]`. It stays until its hex is lost to the fog.
- **Parley** (anyone, on the settlement's hex, wary only): 1 action. A role tagged `peoples` gains `parleyFavourEnvoy` (2) favour. Anyone else gains `parleyFavourOther` (1), with a `parleyAngerChanceOther` (0.25) seeded chance (seed, day, character, settlement) of angering it instead. The published chance is in the action check, so the interface can show the risk.
- **Offer** (anyone, on the hex, wary only): 1 action and 1 unit of a material tagged `trade` (old coin from a tomb) from the pack: `offerFavour` (2) favour, no risk. The scholar's find becomes the envoy's lever.
- **Befriended.** At `favourNeeded` favour it turns friendly.
- **Ask a boon** (anyone, on the hex, friendly, no boon taken yet): 1 action, picking one of the type's boons. One boon per settlement.
  - `gift`: the type's gift goes into the team stores.
  - `mislead`: every threat tagged `pursuer` is gone, and none appears for `misleadDays` (4) ticks.
  - `shelter`: peril falls by `shelterPeril` (3).
- **Angered.** It turns angry for good and sends its threat type from its hex at once (strength scaled as above). An angry settlement cannot be befriended.

## Peril and the ending

- **Peril** is public: `GameStateView.peril`, 0 to `perilMax` (10). It rises by each strike's damage and by `perilHungry` (1) at each tick that ends with the creature underfed at level 2 or more (the M4 appetite). At a tick where it did not rise, it falls by `perilCalm` (1). Shelter lowers it too.
- **The route.** `creature.steps` (public) counts the creature's steps; lingering adds none. The season's length is `routeLength` steps (40; 12 on staging and locally).
- **The season ends** at a tick: when peril reaches `perilMax`, lost; else when `creature.steps` reaches `routeLength`, home: safe if peril is below `perilWoundedAt` (5), wounded otherwise. Peril is checked first. Public: `GameStateView.season = { status: 'on' } | { status: 'over', outcome: 'safe' | 'wounded' | 'lost', day }`.
- **Once over**, every action and move is refused (`season-over`) and the tick does nothing (it returns the same state and no events). Production keeps the ended season on screen. On staging and locally an admin starts a new season (`POST /api/dev/new-season`): a new game, a new seed; every character is gone and players join again. Nothing carries over (`GAME_DESIGN.md` 8).

## Tick order (additions)

The creature's step (or linger) is chosen as before, then the step count rises. Then: M4 care (cues, hunger, the starving meal, fires out); threats move and strike (the creature, then characters), with the day's defenders; threats out of the window go; the peril change (strikes, hunger, else calm); the season-over check; if the season goes on, a settlement may appear, then a new threat may appear; defenders clear. The rest is as before (window, pick-ups, losses, actions reset with struck characters on `struckActions`).

## State, view and API

- Core state, all public: `threats`, `settlements`, `peril`, `season`, `creature.steps`, `creature.defenders`, and server-only `misleadUntilDay` (public is fine too; it is shown as no pursuers). Content version 6 (8 since the wider window); older games are wiped and recreated.
- Actions (`checkAction` / `act`): `{ kind: 'strike', threat: id }`, `{ kind: 'defend' }`, `{ kind: 'parley' }`, `{ kind: 'offer', material }`, `{ kind: 'ask-boon', boon }`. The check's `chance` carries parley's success chance (1 − anger chance). New refusals: `season-over`, `no-threat`, `not-near`, `needs-guardian`, `no-settlement`, `not-wary`, `not-friendly`, `boon-taken`, `unknown-boon`, `no-trade-good`; `already-have` for a second defend in a day.
- Moves are refused with `season-over` once the season has ended.
- Events: `threat-appears` (id, type, hex), `threat-moves` (id, from, to), `threat-strikes` (id, damage), `struck` (characterId, threat id), `threat-hit` (id, characterId, strength left), `threat-cleared` (id, characterId), `threat-gone` (id), `defend` (characterId), `peril` (from, to), `settlement-appears` (id, hex), `parley` (id, characterId, favour), `befriended` (id), `angered` (id), `offer` (id, characterId, material), `boon` (id, characterId, boon), `season-over` (outcome). Every one carries only public facts.
- `POST /api/game/act` accepts the five new actions (strict schemas; ids and boon names length-limited). `POST /api/dev/new-season` (dev tools on, admin only, like next day). The staging and local game is created with `SERVER_CONFIG.devSeason` overrides (`routeLength: 12`, `settlementFirst: 3`, `settlementEvery: 6`, `threatsFromDay: 2`); production uses the defaults. The alarm stops scheduling ticks once the season is over.
- Contract fixtures are recaptured from the Worker, with a scenario that reaches each outcome; never edited by hand.

## Interface

- **Threats** are drawn on their hex (a captor band, a swarm in the air, a teetering rockslide, raiders), with strength as small marks, and a short arrow toward the creature showing their next step. A threat that arrives tomorrow pulses. Tap a threat: its card with its name, strength and, when you are on or next to it, the strike action with its pip cost.
- **Escort**: a guardian on a hex shows a soft ring over its neighbours; an escorted character carries a small shield mark. A struck character shows a bandage for the day.
- **Defend**: a card in the hub drawer for guardians (like linger); defending guardians stand on the creature with shields raised.
- **Settlements** are drawn on their hex, their attitude readable at a glance (wary: plain huts and smoke; friendly: a raised banner; angry: torches and red). Favour as marks. Tap: parley (with a risk mark for non-envoys), offer (a coin icon, when you carry one), and once friendly the three boon icons to pick from.
- **Peril** is a gauge on the HUD beside the day: ten marks with the wounded threshold marked. As it rises the map's edges darken a little.
- **The route** is a thin strip on the HUD: steps walked toward home, with a home mark at the end.
- **The ending** fills the screen: a title only ("Home safe", "Home, wounded", "Lost"), a scene for each outcome, and the route strip with the days taken. On staging, admins see a new-season button.
- **The recap** (decision "A quick recap screen when a season ends") is part of the ending: shared stats (threats turned back, finds, unlocks, settlements won over, peak peril as a gauge) and, per player by Discord name with the role emblem, hexes explored, strikes and units gathered, a star on whoever led each. Core state `stats` (`stats.ts`): counters updated from events in `act`, `move` and the tick; public; older saved games load with empty counters. A phone shows it as a sheet over the scene, desktop as a side panel; a round button hides it. Nothing else happens at the end in production.
- Moments for a threat appearing, a strike on the creature (the peril gauge jolts), a character struck, a threat hit and cleared, a defence holding, a settlement befriended or angered, a boon, and the season's end; no prose.

## Sessions and branches

- **Core** (`m5/core`): content (threats, peoples), config, state, the five actions, the tick additions, `threatOutlook`, content version 6, and scenario tests proving each outcome: a season won safe, one won wounded and one lost to peril, all seeded and played through the core.
- **Art** (`m5/art`): the four threats with strength marks and a pulse, the approach arrow, the escort ring and shield mark, the bandage, the raised shields on the creature, the settlement in three attitudes with favour marks, boon icons, action icons (strike, defend, parley, offer), the peril gauge and the route strip, three ending scenes, and the moments; a review batch.
- **Worker** (`m5/worker`) and **Web** (`m5/web`): start when core is on `m5/integration`. Worker: schemas, the dev season config, the new-season route, the alarm stop, version 6 wipe, fixtures. Web: threats, settlements, peril, route and ending on the map and HUD, the new actions.

The coordinator merges them on `m5/integration`.
