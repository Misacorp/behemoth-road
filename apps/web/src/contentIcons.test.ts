/** Content names its icons by key; the art kit must draw every one (it falls back to a neutral mark). */
import { hasIcon, ROLE_ICON_KEYS } from '@behemoth-road/art';
import { QUIRKS, ROLES, TRAITS } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';

describe('content icons', () => {
  it('has a drawing for every role, trait and quirk icon key', () => {
    for (const item of [...ROLES, ...TRAITS, ...QUIRKS])
      expect(hasIcon(item.icon), item.id).toBe(true);
  });

  it('draws each role icon key as that role', () => {
    for (const role of ROLES) expect(ROLE_ICON_KEYS[role.icon], role.id).toBe(role.id);
  });
});
