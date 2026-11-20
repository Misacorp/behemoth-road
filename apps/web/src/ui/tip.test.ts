import { describe, expect, it } from 'vitest';
import { delays, holdMs } from '../text/tips.ts';
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

const at = () => ({ x: 10, y: 20, width: 30, height: 30 });

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

  it('open on a touch hold, close on lifting, and swallow the click that follows', () => {
    const { c, advance } = setup();
    c.press('action:survey', at, 0, 0);
    advance(holdMs - 1);
    expect(c.open).toBeNull();
    advance(1);
    expect(c.open?.id).toBe('action:survey');
    expect(c.release()).toBe(true);
    expect(c.open).toBeNull();
    expect(c.takeClick()).toBe(true);
    expect(c.takeClick()).toBe(false);
  });

  it('a short tap is a tap: no tip, and its click goes through', () => {
    const { c, advance } = setup();
    c.press('action:survey', at, 0, 0);
    advance(holdMs / 2);
    expect(c.release()).toBe(false);
    advance(holdMs);
    expect(c.open).toBeNull();
    expect(c.takeClick()).toBe(false);
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
    c.tap('trait:keen-eyed', at());
    expect(c.open?.id).toBe('trait:keen-eyed');
    c.tap('trait:keen-eyed', at());
    expect(c.open).toBeNull();
    c.tap('quirk:loud', at());
    c.close();
    expect(c.open).toBeNull();
  });

  it('name content by kind and id, and nothing for an id the text file lacks', () => {
    expect(tipFor('role', 'scout')).toBe('role:scout');
    expect(tipFor('role', 'pirate')).toBeNull();
    expect(tipFor('trait', null)).toBeNull();
  });
});
