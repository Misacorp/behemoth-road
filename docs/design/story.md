# Story: the season one cut (contract)

What the core and the Worker give the interface for the world proposal (`docs/design/world/world.md`, section 8.3). Core and Worker are built; the text and art are the interface's. Everything here is public: nothing reads or shows the seed, the creature's nature or care, or a hidden feature. Every number is in the tuning config or content data.

## Creature content (`content/creatures.ts`)

Each `CreatureType` also has: `fate: 'stays' | 'goes-on'`, `sound`, `habit` (text keys), `blessing: string[]` (tags), `tier`, and `route: { legs: { share, turn: -1 | 0 | 1 | 'seeded' }[]; stops?: { at, task }[] }`. The Mossback: `fate: 'stays'`, sound `hum-while-grazing`, habit `eats-before-it-stops`, blessing `['berries-along-the-trail']`, tier 1, one leg `{ share: 1, turn: 0 }`. Route legs and stops are data only: the heading stays state and movement is unchanged. The creature's kind is public: `creature.kind` (content id) in the view.

`ThreatType.ending?: 'pursuer'`: set on captors.

## Traces (`state.traces`, public)

`traces: { kind: 'fire' | 'trail' | 'cairn' | 'chain' | 'gate', hex, step, by?: characterId }[]`. `step` is the creature's steps when it was written. Written when the event happens:

| Event                                                | Trace                                                    |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `fire-lit`                                           | `fire` on the fire's hex, `by` the lighter               |
| `creature-step` (not a linger)                       | `trail` on each hex the footprint left                   |
| `linger`                                             | `cairn` on the creature's centre, `by` the keeper        |
| `threat-cleared` for a type with `ending: 'pursuer'` | `chain` on the threat's hex, `by` the one who cleared it |
| `lost`                                               | `gate` on the hex where the character was, `by` them     |

A newer trace of the same kind on the same hex replaces the older. At most `traceCap` (60); over it the oldest `trail` goes first. A trace is dropped with its hex when the tile is pruned from the fog (the lost character's own hex is kept, so a gate stays). Traces change no rule. The ending screen can show them all.

## Storylets (`content/storylets.ts`, `story.ts`)

Content: `{ id, kind: 'beat' | 'ending', when: Condition[], audience: 'all', once: true, anchor: 'creature' | 'hex' }`. Conditions are a closed union over public facts:

- `{ kind: 'route', fraction }`: steps / `routeLength` at least `fraction` (0 is setting out).
- `{ kind: 'footprint-touches', tag }`: the footprint touches a known tile whose terrain has the tag (anchor hex: that tile).
- `{ kind: 'threat-ending', ending: 'pursuer' }`: a threat with that `ending` is on the map (anchor: its hex).
- `{ kind: 'settlement-in-view' }`: a settlement is in view (anchor: its hex).

The twelve beats (the interface keys its text by id): `beat.setting-out` (fraction 0), `beat.terrain.wooded`, `.dry`, `.steep`, `.water`, `.boggy` (the footprint first touching the tag; anchor `hex`), `beat.first.captors` (`hex`), `beat.first.settlement` (`hex`), `beat.waymark.quarter` (0.25), `.half` (0.5), `.three-quarters` (0.75), `beat.greyfold` (0.9). Only beats fire; `kind: 'ending'` is reserved.

**What fires.** After every `act` and every tick the core queues each beat whose conditions hold and that is not fired or queued (in content order), then fires the queue in order, at most `storyPerDay` (2) per game day; the rest wait (`story.queue`) and are never dropped. Same state and inputs, same story. Nothing fires once the season is over.

**State** (public): `story: { fired: string[]; queue: { id, hex: Hex | null, when }[]; today: { day, count } }`. `story.fired` is the truth: the interface shows the fired ids the player has not read (`you.storyRead`), in order.

**A new game** fires what is already true (setting out, any terrain under the first footprint) at creation, with no event (a new game has no event stream); everything later emits an event.

**Event** (in the event log and the act/tick answers): `{ kind: 'story', id, step, anchor: { kind: 'creature' } | { kind: 'hex', hex }, when }`. `when` is the condition label that fired it (`route:0.5`, `footprint-touches:wooded`, `threat-ending:pursuer`, `settlement-in-view`, joined by `+`), for debugging only. Story events come after the act's other events, and in a tick before `day`.

## Endings (`ending.ts`)

`endingOf(view)` (core, pure) is `null` while the season goes on, else `{ outcome, fate, creature, title, line }`, also given by the Worker as `ending` in the player view (`null` while on).

- **Title** follows fate and outcome: stays: "Arrived", "Arrived, wounded"; goes on: "Gone on", "Gone on, wounded"; lost: "Lost". (Replaces "Home safe" and "Home, wounded".) Exported as `ENDING_TITLES`.
- **Line key** for safe and wounded: `${creatureId}.${outcome}` (`mossback.safe`, `mossback.wounded`). For lost, by the largest `stats.peril.added` source (a tie goes to the source that added peril last): `hunger` gives `ending.lost.hunger`; `threat:<type>` whose type has `ending: 'pursuer'` gives `ending.lost.pursuer`; any other source gives `line: null` (the plain title).

The party is in every line; the text is the interface's.

## Worker

- `POST /api/me/story-read`, body `{ ids: string[] }` (strict; 1 to 12 ids, each a storylet id from content), identity from the session. Adds the ids to that player's reads (a union; never removed). Answer `{ storyRead: string[] }` (content order). It is not a game change: the version stays. Table `story_read (user_id, story_id)`, primary key both.
- The player view gains `you.storyRead: string[]` (only ids this player has read) and `ending`.
- Reads: an unchanged poll still reads 0 rows. A player's read ids are kept in memory after the first read.
- Fixtures are recaptured; content version is 22.

## Not built (later, by Misa's decisions)

The Reckoners and their threat (season two); old kinds (tier two) and their turns; blessings as a rule (art only until the balance sim); the garden, wonders, rain, rumours, the hunt (`world.md` 5).
