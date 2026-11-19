# Milestone 4: the living creature

The plan and contract for Milestone 4 (`docs/PROTOTYPE_PLAN.md`): the creature becomes a character with hidden needs and reactions, and the Keeper role becomes a puzzle. It builds on Milestone 3 (`docs/design/m3-chain.md`): packs, team stores on the creature, nodes, the `act` route and its events. Every number below is a starting value in the tuning config or content data; change it there.

Done when a keeper can work out by experiment how the creature reacts to fire, and the team can use that to turn it.

This is a prototype slice. One creature, one need (hunger), one stimulus (fire), one food. They are placeholders to prove the loop; creatures, needs, stimuli and remedies are meant to grow varied, and keeper abilities beyond the base ones come later as upgrades.

## The creature's nature (hidden, server only)

- Creatures are content: `CREATURE_TYPES` in `packages/core/src/content/creatures.ts`. A type has an id, name, tags, its need (hunger: start, daily drain, comfortable band) and, per stimulus tag, the reactions it may roll (`attracted`, `repelled`, `indifferent`). The first type, the Mossback, is tame: its fire reaction is rolled from `attracted` or `repelled` (an indifferent first creature could never be steered by fire; `indifferent` stays in the data for later creatures).
- A new game rolls the nature from the seed: `GameState.nature = { type, reactions: { fire: 'attracted' | 'repelled' | 'indifferent' } }`.
- Hunger is a hidden number, `GameState.care = { satiety }`, from 0 to `satietyMax` (10). It starts at 6 and drops by 1 each tick. Comfortable is 4 to 7.
- `nature` and `care` are server-only fields of `GameState`, like the seed. `toPlayerView` lists fields one by one, so they never leave the server; a test proves it.

## Symptoms (what players see)

- **Appetite** derives from satiety: underfed at 3 or less (level 1 at 3, 2 at 2, 3 at 1 or 0), overfed at 8 or more (level 1 at 8, 2 at 9, 3 at 10).
- Underfed and overfed look different on the creature: underfed droops and dulls, overfed rounds and grows drowsy. Each level looks stronger. No words, no numbers.
- **The keeper sees clearer.** A viewer whose active character is a Keeper sees the kind and the level from level 1. Anyone else sees only levels 2 and 3, and then only as a faint sign of the kind (level 1).
- **Reaction cues (keeper only).** When a tick finds a lit fire within `stimulusRange` of the creature, it records what the creature felt about it (server-only, `care.cues` for that day). The next day a keeper sees a cue on the creature for each such fire: its head turned toward it (attracted), flinched away (repelled), or unmoved (indifferent). Everyone else sees only where the creature went, which is a weighted roll and can mislead once.
- These per-viewer signs are not in `GameStateView` (shared by everyone); the core computes them per viewer: `creatureSigns(state, viewerCharacterId | null): CreatureSigns`.

```
CreatureSigns = {
  appetite: { kind: 'underfed' | 'overfed', level: 1 | 2 | 3 } | null,
  cues: [{ hex: Hex, stimulus: 'fire', reaction: 'toward' | 'away' | 'unmoved' }],  // empty unless the viewer is a keeper
}
```

## Stimuli: fire

