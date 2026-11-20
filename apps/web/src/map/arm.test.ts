import { describe, expect, it } from 'vitest';
import { press } from './arm.ts';

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
