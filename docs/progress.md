# Progress

What has landed and what is next. Newest first. Update it when a step lands or the plan changes (CLAUDE.md, Decisions and progress).

## Next

- Milestone 1 (the walking map): Misa picks a palette, a tilt and the creature's facing from the art review batches; the map interface (`apps/web`, branch `m1/map`) is in review; then Misa tries it on a phone and a desktop.
- Before Milestone 2 persists games: pin the content (terrain table) a saved game was made with, so a later content change cannot alter it; and keep the per-tile record from growing without bound (lost tiles could be pruned).

## Done

- 2026-11-19: Milestone 1 map interface in `apps/web`: the art kit's scene panned and zoomed by touch and mouse, three-tap moves through the core, reachable tiles, path arrow with action pips, creature step hints, hex popovers, action pips and day counter, recentre buttons, and next-day / new-game controls; a Playwright script writes phone and desktop screenshots (`node apps/web/scripts/screenshots.mjs`).
- 2026-11-19: Art kit (`packages/art`): code-drawn SVG in the ink-and-wash atlas look (palettes, paper and wash filters, isometric-style projection, tiles, props, the first creature, character standees, fog states) and a review export whose first batch is the style sample.
- 2026-11-19: Art direction chosen (light ink-and-wash atlas, pastel broken colours, isometric with flat ground first, no money spent on art) and the art review page built (`tools/art-review/`); touch-first interaction and three-tap movement agreed.
- 2026-11-19: Milestone 0: first production deploy of the blank page, verified live.
- 2026-11-19: Milestone 1 game core in `packages/core`: flat-top hex maths, seeded terrain, the creature's veering step, window, fog and grace, moves and the day tick, with a 30-day scenario test (decisions in `product.md` and `platform.md`).
- 2026-11-19: Stack agreed: a Discord Activity like creatures, one Worker with a Preact frontend, a pure `packages/core`, and one Durable Object per Discord server (decisions in `platform.md`).
- 2026-11-19: Game design and prototype plan added from the handover (`docs/GAME_DESIGN.md`, `docs/PROTOTYPE_PLAN.md`), with the game's building rules in `CLAUDE.md`.
- 2026-11-19: Project bootstrapped from the template (process, CI, security and agent tooling).
