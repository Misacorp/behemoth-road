# Changes in world bible v3

For each review point, what v3 (`world-v3.md`) did. A = adopted, Ad = adapted, D = declined (with a reason).

## Design review

| Point                                                                             | Done                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The creature's body is the Keeper's channel; no flavour postures; omens never lie | A. A list of reserved body language (2). Personality moves to the garden on its back (2.2). Omens are parked; the digest never describes the body.                         |
| Weather raises a role's value, never switches one off                             | A. Rain costs 2 timber, or 1 with the Engineer's brazier. Mist, wind and dust are parked.                                                                                  |
| Clocks count route steps, with dev overrides; the calendar is dated by step       | A. 2.9 clock table; "Homing · 9 of 40".                                                                                                                                    |
| Reach from deeds, not a timer                                                     | A, as `hunt` (2.6). Mislead no longer lowers it, so mislead can't crowd out gift and shelter.                                                                              |
| Rebuild the Hook Line                                                             | A. One multi-hex threat outside `threatsMax`, a gap as wide as the footprint, a 2-step telegraph, consistent tags, salvage, a reachable threshold (hunt 3). After the sim. |
| Replace spreading word                                                            | Ad. Parked, with your ±1 rule as the way back. The Owing's trade rule is dropped.                                                                                          |
| Engineer world hooks                                                              | A. Brazier, tending the chalk walker, the Broken Wheel, the bell, salvage, node pips.                                                                                      |
| Remove page gates                                                                 | A. Event paths count this season's fragments only, and the Reedchoir's Scholar path is a shrine inside the area.                                                           |
| Async fairness                                                                    | A. Credit rotates. Wonders share their find. The two-role Hook Line is telegraphed 2 steps ahead. Twisted rumours are another good, never a trap.                          |
| Rumour pins out-inform Glints                                                     | A. The pin covers an area; a survey or walk resolves it.                                                                                                                   |
| Build order                                                                       | A, as given (5.4).                                                                                                                                                         |
| Cut and park list                                                                 | A (2.8). Rotating walks are parked: every season is a Homing until two have been played.                                                                                   |
| First slice about 25 pieces                                                       | A. 26 (section 6).                                                                                                                                                         |
| Digest sample 4 posted a keeper cue                                               | A. Removed. Digests never describe the body.                                                                                                                               |
| "Grazed on the way" hinted at hunger                                              | A. Removed.                                                                                                                                                                |

## Canon review

| Point                                      | Done                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 `wet` clashes with swamp               | A. The tag is `rain`.                                                                                                                                           |
| 1.2 `herd` clashes with stampede           | A. `grazers`, parked.                                                                                                                                           |
| 1.3 `reach` clashes                        | A. Renamed `hunt`.                                                                                                                                              |
| 1.4 Hook Line vs threat model              | A. Approach `line`; one threat; outside `threatsMax`. The bonus is keyed on the role tag `build`, not on an unlock id (this also avoids the `rope` clash, 3.7). |
| 1.5 Clocks never reached                   | A. Steps plus dev values; hunt from deeds.                                                                                                                      |
| 1.6 New peril sources                      | A. None. The Reedchoir now costs a step; the Hook Line uses `threat:hook-line`.                                                                                 |
| 1.7 Endings are "a title only"             | Ad. The variant comes from the largest source's tag (`pursuer`, `hunger`, else the plain title). Lines are a question for Misa (Q3).                            |
| 1.8 The narrator confirms the legend       | Ad, with the editor: the hill is stated; what is inside it is disputed. Question 6.                                                                             |
| 1.9 Parking madness changes the design     | A. Question 4.                                                                                                                                                  |
| 1.10 Carry-over                            | A. Sections 2.7, 3.6 and 4.8 are marked as waiting on page Q12/Q16.                                                                                             |
| 1.11 Legacy as power                       | A. This season's fragments only.                                                                                                                                |
| 1.12 Wonders are not features              | A. An overlay layer, placed only on unexplored hexes entering view.                                                                                             |
| 1.13 Role details leak or mislead          | A. Marks on explored tiles only, each one a true fact. Table rebuilt.                                                                                           |
| 1.14 Omens look like existing signs        | A. Omens are parked; any return needs their own glyph.                                                                                                          |
| 1.15 The creature "walks faster"           | A. That line is rewritten.                                                                                                                                      |
| 1.16 Cards are lost from the 100-event log | A. A per-player `cards` table.                                                                                                                                  |
| 1.17 The offer action is stretched         | A. The rumour is free with befriending; the Owing's rule is dropped; no Caravan sale.                                                                           |
| 1.18 Tombs "crowd" the Waste               | A. The claim is gone.                                                                                                                                           |
| 1.19 Rain order; public glints             | A. Rain is checked at lighting. The husk boats are visual only.                                                                                                 |
| 2.1 The calendar does not add up           | A. One clock: route steps.                                                                                                                                      |
| 2.2 Weather tables                         | A. Rain only; every season a Homing.                                                                                                                            |
| 2.3 The Settling has no festival           | A. Kept as custom ("the quiet").                                                                                                                                |
| 2.4 Smoke columns                          | A. One per point of hunt.                                                                                                                                       |
| 2.5 "Only at the tick"                     | A. Restated: the world moves at the tick; deeds are recorded as events.                                                                                         |
| 2.6 Hook Line tags                         | A.                                                                                                                                                              |
| 2.7 "Last year" and "by spring"            | A. "Last season" and "by the Waking".                                                                                                                           |
| 2.8 Stone count                            | A.                                                                                                                                                              |
| 2.9 "Wren Long-step" can't be generated    | A. Wrena Long-step.                                                                                                                                             |
| 2.10 Names break their own rules           | A. The table is rebuilt.                                                                                                                                        |
| 2.11 "Walk" used twice                     | A. The road is "the Road".                                                                                                                                      |
| 2.12 "Five peoples"                        | A. Stated that the Wheelhouse and the Brightsmiths are not peoples.                                                                                             |
| 2.13 Lamp-down's "one night"               | A. Now husk boats for one step.                                                                                                                                 |
| 2.14 The rumour bell                       | A. Now brambles: a node that exists.                                                                                                                            |
| 2.15 Default outcomes                      | A. Each event states its default.                                                                                                                               |
| 3.1 Sanctuary or fold                      | A. The sanctuary is drawn as the Folds page (gated).                                                                                                            |
| 3.2 The Passing's plate                    | A. The Passing is parked.                                                                                                                                       |
| 3.3 Echoes are harmless                    | A. `grazers` are decoration only.                                                                                                                               |
| 3.4 What a lost season keeps               | Ad. Gated on Q12/Q16. Not re-asked.                                                                                                                             |
| 3.5 Archive or Roadbook; "seal"            | A. One name, the Roadbook. "Tied pages".                                                                                                                        |
| 3.6 Legacy schema                          | A. The additions are listed (2.7).                                                                                                                              |
| 3.7 `rope` tag                             | A. Avoided: the Hook Line reads `build`.                                                                                                                        |
| 3.8 Mist and rescue                        | A. Mist is parked.                                                                                                                                              |
| 4 Copy to change                           | A. Listed in 5.3. Captors keep one public name, "captors"; Harrowmen is cut from season one.                                                                    |
| 5 Glossary                                 | A. Used for the cut: seven names in play (section 6).                                                                                                           |

