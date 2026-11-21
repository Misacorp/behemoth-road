import { describe, expect, it } from 'vitest';
import {
  act,
  emptyStats,
  type GameEvent,
  hex,
  loadGame,
  move,
  nextDayWithEvents,
  recordEvents,
  toPlayerView,
} from '../src/index.ts';
import { chainGame, fieldGame, placeCharacter, QUIET, withFeature, withThreat } from './helpers.ts';

const ev = (events: GameEvent[], actor?: string) =>
  recordEvents(fieldGame(['a', 'b'], QUIET), events, actor).stats;

describe('season stats', () => {
  it('start empty', () => {
    expect(fieldGame(['a'], QUIET).stats).toEqual(emptyStats());
  });

  it('count each stat from its event, per character or shared', () => {
    const h = hex(1, 1);
    const stats = ev([
      { kind: 'gather', hex: h, characterId: 'a', material: 'iron', amount: 2 },
      { kind: 'gather', hex: h, characterId: 'b', material: 'iron', amount: 1 },
      { kind: 'fed', characterId: 'b', material: 'forage' },
      { kind: 'threat-hit', id: 't', characterId: 'a', strength: 1 },
      { kind: 'threat-hit', id: 't', characterId: 'a', strength: 0 },
      { kind: 'threat-cleared', id: 't', characterId: 'a' },
      { kind: 'find', hex: h, characterId: 'b', material: 'coin', amount: 1 },
      { kind: 'unlock-done', unlock: 'grappling-hook' },
      { kind: 'befriended', id: 's' },
      { kind: 'peril', from: 0, to: 4 },
      { kind: 'peril', from: 4, to: 2 },
    ]);
    expect(stats.shared).toEqual({
      threatsTurned: 1,
      finds: 1,
      unlocks: 1,
      befriended: 1,
      peakPeril: 4,
    });
    expect(stats.byCharacter).toEqual({
      a: { explored: 0, strikes: 2, gathered: 2, fed: 0 },
      b: { explored: 0, strikes: 0, gathered: 1, fed: 1 },
    });
  });

  it('credit an explored hex to who caused it', () => {
    const stats = ev([{ kind: 'explore', hex: hex(1, 1) }], 'a');
    expect(stats.byCharacter).toEqual({ a: { explored: 1, strikes: 0, gathered: 0, fed: 0 } });
    expect(ev([{ kind: 'explore', hex: hex(1, 1) }]).byCharacter).toEqual({});
  });

  it('follow a real survey, move and gather through the core', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', hex(3, -1));
    state = withFeature(state, hex(3, -2), 'iron-deposit');
    const surveyed = act(state, 'scout', { kind: 'survey', hex: hex(3, -2) });
    if (!surveyed.ok) throw new Error(surveyed.reason);
    expect(surveyed.state.stats.byCharacter.scout?.explored).toBe(1);
    const walked = move(surveyed.state, 'scout', hex(3, -2));
    if (!walked.ok) throw new Error(walked.reason);
    // Already explored by the survey: no second credit.
    expect(walked.state.stats.byCharacter.scout?.explored).toBe(1);
    const gathered = act(walked.state, 'scout', { kind: 'gather' });
    if (!gathered.ok) throw new Error(gathered.reason);
    expect(gathered.state.stats.byCharacter.scout?.gathered).toBeGreaterThan(0);
  });

  it('count a strike and the clearing of a threat', () => {
    let state = fieldGame(['a'], QUIET);
    state = withThreat(state, 'rockslide', hex(0, 3), 1);
    state = placeCharacter(state, 'a', hex(0, 3));
    const hit = act(state, 'a', { kind: 'strike', threat: state.threats[0]!.id });
    if (!hit.ok) throw new Error(hit.reason);
    expect(hit.state.stats.byCharacter.a?.strikes).toBe(1);
    expect(hit.state.stats.shared.threatsTurned).toBe(1);
  });

  it('track peak peril through the tick, and never lower it', () => {
    let state = withThreat(
      fieldGame(['rider'], { ...QUIET, veerWeights: { left: 0, right: 0 } }),
      'captors',
      hex(0, -1),
      3,
    );
    state = nextDayWithEvents(state).state;
    const peak = state.stats.shared.peakPeril;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBe(state.peril);
    state = nextDayWithEvents(state).state;
    expect(state.peril).toBeLessThan(peak);
    expect(state.stats.shared.peakPeril).toBe(peak);
  });

  it('are public in the player view, and a saved game without them loads empty', () => {
    const state = fieldGame(['a'], QUIET);
    expect(toPlayerView(state).stats).toEqual(emptyStats());
    const old: Record<string, unknown> = { ...state };
    delete old.stats;
    expect(loadGame(old).stats).toEqual(emptyStats());
  });
});
