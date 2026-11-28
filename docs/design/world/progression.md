# Lasting progression between seasons: a proposal

For Misa to react to. Numbers are guesses for the tuning config. It would supersede "Nothing carries over between seasons [Misa]" once a real season has been played; until then nothing ships.

**The rule:** variety and memory carry over, never raw power. Every season starts every character at 0 XP with empty packs and stores.

## 1. What persists

**Shared, per Discord server (the guild's legacy):** the season record (creature, outcome, days, who took part), the sanctuary, the archive, and unlocked pools (creature types, tiles, encounters that may now appear).

**Per player, within that server:** their roster, their cosmetic marks (pins, banner stripes), and counts of seasons played and objectives done.

**Never:** XP, skill picks, items, materials, favour, a creature's learned reactions, anything that makes a run easier by number.

## 2. Roster

The join drawer today offers two or three rolled characters and a plain one. Your roster adds your unlocked characters as extra cards. A fresh roll is always still there: more choice, not more strength.

**How characters unlock:**

- **Recruits (main source).** Completing your personal objective (section 5) unlocks a named person met on the road: a hill guide, a tomb-cutter, a ferrier. Their trait matches the deed (a scout who explored the high ground unlocks a `sure-footed` guide); their quirk is rolled.
- **Veterans (later).** A character who mastered a branch and came home may return once, as `skill-trees.md` suggests: same face and trait, plus a second quirk from the road (helps and hinders). They start at 0 XP like everyone.
- **Milestones** (first homecoming, five seasons played) give looks only.

**What a roster character brings:** a trait and quirk known in advance, a look of their own (a cloak colour, a trinket from the deed) and their line in the archive. Traits and quirks have no mechanics yet; when they do, they stay sidegrades.

**One run each.** Fielding one spends it. Afterwards it retires (home) or is lost (failed season), like any character. A retiree leaves a small portrait beside the creature it brought home.

**Cap:** `rosterMax` (4) per player; the oldest unpinned card fades when a fifth arrives.

## 3. Sanctuary

Every creature brought home joins the server's sanctuary.

- **Safe:** it stands there in full health and unlocks the next creature tier.
- **Wounded:** it joins scarred or bandaged, and still unlocks the next tier.
- **Lost:** an empty plinth with its silhouette and the day it was lost. No unlock; the same type may be offered again.

**What it changes:**

- **Creature options.** Creature types gain a `tier`. The next season offers types from the lowest tier not yet brought home, plus one from the tier above once the current tier has a homecoming. Difficulty grows with the sanctuary.
- **Echoes.** A homed creature's kind may appear later as a harmless wild herd on the map (variety, a story beat). Rules read its tag, never the id.
- **A sanctuary page.** A drawer (phone: the bottom drawer; desktop: the left) shows each creature in a painted enclosure with the team's emblems and its route strip. Tap one: its season recap, and what the team learned about it (fire draws it) as icons. Reactions are rolled per game, so a returning type may differ: memory, not an answer key.

## 4. Archive

Shape only; the story writer fills it.

- **Kinds:** `lore` (a fragment), `relic` (a found object), `seal` (a mastered branch, one per branch per server), `artifact` (a rare relic that unlocks something).
- **Sources:** public events only: a rare find, a boon, a settlement befriended, a branch mastered, a homecoming.
- **Cosmetic unlocks:** a banner, a map border, a hat for a recruit.
- **Variety unlocks:** an artifact turns on a content pool (a site, tile type or encounter with `weight` 0 until unlocked). The balance simulation runs with every pool on, so no unlock shifts the difficulty.
- An empty slot shows a silhouette and a faint tag mark, never what it does.

## 5. Personal objectives

One per character per season; at join the player picks one of two cards for their role. Each is a counter over public events, like the recap tallies in `stats.ts`, so nothing hidden leaks. None is competitive, so nobody gains by taking a teammate's work.

- **Scout:** explore 30 hexes; be first into 3 sites; explore every terrain in the window.
- **Scholar:** open 3 sites; open a `dark` site; bring back a `rare` material.
- **Keeper:** feed on 6 different days; linger twice; gather 8 food.
- **Engineer:** gather 15 units; put 10 work into unlocks; finish an unlock.
- **Warden:** turn back 3 threats; defend on 4 days; befriend a settlement.

**Shown as** a sigil on your character card and beside your role emblem: the deed's icon (a hex, a spade, a bowl) with pips filling. Done: a small moment, the sigil turns gold.

**Reward, on homecoming only:** the objective's recruit joins your roster, and your figure gains a pin.

## 6. Season flow

1. **Ending** and **recap** (as built); the recap adds each player's sigil, gold or not.
2. **Homecoming** (new): cards turn one by one: the creature walks into the sanctuary (or the plinth stays empty), new archive entries, your recruit and pin. Tap through; skip at the top right.
3. **Rest:** `restDays` (2) ticks with no game; the map shows the sanctuary.
4. **Next creature:** two veiled creatures (silhouette, tier marks, tag icons). Each player taps one; most taps win, seeded tie-break, seeded pick if nobody votes.
5. **New season** at the next tick, new seed; players join from offers plus roster.

Staging and local keep the admin new-season button; it harvests and skips the rest.

## 7. Data and storage

**Core (pure):**

- Content: `OBJECTIVES` (`{ id, role, icon, counter, target, recruit }`), `RECRUITS` (`{ id, name, trait, quirk, look }`), `ARCHIVE_ENTRIES` (`{ id, kind, icon, unlocks? }`), `tier` on creature types.
- Each character gains `objective: { id, progress }`, updated from events.
- `harvestSeason(state, legacy) -> { legacy, grants }`: reads only an ended season; same inputs, same result.
- `nextCreatureOptions(legacy, seed)`: the two veiled offers.

**The guild's Durable Object, beside the game row:**

- `legacy` (one row): JSON `{ schema, seasons[], sanctuary[], archive[], pools[] }`.
- `roster`: `user_id`, `character_id`, JSON, `status` (`ready`, `fielded`, `retired`, `lost`).
- `harvests`: `season_id` primary key, written in the same transaction as the new game, so each season is harvested once.

**Surviving the content wipe:** the wipe replaces only the `game` row, as `players` already survives it. Legacy has its own `schema` number and real migrations (small and precious, unlike the game). Content ids are plain strings; an id the content no longer knows is kept, shown faded and never offered. A game wiped mid-season is not harvested. A deliberate reset follows the rule for destructive one-offs (backup, staging dry run).

**Smallest first slice:** the season record and the sanctuary. `harvestSeason` stores outcome and creature; new season calls it; a drawer shows creatures safe, wounded or as an empty plinth. No objectives, roster or archive yet. It proves storage, harvest and wipe-survival with almost no rules.

**Tests:**

- Core: harvest for safe, wounded and lost; a running season is refused; deterministic; no grant feeds a rule number.
- Objectives: each counter moves only on its public event; a refused action moves nothing.
- Worker: new season and the outdated-game replacement keep legacy; a second harvest is a no-op; an unknown id loads and is skipped in offers; no legacy response carries a seed or hidden facts of a running season.

## 8. Questions for Misa

1. **Does a lost season keep anything?** My pick: only the plinth and the record; objectives count only on a homecoming.
2. **Can a character return?** The design retires them; `skill-trees.md` floats veterans. My pick: recruits first; veterans later, once, with a second quirk.
3. **Who picks the next creature?** My pick: everyone taps one of two veiled creatures during a two-day rest.
4. **Is a roster yours or the group's?** My pick: yours; it keeps the objective personal.
5. **Does the legacy survive pre-release wipes?** My pick: yes, in its own tables; you can still order a reset.
6. **Objective dealt or chosen?** My pick: choose one of two at join.
