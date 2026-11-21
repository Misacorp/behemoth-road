# Live: near real-time updates

Status: built on `next/live`; on in staging and local, **off in production** (`LIVE` var) until Misa has tried it on staging. Adapted from the creatures app's live socket (`docs/design/lounge-live.md` there) and its rows-read retro.

## What it does

While several players are online, a change one of them makes (act, move, join, replace, the day tick, the pace switch, a new season) reaches the others at once instead of at their next 10-second poll, so fewer actions are refused as stale. The socket carries no game data: it says `{ v: 1, type: 'changed', version }`, and each client then asks `GET /api/game?since=<its version>` for its own view, the existing authenticated path. If the socket is off, unsupported, refused or dropped, the client polls every 10 s exactly as before.

```
client                          Worker                          guild Durable Object (GuildWorld)
  | POST /api/live/ticket  -->  (session MAC)  -------------->  mints a one-time ticket (memory)
  | <-- { ticket }
  | GET /api/live?t=...  (Upgrade: websocket)
  |                             flag, Upgrade, one param, MAC -->  redeems, accepts, caps, hello
  | <-- { type: 'hello', version }
  | any change (HTTP intent / alarm)  --> one write transaction --> after commit: one push
  | <-- { type: 'changed', version }
  | GET /api/game?since=v  -->  its own view (or { unchanged: true })
  | "ping" every 60 s  -->  "pong" from the runtime (the object stays asleep)
```

## Server (`apps/worker`)

- `live.ts`: tickets (`t1.<guildId>.<secret>.<mac>`, own HKDF label under the Discord client secret, 30 s, single use, 200 held in memory), `LiveSockets` (Hibernation: `acceptWebSocket` with a `u:<userId>` tag, `serializeAttachment`, `setWebSocketAutoResponse` ping/pong, no timers, stale pruning with `getWebSocketAutoResponseTimestamp` on connect, push and alarm).
- `guild-world.ts`: forwards `webSocketMessage/Close/Error`, routes `/api/live` to the upgrade, wraps storage in the read meter.
- `guild-game.ts`: `tx()` records the highest version written in a transaction and calls `live.changed(version)` once after it commits (a rolled-back write is never announced). Raw version bumps (a renamed player, the pace) use `bumpVersion()`.
- `handler.ts`: with `LIVE` not `on`, `/api/live` and `/api/live/ticket` are a 404 before any object is addressed.
- Server to client only: any frame but `ping` closes the socket with 4002. Close codes: 4000 replaced, 4001 stale, 4002 protocol.
- Caps (`SERVER_CONFIG.live`): 3 sockets per player (oldest closed 4000), 64 per guild (`503 live_full`, the client polls), none older than 12 h.

## Client (`apps/web/src/api`)

- `live-socket.ts`: framework-free, injectable. Opens only while the page is visible (started and stopped by `Sync.visible/hidden`); ticket, socket, `hello` within 15 s, ping every 60 s, dead after 150 s of silence, backoff 1/2/4 .. 30 s with crypto jitter, gives up after 6 failures, on a ticket 404 and on close 4000. Address: `wss://<page host>/api/live?t=` (relative to the page host, so Discord's proxy needs no new mapping).
- `sync.ts`: on a `changed` with a newer version, one refresh after 150 ms (bursts coalesce); a new socket refreshes once; while live the safety poll is 60 s, otherwise 10 s. The fast-tick refresh stays as the polling fallback and uses the server's clock (`PlayerView.now`).
- CSP `connect-src` lists `wss://behemoth.misacorp.dev`, `wss://behemoth-staging.misacorp.dev` and `wss://*.discordsays.com` next to `'self'` (older browsers do not let `'self'` cover `wss:`).

## Rows read

Free tier: 5,000,000 rows read a day across the account, staging included. `read-meter.ts` sums `cursor.rowsRead` per source (`start`, `alarm`, `socket`, `request:<route>`), in memory. `test/read-budget.test.ts` pins budgets (about 1.5 times measured) and checks the query plans of the hot statements for a full scan.

Measured (rows read, warm object, event log at its cap of 100):

| Operation                                         | Rows   |
| ------------------------------------------------- | ------ |
| Unchanged poll                                    | 0      |
| Changed poll                                      | 5      |
| Act                                               | 14     |
| Tick (next day)                                   | 16     |
| Socket connect (ticket and upgrade, warm)         | 0      |
| Act, push to 8 sockets, and their 8 refetches     | 96     |
| Object start / first two requests after a restart | 4 / 10 |

Two hot queries scanned the whole 100-event log (about 100 rows) on every write and changed poll and were rewritten (see the decision "Rows read are metered per source").

**Estimate, 8 players, 3 hours a day, fast pace.** Assumptions: every player acts or moves about once every 20 s the whole time (540 each, 4,320 changes), each change is followed by all 8 refetching (no coalescing, the worst case), plus about 360 rows for connects and restarts, plus 1,440 safety polls that read nothing. 4,320 x 96 + 360 is about 415,000 rows a day, about 8% of the account's allowance. The old 10 s poll read about the same per changed poll but only once per poll window, so it read less and showed changes up to 10 s late. If it needs to be lower, the cheapest lever is keeping the `players` names in memory (about 8 of the 10 rows in a refetch).

## Flag

`LIVE` in `apps/worker/wrangler.jsonc`: `on` at the top level (local) and in staging, `off` in production; `test/live.test.ts` pins it. To turn it on in production: change the var, update the pin, merge; a deploy closes every socket and clients reconnect.

## Unknowns for Misa to try on staging

Whether Discord's proxy carries the upgrade and the query string for this Activity (creatures' does for the same setup), its idle timeout, and what a phone does when backgrounded. Every case falls back to polling.
