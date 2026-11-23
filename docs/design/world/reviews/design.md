# Design review: world bible v2

Numbers are checked against `packages/core/src/config.ts` and the content files.

**Verdict.** The storylet spine, traces, digest, wonders and rumours fit the game. The rules layer adds about 15 rules players must learn untold, and several don't work at current numbers. Ship story and traces first; gate rules behind the balance sim.

## 1. Does story serve play?

| Item                                                | Verdict                                                                  | New rule?          |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| Beats, endings, waymarks, region firsts             | Rhythm and payoff                                                        | No                 |
| Traces                                              | Decoration that works: the morning map shows who did what                | No                 |
| Digest, credit, Roadbook                            | Social glue for async play                                               | No                 |
| Wonders                                             | **Decision**: a visible clock poses "detour now?"; reuses existing rules | Light              |
| Rumour pins                                         | **Decision**: spend a coin, send someone                                 | Yes                |
| Rain                                                | **Partial decision**: light the fire on the dry side                     | Yes                |
| Wind, mist, dust                                    | Wind is a big swing; mist blocks the Scout; dust is minor                | Yes, three         |
| Omens                                               | Mostly decoration: the front is visible 2 to 4 days out anyway           | Yes, at 80 % truth |
| Herds as stimulus                                   | Steering noise players can't control                                     | Yes                |
| Word spreads                                        | **Inert** (section 2)                                                    | Yes, hidden        |
| Garlands                                            | Duplicates the peril gauge                                               | No                 |
| Reach                                               | **Decision** if driven by deeds; a timer if by days                      | Yes                |
| Festivals                                           | Charming, but each carries a temporary rule                              | Yes, three         |
| Events (Reedchoir, Kindled One, Passing, Hook Line) | **Decisions**                                                            | Yes, four          |
| Private role cards                                  | Talk only if a card holds usable information; content undefined          | Unclear            |
| Sealed entries, "previously", old traces            | Decoration; depend on progression                                        | No                 |
| Place names, sayings, calendar, legends             | Cheap, good decoration                                                   | No                 |

**Key conflict: the creature is the Keeper's signal channel.** The m4 puzzle reads its body: head turn, flinch, stillness, lying down, droop. The bible adds meanings to the same body: omens (lies down, turns its back, goes still), role details (lowers its head, ears turn, sniffs, watches the hills) and garlands. "Lies down" is already the linger pose; "goes very still" reads as the indifferent cue. A Keeper can't tell flavour from data. A 20 % false omen teaches the team the creature lies, against "the team must trust the keeper's reading". Digest sample 4 ("ears are turned that way") posts a keeper-only cue to the channel.

## 2. Balance and pacing risks

- **Clocks count days; the dev season is 12 steps.** Front, reach and private-card clocks (7 to 8 days) and word's 10-day halving barely run, and reach never gets to 5, so Misa never sees the Hook Line on staging. Lingering pushes a season past 40 days ("forty-fourth of the Homing").
- **Rain switches off the Keeper's only lever** for 2 to 4 days about every 8. Two events rely on fire. Mist switches off the Scout's survey and glints. A role with nothing to do is a dead day.
- **Wind:** a doubled push at `stimulusPull` 6 weights the step 36 to 1, and anyone can light a fire. Simulate first.
- **Reach doubles time scaling.** Chance and strength already grow by day. Captors are 25 % of threat weight; reach 4 makes them 40 %, the strongest threat from behind. Mislead now also takes 2 reach, so it dominates gift and shelter.
- **The Hook Line is never reached or broken:**
  - On the timer, reach hits 5 around day 40, the route's end.
  - The footprint is 3 hexes wide; a one-hex decoy gap doesn't let it through, and a fire moves it one hex.
  - 3 or 4 hook threats collide with `threatsMax` 3.
  - Its `staked` and `pursuer` tags don't match.
  - The grappling hook is a team unlock: "an Engineer with the hook" is ambiguous.
