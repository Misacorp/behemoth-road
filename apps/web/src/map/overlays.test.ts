import { MORNING, paletteColours, walk, type SvgNode } from '@behemoth-road/art';
import {
  createGame,
  findCharacter,
  nextDay,
  planPath,
  predictCreature,
  reachableHexes,
  type GameState,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { PROJECTION } from './art.ts';
import { characterArts, sceneCells } from './cells.ts';
import type { Flow } from './flow.ts';
import { buildOverlays } from './overlays.ts';
import { toPreact } from './svgToPreact.ts';

const ID = 'you';

function overlays(state: GameState, flow: Flow) {
  return buildOverlays({
    state,
    flow,
    characterId: ID,
    reachable: reachableHexes(state, ID),
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
  const state = createGame(20261119, { characterIds: [ID] });
  const to = reachableHexes(state, ID).find((r) => r.cost === 2)!.hex;
  const plan = planPath(state, ID, to);
  if (!plan.ok) throw new Error('no plan');
  const planned: Flow = { kind: 'planned', to, steps: plan.steps, cost: plan.cost };

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
    const pos = findCharacter(s, ID)!.position;
    expect(sceneCells(s).find((c) => c.q === pos.q && c.r === pos.r)?.state).toBe('lost');
  });
});
