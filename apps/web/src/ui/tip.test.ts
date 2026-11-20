import { describe, expect, it } from 'vitest';
import { delays, holdMs, stayMs } from '../text/tips.ts';
import { delayOf, HOLD_SLOP, type OpenTip, TipController, tipFor } from './tip.ts';

/** A controller on fake timers: `advance(ms)` runs what is due. */
function setup() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const c = new TipController({
    setTimeout: (fn, ms) => {
      timers.set(next, { at: now + ms, fn });
      return next++;
    },
    clearTimeout: (h) => timers.delete(h),
  });
  const seen: (OpenTip | null)[] = [];
  c.subscribe((o) => seen.push(o));
  const advance = (ms: number): void => {
    now += ms;
    for (const [h, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= now) {
        timers.delete(h);
        t.fn();
      }
    }
  };
  return { c, seen, advance };
}

/** A thing with a tip: it may be removed (`gone`), and it owns the clicks on `self`. */
function thing() {
  const state = { gone: false };
  const self = {};
  const target = {
    rect: () => (state.gone ? null : { x: 10, y: 20, width: 30, height: 30 }),
    alive: () => !state.gone,
    owns: (t: unknown) => t === self,
  };
  return { state, self, target };
}
const at = thing().target;

describe('tips', () => {
  it('open on hover after their group delay, and close on leaving', () => {
    const { c, advance } = setup();
    c.hover('role:scout', at);
    advance(delays.content - 1);
    expect(c.open).toBeNull();
    advance(1);
    expect(c.open?.id).toBe('role:scout');
    c.unhover('role:scout');
    expect(c.open).toBeNull();
  });

  it('use the delay of their group: HUD at once, actions sooner than content, map later', () => {
    expect(delayOf('hud:day')).toBe(delays.hud);
    expect(delayOf('action:survey')).toBe(delays.action);
    expect(delayOf('material:iron')).toBe(delays.content);
    expect(delayOf('threat:captors')).toBe(delays.map);
  });

  it('leaving before the delay opens nothing', () => {
    const { c, advance } = setup();
    c.hover('action:gather', at);
    advance(delays.action - 10);
    c.unhover('action:gather');
    advance(1000);
    expect(c.open).toBeNull();
  });

  it('show one at a time: moving to another icon switches at once', () => {
    const { c, advance } = setup();
    c.hover('role:scout', at);
    advance(delays.content);
    c.hover('role:keeper', at);
    expect(c.open?.id).toBe('role:keeper');
  });

  it("open on a touch hold, stay after lifting, and swallow only that button's next click", () => {
    const { c, advance } = setup();
    const button = thing();
    c.press('action:survey', button.target, 0, 0);
    advance(holdMs - 1);
    expect(c.open).toBeNull();
    advance(1);
    expect(c.open?.id).toBe('action:survey');
    expect(c.release()).toBe(true);
    // Only that button's own click is swallowed, once.
    expect(c.takeClick({})).toBe(false);
    expect(c.takeClick(button.self)).toBe(true);
    expect(c.takeClick(button.self)).toBe(false);
    // It stays to be read after the finger lifts, then goes by itself.
    expect(c.open?.id).toBe('action:survey');
    advance(stayMs - 1);
    expect(c.open?.id).toBe('action:survey');
    advance(1);
    expect(c.open).toBeNull();
  });

  it('a short tap is a tap: no tip, and its click goes through', () => {
    const { c, advance } = setup();
    c.press('action:survey', at, 0, 0);
    advance(holdMs / 2);
    expect(c.release()).toBe(false);
    advance(holdMs);
    expect(c.open).toBeNull();
    expect(c.takeClick(at)).toBe(false);
  });

  it('a finger that moves is a drag, not a hold', () => {
    const { c, advance } = setup();
    c.press('hud:peril', at, 0, 0);
    c.move(HOLD_SLOP / 2, 0);
    c.move(HOLD_SLOP + 1, 0);
    advance(holdMs * 2);
    expect(c.open).toBeNull();
    expect(c.release()).toBe(false);
  });

  it('close on Escape (close), and a tap on an icon without an action toggles its tip', () => {
    const { c } = setup();
    c.tap('trait:keen-eyed', at);
    expect(c.open?.id).toBe('trait:keen-eyed');
    c.tap('trait:keen-eyed', at);
    expect(c.open).toBeNull();
    c.tap('quirk:loud', at);
    c.close();
    expect(c.open).toBeNull();
  });

  it('name content by kind and id, and nothing for an id the text file lacks', () => {
    expect(tipFor('role', 'scout')).toBe('role:scout');
    expect(tipFor('role', 'pirate')).toBeNull();
    expect(tipFor('trait', null)).toBeNull();
  });

  it('a hold, then a drag, then a later tap: the tap goes through', () => {
    const { c, advance } = setup();
    const button = thing();
    c.press('action:gather', button.target, 0, 0);
    advance(holdMs);
    expect(c.open?.id).toBe('action:gather');
    c.move(HOLD_SLOP * 3, 0);
    expect(c.open).toBeNull();
    c.release();
    advance(1000);
    expect(c.takeClick(button.self)).toBe(false);
  });

  it('a hold whose tip Escape closed is still a hold when the finger lifts', () => {
    const { c, advance } = setup();
    const button = thing();
    c.press('action:strike', button.target, 0, 0);
    advance(holdMs);
    c.close();
    expect(c.release()).toBe(true);
    expect(c.open).toBeNull();
    expect(c.takeClick(button.self)).toBe(true);
  });

  it('opens nothing for a thing that is gone, and pending timers die with it', () => {
    const { c, advance } = setup();
    const icon = thing();
    c.hover('unlock:lantern', icon.target);
    icon.state.gone = true;
    advance(delays.content);
    expect(c.open).toBeNull();
    const other = thing();
    c.hover('unlock:lantern', other.target);
    advance(delays.content);
    expect(c.open?.alive()).toBe(true);
    other.state.gone = true;
    expect(c.open?.alive()).toBe(false);
  });

  it("a tap elsewhere closes a stay-open tip and still acts (only the held thing's click is swallowed)", () => {
    const { c, advance } = setup();
    const held = thing();
    const elsewhere = thing();
    c.press('action:survey', held.target, 0, 0);
    advance(holdMs);
    expect(c.release()).toBe(true);
    expect(c.open?.id).toBe('action:survey');
    // The tap elsewhere: its press closes the tip (the tip layer does this)...
    c.close();
    expect(c.open).toBeNull();
    // ...and its click is not swallowed, so it acts.
    expect(c.takeClick(elsewhere.self)).toBe(false);
    // Only the held thing's own click, once, is still swallowed.
    expect(c.takeClick(held.self)).toBe(true);
    expect(c.takeClick(held.self)).toBe(false);
    // The stay timer died with the tip: nothing closes or reopens later.
    advance(stayMs);
    expect(c.open).toBeNull();
  });
});
