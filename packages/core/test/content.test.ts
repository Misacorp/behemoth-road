import { describe, expect, it } from 'vitest';
import { FEATURE_TYPES, MATERIALS, QUIRKS, ROLES, TRAITS, UNLOCKS } from '../src/index.ts';

describe('content', () => {
  it('uses each icon key once across roles, traits, quirks, materials, unlocks and features', () => {
    const icons = [ROLES, TRAITS, QUIRKS, MATERIALS, UNLOCKS, FEATURE_TYPES].flatMap((list) =>
      list.map((x) => x.icon),
    );
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
});
