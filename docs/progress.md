# Progress

What has landed and what is next. Newest first. Update it when a step lands or the plan changes (CLAUDE.md, Decisions and progress).

## Next

- Milestone 0 (foundations, `docs/PROTOTYPE_PLAN.md`): first deploy of the blank page; add the game core package with a test.
- Graphical direction: Misa picks a palette, a tilt and the creature's facing from the art review batches (`packages/art`), then the art kit is tuned and the map interface uses it.
- Milestone 1 (the walking map): game core and map interface, built in parallel, then joined.

## Done

- 2026-11-19: Art kit (`packages/art`): code-drawn SVG in the ink-and-wash atlas look (palettes, paper and wash filters, isometric-style projection, tiles, props, the first creature, character standees, fog states) and a review export whose first batch is the style sample.
- 2026-11-19: Stack agreed: a Discord Activity like creatures, one Worker with a Preact frontend, a pure `packages/core`, and one Durable Object per Discord server (decisions in `platform.md`).
- 2026-11-19: Game design and prototype plan added from the handover (`docs/GAME_DESIGN.md`, `docs/PROTOTYPE_PLAN.md`), with the game's building rules in `CLAUDE.md`.
- 2026-11-19: Project bootstrapped from the template (process, CI, security and agent tooling).
