import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

const asView = (body: unknown) => body as PlayerView & { events?: unknown[] };
const storedState = (sql: SqlStorage): GameState =>
  JSON.parse(
    sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
  ) as GameState;

/** Changes the stored game as a test setup (the rules are proven in the core; this places things). */
function edit(sql: SqlStorage, change: (state: GameState) => GameState): void {
  sql.exec(
    'UPDATE game SET state = ?, version = version + 1 WHERE id = 1',
    JSON.stringify(change(storedState(sql))),
  );
}

const ME = `${USER_ID}.0`;
const pick = (node: unknown) => ({ kind: 'pick-skill', node });

async function joined(ctx: GameContext, role = 'engineer') {
  const token = await ctx.signIn(MISA);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role, offer: 0 });
  expect(res.status).toBe(200);
  return { token, version: asView(res.body).version };
}

describe('skills over the API', () => {
  it('takes a pick-skill action with one node id from the content list, and nothing else', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      for (const action of [
        { kind: 'pick-skill' },
        pick('warp-drive'),
        pick(7),
        pick('x'.repeat(65)),
        { ...pick('engineer-a1'), extra: true },
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
    });
  });

  it("answers the core's refusals by name: veiled, no pick yet", async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      const refused = async (node: string) =>
        (await ctx.call(token, 'POST', '/api/game/act', { version, action: pick(node) })).body;
      expect(await refused('engineer-a2')).toEqual({ error: 'skill-veiled' });
      expect(await refused('engineer-a1')).toEqual({ error: 'no-pick' });
    });
  });

  it('takes a pick the character has earned, shows it to everyone, and answers the event', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const robin = await ctx.signIn(ROBIN);
      const need = storedState(ctx.sql).config.xpPerPick;
      edit(ctx.sql, (s) => ({
        ...s,
        characters: s.characters.map((c) =>
          c.id === ME ? { ...c, skills: { xp: need, taken: [] } } : c,
        ),
      }));
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: pick('engineer-b1'),
      });
      expect(res.status).toBe(200);
      const view = asView(res.body);
      expect(view.events).toEqual([
        { kind: 'skill-picked', characterId: ME, node: 'engineer-b1', version: version + 1 },
      ]);
      const skills = { xp: need, taken: ['engineer-b1'] };
      expect(view.game.characters.find((c) => c.id === ME)?.skills).toEqual(skills);
      // Public: another player sees the same.
      const seen = asView((await ctx.call(robin, 'GET', '/api/game')).body);
      expect(seen.game.characters.find((c) => c.id === ME)?.skills).toEqual(skills);
      expect(seen.glints).toEqual([]);
    });
  });

  it('gives glints to the viewer who has them only, and never says what is there', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx, 'scout');
      const robin = await ctx.signIn(ROBIN);
      const joinedRobin = await ctx.call(robin, 'POST', '/api/game/join', {
        role: 'scout',
        offer: 1,
      });
      expect(joinedRobin.status).toBe(200);
      const state = storedState(ctx.sql);
      // An unexplored hex two from the creature's centre, one from the footprint.
      const spot = Object.keys(state.tiles).find((key) => {
        const [q, r] = key.split(',').map(Number) as [number, number];
        const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        return distance === 2 && state.tiles[key]?.explored === false;
      });
      if (spot === undefined) throw new Error('no hex two from the creature');
      edit(ctx.sql, (s) => ({
        ...s,
        features: { [spot]: { type: 'tomb', revealed: false, left: 1 } },
        characters: s.characters.map((c) =>
          c.id === ME ? { ...c, skills: { xp: 0, taken: ['scout-b1'] } } : c,
        ),
      }));
      const [q, r] = spot.split(',').map(Number) as [number, number];
      const mine = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(mine.glints).toEqual([{ q, r }]);
      expect(JSON.stringify(mine.game)).not.toContain('"tomb"');
      expect(asView((await ctx.call(robin, 'GET', '/api/game')).body).glints).toEqual([]);
    });
  });
});
