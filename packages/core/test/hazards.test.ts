import { describe, expect, it } from 'vitest';
import {
  createGame,
  entryInto,
  extendHazards,
  generateFeature,
  type GameState,
  type HazardPatch,
  HAZARD_TYPES,
  hazardLookahead,
  hazardRoutePosition,
  hazardTerrainAt,
  hex,
  hexDistance,
  hexKey,
  nextDayWithEvents,
  spawnClusters,
  TERRAIN_TYPES,
  terrainOf,
  THREAT_TYPES,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, QUIET, withTerrain } from './helpers.ts';

/** A creature that walks straight north and a season that does not end, no threats or settlements. */
const STRAIGHT = {
  ...QUIET,
  routeLength: 100_000,
  veerWeights: { left: 0, right: 0 },
  perilMax: 1000,
  perilWoundedAt: 5,
  lureFirstWithin: 100_000,
  lureSpacing: 100_000,
};

/** Walks a game `days` ticks (the creature never stops). */
const walk = (state: GameState, days: number): GameState => {
  let s = state;
  for (let i = 0; i < days; i++) s = nextDayWithEvents(s).state;
  return s;
};

describe('hazard patches along the route', () => {
  it('are laid from the seed alone: the same seed and steps give the same patches', () => {
    const a = walk(createGame(5, { config: STRAIGHT }), 30);
    const b = walk(createGame(5, { config: STRAIGHT }), 30);
    expect(a.hazardPlan).toEqual(b.hazardPlan);
    expect(a.hazardPlan.length).toBeGreaterThan(2);
    expect(walk(createGame(6, { config: STRAIGHT }), 30).hazardPlan).not.toEqual(a.hazardPlan);
  });

  it('come about every hazardSpacing hexes, the first beyond hazardFirst', () => {
    const config = createGame(1).config;
    for (let seed = 1; seed <= 20; seed++) {
      const at = (k: number) => hazardRoutePosition(createGame(seed).seed, config, k);
      expect(at(0)).toBeGreaterThanOrEqual(config.hazardFirst + 3);
      for (let k = 1; k < 6; k++) {
        const gap = at(k) - at(k - 1);
        expect(gap).toBeGreaterThanOrEqual(config.hazardSpacing - 2);
        expect(gap).toBeLessThanOrEqual(config.hazardSpacing + 2);
      }
    }
  });

  it('leave the first hazardFirst hexes bare', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = walk(createGame(seed, { config: STRAIGHT }), 40);
      for (const p of g.hazardPlan) {
        for (const h of [...p.hexes, ...p.threats]) {
          expect(hexDistance(h, hex(0, 0))).toBeGreaterThan(g.config.hazardFirst);
        }
      }
    }
  });

  it('sit across the straight line of the heading, and are only laid beyond the window', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createGame(seed, { config: STRAIGHT });
      for (let day = 0; day < 40; day++) {
        const before = s.hazardPlan.length;
        s = nextDayWithEvents(s).state;
        for (const p of s.hazardPlan.slice(before)) {
          // Dead ahead of the creature, a hex to one side at most.
          const line = {
            q: s.creature.centre.q,
            r: s.creature.centre.r - hazardLookahead(s.config),
          };
          expect(hexDistance(p.centre, line)).toBeLessThanOrEqual(1);
          for (const h of [...p.hexes, ...p.threats]) {
            expect(hexDistance(h, s.creature.centre)).toBeGreaterThan(s.config.windowRadius - 1);
          }
        }
      }
    }
  });

  it('show their terrain as the tiles come into view', () => {
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = walk(createGame(seed, { config: STRAIGHT }), 30);
      for (const p of s.hazardPlan) {
        const terrain = HAZARD_TYPES.find((t) => t.id === p.type)?.terrain;
        if (!terrain) continue;
        for (const h of p.hexes) {
          const tile = s.tiles[hexKey(h)];
          if (!tile) continue;
          seen++;
          expect(tile.terrain).toBe(terrain);
          expect(terrainOf(s, h)?.id).toBe(terrain);
          expect(hazardTerrainAt(s.hazardPlan, h)).toBe(terrain);
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('never lay a scree rockslide on water, a cliff or an island', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = walk(createGame(seed, { config: STRAIGHT }), 40);
      for (const p of s.hazardPlan) {
        for (const h of p.threats) {
          const tags = TERRAIN_TYPES.find((t) => t.id === s.tiles[hexKey(h)]?.terrain)?.tags ?? [];
          checked++;
          for (const bad of ['water', 'steep', 'island']) expect(tags).not.toContain(bad);
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('are not sent to players: only the terrain, the threats and the lures are public', () => {
    const view = toPlayerView(walk(createGame(2, { config: STRAIGHT }), 20));
    expect(Object.keys(view)).not.toContain('hazardPlan');
    expect(Object.keys(view)).not.toContain('lureCount');
    expect(view.lures).toBeDefined();
  });

  it('are not laid again when nothing new is due', () => {
    const s = createGame(3, { config: STRAIGHT });
    const again = extendHazards(s.seed, s.config, s.creature, s.tiles, s.brazierPlan, s.hazardPlan);
    expect(again).toBe(s.hazardPlan);
  });
});

describe('hazardous terrain', () => {
  it('is data: the poisoned lake is water, the glass waste is sharp and dry', () => {
    const lake = TERRAIN_TYPES.find((t) => t.id === 'poisoned-lake');
    const glass = TERRAIN_TYPES.find((t) => t.id === 'glass-waste');
    expect(lake?.tags).toEqual(expect.arrayContaining(['water', 'poisoned']));
    expect(glass?.tags).toEqual(expect.arrayContaining(['sharp', 'dry']));
    expect(lake?.perilOnStep).toBeGreaterThan(0);
    expect(glass?.perilOnStep).toBeGreaterThan(0);
  });

  const stepOnto = (terrain: string, mutate: (s: GameState) => GameState = (s) => s) => {
    let s = fieldGame(['rider'], STRAIGHT);
    s = withTerrain(s, hex(0, -1), terrain);
    s = mutate(s);
    return nextDayWithEvents(s);
  };

  it.each(['poisoned-lake', 'glass-waste'])(
    'adds peril when the creature steps onto %s, with its source named',
    (terrain) => {
      const { state, events } = stepOnto(terrain);
      const amount = TERRAIN_TYPES.find((t) => t.id === terrain)?.perilOnStep as number;
      expect(state.peril).toBe(amount);
      expect(events).toContainEqual({
        kind: 'hazard-step',
        hex: hex(0, -1),
        terrain,
        damage: amount,
      });
      const peril = events.find((e) => e.kind === 'peril');
      expect(peril).toMatchObject({
        from: 0,
        to: amount,
        sources: [{ source: `terrain:${terrain}`, amount }],
      });
    },
  );

  it('is not softened by a defender', () => {
    const { state } = stepOnto('glass-waste', (s) => ({
      ...s,
      creature: { ...s.creature, defenders: ['rider'] },
    }));
    expect(state.peril).toBe(TERRAIN_TYPES.find((t) => t.id === 'glass-waste')?.perilOnStep);
  });

  it('adds nothing to a creature that lingers on it, or steps onto plain ground', () => {
    const plain = stepOnto('plains');
    expect(plain.state.peril).toBe(0);
    const lingering = stepOnto('glass-waste', (s) => ({
      ...s,
      creature: { ...s.creature, lingering: true },
    }));
    expect(lingering.state.peril).toBe(0);
  });

  it('costs a character one more action to walk onto glass waste', () => {
    const s = withTerrain(fieldGame(['rider'], STRAIGHT), hex(3, -1), 'glass-waste');
    expect(entryInto(s, hex(3, -1))?.cost).toBe(s.config.moveCost + 1);
    expect(entryInto(withTerrain(s, hex(3, -1), 'plains'), hex(3, -1))?.cost).toBe(
      s.config.moveCost,
    );
  });

  it('leaves nothing to gather on poisoned ground', () => {
    const seed = createGame(1).seed;
    let found = 0;
    for (let q = 0; q < 200; q++) {
      for (let r = 0; r < 20; r++) {
        if (generateFeature(seed, hex(q, r), 1, () => 'poisoned-lake')) found++;
      }
    }
    expect(found).toBe(0);
  });
});

describe('a scree field', () => {
  const scree = (centre = hex(0, -4)): HazardPatch => ({
    id: 'h1',
    type: 'scree-field',
    centre,
    hexes: [],
    threats: [hex(0, -4), hex(1, -5), hex(-1, -4), hex(0, -5)],
    spawned: false,
  });

  it('is a cluster of three to five rockslides', () => {
    const type = HAZARD_TYPES.find((t) => t.id === 'scree-field');
    expect(type?.cluster?.threat).toBe('rockslide');
    expect(type?.cluster?.count).toEqual([3, 5]);
    expect(THREAT_TYPES.find((t) => t.id === 'rockslide')?.tags).toContain('falls');
  });

  it('lays its rockslides once it is within reach of the creature, as public threats of its patch', () => {
    const s = { ...fieldGame(['rider'], STRAIGHT), hazardPlan: [scree()] };
    const laid = spawnClusters(s);
    expect(laid.state.threats).toHaveLength(4);
    for (const t of laid.state.threats) {
      expect(t).toMatchObject({ type: 'rockslide', patch: 'h1' });
    }
    expect(laid.events.filter((e) => e.kind === 'threat-appears')).toHaveLength(4);
    expect(laid.state.hazardPlan[0]?.spawned).toBe(true);
    // Once only.
    expect(spawnClusters(laid.state).state.threats).toHaveLength(4);
    expect(toPlayerView(laid.state).threats).toHaveLength(4);
  });

  it('stays out of the game while it is far ahead', () => {
    const far = scree(hex(0, -12));
    const s = { ...fieldGame(['rider'], STRAIGHT), hazardPlan: [far] };
    const laid = spawnClusters(s);
    expect(laid.state.threats).toEqual([]);
    expect(laid.state.hazardPlan[0]?.spawned).toBe(false);
  });

  it('does not count against the cap on rolled threats', () => {
    const s = fieldGame(['rider'], {
      ...STRAIGHT,
      threatsFromDay: 1,
      threatChanceBase: 1,
      threatChanceMax: 1,
      threatsMax: 1,
    });
    const laid = spawnClusters({ ...s, hazardPlan: [scree()] }).state;
    const next = nextDayWithEvents(laid).state;
    expect(next.threats.filter((t) => t.patch === undefined).length).toBe(1);
  });
});
