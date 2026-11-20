# Behemoth Road

An asynchronous co-op game for a small Discord friend group: the players escort a mythical creature home across a hex map while it walks one step per day. The design is in `docs/GAME_DESIGN.md` and the build order in `docs/PROTOTYPE_PLAN.md`.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
```

Run the Worker (`pnpm dev` in `apps/worker`) and the frontend (`pnpm dev` in `apps/web`) side by side; the frontend proxies `/api` to the Worker. First copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`. The Worker serves `apps/web/dist` too: its `pnpm dev` creates an empty one if it is missing (then use the Vite dev server for the frontend), or run `pnpm --filter @behemoth-road/web build` first to serve the built app from the Worker on port 8787. Outside Discord, `POST /api/dev/login` with `{ "player": 1 }` (1 to 9) signs in a fake player of a local test server; it exists only under `wrangler dev`.

## Deploys

- **Production**: every merge to `main`.
- **Staging**: Actions → deploy → Run workflow, on any branch.

`node scripts/deployed.mjs` shows which commit is live.

## Setup

`node scripts/github-setup.mjs` applies the GitHub settings this project relies on (ruleset, environments, Actions settings, secret scanning) and asks for missing secrets. Agents follow `CLAUDE.md`.
