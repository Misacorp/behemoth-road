# Hazards and lures: contract for the web

Content version 24. The rules are in `packages/core` (`hazards.ts`, `lures.ts`); nothing here needs the web to compute anything. Decisions: "Hazards across the route make steering worth it", "A lure animal is a second steering tool" and "Hazard patches are laid lazily across the route" in `decisions/product.md`.

## What changed in play

- **Hazard patches** lie across the creature's route ahead, about one every `config.hazardSpacing` (12) hexes, none within `config.hazardFirst` (6) of the start. Three kinds, picked by seed:
  - **Scree field:** 3 to 5 `rockslide` threats laid together (tag `falls`). Public threats once the patch is within reach, with `patch` set to the field's id on each (`h1-1`, `h1-2`, ...). Clearing them by hand takes many strikes and risks burial.
  - **Poisoned lake:** terrain `poisoned-lake`, tags `water`, `deep`, `fresh`, `poisoned`, not passable (a raft crosses it). Nothing can be found or gathered there.
  - **Glass waste:** terrain `glass-waste`, tags `dry`, `sharp`, passable, one action more to enter (`extraMoveCost` 1).
- A creature **step that ends on terrain with `perilOnStep`** adds that peril (2 for both terrains). Defence does not reduce it. A creature that lingers adds none. The creature does not avoid hazards by itself.
- **Lures** (a small animal, the `capybara`) stand near the route about every `config.lureSpacing` (7) hexes, never on water. A lure acts on the creature's step like a fire, for as long as it is on the map. The creature's reaction to it (attracted or repelled) is hidden: the Mossback is never indifferent, and a Keeper reads it by the same cues as fire.
- **Leading:** a character on the lure's hex or next to it can `lead` it one hex, to a passable, seen, non-water hex that is free (not the creature's footprint, another lure, a threat or a settlement). It costs `config.leadCost` (1) and each lure has `leadsLeft` (starts at `config.lureLeads`, 3). At 0 it **settles**: it stays and still acts, but cannot be led.
- A lure the creature's footprint reaches **flees**: it is removed. A lure left out of the window drops off quietly (no event).

## View fields (all public; `toPlayerView`)

- `lures[]`: `{ id, type, hex, leadsLeft }`. `leadsLeft` 0 means settled. Content for the art and name: `LURE_TYPES` entry (`icon: 'capybara'`, `tags: ['small-beast', 'lure']`, `push`, `range`).
- `threats[].patch?: string`: the scree field that laid it; absent for every other threat. These threats do not count toward `threatsMax`.
- `tiles[hexKey].terrain` is `poisoned-lake` or `glass-waste` for hazard hexes once seen: draw them from the terrain, like any other. Hazard terrain data (`TERRAIN_TYPES`): `perilOnStep` (number, absent on other terrain), `extraMoveCost`.
- `config`: `hazardSpacing`, `hazardFirst`, `lureSpacing`, `lureFirstWithin`, `leadCost`, `lureLeads`.
- Never sent: the hazard plan (`hazardPlan`), the lure counter (`lureCount`), the cart counter (`cartCount`), the creature's reaction to `small-beast`.
- Keeper cues (`creatureSigns(state, characterId).cues`, only for a Keeper, only the day after the tick): a lure in the creature's reach at the tick gives `{ hex, stimulus: <lure type id>, reaction: 'toward' | 'away' }`, the same shape as for a fire. `stimulus` is a lure type id (`capybara`), so look the art up in `LURE_TYPES` as well as `STIMULUS_TYPES`.

## The action

`POST /api/game/act` takes `{ kind: 'lead', lure: <lure id>, direction: 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw' }` or `{ kind: 'lead', lure: <lure id>, to: { q, r } }`: a lure id (lower-case letters, digits and dashes, 1 to 64) and **exactly one** of a direction or a hex (strict; unknown keys are rejected; identity comes from the session). `to` must be a neighbour of the lure's hex. Cost `leadCost` actions. `actionsHere` lists `lead` once per lure at hand and direction (six each), each with its `checkAction`.

## Refusal reasons (409 `{ error }`, and `checkAction(...).reason`)

- `no-lure`: no lure with that id. (Added to the five in the brief.)
- `not-near`: the character is not on the lure's hex or next to it (a rider is not on a hex).
- `settled`: no leads left.
- `blocked`: the target hex is water, impassable, unseen, under the creature, or holds a lure, a threat or a settlement.
- `not-enough-actions`, `pinned` (as everywhere).
- `invalid-action` (neither or both of direction and `to`, or an unknown direction), `invalid-hex` (a `to` that is not a whole-number hex), `not-adjacent` (a `to` that is not beside the lure).

## Events (each carries the usual `version` in the Worker's answer)

- `lure-led` `{ id, characterId, from, to, leadsLeft }`.
- `lure-settled` `{ id, hex }`: right after the `lure-led` that used the last lead.
- `lure-fled` `{ id, hex }`: from the tick, when the creature's footprint reached it.
- `hazard-step` `{ hex, terrain, damage }`: from the tick, when the creature's step ended on hazard terrain. The following `peril` event carries the source `terrain:<terrain id>` (`perilTerrain(id)`, exported).
- A scree field's rockslides appear as ordinary `threat-appears` events (their ids start `h<patch>-`).

## Exported helpers and constants (from `@behemoth-road/core`)

`LURE_TYPES`, `HAZARD_TYPES`, `lureType`, `reactionToLure`, `reactionToTags`, `hazardTerrainAt` (server plan, needs the plan), `perilTerrain`, `LURE_TAG`, `canLeadOnto(view, lure, hex)` (whether a lure can be led onto a hex: for greying out targets), and the types `Lure`, `HazardType`, `LureType`.

## The rules the web should not copy

- **Where patches and lures go** is server only (seeded, laid as the creature walks). The web only sees what is on tiles and in `lures` and `threats`.
- **The pull.** A lure steers like a fire: its `push` (2) toward its side if the creature is attracted, away if repelled, nothing if it lies on the heading's line, within `range` (6) of the creature's centre. Never show which way the creature feels (the Keeper's puzzle).
- **Hazard timing.** The terrain peril is taken at the tick that ends the day, for the hex the creature steps onto (its centre), once per step.
