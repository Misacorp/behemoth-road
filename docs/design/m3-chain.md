# Milestone 3: the first chain

The plan for Milestone 3 (`docs/PROTOTYPE_PLAN.md`): prove that roles depend on each other with three roles, Scout, Engineer and Scholar. A scout finds a site and a resource node, an engineer turns gathered materials into a permanent unlock that changes how everyone moves, and a scholar opens the site with help from that chain. Every number below is a starting value in the tuning config or content data; change it there.

This is a prototype slice. The content (three nodes, two tomb tiers, two traps, three unlocks) and the effects (a trap ends your day) are placeholders to prove the loop; the world, the trap effects and the rewards are meant to become far more varied. Role abilities beyond the base ones (a scout's trap sense, an engineer's better yield) come later as upgrades.

## Exploration and fog of war

- A hex in the window is **unexplored** until a character enters it or surveys it, then **explored** for everyone. Unexplored hexes show their terrain under a light veil, clearly different from explored ground and from the blank paper beyond the window.
- Exploring a hex reveals its **feature**, if it has one. Most hexes hold nothing.

## What hexes can hold (content as data)

- **Resource nodes**: an iron deposit (desert, cliff edges), river stones (river), a timber stand (forest). A few charges each.
- **Sites**: tombs in two tiers. Tier 2 needs the lantern unlock.
- **Traps**: a snare and a pitfall. **Anyone** entering a hex with a hidden trap springs it: for now that ends the character's day (actions to zero). A revealed trap is harmless.

Hidden features never reach the client.

## Roles in this milestone (base abilities only)

Anyone can try the basics; the specialist does it better.

- **Scout: survey.** Reveal an adjacent hex (its feature, a trap included, which is then harmless) without entering it: 1 action for a scout, 2 for anyone else. Trap sense, glints and immunity are future scout upgrades, kept in data but not active.
- **Engineer: builds unlocks.** Only engineers work on unlocks (see Unlocks).
- **Scholar: works sites.** Tier 1: 70 % for a scholar, 35 % for others; tier 2: scholars only, 50 %.

## Carrying, stores and unlocks

- **Packs:** each character carries a pack (capacity 6 units, config). Gathering and finds go into the pack of the character who did it. A lost character's pack is lost.
- **Team stores** live on the creature. A character on the creature (riding, or boarding) puts their whole pack into the stores automatically. Materials are only usable for unlocks from the stores, so gathering means a trip out and back.
- **Unlocks** are permanent for the whole team. Each has a material cost (taken from the stores when the work starts) and a duration in work: engineers riding the creature spend actions on it, one action is one work. Several engineers can work on the same unlock. One unlock is in progress at a time.
  - Grappling hook: 2 iron, 1 timber, 4 work. Cliffs can be entered at a cost of 2; the path step carries `via: 'grappling-hook'`.
  - Lantern: 1 stone, 1 timber, 3 work. Tier-2 tombs can be worked.
  - Climbing spikes: 1 ancient alloy, 1 iron, 6 work. Cliffs cost 1 instead of 2.

## Actions (each costs actions from the day's three)

- **Survey** an adjacent hex: 1 (scout) or 2.
- **Gather** at an explored node you stand on: 1 action, one unit into your pack, one charge spent. A full pack refuses.
- **Work a site** you stand on: 2 actions. A seeded roll (game seed, day, character, site): success puts the find in your pack and spends the site; failure keeps it. Tier-1 tombs find old coin, tier-2 tombs ancient alloy.
- **Work on an unlock** (engineers, riding): 1 action = 1 work. Starting an unlock takes its materials from the stores.

## State, view and API

- Core state: per-tile `explored`, features, character `pack`, team `stores`, `unlocks` (done) and the one `project` in progress (unlock id and work done).
- **No migration:** before a stable release, a stored game with an older content version is replaced by a new game (Misa: everything can be wiped).
- `POST /api/game/act` with `{ version, action }`: `{ kind: 'survey', hex }`, `{ kind: 'gather' }`, `{ kind: 'work-site' }`, `{ kind: 'build', unlock }`. Act and move answer `{ ...PlayerView, events, stopped }`.

## Interface

- The veil on unexplored hexes; explored ground clear.
- Tap your own hex: its feature and the actions there with pip costs. Tap an adjacent unexplored hex: survey.
- Your pack on the HUD (a satchel with a fill mark); tapping it shows the contents.
- The creature's hub (the bubble's creature entry) opens a drawer with the team stores, the unlocks done, and the unlock in progress with its work bar. Engineers riding can start or work on an unlock there.
- Moments for a reveal, a find, a trap and a finished unlock; no prose.

## Sessions and branches

Core, worker, web and art on `m3/core`, `m3/worker`, `m3/web` and `m3/art`, merged by the lead on `m3/integration`.
