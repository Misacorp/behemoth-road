# World v2: engineering and interface review

Lead engineer, 23 November 2026. Verdict: v2 fits the architecture if story is a read-only layer over the public view and hidden things travel in the existing per-viewer channels (`signs`, `glints`). As written, five parts leak or break interface rules.

## 1. Interface rule breaks

| Where                                                                                         | Problem                                                                                           | Fix                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3 story card "over the map, tap to close"; 3 cards on return                                | It is a modal: only passing help may cover the map. Three or more cards on return is a text wall. | A passing card anchored to its hex or the creature, like a moment, closed by the next tap (as tips are). Never over a popover. On return, one card; the rest go behind a ribbon on the Roadbook icon. |
| 4.1 #2 `beat.first.dry`: "walks faster here and does not graze"                               | Story that states a rule.                                                                         | Keep the sensation: "The ground turns white and rings underfoot. The Mossback lifts its feet high."                                                                                                   |
| 3.8 role details: Warden "robbed before", Engineer "good stones"; a first-sight card for each | These lines explain value, and the first-sight cards add about 15 explainers.                     | Marks only. A tip names the mark, never its meaning. First sight uses the existing seen-ids hint, not a story card.                                                                                   |
| 3.6 Roadbook "digests as a chronicle"; 3.4 digest of 4 or 5 lines                             | 40 posts a season: a text wall in the channel and in the drawer.                                  | Digest: two lines (date with weather icon; one credited deed). Roadbook: the route strip with one icon per day; the line sits behind a tap.                                                           |
| 3.7 sealed entries                                                                            | The opening conditions must never render.                                                         | Show the wax seal and its tag icon only. A test checks that no condition text reaches the text module.                                                                                                |
| 2.1 sayings per people, 4.6 "Ways through"                                                    | A saying next to its omen reads as a tip; a list of ways through would be a manual.               | Sayings appear only on the endpapers. No "how to pass" view; the existing needed-role mark is enough.                                                                                                 |

## 2. Hidden information

Today every player gets one shared `GameStateView` plus their own `signs` and `glints`, and the `events` log goes to everyone. So:

