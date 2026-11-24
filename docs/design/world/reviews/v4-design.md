# Design review: world bible v4

**Verdict.** The premise works and the season-one cut is the right size. Four things need fixing first: name collisions, personality lines that spoil the Keeper's puzzle, the Tally reusing a shipped threat, and fate against progression.

## 1. Contradictions with what ships

1. **Personality spoils hidden reactions.** "Drawn to every fire" (v4:114), "sulks in rain" and "noise panics her" (v4:136) state reactions that are rolled and secret (`m4-creature.md:11`, `GAME_DESIGN.md:123`). _Fix:_ personality never names a stimulus. If one must, put it in a folk saying, which may be wrong.
2. **The Tally reuses the ambush.** `ambush` ships today (`threats.ts:137-148`: weight 0.5, forest flank only), so tagging it `hunter` puts the Tally in season one, against v4:401. `hunter` sits beside "the hunt" (the Wheelhouse). The havoc rise (v4:227) is a hidden rule. _Fix:_ the ambush stays faceless. From season two the Tally gets its own threat type, with a tag such as `culler`. Drop the havoc rise.
3. **Endings by peril tag.** Peril sources are ids (`hunger`, `threat:<type>`; `product.md:119`), not tags, and captors carry three tags. Endings are a title only (`m5-season.md:83`). _Fix:_ an `ending?` field on threat content (captors: `pursuer`), and the largest `added` source wins, the latest strike breaking ties. Record a decision that amends m5:83.
4. **Fate against the season loop and progression:**
   - The titles "Home safe" and "Home, wounded" (`apps/web/src/game/season.ts:272`) don't fit a creature that goes on. _Fix:_ the title follows fate.
   - The sanctuary holds "every creature brought home" in enclosures (`GAME_DESIGN.md:144`, `progression.md:33-43`). _Fix:_ it becomes a chart of places and ways out.
   - Veterans "came home" and return (`progression.md:22`), but v4:54 has everyone leave play, and Q2 has riders go on. If riding decides who returns, players learn to step off on the last day. _Fix:_ fate is story only. Q2: everyone watches.
   - A young creature from an earlier season "walking its own way" (v4:208) contradicts "stays".
   - "Back to its habitat" (`GAME_DESIGN.md:7`) needs rewording.
5. **Name collisions:**
   - `shape` is already the creature's build (`product.md:1113`, `GAME_DESIGN.md:26`). _Fix:_ `fate`.
   - `boon` is the settlement boon (`peoples.ts:19`). _Fix:_ `blessing`.
   - The trace "wayside shrine" (v4:196) looks like the `sunken-shrine` site (`features.ts:178`). _Fix:_ a small open gate.
   - The group is "expedition" (`onboarding.md:8`) and "party" in tips. Choose one name for the group.
6. **The boon rule (v4:231)** puts a bush on an explored hex (`product.md:279`) and reveals the comfortable band, which is Keeper-only information. _Fix:_ key it to public peril, and place it on an unexplored hex as it enters view.
7. **Old havoc "imitates a deadfall node" (v4:216).** A deadfall is a hidden feature (`features.ts:162`), and an overlay cannot be one. _Fix:_ old havoc is art, and a real node may sit under it.
8. **`heading` already exists** (`state.ts:35`, read in `creature.ts:38`). Only `leg` joins the state (v4:369).
9. **Recorded decisions still say otherwise.** "Nothing carries over" (`product.md:167`, `GAME_DESIGN.md:134`) and madness (`GAME_DESIGN.md:128,132`) need amending decisions.
10. **Inside v4:**
    - The pick happens in the Quiet, before the Stirring, yet every season is a Turning (v4:51 against v4:167).
    - The "long line" of weathered stones (v4:271) is a road in disguise. _Fix:_ one stone per waymark.

## 2. Young and old: different play?

Not until legs land. Young is today's game. Old adds only turns, and its tasks are text. That is fine under Misa's "no mechanics required". With legs, the veiled sun honestly means "turns ahead": a hint at difficulty, not an explanation.

## 3. Mechanics risks

**Rules players must learn:**

| Item              | Risk                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boons as rules    | A new rule each season (Misa's call), and it leaks care (1.6). Better: one generic rule reading a `blessing` tag and public peril.                                                              |
| Havoc             | The starving meal is fine. Cut the Tally rise. Keep walls trampled as art.                                                                                                                      |
| The hunt          | A hidden counter moved by deeds v4 never lists. It must replace part of the captors' day scaling, not stack on it. Keep the Hook Line fix (outside `threatsMax`). After the sim.                |
| Old-havoc wonders | Fine as art.                                                                                                                                                                                    |
| Leg turns         | A turn breaks "players can predict its path" (`GAME_DESIGN.md:27`) and can leave travellers outside the window at the grace day. Telegraph it 2+ steps ahead on the route strip and step hints. |
| Leg tasks         | If the creature stops for one, that is an unrequested linger. Tasks never stop it.                                                                                                              |
| Riding at the end | Never touches the roster.                                                                                                                                                                       |

**Role hooks:**

- **Scout:** later, rumour pins, old havoc, an early sight of the next turn.
- **Scholar:** still thin. Later: an old-havoc site holding a fragment only a Scholar can read.
- **Keeper:** keeps the creature's body. Protect the puzzle (1.1, 1.6).
- **Engineer:** the brazier is good. "Tends the chalk figure" (v4:222) does nothing yet: define it or cut it.
- **Warden:** strong. If havoc near a settlement ever becomes a rule, it should cost favour (visible, a Warden fix), not bring threats.

## 4. Data shape

The sketch is close. Adjust it now:

```ts
fate: 'stays' | 'goes-on';
personality: string[]; havoc: string[]; blessing: string[]; // public; never a stimulus
tier: number;
route: { legs: { share: number; turn: -1 | 0 | 1 | 'seeded' }[];
         stops?: { at: number; task: string }[] };          // art and beats only
```

- **Drop `ends`.** It is derivable, and it allows contradictions such as `stays` with a way out.
- **Stops are separate from legs.** Bellmother has three flocks; the first old kind has two legs.
- **Seed the side of a turn.** A fixed side makes every season with that creature the same.
- **Heading stays state**, and legs add a change at the tick, so a later rule ("turn after repeated veers", `m4-creature.md:42`) can turn it too.
- **Boundaries** are round(cumulative share × `routeLength`); the season still ends on `steps`.
- **Add a public `route: { leg, nextTurn | null }` to the view now**, so the client doesn't change later.
- **Legs across seasons:** keep the leg index in legacy.

Legs then become data plus one tick step.

## 5. Season-one cut

Right size and order: traces, then beats and endings, with legs last. Tweaks:

- **Terrain beats** fire when the footprint first touches the tag. At radius 6, all five are in view on day 1 and would queue behind the 2-a-day cap.
- **"Greyfold in sight"** fires at fraction 0.9, with a mark on the route strip, because the map draws no destination.
- **Traces:** "broken stakes" needs a source event. Store traces as they happen, since the log keeps only 100 events.
- **Calendar:** fix the season name, or show "9 of 40" only.
- **Ending keys:** `${kind}.${outcome}`, then the title. Add fate with the second kind.

## 6. Top 6 changes, ranked

1. Protect the Keeper's puzzle (1.1, 1.6).
2. Fix the collisions (1.5, the `hunter` tag).
3. Leave the ambush faceless; the Tally gets its own threat in season two (1.2).
4. Fate never touches veterans; the sanctuary becomes a chart (1.4).
5. Make the endings explicit (1.3).
6. Fix the route data and telegraph turns (4).
