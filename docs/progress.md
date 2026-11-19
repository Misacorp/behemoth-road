# Progress

What has landed and what is next. Newest first. Update it when a step lands or the plan changes (CLAUDE.md, Decisions and progress).

## Next

- Milestone 1 (the walking map): the map interface (`apps/web`, branch `m1/map`) is in review; then Misa tries it on a phone and a desktop.
- Milestone 2 server: validate move intents with a strict schema for a place (`{ kind: 'hex', hex }` or `{ kind: 'creature' }`, one shape only), since the core's `toPlace` is lenient.
- Before Milestone 2 persists games: pin the content (terrain table) a saved game was made with, so a later content change cannot alter it; and keep the per-tile record from growing without bound (lost tiles could be pruned).

## Done

- 2026-11-19: The creature made compact per Misa's pick (high back, moderate neck, longer tail, mostly inside its footprint), standing on trodden ground drawn in its own colour.
- 2026-11-19: The creature redrawn as a behemoth that fills its seven-hex footprint, a mossy walking hill with trees, a rock and a pond on its back; characters on its back get a contact shadow.
- 2026-11-19: Misa's art picks applied: Spring palette, tilt 0.8, and the creature redrawn from above as small solids that turn to all six headings; props shrink part way at the high view.
- 2026-11-19: Milestone 1 map interface in `apps/web`: the art kit's scene panned and zoomed by touch and mouse, three-tap moves through the core, reachable tiles, path arrow with action pips, creature step hints, hex popovers, action pips and day counter, recentre buttons, and next-day / new-game controls; a Playwright script writes phone and desktop screenshots (`node apps/web/scripts/screenshots.mjs`).
- 2026-11-19: Art kit (`packages/art`): code-drawn SVG in the ink-and-wash atlas look (palettes, paper and wash filters, isometric-style projection, tiles, props, the first creature, character standees, fog states) and a review export whose first batch is the style sample.
- 2026-11-19: Art direction chosen (light ink-and-wash atlas, pastel broken colours, isometric with flat ground first, no money spent on art) and the art review page built (`tools/art-review/`); touch-first interaction and three-tap movement agreed.
- 2026-11-19: Milestone 0: first production deploy of the blank page, verified live.
- 2026-11-19: Milestone 1 game core in `packages/core`: flat-top hex maths, seeded terrain, the creature's veering step, window, fog and grace, moves and the day tick; characters ride the creature, with a 30-day scenario test (decisions in `product.md` and `platform.md`).
- 2026-11-19: Stack agreed: a Discord Activity like creatures, one Worker with a Preact frontend, a pure `packages/core`, and one Durable Object per Discord server (decisions in `platform.md`).
- 2026-11-19: Game design and prototype plan added from the handover (`docs/GAME_DESIGN.md`, `docs/PROTOTYPE_PLAN.md`), with the game's building rules in `CLAUDE.md`.
- 2026-11-19: Project bootstrapped from the template (process, CI, security and agent tooling).