- Stimuli are content: `STIMULUS_TYPES`. Fire: tags `fire`, `heat`, `light`; costs 1 unit of a material tagged `wood` (timber) from the character's own pack; burns through the next tick, then goes out.
- **Light a fire**: an action on the hex you stand on (not riding, not on the creature's footprint, not on terrain tagged `water`, not where a fire already burns). 1 action and 1 timber. Anyone can light one.
- Fires are public: `GameStateView.stimuli = [{ type: 'fire', hex, litDay }]`. Everyone sees them on the map. A fire lit on day _d_ acts on the tick that ends day _d_ and is gone after it.
- **How the step reacts.** Each of the three step options (left, straight, right) gets its base veer weight. For each fire within `stimulusRange` (3) of the creature's centre, the option scores +1 if it ends closer to the fire, −1 if farther, 0 if neither. The weight is multiplied by `stimulusPull` (6) to the power of the summed score for an attracted creature, of minus that for a repelled one, and is unchanged for an indifferent one. Then the seeded roll picks as before. With the base weights 1 : 2 : 1 and one fire that only the left step gets closer to and the right step gets farther from, an attracted creature goes left about three times in four and right almost never.
- The creature still never turns back, and its general heading stays fixed: fires shift its path sideways, day by day. A later rule can turn the heading after repeated veers; nothing here prevents it.
- **Prediction stays honest and blind.** `predictCreature` (public, used for the step hints) keeps the base weights and ignores stimuli and hunger, so it cannot reveal the reaction. The server's `chooseCreatureStep` uses the full weights.

## Feeding, neglect and pace

- **Food** is content: a material `forage` tagged `food`, with `nourishes: 2`. A new node, berry bushes (`wooded` and `open` terrain, 3 charges, 1 forage per gather), yields it. Gathering works as in Milestone 3, into the pack, then into the stores on boarding.
- **Feed**: riding the creature, 1 action, takes 1 food from the stores, adds its `nourishes` to satiety (capped at 10; overfeeding is possible and shows). Anyone can feed: basics for all.
- **Underfed takes worse steps and makes trouble, but it always moves.** While underfed, the base weights become `hungryVeerWeights` (1 : 1 : 1, erratic) and stimuli still pull. At level 3 it also eats one unit from the team stores at each tick (food first, else a seeded pick).
- **Overfed is sluggish.** Stimuli pull less: the pull becomes `1 + (stimulusPull − 1) / (level + 1)`. Feeding too much makes steering hard; feeding too little makes it erratic. The comfortable band is where the team can steer.
- **Linger (keeper)**: riding, 2 actions; the creature stays put at the next tick (the day still turns: fires go out, hunger drains, grace days run, actions reset). Not on the day after a linger, so it always moves at least every other day. Public: `creature.lingering: boolean` shows on the creature, and the step hints show it staying. Keeper only: pace is the keeper's lever.

## Tick order (additions)

The creature's step (or its lingering) is chosen from the state before the tick, with the fires lit that day and the current satiety. Then: cues recorded for fires in range; satiety drops by 1; a starving creature eats from the stores; fires lit that day go out; `lingering` clears and `lingeredDay` is set if it lingered. The rest is as in Milestone 3.

## State, view and API

- Core state: `GameState.nature`, `GameState.care` (server only); `GameStateView.stimuli`, `creature.lingering`, `creature.lingeredDay` (public). Content version 5; older games are wiped and recreated, as in Milestone 3.
- Actions (`checkAction` / `act`): `{ kind: 'light-fire' }`, `{ kind: 'feed' }`, `{ kind: 'linger' }`. New refusals: `cannot-burn`, `fire-here`, `no-fuel`, `no-food`, `needs-keeper`, `lingered-yesterday`, `on-creature`. New events: `fire-lit`, `fed`, `linger`.
- `POST /api/game/act` accepts the three new actions (strict schemas). `PlayerView` gains `signs: CreatureSigns` for the signed-in player's active character (`null` viewer when they have none: no keeper detail).
- Contract fixtures are recaptured from the Worker; never edited by hand.

## Interface

- Fires are drawn on their hex (a small campfire with smoke), visible to all.
- The creature shows its appetite sign (underfed droop, overfed drowsy roundness; faint for non-keepers) and, for keepers, the day's reaction cues: a gaze or ears toward a fire, a flinch away, or a still, unbothered look. A lingering creature lies down.
- The step hints show the creature staying when it lingers.
- Your own hex: light a fire (fire icon, timber pip, action pip). The creature's hub drawer: feed (food icon) and, for keepers, linger.
- The berry bushes node and the forage material have icons. Moments for a fire lit, a feeding and a linger; no prose.

## Sessions and branches

- **Core** (`m4/core`): content (creature type, stimulus, food node and material), the hidden nature and care, step weights, symptoms and signs, the three actions, the tick additions, content version 5, a scenario test proving the done criterion (a keeper reads the cue, the team lights fires and the creature's path bends).
- **Art** (`m4/art`): appetite signs at three levels each plus the faint version, reaction cues, the lying-down linger pose, a fire on a hex, berry bushes, forage, and icons for the three actions; a review batch.
- **Worker** (`m4/worker`) and **Web** (`m4/web`): start once Milestone 3's worker and web are on `m3/integration`. Worker: schemas, `signs` in the view, the new game's nature, fixtures. Web: the actions, fires, signs, cues and linger on the map.

The coordinator merges them on `m4/integration`.
