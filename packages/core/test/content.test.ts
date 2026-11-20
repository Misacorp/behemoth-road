import { describe, expect, it } from 'vitest';
import {
  BOONS,
  CREATURE_TYPES,
  FEATURE_TYPES,
  MATERIALS,
  PEOPLE_TYPES,
  QUIRKS,
  THREAT_TYPES,
  REACTIONS,
  ROLES,
  STIMULUS_TYPES,
  TRAITS,
  UNLOCKS,
} from '../src/index.ts';

describe('content', () => {
  it('uses each icon key once across roles, traits, quirks, materials, unlocks and features', () => {
    const icons = [
      ROLES,
      TRAITS,
      QUIRKS,
      MATERIALS,
      UNLOCKS,
      FEATURE_TYPES,
      CREATURE_TYPES,
      STIMULUS_TYPES,
      THREAT_TYPES,
      PEOPLE_TYPES,
    ].flatMap((list) => list.map((x) => x.icon));
    const repeated = icons.filter((icon, i) => icons.indexOf(icon) !== i);
    expect(repeated).toEqual([]);
  });

  it('builds unlocks from known materials, with work to do', () => {
    const materials = new Set(MATERIALS.map((m) => m.id));
    for (const u of UNLOCKS) {
      expect(u.work).toBeGreaterThan(0);
      for (const c of u.cost) expect(materials.has(c.material)).toBe(true);
    }
    for (const t of FEATURE_TYPES) {
      if (t.kind === 'node') expect(materials.has(t.yields.material)).toBe(true);
      if (t.kind === 'site') expect(materials.has(t.finds.material)).toBe(true);
    }
  });

  it('keeps later upgrades as inactive perks', () => {
    const perks = ROLES.flatMap((r) => r.perks.map((p) => `${r.id}:${p.id}`));
    expect(perks).toEqual(['scout:trap-sense', 'scout:glints', 'engineer:double-yield']);
    for (const r of ROLES) for (const p of r.perks) expect(p.requiresUpgrade).toBe(true);
  });

  it('gives creatures a sound hunger and reactions to known stimulus tags', () => {
    const stimulusTags = new Set(STIMULUS_TYPES.flatMap((t) => t.tags));
    for (const type of CREATURE_TYPES) {
      const { start, drainPerDay, comfortable, max } = type.hunger;
      expect(0 <= comfortable.min && comfortable.min <= comfortable.max).toBe(true);
      expect(comfortable.max < max && start >= comfortable.min && start <= comfortable.max).toBe(
        true,
      );
      expect(drainPerDay).toBeGreaterThan(0);
      expect(Number.isInteger(type.hunger.drainEveryDays)).toBe(true);
      expect(type.hunger.drainEveryDays).toBeGreaterThan(0);
      for (const [tag, options] of Object.entries(type.reactions)) {
        expect(stimulusTags.has(tag)).toBe(true);
        expect(options.length).toBeGreaterThan(0);
        for (const r of options) expect(REACTIONS).toContain(r);
      }
    }
  });

  it('fuels stimuli with a material that exists and feeds the creature from a node', () => {
    for (const s of STIMULUS_TYPES) {
      expect(MATERIALS.some((m) => m.tags.includes(s.fuel.tag))).toBe(true);
      expect(s.lastsTicks).toBeGreaterThan(0);
    }
    const foods = MATERIALS.filter((m) => m.tags.includes('food'));
    expect(foods.length).toBeGreaterThan(0);
    for (const food of foods) {
      expect(food.nourishes).toBeGreaterThan(0);
      expect(FEATURE_TYPES.some((f) => f.kind === 'node' && f.yields.material === food.id)).toBe(
        true,
      );
    }
  });

  it('gives threats sound numbers, and at least one that the daily roll can pick', () => {
    const ids = THREAT_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THREAT_TYPES) {
      expect(Number.isInteger(t.strength) && t.strength > 0).toBe(true);
      expect(Number.isInteger(t.speed) && t.speed >= 0).toBe(true);
      expect(t.weight).toBeGreaterThanOrEqual(0);
      expect(['behind', 'flank', 'path', 'sent']).toContain(t.approach);
      // A sent threat is never rolled; a rolled one has a place to appear.
      expect(t.approach === 'sent').toBe(t.weight === 0);
    }
    expect(THREAT_TYPES.some((t) => t.weight > 0)).toBe(true);
  });

  it('gives peoples known boons, a gift of known materials and a known threat', () => {
    const materials = new Set(MATERIALS.map((m) => m.id));
    for (const p of PEOPLE_TYPES) {
      expect(p.favourNeeded).toBeGreaterThan(0);
      expect(p.boons.length).toBeGreaterThan(0);
      for (const b of p.boons) expect(BOONS).toContain(b);
      for (const g of p.gift) expect(materials.has(g.material) && g.amount > 0).toBe(true);
      expect(THREAT_TYPES.some((t) => t.id === p.angryThreat)).toBe(true);
    }
    // The envoy's lever: something to offer exists, from a site.
    const trade = MATERIALS.filter((m) => m.tags.includes('trade')).map((m) => m.id);
    expect(FEATURE_TYPES.some((f) => f.kind === 'site' && trade.includes(f.finds.material))).toBe(
      true,
    );
  });
});
