# Fire, braziers and falling slides: contract for the web

Content version 23. The rules are in `packages/core`; nothing here needs the web to compute anything. Decisions: "Fire needs something to burn", "Threats tagged fears-fire keep clear of burning fires" and "Striking a rockslide can bury the striker" in `decisions/product.md`.

## What changed in play

- A fire can only be lit on a hex that holds **something that takes fire**: a feature tagged `fire-site` (the **brazier**) or `burnable` (deadfall, snare). Plain ground is refused with `nothing-to-burn`.
- A **brazier** burns for `config.brazierNights` (4) nights, shows the hexes around it, and can be lit again once it has burnt out. A Beacon (keeper skill) adds a night, a range and a push.
- A **burnable** feature is burnt away for good and acts as a one-night fire (the old fire).
- Threats tagged `fears-fire` (swarm, stampede) keep out of a burning fire's ring.
- Striking a threat tagged `falls` (rockslide) can pin the striker. Someone next to them digs them out (`dig-out`), or they free themselves.

## View fields (all public; `toPlayerView`)

- `features[hexKey]` with `type: 'brazier'`: `revealed: true` as soon as its hex is seen (it is the one feature not hidden until explored). Its content: `FEATURE_TYPES` entry with `kind: 'hearth'`, `tags: ['fire-site']`, `icon: 'brazier'`. Where braziers stand (`brazierPlan`) is server-only and never sent.
- `stimuli[]`: `{ type, hex, litDay, range?, push?, nights?, reveal? }`. **Changed in round two:** a lit brazier's stimulus `type` is now `brazier-fire` (not `fire`); the `fire-lit` event's `stimulus` says the same. Both are tagged `fire` (`STIMULUS_TYPES`), so read the tag, not the id. A burnable still lights `fire`. A brazier stimulus always carries `range` (5, or the Beacon's if larger), `nights` and `reveal`; its base push (2) is in the stimulus type data (`push` on the stimulus is only the Beacon's multiplier). `config.brazierNights` is now 4, and braziers stand two or three hexes beside the route line.
  - `nights`: nights a brazier burns in all (counted from `litDay`); absent for a burnable's one-night fire (the type's `lastsTicks` is 1).
  - `reveal`: the radius of hexes it shows (a brazier); absent otherwise.
  - Nights left: `nightsLeft(view, stimulus)` (exported) = `litDay + nights - day`. At least 1 for any stimulus still in the list; the stimulus is gone from the list once it is 0. A brazier is **lit** exactly when a stimulus stands on its hex.
- `features[hexKey].stocked?: boolean` (new): true on a brazier not yet lit, with old fuel in the bowl. While true, `light-fire` there costs actions only (`uses` is empty, no wood needed). It is removed (absent) at the first lighting; a relight needs wood and gives `no-fuel` without it. Content: `stockedFuel: true` on the brazier's `FEATURE_TYPES` entry. Public. Every planned brazier is generated stocked.
- `burnt[]`: `{ hex, feature }`, the burnables a fire burnt away for good (`feature` is the type id that stood there), kept for the season and sent only for hexes whose tile is `seen`. The feature type's `burntLook` (content: `deadfall`, `snare`) says how the ground looks; read it, never the id. The web draws the burnt look from this, not from traces (traces can be switched off, evicted or pruned).
- `characters[].pinnedDay?: number`: set while pinned (the day they were pinned). Absent when free.
- `config`: `brazierNights`, `brazierRevealRadius`, `brazierSpacing`, `brazierFirstWithin`, `fireFearRadius`, `slideFallChance`, `digOutCost`.
- Tags the web may read as public content (`THREAT_TYPES`, `FEATURE_TYPES`, from the core package): threat tags `fears-fire` (swarm, stampede) and `falls` (rockslide); feature tags `fire-site` (brazier) and `burnable` (deadfall, snare). The exported tag constants are `FEARS_FIRE_TAG`, `FALLS_TAG`, `FIRE_SITE_TAG`, `BURNABLE_TAG`.
- The chance a given character is caught by a slide is `fallChance(view, character, threatTags)` (exported): `slideFallChance` times the `sure-footed` factors of their role and skills (the Engineer: 0.5; Pack mule, engineer tier 2 branch a: 0). Safe to show as a published chance.
- Where a `fears-fire` threat will hold: `inFireRing(view, hex)` and `keepsClearOf(view, threatType, hex)` (exported); the public outlook (`threatOutlook`, `threatNextPath`) already accounts for it.

