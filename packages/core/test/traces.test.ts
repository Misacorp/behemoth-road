import { describe, expect, it } from 'vitest';
import {
  act,
  addTraces,
  type ActResult,
  createGame,
  type GameState,
  hex,
  nextDay,
  nextDayWithEvents,
  pruneTraces,
  type Trace,
} from '../src/index.ts';
import { fieldGame, placeCharacter, QUIET, withThreat } from './helpers.ts';

const straight = { ...QUIET, veerWeights: { left: 0, right: 0 } };
const ok = (r: ActResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('traces', () => {
  it('start empty', () => {
    expect(createGame(1).traces).toEqual([]);
  });

  it('a lit fire leaves a fire scar where it burned, credited to the lighter', () => {
    const base = placeCharacter(fieldGame(['scout']), 'scout', hex(-2, 0));
    const state = {
      ...base,
      characters: base.characters.map((c) => ({ ...c, pack: { timber: 1 } })),
    };
    const lit = ok(act(state, 'scout', { kind: 'light-fire' }));
    expect(lit.traces).toEqual([{ kind: 'fire', hex: hex(-2, 0), step: 0, by: 'scout' }]);
  });

  it('the creature stepping leaves a trail on the hexes its footprint left, none when it lingers', () => {
    const state = fieldGame(['a'], straight);
    const next = nextDay(state);
    expect(next.creature.centre).toEqual(hex(0, -1));
    expect(next.traces.map((t) => t.kind)).toEqual(['trail', 'trail', 'trail']);
    // The three hexes of the old footprint that are not in the new one.
    expect(next.traces.map((t) => t.hex)).toEqual(
      expect.arrayContaining([hex(0, 1), hex(1, 0), hex(-1, 1)]),
    );
    expect(next.traces.every((t) => t.step === 1 && t.by === undefined)).toBe(true);
    const stayed = nextDay({ ...state, creature: { ...state.creature, lingering: true } });
    expect(stayed.traces).toEqual([]);
  });

  it('a linger leaves a cairn where the creature stands, credited to the keeper', () => {
    const state = fieldGame(['keeper'], straight);
    const lingered = ok(act(state, 'keeper', { kind: 'linger' }));
    expect(lingered.traces).toEqual([{ kind: 'cairn', hex: hex(0, 0), step: 0, by: 'keeper' }]);
  });

  it('clearing a pursuer threat leaves broken chain on its hex; other threats leave none', () => {
    const near = (type: string) =>
      placeCharacter(
        withThreat(fieldGame(['warden'], QUIET), type, hex(4, -2), 2, 'c'),
        'warden',
        hex(3, -1),
      );
    const cleared = ok(act(near('captors'), 'warden', { kind: 'strike', threat: 'c' }));
    expect(cleared.threats).toEqual([]);
    expect(cleared.traces).toEqual([{ kind: 'chain', hex: hex(4, -2), step: 0, by: 'warden' }]);
    const swarm = ok(act(near('swarm'), 'warden', { kind: 'strike', threat: 'c' }));
    expect(swarm.threats).toEqual([]);
    expect(swarm.traces).toEqual([]);
    // A hit that does not clear it leaves nothing.
    const hit = ok(
      act(
        placeCharacter(
          withThreat(fieldGame(['scout'], QUIET), 'captors', hex(4, -2), 3, 'c'),
          'scout',
          hex(3, -1),
        ),
        'scout',
        {
          kind: 'strike',
          threat: 'c',
        },
      ),
    );
    expect(hit.traces).toEqual([]);
  });

  it('a character lost leaves a small open gate where they stood, which stays', () => {
    // On a grace hex at day 2; at the next tick it is out of play and they are lost.
    const start = placeCharacter(
      createGame(1, { characterIds: ['a', 'b'], config: straight }),
      'a',
      hex(0, 6),
    );
    const lost = nextDay(nextDay(start));
    expect(lost.characters.find((c) => c.id === 'a')?.status).toBe('lost');
    expect(lost.traces.filter((t) => t.kind === 'gate')).toEqual([
      { kind: 'gate', hex: hex(0, 6), step: 2, by: 'a' },
    ]);
    // Many ticks on, the tile under it is kept, and so is the gate.
    let later = lost;
    for (let i = 0; i < 8; i++) later = nextDay(later);
    expect(later.traces.some((t) => t.kind === 'gate')).toBe(true);
  });

  it('are deterministic, and the tick reports the same traces on every run', () => {
    const state = fieldGame(['a', 'b'], straight, 5);
    expect(nextDayWithEvents(state)).toEqual(nextDayWithEvents(state));
    expect(nextDay(state).traces).toEqual(nextDay(state).traces);
  });

  it('a newer trace of the same kind on the same hex replaces the older', () => {
    const at = hex(1, 1);
    const list = addTraces(
      [{ kind: 'trail', hex: at, step: 1 }],
      [{ kind: 'trail', hex: at, step: 4 }],
      60,
    );
    expect(list).toEqual([{ kind: 'trail', hex: at, step: 4 }]);
  });

  it('are capped at traceCap, the oldest trail going first', () => {
    const trail = (i: number): Trace => ({ kind: 'trail', hex: hex(i, 0), step: i });
    const keep: Trace = { kind: 'cairn', hex: hex(0, 9), step: 0, by: 'k' };
    const many = Array.from({ length: 70 }, (_, i) => trail(i));
    const list = addTraces([keep], many, 60);
    expect(list).toHaveLength(60);
    expect(list[0]).toEqual(keep);
    expect(list.at(-1)).toEqual(trail(69));
    expect(list.filter((t) => t.kind === 'trail')[0]).toEqual(trail(11));
    // With nothing but cairns, the oldest goes.
    const cairns = Array.from({ length: 62 }, (_, i): Trace => ({
      kind: 'cairn',
      hex: hex(i, 5),
      step: i,
    }));
    expect(addTraces([], cairns, 60).map((t) => t.step)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 2),
    );
  });

  it('go with their hex when its tile is pruned', () => {
    const state = fieldGame(['a'], straight);
    const far: Trace = { kind: 'fire', hex: hex(40, 40), step: 0 };
    const near: Trace = { kind: 'fire', hex: hex(1, 0), step: 0 };
    const pruned = pruneTraces({ ...state, traces: [far, near] });
    expect(pruned.traces).toEqual([near]);
    // A long walk leaves old trails behind until their tiles are pruned: the list stays small.
    let walk = fieldGame(['a'], { ...straight, routeLength: 100_000 });
    for (let i = 0; i < 40; i++) walk = nextDay(walk);
    expect(walk.traces.length).toBeLessThanOrEqual(60);
    expect(walk.traces.every((t) => walk.tiles[`${t.hex.q},${t.hex.r}`] !== undefined)).toBe(true);
  });
});
