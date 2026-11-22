# Design decisions

This folder holds the project's design decisions, one file per topic. Read this index first, then only the topic file or files your work touches. The index lists only the entries in force.

## How to use it

Look things up:

- `node scripts/decisions.mjs list --topic <topic>` lists a topic's current entries.
- `node scripts/decisions.mjs search <regex>` searches titles and bodies.
- `node scripts/decisions.mjs show <id or heading text>` prints whole entries.

Record a decision:

- Run `node scripts/decisions.mjs new --topic <topic> --title "..." [--supersedes id] [--amends id] [--owner]`, then write the body (`**Decision.**` and `**Reasoning.**`).
- Or write a `## YYYY-MM-DD: Title` entry by hand at the top of the topic file and run `node scripts/decisions.mjs fix`.
- A new entry that replaces an earlier one says `Supersedes:` its id; one that changes part of it says `Amends:`. Never rewrite an old entry.
- `fix` sorts the entries, fills in IDs, derives statuses and rewrites this index. Never edit IDs, statuses or this file by hand. `check` reports what is out of date and never writes.
- Decisions the owner confirmed carry the owner's tag, `**[<name>]**`, in the title (`--owner` adds it; the name is `owner.name` in `project.config.json`).

## Direction and process

[direction.md](direction.md): Priorities, how the owner and agents work, naming and tone.

- 2026-11-21 Features rise tall from the ground, no raised plinth \[Misa\]
- 2026-11-21 Art review round 2: features rise from plinths, traps share a danger cue, the shield is the role frame, trodden ground keeps its terrain \[Misa\] (amended)
- 2026-11-19 The art review page shows only what needs Misa; silence means accepted \[Misa\]
- 2026-11-19 Art costs no money; code draws it, local generation is optional \[Misa\]
- 2026-11-19 Agents commit as the owner \[Misa\]
- 2026-11-19 Squash merges only; the PR title and description are the commit (amended)
- 2026-11-19 Agents make small calls themselves; the owner keeps the large direction
- 2026-11-19 Open questions go in one numbered list, asked once
- 2026-11-19 Unattended sessions stay quiet until there is news
- 2026-11-19 Reviewers weigh suggestions against the owner's standing priorities
- 2026-11-19 No change reaches the owner read only by its author
- 2026-11-19 Delegated UI work comes back with a reuse list, and review checks it
- 2026-11-19 Parallel implementers each work in their own worktree
- 2026-11-19 Every implementer brief carries the same standing block
- 2026-11-19 Batch finished work into few PRs, merged in a fixed order
- 2026-11-19 Work for a long-running feature branch goes onto that branch
- 2026-11-19 Ship a rework in quick small steps and tune at the end
- 2026-11-19 Before a stable release, production may change freely; data wipes are the owner's call
- 2026-11-19 The lead agent owns the look and brings real choices
- 2026-11-19 UI work is shown at a phone width and a desktop width, every round
- 2026-11-19 Screenshots that belong together form one labelled sheet, and every picture enlarges on tap
- 2026-11-19 A polish night starts with read-only audits
- 2026-11-19 Retros turn friction into proposals; procedures become skills
- 2026-11-19 Design variants ship only to staging until the owner picks one

## Platform and tooling

[platform.md](platform.md): Hosting, CI and deploys, environments, dependencies, security, dev tools.

