import { describe, expect, it } from 'vitest';
import {
  CONTENT_VERSION,
  type GameState,
  loadGame,
  migrateGame,
  moveAlong,
  nextDay,
  planPath,
  reachablePlaces,
  toPlayerView,
  UnknownContentVersionError,
} from '../src/index.ts';
import storedJson from './fixtures/game-v2.json' with { type: 'json' };

/** A game stored by the content-version-2 code (captured before version 3 existed). */
const stored = JSON.parse(JSON.stringify(storedJson)) as Record<string, unknown> & {
  tiles: object;
  characters: object[];
  seed: number[];
};

describe('migrating a stored version-2 game', () => {
  it('loads it as version 3 with its map and characters', () => {
    expect(stored.contentVersion).toBe(2);
    const game = loadGame(stored);
    expect(game.contentVersion).toBe(CONTENT_VERSION);
    expect(game.seed).toEqual(stored.seed);
    expect(game.tiles).toEqual(stored.tiles);
    expect(game.characters).toEqual(stored.characters.map((c) => ({ ...c, craftsToday: 0 })));
    expect(game.inventory).toEqual({ materials: {}, items: {} });
    expect(game.glints).toEqual({});
    expect(game.config.featureChance).toBe(0.08);
    // Seen hexes get their hidden features, as if just come into view.
    expect(Object.keys(game.features).length).toBeGreaterThan(0);
    for (const [key, f] of Object.entries(game.features)) {
      expect(game.tiles[key]?.visibility).toBe('seen');
      expect(f.revealed).toBe(false);
    }
    expect(toPlayerView(game).features).toEqual({});
  });

  it('migrates the same way every time, and leaves a current game alone', () => {
    const a = loadGame(JSON.parse(JSON.stringify(stored)));
    const b = loadGame(JSON.parse(JSON.stringify(stored)));
    expect(b).toEqual(a);
    expect(migrateGame(a)).toBe(a);
    expect(loadGame(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it('plays on after migrating', () => {
    let game = loadGame(stored);
    const mover = game.characters.find((c) => c.status === 'active')!;
    const target = reachablePlaces(game, mover.id).at(-1)!;
    const plan = planPath(game, mover.id, target.place);
    if (!plan.ok) throw new Error(plan.reason);
    const walked = moveAlong(game, mover.id, plan.steps);
    expect(walked.ok).toBe(true);
    if (walked.ok) game = walked.state;
    for (let d = 0; d < 10; d++) game = nextDay(game);
    expect(game.day).toBe((stored.day as number) + 10);
    expect(game.contentVersion).toBe(CONTENT_VERSION);
  });

  it('refuses versions it does not know', () => {
    expect(() => loadGame({ ...stored, contentVersion: 1 })).toThrow(UnknownContentVersionError);
    expect(() => migrateGame({ ...stored, contentVersion: 9 } as unknown as GameState)).toThrow(
      UnknownContentVersionError,
    );
  });
});
