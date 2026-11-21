import { DurableObject } from 'cloudflare:workers';
import { createGuildApi } from './discord.ts';
import { newArtSeed, newSeed } from './game-core.ts';
import { GuildGame, seasonConfig, type SessionUser } from './guild-game.ts';
import { LIVE_PATH, LiveSockets } from './live.ts';
import { ReadMeter, readSourceOfRoute, type ReadSource } from './read-meter.ts';

/**
 * One Durable Object per Discord server (`idFromName(guildId)`), holding that server's game in its
 * SQLite database. `fetch` serves the authenticated API routes the Worker forwards and the live socket
 * upgrade (`/api/live`); `createSession` is an RPC method, callable only from Worker code with the binding,
 * never over HTTP. The alarm is the day tick. The logic lives in `guild-game.ts`, with the real clock and
 * seed source here. The sockets use the WebSocket Hibernation API (`live.ts`): the three `webSocket*`
 * methods are the runtime's handlers, and a push is sent from inside the write that caused it.
 */
export class GuildWorld extends DurableObject<Env> {
  private readonly game: GuildGame;
  private readonly live: LiveSockets;
  /** Rows read per source (`read-meter.ts`). */
  readonly meter: ReadMeter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const devTools = env.DEV_TOOLS === 'on';
    this.meter = new ReadMeter(ctx.storage.sql);
    const storage = {
      sql: this.meter.sql,
      transactionSync: <T>(fn: () => T): T => ctx.storage.transactionSync(fn),
      getAlarm: () => ctx.storage.getAlarm(),
      setAlarm: (t: number | Date) => ctx.storage.setAlarm(t),
      deleteAlarm: () => ctx.storage.deleteAlarm(),
    };
    this.live = new LiveSockets({
      ctx,
      enabled: env.LIVE === 'on',
      clientSecret: env.DISCORD_CLIENT_SECRET,
      guildId: () => this.game.boundGuildId(),
      version: () => this.game.version(),
      hasSession: (userId) => this.game.hasSession(userId),
      now: () => Date.now(),
    });
    this.game = new GuildGame(storage, {
      now: () => Date.now(),
      newSeed,
      newArtSeed,
      devTools,
      gameConfig: seasonConfig(devTools),
      everyoneIsAdmin: env.ENVIRONMENT === 'local',
      live: this.live,
      guildApi:
        env.DISCORD_BOT_TOKEN === ''
          ? null
          : createGuildApi({
              botToken: env.DISCORD_BOT_TOKEN,
              fetch: (input, init) => fetch(input, init),
            }),
    });
    void ctx.blockConcurrencyWhile(() => {
      this.game.migrate();
      this.meter.settle('start');
      return Promise.resolve();
    });
  }

  /** Runs `fn`, then books the rows it read to `source`. */
  private async metered<T>(source: ReadSource, fn: () => Promise<T> | T): Promise<T> {
    try {
      return await fn();
    } finally {
      this.meter.settle(source);
    }
  }

  createSession(guildId: string, user: SessionUser): Promise<string> {
    return this.metered('request:session', () => this.game.createSession(guildId, user));
  }

  override fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === LIVE_PATH) return this.metered('socket', () => this.live.upgrade(request));
    return this.metered(readSourceOfRoute(request.method, pathname), () =>
      this.game.handle(request),
    );
  }

  override alarm(): Promise<void> {
    return this.metered('alarm', () => {
      this.live.pruneStale();
      return this.game.alarm();
    });
  }

  override webSocketMessage(ws: WebSocket): void {
    this.live.webSocketMessage(ws);
    this.meter.settle('socket');
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    this.live.webSocketClose(ws, code);
    this.meter.settle('socket');
  }

  override webSocketError(ws: WebSocket): void {
    this.live.webSocketError(ws);
    this.meter.settle('socket');
  }
}
