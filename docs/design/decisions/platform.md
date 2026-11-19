# Platform and tooling

Hosting, CI and deploys, environments, dependencies, security, dev tools.

<!-- Maintained with `node scripts/decisions.mjs`; see README.md. Newest first. -->

## 2026-11-19: Game seeds are 128 bits, so the seed cannot be brute-forced from visible terrain

ID: `2026-11-19-game-seeds-are-128-bits-so` · Status: current · Amends: `2026-11-19-the-server-keeps-the-seed-clients`

**Decision.** A game's seed is four unsigned 32-bit words (`Seed`, a JSON array), made on the server with `newSeed()` (Web Crypto `getRandomValues`). Every hash keeps a 128-bit state: four lanes, one per seed word, each absorb every input and feed the next, and only the final step folds them to 32 bits. Mixing the words into one 32-bit state would leave a 32-bit equivalent key. `createGame` and the generators still accept a plain number for tests and local play (the other words are 0). This is `CONTENT_VERSION` 2, since every map differs from version 1. Version 1 was never stored, so it is not loadable.

**Reasoning.** With a 32-bit seed, a player could find it from the terrain in their view by trying every value. One terrain check takes about 3.3 µs in Node on the session container, so all 2^32 seeds take about 4 hours on one core and minutes in parallel. That would reveal the map ahead and the creature's next step, undoing "the server keeps the seed". 2^128 makes that search impossible. The hash is a fast mixing hash, not a cryptographic one: it raises the cost of guessing beyond reach for this game, with no formal guarantee. Cost: `createGame` takes about 12 ms and `nextDay` about 0.7 ms.

## 2026-11-19: Games pin their content version and prune lost tiles beyond four rings

ID: `2026-11-19-games-pin-their-content-version-and` · Status: current

**Decision.** A game records `contentVersion` (`CONTENT_VERSION` in `content/version.ts`; bump it when a content change would alter or break stored games). `loadGame` refuses a stored state whose version this code does not know, or one without its seed. Each tick drops lost tiles more than `lostTileRings` (config, 4) beyond the window, except a tile under a character, so a game's state stays bounded: at most the hexes within nine of the creature, about 270, plus one per lost character.

**Reasoning.** Reading a game with the wrong content would silently change its map or its characters. The web draws the fog four rings beyond the window and under lost characters, so nothing further is needed. A pruned hex reads as hidden; if the window ever reaches it again, it is seen afresh with the same terrain.

## 2026-11-19: Rules read a seedless view; tiles carry their terrain

ID: `2026-11-19-rules-read-a-seedless-view-tiles` · Status: current · Amends: `2026-11-19-the-server-keeps-the-seed-clients`

**Decision.** The core splits its state into `GameStateView` (everything a player may see) and `GameState` (the view plus the seed, server only). Every tile in `tiles` records its terrain id when it is first seen. Rules read terrain through `terrainOf`: known tiles first, generation only when the state has a seed. So every rule a client needs takes a view and gives the same result as on the server, and an unknown hex has no terrain on a view and cannot be entered. `toPlayerView` lists the view's fields one by one, so a server-only field added later is not sent by default. `chooseCreatureStep`, and therefore `nextDay`, refuse a state without a seed at runtime as well as in the types.

**Reasoning.** This keeps one set of rules for client and server without sending the seed. Storing terrain per known tile costs a few bytes per tile and keeps the view independent of the seed. A test checks that two seeds with the same known world give identical views.

## 2026-11-19: The server keeps the seed; clients get a player view with known terrain

ID: `2026-11-19-the-server-keeps-the-seed-clients` · Status: current, amended by `2026-11-19-game-seeds-are-128-bits-so`, `2026-11-19-rules-read-a-seedless-view-tiles`

**Decision.** From Milestone 2 the game seed never leaves the server. Clients receive a player view: the core state without the seed, with the terrain of every known tile included, so they can draw the map and plan paths with the core. The core reads terrain from known tiles first and generates new tiles only on the server. Clients refresh the view after their own actions, on becoming visible and every 30 seconds while visible; a version number makes an unchanged view cheap. The contract is in `docs/design/m2-session.md`.

**Reasoning.** With the seed, any client could compute the map ahead and the creature's next step, which defeats fog of war and, from Milestone 3, hidden sites and traps. Polling is enough for a group of about 8 taking a few actions a day; WebSockets can come later.

