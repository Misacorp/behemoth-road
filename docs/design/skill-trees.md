# Skill trees: a proposal

For Misa to react to. Numbers are guesses for the tuning config. **All 30 nodes are active** (r8, content version 19): the first slice built tier 1, Misa then approved tiers 2 and 3. Where a planned effect was too strong, too vague or touched an out-of-scope system, it was changed to the nearest in-scope effect: see "Tiers 2 and 3, as built" below.

## How progression works in a season

- **You earn XP by contributing** (revised after the first playtest; the first draft paid notches to the role that owned the work). Every act that helps earns 1 XP into one pool, whatever your role: survey, gather, work a site, build, feed, linger, light a fire, strike, defend, parley, offer, ask a boon. Moving earns nothing. A scout also earns 1 XP for each newly explored hex, walked into or surveyed.
- **A pick per `xpPerPick` XP** (14 on a full season, 5 on the dev season), tuned so a busy player gets about the same picks as under the notch rule (simulated: 1.4 each at 3 players, 1.0 at 6, per 40 steps; a human who acts all three actions a day earns far more).
- **Pick any time**, free, effective at once, kept for the season.
- **Each tree forks:** two branches of three tiers. Your first pick in a tree chooses the branch; the other closes. Mastery is three picks.
- **Multi-classing is open.** Any pick can buy another role's tier 1 (never deeper): a scout can take Bulwark, never Wide guard.
- **No combos.** No node reads who else is near or their role.

**Between seasons:** nothing for now. Later, optional: a master who came home joins the roster as a veteran with a matching trait, for one run (a sidegrade), and the archive keeps a seal per mastered branch.

## The trees

**Scout:** safe ground or far sight.

- A1 Trap sense: hidden traps are revealed, never sprung.
- A2 Long survey: survey hexes two away.
- A3 Sweep: at each tick, every hex next to you is explored for everyone.
- B1 Glints: unexplored hexes within 2 that hold something glint.
- B2 Far sight: see threats a day before they enter the window.
- B3 Forecast: threat paths show two days ahead, for everyone.

**Scholar:** quick digs or deep ones.

- A1 Field kit: working a site costs 1 action, not 2.
- A2 Steady hands: +15 % on every site.
- A3 Second chamber: a site you open gives one more find.
- B1 Lamplight: +20 % on sites tagged `dark`.
- B2 Relic sense: a find has a 1-in-3 chance of an extra `rare` material.
- B3 Old maps: each find reveals a site within 4, for everyone.

**Keeper:** tending or herding.

- A1 Good forage: gathering `food` gives 2 units.
- A2 Soothing herbs: your feeding also lowers peril by 1 (once a day).
- A3 Contented: hunger drains every second day, not every day.
- B1 Quiet linger: linger costs 1 action, not 2.
- B2 Hurry: 2 actions; the creature takes two steps at the next tick.
- B3 Beacon: fires you light reach 5 hexes and sway the creature twice as hard (whichever way it reacts).

**Engineer:** prospector or artificer.

- A1 Double yield: gathering gives 2 units.
- A2 Pack mule: your pack holds 10.
- A3 Monkey drone: gathers 1 unit a day from a node beside the creature into the stores.
- B1 Quick hands: each build action adds 2 work.
- B2 Thrift: unlocks cost one fewer of their largest material.
- B3 Self-winding: the unlock in progress gains 1 work at each tick by itself.

**Warden:** stand fast or range out (the Guardian and Envoy trees merged on 2026-11-23). Both branches hold protection and diplomacy, so the first pick chooses a style, not half the role.

- A1 Bulwark: defend reduces each strike by 3, not 2.
- A2 Silver tongue: parley gives 3 favour.
- A3 Standing guard: at every tick you ride, one of your unspent actions defends.
- B1 Ravens: parley from up to three hexes away.
- B2 Long reach: strike a threat from two hexes away.
- B3 Wide guard: your escort covers two hexes, not one.

Stand fast acts on the spot (the hex you hold, the creature you ride); range out acts at a distance. Dropped in the merge (the effect kinds `strike-bonus` stays in the rules, so it can return as a node): Skywatch (+1 strike against `flying`), Rout, Second boon, Allies, Calm words, Turncoats. A first cut had a pure shield branch and a pure word branch; Misa pointed out that the first pick would cost a Warden half the role, so the branches were re-mixed.

