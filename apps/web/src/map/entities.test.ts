/**
 * The registry of tappable things on a hex (`pickEntries`) and the taps that read it: every combination of
 * you, a capybara, the cart and a threat on one hex opens the picker, each thing is reachable from its
 * bubble, and the capybara can be led from your own hex.
 */
import { characterOf, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { leadOption } from '../game/lure.ts';
import type { Target } from './pick.ts';
import { choose, entryKey, IDLE, pickEntries, startLead, tap, tapHex, type Flow } from './flow.ts';

const START = { q: 1, r: 2 };

function staged(stage: SeasonStage) {
  const s = seasonScenario(stage);
  const view = toPlayerView(s.state);
  const me = characterOf(s.state, USERS.MISA)!.id;
  const c = s.state.creature.centre;
  const hex = { q: c.q + START.q, r: c.r + START.r };
  return { view, me, hex };
}
const keys = (g: ReturnType<typeof staged>): string[] =>
  pickEntries(g.view, g.me, g.hex).map(entryKey);

describe('the registry of things on a hex', () => {
  it('lists you plus the capybara', () => {
    expect(keys(staged({ lures: [{ at: START }] }))).toEqual(['me', 'lure:lure-1']);
  });

  it('lists you plus a cart you are not hitched to, and leaves a hitched cart to your own card', () => {
    expect(keys(staged({ carts: [{ at: START }] }))).toEqual(['me', 'cart:cart-1']);
    expect(keys(staged({ carts: [{ at: START, puller: 'me' }] }))).toEqual(['me']);
    expect(keys(staged({ carts: [{ at: START, rider: 'me' }] }))).toEqual(['me']);
  });

  it('lists you, the capybara, the cart and a threat together', () => {
    const g = staged({
      lures: [{ at: START }],
      carts: [{ at: START }],
      threats: [{ type: 'swarm', at: START }],
    });
    expect(keys(g)).toEqual([
      'me',
      'lure:lure-1',
      'cart:cart-1',
      expect.stringMatching(/^threat:/),
    ]);
  });

  it('lists a lone capybara elsewhere as nothing here, and nothing on an empty hex', () => {
    const g = staged({ lures: [{ at: { q: 3, r: 3 } }] });
    expect(keys(g)).toEqual(['me']);
    const far = { q: g.hex.q + 4, r: g.hex.r + 3 };
    expect(pickEntries(g.view, g.me, far)).toEqual([]);
  });
});

describe('taps on a hex with several things', () => {
  const stages: Record<string, SeasonStage> = {
    'you and the capybara': { lures: [{ at: START }] },
    'you and the cart': { carts: [{ at: START }] },
    'you, the capybara and a threat': {
      lures: [{ at: START }],
      threats: [{ type: 'swarm', at: START }],
    },
  };
  for (const [name, stage] of Object.entries(stages)) {
    it(`${name}: a tap on the hex, on you or on the thing opens the picker, from idle or selected`, () => {
      const g = staged(stage);
      const targets: Target[] = [
        { kind: 'hex', hex: g.hex },
        { kind: 'me' },
        ...(stage.lures ? [{ kind: 'lure', id: 'lure-1' } as const] : []),
        ...(stage.carts ? [{ kind: 'cart', id: 'cart-1' } as const] : []),
      ];
      for (const t of targets) {
        for (const from of [IDLE, { kind: 'selected' } as Flow]) {
          expect(tap(from, g.view, g.me, t)).toEqual({ kind: 'pick', hex: g.hex });
        }
      }
    });
  }

  it('every bubble opens its own card with a back to the picker', () => {
    const g = staged({ lures: [{ at: START }], carts: [{ at: START }] });
    const pick = tap(IDLE, g.view, g.me, { kind: 'hex', hex: g.hex });
    for (const e of pickEntries(g.view, g.me, g.hex)) {
      const next = choose(g.view, g.me, pick, e);
      if (e.kind === 'me') expect(next.kind).toBe('selected');
      else expect(next).toMatchObject({ kind: e.kind, id: (e as { id: string }).id, back: pick });
    }
  });

  it('a lone capybara on another hex still opens its card by its figure', () => {
    const g = staged({ lures: [{ at: { q: 3, r: 3 } }] });
    expect(tap(IDLE, g.view, g.me, { kind: 'lure', id: 'lure-1' })).toEqual({
      kind: 'lure',
      id: 'lure-1',
    });
  });

  it('the same hex again closes the picker', () => {
    const g = staged({ lures: [{ at: START }] });
    expect(tapHex({ kind: 'pick', hex: g.hex }, g.view, g.me, g.hex)).toEqual(IDLE);
  });
});

describe('leading the capybara from your own hex', () => {
  it('offers Lead on its card, and lead mode keeps the back to the picker', () => {
    const g = staged({ lures: [{ at: START }] });
    expect(leadOption(g.view, g.me, 'lure-1')).toMatchObject({ enabled: true });
    const pick = tap(IDLE, g.view, g.me, { kind: 'hex', hex: g.hex });
    const card = choose(g.view, g.me, pick, { kind: 'lure', id: 'lure-1' });
    expect(card).toMatchObject({ kind: 'lure', back: pick });
    expect(startLead(card)).toMatchObject({ kind: 'lead', id: 'lure-1', back: pick });
  });
});
