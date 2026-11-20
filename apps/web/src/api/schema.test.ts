import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { seasonScenario, toView } from './fixtures.ts';
import { GameEventSchema, PlayerViewSchema } from './schema.ts';

const view = () =>
  toView(
    seasonScenario({
      threats: [{ type: 'captors', at: { q: 0, r: 4 }, strength: 4 }],
      settlements: [{ at: { q: 2, r: 2 }, attitude: 'friendly', favour: 3, boon: 'gift' }],
      peril: 6,
      steps: 12,
      season: { status: 'over', outcome: 'wounded', day: 14 },
    }),
  );

describe('Milestone 5 view and events', () => {
  it('parses a view the core built: threats, settlements, peril, the route and the ended season', () => {
    const parsed = v.parse(PlayerViewSchema, view());
    expect(parsed.game.threats[0]).toMatchObject({ type: 'captors', strength: 4 });
    expect(parsed.game.settlements[0]).toMatchObject({ attitude: 'friendly', boon: 'gift' });
    expect(parsed.game.peril).toBe(6);
    expect(parsed.game.creature.steps).toBe(12);
    expect(parsed.game.season).toEqual({ status: 'over', outcome: 'wounded', day: 14 });
    // Until the core's struckDay lands, a character has none (read as never struck).
    expect(parsed.game.characters[0]!.struckDay).toBeUndefined();
  });

  it('refuses an attitude, an outcome or a season it does not know', () => {
    const base = view();
    const bad = (game: object) => !v.safeParse(PlayerViewSchema, { ...base, game }).success;
    const s = base.game.settlements[0]!;
    expect(bad({ ...base.game, settlements: [{ ...s, attitude: 'curious' }] })).toBe(true);
    expect(bad({ ...base.game, season: { status: 'over', outcome: 'won', day: 3 } })).toBe(true);
    expect(bad({ ...base.game, season: { status: 'paused' } })).toBe(true);
  });

  it('parses each Milestone 5 event, and bounds its ids', () => {
    const hex = { q: 1, r: -2 };
    const events = [
      { kind: 'threat-appears', id: 't1', type: 'swarm', hex },
      { kind: 'threat-moves', id: 't1', from: hex, to: { q: 1, r: -1 } },
      { kind: 'threat-strikes', id: 't1', damage: 2 },
      { kind: 'struck', characterId: 'c1', threat: 't1' },
      { kind: 'threat-hit', id: 't1', characterId: 'c1', strength: 1 },
      { kind: 'threat-cleared', id: 't1', characterId: 'c1' },
      { kind: 'threat-gone', id: 't1' },
      { kind: 'defend', characterId: 'c1' },
      { kind: 'peril', from: 2, to: 4 },
      { kind: 'settlement-appears', id: 's1', hex },
      { kind: 'parley', id: 's1', characterId: 'c1', favour: 2 },
      { kind: 'befriended', id: 's1' },
      { kind: 'angered', id: 's1' },
      { kind: 'offer', id: 's1', characterId: 'c1', material: 'old-coin' },
      { kind: 'boon', id: 's1', characterId: 'c1', boon: 'mislead' },
      { kind: 'season-over', outcome: 'lost' },
    ].map((e) => ({ ...e, version: 7 }));
    for (const e of events) expect(v.safeParse(GameEventSchema, e).success, e.kind).toBe(true);
    const long = 'x'.repeat(65);
    expect(v.safeParse(GameEventSchema, { kind: 'befriended', id: long, version: 1 }).success).toBe(
      false,
    );
    expect(
      v.safeParse(GameEventSchema, { kind: 'season-over', outcome: 'won', version: 1 }).success,
    ).toBe(false);
  });
});
