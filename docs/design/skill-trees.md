# Skill trees: a proposal

For Misa to react to. Numbers are guesses for the tuning config.

## How progression works in a season

- **You earn notches by working.** Each action spent on work earns a notch for the role that owns it: survey (Scout), gather or build (Engineer), dig a site (Scholar), feed, linger, fire, gather food (Keeper), strike or defend (Guardian), parley, offer, boon (Envoy). Moving earns nothing.
- **A pick per 10 notches of one role** (4 on the dev season): about 6 picks in a 40-step season for a busy player, 3–4 for a light one (estimated).
- **Pick any time**, free, effective at once, kept for the season.
- **Each tree forks:** two branches of three tiers. Your first pick in a tree chooses the branch; the other closes. Mastery is three picks.
- **Multi-classing comes from your work.** Notches in another role buy its tier 1 only: a scout who keeps striking can take Skywatch, never Rout.
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

**Guardian:** hunter or warden.

- A1 Skywatch: +1 strike power against `flying` threats.
- A2 Long reach: strike a threat from two hexes away.
- A3 Rout: clearing a `pursuer` threat keeps pursuers away for 3 days.
- B1 Bulwark: defend reduces each strike by 3, not 2.
- B2 Wide guard: your escort covers two hexes, not one.
- B3 Standing guard: you defend at every tick you ride, with no action.

**Engineer:** prospector or artificer.

- A1 Double yield: gathering gives 2 units.
- A2 Pack mule: your pack holds 10.
- A3 Monkey drone: gathers 1 unit a day from a node beside the creature into the stores.
- B1 Quick hands: each build action adds 2 work.
- B2 Thrift: unlocks cost one fewer of their largest material.
- B3 Self-winding: the unlock in progress gains 1 work at each tick by itself.

**Envoy:** diplomat or schemer.

- A1 Silver tongue: parley gives 3 favour.
- A2 Second boon: a settlement you befriended grants one more boon.
- A3 Allies: friendly settlements strike a threat within 3 each tick.
- B1 Ravens: parley from up to three hexes away.
- B2 Calm words: parley with an angry settlement turns it wary again.
- B3 Turncoats: parley with a threat tagged `people`: it loses 2 strength.

Trap sense, glints and double yield were inactive perks in `roles.ts`; they are now these nodes (far sight stays a perk until scout B2). Most tier 3s help the whole team.

## What it needs from the UI

- Your role emblem on the HUD fills a ring of notches and glows when a pick is ready.
- Tap it: the tree drawer (bottom on phones, left on desktop): the emblem as root, two branches of three icons. A closed branch fades, its path cut. Other roles are small tabs showing tier 1.
- Effects are drawn: a tag icon with a strike mark, a ring for range, a crossed action arrow for cheaper. Tips give names only.
- Arm, then confirm; a moment inks the node. Taken nodes show on your character's card for everyone.

## First slice

Notches, picks, the fork, the tree drawer and the twelve tier-1 nodes (each one number or an existing perk). Tiers 2 and 3 show veiled. On the dev season (a pick per 4 notches) everyone makes two or three choices. Tiers 2 and 3 follow once you have felt the fork.

## Open questions

1. **Picks from work or from the route?** Work rewards investment; a pick per 10 steps for all is simpler. My pick: work, plus question 4.
2. **How hard is the fork?** My pick: the first pick closes the other branch (softer: close it at tier 2).
3. **How deep into another role?** My pick: tier 1 only.
4. **Catch-up for absent players?** My pick: everyone gets a notch in their own role every 10 steps.
5. **Anything across seasons now?** My pick: nothing until a real season is played.

### First slice contract

Misa approved the proposal with these picks: picks are earned by working; the first pick in a role's tree closes the other branch for good; another role's tree only to tier 1; everyone gets a catch-up notch in their own role every 10 steps; nothing carries over between seasons. (Open questions 1 to 5 above are settled this way.)

**Content** (`packages/core/src/content/skills.ts`, exported from `@behemoth-road/core`): `SKILL_NODES`, 36 nodes `{ id, name, role, branch: 'a' | 'b', tier: 1 | 2 | 3, icon, active, effect }`.