## 2026-11-19: The world layer's bitmap is capped at 4096 px a side and 16 MP

ID: `2026-11-19-the-world-layer-s-bitmap-is` · Status: current · Amends: `2026-11-19-the-map-pans-a-world-layer`

**Decision.** The world layer is drawn at the ink-zoom step unless its bitmap (box × raster × device pixel ratio) would pass 4096 device px on a side or 16 million pixels; then it uses the largest raster that fits (`layerRaster`, limits in `MAP_TUNING.layer`), and the CSS transform makes up the rest of the scale. The screenshot script checks that a zoom settling at a new step moves no known world point by more than 1 px.

**Reasoning.** Phone GPUs limit texture sizes, and a layer larger than the limit can be dropped or tiled badly; ink may look slightly softer at an extreme zoom instead. The settle check guards the one moment the layer is replaced under a live transform.

## 2026-11-19: The map pans a world layer by CSS transform; the scene stays memoised

ID: `2026-11-19-the-map-pans-a-world-layer` · Status: current, amended by `2026-11-19-the-world-layer-s-bitmap-is`

**Decision.** The map draws the scene and its overlays into one world `<svg>` inside an HTML `div` with `will-change: transform`. Pan and zoom set that div's CSS transform (`layerTransform`, written through the CSSOM in `cssTransform.ts`, the one exemption from the inline-style guard; the CSP allows CSSOM writes). The world `<svg>` is drawn at the current ink-zoom step and redrawn only when a gesture settles at a new step or the game state changes. The paper grain sits in its own static `<svg>` above it, and a full-screen `svg.map` on top takes the pointer and holds the popover. Filters stay on during gestures (the old `lite` toggle is gone, since toggling forced a full redraw on release). The scene layers render through a component that skips re-rendering unless they change, and the bubble's figure and creature drawings are module constants.

**Reasoning.** Measured with `apps/web/scripts/perf.mjs` (Pixel 7 profile, CPU 4× and 6×): panning re-rasterised the whole SVG every frame, about 1.1 s of raster per drag, while filters, grain or half the paths saved only 15–25%. A CSS transform on an HTML layer lets the compositor move the finished bitmap: raster during a drag went from about 1.2 s to 0, tap latency from 120/160 ms to 64/88 ms, release from about 55 ms to 22 ms, and dropped frames from 5–6 to 1–2 per drag. `will-change` on an SVG `<g>` would only help in Chromium; the HTML layer works in WebKit too. The settled look is unchanged: screenshots before and after differ only in single grain pixels (0.03–0.05%), also at another zoom step.

## 2026-11-19: Vulnerable transitive packages are fixed by bumping the direct dependency, else by a scoped exact override

ID: `2026-11-19-vulnerable-transitive-packages-are-fixed-by` · Status: current

**Decision.** When an alert names a transitive package, bump the direct dependency in the catalog to a release that is at least 7 days old and carries the fix. Only when no such release exists, add an entry under `overrides` in `pnpm-workspace.yaml`. The entry is scoped to the vulnerable range (`'pkg@<range>': exact`), pins an exact version that is at least 7 days old, and has a comment naming the advisory and when to remove it. The first one is `minimatch` 11.0.8 for GHSA-g3hv-75wg-m249: eslint 10.15.0 and typescript-eslint 8.73.0 bring the fix but are not yet 7 days old.

**Reasoning.** Bumping the direct dependency keeps the tree as its authors tested it. A scoped override fixes only the vulnerable copies, stays within the release-age rule, and says when it can go.

## 2026-11-19: Art terrain looks are keyed by the core's terrain ids

ID: `2026-11-19-art-terrain-looks-are-keyed-by` · Status: current

**Decision.** Each art kit terrain look (`TERRAIN_LOOKS`) is keyed by a core terrain id, so the map passes the core's id straight through. The look for open grassland is renamed from `meadow` to `plains`. Looks with no core terrain yet (`pines`, `hills`, `rocks`, `lake`) stay, and unknown ids still fall back to the neutral look. A web test checks every core terrain id has a look.

**Reasoning.** One name per terrain avoids a mapping table that would drift as terrains are added. Renaming changes the review sheets that drew `meadow` tiles, so their items count as changed in the next review export.