- **Word spreads never fires.** Settlements appear about 10 steps apart, 6 hexes ahead. A befriending plus boon (+3) at the last one, about 10 hexes and 5 to 10 days back: 3 × 2^-2.5 × 0.6 ≈ 0.3, against a threshold of 2. It would touch at most 3 settlements a season anyway, too few to learn.
- **Omens** compound noise: the creature's turn already misleads non-keepers.
- **The Owing:** forage becomes a trade good, so anyone gathers and offers it for 2 favour, risk-free, equal to a Warden's parley. Not a stance-principle breach, but its intent (the specialist stays best).
- **Herds:** the stampede threat is already tagged `herd`, and a second stimulus opens the opposed-stimulus case m4 left for later.

## 3. Async pitfalls

- **Spoilers.** The digest must never describe the creature's body (fix sample 4). "Grazed on the way" hints at the creature's hidden hunger.
- **One active player consumes beats.** Route beats are safe; rumours, a wonder's single fragment, limited charges and lore finds go to whoever arrives first. Digest credit will name the same busy player daily.
- **Sequenced roles in one day.** The Hook Line telegraphs one day ahead and needs Scout then Keeper. Once-a-day players miss it.
- **Absent players.** An event's default is failure. The Scholar's Reedchoir path needs a complete page (6 to 8 of 20 fragments found a season): dead.
- **Catch-up** (3 return cards, rest in the Roadbook) is good.

## 4. Role hooks

- **Scout:** strong. But rumour pins showing a category out-inform Glints; pin a 2-hex area so a survey resolves it.
- **Scholar:** rich in lore, thin in play. Nothing in the Hook Line or Passing; Reedchoir path gated.
- **Keeper:** overloaded (omens, herds, three events), and rain takes its lever.
- **Engineer:** **weakest**. Two role-detail cells and one ambiguous hook; no world item uses crafting.
- **Warden:** strong (word, reach, mislead, pearl, boons, escort). Watch mislead dominance.

## 5. Scope

**Order:**

1. Traces (art only, no engine).
2. Beats and endings on a _thin_ engine: conditions, once-only, daily cap. Salience and recency wait until the pool passes about 30 cards.
3. Digest, once Misa says yes.
4. Wonders: decisions, no new rules.
5. Roadbook.
6. Rain, with an Engineer counter, after the sim.
7. Rumours.
8. Reach from deeds only.

Hook Line and word come after the sim.

**Cut or park:**

- word (or replace it, change 6), garlands, herds as stimulus, 80 % omens;
- wind, mist and dust; festival _rules_ (keep the visuals); private cards until their content is defined;
- the Kindled One (overrides the learned nature) and the Passing (a threat band is new behaviour);
- sealed entries, "previously" and old traces until progression is approved. GAME_DESIGN §8 says nothing carries over from a failed season, yet there is a lost-season opener;
- rotating walks: keep every season a Homing until two are played.

**Volume.** 150 pieces and 3,500 words is easy to _write_; the real cost is **art and condition QA** (every card, trace, front, pin, wonder, seal and role mark is drawn). A first slice needs about 25 pieces (12 beats, 4 endings, about 10 digest templates), not 70.

## 6. Top 8 changes, ranked

1. **Keep the creature's body for Keeper signals.** No flavour posture that looks like a cue. Omens, if kept, are always true for Keepers and ambiguous for others. The digest never mentions its body.
2. **Weather raises a role's value, never switches one off.** Rain: fires cost 2 timber, or need an Engineer-built brazier. Mist: hide threat paths from non-scouts instead of blocking surveys. Simulate wind first.
3. **Count world clocks in route steps or fractions**, with dev overrides, and date the calendar by step.
4. **Reach from deeds, not a timer.** Rerun `balance.ts`; check the boon mix.
5. **Rebuild the Hook Line:** one multi-hex feature like the rockslide, outside `threatsMax`; a gap as wide as the footprint; 2-day telegraph; consistent tags; salvage iron; a reachable threshold.
6. **Replace word spreads** with "the last settlement's outcome sets the next one's starting favour ±1": visible, learnable, a Warden hook. Drop the Owing's trade rule.
7. **Give the Engineer world hooks:** salvage, a rain-proof brazier, the Kindled bell as an unlock, wonders that need a built item. Remove page gates from event paths.
8. **Make async play fair:** digest credit rotates (a penalty for the recently credited); a wonder shares its find with everyone; two-role sequences telegraph 2+ days; twisted rumours are a different good, never a trap.
