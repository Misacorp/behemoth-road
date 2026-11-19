import { DurableObject } from 'cloudflare:workers';
import { createGuildApi } from './discord.ts';
import { GuildGame, randomSeed, type SessionUser } from './guild-game.ts';

/**
 * One Durable Object per Discord server (`idFromName(guildId)`), holding that server's game in its
 * SQLite database. `fetch` serves the authenticated API routes the Worker forwards; `createSession` is
 * an RPC method, callable only from Worker code with the binding, never over HTTP. The alarm is the day
 * tick. The logic lives in `guild-game.ts`, with the real clock and seed source here.
 */
export class GuildWorld extends DurableObject<Env> {
  private readonly game: GuildGame;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.game = new GuildGame(ctx.storage, {
      now: () => Date.now(),
      newSeed: randomSeed,
      devTools: env.DEV_TOOLS === 'on',
      everyoneIsAdmin: env.ENVIRONMENT === 'local',
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
      return Promise.resolve();
    });
  }

  createSession(guildId: string, user: SessionUser): Promise<string> {
    return this.game.createSession(guildId, user);
  }

  override fetch(request: Request): Promise<Response> {
    return this.game.handle(request);
  }

  override alarm(): Promise<void> {
    return this.game.alarm();
  }
}
