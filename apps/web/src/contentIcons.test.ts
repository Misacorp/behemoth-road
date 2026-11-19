/** Content names its icons by key; the art kit must draw every one (it falls back to a neutral mark). */
import {
  FEATURE_DRAWERS,
  hasIcon,
  ITEM_MOTIFS,
  MATERIAL_MOTIFS,
  ROLE_ICON_KEYS,
  VIA_MARKS,
} from '@behemoth-road/art';
import { FEATURE_TYPES, MATERIALS, QUIRKS, ROLES, TRAITS, UNLOCKS } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';

describe('content icons', () => {
  it('has a drawing for every role, trait and quirk icon key', () => {
    for (const item of [...ROLES, ...TRAITS, ...QUIRKS])
      expect(hasIcon(item.icon), item.id).toBe(true);
  });

  it('draws each role icon key as that role', () => {
    for (const role of ROLES) expect(ROLE_ICON_KEYS[role.icon], role.id).toBe(role.id);
  });

  it('has a drawing for every feature, material and unlock', () => {
    for (const f of FEATURE_TYPES) expect(Object.hasOwn(FEATURE_DRAWERS, f.icon), f.id).toBe(true);
    for (const m of MATERIALS) expect(Object.hasOwn(MATERIAL_MOTIFS, m.icon), m.id).toBe(true);
    for (const u of UNLOCKS) expect(Object.hasOwn(ITEM_MOTIFS, u.icon), u.id).toBe(true);
  });

  it('marks every unlock a path step can rely on', () => {
    for (const u of UNLOCKS.filter((x) => x.movement))
      expect(Object.hasOwn(VIA_MARKS, u.id), u.id).toBe(true);
  });
});
