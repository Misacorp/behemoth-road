# Behemoth Road: world bible v4.1

A proposal, 24 November 2026. It revises v4 after three reviews (design, editor, player); v4 stays as it was, and `changes-v4.1.md` lists every point. Every name, line and number is content: data the game can grow, change or drop.

## 0. What changed from v4

- **The Keeper's puzzle is protected.** No personality line, sound, habit or blessing names a stimulus or shows hunger. Claims like "it follows smoke" live only in folk sayings, which may be wrong.
- **Shipped names are respected.** The creature's `fate` (not `shape`, which is its build), its `blessing` (not `boon`, which is a settlement's), and an open-gate trace (not a "shrine", which is a site).
- **The ambush stays faceless.** The destroyers, now the **Reckoners**, get their own threat from season two. The havoc-driven rise is cut.
- **Endings are explicit:** chosen by peril source id, through an `ending` field on threat content. Misa's "endings get a line each" amends m5's "a title only".
- **Fate is story only.** It never touches the roster, veterans or the sanctuary, and the sanctuary becomes a chart.
- **The route data is fixed:** legs with seeded turns, separate stops, and a public turn telegraphed 2 or more steps ahead.
- **The calls stay unconfirmed.** Word of two held creatures sets the pick; members claim a call afterwards.
- **Each kind has a sound, a habit and one moment of delight**, all in channels the Keeper doesn't read. Four kinds are renamed.
- **Season one opens on a jailbreak**, with one Wheelhouse face and the party in every ending.

**Decided by Misa** (unchanged): no Discord digest; a line for each ending; madness parked; rain makes fire dearer after the sim; lore kept after a lost season; wipe before release; personal rosters; recruits first, veterans later at baseline; a vow chosen from two; the next creature picked by everyone from two veiled options; regions named by terrain; the tow line needs the player's own grab; absent players don't interact.

## 1. The premise

### What the narrator states

Creatures are enormous, rare and impossible to miss. Everyone has seen one or knows someone who has, and nobody has counted them. The narrator states five things:

1. A young one is first seen far from anywhere, already grown, and often already old in the way of trees: the moss on the first one is older than the village that saw it.
2. It walks toward one place as if it had been there before, and cannot be turned from it for long.
3. Things grow on it as it goes.
4. Where a young one stays, the land around it changes within a few years.
5. An old one walks to the edge of what anyone knows and is not seen again.

Everything else is somebody's story.

### Young and old (fate)

- **Young creatures stay.** Each goes to the place it is meant for: a valley, a mountain, a dry lake, a pass. The place is waiting for its kind; without one it never blooms, or slowly fails. When the creature arrives it lives there, and the place comes alive around it.
- **Old creatures go on.** Each kind leaves the world by its own way out: a shingle bank where the tracks stop halfway to the water, a high col, a dry well. On the way it stops to do a last few things (let a flock go, break its horns on a stone, rain on a valley). These stops never halt it.

The veiled card shows a sprout or a setting sun. With turns in play, the sun honestly hints "turns ahead". The first creature, the Mossback, is young: one leg, no turns.

### How a creature ends up held

Creatures can't be turned for long, so anyone who wants one waits where it must pass. **The Wheelhouse's captors** follow the Caravan's sighting maps, stretch chain across a gap the creature has to cross, and walk it home in a collar. Others are held too: a village fences one in for its blessing, a creature mires in a gorge, a herd blocks a pass. In tier one, every season starts at a Wheelhouse pen. Later seasons can start anywhere a creature is held.

### The old law and the Open Gate

> Where a creature walks, no gate stays shut.

Even the Wheelhouse says the law is older than bread, and then explains why it doesn't cover pens.

**The Open Gate** is a company with no people of its own, drawn from all of them. It opens what holds a creature, walks beside it, and writes down who walked.

