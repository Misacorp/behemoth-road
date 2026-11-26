# Struggling free, odds and blocked hexes: contract for the web

Content version 24. Rules are in `packages/core`. Decisions: "A pinned character struggles free", "Odds are shown for every roll" and "A blocked-hexes helper" in `decisions/product.md`.

## Struggling free

- New action `{ kind: 'struggle' }` (worker schema: strict, no fields). Cost `config.struggleCost` (1). Only a pinned character can do it: otherwise `not-pinned`; without the action `not-enough-actions`.
- A pinned character keeps the actions they have left when pinned and gets a full day at the next tick. While pinned they may only `struggle`, `set-stance` and `pick-skill`; everything else (including `wait`, moves) is `pinned`. A pinned character does not act on their stance at the tick.
- Each struggle rolls (seeded from seed, day, character and try number, so refusals cannot reroll it). Chance: `struggleChance(view, character)` (exported) = `struggleChanceBase` (0.2) + `struggleChanceStep` (0.2) times `character.struggles`, capped at 1: the fifth try always frees.
- Character fields: `struggles?: number` (failed tries under this pin; absent when none; removed when freed). `pinnedDay` as before.
- Event `struggled { characterId, freed }`. When `freed` the pin and `struggles` are cleared; there is no `dug-out` event for it.
- A dig-out by someone else still frees at once and always, and changes no actions. The old rule that a day-two dig-out restored the full day is gone (the day is already full).
- Backstop: still pinned when the day after the pin day ends, they free themselves at that tick (`dug-out` with `by: null`).
- `actionsHere` lists `struggle` for a pinned character only.
- Config (all public): `struggleCost`, `struggleChanceBase`, `struggleChanceStep`.

## Odds

`oddsOf(view, characterId, action) -> { success, failure, failureKind } | null` (exported, with type `Odds`). Works on a player view; does not check cost or reach (use `checkAction`).

| action                              | failure                    | failureKind    | null when                                                                   |
| ----------------------------------- | -------------------------- | -------------- | --------------------------------------------------------------------------- |
| `strike` on a threat tagged `falls` | striker is buried (pinned) | `buried`       | threat lacks `falls`, or unknown                                            |
| `struggle`                          | stays pinned               | `still-pinned` | not pinned                                                                  |
| `parley`                            | settlement is angered      | `angered`      | no wary settlement in reach (a warden shows 0 failure)                      |
| `work-site`                         | nothing found              | `site-failed`  | no revealed site here, depleted, or the character cannot work it (chance 0) |

Everything else returns null. Where a chance would rest on hidden information (a trap, an unrevealed feature) the answer is null, never a guess. `fallChance` stays exported (`oddsOf` strike = `1 - fallChance`). `ActCheck.chance` is unchanged and now also set for struggle.

## Blocked hexes

`blockedFor(view, subject) -> { hex, reason }[]` (exported, with `BlockedHex`, `BlockReason`, `BlockSubject`). `subject` is anything with `tags` (pass a `THREAT_TYPES` entry). Today: a `fears-fire` subject gets every hex within `fireFearRadius` of each burning fire (the fire counts through the night it burns out), reason `fire`, each hex once. `reason` is a tag-like string; later blockers add more reasons. Public data only.

## Brazier reveal

Unchanged in effect, now tested: hexes a lit brazier shows become explored exactly as if a player had explored them and stay so after the fire is out.