Trap sense, glints and double yield were inactive perks in `roles.ts`; they are now these nodes (far sight stays a perk until scout B2). Most tier 3s help the whole team.

## Tiers 2 and 3, as built

Every effect is a data hook (`SkillEffect` in `content/skills.ts`); rules read the kind and numbers, never the id. A passive effect (no action spent) is held at or below what the same character could do by hand, in the spirit of the stance principle. Changes from the plan above are marked **changed**.

| Node                                                                                                                                      | Effect as built                                                                             | Why it does not break the game                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scout A2 Long survey                                                                                                                      | Survey hexes up to 2 away, same cost (1)                                                    | Saves walking, not actions; a scout's survey was already the cheapest.                                                                                |
| Scout A3 Sweep (**changed**: two hexes, not all six)                                                                                      | At each tick up to 2 hexes next to you are explored for everyone; no XP                     | Below the 3 hexes a scout can survey by hand in a day, and earns no `exploreXp`, so it cannot farm picks.                                             |
| Scout B2 Far sight (**changed**)                                                                                                          | Glints reach 4 hexes, not 2                                                                 | Planned "see threats before the window" needs a new hidden-state view; this stays in the glints system. It shows that something is there, never what. |
| Scout B3 Forecast                                                                                                                         | Threat trails draw 2 ticks ahead, for everyone while the scout is in the game               | Information only; trails already assume the creature walks straight on.                                                                               |
| Scholar A2 Steady hands                                                                                                                   | +15 % on every site (for those who can work it)                                             | A tomb stays a gamble (0.7 to 0.85); a deep tomb with Lamplight caps at 1.                                                                            |
| Scholar A3 Second chamber                                                                                                                 | A site you open gives 1 more of its find, within the pack                                   | Sites are once-only and rare; one extra coin or alloy.                                                                                                |
| Scholar B2 Relic sense                                                                                                                    | A find has a 1 in 3 chance of 1 extra unit of a `rare` material (seeded pick)               | Expected +0.33 units per site; the pack must have room.                                                                                               |
| Scholar B3 Old maps (**changed**: the nearest one)                                                                                        | A find reveals the nearest unexplored, unrevealed site within 4, for everyone               | One survey's worth per find, never traps or nodes.                                                                                                    |
| Keeper A2 Soothing herbs                                                                                                                  | The first feeding of a day also lowers peril by 1                                           | Once a day (`care.soothedDay`), costs the food and the action; calm is worth 1 peril, a Warden's defence is worth 2 per strike.                       |
| Keeper A3 Contented                                                                                                                       | While a keeper with it is in the game, hunger drains every second day                       | The strongest team effect here: halves feeding. Tier 3, own tree only, and the creature still starves if nobody forages.                              |
| Keeper B2 Long rest (**changed** from Hurry: the creature taking two steps changes the window, the route and threat timing, out of scope) | Your linger is not blocked the day after a linger, up to `lingerChainMax` (2) days in a row | Costs the days the creature does not advance, every threat closes in meanwhile, and two days in a row is the cap.                                     |
| Keeper B3 Beacon                                                                                                                          | Fires you light reach 5 hexes and push twice as hard                                        | Still only sideways, never back; the creature's hidden reaction decides which way. Fuel and an action each time.                                      |
| Engineer A2 Pack mule                                                                                                                     | Your pack holds 10, not 6                                                                   | Carrying more still means walking it home.                                                                                                            |
| Engineer A3 Monkey drone                                                                                                                  | At each tick, 1 unit from a revealed node beside the creature into the stores               | One unit; a gather by hand gives 1 to 2 per action. Depletes the node.                                                                                |
| Engineer B2 Thrift                                                                                                                        | Starting an unlock costs 1 less of its largest material (never below 1)                     | One-off saving per unlock; the work stays the same.                                                                                                   |
| Engineer B3 Self-winding                                                                                                                  | The unlock in progress gains 1 work at each tick (once, whoever has it)                     | Quick hands adds 2 per action; this is 1 a day with no action, and needs a project started and paid.                                                  |
| Warden A2 Silver tongue                                                                                                                   | A parley gives 1 more favour                                                                | Parley still angers a wary people on a failed roll for non-wardens only; a warden never fails, so +1 shortens befriending by one parley.              |
| Warden A3 Standing guard                                                                                                                  | At every tick you ride, one of your unspent actions defends (none left: no guard)           | Spends the action a hand defend would, so equal to it and never more; does not stack with a defend action; riders only.                               |
| Warden B2 Long reach                                                                                                                      | Strike a threat up to 2 hexes away                                                          | Same strike power, only the reach grows; threats strike characters within their own reach.                                                            |
| Warden B3 Wide guard                                                                                                                      | Your escort covers 2 hexes, not 1                                                           | A bigger shelter for the party; does not touch the creature's defence.                                                                                |

