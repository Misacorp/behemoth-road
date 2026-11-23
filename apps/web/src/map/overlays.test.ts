import { hexCenter, MORNING, paletteColours, walk, type SvgNode } from '@behemoth-road/art';
import {
  createGame,
  findCharacter,
  nextDay,
  planPath,
  predictCreature,
  creatureEdge,
  isPassable,
  onHex,
  ON_CREATURE,
  reachablePlaces,
  type GameState,
} from '@behemoth-road/core';
import { characterOf, threatOutlook, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { PROJECTION } from './art.ts';
import { characterArts, sceneCells } from './cells.ts';
import { placePoint } from './figures.ts';
import { threatNextPath } from '../game/season.ts';
import { type Flow, IDLE } from './flow.ts';
import { buildOverlays, threatTrail } from './overlays.ts';
import { toPreact } from './svgToPreact.ts';

const ID = 'you';

/** A game with the character stepped off the creature onto the hex furthest behind it. */
function offTheCreature(s: GameState): GameState {
  const behind = creatureEdge(s)
    .filter((h) => isPassable(s, h))
    .sort((a, b) => 2 * b.r + b.q - (2 * a.r + a.q))[0]!;
  return { ...s, characters: s.characters.map((c) => ({ ...c, at: onHex(behind) })) };
}

function overlays(state: GameState, flow: Flow) {
  return buildOverlays({
    state,
    flow,
    characterId: ID,
    reachable: reachablePlaces(state, ID),
    predicted: predictCreature(state),
    projection: PROJECTION,
    palette: MORNING,
  });
}

function colours(nodes: SvgNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    walk(n, (x) => {
      for (const k of ['fill', 'stroke']) {
        const v = x.attrs[k];
        if (typeof v === 'string' && v !== 'none') out.push(v.toLowerCase());
      }
    });
  }
  return out;
}

describe('overlays', () => {
  const state = offTheCreature(createGame(20261119, { characterIds: [ID] }));
  const reached = reachablePlaces(state, ID).find((r) => r.cost === 2 && r.place.kind === 'hex');
  if (reached?.place.kind !== 'hex') throw new Error('no hex at cost 2');
  const to = reached.place.hex;
  const plan = planPath(state, ID, to);
  if (!plan.ok) throw new Error('no plan');
  const planned: Flow = { kind: 'planned', to: onHex(to), steps: plan.steps, cost: plan.cost };

  it('use palette colours only and pass the mapper', () => {
    const o = overlays(state, planned);
    const all = [...o.under, ...o.over];
    const palette = paletteColours(MORNING);
    for (const c of colours(all)) expect(palette.has(c)).toBe(true);
    for (const n of all) expect(() => toPreact(n)).not.toThrow();
  });

  it('light reachable tiles and draw the arrow only while moving', () => {
    expect(overlays(state, { kind: 'idle' }).over).toHaveLength(0);
    const idleUnder = overlays(state, { kind: 'idle' }).under.length;
    expect(overlays(state, { kind: 'selected' }).under.length).toBeGreaterThan(idleUnder);
    // The arrow (two strokes), then each stretch's cost: a paper strip and one action arrow per action.
    const over = overlays(state, planned).over;
    const strips = over.filter((n) => n.attrs['data-mark'] === 'cost').length;
    expect(strips).toBeGreaterThan(0);
    expect(over.filter((n) => n.attrs['data-arrow'] === 'ready')).toHaveLength(plan.cost);
    expect(over).toHaveLength(2 + strips + plan.cost);
  });

  it('hint one paw print per likely creature step', () => {
    const under = overlays(state, { kind: 'idle' }).under;
    const marks = under.filter((m) => m.attrs['data-mark'] !== 'window-edge');
    expect(marks).toHaveLength(predictCreature(state).length);
  });

  it("always draw the window's edge: one segment per outer edge of the rim hexes", () => {
    const edge = overlays(state, { kind: 'idle' }).under.find(
      (m) => m.attrs['data-mark'] === 'window-edge',
    );
    const R = state.config.windowRadius;
    // A hex ring of radius R has 6R hexes and 6(2R + 1) outer edges.
    expect(String(edge?.attrs['d']).match(/M/g)).toHaveLength(6 * (2 * R + 1));
  });

  it('draw a lost character faded, outside the scene', () => {
    let s = state;
    for (let i = 0; i < 12; i += 1) s = nextDay(s);
    expect(findCharacter(s, ID)?.status).toBe('lost');
    expect(characterArts(s)).toHaveLength(0);
    expect(overlays(s, { kind: 'idle' }).over.length).toBeGreaterThan(0);
    // Its tile is still drawn, in the fog.
    const at = findCharacter(s, ID)!.at;
    if (at.kind !== 'hex') throw new Error('expected a hex');
    expect(sceneCells(s).find((c) => c.q === at.hex.q && c.r === at.hex.r)?.state).toBe('lost');
  });

  it('light the creature as one place and end a boarding arrow at the free seat', () => {
    const selected = overlays(state, { kind: 'selected' }).under;
    const footprintEdge = selected.filter((n) => String(n.attrs['d']).split('M').length === 19);
    // One outline around the footprint: its 18 outer edges in one path.
    expect(footprintEdge).toHaveLength(1);
    const plan = planPath(state, ID, ON_CREATURE);
    if (!plan.ok) throw new Error('cannot board');
    const o = overlays(state, {
      kind: 'planned',
      to: ON_CREATURE,
      steps: plan.steps,
      cost: plan.cost,
    });
    const seat = placePoint(state, ID, ON_CREATURE, PROJECTION);
    const head = String(o.over[1]!.attrs['d']);
    const tip = head.split('L')[1]!.split(' ').map(Number);
    expect(tip[0]).toBeCloseTo(seat.x, 0);
    expect(tip[1]).toBeCloseTo(seat.y, 0);
  });

  it("marks a step that relies on something with that thing's icon on the arrow", () => {
    const steps = plan.steps.map((st, n) => (n === 0 ? { ...st, via: 'grappling-hook' } : st));
    const o = overlays(state, { kind: 'planned', to: onHex(to), steps, cost: plan.cost });
    const marks = o.over.flatMap((n) => (n.attrs['data-mark'] ? [n.attrs['data-mark']] : []));
    expect(marks.filter((m) => m !== 'cost')).toEqual(['via:grappling-hook']);
    for (const n of o.over) expect(() => toPreact(n)).not.toThrow();
  });
});