## The action

`POST /api/game/act` takes `{ kind: 'dig-out', target: <character id> }` (strict, id 1 to 64 characters; identity comes from the session, never the body). Cost `digOutCost` actions (1). It frees the pinned `target` at once.

`light-fire` is unchanged in shape (`{ kind: 'light-fire' }`, no hex): it acts on the hex the character stands on. `checkAction` says whether it can be done there; `actionsHere` lists `dig-out` once per active pinned character other than the actor, on the same or a neighbouring place.

## Refusal reasons (409 `{ error }`, and `checkAction(...).reason`)

- `nothing-to-burn`: light-fire on a hex with no brazier or burnable feature.
- `fire-here`: a fire already burns there (a lit brazier).
- `pinned`: any act or move by a pinned character (setting a stance and picking a skill still work).
- `not-pinned`: dig-out on a character who is not pinned.
- Existing and still used by dig-out: `not-near` (not on the same or a neighbouring place), `unknown-character`, `character-lost`, `invalid-action` (digging yourself out), `not-enough-actions`.
- Existing for light-fire and unchanged: `on-creature`, `cannot-burn` (water), `no-fuel`, `not-enough-actions`.

## Events (each carries the usual `version` in the Worker's answer)

- `fire-lit` `{ hex, characterId, stimulus }`: unchanged; a brazier or a burnable.
- `feature-burnt` `{ hex, characterId, feature }`: right after `fire-lit` when a burnable went up for good.
- `explore` and `reveal`: from lighting a brazier and from each tick it burns (hexes within `reveal` of it that are in view).
- `fire-out` `{ hex, stimulus }`: from the tick when a brazier (or a one-night fire) burnt out.
- `pinned` `{ characterId, threat }`: after the strike's `threat-hit` when the slide fell on the striker.
- `dug-out` `{ characterId, by }`: `by` is the character who dug them out, or `null` when they freed themselves at the tick.

Traces: a lit brazier or a burnable fire leaves the existing `fire` trace kind (credited to the lighter).

## The rules the web should not copy

- **Pinned timing.** Pinned on day D: no actions for the rest of D and none held over to D + 1, free from D + 2 at the tick. Dug out on D: free at once, with no actions left that day. Dug out on D + 1: free at once and they get that day's full actions back (`actionsPerDay`). If they are lost while pinned, the pin is cleared and there is no `dug-out` event; a pinned character the creature hauls aboard gets a `dug-out` with `by: null` and full actions. A pinned character is not moved by anything: if the creature walks away they can be lost like anyone else, and if the creature's footprint reaches them they are hauled aboard and free.
- **Fear.** A `fears-fire` threat does not step into, stop on or strike from a hex within `fireFearRadius` of a burning fire, and does not strike characters standing in that ring. It holds where it is (it does not go around), and a threat already inside the ring when a fire is lit strikes nothing from there while the fire burns (it holds if its next step is inside the ring too, and walks out of it otherwise). The fire counts through the night it burns out, so a one-night fire protects until the tick that ends its day has run.
- **Reveal.** A burning brazier counts the hexes within `reveal` as explored (their features show) when it is lit and at every tick it burns through, its last night included, for hexes in view only.
- **Strikes by stance** (lying in wait) never bring a slide down; only an active `strike` does.