- **The calls.** Many members say a creature called them, once, in winter. Many joined without one, and plenty doubt it. The narrator never says.
- **The pick.** Between seasons, word reaches the Gate of two held creatures. The two veiled options are those two. Afterwards, someone always says they heard the one you chose. _Two held, and one Gate. It can open only one._
- **Recruits** are people met on the way who join the Gate (your personal roster). **Vows** are your personal objective, chosen from two.
- **Fate is story only.** The party watch an old creature go on, and leave a young one in its place. Either way the characters leave play as now, and nobody's roster changes.

### Who wants what

|            | Harness                                                                                                                                                                    | End                                                                                     | Help                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Who        | the Wheelhouse                                                                                                                                                             | the Reckoners                                                                           | the Open Gate                                                   |
| Why        | a penned creature tramples no village and turns wheels that feed nine towns. The cost: its place is still waiting, and the Glass Waste is what waiting too long looks like | when one place blooms for a creature, another gives way, and they have lost homes to it | the law; a creature tended well does little harm and great good |
| On the map | captors (shipped)                                                                                                                                                          | their own threat, season two                                                            | you                                                             |

**The Wheelhouse** is millers and bakers. They give every creature in the pens a name and know what each one eats. Their collars are old metal (the alloy from tombs), worked out by smiths nobody remembers, and they wear them well. Creed: _bread doesn't ask what turned the wheel._

**The Reckoners** are an order, like the Gate, drawn from every people. Each wears a coat with one patch sewn on for every home lost to a creature. They give up their names and answer to the place they lost: Low Ford, Kettle End. When the Hearthcoil woke the warm springs above Kettle End, the meltwater took Low Ford in a night. They don't hate creatures. They think every arrival is a debt somebody else pays, and they want to burn the hill folk's sealed name so no more creatures come. Code: they never strike a rider. (The rules already spare riders.)

## 2. Peoples and their creatures

### The same five facts, read differently

Each people has its own word for a creature and its own sign on its gates. Players meet the sign first and the name later.

- **Hill folk** (herders) call them _grandfolk_. Creatures are **born** of the land's quiet places when the land asks. _Sign:_ a bell hung on every gate a creature passed, with its clapper tied.
- **River folk** (fishers) call them _the sent_. They come up from the deep water from the one downstream, whom the river folk never name. Old ones are going back. _Sign:_ a pearl set down where a creature drank.
- **Mothfolk** (forest) call them _bearers_: gifts from the dead, carrying what the dead wished for. _Sign:_ a lantern left to burn out.
- **Glass Caravan** (traders) call them _lodes_. The Caravan never sells the way back, never lies about water, and keeps a debt for a hundred years. It says the first creatures were made, long ago, and will tell you by whom. _Sign:_ sighting marks on its maps.
- **Reedchoir** (fen) call them _the stilled_. Every creature should rest in a fen, above all the Mirrorneck: the pools go still as it passes, and they hear that as a wish to stay. _Sign:_ a reed cut and left upright.
- **Wheelhouse** calls them _draught_. Creatures follow grass like any herd; "a place waiting" is herders' talk for a good valley. _Sign:_ a pen number painted on a post.
- **Reckoners** call them _debts_. Every creature is a debt walking, and somebody always pays. _Sign:_ a strip of cloth tied to a post.

Each people also names the same creature differently. The Mossback is _Old Thatch_ to the hill folk, _the Green Stone_ to the river folk and _Pen Four_ to the Wheelhouse.

**The feud.** The hill folk of Brackenlow keep the true name of the first creature ever seen, sealed and never said. The Reckoners have tried for a hundred years to buy it and burn it. It is stored as data (`feud`) for a later page.

### Names and sounds

Peoples' rules apply to people the party meet. Player characters come from the shipped mixed generator, so sample players such as Kelith and Wrena (from _Kel+ith_, _Wren+a_) follow no people's rule.

