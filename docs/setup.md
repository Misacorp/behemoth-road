# Setup checklist

One-time steps that only Misa can do, written when the project was bootstrapped. Agents: a hook reminds you at the start of a session while a box is open. Check what you can yourself first (for example `gh api repos/Misacorp/behemoth-road/rulesets`), then raise the rest with Misa once, as one numbered list. Tick a box in your next PR when it is confirmed done. Steps that need things the project doesn't have yet wait until it does; say so instead of asking.

- [x] **GitHub settings.** On your own machine, from the repo root: `node scripts/github-setup.mjs --user Misacorp`. It protects `main`, makes merges squash-only with the PR title and description as the commit, locks down Actions, turns on secret scanning and creates the environments. Re-run it after changing `project.config.json`.
- [x] **Claude's access to this repository.** If the Claude GitHub App is limited to selected repositories: GitHub, Settings, Applications, Claude, Configure, Repository access, add `Misacorp/behemoth-road`. Without it, cloud sessions can read but not push.

- [x] **What the project is.** Tell an agent in a paragraph; it fills the TODOs in `CLAUDE.md`, `README.md` and `docs/progress.md`.

- [x] **The domain on Cloudflare.** `behemoth.misacorp.dev` and `behemoth-staging.misacorp.dev` must be in a zone on your Cloudflare account (the Worker claims the hostname itself on the first deploy).
- [x] **Cloudflare credentials in GitHub.** Create an API token from the "Edit Cloudflare Workers" template, limited to your account and that zone, and copy your account ID (Workers & Pages overview). Re-run `node scripts/github-setup.mjs --user Misacorp`; it asks for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for production and staging, with hidden input.
- [x] **First deploy.** Merge a PR into `main` (or Actions, deploy, Run workflow on `main`). The run ends by checking that the live commit is the merged one; `node scripts/deployed.mjs --prod` shows it any time.

## Milestone 2: Discord

Two Discord applications, one per environment, so staging never touches the production app. Do the steps for **production** (`behemoth.misacorp.dev`) and again for **staging** (`behemoth-staging.misacorp.dev`). Everything else (the Launch command's handler, the public key, the interactions check) is done by the deploy job.

- [ ] **Create the application.** [Discord Developer Portal](https://discord.com/developers/applications), New Application. Names: `Behemoth Road` and `Behemoth Road (staging)`.
- [ ] **Activities.** Activities, Settings: turn on **Enable Activities**; Supported Platforms: Web, iOS, Android. Activities, URL Mappings: one row, prefix `/`, target `behemoth.misacorp.dev` (staging: `behemoth-staging.misacorp.dev`), no `https://`.
- [ ] **OAuth2.** OAuth2, Redirects: add `https://127.0.0.1` (Discord requires one; the Activity never uses it). Copy the **Client ID** (public) and **Reset Secret** to get the client secret.
- [ ] **Bot.** Bot: **Reset Token** and copy it. Turn **Public Bot** off. No privileged intents are needed.
- [ ] **Installation.** Installation Contexts: **Guild Install** only (untick User Install). Install Link: Discord Provided Link. Default Install Settings, Guild Install: scopes `applications.commands` and `bot`, no permissions. Open the install link and add the app to your server (staging: a test server).
- [ ] **Interactions Endpoint URL.** General Information: `https://behemoth.misacorp.dev/api/discord/interactions` (staging: `https://behemoth-staging.misacorp.dev/api/discord/interactions`). Discord checks it when you save, so set it **after** the first deploy with Milestone 2 is live; until then the deploy prints a warning and Launch uses Discord's default.
- [ ] **Secrets into GitHub.** `node scripts/github-setup.mjs --user Misacorp` asks for `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` for `production` and `staging`, with hidden input.
- [ ] **Client ids to an agent.** Send the two Client IDs (public, not secret); they go into `apps/worker/wrangler.jsonc` as `DISCORD_CLIENT_ID`.
