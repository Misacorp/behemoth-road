import {
  createGame,
  type GameState,
  type GameStateView,
  onHex,
  toPlayerView,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { actionsAt, chainOf, craftOptions, iconOf } from './chain.ts';

const hex = { q: 0, r: 2 };

function game(role: string, patch: Partial<GameState> = {}): GameStateView {
  const g = createGame(7, { characterIds: ['me'], artSeed: 1 });
  return toPlayerView({
    ...g,
    characters: g.characters.map((c) => ({ ...c, role, at: onHex(hex) })),
    ...patch,
  });
}

const node = { features: { '0,2': { type: 'iron-deposit', revealed: true, left: 2 } } };

describe('the chain as the client reads it', () => {
  it('lists the team stock, materials first, and reads revealed features and glints', () => {
    const v = game('scout', {
      ...node,
      glints: { '3,-1': true },
      inventory: { materials: { timber: 1, iron: 2 }, items: { lantern: 1 } },
    });
    const c = chainOf(v);
    expect(c.stock).toEqual([
      ['iron', 2],
      ['timber', 1],
      ['lantern', 1],
    ]);
    expect(c.features.get('0,2')?.type.kind).toBe('node');
    expect([...c.glints]).toEqual(['3,-1']);
  });

  it('offers gather on a node, faded when out of actions, and nothing on an empty hex', () => {
    expect(actionsAt(game('scout', node), 'me')).toEqual([
      { kind: 'gather', cost: 1, enabled: true },
    ]);
    const tired = game('scout', node);
    const spent = {
      ...tired,
      characters: tired.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(actionsAt(spent, 'me')).toEqual([{ kind: 'gather', cost: 1, enabled: false }]);
    expect(actionsAt(game('scout'), 'me')).toEqual([]);
  });

  it('shows the extra material a non-specialist pays, and none for the engineer', () => {
    const stocked = { inventory: { materials: { iron: 3, timber: 1 }, items: {} } };
    const hook = (role: string) =>
      craftOptions(game(role, stocked), 'me').find((o) => o.recipe.makes === 'grappling-hook')!;
    expect(hook('engineer')).toMatchObject({ extra: null, enabled: true });
    const scout = hook('scout');
    expect(scout.extra).toEqual(['iron', 1]);
    expect(scout.inputs).toEqual([
      ['iron', 3],
      ['timber', 1],
    ]);
    expect(scout.enabled).toBe(true);
    // Tier 2 is for specialists only.
    const spikes = craftOptions(game('scout', stocked), 'me').find((o) => o.recipe.tier === 2)!;
    expect(spikes).toMatchObject({ enabled: false, refusal: 'needs-specialist' });
  });

  it('maps content ids to the art kit icon keys', () => {
    expect(iconOf('grappling-hook')).toBe('hook');
    expect(iconOf('ancient-alloy')).toBe('alloy');
    expect(iconOf('iron-deposit')).toBe('ore');
    expect(iconOf('nonsense')).toBe('nonsense');
  });
});