| People        | Rule                                       | Names                                        |
| ------------- | ------------------------------------------ | -------------------------------------------- |
| Hill folk     | two syllables, voiced; ends -o, -ow, -en   | Garrow, Brennen, Haldo, Ollen                |
| River folk    | liquid l and r; ends -ai, -un              | Lessai, Merrai, Selai, Ravun                 |
| Mothfolk      | one hushed syllable, ending in a consonant | Thess, Hesh, Vesh, Thal                      |
| Glass Caravan | clipped k and t; ends -ek, -ar             | Kettar, Tamek, Varek, Daskar                 |
| Reedchoir     | reed sounds (sh, wh, soft s), long vowels  | Shaal, Whisse, Sulesh                        |
| Wheelhouse    | trade titles, tool surnames                | Master Cogan, Hookwife Tallow, Second Wright |
| Reckoners     | the place they lost                        | Low Ford, Kettle End                         |

## 3. Creature kinds

Each kind has:

- **sound** and **habit**: free channels, drawn and written
- **havoc**: what goes wrong around it
- **blessing**: what those near it gain while peril stays low (public)
- **delight**: one visible moment in play, with a public condition
- where it is going

None of these names a stimulus or shows hunger. Its reactions are rolled and secret, as now.

**1. Mossback** (young; stays). _First creature._

- **Sound:** it hums while it grazes.
- **Habit:** it starts eating before it has stopped walking.
- **Havoc:** fields flattened, thatch gone from a roof.
- **Blessing:** berries ripen along its trail.
- **Delight:** passing a friendly settlement, its whole garden flowers at once.
- **Bound for:** the Greyfold, a valley waiting for something to graze it green.

**2. Hearthcoil** (young; stays). _Was the Cinder Serpent._

- **Sound:** a slow tick, like a cooling kettle.
- **Habit:** its tracks steam for an hour after it has passed.
- **Havoc:** scorched grass where it lies; snowmelt floods below its mountain.
- **Blessing:** frost-free nights nearby.
- **Delight:** at its first river crossing, steam stands up in a column taller than any tree.
- **Bound for:** a cold mountain whose hot springs it will wake.

**3. Mirrorneck** (young; stays). _Was the Reedwyrm._

- **Sound:** a low gargle, like water down a drain.
- **Habit:** every pool it passes goes still as glass, and stays that way until evening.
- **Havoc:** streams dammed so it can bathe; moored boats dragged off.
- **Blessing:** silted water runs clear behind it.
- **Delight:** fish follow it, silver along its length.
- **Bound for:** a dry lake whose springs it will dig open. The Reedchoir want it for their fen.

**4. Rimeox** (young; stays)

- **Sound:** a creak, like ice on a pond.
- **Habit:** frost stays in its footprints until noon, even in summer.
- **Havoc:** cold snaps blacken crops.
- **Blessing:** food keeps, and fevers cool.
- **Delight:** around halfway, birds start sitting on its horns. Nothing perched there before.
- **Bound for:** a high pass whose snow it will hold, so the rivers below run all summer.

**5. Bellmother** (old; goes on)

- **Sound:** a ticking, like hundreds of beaks on a shell.
- **Habit:** she walks through walls she never knew were there.
- **Havoc:** whole houses, once, at Low Ford's neighbour.
- **Blessing:** her birds strip pests from fields.
- **Delight:** at each stop a flock rises off her shell and does not come back down.
- **Way out:** a shingle bank where her tracks stop halfway to the water. **Stops:** three flocks let go where they were born.

**6. Breakhorn** (old; goes on). _Was the Thornstag._

- **Sound:** one cracked note at dawn.
- **Habit:** it scores every standing stone it passes, leaving pale scars as traces.
- **Havoc:** woods stripped of bark.
- **Blessing:** shed horn, carved and kept for generations.
- **Delight:** at each stop it breaks a horn on a stone, and the stone is scarred white.
- **Way out:** a high col. **Stops:** one stone for each people it walked among.

**7. Lowcloud** (old; goes on). _Was the Cloudwhale._

