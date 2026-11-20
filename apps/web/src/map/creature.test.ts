import { MORNING, walk, type SvgNode } from '@behemoth-road/art';
import {
  createGame,
  type GameState,
  hexKey,
  predictCreature,
  reachablePlaces,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { PROJECTION } from './art.ts';
import { creatureArt, fireKeys, sceneCells } from './cells.ts';
import { buildOverlays, pawScale, staysPut } from './overlays.ts';

const s = createGame(1, { characterIds: ['you'] });
const c = s.creature.centre;
const near = { q: c.q + 2, r: c.r + 1 };

const withFire = (state: GameState, type = 'fire'): GameState => ({
  ...state,
  stimuli: [{ type, hex: near, litDay: state.day }],
});

const lingering = (state: GameState): GameState => ({
  ...state,
  creature: { ...state.creature, lingering: true },
});

function marks(nodes: readonly SvgNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes)
    walk(n, (x) => void (x.attrs['data-mark'] && out.push(String(x.attrs['data-mark']))));
  return out;
}

function overlays(state: GameState) {
  return buildOverlays({
    state,
    flow: { kind: 'idle' },
    characterId: 'you',
    reachable: reachablePlaces(state, 'you'),
    predicted: predictCreature(state),
    projection: PROJECTION,
    palette: MORNING,
  });
}

describe('fires on the map', () => {
  it('draw on the hexes in the view stimuli tagged fire, and nowhere else', () => {
    const cells = sceneCells(withFire(s));
    expect(cells.filter((x) => x.fire).map((x) => hexKey(x))).toEqual([hexKey(near)]);
    expect(sceneCells(s).some((x) => x.fire)).toBe(false);
  });

  it('leave out stimuli of a type this build does not know', () => {
    expect(fireKeys(withFire(s, 'unknown-thing')).size).toBe(0);
  });
});

describe('the creature as the viewer sees it', () => {
  it('is plain and standing without signs', () => {
    expect(creatureArt(s)).toMatchObject({ pose: 'standing', appetite: null, cues: [] });
  });

  it('carries the appetite sign and the cues from the signs', () => {
    const art = creatureArt(s, {
      appetite: { kind: 'overfed', level: 2, faint: false },
      cues: [{ hex: near, stimulus: 'fire', reaction: 'away' }],
    });
    expect(art.appetite).toEqual({ kind: 'overfed', level: 2, faint: false });
    expect(art.cues).toEqual([{ hex: near, reaction: 'away' }]);
  });

  it('passes a non-keeper faint sign through as faint', () => {
    const art = creatureArt(s, { appetite: { kind: 'underfed', level: 1, faint: true }, cues: [] });
    expect(art.appetite?.faint).toBe(true);
  });

  it('lies down while it lingers', () => {
    expect(creatureArt(lingering(s)).pose).toBe('lying');
  });
});

describe('the step hints', () => {
  it('show paw prints ahead normally, and no stay mark', () => {
    expect(staysPut(predictCreature(s))).toBe(false);
    expect(marks(overlays(s).over)).not.toContain('stay');
  });

  it('show the stay mark instead of paw prints when the core predicts it stays', () => {
    const l = lingering(s);
    expect(staysPut(predictCreature(l))).toBe(true);
    const o = overlays(l);
    expect(marks(o.over).filter((m) => m === 'stay')).toHaveLength(1);
    // The paw prints are the only unmarked paths in `under` on an idle map without grace tiles.
    expect(o.under.length).toBeLessThan(overlays(s).under.length);
  });
});

describe('veering readable', () => {
  it('draws a paw mark per step option, larger for the likelier step', () => {
    const steps = marks(overlays(s).under).filter((m) => m.startsWith('step:'));
    expect(steps).toHaveLength(predictCreature(s).length);
    expect(pawScale(0.5)).toBeGreaterThan(pawScale(0.25));
    expect(pawScale(0)).toBeCloseTo(0.7);
    expect(pawScale(1)).toBeCloseTo(1.5);
  });
});
