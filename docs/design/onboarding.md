# Onboarding

How a new player learns the game, and how a returning one is caught up. Decisions are in `decisions/product.md` (2026-11-23, Misa). Learning lives in the intro, the practice and the hints; reference lives behind a hold on the day readout and the wiki.

## The flow

1. **Intro cards** (new Discord user, no character yet): four cards led by the game's art, one short line each, back at the top left, skip, swipe. Once per user.
2. **Practice map**: the real map UI on a game that runs only in the browser (fixed seed, the pure core, no requests, no socket, nothing stored). A guided first day lights what to tap: select yourself, tap the glowing tile, confirm the arrow, then one action of your role (scout looks at a veiled hex, scholar studies a ruin, engineer gathers iron, keeper feeds from the stores, warden stands guard). "Join the expedition" is always on screen; finishing or leaving goes to the real game as it is now.
3. **Role cards** in the join drawer: a swipeable strip, what you do as icons leading to what the team gets, one line. A `/wiki` link sits at the drawer's foot.
4. **First-encounter hints** in the real game: fog edge, trap, threat, settlement, hunger raising peril. One passing hint each, once per user.
5. **Returning recap**: first open after a day turned since the last visit: days passed and route, marks of what happened near the creature, peril and route now.
6. **Reference**: hold the day readout for "Replay the intro" and "Practise again".

A player who already has a character is never shown the intro or the practice unasked.

## Persistence

Per player in the guild's Durable Object (`players` table, migration 4):

- `seen`: JSON array of ids from the core's `SEEN_IDS` (`intro`, `practice`, `hint:fog`, `hint:trap`, `hint:threat`, `hint:settlement`, `hint:hunger`). Read from `you.seen` in the player view. `POST /api/me/seen` takes `{ ids: [...] }` (strict, known ids only, 1 to 7), adds them as a union and answers `{ seen }`. Identity is the session's, never the body's. It is not a game change: the version stays.
- `last_day`, `last_version`: the game day and version of the previous visit, read as `you.lastDay` and `you.lastVersion`. `POST /api/me/visit` (empty body) moves them to now. The client sends it once per open and when the day turns under an open page. The recap reads the log with `GET /api/game?since=<lastVersion>`. A `GET` writes nothing (writing there broke the storage read budgets).

The record is per Discord server, as all game data is. A new server is a new record.

## The practice never touches the real game

`apps/web/src/onboarding/sandboxApi.ts` implements `ApiClient` from the core. The practice modules may not import or call anything that reaches a server or a store; `guard.test.ts` reads their source and runs a whole practice day with `fetch`, `WebSocket` and `XMLHttpRequest` trapped. The browser check (`apps/web/scripts/onboarding.mjs`) counts `/api` requests and API sockets during a practice (zero).

## Open points

- A first-time player practises as a scout, since no role is chosen yet. A replay uses their own role.
- The recap's marks are icons with counts, not marks on the map.
- The wiki link is a plain link opening in a new tab; Discord's own "open external link" command may be needed inside the Activity.