- **Sound:** a long hum at dusk, felt more than heard.
- **Habit:** it drifts so low that children run under it.
- **Havoc:** a week of shadow on a field; rain all at once.
- **Blessing:** rain where it is wanted.
- **Delight:** its shadow passes over the party and everything goes cool and quiet.
- **Way out:** a dry well on a hill. It rises straight up out of it. **Stops:** it rains on three dry valleys.

Sayings may claim reactions ("the bakers say a Hearthcoil follows the smell of bread"). A saying can be wrong, and the Keeper's cues still decide.

## 4. Customs

- **Standing stones:** one at each waymark (a quarter, a half and three quarters of the route), raised by whoever lives there.
- **Cairns:** a stone for each safe night beside a creature.
- **Gate signs:** bell, pearl, lantern, upright reed, pen number, cloth strip. Each settlement's sign says at a glance what its people think of creatures.
- **The chalk figure:** a creature cut into a slope and scraped clean each spring. Left alone, the grass takes it back.
- **Gate Night** (hill folk): once a year every gate in the village stands open all night. _See:_ open gates as the creature passes. It carries no rule.
- **Taboo:** don't say the true name.

**Dates show "9 of 40"** beside the route strip. The four-part calendar stays lore until it has something to do.

## 5. The living world

The world changes at the tick whether anyone plays or not. Everything is seeded, reads public facts and the tags the rules use, and is drawn first.

**The creature's body belongs to the Keeper.**

- **Reserved:** head, gaze, ears and eyes turned; flinching; stillness; lying down; droop and dullness; roundness and drowsiness; the sideways turn.
- **Free:** the garden or coat, sound, habit, tracks, dust and mud, things tied to it.
- **Endings are exempt.** Nothing is read from the body after the season ends.

### 5.1 Traces (season one)

- **See:** fire scars, a green trail, cairns where it lingered, broken chain where captors were cleared (`threat-cleared` for a type with `ending: 'pursuer'`), and **a small open gate** where a character was lost. Tap one: who and which step.
- **Data:** `traces: { kind, hex, step, by? }[]`. Each is stored when its event happens (the log keeps only 100), capped at 60.
- **Rules:** none.

### 5.2 The garden (next)

The coat collects the trail: thistle from the plain, a fern from the wood, white dust caught between them. A friendly settlement ties its sign into it, credited to whoever won it over. It is derived from terrain walked and from `befriended`. Each kind's delight (section 3) plays here or on the map.

### 5.3 Creatures far off (season two)

A vast silhouette crosses the map's edge now and then: wild ones, never earlier seasons' creatures (those stay where they went). It is `farCreature: { kind, edge, steps } | null`, seeded, with one line per kind. The world is full without any rule.

### 5.4 Old havoc

A burned ridge, a flattened wood, a frozen-over pond. It is **art only**, an overlay on unexplored hexes as they enter view. A real feature may sit under it. Later, a **Scholar** can read a fragment carved there that nobody else can.

### 5.5 Wonders, rain, rumours, the hunt

- **Wonders** bloom and fade on step clocks (v3).
- **The chalk figure** fades in 4 steps unless someone builds 3 work on its hex. The **Engineer**'s build bonuses apply. Tended, it stays white for the season and gives a fragment.
- **Rain** (after the sim): fire costs 2 timber, or 1 with the **Engineer**'s brazier.
- **Rumours** pin an area, given by a friendly settlement.
- **The hunt** (after the sim): smoke on the back edge, one column per point, 0 to 4.
  - **Deeds:** +1 when a settlement is angered; +1 when a threat with `ending: 'pursuer'` strikes the creature; −1 when one is cleared. Nothing else moves it.
  - **For captors only, it replaces the day term:** their strength scaling `floor((day − 1) / 14)` becomes `floor(hunt / 2)`, so the two never stack. Weight × (1 + 0.25 × hunt).
  - At 3 the Hook Line can come: one multi-hex threat outside `threatsMax`, whose salvage gives the **Engineer** iron.