describe('Milestone 5 on the map', () => {
  function season(stage: SeasonStage) {
    const s = seasonScenario(stage);
    const view = toPlayerView(s.state);
    const id = characterOf(s.state, USERS.MISA)!.id;
    const o = buildOverlays({
      state: view,
      flow: { kind: 'idle' },
      characterId: id,
      reachable: [],
      predicted: predictCreature(view),
      projection: PROJECTION,
      palette: MORNING,
    });
    return { view, id, o, cells: sceneCells(view), figures: characterArts(view) };
  }
  const cellAt = (cells: ReturnType<typeof sceneCells>, h: { q: number; r: number }) =>
    cells.find((c) => c.q === h.q && c.r === h.r);

  it("hands each threat to the scene with its strength, next step and tomorrow's pulse (core outlook)", () => {
    const { view, cells } = season({
      threats: [
        { type: 'captors', at: { q: 0, r: 3 }, strength: 4 },
        { type: 'rockslide', at: { q: 3, r: 4 } },
      ],
    });
    const outlook = threatOutlook(view);
    expect(outlook.some((x) => x.arrives === 'tomorrow')).toBe(true);
    view.threats.forEach((t, i) => {
      const next = outlook[i]!.next;
      expect(cellAt(cells, t.hex)?.threat).toEqual({
        look: t.type,
        strength: t.strength,
        toward: next ? { q: next.q - t.hex.q, r: next.r - t.hex.r } : null,
        arrivesTomorrow: outlook[i]!.arrives === 'tomorrow',
      });
    });
  });

  it('hands settlements to the scene by attitude with their favour', () => {
    const { view, cells } = season({
      settlements: [
        { at: { q: 1, r: 3 }, favour: 2 },
        { at: { q: 3, r: 4 }, attitude: 'angry' },
      ],
    });
    expect(view.settlements.map((s) => cellAt(cells, s.hex)?.settlement)).toEqual([
      { look: 'hill-folk', attitude: 'wary', favour: 2, favourNeeded: 3 },
      { look: 'hill-folk', attitude: 'angry', favour: 0, favourNeeded: 3 },
    ]);
  });

  it('rings a warden on a hex; marks the escorted and the defending riders', () => {
    const escorted = season({ wardenAt: { q: 2, r: 2 } });
    const rings = escorted.o.under.filter((n) => n.attrs['data-escort'] !== undefined);
    expect(rings).toHaveLength(1);
    expect(escorted.figures.find((f) => f.id === escorted.id)?.marks).toEqual({ escorted: true });
    // The warden itself carries no shield mark: its ring is its sign.
    expect(escorted.figures.filter((f) => f.marks).map((f) => f.id)).toEqual([escorted.id]);
    const defending = season({ role: 'warden', at: 'creature', defending: true });
    expect(defending.figures.find((f) => f.id === defending.id)?.marks).toEqual({
      defending: true,
    });
    expect(defending.o.under.filter((n) => n.attrs['data-escort'] !== undefined)).toEqual([]);
  });

  it('bandages a character struck today, and only today', () => {
    const s = seasonScenario({});
    const view = toPlayerView(s.state);
    const id = characterOf(s.state, USERS.MISA)!.id;
    const struck = (day: number) => ({
      ...view,
      characters: view.characters.map((c) => (c.id === id ? { ...c, struckDay: day } : c)),
    });
    expect(characterArts(struck(view.day)).find((f) => f.id === id)?.marks).toEqual({
      struck: true,
    });
    expect(characterArts(struck(view.day - 1)).find((f) => f.id === id)?.marks).toBeUndefined();
  });

  it("draws an open threat card's next-tick trail with its end ringed, and nothing once it closes", () => {
    const { view, id } = season({ threats: [{ type: 'captors', at: { q: 0, r: 5 } }] });
    const threat = view.threats[0]!;
    const path = threatNextPath(view, threat.id);
    expect(path.length).toBeGreaterThan(0);
    const draw = (flow: Flow) =>
      buildOverlays({
        state: view,
        flow,
        characterId: id,
        reachable: [],
        predicted: predictCreature(view),
        projection: PROJECTION,
        palette: MORNING,
      }).over.map((m) => m.attrs['data-mark']);
    const open = draw({ kind: 'threat', id: threat.id });
    expect(open.filter((m) => m === 'threat-trail')).toHaveLength(2);
    expect(open.filter((m) => m === 'threat-end')).toHaveLength(1);
    const end = path.at(-1)!;
    const ring = threatTrail(
      {
        state: view,
        flow: IDLE,
        characterId: id,
        reachable: [],
        predicted: [],
        projection: PROJECTION,
        palette: MORNING,
      },
      threat.id,
    )[0]!;
    const c = hexCenter(PROJECTION, end.q, end.r);
    const xs = String(ring.attrs.d)
      .match(/-?[\d.]+/g)!
      .map(Number);
    const cx = xs.filter((_, j) => j % 2 === 0).reduce((a, b) => a + b, 0) / (xs.length / 2);
    expect(cx).toBeCloseTo(c.x, 0);
    for (const flow of [IDLE, { kind: 'threat', id: 'gone' } as Flow]) {
      const closed = draw(flow);
      expect(closed.some((m) => m === 'threat-trail' || m === 'threat-end')).toBe(false);
    }
  });

  it('badges a threat you could strike and a settlement beside you with what it offers', () => {
    const near = season({
      threats: [
        { type: 'swarm', at: { q: 1, r: 3 } },
        { type: 'captors', at: { q: 3, r: 5 } },
      ],
      settlements: [{ at: { q: 2, r: 2 } }, { at: { q: 0, r: 2 }, attitude: 'friendly' }],
    });
    const marks = near.o.over.map((m) => m.attrs['data-mark']);
    // Only the swarm next to you; the captors are too far.
    expect(marks.filter((m) => m === 'action:strike')).toHaveLength(1);
    expect(marks.filter((m) => m === 'action:parley')).toHaveLength(1);
    expect(marks.filter((m) => m === 'action:gift')).toHaveLength(1);
    const taken = season({
      settlements: [{ at: { q: 2, r: 2 }, attitude: 'friendly', boon: 'gift' }],
    });
    expect(taken.o.over.some((m) => String(m.attrs['data-mark']).startsWith('action:'))).toBe(
      false,
    );
  });
});

