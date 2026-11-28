# Research: making a world feel alive with little text (2026-11-23)

Caveat from the researcher: two searches, snippets only; points marked "confirmed" are supported by snippets, the rest is background knowledge to spot-check.

Sources: Emily Short, "Beyond Branching: Quality-Based and Salience-Based Narrative Structures" (2016-04-12); Emily Short, "Storylets: You Want Them" (2019-11-29); Max Kreminski's storylet survey (ICIDS 2018); Nate Austin, "Getting Players Emotionally Invested in Procedural Characters in Wildermyth" (GDC IGS 2022, listing only).

## Principles

1. Storylets: small, atomic, recombinable units with preconditions (confirmed). Kreminski's dimensions: how preconditions are defined, whether a storylet repeats, what it contains, how it is selected. Failbetter's "qualities" (named counters) unlock storylets. Writing scales linearly with storylet count; each piece must stand alone.
2. Salience-based selection: the system picks the most applicable piece from a pool (confirmed); suits a daily tick.
3. Alternate handcrafted and procedural layers (Wildermyth; confirmed in snippet): hand-written beats slotted around generated parts; procedural characters matter via traits, relationships and physical changes.
4. Clocks and visible pressure (Citizen Sleeper's segmented clocks; unconfirmed). The 40-day march is one big clock.
5. Simulation that leaves traces (Dwarf Fortress, Caves of Qud legends from the same tags rules use; Dark Souls messages, Death Stranding async traces; unconfirmed).
6. Sparse text works when visuals and mechanics carry the story (Journey, Inside, Tunic, Outer Wilds, Kingdom; Banner Saga's very short narration with big caravan consequences is the closest analogue; unconfirmed).

## Techniques ranked for this game

1. Tiny storylets keyed on tags and qualities: 1–2 sentences plus an icon, preconditions on tile tags, day, creature mood, party roles (e.g. a `ruin`+`night` tile with a Scholar present gives a glyph card).
2. The behemoth as a visible barometer: posture, colour, gait, sound change with hunger, trust, wounds.
3. Role-gated reveals: the same tile shows different details to Scout (tracks), Scholar (sigil), Keeper (the creature stirring).
4. Traces left by players: cairns, camp scars, worn paths persist for the season; tap shows who made them.
5. A world that moves overnight: weather fronts, migrating herds, spreading blight or bloom as tag changes; the morning map has changed.
6. Faction attitude as a spreading value per region (awe, fear, worship) diffusing by what players did; villages change banners or stay shuttered.
7. Rumours as map pins: an uncertain "?" ahead, later confirmed, refuted or twisted.
8. A generated chronicle: one sentence a day from events, posted to Discord ("Day 9. The storm turned the herd.").
9. Character stories from traits: scars and titles after events, referenced later (Wildermyth).
10. Authored landmark beats at fixed points (3–5), prose only there, at most 3 sentences.
11. Clock icons on threats and omens: a pie ring showing an omen resolves in N days.

## Pitfalls

- Content treadmill: keep the pool small (about 40–80 lines for 40 days); let systems vary things.
- Repetition fatigue: cooldowns, once-only flags, salience that penalises recent tags.
- Story fighting mechanics: storylets read and write the same tags as rules; no separate story state.
- Lore dumps: 1–3 sentences; hint, don't explain.
- Async mismatch: every storylet resolves alone or by default.
- Over-simulation: a few diffusing values, not Dwarf Fortress.