Closed from the planned list because they touched systems not built (creature outfitting, a second creature step): the original Hurry, Far sight's view of threats before the window. Both can return when those systems exist.

### Balance (sim, `packages/core/scripts/balance.ts`)

200 seeds, full season of 40, careful party picking sensibly (own branch of three tiers, then other roles' tier 1), with `xpPerPick` 3 so that a party earns about 6 to 9 picks (a busy player's season); `BALANCE_SKILLS=tier1` is the old behaviour (tier 1 only).

| party              | tier 1 only (before) lost / safe | all tiers (after) lost / safe |
| ------------------ | -------------------------------- | ----------------------------- |
| careful, 3 players | 13 % / 80 %                      | 11 % / 87 %                   |
| careful, 6 players | 10 % / 84 %                      | 8 % / 90 %                    |
| careless, 3 and 6  | 100 % lost                       | 100 % lost                    |

At the real 14 XP per pick a sim party earns only about 1.6 picks (the sim does not act every action), and the result is unchanged within noise (careful 3 players 14 % lost both ways). The dev season (12 steps) is unchanged: 0 to 1 % lost.

## What it needs from the UI

- Your role emblem on the HUD fills a ring of XP toward the next pick and glows when a pick is ready.
- Tap it: the tree drawer (bottom on phones, left on desktop): the emblem as root, two branches of three icons. A closed branch fades, its path cut. Other roles are small tabs showing tier 1.
- Effects are drawn: a tag icon with a strike mark, a ring for range, a crossed action arrow for cheaper. Tips give names only.
- Arm, then confirm; a moment inks the node. Taken nodes show on your character's card for everyone.

## First slice

XP, picks, the fork, the tree drawer and the ten tier-1 nodes (each one number or an existing perk). Tiers 2 and 3 showed veiled in the first slice (they are active now). On the dev season (a pick per 5 XP) everyone makes two or three choices. Tiers 2 and 3 follow once you have felt the fork.

## Open questions

1. **Picks from work or from the route?** Work rewards investment; a pick per 10 steps for all is simpler. My pick: work, plus question 4.
2. **How hard is the fork?** My pick: the first pick closes the other branch (softer: close it at tier 2).
3. **How deep into another role?** My pick: tier 1 only.
4. **Catch-up for absent players?** My pick: everyone gets 1 XP every 10 steps.
5. **Anything across seasons now?** My pick: nothing until a real season is played.

### First slice contract

Misa approved the proposal with these picks (the first, picks earned by working, was revised by the XP pool below): the first pick in a role's tree closes the other branch for good; another role's tree only to tier 1; everyone gets a catch-up 1 XP every 10 steps; nothing carries over between seasons. (Open questions 1 to 5 above are settled this way.)

**Content** (`packages/core/src/content/skills.ts`, exported from `@behemoth-road/core`): `SKILL_NODES`, 30 nodes `{ id, name, role, branch: 'a' | 'b', tier: 1 | 2 | 3, icon, active, effect }`.

- `id` is `<role>-<branch><tier>`: `scout-a1` to `scout-b3`, likewise `scholar-`, `keeper-`, `engineer-`, `warden-`. `icon` is `skill:<id>`, so the art agent draws `skill:scout-a1` and so on (30 ids; the 10 active ones first).
- Every node is `active` (r8). A node with `active: false` and `effect: { kind: 'veiled' }` would be drawn veiled and refused (`skill-veiled`); none is now.
- The 10 active nodes and their `effect` (a data hook; the UI draws the kind, not prose):
  - `scout-a1` Trap sense `{ kind: 'trap-sense' }`; `scout-b1` Glints `{ kind: 'glints', range: 2 }`.
  - `scholar-a1` Field kit `{ kind: 'action-cost', action: 'work-site', cost: 1 }`; `scholar-b1` Lamplight `{ kind: 'site-chance', tag: 'dark', bonus: 0.2 }`.
  - `keeper-a1` Good forage `{ kind: 'gather-yield', amount: 2, tag: 'food' }`; `keeper-b1` Quiet linger `{ kind: 'action-cost', action: 'linger', cost: 1 }`.
  - `engineer-a1` Double yield `{ kind: 'gather-yield', amount: 2 }`; `engineer-b1` Quick hands `{ kind: 'build-work', amount: 2 }`.
  - `warden-a1` Bulwark `{ kind: 'defend-reduction', amount: 3 }`; `warden-b1` Ravens `{ kind: 'parley-range', range: 3 }`.