- `id` is `<role>-<branch><tier>`: `scout-a1` to `scout-b3`, likewise `scholar-`, `keeper-`, `guardian-`, `engineer-`, `envoy-`. `icon` is `skill:<id>`, so the art agent draws `skill:scout-a1` and so on (36 ids; the 12 active ones first).
- Only tier 1 is `active`. Tiers 2 and 3 are data with `active: false` and `effect: { kind: 'veiled' }`: draw them veiled, never name or describe them. The server refuses them (`skill-veiled`).
- The 12 active nodes and their `effect` (a data hook; the UI draws the kind, not prose):
  - `scout-a1` Trap sense `{ kind: 'trap-sense' }`; `scout-b1` Glints `{ kind: 'glints', range: 2 }`.
  - `scholar-a1` Field kit `{ kind: 'action-cost', action: 'work-site', cost: 1 }`; `scholar-b1` Lamplight `{ kind: 'site-chance', tag: 'dark', bonus: 0.2 }`.
  - `keeper-a1` Good forage `{ kind: 'gather-yield', amount: 2, tag: 'food' }`; `keeper-b1` Quiet linger `{ kind: 'action-cost', action: 'linger', cost: 1 }`.
  - `guardian-a1` Skywatch `{ kind: 'strike-bonus', tag: 'flying', bonus: 1 }`; `guardian-b1` Bulwark `{ kind: 'defend-reduction', amount: 3 }`.
  - `engineer-a1` Double yield `{ kind: 'gather-yield', amount: 2 }`; `engineer-b1` Quick hands `{ kind: 'build-work', amount: 2 }`.
  - `envoy-a1` Silver tongue `{ kind: 'parley-favour', bonus: 1 }`; `envoy-b1` Ravens `{ kind: 'parley-range', range: 3 }`.

**State and view.** Every character has `skills: { notches: Record<roleId, number>, taken: nodeId[] }`. A missing role in `notches` is 0. The branch of a tree is implied by `taken`. It is part of the public view (`game.characters[].skills`): everyone sees everyone's notches and taken nodes. Nothing carries over to the next season (a new character starts empty).

The player view response (`PlayerView`) gains a per-viewer field `glints: { q, r }[]`: the unexplored known hexes within the viewer's glints range of their own character that hold a feature (a node, site or trap, never which). It is empty without `scout-b1`. It is not in the shared `game` view and is the same kind of thing as `signs`.

**Notches.** One notch per action performed (not per action point; a refused action earns none), to the role that owns the work, whoever does it: survey to Scout; gather (not food) and build to Engineer; gathering a node whose material is tagged `food` and feed, linger, light-fire to Keeper; work-site to Scholar (a failed attempt counts); strike and defend to Guardian; parley, offer and ask-boon to Envoy. The mapping is data (`WORK_TAGS`, `FOOD_WORK`) read through role tags. Moving and picking earn nothing. Catch-up: at each day tick where the creature's step count reaches a multiple of `catchUpEverySteps` (10; a linger adds no step), every active character gets one notch in its own role.

**Picks.** Picks available in a role = `floor(notches[role] / notchesPerPick) - nodes taken in that role`. `notchesPerPick` is 10 (the dev season on staging and local sets 4). Both numbers are in the core tuning config (`config` on the state, so the client reads them from the view).

**Action.** `{ kind: 'pick-skill', node: <nodeId> }` through `POST /api/game/act`. It costs no actions (`check.cost` 0) and works with none left. It is valid when: the node exists and is active; it is not taken; the character has a pick in the node's role; the role's other branch is not taken (the first pick chooses the branch); tier order holds (tier n needs tier n-1 of the same branch); and, for a role other than the character's own, the tier is 1. The result event is `{ kind: 'skill-picked', characterId, node }`. The helpers `picksAvailable(state, character, role)` and `pickRefusal(state, character, nodeId)` run on a view, so the UI can grey nodes without asking the server.

**Refusal codes** (added to `ActRefusal`; the web maps them to tips): `unknown-skill`, `skill-veiled`, `already-have` (taken), `no-pick`, `branch-closed`, `skill-tier-order`, `skill-tier-limit` (another role's tier above 1). The usual `season-over` and `character-lost` also apply.

**Effects, as built.** Cost changes show in `checkAction`'s `cost`, the chance in its `chance`, so the UI needs no rules of its own.

- Trap sense: this character entering a hidden trap's hex reveals it for everyone and it never springs (the day goes on).
- Glints: the view field above; a rider measures from the creature's footprint.
- Field kit and quiet linger set the action's cost to 1 (never raise it).
- Lamplight adds 0.2 (capped at 1) on sites tagged `dark` (the deep tomb), but only for a character who could work that site at all: a non-scholar still cannot work a tier-2 site (`cannot-work`).
- Good forage and double yield: a gather yields `max(node's own, effect amount)` for materials the effect covers, never more than the pack has room for; a gather that cannot fit even the node's own amount is still `pack-full`.
- Skywatch: a strike on a threat tagged `flying` takes 1 more off. Bulwark: each defending guardian riding takes 3 off each strike on the creature, not `defendReduction` (2).
- Quick hands: a build action adds 2 work (`buildWork` in the config is the base, 1).
- Silver tongue: a parley gains 1 more favour. Ravens: a parley reaches the nearest settlement within 3 hexes (a rider measures from the footprint); offer and ask-boon still need your own hex.
