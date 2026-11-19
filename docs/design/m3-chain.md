# Milestone 3: the first chain

The plan for Milestone 3 (`docs/PROTOTYPE_PLAN.md`): prove that roles depend on each other with three roles, Scout, Engineer and Scholar. A scout finds a site and a resource node, an engineer gathers and crafts something that changes how everyone moves, and a scholar opens the site with help from that chain. Every number below is a starting value in the tuning config or content data; change it there.

## What hexes can hold (content as data)

Each hex may hold one hidden **feature**, generated on the server from the seed (most hexes hold nothing). Kinds, each with tags:

- **Resource nodes**: an iron deposit (desert, cliff edges), sturdy river stones (river), a timber stand (forest). Each has a few charges and yields a material when gathered.
- **Sites**: a tomb in two tiers. Tier 1 needs only time; tier 2 also needs an item (a lantern).
- **Traps**: a snare or a pitfall. A trap triggered by a character ends that character's day (actions to zero). A revealed trap is harmless.

A feature is **hidden** until revealed. Hidden features never reach the client: the player view carries only revealed features, plus a faint **glint** on hexes a scout can sense (see Scout).

## Roles (fixed perks, no skill trees)

Anyone can try the basics; the specialist does it clearly better.

- **Scout**: entering a hex reveals its feature for everyone and never triggers a trap there. A scout also senses the neighbouring hexes: a glint marks those that hold something (not what it is). Others entering a hex reveal its feature too, but trigger a hidden trap.
- **Engineer**: gathers twice the yield. Crafts from recipes, at most one craft per engineer per day. Others may craft tier-1 recipes at one extra material.
- **Scholar**: works sites with a better success chance (tier 1: 70 %, tier 2: 50 %; others: 35 % on tier 1 and cannot try tier 2).

## Actions (each costs actions from the day's three)

- **Gather** at a revealed node you stand on: 1 action, the yield goes to the shared team inventory, one charge is spent.
- **Craft** a recipe from the team inventory: 1 action. Crafted items belong to the team.
- **Work a site** you stand on: 2 actions. Success is a seeded roll (game seed, day, character, site), so it is fair and repeatable but unknown in advance. Success returns a find (a rare material) and the site is spent; failure keeps the site for another try.

## Items and the movement chain

- **Recipes** (data): grappling hook (2 iron, 1 timber), lantern (1 stone, 1 timber), climbing spikes (1 ancient alloy, 1 iron).
- **Grappling hook** (team item): every character can enter cliff hexes, at a cost of 2. The path step carries `via: 'grappling-hook'`, so the arrow shows it.
- **Climbing spikes** (needs the scholar's find): cliffs cost 1 instead of 2.
- **Lantern**: needed to work tier-2 sites.

The chain: a scout reveals nodes and a tomb, an engineer gathers and crafts a grappling hook and a lantern, a scholar opens the tier-2 tomb for ancient alloy, and the engineer turns it into climbing spikes.

## State, view and API

- Core state gains `features` (per hex, hidden or revealed, with charges), `inventory` (team materials and items) and per-day craft counters. The view carries revealed features, glints the viewing player's party has sensed, and the inventory.
- **Content version 3**, with a migration from version 2 (`migrateGame`), so the live production game keeps its characters and map; features are generated for hexes as they come into view.
- One new route: `POST /api/game/act` with `{ version, action }`, where `action` is `{ kind: 'gather' }`, `{ kind: 'craft', recipe }` or `{ kind: 'work-site' }`, all for the player's own character at their place. Strict schemas; refusals as `409 { error }`. The result of a site roll is in the returned view (the find, or the site still there).
- `POST /api/game/act` and `POST /api/game/move` answer the new `PlayerView` plus `events`: what happened, in order, for the map's short moments, for example `[{ kind: 'revealed', hex }, { kind: 'trap', hex }]` (the core's event list, passed through; empty when nothing happened). A move that a trap stops answers `200` with the shorter walk and its `trap` event, not a refusal. `GET /api/game` carries no events.

## Interface

- A tap on your own hex shows its feature and the actions there in the popover (gather, work site), each with its action cost as pips; confirm spends.
- A team inventory view: a drawer (bottom on phones, side on desktop) with materials and items as icons and counts, and the recipes as cards an engineer (or anyone, at extra cost) can craft from.
- Reveals, finds and a triggered trap get a short visual moment on the map; no prose.
- Glints are the art kit's hint mark.

## Sessions and branches

- **Core** (`m3/core`): content, generation, the rules above, the migration.
- **Worker** (`m3/worker`): the act route, migration on load, fixtures.
- **Web** (`m3/web`): the actions in the popover, the inventory drawer, the moments.
- **Art** (`m3/art`): node, site and trap drawings and their revealed states, item and material icons, the glint, the "moment" marks.

The lead merges them on `m3/integration`.
