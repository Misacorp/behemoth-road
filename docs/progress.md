# Progress

What has landed and what is next. Newest first. Update it when a step lands or the plan changes (CLAUDE.md, Decisions and progress).

## Next

- Milestone 0 (foundations, `docs/PROTOTYPE_PLAN.md`): first deploy of the blank page; add the game core package with a test.
- Graphical direction: research AI-assisted art workflows, then a session with Misa to choose a visual direction before any major graphics are built.
- Milestone 1 (the walking map): game core (`m1/core`) and art kit (`m1/art`) in parallel cloud sessions, then the map interface on top of both.
- Before Milestone 2 persists games: pin the content (terrain table) a saved game was made with, so a later content change cannot alter it; and keep the per-tile record from growing without bound (lost tiles could be pruned).

## Done

- 2026-11-19: Stack agreed: a Discord Activity like creatures, one Worker with a Preact frontend, a pure `packages/core`, and one Durable Object per Discord server (decisions in `platform.md`).
- 2026-11-19: Game design and prototype plan added from the handover (`docs/GAME_DESIGN.md`, `docs/PROTOTYPE_PLAN.md`), with the game's building rules in `CLAUDE.md`.
- 2026-11-19: Project bootstrapped from the template (process, CI, security and agent tooling).
