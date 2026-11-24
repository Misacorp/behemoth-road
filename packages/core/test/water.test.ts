import { describe, expect, it } from 'vitest';
import {
  act,
  creatureHexes,
  DIRECTIONS,
  entryInto,
  FEATURE_TYPES,
  generateFeature,
  type GameState,
  hex,
  hexDistance,
  hexesInRange,
  hexKey,
  isPassable,
  move,
  neighbour,
  neighbours,
  nextDay,
  ON_CREATURE,
  onHex,
  planPath,
  reachablePlaces,
  TERRAIN_GENERATION,
  terrainAt,
  terrainById,
  terrainOf,
  toSeed,
  UNLOCKS,
} from '../src/index.ts';
import { canAppearOn } from '../src/threats.ts';
import { waterIdAt } from '../src/waters.ts';
import { fieldGame, placeCharacter, QUIET, withCharacter, withTerrain } from './helpers.ts';

const P = hex(3, -1);
const lake = hex(4, -1);
const far = hex(5, -1);

/** The field game with a two-hex lake east of P: a character on P meets deep water. */
const lakeside = (unlocks: string[] = []): GameState => ({
  ...withTerrain(withTerrain(fieldGame(['engineer'], QUIET), lake, 'lake'), hex(4, -2), 'sea'),
  unlocks,
});

const isDeep = (id: string): boolean => terrainById(id).tags.includes('deep');
const AREA = hexesInRange(hex(0, 0), 30);
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('deep water and the raft', () => {
  it('tags lakes and seas deep and water, the sea salt, and walks no one into them', () => {
    for (const id of ['lake', 'sea']) {
      const t = terrainById(id);
      expect(t.tags).toEqual(expect.arrayContaining(['water', 'deep']));
      expect(t.passable).toBe(false);
    }
    expect(terrainById('sea').tags).toContain('salt');
    expect(terrainById('shallows')).toMatchObject({ passable: true });
    expect(terrainById('shallows').tags).not.toContain('deep');
  });

  it('refuses deep water on foot, and lets the raft in at one action more than walking', () => {
    expect(entryInto(lakeside(), lake)).toBeNull();
    expect(entryInto(lakeside(), hex(4, -2))).toBeNull();
    expect(entryInto(lakeside(['raft']), lake)).toEqual({ cost: 2, via: 'raft' });
    expect(entryInto(lakeside(['raft']), hex(4, -2))).toEqual({ cost: 2, via: 'raft' });
    // Dry ground is untouched by it.
    expect(entryInto(lakeside(['raft']), P)).toEqual({ cost: 1 });
  });

  it('builds the raft from timber and work, by tag, and names no terrain id', () => {
    const raft = UNLOCKS.find((u) => u.id === 'raft')!;
    expect(raft.cost).toEqual([{ material: 'timber', amount: 3 }]);
    expect(raft.work).toBe(4);
    expect(raft.movement?.terrainTags).toEqual(['deep']);
    // One action more than a plain step (`moveCost` 1).
    expect(raft.movement?.cost).toBe(2);
  });

  it('makes the step refused without the raft and taken with it', () => {
    const from = placeCharacter(lakeside(), 'engineer', P);
    expect(move(from, 'engineer', lake)).toEqual({ ok: false, reason: 'impassable' });
    const rafted = placeCharacter(lakeside(['raft']), 'engineer', P);
    const result = move(rafted, 'engineer', lake);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.state.characters[0]).toMatchObject({ at: onHex(lake), actionsLeft: 1 });
  });

  it('plans no path over deep water without the raft, and one with it', () => {
    // A lone hex of land ringed by deep water, two steps from where the character stands.
    let state = placeCharacter(lakeside(), 'engineer', P);
    for (const n of neighbours(far)) state = withTerrain(state, n, 'lake');
    expect(planPath(state, 'engineer', lake)).toEqual({ ok: false, reason: 'impassable' });
    const islet = withTerrain(state, far, 'islet');
    expect(planPath(islet, 'engineer', far)).toEqual({ ok: false, reason: 'no-path' });
    const rafted = { ...islet, unlocks: ['raft'] };
    const plan = planPath(rafted, 'engineer', far);
    expect(plan).toMatchObject({ ok: true });
    if (plan.ok) expect(plan.steps.some((s) => s.via === 'raft')).toBe(true);
    const reach = reachablePlaces(islet, 'engineer').map((r) =>
      r.place.kind === 'hex' ? hexKey(r.place.hex) : '',
    );
    expect(reach).not.toContain(hexKey(far));
  });

  it('lets the creature swim: it steps into deep water and carries its riders', () => {
    let state = fieldGame(['engineer'], { ...QUIET, veerWeights: { left: 0, right: 0 } });
    state = withCharacter(state, { ...state.characters[0]!, at: ON_CREATURE });
    // The creature walks straight north from (0, 0): flood the hexes ahead with deep water.
    for (const h of hexesInRange(hex(0, -3), 4)) state = withTerrain(state, h, 'sea');
    const before = state.creature.centre;
    for (let i = 0; i < 3; i++) state = nextDay(state);
    expect(state.creature.centre).not.toEqual(before);
    // Its centre is over deep water now, and nobody was refused or lost for it.
    expect(isDeep(terrainOf(state, state.creature.centre)!.id)).toBe(true);
    expect(creatureHexes(state).length).toBe(7);
    expect(state.characters[0]!.at).toEqual(ON_CREATURE);
    expect(state.characters[0]!.status).toBe('active');
  });

  it('lets a rider survey a hex of water beside the creature', () => {
    let state = fieldGame(['scout'], QUIET);
    state = withCharacter(state, { ...state.characters[0]!, at: ON_CREATURE });
    const next = hex(0, -2);
    state = withTerrain(state, next, 'sea');
    const result = act(state, 'scout', { kind: 'survey', hex: next });
    expect(result.ok).toBe(true);
  });
});

