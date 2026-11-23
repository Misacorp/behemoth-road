import { ACTION_MOTIFS, MOMENT_KINDS } from '@behemoth-road/art';
import {
  BOONS,
  FEATURE_TYPES,
  MATERIALS,
  PEOPLE_TYPES,
  QUIRKS,
  ROLES,
  SKILL_NODES,
  TERRAIN_TYPES,
  THREAT_TYPES,
  TRAITS,
  UNLOCKS,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { toPreact } from '../map/svgToPreact.ts';
import { TIP_TABLE } from '../text/tips.ts';
import { buildGlossary, drawEntry, GROUPS } from './glossary.ts';

const entries = buildGlossary();
const keys = new Set(entries.map((e) => e.key));

/**
 * Roles whose planned tiers 2 and 3 are being merged into a new role (Warden); their old nodes get no
 * hint tips. Delete this once the merge lands: then every planned node must have its tip.
 */
const MERGING = new Set(['guardian', 'envoy']);

describe('the icon glossary', () => {
  it('has an entry for every icon the game draws, from the same registries', () => {
    const expected = [
      ...ROLES.map((x) => `roles:${x.id}`),
      ...TRAITS.map((x) => `traits:${x.id}`),
      ...QUIRKS.map((x) => `traits:${x.id}`),
      ...MATERIALS.map((x) => `materials:${x.id}`),
      ...UNLOCKS.map((x) => `materials:${x.id}`),
      ...FEATURE_TYPES.map((x) => `features:${x.id}`),
      ...TERRAIN_TYPES.map((x) => `terrain:${x.id}`),
      ...THREAT_TYPES.map((x) => `threats:${x.id}`),
      ...PEOPLE_TYPES.map((x) => `settlements:${x.id}`),
      ...BOONS.map((x) => `settlements:${x}`),
      ...['wary', 'friendly', 'angry'].map((x) => `settlements:${x}`),
      ...SKILL_NODES.map((x) => `skills:${x.id}`),
      ...[...MOMENT_KINDS].map((x) => `marks:${x}`),
      ...Object.keys(ACTION_MOTIFS)
        .filter((k) => !(BOONS as readonly string[]).includes(k))
        .map((x) => `actions:${x}`),
    ];
    expect(expected.filter((k) => !keys.has(k))).toEqual([]);
  });

  it('has an entry for every tip about a drawn thing, and the text for every entry that has one', () => {
    const grouped: Record<string, string> = {
      role: 'roles',
      trait: 'traits',
      quirk: 'traits',
      material: 'materials',
      unlock: 'materials',
      action: 'actions',
      boon: 'settlements',
      people: 'settlements',
      settlement: 'settlements',
      feature: 'features',
      terrain: 'terrain',
      threat: 'threats',
      skill: 'skills',
    };
    const missing = Object.keys(TIP_TABLE).filter((id) => {
      const [kind = '', key = ''] = id.split(':');
      const group = grouped[kind];
      return group !== undefined && key !== 'veiled' && !keys.has(`${group}:${key}`);
    });
    expect(missing).toEqual([]);
  });

  it('gives every entry but the marks a tip text, so no icon is unexplained', () => {
    const bare = entries.filter((e) => e.group !== 'marks' && e.text === null);
    // Planned nodes of the roles being merged have no hint yet (see MERGING).
    const unexpected = bare.filter((e) => {
      const node = SKILL_NODES.find((n) => `skills:${n.id}` === e.key);
      return !(node && !node.active && MERGING.has(node.role));
    });
    expect(unexpected.map((e) => e.key)).toEqual([]);
  });

  it('names every entry and has unique keys', () => {
    expect(keys.size).toBe(entries.length);
    for (const e of entries) expect(e.name.trim(), e.key).not.toBe('');
  });

  it('draws every entry through the allowlisted mapper (the screen icons are components)', () => {
    for (const e of entries) {
      const node = drawEntry(e.draw, 48);
      if (node) expect(() => toPreact(node), e.key).not.toThrow();
      else expect(e.draw.kind, e.key).toBe('hud');
    }
  });

  it('lists only known groups, each with entries', () => {
    const ids = GROUPS.map((g) => g.id);
    for (const e of entries) expect(ids, e.key).toContain(e.group);
    for (const g of GROUPS)
      expect(
        entries.some((e) => e.group === g.id),
        g.id,
      ).toBe(true);
  });
});
