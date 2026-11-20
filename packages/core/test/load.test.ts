import { describe, expect, it } from 'vitest';
import {
  CONTENT_VERSION,
  createGame,
  loadGame,
  OutdatedGameError,
  UnknownContentVersionError,
} from '../src/index.ts';
import storedJson from './fixtures/game-v2.json' with { type: 'json' };

describe('loading a stored game', () => {
  it('loads a game of the current content version', () => {
    const game = createGame(4, { characterIds: ['a'] });
    expect(game.contentVersion).toBe(CONTENT_VERSION);
    expect(loadGame(JSON.parse(JSON.stringify(game)))).toEqual(game);
  });

  it('refuses an older game (one stored by the version-2 code) as outdated: start a new one', () => {
    const stored = JSON.parse(JSON.stringify(storedJson)) as { contentVersion: number };
    expect(stored.contentVersion).toBe(2);
    expect(() => loadGame(stored)).toThrow(OutdatedGameError);
    expect(() => loadGame(stored)).toThrow(UnknownContentVersionError);
  });

  it('refuses unknown versions as unknown, not outdated', () => {
    const game = createGame(4);
    for (const version of [CONTENT_VERSION + 1, 'x', undefined, 2.5]) {
      let error: unknown;
      try {
        loadGame({ ...game, contentVersion: version });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(UnknownContentVersionError);
      expect(error).not.toBeInstanceOf(OutdatedGameError);
    }
  });
});
