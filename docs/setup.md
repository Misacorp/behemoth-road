# Setup checklist

One-time steps that only Misa can do, written when the project was bootstrapped. Agents: a hook reminds you at the start of a session while a box is open. Check what you can yourself first (for example `gh api repos/Misacorp/behemoth-road/rulesets`), then raise the rest with Misa once, as one numbered list. Tick a box in your next PR when it is confirmed done. Steps that need things the project doesn't have yet wait until it does; say so instead of asking.

- [x] **GitHub settings.** On your own machine, from the repo root: `node scripts/github-setup.mjs --user Misacorp`. It protects `main`, makes merges squash-only with the PR title and description as the commit, locks down Actions, turns on secret scanning and creates the environments. Re-run it after changing `project.config.json`.
- [x] **Claude's access to this repository.** If the Claude GitHub App is limited to selected repositories: GitHub, Settings, Applications, Claude, Configure, Repository access, add `Misacorp/behemoth-road`. Without it, cloud sessions can read but not push.

- [x] **What the project is.** Tell an agent in a paragraph; it fills the TODOs in `CLAUDE.md`, `README.md` and `docs/progress.md`.

- [x] **The domain on Cloudflare.** `behemoth.misacorp.dev` and `behemoth-staging.misacorp.dev` must be in a zone on your Cloudflare account (the Worker claims the hostname itself on the first deploy).
- [x] **Cloudflare credentials in GitHub.** Create an API token from the "Edit Cloudflare Workers" template, limited to your account and that zone, and copy your account ID (Workers & Pages overview). Re-run `node scripts/github-setup.mjs --user Misacorp`; it asks for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for production and staging, with hidden input.
- [x] **First deploy.** Merge a PR into `main` (or Actions, deploy, Run workflow on `main`). The run ends by checking that the live commit is the merged one; `node scripts/deployed.mjs --prod` shows it any time.
