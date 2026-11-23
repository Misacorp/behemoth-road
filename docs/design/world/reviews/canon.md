# Canon review: world bible v2

`v2:N` is a line in `world-v2.md`. Repo paths are on the staging branch.

**Status:** five things need fixing before any build: the `wet` tag, the name `reach`, the Hook Line's threat model, peril sources and endings, and a narrator who confirms the legend.

## 1. v2 against the shipped rules, content and decisions

1. **`wet` is already the swamp's tag.** v2:94-95 against `terrain.ts:29` and `stimuli.ts:34`. Adding `wet` to fire's `notOn` would ban fire on every swamp for good. _Fix:_ the front's tag is `rain`.
2. **`herd` is already the stampede's tag.** v2:102 against `threats.ts:91`. _Fix:_ `grazers`.
3. **`reach` already means a threat's strike distance** (`threats.ts:37`). v2:117 and 431 use it for the Wheelhouse, and v2:376 uses both meanings in one line. _Fix:_ rename it `hunt`.
4. **The Hook Line breaks the threat model.** 3 or 4 hexes is more than `threatsMax` 3 (`m5-season.md:17`); no approach kind lays a line (`threats.ts:13`); "with the grappling hook" (v2:377) reads an unlock id, not a tag. _Fix:_ one threat over several hexes; approach `line`; key the bonus on an unlock tag `hook`.
5. **The hunt clock never gets there.** At +1 every 8 days it reaches 5 on day 40, which is the route's end (`m5-season.md:57`). On the 12-step dev season it reaches 1, so staging never shows `reach.three` or the Hook Line. The same goes for fronts (8 days), private cards (7) and cooldowns. _Fix:_ count in route fractions.
6. **New peril sources.** `m5-season.md:52-55` is "the complete list", and `stats.peril.added` keys only `hunger` and `threat:<type>` (`product.md:115`). v2:351, 360 and 378 add peril from events. _Fix:_ a source `event:<id>`, peril tips, and an amended decision.
7. **Endings are "a title only"** (`m5-season.md:83`). v2:383-386 adds lines, and "Lost" has only captor and hunger variants, though peril comes from six threat types and the events. _Fix:_ pick the variant by the largest source's tag (`pursuer`, `hunger`, else a plain "Lost"), and record the change.
8. **The narrator confirms the legend.** v2:13, 26 and 465 say it is never confirmed, but the endings (383-384) and "Previously" openers (390-391) say "a new hill" in the narrator's voice. _Fix:_ "the hill folk say…".
9. **Parking madness changes the design** (v2:18, 455 against `GAME_DESIGN.md:128,132`). It needs Misa's amendment.
10. **Carry-over.** Fragments "across seasons" (v2:208), sealed entries (212) and the lost-season opener (392) go against `GAME_DESIGN.md:134` and `product.md:159-163`. Only section 2.8 is gated on the progression proposal. _Fix:_ gate sections 3.6, 3.7 and 4.8 the same way.
11. **Legacy as power.** At v2:350, a page completed in an earlier season opens a way through, which breaks v2:145 and `progression.md:13`. _Fix:_ count this season's fragments only.
12. **Wonders, the altar and old traces are not features.** Features are hidden and one per hex (`features.ts:2-3`), and explored hexes never gain one (`product.md:275`). v2:131, 148 and 357 put visible, timed things on hexes. _Fix:_ an overlay layer, placed only on unexplored hexes entering view.
13. **Role details leak or mislead** (v2:220-221). "A light deep down" is a hidden shrine; "good stones" is a hidden node; "net-marks" point at a settlement that does not exist yet (`m5-season.md:39`). "Pale metal" promises alloy in a tier-1 tomb, which finds coin (`features.ts:94`), and "robbed before" is false. _Fix:_ explored hexes only, each mark tied to a true fact.
14. **Omens look like existing signs.** "Lies down early" is the linger pose (`m4-creature.md:67`), and "very still" is the keeper's unmoved cue (`m4:21`). _Fix:_ own poses and glyph.
15. **The creature never "walks faster"** (v2:252). It always walks one hex a day (`GAME_DESIGN.md:27`).
16. **Cards can be lost.** They play from the event log (v2:430), which keeps 100 events (`m3-chain.md:50`), so a player away for days loses them. _Fix:_ keep unseen cards per player.
17. **The offer action is stretched.** Buying a rumour (v2:125) and offering forage at the Owing (324) both use it, but offer is for wary settlements only and buys favour (`m5-season.md:41`). The Caravan is not in `PEOPLE_TYPES`. Is the rumour on top of the one boon (`peoples.ts:7`)?
18. **Tombs do not "crowd" the Glass Waste.** They also spawn on `open` (`features.ts:91,102`), and plains are about 70 % of the map (`generation.ts:7`).
19. **Rain: unstated order.** Does the front move before the fire acts (`m4:35`)? Lamp-down's public glints (v2:331) need a new public field; glints are per viewer today.

