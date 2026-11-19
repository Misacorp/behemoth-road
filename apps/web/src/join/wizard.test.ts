import { describe, expect, it } from 'vitest';
import { snapAfterDrag } from '../ui/Drawer.tsx';
import { ready, START, wizard } from './wizard.ts';

describe('join wizard', () => {
  it('goes character, role, confirm, and back again', () => {
    const a = wizard(START, { kind: 'offer', index: 2 });
    expect(a).toEqual({ step: 'role', offer: 2, role: null });
    expect(ready(a)).toBe(false);
    const b = wizard(a, { kind: 'role', role: 'envoy' });
    expect(b).toEqual({ step: 'confirm', offer: 2, role: 'envoy' });
    expect(ready(b)).toBe(true);
    expect(wizard(b, { kind: 'back' }).step).toBe('role');
    expect(wizard(wizard(b, { kind: 'back' }), { kind: 'back' }).step).toBe('character');
  });

  it('on desktop, where every step shows, choices can come in any order', () => {
    const role = wizard(START, { kind: 'role', role: 'scout' });
    expect(role.step).toBe('character');
    const both = wizard(role, { kind: 'offer', index: 0 });
    expect(both).toEqual({ step: 'confirm', offer: 0, role: 'scout' });
  });
});

describe('drawer drag', () => {
  it('moves between half and full, and closes from half', () => {
    expect(snapAfterDrag('half', -80)).toBe('full');
    expect(snapAfterDrag('full', 80)).toBe('half');
    expect(snapAfterDrag('half', 80)).toBe('close');
    expect(snapAfterDrag('full', -80)).toBeNull();
    expect(snapAfterDrag('half', 20)).toBeNull();
  });
});
