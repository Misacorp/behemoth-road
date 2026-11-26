import { characterOf, hexKey, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { blockedOverlay, blockedSubject, fireGlows } from '../map/overlays.ts';
import { PALETTE, PROJECTION } from '../map/art.ts';
import { burntKeys, featureArtAt, isBrazierAt, sceneCells, characterArts } from '../map/cells.ts';
import { mapTipAt } from '../map/mapTips.ts';
import { IDLE } from '../map/flow.ts';
import { momentsFromEvents } from './moments.ts';
import { rosterRows } from '../roster/model.ts';
import { tipMarkOf } from '../ui/tipMarks.ts';
import { digOption, fireNoteAt, greyedForPin, struggleOption, takesFire } from './fire.ts';
import { threatCard } from './season.ts';
import { toView } from '../api/fixtures.ts';

function staged(stage: SeasonStage) {
  const s = seasonScenario(stage);
  const c = s.state.creature.centre;
  return {
    s,
    view: toPlayerView(s.state),
    me: characterOf(s.state, USERS.MISA)!.id,
    ola: characterOf(s.state, USERS.OLA)!.id,
    abs: (h: { q: number; r: number }) => ({ q: c.q + h.q, r: c.r + h.r }),
  };
}

const START = { q: 1, r: 2 };
const NEAR = { q: 1, r: 3 };

describe('braziers', () => {
  it('a cold brazier is revealed art with no flame; a lit one carries its nights', () => {
    const cold = staged({ brazier: true });
    const key = hexKey(cold.abs(START));
    expect(isBrazierAt(cold.view, key)).toBe(true);
    expect(featureArtAt(cold.view, key)).toEqual({ look: 'brazier' });
    const lit = staged({ brazierLit: 2 });
    expect(featureArtAt(lit.view, key)).toEqual({ look: 'brazier', lit: true, nightsLeft: 2 });
    expect(fireNoteAt(lit.view, cold.abs(START))).toEqual({ nights: 2 });
    expect(fireNoteAt(cold.view, cold.abs(START))).toBeNull();
  });

  it('a lit brazier draws no second fire beside it', () => {
    const lit = staged({ brazierLit: 3 });
    const cell = sceneCells(lit.view).find(
      (c) => c.q === lit.abs(START).q && c.r === lit.abs(START).r,
    );
    expect(cell?.fire).toBeUndefined();
    expect(cell?.feature?.lit).toBe(true);
    expect(mapTipAt(lit.view, lit.abs(START))).toBe('map:fire-brazier');
  });

  it('takes fire only on a brazier or a burnable', () => {
    const b = staged({ brazier: true });
    expect(takesFire(b.view, b.abs(START))).toBe(true);
    const d = staged({ deposit: 'deadfall', explored: ['iron'] });
    expect(takesFire(d.view, d.abs(NEAR))).toBe(true);
    expect(fireNoteAt(d.view, d.abs(NEAR))).toEqual({ burnable: true });
    const iron = staged({ explored: ['iron'] });
    expect(takesFire(iron.view, iron.abs(NEAR))).toBe(false);
    expect(takesFire(iron.view, iron.abs(START))).toBe(false);
  });
});

describe('a spent fire is not lit', () => {
  it('reads cold once its nights are gone, even if a stale stimulus lingers', () => {
    const lit = staged({ brazierLit: 1 });
    const key = hexKey(lit.abs(START));
    expect(featureArtAt(lit.view, key)).toMatchObject({ lit: true, nightsLeft: 1 });
    const stale = { ...lit.view, day: lit.view.day + 1 };
    expect(featureArtAt(stale, key)).toEqual({ look: 'brazier' });
    expect(fireNoteAt(stale, lit.abs(START))).toBeNull();
  });
});

describe('burnt ground', () => {
  it('is a fire scar where no feature stands, and never on a brazier', () => {
    const s = staged({ burnt: [NEAR], brazier: true });
    expect([...burntKeys(s.view)]).toEqual([[hexKey(s.abs(NEAR)), 'deadfall']]);
    const cell = sceneCells(s.view).find((c) => c.q === s.abs(NEAR).q && c.r === s.abs(NEAR).r);
    expect(cell?.burnt).toBe('deadfall');
    expect(mapTipAt(s.view, s.abs(NEAR))).toBe('map:burnt');
  });
});

describe('the blocked overlay and the fire glow', () => {
  const input = (v: ReturnType<typeof staged>['view'], me: string, flow = IDLE as never) => ({
    state: v,
    projection: PROJECTION,
    palette: PALETTE,
    flow,
    characterId: me,
  });

  it('draws a glow for each lit brazier, at its reveal radius, and none when cold', () => {
    const lit = staged({ brazierLit: 2 });
    const glows = fireGlows(input(lit.view, lit.me) as never);
    expect(glows).toHaveLength(1);
    expect(glows[0]!.attrs['data-fire-glow']).toBe(`${lit.abs(START).q},${lit.abs(START).r}`);
    const cold = staged({ brazier: true });
    expect(fireGlows(input(cold.view, cold.me) as never)).toEqual([]);
  });

  it('shows stripes only for the selected fire-fearing threat, and clears when it is not', () => {
    const s = staged({ brazierLit: 2, threats: [{ type: 'swarm', at: { q: 3, r: 4 } }] });
    const id = s.view.threats[0]!.id;
    expect(blockedOverlay(input(s.view, s.me) as never)).toEqual([]);
    const flow = { kind: 'threat', id } as never;
    expect(blockedSubject(input(s.view, s.me, flow) as never)?.tags).toContain('fears-fire');
    const drawn = blockedOverlay(input(s.view, s.me, flow) as never);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.attrs['data-blocked']).toBeGreaterThan(0);
    // Closing the popover (back to no flow) clears it.
    expect(blockedOverlay(input(s.view, s.me, IDLE as never) as never)).toEqual([]);
  });

  it('draws nothing for a threat that fears nothing, or with no fire burning', () => {
    const slide = staged({ brazierLit: 2, threats: [{ type: 'rockslide', at: { q: 3, r: 4 } }] });
    const flow = { kind: 'threat', id: slide.view.threats[0]!.id } as never;
    expect(blockedOverlay(input(slide.view, slide.me, flow) as never)).toEqual([]);
    const dark = staged({ threats: [{ type: 'swarm', at: { q: 3, r: 4 } }] });
    const flow2 = { kind: 'threat', id: dark.view.threats[0]!.id } as never;
    expect(blockedOverlay(input(dark.view, dark.me, flow2) as never)).toEqual([]);
  });

  it('leaves no blocked overlay on screen when a lure animal or the cart is selected', () => {
    const s = staged({
      brazierLit: 2,
      threats: [{ type: 'swarm', at: { q: 3, r: 4 } }],
      lures: [{ at: START }],
      carts: [{ at: START }],
    });
    const lure = { kind: 'lure', id: s.view.lures[0]!.id } as never;
    const cart = { kind: 'cart', id: s.view.carts[0]!.id } as never;
    expect(blockedOverlay(input(s.view, s.me, lure) as never)).toEqual([]);
    expect(blockedOverlay(input(s.view, s.me, cart) as never)).toEqual([]);
  });
});

