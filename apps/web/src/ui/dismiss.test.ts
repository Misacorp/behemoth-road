import { describe, expect, it } from 'vitest';
import { closesDrawer, closesOnRightClick } from './dismiss.ts';

describe('closesDrawer', () => {
  it('closes on a primary press on the map', () => {
    expect(closesDrawer({ button: 0, insideDrawer: false, onKept: false })).toBe(true);
  });
  it('stays open for a press inside the drawer', () => {
    expect(closesDrawer({ button: 0, insideDrawer: true, onKept: false })).toBe(false);
  });
  it('stays open for a HUD button, a popover or a tip', () => {
    expect(closesDrawer({ button: 0, insideDrawer: false, onKept: true })).toBe(false);
  });
  it('leaves a right or middle press to the right-click rule', () => {
    expect(closesDrawer({ button: 2, insideDrawer: false, onKept: false })).toBe(false);
    expect(closesDrawer({ button: 1, insideDrawer: false, onKept: false })).toBe(false);
  });
});

describe('closesOnRightClick', () => {
  const on = { closeOnRightClick: true };
  it('closes on the map when the setting allows', () => {
    expect(closesOnRightClick({ insideDrawer: false, onKept: false }, on)).toBe(true);
  });
  it('does nothing when the setting is off, inside the drawer or on a popover', () => {
    expect(
      closesOnRightClick({ insideDrawer: false, onKept: false }, { closeOnRightClick: false }),
    ).toBe(false);
    expect(closesOnRightClick({ insideDrawer: true, onKept: false }, on)).toBe(false);
    expect(closesOnRightClick({ insideDrawer: false, onKept: true }, on)).toBe(false);
  });
});
