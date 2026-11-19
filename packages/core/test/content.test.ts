import { describe, expect, it } from 'vitest';
import { FEATURE_TYPES, ITEMS, MATERIALS, QUIRKS, RECIPES, ROLES, TRAITS } from '../src/index.ts';

describe('content icons', () => {
  it('uses each icon key once across roles, traits, quirks, materials, items and features', () => {
    const icons = [ROLES, TRAITS, QUIRKS, MATERIALS, ITEMS, FEATURE_TYPES].flatMap((list) =>
      list.map((x) => x.icon),
    );
    const repeated = icons.filter((icon, i) => icons.indexOf(icon) !== i);
    expect(repeated).toEqual([]);
  });

  it("draws a recipe with its item's icon", () => {
    for (const r of RECIPES) expect(r.icon).toBe(ITEMS.find((i) => i.id === r.makes)?.icon);
  });
});