describe('tip marks', () => {
  it('read the fire tags from content', () => {
    expect(tipMarkOf('feature:deadfall')).toBe('burnable');
    expect(tipMarkOf('feature:snare')).toBe('burnable');
    expect(tipMarkOf('feature:brazier')).toBeNull();
    expect(tipMarkOf('threat:swarm')).toBe('fears-fire');
    expect(tipMarkOf('threat:stampede')).toBe('fears-fire');
    expect(tipMarkOf('threat:rockslide')).toBeNull();
    expect(tipMarkOf('hud:day')).toBeNull();
  });
});

describe('the rockslide odds', () => {
  it('the card carries the viewer’s own odds, and the fear mark for a swarm', () => {
    const s = staged({
      threats: [
        { type: 'rockslide', at: NEAR },
        { type: 'swarm', at: { q: 0, r: 2 } },
      ],
    });
    const [slide, swarm] = s.view.threats;
    const card = threatCard(s.view, s.me, slide!.id)!;
    expect(card.odds?.success).toBeCloseTo(1 - s.view.config.slideFallChance);
    expect(card.odds?.art).toBe('rocks');
    expect(card.fears).toBe(false);
    const other = threatCard(s.view, s.me, swarm!.id)!;
    expect(other.odds).toBeNull();
    expect(other.fears).toBe(true);
  });

  it('is better for an engineer', () => {
    const s = staged({ role: 'engineer', threats: [{ type: 'rockslide', at: NEAR }] });
    const card = threatCard(s.view, s.me, s.view.threats[0]!.id)!;
    expect(card.odds?.success).toBeCloseTo(1 - s.view.config.slideFallChance * 0.5);
  });
});