- **Role and private storylets stay out of the shared log and the shared view.** The shared log carries `{ kind: 'storylet', id, day, by? }` only for audiences `all` and `actor`. Role and private cards go to a per-player `cards` table and leave the server only in that viewer's response. Everyone else sees `{ kind: 'private-card', role }`, with no id.
- **Conditions read only public facts.** A card that fires on hunger, the creature's nature or a rumour's truth leaks that fact by firing.
  - Evaluate against `toPlayerView(state)` (plus the viewer's signs for role cards); a closed `Quality` union without `satiety` or `truth` makes a hidden condition a type error.
- **Omens.**
  - `nextFront` and each omen's truth are server-only fields, never in `toPlayerView`.
  - False omens roll from their own seeded stream (a sign with no front coming).
  - The sign goes in `signs`: clear for a keeper, an edge tint for a scout, a coarse pose for everyone else. The pose must never become a shared `Creature` field.
- **Rumours.** The view carries `{ id, hex, about, expires }` and never `truth`. A pin on a hidden hex sends coordinates only, no terrain. False and twisted pins choose their hex from their own stream.
- **Role details on unrevealed features** (a glyph over an unopened tomb) are a reveal like glints: per viewer and computed on the server.
- **Digests reach everyone in the channel, players or not.** The builder's type accepts `GameStateView` and public events only, never `GameState`.
- **Private cards public after 3 days** are a timed reveal; tell Misa in question 6.

## 3. Determinism and data

Everything in v2 is derivable from seed, state and tags, with three fixes:

- **Separate fired from read.** The core decides what fires, seeded by `(seed, STORY_STREAM, day, character)`, with ties broken by id and the daily cap counted on fired cards. Whether a player has read a card is a worker table: when someone opens the app is not an input to the core.
- **Rumours ahead of the window.** Features enter state only when in view, but `generateFeature(seed, hex, …)` is per hex, so a true rumour can call it; resolve against the hex as it really is.
- **Word decays in integers** (a shift per 4 hexes and per 10 days), so the balance simulation stays byte-stable.

**Derived, never stored:** the hexes under a front, trampled hexes, the calendar (season index and day fraction), smoke columns.

**Stored in the game row:** `world { front, herd, reach, rumours ≤3, wonders ≤2, word ≤30, traces ≤60 }` and `story { fired, today }`, about 10 KB.

**Content as data:**

- "_What the Water Keeps_ complete" and "the grappling hook" name content inside rules. Use `pageComplete: <tag>` and item tags instead.
- `audience.role` should be a role tag (`tend`), as `isKeeper` already uses.
- A festival is data: `{ walk, ten, people, grants: [{ tag: 'food', as: 'trade' }] }`.
- The Worker renders the digest, so the text module belongs in a shared package, not in `apps/web`.
- Never reuse or delete a storylet id; retire it. Roadbooks keep ids across content versions.

**Per viewer:** omen signs, role details, role and private cards, the unread queue. Everything else is shared.

## 4. Storage and cost

Baseline rows read today, from `live.md`: tick 16, act 14, changed poll 5.

- **World and story in the game row:** no extra rows.
- **Unread cards** cannot live in the event log: it keeps 100 events, and a player who has been away gets `eventsTruncated`. They need their own table, `cards (user_id, season, day, id, read)` with an index on `(user_id, read)`. A changed poll then reads at most 3 more rows. Add a budget for it.
- **Roadbook tables:**
  - `roadbook_season`, `roadbook_entry` and `digest (season, day, template, slots_json, posted_at)`, about 100 rows a season.
  - A digest stores its template and slots and is rendered on read, so wording edits apply and nothing hidden is stored.
  - Read only through `GET /api/roadbook?season=`, added to `READ_ROUTES` with a budget, never on a poll. About 1,600 rows a day: noise.
  - The tables must survive a new season and a reset for outdated content. That needs Misa to supersede "Nothing carries over between seasons" first.
- **Writes:** about 20 card rows a day; the free write allowance is far smaller, so cap them in config.
- **Posting the digest:** nothing posts to a channel today (`GuildApi` only reads). Check creatures' channel post before writing ours.
  - Add `postMessage` to `discord.ts`: snowflake check, the existing timeouts, `allowed_mentions: { parse: [] }`, display names escaped for Markdown.
  - The tick transaction writes the `digest` row. After the commit, the alarm posts it and sets `posted_at`.
  - A failed post is logged and retried at the next alarm. The alarm never throws for it, because a throw re-runs the tick path.
  - An admin (`canManageGuild`) picks the channel in a settings drawer; it is stored in `guild_meta.digest_channel_id` and off by default. No posts in fast pace.
  - Misa: give the bot View Channel and Send Messages there.

## 5. Smallest first slice

Build route beats and endings on the storylet engine (audience `all` only), plus traces.

- **Core:** `story.ts` (conditions over the view, salience, once-only and cooldown, the cap), fired at the tick as a `storylet` event. 12 beats and 4 endings as data. Traces derived from events into `world.traces`.
- **Web:** a passing card anchored to the creature, one shown on return through the existing recap, and trace art.

**Tests:**

1. The same seed and inputs fire the same storylet ids.
2. The balance simulation's states are identical with story on and off, except the `story` and `traces` fields: the story layer changes no rule.
3. Once-only and cooldowns hold across ticks.
4. The cap queues a card and never drops one.
5. Content check: every condition names a known tag or quality, every id has a text key, and no condition reads a server-only field.
6. The view never holds an id that has not fired.
7. Read budgets for the tick and the changed poll stay where they are.

## 6. Top 8 changes, ranked

1. Conditions read only public facts (type and content check).
2. Role cards, private cards and omen signs go per viewer.
3. Story cards are passing and anchored; one on return.
4. Fired (core) separate from read (worker table).
5. Digest from the public view only; posted after commit; no mentions; off by default.
6. Misa rules on "Nothing carries over" before any cross-season feature.
7. Rewrite rule-stating lines; cut the digest and chronicle.
8. Tags, not content ids, in rules; text module in a shared package.