## 2. Inside v2

1. **The calendar does not add up.** A walk is 40 days (67), but seasons end by steps. Lingers add days (`product.md:641`) and losses end a season early, so day 41 has no date. Production dates by day while dev dates by fraction (67); waymarks "at the end of each ten" (42) could mean days or steps. _Fix:_ one clock, route fraction.
2. **Weather.** There are only four front kinds (94), so the Wander's heat and thunder and the Settling's still air have none. The pick starts in the Homing (459), whose table is wind and dust, yet rain ships first (442) and digest 2 (281) rains in the Homing.
3. **The Settling has no festival**, but Q1 promises one per walk.
4. **Smoke columns.** One per two points (116) gives three only at 6, but `reach.three` (270) shows three at 3.
5. **"Only at the tick" and "no separate story state"** (86-87) are broken by deeds, garlands and rumours resolved at action time (109-125) and by `StoryState` (424).
6. **Hook Line tags.** The effect tags `pursuer` (376); the bonus reads `staked` (377).
7. **"Last year" and "this year"** (264, 390) are wrong when seasons are one walk apart. "By spring" (383) fits a Homing ending only.
8. **Stone count.** "Four stones … added a fifth" (264).
9. **"Wren Long-step"** cannot be generated (`characters.ts:62` always joins a start and an ending). Use "Wrena".
10. **The names table breaks its own sound rules** (50-54): Dilly, Ilvi, Brisk, Dasko, Aiwe.
11. **"Walk"** is the calendar unit (60) and the green road (40). Rename the road.
12. **"Five peoples" (9)** sits above a table of seven groups. Say that the Wheelhouse and the Brightsmiths are not peoples.
13. **Lamp-down's "one night"** (330), while day and night are out of scope (454).
14. **`rumour.twist.bell` (275).** `trade` is not one of the `about` kinds (123), and a bell is not content.
15. **"Resolves by default" (174)** must say whether the default is passed or failed, per event.

## 3. Against the vehicles and progression proposals

1. **Sanctuary or fold.** In `progression.md:35-43` creatures stand in enclosures, wounded ones bandaged; the world lays them down in their own fold. _Fix:_ the sanctuary is the _Folds_ page, one rise per creature.
2. **Next creature.** It is a vote between two veiled offers (`progression.md:74`), yet the Passing's plate shows "next season's creature" (v2:369). _Fix:_ the plate shows one of the offers.
3. **Echoes.** They are "harmless" (`progression.md:42`), but v2 herds steer the creature and strip bushes (103).
4. **What a lost season keeps.** "Only plinth and record" (`progression.md:106`), against v2:151 and 392 and v1's Q2. Pick one.
5. **Archive and Roadbook** are one thing; name it once. "Seal" means a mastered branch (`progression.md:49`) and a wax-sealed entry (v2:212). Rename one.
6. **The legacy schema** (`progression.md:90`) lacks the walk, the Threshold stones, the Wheelhouse tally, old traces, legacy facts and the chronicle. The rest days (`:73`) need a place in the calendar.
7. **Tags.** The tow line's `rope` (`vehicles.md:75`) is also the grappling hook's tag (`items.ts:52`), so the Hook Line rule needs `hook`.
8. **Mist** (v2:95) blocks surveys, which rescue routes rely on (`vehicles.md:48`). Intended?