describe('polish round marks', () => {
  const marks = (state: GameState, kind: string): number => {
    const o = buildOverlays({
      state,
      flow: { kind: 'idle' },
      characterId: characterOf(state, USERS.MISA)!.id,
      reachable: [],
      predicted: predictCreature(state),
      projection: PROJECTION,
      palette: MORNING,
    });
    let found = 0;
    for (const n of [...o.under, ...o.over]) {
      walk(n, (x) => {
        if (x.attrs['data-mark'] === kind) found += 1;
      });
    }
    return found;
  };

  it('marks explored hexes that hold nothing, and only those', () => {
    const s = seasonScenario({ role: 'scout' }).state;
    const empty = Object.entries(s.tiles).filter(([key, t]) => t.explored && !s.features[key]);
    expect(marks(s, 'explored-empty')).toBeGreaterThan(0);
    expect(marks(s, 'explored-empty')).toBeLessThanOrEqual(empty.length);
    // A feature revealed on every explored hex leaves none to mark.
    const full: GameState = {
      ...s,
      features: Object.fromEntries(
        Object.entries(s.tiles)
          .filter(([, t]) => t.explored)
          .map(([key]) => [key, { type: 'iron-deposit', revealed: true, left: 1 }]),
      ),
    };
    expect(marks(full, 'explored-empty')).toBe(0);
  });

  it('shows the misled mark while the mislead lasts, and not after', () => {
    const s = seasonScenario({ role: 'scout' }).state;
    expect(marks(s, 'misled')).toBe(0);
    expect(marks({ ...s, misleadUntilDay: s.day + 2 }, 'misled')).toBe(1);
    expect(marks({ ...s, misleadUntilDay: s.day }, 'misled')).toBe(1);
    expect(marks({ ...s, misleadUntilDay: s.day - 1 }, 'misled')).toBe(0);
  });
});