- 2026-11-21 The view carries the server clock
- 2026-11-21 Rows read are metered per source and budgeted in tests
- 2026-11-21 Live sockets: ticket auth, caps, Hibernation, flag off in production
- 2026-11-21 Live sockets only say "changed"; the client fetches its own view
- 2026-11-21 Fast pace schedules a second alarm time in the one Durable Object alarm
- 2026-11-20 The short dev season follows the dev-tools switch; an ended season stops the schedule
- 2026-11-20 Staging and local seasons are short; admins start a new season there
- 2026-11-20 Web schema requires the M4 view fields now the fixtures carry them
- 2026-11-20 The player view carries each viewer's creature signs; the creature's nature and condition never leave the server
- 2026-11-20 The Durable Object keeps the last 100 game events for clients to replay
- 2026-11-20 The core state holds exploration, packs, stores and unlocks; no glints, no migration
- 2026-11-20 The Worker replaces an outdated game on start and refuses an unreadable one with 503
- 2026-11-20 The core state holds exploration, packs, stores and unlocks; no glints, no migration
- 2026-11-20 Before a stable release, older games are wiped, not migrated \[Misa\]
- 2026-11-19 Only allowed Discord servers can play; the app itself is public \[Misa\]
- 2026-11-19 The web client boots as an Activity, parses every response, and runs rules on the player view
- 2026-11-19 Sign-in, interactions and the deploy's Discord steps follow creatures (amended)
- 2026-11-19 The local dev login and the staging next day: who may use them
- 2026-11-19 Joining and replacing pick an offered character by index; offers are in the player view
- 2026-11-19 Missed day ticks catch up to seven at once; older ones are skipped
- 2026-11-19 The game is created on a server's first sign-in, with a seed from the platform's random source
- 2026-11-19 Drawing uses a separate public art seed
- 2026-11-19 Game seeds are 128 bits, so the seed cannot be brute-forced from visible terrain (amended)
- 2026-11-19 Games pin their content version and prune lost tiles beyond four rings
- 2026-11-19 Rules read a seedless view; tiles carry their terrain
- 2026-11-19 The server keeps the seed; clients get a player view with known terrain (amended)
- 2026-11-19 The world layer's bitmap is capped at 4096 px a side and 16 MP
- 2026-11-19 The map pans a world layer by CSS transform; the scene stays memoised (amended)
- 2026-11-19 Vulnerable transitive packages are fixed by bumping the direct dependency, else by a scoped exact override
- 2026-11-19 Art terrain looks are keyed by the core's terrain ids
- 2026-11-19 The map pans by one transformed group and drops its SVG filters during gestures
- 2026-11-19 Milestone 1 dev controls show in every environment
- 2026-11-19 Terrain comes from seeded noise fields, with rivers and ridges on contour lines
- 2026-11-19 The core derives terrain from a hash and stores only tile knowledge and the config (amended)
- 2026-11-19 Art output is held to a tag and attribute allowlist, with a lite mode for slow phones
- 2026-11-19 Map ground merges into one path per paint; hexes are hit-tested by maths
- 2026-11-19 The art kit is a pure package that returns an SVG element tree
- 2026-11-19 Hostnames stay out of the README and workflows
- 2026-11-19 One Durable Object per Discord server holds the game; its alarm runs the day tick
- 2026-11-19 The game core is its own pure package, imported by the Worker and the frontend
- 2026-11-19 Players open the game as a Discord Activity, like creatures \[Misa\]
- 2026-11-19 Decisions live in docs/design/decisions, one file per topic
- 2026-11-19 Agents never merge; main accepts changes only through PRs
- 2026-11-19 CI runs parallel jobs behind one required gate job
- 2026-11-19 Documentation-only PRs skip the build and tests, but never the gate
- 2026-11-19 Agents push after quick local checks; CI runs the full check
- 2026-11-19 Each rule is tested once, at the lowest layer that can prove it
- 2026-11-19 Guards must be shown to fail, and must explain their changes
- 2026-11-19 Dependencies are few, exact, aged and script-free
- 2026-11-19 Workflows follow a fixed hardening list
- 2026-11-19 Secrets live in GitHub environments, one per target, and agents never handle them
- 2026-11-19 In a public repo, logs, summaries and artifacts are public too
- 2026-11-19 Limit what a fooled agent can do
- 2026-11-19 Migrations apply by recorded version, and a released number is never reused
- 2026-11-19 Production deploys only from main; staging only from a manual run
- 2026-11-19 Dev tools exist only in staging and fail closed (amended)
- 2026-11-19 Large reworks run behind a staging-only flag
- 2026-11-19 Destructive one-off operations are built inert
- 2026-11-19 A script tells agents which commit is deployed
- 2026-11-19 Client-server contract fixtures are captured from the real server
- 2026-11-19 Measure costs before guessing, and price work that repeats
- 2026-11-19 One Worker serves the frontend and the API, configured as code
- 2026-11-19 Strict security headers, and everything served from our own origin

