# Progress

What has landed and what is next. Newest first. Update it when a step lands or the plan changes (CLAUDE.md, Decisions and progress).

## Next

- Milestone 4 (the living creature: hidden needs and reactions, fire, the Keeper): plan in `docs/design/m4-creature.md`; core and art first on `m4/*`, worker and web once Milestone 3 is on `m3/integration`; merged on `m4/integration`.
- Milestone 3 (the first chain: Scout, Engineer, Scholar): plan in `docs/design/m3-chain.md`; core, worker, web and art on `m3/*`, merged on `m3/integration`.
- Before Milestone 2 persists games: pin the content (terrain table) a saved game was made with, so a later content change cannot alter it; and keep the per-tile record from growing without bound (lost tiles could be pruned).

## Done

- 2026-11-19: Milestone 2 merged and live (PR #7): Discord Activity sign-in, one game per allowed server, joining with rolled characters and roles, other players on the map, the daily tick; tried on staging by Misa.
- 2026-11-19: Milestone 2 web client (branch `m2/web`): Activity boot with a dev-only fake session, a typed and parsed API client with polling, the map on the player view, the join and replace drawer, other players and their cards, and next day for admins with dev tools. Hand-written fixtures stand in for the worker's captured ones until they exist.
- 2026-11-19: Milestone 2 server on `m2/worker`: Discord Activity sign-in (from creatures), one `GuildWorld` Durable Object per server with the game, players and sessions in SQLite, the game API with strict Valibot schemas (move intents take exactly one place shape), the 06:00 Helsinki day tick as the object's alarm with catch-up, the staging-only admin "next day", the Launch interactions endpoint and the deploy's Discord steps, a local dev login, and contract fixtures for the web app captured from the Worker (`pnpm fixtures:capture`, checked in CI).
- 2026-11-19: Art for Milestone 2: role emblems in a shared frame, an icon system by content icon key with a neutral fallback, icons for the 12 traits and 12 quirks, and varied character looks (headwear, garment, carry, skin; eight accents) seeded by id.
- 2026-11-19: Phone performance: the map now pans a composited world layer by CSS transform (no re-raster while panning), with memoised scene layers; measured with `apps/web/scripts/perf.mjs`.
- 2026-11-19: Milestone 1 polish from Misa's first play (branch `m1/map-polish`): Escape and right-click close popovers (right-click behind a setting); popovers point at their subject; grace-day tiles and characters on them are marked, and the grace rule is tested end to end.
- 2026-11-19: Milestone 1 merged and live: the walking map with riding, the hub bubble, the Spring palette at a high view and the compact creature (PR #4).
- 2026-11-19: The creature made compact per Misa's pick (high back, moderate neck, longer tail, mostly inside its footprint), standing on trodden ground drawn in its own colour.
- 2026-11-19: The creature redrawn as a behemoth that fills its seven-hex footprint, a mossy walking hill with trees, a rock and a pond on its back; characters on its back get a contact shadow.
- 2026-11-19: Misa's art picks applied: Spring palette, tilt 0.8, and the creature redrawn from above as small solids that turn to all six headings; props shrink part way at the high view.
- 2026-11-19: Milestone 1 map interface in `apps/web`: the art kit's scene panned and zoomed by touch and mouse, three-tap moves through the core, reachable tiles, path arrow with action pips, creature step hints, hex popovers, action pips and day counter, recentre buttons, and next-day / new-game controls; a Playwright script writes phone and desktop screenshots (`node apps/web/scripts/screenshots.mjs`). Riding: board, ride, step off and cross the creature, with the creature as one place and its own popover.
- 2026-11-19: Art kit (`packages/art`): code-drawn SVG in the ink-and-wash atlas look (palettes, paper and wash filters, isometric-style projection, tiles, props, the first creature, character standees, fog states) and a review export whose first batch is the style sample.
- 2026-11-19: Art direction chosen (light ink-and-wash atlas, pastel broken colours, isometric with flat ground first, no money spent on art) and the art review page built (`tools/art-review/`); touch-first interaction and three-tap movement agreed.
- 2026-11-19: Milestone 0: first production deploy of the blank page, verified live.
- 2026-11-19: Milestone 1 game core in `packages/core`: flat-top hex maths, seeded terrain, the creature's veering step, window, fog and grace, moves and the day tick; characters ride the creature, with a 30-day scenario test (decisions in `product.md` and `platform.md`).
- 2026-11-19: Stack agreed: a Discord Activity like creatures, one Worker with a Preact frontend, a pure `packages/core`, and one Durable Object per Discord server (decisions in `platform.md`).
- 2026-11-19: Game design and prototype plan added from the handover (`docs/GAME_DESIGN.md`, `docs/PROTOTYPE_PLAN.md`), with the game's building rules in `CLAUDE.md`.
- 2026-11-19: Project bootstrapped from the template (process, CI, security and agent tooling).
