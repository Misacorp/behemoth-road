import { MORNING, paletteColours, walk, type SvgNode } from '@behemoth-road/art';
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
import type { Flow } from './flow.ts';
import { buildOverlays } from './overlays.ts';
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
    // Arrow line, head, and one pip per action.
    expect(overlays(state, planned).over).toHaveLength(2 + plan.cost);
  });

  it('hint one paw print per likely creature step', () => {
    expect(overlays(state, { kind: 'idle' }).under).toHaveLength(predictCreature(state).length);
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
    expect(marks).toEqual(['via:grappling-hook']);
    for (const n of o.over) expect(() => toPreact(n)).not.toThrow();
  });
});

describe('Milestone 5 marks', () => {
  const marksOf = (nodes: readonly SvgNode[], mark: string): SvgNode[] =>
    nodes.flatMap((root) => {
      const out: SvgNode[] = [];
      walk(root, (node) => {
        if (node.attrs['data-mark'] === mark) out.push(node);
      });
      return out;
    });

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
    return { view, id, o };
  }

  it('draws each threat on its hex with an approach arrow, pulsing when it arrives tomorrow', () => {
    const { view, o } = season({
      threats: [
        { type: 'captors', at: { q: 0, r: 3 } },
        { type: 'rockslide', at: { q: 3, r: 4 } },
      ],
    });
    const threats = marksOf(o.under, 'threat');
    expect(threats.map((t) => t.attrs['data-threat'])).toEqual(view.threats.map((t) => t.id));
    const outlook = threatOutlook(view);
    threats.forEach((t, i) => {
      expect(t.attrs['data-pulse']).toBe(
        outlook[i]!.arrives === 'tomorrow' ? 'tomorrow' : undefined,
      );
    });
    expect(outlook.some((x) => x.arrives === 'tomorrow')).toBe(true);
    // The rockslide waits (speed 0): only the captors have an arrow.
    expect(marksOf(o.under, 'approach')).toHaveLength(outlook.filter((x) => x.next).length);
  });

  it('draws settlements by attitude', () => {
    const { o } = season({
      settlements: [
        { at: { q: 1, r: 3 } },
        { at: { q: 3, r: 4 }, attitude: 'friendly', favour: 3 },
      ],
    });
    expect(marksOf(o.under, 'settlement').map((s) => s.attrs['data-attitude'])).toEqual([
      'wary',
      'friendly',
    ]);
  });

  it('rings a guardian on a hex, shields the escorted and the defending riders', () => {
    const escorted = season({ guardianAt: { q: 2, r: 2 } });
    expect(marksOf(escorted.o.under, 'escort')).toHaveLength(1);
    expect(marksOf(escorted.o.over, 'escorted').map((m) => m.attrs['data-character'])).toEqual([
      escorted.id,
    ]);
    const defending = season({ role: 'guardian', at: 'creature', defending: true });
    expect(marksOf(defending.o.over, 'defending').map((m) => m.attrs['data-character'])).toEqual([
      defending.id,
    ]);
    expect(marksOf(defending.o.over, 'escorted')).toEqual([]);
    expect(marksOf(defending.o.under, 'escort')).toEqual([]);
  });
});
