# Milestone 2: the session

The plan and the client-server contract for Milestone 2 (`docs/PROTOTYPE_PLAN.md`): several real people share one map from Discord. Three sessions build it in parallel against this contract; change the contract here first, then in code.

## Shape

- **One Durable Object per Discord server** (`GuildWorld`, SQLite storage, in-code migrations), keyed by the guild id, as in creatures. It holds the game state, the players and their sessions, runs one request at a time, and writes in transactions.
- **The day tick is the object's alarm**, at a fixed local time in the guild's time zone (one config value each; see Open points). In staging, an admin can also call it on demand. Production never exposes that.
- **Sign-in is creatures' Activity flow**: the Embedded App SDK authorises, the Worker exchanges the code, reads the user and the Activity instance with the bot token, and takes the guild only from the instance. The session is an HMAC-signed bearer token keyed to the guild. Reuse creatures' `session.ts`, `auth.ts`, `discord.ts`, `keys.ts`, `http.ts`, `ratelimit.ts`, `time.ts`, the migration runner and the interactions endpoint (Launch entry point only), adapted, with their tests.
- **The server keeps the seed.** Clients get a player view without the seed: the terrain of every known tile is in the view, so the client can draw and plan paths, but cannot compute the map ahead or the creature's next step. The core reads terrain from the state's known tiles first and generates only on the server.
- **Updates:** the client refreshes the view after its own actions, when the page becomes visible, and every 30 seconds while visible; each view carries a `version` so an unchanged view is cheap (`304`-style `{ unchanged: true }`). WebSockets can come later.

## API (all JSON, relative URLs, `Cache-Control: no-store`)

Every body is checked with a strict Valibot schema (unknown keys rejected, lengths limited). Identity always comes from the session, never from the body.

| Method and path                  | Who                 | Body                         | Returns                                                                                                                                                        |
| -------------------------------- | ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/config`                | public              |                              | environment, branch, commit, Discord client id, `devTools` flag, `live` flag                                                                                   |
| `POST /api/auth/session`         | public              | `{ code, instanceId }`       | `{ token, accessToken, user: { id, name } }`                                                                                                                   |
| `GET /api/game?since=<version>`  | player              |                              | `PlayerView` or `{ unchanged: true }`                                                                                                                          |
| `POST /api/game/join`            | player              | `{ role }`                   | `PlayerView`; creates this player's character if they have none, else returns the view unchanged                                                               |
| `POST /api/game/move`            | player              | `{ version, path: Place[] }` | `PlayerView`; applies `moveAlong` for the player's own active character; refuses with `409` if `version` is stale or the move is refused (`{ error: reason }`) |
| `POST /api/game/replace`         | player              | `{ role }`                   | `PlayerView`; only when the player's character is lost: a new character starts riding the creature                                                             |
| `POST /api/dev/next-day`         | admin, staging only | `{}`                         | `PlayerView`; runs the tick now                                                                                                                                |
| `POST /api/discord/interactions` | Discord             | signed                       | Launch entry point                                                                                                                                             |

`Place` is exactly `{ kind: 'hex', hex: { q, r } }` or `{ kind: 'creature' }` (integers, bounded). `role` is one of the six role ids from content. `offer` is an index into the view's `offers`; the server re-derives the roll from the seed, so a forged character is impossible.

`PlayerView`:

```
{
  version: number,            // bumps on every change to the game
  day: number,
  you: { userId, characterId | null, admin: boolean },
  offers: [{ name, trait | null, quirk | null }] | null,  // the 2–3 rolls plus the plain character; only when you have no active character
  game: GameStateView,        // the core state without the seed (tiles carry terrain); each character carries name, trait and quirk (content ids or null)
  players: [{ userId, name, characterId, role, joinedDay }],  // Discord display names, rendered as text only
  pace: 'daily' | 'fast',     // fast: the day turns early once every active character has spent their actions (staging only)
  fastTickAt: number | null,  // epoch ms of that early tick, while it counts down
  devTools: boolean           // the "next day" control shows only when devTools and you.admin are both true; the server enforces it regardless
}
```

Contract fixtures for the web tests are captured from the real Worker code by one command and checked in CI (creatures' decision "Client-server contract fixtures are captured from the real server"); they are never edited by hand.

## Characters (content as data)

- Each character has a generated name, one trait and one quirk from small starter lists in `packages/core` content (tagged data with an `icon` id each; a quirk helps and hinders the character only). Roles carry an `icon` id too; the art kit draws all icons (`drawIcon`). A plain character (no trait, no quirk) is always offered.
- Joining shows two or three rolled characters plus the plain one (the view's `offers`, rolled on the server); the player picks one and a starting role (Scout, Scholar, Keeper, Engineer, Warden; Guardian and Envoy merged into Warden later). Rolls are seeded by the game seed, the user id and the attempt number, so a reload shows the same choices.
- The role is stored and shown; it has no mechanics yet.
- Cap of 15 active characters per server (config).

## Interface (web)

- Boots as a Discord Activity (`@discord/embedded-app-sdk`, as in creatures). A local development mode signs in with a fake session against `wrangler dev`, never available in a deployed build.
- Joining is the first larger view: on phones the bottom drawer as a short wizard (pick a character, pick a role, confirm); on desktop a side drawer. Visual: figures, trait and quirk icons, role emblems; names are the only text.
- Other players' characters are drawn on the map and on the creature's back; the hub bubble lists who is on the creature or a shared hex (decision "The creature is the party's hub…"), and tapping another character shows their name, role, trait and quirk.
- A lost character shows as lost; the player gets a way to replace it (the same drawer).

## Sessions and branches

- **Core** (`m2/core`): player view without the seed (terrain from known tiles), content for roles, traits, quirks and names, character generation, add and replace characters, the cap, the content version pinned in state, pruning lost tiles.
- **Worker** (`m2/worker`): everything under `apps/worker`, the Durable Object, the API above, Discord sign-in and the interactions endpoint, the alarm, `wrangler.jsonc` bindings and migrations, `project.config.json` secrets for Discord, the deploy workflow's Discord steps, contract fixture capture. First deliverable: the exact setup checklist for Misa (Discord applications for production and staging, secrets, URL mappings).
- **Web** (`m2/web`): Activity boot, API client, polling, the join drawer, other players on the map, the replace flow, the dev "next day" control behind `devTools`.

The lead merges them on `m2/integration`.

## Open points

- The tick's local time and time zone: one config value; the lead's pick is 06:00 Europe/Helsinki until Misa says otherwise.