## 2026-11-19: The map pans by one transformed group and drops its SVG filters during gestures

ID: `2026-11-19-the-map-pans-by-one-transformed` · Status: current

**Decision.** The art kit's scene and the overlays sit in one `<g>` whose `transform` attribute is set directly in a requestAnimationFrame callback, without re-rendering Preact per frame. While a drag, pinch or wheel zoom runs, a `lite` class switches off the wash and ink filters by CSS; they return when the gesture ends. This class does the same as the art kit's `effects: 'lite'`, without redrawing the scene at each gesture's start and end. The map draws its scene with the art kit's new `frame: 'none'` option (no page paper, vignette or grain over the scene's box, whose edge would show while panning) and draws `paperGrain` once over the whole screen, outside the moving group. The scene is drawn for the current zoom (`zoom`, `minInkPx: 1`), rounded to half powers of two and updated when a gesture settles, so ink never thins below one screen pixel. Taps use the art kit's `screenToHex` directly: the map draws the scene's children without its viewBox, so world px are drawing coordinates. `SvgNode` trees reach the page only through a mapper (`apps/web/src/map/svgToPreact.ts`) that applies the art kit's `ALLOWED_TAGS` and `isAllowedAttribute`, and adds `svgAllow.ts`: only local `url(#id)` references, no markup or `javascript:` in values, and none of Preact's own props (`dangerouslySetInnerHTML`, `ref`, `key`, `children`, `class`). The art kit's `isForbiddenAttr` now refuses those names too.

**Reasoning.** The art kit's name check is written for `toSvgString` and would pass `dangerouslySetInnerHTML`, which Preact turns into innerHTML, so the page keeps its own check of Preact props. Displacement filters are the expensive part of the art and are re-run when the transformed content changes; dropping them during a gesture keeps panning smooth on phones at the cost of a brief flatter look. Measured in headless Chromium with the CPU slowed 4x: median frame 16.7 ms on both sizes, p95 16.7 ms on the phone size and 50 ms on the desktop size.

## 2026-11-19: Milestone 1 dev controls show in every environment

ID: `2026-11-19-milestone-1-dev-controls-show-in` · Status: current · Amends: `2026-11-19-dev-tools-exist-only-in-staging`

**Decision.** In Milestone 1 the whole page is a local, single-player prototype: the game state lives in the browser and nothing reaches the server. So the "next day" and "new game" controls show in every environment, production included, as two small dashed buttons in the top-right corner. "New game" uses the next seed (`MAP_TUNING.seed + n`), so every game can be replayed. Milestone 2 moves the day tick to the server and hides these controls in production, as the staging-only rule requires.

**Reasoning.** Misa tests the prototype wherever it is deployed, and skipping days and starting over after getting lost on purpose are what Milestone 1 is for. With no server state there is nothing a dev control could damage.

## 2026-11-19: Terrain comes from seeded noise fields, with rivers and ridges on contour lines

ID: `2026-11-19-terrain-comes-from-seeded-noise-fields` · Status: current · Amends: `2026-11-19-the-core-derives-terrain-from-a`

**Decision.** Terrain is laid out by rules in `content/generation.ts`, read in order, first match wins, with plains as the fallback. Each rule reads a named, seeded value-noise field (`noise.ts`: lattice values from the hash, quintic smoothing, each octave rotated so the grid never shows). A rule claims a hex when the field is above or below a value (forest on wet ground, desert on dry), or when the hex is on a contour line: at or above the value with a neighbour below it. Rivers sit on one contour of a water field, and cliffs on a rock field's contour where a highland mask allows it. Contour ribbons are one hex wide and always connected. Tuned to about 65 to 70% plains, with regions a few hexes across and a river crossed every 15 to 20 hexes of walking north. `terrainAt(seed, hex)` stays pure and samples at most seven hexes per field.

**Reasoning.** Per-hex picks looked speckled, and a fixed-width band around a contour gave blobs where the field was flat and gaps where it was steep. The contour test fixes both without any stored state, and the numbers stay in content data.

## 2026-11-19: The core derives terrain from a hash and stores only tile knowledge and the config

ID: `2026-11-19-the-core-derives-terrain-from-a` · Status: current, amended by `2026-11-19-terrain-comes-from-seeded-noise-fields`

**Decision.** A hex's terrain is a weighted pick from the terrain data using a hash of (seed, q, r); each hex is independent, with no clustering yet. The game state stores the seed, the day, the creature, the characters, the tuning config the game was created with, and tile knowledge only for hexes that have been in view (`seen` with the day it left the window, or `lost`). Hidden is the absence of an entry. The state is plain JSON.

**Reasoning.** The map is never stored whole and any tile can be generated on demand, as the design asks. Keeping the config in the state means every rule in a game reads the same numbers, and a stored game replays identically. Clustered terrain (rivers that flow, forests in patches) can replace the per-hex pick later without a state change.

## 2026-11-19: Art output is held to a tag and attribute allowlist, with a lite mode for slow phones

ID: `2026-11-19-art-output-is-held-to-a` · Status: current

**Decision.** `toSvgString` accepts only the tags in `ALLOWED_TAGS` (shapes, groups, gradients and the three filter primitives in use) and refuses attribute names starting with `on`, `href`, `xlink:href` and `style`; both lists are exported so the web app's Preact mapper enforces the same. `renderScene` refuses an `idPrefix` outside `[\w-]+`. Scenes take `effects: 'full' | 'lite'`: `lite` drops the displacement, turbulence and grain filters for panning or slow phones, and `full` stays the default. Ink width has a floor in screen pixels (`ART_TUNING.minInkPx`, 1 px) given the scene's `zoom`, so faint lines survive zooming out. `screenToHex` inverts the projection for taps; it ignores side faces while all tiles share one height.

**Reasoning.** The tree reaches the page without `innerHTML`, but an allowlist keeps a future data-driven drawing from emitting scripts or links. Filters are the most expensive part of the art on phones, so the map needs a way to switch them off. At 390 px the review showed dotted outlines and the ruin nearly vanishing.

## 2026-11-19: Map ground merges into one path per paint; hexes are hit-tested by maths

ID: `2026-11-19-map-ground-merges-into-one-path` · Status: current

**Decision.** The ground layer merges every shape with the same paint (tile tops of one terrain, side faces, washes, marks, river strokes, outlines) into one `<path>`, and the paper, wash and ink effects are SVG filters applied once per layer, never per tile. Tiles are not separate elements, so the map finds the tapped hex from the pointer position with hex maths. A 91-hex isometric scene with every terrain, the creature and a character measured 837 nodes; a test holds it under 1250.

**Reasoning.** Phones were the worry: per-tile elements and per-tile filters multiply DOM size and filter cost by the number of hexes. Hex picking by maths is exact and also works for the isometric view through the one projection function.

## 2026-11-19: The art kit is a pure package that returns an SVG element tree

ID: `2026-11-19-the-art-kit-is-a-pure` · Status: current

**Decision.** The game's art lives in `packages/art` (`@behemoth-road/art`): pure TypeScript with no DOM and no runtime dependencies. Drawing functions return a small element tree (`SvgNode = { tag, attrs, children }`), not strings; `toSvgString` serialises it for export files and tests, and the web app will map nodes to Preact elements. Art keys off plain data (terrain id strings, cell states, seeds) and does not import `packages/core`. Colours are written only in `palette.ts` (a test checks both the source and every colour in the output). `pnpm --filter @behemoth-road/art review` writes a review batch to `packages/art/review-out/` (gitignored) using Node's built-in type stripping, so it needs Node 22.18 or later.

**Reasoning.** The web app bans `innerHTML`, so strings could not reach the page safely; a tree maps to Preact directly. Keeping art free of the core lets both be built in parallel and lets the review export run without a browser or a build step.

## 2026-11-19: Hostnames stay out of the README and workflows

ID: `2026-11-19-hostnames-stay-out-of-the-readme` · Status: current

**Decision.** The production and staging hostnames are not written in the README or in workflow files; the deploy job sets no environment URL. They stay only where deploys and checks need them: `apps/worker/wrangler.jsonc` (the Worker's custom domains), `project.config.json` (read by `scripts/deployed.mjs` and `scripts/github-setup.mjs`) and the setup checklist.

**Reasoning.** Misa prefers not to advertise the URLs in a public repository. The hostnames are not secret (certificate transparency logs and Discord's URL mapping list them), so access control, not obscurity, protects the game; moving them out of `wrangler.jsonc` would add deploy-time templating for little gain.

## 2026-11-19: One Durable Object per Discord server holds the game; its alarm runs the day tick

ID: `2026-11-19-one-durable-object-per-discord-server` · Status: current

**Decision.** Each Discord server's game lives in one SQLite-backed Durable Object, keyed by the server's guild id, as in creatures. The object runs one request at a time and writes in transactions; schema changes run through an in-code migration runner. The daily tick is the object's alarm, computed in the group's time zone; in local development and staging an admin "next day" calls the same tick function on demand. Milestone 1 needs no storage; this applies from Milestone 2.

**Reasoning.** Creatures runs this way in production. One object per server matches "one session per server", serialised requests remove write races for a group of about 8, and D1 lacks interactive transactions. Cloudflare cron triggers are UTC only, which is why creatures moved to alarms.

## 2026-11-19: The game core is its own pure package, imported by the Worker and the frontend

ID: `2026-11-19-the-game-core-is-its-own` · Status: current

**Decision.** All game rules live in `packages/core`: hex maths, map generation, the creature, the window, actions and the day tick, plus content data and one tuning config. It has no UI, network or storage code, takes a seed for all randomness, and exposes pure functions from state and input to new state. The Worker and the frontend import it as a workspace package.

**Reasoning.** The same rules then validate actions on the server, predict outcomes in the client, and later run headless balancing simulations. Creatures splits its packages the same way.

## 2026-11-19: Players open the game as a Discord Activity, like creatures **[Misa]**

ID: `2026-11-19-players-open-the-game-as-a` · Status: current

**Decision.** The game runs as a Discord Activity, launched from inside Discord on phone and desktop, with no separate website login. Sign-in reuses creatures' approach: the Embedded App SDK's authorize code is exchanged by the Worker, the Discord server comes from the Activity instance as reported to the bot, and the session is an HMAC-signed bearer token. The frontend keeps Discord-specific code at its edges so a browser login could be added later. Milestone 1 has no sign-in and is a plain page.

**Reasoning.** Misa chose this over a website with "Sign in with Discord". Creatures' sign-in already works, and Discord vouches for which server a player is in, so no membership check is needed.

## 2026-11-19: Decisions live in docs/design/decisions, one file per topic

ID: `2026-11-19-decisions-live-in-docs-design-decisions` · Status: current

**Decision.** Design decisions are kept in `docs/design/decisions/`, one Markdown file per topic listed in `topics.json`, newest first. `node scripts/decisions.mjs` adds, queries and checks them, and generates `README.md`, the index of the entries in force. A changed decision gets a new entry that supersedes or amends the old one; old entries are not rewritten.

**Reasoning.** One file per topic keeps each file short enough to read whole, and the generated index lets an agent see what is in force without opening every file. Ids, statuses and the index are derived by the tool, so they never drift and merges stay simple. CI runs `check` to keep it that way.

## 2026-11-19: Agents never merge; main accepts changes only through PRs

ID: `2026-11-19-agents-never-merge-main-accepts-changes` · Status: current

**Decision.** A ruleset on `main` requires a PR and the `ci` check, with no bypass and no force push. Only the owner merges. Agent settings deny the merge and auto-merge tools and `gh pr merge`.

**Reasoning.** The ruleset already stops direct pushes from everyone, so no agent-side push guard is needed. Merges are different: the GitHub connection acts as the owner's account, so GitHub cannot tell an agent's merge from the owner's, and only a deny rule stops it.

## 2026-11-19: CI runs parallel jobs behind one required gate job

ID: `2026-11-19-ci-runs-parallel-jobs-behind-one` · Status: current

**Decision.** CI runs its work as parallel jobs (checks, test shards, the rest) and one aggregate `ci` job that depends on all of them. The `main` ruleset requires only `ci`. The target is under 5 minutes wall time.

**Reasoning.** Parallel jobs took CI from about 10 minutes to under 3. A single gate keeps the ruleset stable while jobs are added, split or renamed.

## 2026-11-19: Documentation-only PRs skip the build and tests, but never the gate

ID: `2026-11-19-documentation-only-prs-skip-the-build` · Status: current

**Decision.** The CI workflow runs on every PR, and a small `changes` job diffs it against its base so the build and test jobs run only when it finds code. Documentation is a short explicit list (Markdown and `docs/`, minus any folder a test reads) and anything else counts as code; the format check and the security job always run. `ci` accepts a skipped test job only when `changes` succeeded and found documentation only.

**Reasoning.** `paths-ignore` would skip the whole workflow, so the required `ci` check would never report and the PR would stay blocked. Listing documentation, not code, means a new folder or file type can never silently skip tests.

## 2026-11-19: Agents push after quick local checks; CI runs the full check

ID: `2026-11-19-agents-push-after-quick-local-checks` · Status: current

**Decision.** Before pushing, an agent runs the quick checks for what it changed (format, the decisions check, and lint, typecheck and tests of the touched packages), and CI runs the full check on the pushed commit. Lint runs per package with a cache and the formatter with its cache, so repeat local runs take seconds. A red CI run is fixed on the branch before the owner hears the PR is ready.

**Reasoning.** A full local check before every push cost about 15 minutes per small round and held pushes back, while CI runs the same check anyway. One lint run over all packages ran out of memory; per-package runs with a cache fixed that without raising memory limits.

## 2026-11-19: Each rule is tested once, at the lowest layer that can prove it

ID: `2026-11-19-each-rule-is-tested-once-at` · Status: current

**Decision.** Tests are layered (pure logic, server integration, client-server contract, client, then any simulation or browser checks), and each rule is proven once at the lowest layer that can prove it; an integration test that needs a loop or more than about 5 requests moves the property down and keeps one wiring test. Each layer has a speed budget, and a timeout is a budget: a slow test is split or moved down, never given a longer timeout. Tests are deterministic, with seeded randomness and an injected clock.

**Reasoning.** With no written plan, long timeouts hid slow growth: one "tiny" test run grew from about a second to 37 s and CI from a few minutes to 10. Budgets make slowness a finding instead of something nobody notices.

## 2026-11-19: Guards must be shown to fail, and must explain their changes

ID: `2026-11-19-guards-must-be-shown-to-fail` · Status: current

**Decision.** A new guard test is run against the old code to show it catches its bug, and a pinned hash or snapshot is re-pinned only with a sentence in the PR on what moved and why (one re-pinned on every change is replaced with readable assertions). A tool or migration that changes stored data gets one test that starts from data an earlier version left behind. A part that can render in several hosts (a page, a popover, a drawer) is tested in each.

**Reasoning.** A guard nobody saw fail may guard nothing, and a hash re-pinned every time is not a guard. Bugs reached the owner from a dev tool tried only on a fresh server, and from a component that worked on its page but broke inside a popover.

## 2026-11-19: Dependencies are few, exact, aged and script-free

ID: `2026-11-19-dependencies-are-few-exact-aged-and` · Status: current

**Decision.** Dependencies are minimal and exact, the lockfile is committed and installed with `--frozen-lockfile`, a release must be at least 7 days old (`minimumReleaseAge`), and install scripts are blocked except an explicit allowlist. Dependabot runs weekly with a cooldown (7 days, 14 for majors), grouped, with security updates bypassing it; packages that must move together are grouped and upgraded together after reading the upgrade guide against the code. For dev tooling such as a component gallery, a small home-grown tool on the existing build is preferred to a framework with a large dependency tree.

**Reasoning.** Recent npm worms spread through stolen maintainer tokens and install scripts and were usually caught within days, so a release age and blocked scripts stop most of them. Every package is supply-chain surface the owner cannot review, and a large dev tool brings a second build system that the existing gates do not cover.

## 2026-11-19: Workflows follow a fixed hardening list

ID: `2026-11-19-workflows-follow-a-fixed-hardening-list` · Status: current

**Decision.** Every workflow has top-level `permissions: {}` with least privilege per job, every action pinned to a full commit SHA with a version comment, `persist-credentials: false` on checkout, and no `pull_request_target`, `workflow_run` or `issue_comment` triggers. Values from `github.event` pass through `env:`, never into `run:`. Downloaded CLI tools are checked against pinned SHA-256 hashes, and CI lints workflows with actionlint and audits them with zizmor.

**Reasoning.** Tags can be repointed to malicious code, as in the 2025 tj-actions compromise, so only SHAs are safe. Comment-driven triggers would let a stranger's comment run code with write tokens.

## 2026-11-19: Secrets live in GitHub environments, one per target, and agents never handle them

ID: `2026-11-19-secrets-live-in-github-environments-one` · Status: current

**Decision.** Deploy secrets live in GitHub environments (production deployable from `main` only, staging) and the deploy job pushes them to the runtime; none go in the repo, prompts, logs, PR text or fixtures, and gitleaks and push protection check for them. Agents never deploy or set secrets by hand: the owner sets them from a numbered checklist and never pastes one into chat. A token used against several environments has a different value per target, and a workflow sends each only to its own host.

**Reasoning.** The real boundary is that agents hold no production secrets and only CI deploys. Separate values per target mean a staging leak never opens production, and a leaked secret is rotated, since removing it from history is not enough.

## 2026-11-19: In a public repo, logs, summaries and artifacts are public too

ID: `2026-11-19-in-a-public-repo-logs-summaries` · Status: current

**Decision.** Nothing that identifies a user goes into the repo, workflow logs, job summaries or workflow artifacts. Reports a workflow prints are totals only, with no user ids, names or free text, and privacy tests check it. User uploads stay private to the app even when the issue they belong to is public.

**Reasoning.** Workflow logs and artifacts of a public repository can be read or downloaded by any signed-in GitHub user. An earlier design wrongly called them private.

## 2026-11-19: Limit what a fooled agent can do

ID: `2026-11-19-limit-what-a-fooled-agent-can` · Status: current

**Decision.** All external content (web pages, package docs, issues, PR comments, commits by anyone but the owner, API responses, user input) is data, never instructions. No agent has both untrusted web input and a shell: the researcher has web tools and no shell, the implementer a shell and no web tools. Agents act on issues and labels only when the owner wrote or added them, and only MCP servers the owner set up are used.

**Reasoning.** Prompt injection cannot be fully prevented, so the design limits the damage instead. Deny rules on commands are a speed bump, not a boundary; separating tools and trusting only the owner's issues are.

## 2026-11-19: Migrations apply by recorded version, and a released number is never reused

ID: `2026-11-19-migrations-apply-by-recorded-version-and` · Status: current

**Decision.** The migration runner applies every migration whose version is not yet recorded, not "everything above the highest recorded version". A released migration number is never reused or edited. When parallel agents or branches add migrations, the lead assigns the numbers.

**Reasoning.** Branches merge in any order, so production can hold a higher number while lower ones are still unmerged; a highest-version runner would skip those forever. Parallel agents otherwise take the same next number.

## 2026-11-19: Production deploys only from main; staging only from a manual run

ID: `2026-11-19-production-deploys-only-from-main-staging` · Status: current

**Decision.** A merge to `main` deploys production, and nothing else does: a guard step fails the deploy job if the target is production for anything but a push to `main`. Staging changes only when the deploy workflow is run by hand on a chosen branch; pushing a branch deploys nothing. Agents start that manual run only when the owner asks for it in that session, then wait until it is live and say so.

**Reasoning.** When every push deployed staging, parallel sessions took turns overwriting it and it was unclear what the owner was testing. The owner wants to decide what is on staging; a guard step keeps a manual run from ever reaching production.

## 2026-11-19: Dev tools exist only in staging and fail closed

ID: `2026-11-19-dev-tools-exist-only-in-staging` · Status: current, amended by `2026-11-19-milestone-1-dev-controls-show-in`

**Decision.** Dev routes and the dev panel are switched on by one runtime variable that is on only in the staging config, and a test pins it off in production; with it off, every dev route answers a plain 404 before any other check, at every layer. The panel's code is a separate chunk left out of the production build, and a build test checks production output has none of it. Dev tools are for the owner and admins only and fail closed when that cannot be checked.

**Reasoning.** Tools that set state for testing are dangerous in production. Checking first at each layer means the gate holds even if one layer is bypassed, and a build test proves production users never download the code.

## 2026-11-19: Large reworks run behind a staging-only flag

ID: `2026-11-19-large-reworks-run-behind-a-staging` · Status: current

**Decision.** A large rework is built behind a runtime flag that is on in staging and pinned off in production by a test. Anything long-lived (a run, a period, a stored job) records which rules version it started under, and the client follows that stored version, not the flag. The flag is read only when something starts.

**Reasoning.** Storing the version at the start means a flag flip never changes work already under way, and old records still replay under their own rules. The rework can merge to `main` early without changing production.

## 2026-11-19: Destructive one-off operations are built inert

ID: `2026-11-19-destructive-one-off-operations-are-built` · Status: current

**Decision.** A destructive one-off (a data wipe, a bulk migration, a reset) merges with nothing in production able to call it, and staging gets a read-only dry run. The wipe refuses to run without proof that the backup step succeeded for the same data, and a test scans the source so no route, timer or tool can reach it unnoticed. The release that turns it on is a small, explicit wiring PR that must also change that test.

**Reasoning.** The owner wants to review such work on staging before it can touch real users. Making "back up first, then wipe" a property of the code, not of whoever triggers it, means a mistake in the trigger cannot lose data.

## 2026-11-19: A script tells agents which commit is deployed

ID: `2026-11-19-a-script-tells-agents-which-commit` · Status: current

**Decision.** A small script reads the deployed branch and commit from the public config endpoint of the fixed production and staging hosts (read-only, no URL from the caller), compares them with a ref and can wait until a commit is live. The deploy workflow's last step runs the same check, so a green run means the commit is live. The page also carries the branch and commit in meta tags.

**Reasoning.** Without it, every deploy ended with asking the owner to read a footer. A fixed host list keeps the script from becoming a general fetch tool for agents that are otherwise denied curl.

## 2026-11-19: Client-server contract fixtures are captured from the real server

ID: `2026-11-19-client-server-contract-fixtures-are-captured` · Status: current

**Decision.** The fixtures the client tests read are captured by one command that plays seeded scenarios against the real server code, writes the files whole and maps random ids to stable ones; they are never edited by hand. Its `--check` mode runs in CI and fails if a capture would change a file, and after a capture the PR says what moved and why. The server proves its responses match the fixtures and the client proves it parses every one.

**Reasoning.** Hand-kept fixtures drifted on `main` and carried hand-typed numbers. Captured fixtures keep the two sides in sync without end-to-end browser tests, and stable ids make a re-capture show only real changes.

## 2026-11-19: Measure costs before guessing, and price work that repeats

ID: `2026-11-19-measure-costs-before-guessing-and-price` · Status: current

**Decision.** Performance and quota work starts from a measurement on realistic data, and the probe becomes a test with a budget (about 1.5x the measured value, kept next to it; raising one needs a reason in the PR). Work that repeats on a timer, a poll or every request is priced per day before it ships, remembering that staging counts against the same account quotas. Nothing that must last between requests lives in memory, because the runtime may drop it seconds after a request.

**Reasoning.** Guesses were wrong twice in one week, and a free-tier limit was hit twice by small work that ran every minute, not by big tables. Memory "caches" were recomputed on almost every request because instances sleep and restart.

## 2026-11-19: One Worker serves the frontend and the API, configured as code

ID: `2026-11-19-one-worker-serves-the-frontend-and` · Status: current

**Decision.** One Cloudflare Worker serves the static frontend and the API under `/api/*` on one origin, so the frontend uses relative URLs; the frontend is Vite, Preact and strict TypeScript, and request bodies are checked with strict Valibot schemas. Infrastructure is declared in `wrangler.jsonc` and applied by CI, which runs `wrangler` from the project's own lockfile rather than a marketplace deploy action; only one-time tokens are set up by hand. The project starts on the Workers Free plan and upgrades only when a measured limit blocks it.

**Reasoning.** One origin and one deploy pipeline mean one set of credentials and one place to look when something breaks. Running the deploy CLI from the lockfile hands the Cloudflare token only to pinned, aged code. Preact and Valibot keep bundles small, and JSX escapes text by default.

## 2026-11-19: Strict security headers, and everything served from our own origin

ID: `2026-11-19-strict-security-headers-and-everything-served` · Status: current

**Decision.** The frontend sends a strict CSP (`default-src 'self'`, no inline scripts or styles, `object-src 'none'`, `base-uri 'none'`) plus `nosniff`, a referrer policy, HSTS and a permissions policy, and fonts and other assets are self-hosted with their licence texts shipped. API responses carry `Cache-Control: no-store` and no CORS headers. Text is rendered as text only; `innerHTML` and `dangerouslySetInnerHTML` are banned by lint.

**Reasoning.** Serving everything from one origin keeps the CSP simple and removes third-party requests. Banning raw HTML in lint makes the safe path the only one.