describe('pinned characters', () => {
  it('are marked on the map and the roster, and others can dig them out', () => {
    const s = staged({ pinned: ['ola'] });
    expect(characterArts(s.view).find((c) => c.id === s.ola)?.marks?.pinned).toBe(true);
    expect(mapTipAt(s.view, s.abs({ q: 0, r: 2 }))).toBe('map:pinned');
    const row = rosterRows(toView(seasonScenario({ pinned: ['ola'] })), 3).find(
      (r) => r.characterId === s.ola,
    );
    expect(row?.pinned).toBe(true);
    expect(digOption(s.view, s.me, s.ola)).toEqual({
      cost: s.view.config.digOutCost,
      enabled: true,
    });
    expect(digOption(s.view, s.me, s.me)).toBeNull();
  });

  it('offer no dig-out for a free character, and none when you are pinned yourself', () => {
    const free = staged({});
    expect(digOption(free.view, free.me, free.ola)).toBeNull();
    const both = staged({ pinned: ['me', 'ola'] });
    expect(digOption(both.view, both.me, both.ola)).toBeNull();
  });

  it('grey every action with the pinned reason', () => {
    const greyed = greyedForPin([
      { kind: 'gather', enabled: true },
      { kind: 'light-fire', enabled: false, why: 'why:no-fuel' as const },
    ]);
    expect(greyed.map((a) => [a.enabled, a.why])).toEqual([
      [false, 'why:pinned'],
      [false, 'why:pinned'],
    ]);
  });
});

describe('struggling free', () => {
  it('is offered to the pinned self with odds that grow with each failed try', () => {
    const chances = [0, 1, 2, 3, 4].map((n) => {
      const s = staged({ pinned: ['me'], pinnedActions: 2, struggles: n });
      return struggleOption(s.view, s.me)?.odds?.percent.success;
    });
    expect(chances).toEqual([20, 40, 60, 80, undefined]);
  });

  it('is faded without actions, and not offered when free', () => {
    const tired = staged({ pinned: ['me'] });
    expect(struggleOption(tired.view, tired.me)).toMatchObject({
      enabled: false,
      why: 'why:not-enough-actions',
    });
    const free = staged({});
    expect(struggleOption(free.view, free.me)).toBeNull();
  });

  it('drops odds from the actions greyed by the pin', () => {
    const greyed = greyedForPin([{ kind: 'parley', enabled: true, odds: { success: 0.5 } }]);
    expect(greyed[0]).not.toHaveProperty('odds');
  });
});

describe('moments for pinned and dug-out', () => {
  const where = {
    threat: () => null,
    settlement: () => null,
    character: (id: string) => (id === 'c1' ? { q: 2, r: 3 } : null),
  };
  const centre = { q: 0, r: 0 };
  it('place them on the character', () => {
    expect(momentsFromEvents([{ kind: 'pinned', characterId: 'c1' }], centre, 'c1', where)).toEqual(
      [{ kind: 'pinned', hex: { q: 2, r: 3 }, mine: true }],
    );
    expect(momentsFromEvents([{ kind: 'dug-out', characterId: 'c1' }], centre, 'x', where)).toEqual(
      [{ kind: 'dug-out', hex: { q: 2, r: 3 } }],
    );
    expect(momentsFromEvents([{ kind: 'dug-out', characterId: 'zz' }], centre, 'x', where)).toEqual(
      [],
    );
  });

  it('plays a failed struggle as the stones heaving, and a freeing one as the dig-out', () => {
    const ev = (freed: boolean) => [{ kind: 'struggled', characterId: 'c1', freed }];
    expect(momentsFromEvents(ev(false), centre, 'c1', where)).toEqual([
      { kind: 'struggled', hex: { q: 2, r: 3 } },
    ]);
    expect(momentsFromEvents(ev(true), centre, 'c1', where)).toEqual([
      { kind: 'dug-out', hex: { q: 2, r: 3 } },
    ]);
  });
});
