import { characterOf, hexKey, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { fireFearedNear, fireRings } from '../map/overlays.ts';
import { PALETTE, PROJECTION } from '../map/art.ts';
import { burntKeys, featureArtAt, isBrazierAt, sceneCells, characterArts } from '../map/cells.ts';
import { mapTipAt } from '../map/mapTips.ts';
import { fallPips } from '../map/FireMarks.tsx';
import { IDLE } from '../map/flow.ts';
import { momentsFromEvents } from './moments.ts';
import { rosterRows } from '../roster/model.ts';
import { tipMarkOf } from '../ui/tipMarks.ts';
import { digOption, fireNoteAt, greyedForPin, takesFire } from './fire.ts';
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

describe('burnt ground', () => {
  it('is a fire scar where no feature stands, and never on a brazier', () => {
    const base = staged({ burnt: [NEAR], brazier: true });
    const s = {
      ...base,
      view: {
        ...base.view,
        traces: [...base.view.traces, { kind: 'fire' as const, hex: base.abs(START), step: 0 }],
      },
    };
    expect([...burntKeys(s.view)]).toEqual([hexKey(s.abs(NEAR))]);
    const cell = sceneCells(s.view).find((c) => c.q === s.abs(NEAR).q && c.r === s.abs(NEAR).r);
    expect(cell?.burnt).toBe('deadfall');
    expect(mapTipAt(s.view, s.abs(NEAR))).toBe('map:burnt');
  });
});

describe('the fire ring', () => {
  it('shows only while a threat that fears fire is on the map', () => {
    const none = staged({ brazierLit: 2 });
    const input = (v: typeof none.view) => ({
      state: v,
      projection: PROJECTION,
      palette: PALETTE,
      flow: IDLE,
      characterId: none.me,
    });
    expect(fireFearedNear(none.view)).toBe(false);
    expect(fireRings(input(none.view) as never)).toEqual([]);
    const swarm = staged({ brazierLit: 2, threats: [{ type: 'swarm', at: { q: 3, r: 4 } }] });
    expect(fireFearedNear(swarm.view)).toBe(true);
    const rings = fireRings(input(swarm.view) as never);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.attrs['data-fire-ring']).toBe(`${swarm.abs(START).q},${swarm.abs(START).r}`);
    const slide = staged({ brazierLit: 2, threats: [{ type: 'rockslide', at: { q: 3, r: 4 } }] });
    expect(fireRings(input(slide.view) as never)).toEqual([]);
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

describe('the rockslide risk', () => {
  it('scales the stone pips to the chance', () => {
    expect(fallPips(0)).toBe(0);
    expect(fallPips(0.01)).toBe(1);
    expect(fallPips(0.25)).toBe(1);
    expect(fallPips(0.5)).toBe(2);
    expect(fallPips(1)).toBe(4);
    expect(fallPips(Number.NaN)).toBe(0);
  });

  it('the card carries the viewer’s own chance, and the fear mark for a swarm', () => {
    const s = staged({
      threats: [
        { type: 'rockslide', at: NEAR },
        { type: 'swarm', at: { q: 0, r: 2 } },
      ],
    });
    const [slide, swarm] = s.view.threats;
    const card = threatCard(s.view, s.me, slide!.id)!;
    expect(card.fall).toBe(s.view.config.slideFallChance);
    expect(card.fears).toBe(false);
    const other = threatCard(s.view, s.me, swarm!.id)!;
    expect(other.fall).toBeNull();
    expect(other.fears).toBe(true);
  });

  it('is smaller for an engineer', () => {
    const s = staged({ role: 'engineer', threats: [{ type: 'rockslide', at: NEAR }] });
    const card = threatCard(s.view, s.me, s.view.threats[0]!.id)!;
    expect(card.fall).toBe(s.view.config.slideFallChance * 0.5);
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
});