## Editor's review

| Point                                                                     | Done                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "White walker"                                                            | A. Now the chalk walker.                                                                                                    |
| Lovecraft echo                                                            | A. "Set it down; do not drop it."                                                                                           |
| Horn at Tobbin's Rest                                                     | A. Now a true name, sealed and never said, at Brackenlow.                                                                   |
| Shire names                                                               | A. Hill-folk names are rebuilt (Garrow, Brennen, Haldo, Ollen); no mown road.                                               |
| The Kindled One is stock                                                  | Ad. Parked as "the leaning fires", unnamed.                                                                                 |
| The Reedchoir are plain sirens                                            | Ad. Their want (a walker to settle in their fen) is kept from v1; names rebuilt from reed sounds.                           |
| The ten weak lines                                                        | A. Each one rewritten or cut. "Stopped chewing" was changed again to "the birds have gone quiet" (chewing reads as hunger). |
| Names drift from their rules; Ulle; Hessen                                | A. Ulle is now Larun; Hessen is gone; every name follows its rule.                                                          |
| Modern register ("window", "shouted at", "leaking out", "very beautiful") | A.                                                                                                                          |
| Legends sit side by side                                                  | A. An evidence table (five readings of the same facts), plus the feud over waking as data.                                  |
| The narrator leaks the hill                                               | A. The hill is stated; its inside is disputed.                                                                              |
| Missing lovers fragment                                                   | A. "So you will hear me when you are far away."                                                                             |
| The Caravan's code                                                        | A.                                                                                                                          |
| Lamp-down is close to living rites                                        | A. Now reed husk boats, for births.                                                                                         |
| Reedchoir names read as caricature                                        | A. Reed-sound names.                                                                                                        |

## Engineering review

| Point                                                                         | Done                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Conditions read public facts only (type and content check)                    | A. A closed `PublicQuality`; test 5.                               |
| Role, private and omen content per viewer                                     | A. A per-player `cards` table. Private cards and omens are parked. |
| Cards pass and anchor; one on return                                          | A (3.3).                                                           |
| Fired (core) separate from read (Worker)                                      | A (3.2).                                                           |
| Digest from the public view, posted after commit, no mentions, off by default | A (3.5, 5.1).                                                      |
| Misa rules on carry-over first                                                | A. Gated, citing page Q12/Q16.                                     |
| Rule-stating lines; digest and chronicle cut down                             | A. Digest is two lines; the chronicle is icons.                    |
| Tags, not ids; text module in a shared package                                | A. `pageComplete` by tag, audience by role tag.                    |
| Seeded streams for story, rumours, false pins                                 | A.                                                                 |
| Word decays in integers                                                       | Moot: word is parked.                                              |
| Storage tables, budgets, Discord post details                                 | A (5.1).                                                           |
| Sealed conditions never rendered                                              | A. Test 6.                                                         |
| Sayings never beside an omen or tip                                           | A. Endpapers only.                                                 |
| No "how to pass" view                                                         | A. Role marks on targets only.                                     |
| Smallest first slice and its tests                                            | A (section 6, 5.2).                                                |

## Player review

| Point                                              | Done                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Digests lead with the creature and end on a teaser | A. Public deeds only, never the body.                                              |
| Quiet days post nothing                            | A.                                                                                 |
| Fewer names                                        | A. Seven names in season one.                                                      |
| Progress beside the date                           | A. "Homing · 9 of 40" with the route strip.                                        |
| Name friends in traces, ribbons and legends        | A. Traces, the garden's cords and the "previously" legends name characters.        |
| Each event's way through visible on the map        | A. Every event's targets carry role marks. The Hook Line's gap shows once scouted. |
| More creature personality                          | A. The garden on its back.                                                         |
| Small jokes                                        | A. Kept: the pearls resold, the legend that credits the wrong person.              |
| Festival things to do                              | D for now. Festival rules are parked by the design review; the visuals stay.       |
| No phantom dog                                     | A. Every detail in a line must exist on the map.                                   |
| Private card as a chat starter                     | D for now. Parked until its content is defined (design review).                    |
| Garlands as a barometer                            | Ad. Cords in the garden, credited; no peril tie.                                   |
