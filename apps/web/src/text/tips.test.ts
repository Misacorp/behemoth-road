/**
 * Every icon in the game has its tip text: each content role, trait, quirk, material, unlock, threat, people
 * and boon, every action, the settlement attitudes, and every tip id written in the code.
 */
import {
  type Action,
  MATERIALS,
  PEOPLE_TYPES,
  QUIRKS,
  ROLES,
  THREAT_TYPES,
  TRAITS,
  UNLOCKS,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { delays, holdMs, tips } from './tips.ts';

const has = (id: string): boolean => Object.hasOwn(tips, id);

/** Every action kind (the record makes a new kind in the core a type error here until it is listed). */
const ACTION_KINDS: Readonly<Record<Action['kind'], true>> = {
  survey: true,
  gather: true,
  'work-site': true,
  build: true,
  'light-fire': true,
  feed: true,
  linger: true,
  strike: true,
  defend: true,
  parley: true,
  offer: true,
  'ask-boon': true,
};

describe('tip texts', () => {
  it('cover every content role, trait, quirk, material, unlock, threat and people', () => {
    const missing = [
      ...ROLES.map((x) => `role:${x.id}`),
      ...TRAITS.map((x) => `trait:${x.id}`),
      ...QUIRKS.map((x) => `quirk:${x.id}`),
      ...MATERIALS.map((x) => `material:${x.id}`),
      ...UNLOCKS.map((x) => `unlock:${x.id}`),
      ...THREAT_TYPES.map((x) => `threat:${x.id}`),
      ...PEOPLE_TYPES.map((x) => `people:${x.id}`),
      ...PEOPLE_TYPES.flatMap((x) => x.boons.map((b) => `boon:${b}`)),
      ...Object.keys(ACTION_KINDS).map((k) => `action:${k}`),
      ...['wary', 'friendly', 'angry'].map((a) => `settlement:${a}`),
    ].filter((id) => !has(id));
    expect(missing).toEqual([]);
  });

  it('cover every tip id written in the code', () => {
    const sources = import.meta.glob<string>('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const used = new Set<string>();
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.test.ts') || file.endsWith('/tips.ts')) continue;
      for (const m of text.matchAll(
        /tipProps\('([a-z-]+:[a-z-]+)'\)|'([a-z]+:[a-z-]+)' as TipId/g,
      )) {
        used.add(m[1] ?? m[2]!);
      }
      for (const m of text.matchAll(/return '((?:hud|map|action):[a-z-]+)'/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((id) => !has(id))).toEqual([]);
  });

  it('are short: a title of a few words and one or two lines', () => {
    for (const [id, tip] of Object.entries(tips)) {
      expect(tip.text.length, id).toBeLessThanOrEqual(120);
      expect(tip.text, id).not.toMatch(/\s{2}|^\s|\s$/);
    }
  });

  it('have a delay for every group and a hold time', () => {
    expect(Object.values(delays).every((ms) => ms >= 0)).toBe(true);
    expect(holdMs).toBeGreaterThan(200);
  });
});
