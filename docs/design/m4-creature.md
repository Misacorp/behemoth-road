# Milestone 4: the living creature

The plan and contract for Milestone 4 (`docs/PROTOTYPE_PLAN.md`): the creature becomes a character with hidden needs and reactions, and the Keeper role becomes a puzzle. It builds on Milestone 3 (`docs/design/m3-chain.md`): packs, team stores on the creature, nodes, the `act` route and its events. Every number below is a starting value in the tuning config or content data; change it there.

Done when a keeper can work out by experiment how the creature reacts to fire, and the team can use that to turn it.

This is a prototype slice. One creature, one need (hunger), one stimulus (fire), one food. They are placeholders to prove the loop; creatures, needs, stimuli and remedies are meant to grow varied, and keeper abilities beyond the base ones come later as upgrades.

## The creature's nature (hidden, server only)

- Creatures are content: `CREATURE_TYPES` in `packages/core/src/content/creatures.ts`. A type has an id, name, tags, its need (hunger: start, daily drain, comfortable band) and, per stimulus tag, the reactions it may roll (`attracted`, `repelled`, `indifferent`). The first type, the Mossback, is tame: its fire reaction is rolled from `attracted` or `repelled` (an indifferent first creature could never be steered by fire; `indifferent` stays in the data for later creatures).
- A new game rolls the nature from the seed: `GameState.nature = { type, reactions: { fire: 'attracted' | 'repelled' | 'indifferent' } }`.
- Hunger is a hidden number, `GameState.care = { satiety }`, from 0 to the type's `max` (20). It starts at 12 and drops by 1 every tick (`drainEveryDays` 1 in the creature's hunger data). Comfortable is 8 to 15. Satiety counts in half the units of the first draft (0 to 10, drain every second day) so that every step of hunger lasts as long as it did.
- `nature` and `care` are server-only fields of `GameState`, like the seed. `toPlayerView` lists fields one by one, so they never leave the server; a test proves it.

## Symptoms (what players see)

- **Appetite** derives from satiety: how far it is outside the comfortable band, in steps of the type's `levelStep` (2). Underfed below 8 (level 1 at 6 to 7, level 2 at 4 to 5, level 3 at 3 or less), overfed above 15 (level 1 at 16 to 17, level 2 at 18 to 19, level 3 at 20).
- Underfed and overfed look different on the creature: underfed droops and dulls, overfed rounds and grows drowsy. Each level looks stronger. No words, no numbers.
- **The keeper sees clearer.** A viewer whose active character is a Keeper sees the kind and the level from level 1. Anyone else sees only levels 2 and 3, and then only as a faint sign of the kind (level 1).
- **Reaction cues (keeper only).** When a tick finds a lit fire within `stimulusRange` of the creature, it records what the creature felt about it (server-only, `care.cues` for that day). The next day a keeper sees a cue on the creature for each such fire: its head turned toward it (attracted), flinched away (repelled), or unmoved (indifferent). The cue names the reaction wherever the fire is, even straight ahead where it bends nothing. Everyone else sees only where the creature went (a sideways turn), which is a weighted roll and can mislead once.
- These per-viewer signs are not in `GameStateView` (shared by everyone); the core computes them per viewer: `creatureSigns(state, viewerCharacterId | null): CreatureSigns`.

```
CreatureSigns = {
  appetite: { kind: 'underfed' | 'overfed', level: 1 | 2 | 3, faint: boolean } | null,  // faint: a non-keeper's view (level 1)
  cues: [{ hex: Hex, stimulus: 'fire', reaction: 'toward' | 'away' | 'unmoved' }],  // empty unless the viewer is a keeper
}
```

## Stimuli: fire