## 4. Copy to change

- `tips.ts:225`: "Captor bands lose the trail" becomes "Pursuers…" (it also clears the Hook Line).
- `tips.ts:296, 398` with `threats.ts:45`: "Captor band" or "Harrowmen"? One public name.
- `tips.ts:131, 322`: "burns until the day turns" is false under rain. Add a `why:` line: "Too wet for a fire."
- `tips.ts:391` (peril): "strikes and deep hunger" misses event peril.
- `tips.ts:355, 404`: the day and route tips need copy for a calendar date and waymarks.
- `tips.ts:46`: "six emblems" should be five.
- The group is "party" (`tips.ts:431-440`), "expedition" (the practice) and "company" (v2). Choose one.
- `intro.ts:14` and `hints.ts:150` say "at dusk", but the captors ending says "before dawn" (v2:385). Change v2.
- Each new icon needs a tip (`tips.ts:17`): fronts, omens, herds, pins, wonders, traces, the clock, garlands, waymarks, the Hook Line, cards, the Roadbook and event peril.
- New first-sight hints need new `SEEN_IDS` and a higher limit than "1 to 7" (`onboarding.md:20`).
- The returning recap (`onboarding.md:11`) and the three return cards (v2:181) are two catch-ups; set their order.

## 5. Glossary

- **Behemoth Road**: the game. "Behemoth" is the interface's word only.
- **Long Country**: the land of low, rounded hills.
- **walker**: the world's word for the creatures.
- **The Walk**: the green road no one owns (rename suggested).
- **Under-One**: the hill folk's sleeper beneath the land.
- **Ulle**: the river folk's sleeper downstream.
- **first walker**: the oldest walker, given no shape.
- **Tobbin's Rest**: the hill-folk village with the waking horn.
- **Coldhollow**: a hill the Wheelhouse dug to bedrock.
- **Heelmere / Stone Tarn**: one lake, hill-folk and Wheelhouse names.
- **the Threshold**: the last waymark, a spring and cairn before the fold.
- **Greenfold**: the Mossback's fold.
- **Tallgrass, Hushwood, Glass Waste, Slow Water, Fen**: the regions (plains, forest, desert, rivers, swamp). The Shelves is v1 only.
- **the Hush**: the Hushwood's flameless night.
- **the Ribs**: a fallen walker's bones with a temple inside.
- **Hill folk, River folk, Mothfolk, Glass Caravan, Reedchoir**: the five peoples.
- **Wheelhouse**: the mill city that feeds nine towns.
- **Harrowmen**: the Wheelhouse's beast-takers.
- **Brightsmiths**: the ancients who made the collars and the alloy.
- **Grandfolk, Ulle's children, bearers, lodes, the lost ones, draught, the bound**: each group's word for walkers.
- **Tobbo, Marrow, Hessen, Dilly / Lessai, Orun, Ilvi, Merrai / Thess, Hesh, Sill, Ith / Kettar, Tamek, Brisk, Dasko / Ooa, Leeul, Aiwe**: name samples, by people.
- **Master Cogan, Hookwife Tallow, Second Wright**: Wheelhouse names. **Three-Strokes, Ring-and-Bar**: Brightsmith hammer marks.
- **the Waking, the Wander, the Homing, the Settling**: the four walks of 40 days.
- **first ten, long ten, lean ten, last ten**: the tens of a walk.
- **the Owing, Lamp-down, the Whitening**: festivals (hill folk in the Homing, river folk in the Wander, hill folk in the Waking).
- **The Reedchoir, The Kindled One, The Passing, The Hook Line**: events. **Far-eyed**: parked.
- **Roadbook**: the campaign book.
- **The Bright Collars, What the Water Keeps, The Folds, The White Ground**: Roadbook pages.
- **Mossback, Thornstag, Bellmother**: creature kinds.
- **Juno, Kai, Rin, Ode**: sample Discord names. **Wren Long-step**: a sample character.
- **Scout, Scholar, Keeper, Engineer, Warden**: the roles. **Discord**: the digest's channel. **Misa**: the owner.