### 5.6 Blessings as a rule (after the sim)

One generic rule reading the `blessing` tag and **public peril**. While peril stays at 2 or below for 5 steps, the blessing shows on the next unexplored hex to enter view along the heading (the Mossback's: a berry bush). Hunger is never read. Until then, blessings are art and lines.

### 5.7 Role hooks

- **Scout:** rumour pins, old havoc, the first sight of a telegraphed turn on the map.
- **Scholar:** tombs; fragments at old havoc (later); the Wheelhouse ledgers found in tombs.
- **Keeper:** the body, unshared.
- **Engineer:** the brazier, tending the chalk figure, Hook Line salvage, the Broken Wheel (v3 event).
- **Warden:** settlements. If havoc near one ever becomes a rule, it costs favour (visible, a Warden fix), never brings threats.

## 6. Storylets and the Gatebook

As in v3 and v4:

- Conditions read public facts only.
- Audience: all, the actor, or a role tag.
- Once-only, and cooldowns in steps; 2 cards a day per player at most, none dropped.
- The core decides what fires; a Worker table records reads.
- Cards pass, anchored to a hex or the creature. One plays on return.
- Role marks are true facts that a tip only names.

**Beat timing:**

- Terrain beats fire when the **footprint first touches** the tag, not when it comes into view (at radius 6 all five would be visible on day 1).
- The destination beat fires at route fraction 0.9, with a mark on the route strip, because the map never draws the destination.

**The Gatebook** keeps one chapter a season: the route strip with an icon per step, the beats seen, fragments with finder and step, the ending, and everyone who walked. Lore stays after a lost season. "Previously" openers retell last season as a slightly wrong legend. Everything sits in the guild's legacy tables, wiped before release.

## 7. Samples

One to three plain sentences; one concrete detail; no mechanics; no reserved body words; nothing that isn't on the map.

### 7.1 Setting out

- **Season one (the jailbreak):** The chain comes off the pen gate with one pull. A miller's girl watches from the hayloft and says nothing. The Mossback steps over the chain, sniffs the wind once, and turns toward somewhere only it knows.
- **A later young creature:** The Wheelhouse horn is still blowing when the gate swings open. The Hearthcoil goes out past the mill race, and its tracks steam all the way up the lane.
- **An old creature:** Nobody lifts the latch. The Bellmother leans on the gate until it gives, and one of her three flocks circles once over the pens.
- **After a lost season:** The Gatebook is open at a page with no ending written on it. Someone has drawn a small gate in the margin, standing open.

### 7.2 Storylets

1. **`beat.first.captors`**. _When:_ the first threat with `ending: 'pursuer'` appears. All. Once.
   Smoke behind you at dusk. Somebody back there is calling a name, the way you call an animal in for the night.
2. **`beat.first.settlement`**. _When:_ the first settlement comes into view. All. Once.
   A bell hangs over the village gate with its clapper tied. Children are sitting on the wall, waiting.
3. **`beat.waymark.half`**. _When:_ route fraction 0.5. All. Once.
   A standing stone on the slope, taller than a rider, with a fresh pebble wedged under its foot. Nobody here will say who put it there.
4. **`garden.seeds`**. _When:_ step 10 or later; three terrain kinds walked. All. Once.
   Something has taken root in the moss on its back: a thistle from the plain, a fern from the wood, and white dust caught between them.
5. **`settlement.sign`**. _When:_ `befriended`, hill folk. All. Cooldown 10 steps.
   They tie a bell into the moss with its clapper free, ask Kelith's name, and say it back.
6. **`delight.mossback`**. _When:_ the creature passes within 2 hexes of a friendly settlement. All. Once.
   Every flower in its moss opens at once. The children on the wall go very quiet, and then very loud.
7. **`reckoners.first`** (season two). _When:_ the first Reckoner threat appears. All. Once.
   A strip of blue cloth is tied to a fence post at the edge of the wood. It was cut from a curtain; the hem is still on it.

### 7.3 Lore fragments

Pairs argue over the same evidence. Neither is ever confirmed.

1. _Inside a collar:_ So you will hear me when you are far away.
2. We made the collars to ring if they strayed. They never strayed. They only stopped.
3. The land asks for them, the way a field asks for rain. You can hear it, if you are quiet enough.
4. _A Wheelhouse ledger:_ Pen four. Grazer, grown, origin unknown. Hay: two loads a day. Asks for nothing else.
5. Leave a pearl where it drank. It is going back to the one downstream, and it will need something to show.
6. _A patch on a Reckoner coat, stitched:_ Low Ford, eleven houses. The bird-mother walked through them in the night and never knew they were there.
7. A place out there waited for its creature. The smiths kept the creature collared, and the place stopped waiting.
8. _A Caravan count:_ Salt from the white ground, forty loads, the year my grandmother's grandmother was born. It was white then too.

### 7.4 Folk sayings

1. _Hill folk:_ Never say a grandfolk's true name to its face.
2. _River folk:_ What sinks is only resting.
3. _Wheelhouse:_ Bread doesn't ask what turned the wheel.
4. _Reckoners:_ Every bloom is somebody's flood.

### 7.5 Endings

The title follows fate and outcome, and the line follows the kind. Every line has the party in it.

**Stays:**

- **Mossback, safe.** It walks into the Greyfold and starts eating before it has stopped walking. By spring the valley is green from rim to rim, the hill folk are arguing over a new name for it, and two of you are still there, building a hut on the rim.
- **Mossback, wounded.** It reaches the Greyfold limping and grazes in a smaller circle than it should. The valley greens anyway, slowly, from that circle out. You stay until the first frost to be sure.
- **Hearthcoil, safe.** It coils down into the cold crater and does not come out. Three nights later the springs below run warm, and you wash the whole way off in them.

**Goes on:**

- **Bellmother, safe.** On the shingle she lets the last flock go and walks on, and her tracks stop halfway to the water. You stand where they stop. The gulls on the rocks don't move.
- **Lowcloud, safe.** Over the last dry valley it rains all night. In the morning there is mud where the dust was, a speck rising out of the well on the hill, and you, soaked, around a fire that won't light.
- **Breakhorn, wounded.** It breaks two horns on the stones and keeps the third. At the col it looks back once at the scarred stones below, then goes on over, carrying the one it wouldn't give up. You go down to read the scars.

**Lost** (by the largest peril source; the latest strike breaks a tie):

- **`pursuer`.** The hooks find it at dusk. You hear the mill horn from three valleys away, and then the wheels start up again.
- **`hunger`.** It stops a long way from where it was going and lies down. Somebody sits with it all night, a hand in the moss. When the grass comes up there, it comes up thin and pale.
- **Reckoners** (season two). It falls in the wood, among strips of cloth. Somewhere a Reckoner sews a new patch onto a coat, then sits a long time with the needle.

### 7.6 "Previously" openers

- _After a stay:_ The hill folk say a woman called Wrena walked the Mossback into the Greyfold with a lantern. It was Kelith with the lantern. Nobody corrects them.
- _After a go-on:_ Five names are written in the Gatebook under the Bellmother, and someone has drawn the shingle beside them, with the tracks stopping halfway.
- _After a loss:_ Nobody found where the Mossback lay down. Wrena's cairns still stand by the river, and someone has been adding stones.

## 8. Fit and the season one cut

### 8.1 Data shapes (sketch)

```ts
interface CreatureType {
  // ...existing: id, name, tags, icon, hunger, reactions
  fate: 'stays' | 'goes-on';
  personality: string[];
  sound: string;
  habit: string; // public; never a stimulus
  havoc: string[];
  blessing: string[]; // public; blessing reads public peril
  tier: number;
  route: {
    legs: { share: number; turn: -1 | 0 | 1 | 'seeded' }[]; // Mossback: [{ share: 1, turn: 0 }]
    stops?: { at: number; task: string }[]; // route fraction; art and beats only; never halts it
  };
}
interface ThreatType {
  /* ...existing */ ending?: 'pursuer' | 'reckoner';
} // captors: 'pursuer'
```

- **Heading stays state** (`state.ts`). A leg boundary is `round(cumulative share × routeLength)`. At a boundary tick the heading changes by one direction, and the seed picks the side for `'seeded'`. Only `leg` joins the state. A later rule (turning after repeated veers) can change heading the same way.
- **Public view now:** `route: { leg, nextTurn: { atStep, side } | null }`. A turn is known at least `turnNotice` (2) steps ahead and drawn on the route strip and the step hints, so players can still plan trips out and back.
- **Legs across seasons:** the leg index goes into legacy (for a journey over two seasons, later).
- **Endings:** the largest `stats.peril.added` source wins, ties going to the latest strike. `hunger` gives the hunger ending. `threat:<type>` gives that type's `ending`, otherwise the plain title. Keys: `${kind}.${outcome}`, then the title. Fate joins the key when the second kind ships.
- **Titles follow fate:** stays gives "Arrived" or "Arrived, wounded"; goes on gives "Gone on" or "Gone on, wounded"; and "Lost". This replaces "Home safe" in `season.ts` (question 3).
- **Group name:** "party" everywhere, including onboarding's "Join the expedition". Story says "you".

**Docs to amend by decision:**

- m5 "title only", by Misa's line-per-ending call
- "Nothing carries over" and madness, by Misa's calls
- `GAME_DESIGN.md` "back to its habitat" becomes "to where it is going"
- `progression.md`: the sanctuary becomes a chart of places and ways out, and veterans are unaffected by fate

### 8.2 Build order

1. Traces.
2. Beats and endings on the thin engine.
3. The Gatebook.
4. Wonders and old havoc art.
5. The garden and delights.
6. Rain and the brazier (after the sim).
7. Rumours.
8. The hunt.
9. The Reckoners' threat, far creatures, legs and the turn telegraph, when the first old kind arrives.

### 8.3 Season one cut

Exactly this ships first: 16 pieces of text, plus trace art.

1. **Traces:** fire scars, the green trail, linger cairns, broken chain, the small open gate. A tap shows name and step.
2. **The thin storylet engine:** audience `all`; passing cards anchored to a hex or the creature; one card on return.
3. **12 route beats:**
   - the jailbreak setting-out (7.1)
   - the footprint first touching `wooded`, `dry`, `steep`, `water` and `boggy`
   - first captors (the voice calling a name)
   - first settlement
   - three standing stones
   - the Greyfold at 0.9
4. **4 endings:** Mossback safe, Mossback wounded, lost to `pursuer`, lost to `hunger`. Other losses keep the plain title.
5. **The date:** "9 of 40" beside the route strip.
6. **Names in play:** Mossback, Greyfold, Wheelhouse, captors, hill folk, river folk, the Open Gate. Nothing else; peoples show their signs first.

## 9. Questions for Misa

1. **Young and old.** Young creatures stay and old ones go on, under one premise, with the veiled card's sun hinting "turns ahead"? _My pick: yes; young kinds first, old from tier two._
2. **Watching, not riding.** At a go-on ending the party watch from where the tracks stop, rather than riding off, so fate never decides who could come back as a veteran. _My pick: watch._
3. **Ending titles follow fate.** This changes the shipped "Home safe" and "Home, wounded" to "Arrived" and "Arrived, wounded" (and "Gone on" for old kinds). _My pick: yes, with the line under it._
4. **The Reckoners.** From season two: a grieving order with its own threat type and a loss ending, never striking riders. _My pick: yes._
5. **Blessings as a rule.** One generic rule: low public peril for 5 steps makes the kind's blessing appear ahead (for the Mossback, a berry bush). _My pick: yes, after the balance sim; until then, art only._