- Stimuli are content: `STIMULUS_TYPES`. Fire: tags `fire`, `heat`, `light`; costs 1 unit of a material tagged `wood` (timber) from the character's own pack; burns through the next tick, then goes out.
- **Light a fire**: an action on the hex you stand on (not riding, not on the creature's footprint, not on terrain tagged `water`, not where a fire already burns). 1 action and 1 timber. Anyone can light one.
- Fires are public: `GameStateView.stimuli = [{ type: 'fire', hex, litDay }]`. Everyone sees them on the map. A fire lit on day _d_ acts on the tick that ends day _d_ and is gone after it.
- **Fires steer sideways only.** The sideways turn is the visible sign that the creature reacts. Each of the three step options (left, straight, right) gets its base veer weight. The stimuli decide one number, the net push, as follows (`stimulusPush`, `sideOf`):
  - A fire counts when it is within `stimulusRange` (3) of the creature's centre. Which side of the heading's line it lies on (by plane geometry) is its side: left, right, or on the line (straight ahead or straight behind).
  - An attracted creature takes each fire as a push toward its side, a repelled one as a push away from it, an indifferent one as none. A fire on the line pushes neither way. Each push counts the stimulus type's `push` (1 for fire).
  - The pushes add: fires on opposite sides cancel, several on one side add up, and a net of zero leaves the step alone ("ties go straight").
  - With a net push of n (left positive), the left weight is multiplied by `stimulusPull` (6) to the power n, and the right weight by 6 to the power minus n. The straight weight never changes. Then the seeded roll picks as before.
  - Examples with the base weights 1 : 2 : 1 and an attracted creature: one fire on the left, left about three times in four and right almost never; a fire on each side, unchanged; two on the left and one on the right, a push of one; a fire straight ahead or behind, unchanged. A repelled creature turns the other way for the same fires. Hunger applies on top (see Feeding).
- The creature still never turns back, and its general heading stays fixed: fires shift its path sideways, day by day. A later rule can turn the heading after repeated veers; nothing here prevents it. Opposed reactions on two sides (an attracting stimulus on one side, a repelling one on the other) both push the same way by the same rule; the first creature has one reaction per stimulus kind, so that case waits for a second stimulus.
- **Prediction stays honest and blind.** `predictCreature` (public, used for the step hints) keeps the base weights and ignores stimuli and hunger, so it cannot reveal the reaction. The server's `chooseCreatureStep` uses the full weights.

## Feeding, neglect and pace

- **Food** is content: a material `forage` tagged `food`, with `nourishes: 4` (of 20: one forage feeds the creature for four days). A new node, berry bushes (`wooded` and `open` terrain, 3 charges, 1 forage per gather), yields it. Gathering works as in Milestone 3, into the pack, then into the stores on boarding.
- **Feed**: riding the creature, 1 action, takes 1 food from the stores, adds its `nourishes` to satiety (capped at 20; overfeeding is possible and shows). Anyone can feed: basics for all.
- **Underfed takes worse steps and makes trouble, but it always moves.** While underfed, the base weights become `hungryVeerWeights` (1 : 1 : 1, erratic) and stimuli still pull. At level 3 (satiety 3 or less) it also eats one unit from the team stores at each tick (food first, else a seeded pick).
- **Overfed is sluggish.** Stimuli pull less: the pull becomes `1 + (stimulusPull − 1) / (level + 1)`. Feeding too much makes steering hard; feeding too little makes it erratic. The comfortable band is where the team can steer.
- **Linger (keeper)**: riding, 2 actions; the creature stays put at the next tick (the day still turns: fires go out, hunger drains, actions reset; the fog holds, so no hex leaves the window or is lost and the grace days do not run, Misa 2026-11-24). Not on the day after a linger, so it always moves at least every other day. Public: `creature.lingering: boolean` shows on the creature, and the step hints show it staying. Keeper only: pace is the keeper's lever.

## Tick order (additions)

The creature's step (or its lingering) is chosen from the state before the tick, with the fires lit that day and the current satiety. Then: cues recorded for fires in range; satiety drops by 1 if the new day drains (every second tick); a starving creature eats from the stores; fires lit that day go out; `lingering` clears and `lingeredDay` is set if it lingered. The rest is as in Milestone 3.

## State, view and API

- Core state: `GameState.nature`, `GameState.care` (server only); `GameStateView.stimuli`, `creature.lingering`, `creature.lingeredDay` (public). Content version 5 (10 after the hunger scale and chain retune); older games are wiped and recreated, as in Milestone 3.
- Actions (`checkAction` / `act`): `{ kind: 'light-fire' }`, `{ kind: 'feed' }`, `{ kind: 'linger' }`. New refusals: `cannot-burn`, `fire-here`, `no-fuel`, `no-food`, `needs-keeper`, `lingered-yesterday`, `on-creature`; a second linger on one day reuses `already-have`. New events: `fire-lit`, `fed`, `linger`.
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
