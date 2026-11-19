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
import { describe, expect, it } from 'vitest';
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