**State and view.** Every character has `skills: { xp: number, taken: nodeId[] }` (revised: one XP pool replaces the per-role `notches` record). The branch of a tree is implied by `taken`. It is part of the public view (`game.characters[].skills`): everyone sees everyone's XP and taken nodes. Nothing carries over to the next season (a new character starts at 0).

The player view response (`PlayerView`) gains a per-viewer field `glints: { q, r }[]`: the unexplored known hexes within the viewer's glints range of their own character that hold a feature (a node, site or trap, never which). It is empty without `scout-b1`. It is not in the shared `game` view and is the same kind of thing as `signs`.

**XP.** One XP per action performed (not per action point; a refused action earns none), to the actor, whatever their role: survey, gather, build, work-site (a failed attempt counts), feed, linger, light-fire, strike, defend, parley, offer and ask-boon. The amounts are data (`ACTION_XP`, 1 each). Moving and picking earn nothing. A role may earn for exploring: `Role.exploreXp` (scout 1, others 0) times the hexes the action newly explored (a survey's target, or the hex a move enters; a survey earns its act XP as well). Catch-up: at each day tick where the creature's step count reaches a multiple of `catchUpEverySteps` (10; a linger adds no step), every active character gets `catchUpXp` (1).

**Picks.** Picks available = `floor(xp / xpPerPick) - nodes taken` (`picksAvailable(state, character)`, no role argument). `xpPerPick` is 14 (the dev season on staging and local sets 5). Both numbers are in the core tuning config (`config` on the state, so the client reads them from the view).

**Action.** `{ kind: 'pick-skill', node: <nodeId> }` through `POST /api/game/act`. It costs no actions (`check.cost` 0) and works with none left. It is valid when: the node exists and is active; it is not taken; the character has a pick (XP not yet spent); the role's other branch is not taken (the first pick chooses the branch); tier order holds (tier n needs tier n-1 of the same branch); and, for a role other than the character's own, the tier is 1. A node of any role can be bought with the one pool. The result event is `{ kind: 'skill-picked', characterId, node }`. The helpers `picksAvailable(state, character, role)` and `pickRefusal(state, character, nodeId)` run on a view, so the UI can grey nodes without asking the server.

**Refusal codes** (added to `ActRefusal`; the web maps them to tips): `unknown-skill`, `skill-veiled`, `already-have` (taken), `no-pick`, `branch-closed`, `skill-tier-order`, `skill-tier-limit` (another role's tier above 1). The usual `season-over` and `character-lost` also apply.

**Effects, as built.** Cost changes show in `checkAction`'s `cost`, the chance in its `chance`, so the UI needs no rules of its own.

- Trap sense: this character entering a hidden trap's hex reveals it for everyone and it never springs (the day goes on).
- Glints: the view field above; a rider measures from the creature's footprint.
- Field kit and quiet linger set the action's cost to 1 (never raise it).
- Lamplight adds 0.2 (capped at 1) on sites tagged `dark` (the deep tomb), but only for a character who could work that site at all: a non-scholar still cannot work a tier-2 site (`cannot-work`).
- Good forage and double yield: a gather yields `max(node's own, effect amount)` for materials the effect covers, never more than the pack has room for; a gather that cannot fit even the node's own amount is still `pack-full`.
- Strike bonus (no node carries it since the merge): a strike on a threat tagged `flying` takes 1 more off. Bulwark: each defending warden riding takes 3 off each strike on the creature, not `defendReduction` (2).
- Quick hands: a build action adds 2 work (`buildWork` in the config is the base, 1).
- Parley favour (Silver tongue, tier 2): a parley gains 1 more favour. Ravens: a parley reaches the nearest settlement within 3 hexes (a rider measures from the footprint); offer and ask-boon still need your own hex.