describe('where water is generated', { timeout: 60_000 }, () => {
  it('is deterministic per hex, whatever the order of asking', () => {
    const hexes = hexesInRange(hex(15, 20), 8);
    const first = hexes.map((h) => terrainAt(7, h).id);
    const again = hexes
      .slice()
      .reverse()
      .map((h) => terrainAt(7, h).id)
      .reverse();
    expect(again).toEqual(first);
  });

  it('keeps the start dry', () => {
    const waters = TERRAIN_GENERATION.waters!;
    for (const seed of SEEDS) {
      for (const h of hexesInRange(hex(0, 0), waters.startClear)) {
        expect(['lake', 'sea', 'shallows', 'islet']).not.toContain(terrainAt(seed, h).id);
      }
    }
  });

  it('bounds a crossing: no line of deep hexes is longer than the content allows, in any seed', () => {
    const max = TERRAIN_GENERATION.waters!.maxCrossing;
    let longest = 0;
    let deepHexes = 0;
    for (const seed of SEEDS) {
      const ids = new Map(AREA.map((h) => [hexKey(h), terrainAt(seed, h).id]));
      const deep = (h: { q: number; r: number }) => isDeep(ids.get(hexKey(h)) ?? 'plains');
      for (const h of AREA) {
        if (!deep(h)) continue;
        deepHexes++;
        for (const d of DIRECTIONS) {
          let n = 1;
          for (let c = neighbour(h, d); deep(c); c = neighbour(c, d)) n++;
          longest = Math.max(longest, n);
        }
      }
    }
    expect(deepHexes).toBeGreaterThan(500);
    // Counted from every hex of the line, so a line is seen from each end: the longest is the bound.
    expect(longest).toBeLessThanOrEqual(max);
    expect(longest).toBeGreaterThanOrEqual(3);
  });

  it('makes ponds of one to three hexes, lakes of a few to about twelve, and has seas', () => {
    const sizes = new Map<string, number[]>();
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 20)) {
      for (const h of AREA) {
        const id = terrainAt(seed, h).id;
        if (!isDeep(id) || seen.has(`${seed}:${hexKey(h)}`)) continue;
        // Flood the body of deep water (islets and shallows do not join bodies).
        const body: string[] = [];
        const todo = [h];
        seen.add(`${seed}:${hexKey(h)}`);
        let salt = false;
        while (todo.length) {
          const c = todo.pop()!;
          body.push(hexKey(c));
          if (terrainAt(seed, c).tags.includes('salt')) salt = true;
          for (const n of neighbours(c)) {
            const key = `${seed}:${hexKey(n)}`;
            if (seen.has(key) || !isDeep(terrainAt(seed, n).id)) continue;
            seen.add(key);
            todo.push(n);
          }
        }
        const kind = salt ? 'sea' : body.length <= 3 ? 'pond' : 'lake';
        sizes.set(kind, [...(sizes.get(kind) ?? []), body.length]);
      }
    }
    expect(sizes.get('pond')!.length).toBeGreaterThan(5);
    expect(Math.max(...sizes.get('pond')!)).toBeLessThanOrEqual(3);
    expect(sizes.get('lake')!.length).toBeGreaterThan(5);
    expect(Math.max(...sizes.get('lake')!)).toBeLessThanOrEqual(14);
    expect(sizes.get('sea')!.length).toBeGreaterThan(0);
  });

  it('puts islands only inside deep water, with deep water all round them', () => {
    let islets = 0;
    for (const seed of SEEDS) {
      for (const h of AREA) {
        if (terrainAt(seed, h).id !== 'islet') continue;
        islets++;
        for (const n of neighbours(h)) expect(isDeep(terrainAt(seed, n).id)).toBe(true);
      }
    }
    expect(islets).toBeGreaterThan(40);
  });

  it('places the water temple only on islands, and features never on deep water', () => {
    const temple = FEATURE_TYPES.find((t) => t.id === 'water-temple')!;
    expect(temple).toMatchObject({ kind: 'site', tier: 1 });
    expect(temple.tags).toEqual(expect.arrayContaining(['shrine', 'ancient']));
    let temples = 0;
    let onIslet = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      const key = toSeed(seed);
      for (const h of AREA) {
        const terrain = terrainAt(seed, h);
        const feature = generateFeature(key, h, 0.08);
        if (terrain.tags.includes('deep')) expect(feature).toBeNull();
        if (terrain.id === 'islet') onIslet++;
        if (feature?.id === 'water-temple') {
          temples++;
          expect(terrain.tags).toContain('island');
        }
      }
    }
    expect(temples).toBeGreaterThan(0);
    expect(temples).toBeLessThan(onIslet);
  });

  it('lets the sunken shrine and river stones stand in the shallows', () => {
    const shrine = FEATURE_TYPES.find((t) => t.id === 'sunken-shrine')!;
    const shallows = terrainById('shallows');
    expect(shrine.placement.on.some((tag) => shallows.tags.includes(tag))).toBe(true);
    let shrines = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      for (const h of AREA) {
        if (terrainAt(seed, h).id !== 'shallows') continue;
        if (generateFeature(toSeed(seed), h, 0.08)?.id === 'sunken-shrine') shrines++;
      }
    }
    expect(shrines).toBeGreaterThan(0);
  });

  it('keeps threats and settlements off islands and water', () => {
    const state = withTerrain(fieldGame(['engineer'], QUIET), hex(3, 0), 'islet');
    expect(canAppearOn(state, hex(3, 0))).toBe(false);
    expect(canAppearOn(withTerrain(state, hex(3, 0), 'shallows'), hex(3, 0))).toBe(false);
    expect(canAppearOn(state, hex(3, 1))).toBe(true);
  });

  it('has no passable hex a character could stand on that the map calls impassable', () => {
    const state = lakeside();
    expect(isPassable(state, lake)).toBe(false);
    expect(hexDistance(P, lake)).toBe(1);
  });
});

describe('the water cache', () => {
  it('is keyed by the water config as well as the seed', () => {
    const waters = TERRAIN_GENERATION.waters!;
    const dry = { ...waters, kinds: waters.kinds.map((k) => ({ ...k, chance: 0 })) };
    const seed = toSeed(4242);
    const wet = (w: typeof waters) =>
      hexesInRange(hex(0, 0), 70).filter((h) => waterIdAt(seed, h, w) !== null).length;
    // The dry config first: it must not leave its answers for the real one.
    expect(wet(dry)).toBe(0);
    expect(wet(waters)).toBeGreaterThan(0);
    expect(wet(dry)).toBe(0);
  });
});