Superseded: 3 entries (see the topic file).

## Product

[product.md](product.md): Features, UX and behaviour the users see.

- 2026-11-22 One tap on a skill node shows its tip and arms it; the glint is bigger \[Misa\]
- 2026-11-22 Skill tree UI: emblem ring on the HUD, arm then take, tips for reasons (amended)
- 2026-11-22 Skill slice: notch per action performed, tier 1 live, effects as data hooks
- 2026-11-22 Nothing carries over between seasons \[Misa\]
- 2026-11-22 Everyone earns a catch-up notch every 10 steps \[Misa\]
- 2026-11-22 Another role's skill tree is open to tier 1 only \[Misa\]
- 2026-11-22 The first skill pick in a role's tree closes the other branch \[Misa\]
- 2026-11-22 Skill picks are earned by working \[Misa\]
- 2026-11-21 Tips have no timer: they stay until the next tap \[Misa\]
- 2026-11-21 A tap elsewhere only closes an open popover \[Misa\]
- 2026-11-21 A rockslide strikes only its own hex (threat reach) \[Misa\]
- 2026-11-21 The scripted chain reaches the climbing spikes about twice as fast \[Misa\]
- 2026-11-21 Hunger drains every day and food restores more \[Misa\]
- 2026-11-21 Fires steer the creature sideways only, and several fires add up by side \[Misa\]
- 2026-11-21 The slow terrain is a swamp, not sand: marsh boards replace the sand sledge \[Misa\]
- 2026-11-21 Misa: the defended creature reads as shields against a threat's strength \[Misa\]
- 2026-11-21 Misa: a greyed action says why when tapped \[Misa\]
- 2026-11-21 A quick recap screen when a season ends \[Misa\]
- 2026-11-21 Settlements and features only appear on unexplored hexes
- 2026-11-21 A tile with several things shows a picker of round bubbles \[Misa\]
- 2026-11-21 Fast rounds pace: staging only, all active characters spent, 6 s delay, 4 s day banner
- 2026-11-21 Content version 9 balance: stampede strength 1, ambush and stampede weights halved
- 2026-11-21 More content for playtests: ambush, stampede, river folk, sunken shrine, undertow, sand sledge (amended)
- 2026-11-21 A player roster drawer finds each player's character on the map
- 2026-11-20 Icons that are not buttons show their tip on a tap \[Misa\] (amended)
- 2026-11-20 Verb labels under actions are on by default \[Misa\]
- 2026-11-20 The map is framed between the top HUD and the pips; the first view looks ahead of the creature
- 2026-11-20 Threats grow stronger every 14 days, not 10
- 2026-11-20 A seeded balance simulation with scripted careful and careless parties
- 2026-11-20 Threat pacing numbers: window 6, rockslide 5 ahead, raiders speed 1 (amended)
- 2026-11-20 A threat's card draws its next-tick path as an ink trail and its distance as action arrows
- 2026-11-20 Following the popup rule: a rider's card inside the bubble, the hub beside it, the pack as passing help
- 2026-11-20 Threats are telegraphed: a wider window, slower varied speeds and a shown path \[Misa\] (amended)
- 2026-11-20 Action costs are drawn as arrows, not coloured dots; verb labels are a switch to try \[Misa\] (amended)
- 2026-11-20 Only passing help may cover a popup; interactions continue inside it or in a drawer \[Misa\] (amended)
- 2026-11-20 One tip controller for HTML, the map's cards and the map itself
- 2026-11-20 Every icon has a short tip on hover or press-and-hold, with text in one file \[Misa\] (amended)
- 2026-11-20 The ending's scene is drawn above a strip reserved for its summary
- 2026-11-20 Feedback without words: out of reach, empty hexes, the role a greyed action needs, settlements, mislead and relief
- 2026-11-20 Map card actions arm on the first tap and spend on the second; own-hex cards keep the neighbours clear
- 2026-11-20 Marks for empty hexes, out of reach, a needed role and a mislead
- 2026-11-20 Features stand on a plinth; decorative props do not
- 2026-11-20 A survey of an empty hex says so
- 2026-11-20 Dev season brings threats from the first tick
- 2026-11-20 Stone, iron and timber also lie on open ground
- 2026-11-20 Threats and settlements near you carry M4-style action badges
- 2026-11-20 Escort and struck marks read the core's rule through one web function until the core exports it
- 2026-11-20 The new-season button shows for admins with dev tools on
- 2026-11-20 Settlement actions live in the here card; from afar its card shows only attitude and favour (amended)
- 2026-11-20 A tap on a threat opens its card, even while selected
- 2026-11-20 Milestone 5 art: threats, settlements and the guardian's marks are drawn by the art kit from content keys
- 2026-11-20 Milestone 5 core: readings of the season contract
- 2026-11-20 Threats are tagged data that appear at the window's edge and walk in openly (amended)
- 2026-11-20 Guardians strike, defend and escort; anyone can strike a threat
- 2026-11-20 Settlements appear on the route; parley or offer to befriend, or anger them
- 2026-11-20 Peril is a public track; the season ends at home or at full peril
- 2026-11-20 The day's step uses Milestone 3's creature walk; a linger plays the stayed mark
- 2026-11-20 The step hints, appetite badge and stayed mark use the art kit's drawings
- 2026-11-20 The creature card's heading loses its ring; the bubble carries an appetite badge (amended)
- 2026-11-20 Step hints scale with chance; the day's step plays as a walk or a stayed mark (amended)
- 2026-11-20 A timber stand hints at a fire, on your here card and its inspect card
- 2026-11-20 Hunger drains every second day (amended)
- 2026-11-20 Appetite reads at game zoom: a ground aura, bigger shape changes, a hub badge and weighted step hints
- 2026-11-20 The keeper's cue shows the creature's true attitude for the tame first creature
- 2026-11-20 Light a fire hints faded without fuel once you have seen a fire (amended)
- 2026-11-20 A lingering creature's stay mark sits on its footprint's near edge
- 2026-11-20 Feed and linger sit in the hub drawer as unlock-style cards
- 2026-11-20 Light a fire shows on your hex's card only when you carry fuel (amended)
- 2026-11-20 M4 tick events: a linger is a creature-step that stays; fire-out and creature-ate are public
- 2026-11-20 Poll every 10 seconds while the game is visible
- 2026-11-20 Polish after the M3 playtest: icon names, the window edge, a lost moment, the creature's walk and action hints (amended)
- 2026-11-20 Moments play only from the server's event log, once per event
- 2026-11-20 The revised chain in the interface: survey in the inspect card, the pack on the HUD, stores and unlocks in the hub drawer (amended)
- 2026-11-20 The here card is compact and lets taps through its body; moments use the art kit's marks
- 2026-11-20 Unexplored hexes sit under one hatched paper veil; packs, stores and unlocks have their own marks (amended)
- 2026-11-20 M4 core: hunger cap in creature data, starving meals nourish, lingering twice refused
- 2026-11-20 Lingering is the keeper's action and never runs two days in a row
- 2026-11-20 Hunger has a comfortable band; underfed is erratic, overfed is sluggish; anyone can feed (amended)
- 2026-11-20 Symptoms are computed per viewer; keepers see them earlier and see reaction cues
- 2026-11-20 Fires pull the creature's step by a weighted score; the public prediction stays blind (amended)
- 2026-11-20 The creature's nature is hidden server data; the first creature is drawn to fire or shies from it
- 2026-11-20 Milestone 3 rules after Misa's notes: the calls the plan left open
- 2026-11-20 Features are placed by terrain tags with absolute weights
- 2026-11-20 Unexplored hexes sit under one hatched paper veil; packs, stores and unlocks have their own marks
- 2026-11-20 The Stubborn quirk's icon is a boulder, so icon keys never clash
- 2026-11-20 Features, glints, moments and the via mark are drawn by the art kit from content keys (amended)
- 2026-11-20 Explored and unexplored hexes look clearly different \[Misa\]
- 2026-11-20 Characters carry packs; team stores live on the creature
- 2026-11-20 Engineers build permanent team unlocks with a cost and a duration \[Misa\]
- 2026-11-20 Everyone springs traps; scout and engineer bonuses come later as upgrades \[Misa\]
- 2026-11-19 Joining is a drawer wizard; characters look distinct on the map
- 2026-11-19 Character looks come from content's look seeds, so a preview matches the joined look
- 2026-11-19 Icons follow content's icon keys; quirks sit on a split tile
- 2026-11-19 Role emblems share one frame; icons are drawn by key; characters vary by seeded look (amended)
- 2026-11-19 Character choices are rolled from the game, the player and the attempt; players pick by index
- 2026-11-19 Popovers point at their subject; grace-day tiles and figures warn without words
- 2026-11-19 Three actions a day, and moving costs actions \[Misa\]
- 2026-11-19 Escape and right-click close popovers on desktop; right-click is a setting \[Misa\]
- 2026-11-19 The map's hub bubble: a generic list of characters plus a place entry
- 2026-11-19 On the map the creature is one place: one outline, a seat at the arrow's end, its own popover (amended)
- 2026-11-19 The creature is the party's hub; a tap picks your own character first \[Misa\]
- 2026-11-19 A character's place is a hex or the creature; paths treat the creature as one node
- 2026-11-19 Riders stand in numbered slots on the creature's back
- 2026-11-19 The art kit draws a compact creature on trodden ground, measured against its footprint (amended)
- 2026-11-19 Characters start riding the creature \[Misa\]
- 2026-11-19 Characters ride the creature; its footprint is one place, not seven hexes \[Misa\]
- 2026-11-19 The creature stays mostly inside its footprint so the map stays readable \[Misa\] (amended)
- 2026-11-19 The creature is a behemoth: it fills its footprint and carries a small landscape (amended)
- 2026-11-19 The creature is modelled as small solids and turns to all six headings; upright props shrink part way at the high view (amended)
- 2026-11-19 The creature is drawn from above, at the map's view angle \[Misa\]
- 2026-11-19 Spring palette and a high view: tilt 0.8 \[Misa\]
- 2026-11-19 Map popovers are drawn in SVG; the view follows the creature each day
- 2026-11-19 Moving: tap your character, tap a tile, see the arrow, confirm \[Misa\] (amended)
- 2026-11-19 No focus outlines or other visible accessibility aids in the game \[Misa\]
- 2026-11-19 Touch first: drag to pan, pinch or wheel to zoom, tap or click to act \[Misa\] (amended)
- 2026-11-19 The map starts isometric, with flat ground first and heights later \[Misa\]
- 2026-11-19 Movement reads one entry rule that can name what makes a step possible
- 2026-11-19 Paths are planned by cheapest cost and walked all or nothing (amended)
- 2026-11-19 The window is always in play; lost characters stay lost
- 2026-11-19 Cliffs are impassable to characters in Milestone 1 (amended)
- 2026-11-19 The creature veers by a seeded daily roll and ignores terrain for now
- 2026-11-19 The creature faces where it walks; cliffs are escarpments (amended)
- 2026-11-19 First map art: a squashed hex plane with open-edge sides, upright props and four fog states (amended)
- 2026-11-19 Isometric 3D hexes are the long-term goal; the map is built to allow it \[Misa\] (amended)
- 2026-11-19 The look is a light ink-and-wash atlas in pastel, broken colours \[Misa\]
- 2026-11-19 Phone first, desktop too
- 2026-11-19 Accessibility is not traded away (amended)
- 2026-11-19 Focus returns to the opener only for keyboard users
- 2026-11-19 One overlay at a time (amended)
- 2026-11-19 Don't choose for the user; destructive actions go last
- 2026-11-19 Every clickable thing looks clickable, without hover
- 2026-11-19 Hidden overflow gets a hint
- 2026-11-19 Nothing fills in after the page has drawn
- 2026-11-19 Touch targets fit their context
- 2026-11-19 Show, don't tell; fewer boxes (amended)
- 2026-11-19 One spacing scale, set by containers
- 2026-11-19 Shared components are listed, guarded and reused
- 2026-11-19 Drag and drop always has a tap and keyboard alternative
- 2026-11-19 Counts read "1 / 3", and terms explain themselves without "?" icons

Superseded: 8 entries (see the topic file).
