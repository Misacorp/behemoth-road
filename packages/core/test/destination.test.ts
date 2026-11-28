import { describe, expect, it } from 'vitest';
import {
  blockedFor,
  createGame,
  type Destination,
  destinationFor,
  destinationHexesNear,
  destinationProgress,
  DIRECTIONS,
  directionOffset,
  hex,
  hexKey,
  inDestination,
  isSanctuary,
  nextDay,
  regionTagsAt,
  rotate,
  rowsAlong,
  rowsToDestination,
  SANCTUARY_TAG,
  threatPath,
  threatType,
  toPlayerView,
} from '../src/index.ts';
import { canAppearOn } from '../src/threats.ts';
import { fieldGame, QUIET } from './helpers.ts';

const straight = { veerWeights: { left: 0, right: 0 } } as const;

describe('rows along the heading', () => {
  it('count a straight step as 1, a step a sixth of a turn aside as half, and a sideways one as 0', () => {
    for (const heading of DIRECTIONS) {
      const d = { origin: hex(2, -3), heading };
      const at = (dir: (typeof DIRECTIONS)[number]) => {
        const o = directionOffset(dir);
        return rowsAlong(d, hex(2 + o.q, -3 + o.r));
      };
      expect(at(heading)).toBe(1);
      expect(at(rotate(heading, 1))).toBe(0.5);
      expect(at(rotate(heading, -1))).toBe(0.5);
      expect(at(rotate(heading, 2))).toBe(-0.5);
      expect(at(rotate(heading, 3))).toBe(-1);
    }
  });
});

describe('the destination band', () => {
  const north: Destination = { origin: hex(0, 0), heading: 'n', from: 3, depth: 3 };

  it('is a line of hexes across the whole map, perpendicular to the heading', () => {
    // Every hex at rows 3 to 5, however far to the side.
    for (const q of [-40, -7, 0, 7, 40]) {
      // On column q, rows = -r - q/2.
      for (let r = -60; r <= 20; r++) {
        const rows = -r - q / 2;
        expect(inDestination(north, hex(q, r))).toBe(rows >= 3 && rows < 6);
      }
    }
  });

  it('is set routeLength steps out, at destinationRowsPerStep rows a step', () => {
    const base = { routeLength: 40, destinationRowsPerStep: 0.6, destinationDepth: 3 };
    expect(destinationFor(base, hex(0, 0), 'n')).toEqual({
      origin: hex(0, 0),
      heading: 'n',
      from: 24,
      depth: 3,
    });
    expect(destinationFor({ ...base, routeLength: 12 }, hex(2, 1), 's').from).toBe(7);
    expect(destinationFor({ ...base, destinationRowsPerStep: 1 }, hex(0, 0), 'n').from).toBe(40);
  });

  it('is public from the first day and a sanctuary by region tag', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(toPlayerView(state).destination).toEqual({
      origin: hex(0, 0),
      heading: 'n',
      from: 24,
      depth: 3,
    });
    expect(regionTagsAt(state, hex(0, -25))).toEqual([SANCTUARY_TAG]);
    expect(regionTagsAt(state, hex(0, -5))).toEqual([]);
    expect(isSanctuary(state, hex(0, -24))).toBe(true);
    expect(isSanctuary(state, hex(0, -23))).toBe(false);
    expect(destinationHexesNear(state.destination, hex(0, -24), 2).length).toBeGreaterThan(5);
    expect(rowsToDestination(state)).toBe(24);
    expect(destinationProgress(state)).toBe(0);
  });

  it('ends the season when the creature centre steps onto it, never one step early', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let state = fieldGame(['a'], { ...QUIET, routeLength: 12 }, seed);
      let before = state.creature.centre;
      for (let i = 0; i < 60 && state.season.status === 'on'; i++) {
        expect(inDestination(state.destination, state.creature.centre)).toBe(false);
        // The strip is full exactly when the season ends: below 1 all the way there.
        expect(destinationProgress(state)).toBeLessThan(1);
        before = state.creature.centre;
        state = nextDay(state);
      }
      expect(state.season.status).toBe('over');
      expect(inDestination(state.destination, state.creature.centre)).toBe(true);
      expect(inDestination(state.destination, before)).toBe(false);
      expect(destinationProgress(state)).toBe(1);
      // 7 rows out: all straight 7 steps, all veering 14.
      expect(state.creature.steps).toBeGreaterThanOrEqual(7);
      expect(state.creature.steps).toBeLessThanOrEqual(14);
    }
  });

  it('ends a straight walk after routeLength steps at one row a step', () => {
    let state = fieldGame(['a'], {
      ...QUIET,
      ...straight,
      routeLength: 4,
      destinationRowsPerStep: 1,
    });
    for (let i = 0; i < 4; i++) state = nextDay(state);
    expect(state.season.status).toBe('over');
    expect(state.creature.steps).toBe(4);
  });
});

describe('a sanctuary', () => {
  const state = fieldGame(['a'], {
    ...QUIET,
    routeLength: 4,
    destinationRowsPerStep: 0.75,
    windowRadius: 7,
  });
  // routeLength 4 puts the band at rows 3 to 5: with the creature at the origin, (0, -3) to (0, -5).

  it('is a hex no threat appears on', () => {
    for (const type of ['captors', 'swarm', 'rockslide', 'ambush', 'stampede', 'raiders']) {
      expect(canAppearOn(state, hex(0, -4), threatType(type))).toBe(false);
    }
    expect(canAppearOn(state, hex(0, -6), threatType('captors'))).toBe(true);
  });

  it('is a hex no threat walks into: it holds at the edge', () => {
    const at = (h: ReturnType<typeof hex>) => ({
      id: 't',
      type: 'captors',
      hex: h,
      strength: 3,
      appearedDay: 1,
    });
    // Two steps a tick: from row 7 it reaches row 6, then the next step would be row 5 (the band).
    expect(threatPath(state, at(hex(0, -7)), hex(0, 0))).toEqual([hex(0, -6)]);
    expect(threatPath(state, at(hex(0, -6)), hex(0, 0))).toEqual([]);
  });

  it('shows in the blocked overlay, with reason sanctuary, for every known hex of the band', () => {
    const blocked = blockedFor(toPlayerView(state), threatType('swarm')).filter(
      (b) => b.reason === 'sanctuary',
    );
    expect(blocked.length).toBeGreaterThan(10);
    for (const b of blocked) {
      expect(inDestination(state.destination, b.hex)).toBe(true);
      expect(state.tiles[hexKey(b.hex)]).toBeDefined();
    }
    expect(blocked.some((b) => hexKey(b.hex) === hexKey(hex(0, -4)))).toBe(true);
  });

  it('keeps hazards, lures and threats out of the band over whole seasons', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let s = createGame(seed, { characterIds: ['a'], config: { routeLength: 24 } });
      const check = (): void => {
        for (const p of s.hazardPlan) {
          for (const h of [...p.hexes, ...p.threats]) {
            expect(inDestination(s.destination, h)).toBe(false);
          }
        }
        for (const l of s.lures) expect(inDestination(s.destination, l.hex)).toBe(false);
        for (const t of s.threats) expect(inDestination(s.destination, t.hex)).toBe(false);
      };
      check();
      for (let i = 0; i < 80 && s.season.status === 'on'; i++) {
        s = nextDay(s);
        check();
      }
      expect(s.season.status).toBe('over');
    }
  });
});
