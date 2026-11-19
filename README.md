# Behemoth Road

An asynchronous co-op game for a small Discord friend group: the players escort a mythical creature home across a hex map while it walks one step per day. The design is in `docs/GAME_DESIGN.md` and the build order in `docs/PROTOTYPE_PLAN.md`.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
```

Run the Worker (`pnpm dev` in `apps/worker`) and the frontend (`pnpm dev` in `apps/web`) side by side; the frontend proxies `/api` to the Worker.

## Deploys

- **Production**: every merge to `main`.
- **Staging**: Actions → deploy → Run workflow, on any branch.

`node scripts/deployed.mjs` shows which commit is live.

## Setup

`node scripts/github-setup.mjs` applies the GitHub settings this project relies on (ruleset, environments, Actions settings, secret scanning) and asks for missing secrets. Agents follow `CLAUDE.md`.
