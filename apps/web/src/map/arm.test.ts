import { describe, expect, it } from 'vitest';
import { armedAfter, press } from './arm.ts';

describe('arm then spend', () => {
  it('a first tap arms, a second tap on the same button spends', () => {
    const first = press(null, 'gather', true);
    expect(first).toEqual({ armed: 'gather', run: false });
    expect(press(first.armed, 'gather', true)).toEqual({ armed: null, run: true });
  });

  it('a tap on another button arms that one and spends nothing', () => {
    expect(press('gather', 'light-fire', true)).toEqual({ armed: 'light-fire', run: false });
  });

  it('a disabled button neither arms nor spends, and keeps what was armed', () => {
    expect(press('gather', 'parley', false)).toEqual({ armed: 'gather', run: false });
    expect(press(null, 'parley', false)).toEqual({ armed: null, run: false });
  });
});

describe('armed across refreshes', () => {
  it('stays armed while the button is still enabled, and is dropped once it is not', () => {
    expect(armedAfter('gather', ['gather', 'light-fire'])).toBe('gather');
    expect(armedAfter('gather', ['light-fire'])).toBeNull();
    expect(armedAfter(null, ['gather'])).toBeNull();
  });

  it('a refresh that disables then re-enables an armed button makes the next tap arm again, not spend', () => {
    let armed = press(null, 'gather', true).armed;
    armed = armedAfter(armed, []); // disabled by a refresh
    armed = armedAfter(armed, ['gather']); // enabled again
    expect(press(armed, 'gather', true)).toEqual({ armed: 'gather', run: false });
  });
});
