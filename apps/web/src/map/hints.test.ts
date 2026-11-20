import { characterOf, predictCreature, reachablePlaces, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type ChainStage, chainScenario, USERS } from '../api/fixtures.ts';
import { PALETTE, PROJECTION } from './art.ts';
import type { Flow } from './flow.ts';
import { buildOverlays } from './overlays.ts';

function marks(stage: ChainStage, flow: Flow): string[] {
  const s = chainScenario(stage);
  const state = toPlayerView(s.state);
  const id = characterOf(s.state, USERS.MISA)!.id;
  const o = buildOverlays({
    state,
    flow,
    characterId: id,
    reachable: reachablePlaces(state, id),
    predicted: predictCreature(state),
    projection: PROJECTION,
    palette: PALETTE,
  });
  return [...o.under, ...o.over].flatMap((n) => {
    const m = n.attrs['data-mark'];
    return typeof m === 'string' ? [m] : [];
  });
}

describe('hints at what can be done near you', () => {
  it('badges an explored node next to you with the gather hand, and nothing when none is', () => {
    expect(marks({ explored: ['iron'] }, { kind: 'idle' })).toContain('action:hand');
    expect(marks({}, { kind: 'idle' })).not.toContain('action:hand');
  });

  it('badges a site you stand on with the key', () => {
    expect(marks({ at: 'tomb', explored: ['tomb'] }, { kind: 'idle' })).toContain('action:key');
  });

  it('hints a survey on unexplored neighbours only while your character is selected', () => {
    expect(
      marks({}, { kind: 'selected' }).filter((m) => m === 'survey-hint').length,
    ).toBeGreaterThan(0);
    expect(marks({}, { kind: 'idle' })).not.toContain('survey-hint');
  });
});
