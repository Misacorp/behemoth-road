import { describe, expect, it } from 'vitest';
import { verbOf, verbs } from './verbs.ts';

describe('verbOf', () => {
  it('gives the verb of a plain action kind', () => {
    expect(verbOf('gather')).toBe('Gather');
    expect(verbOf('work-site')).toBe('Work');
  });

  it('reads the offer: and boon: prefixes', () => {
    expect(verbOf('offer:iron')).toBe(verbs.offer);
    expect(verbOf('boon:swift')).toBe(verbs['ask-boon']);
  });

  it('gives null for an unknown key', () => {
    expect(verbOf('dance')).toBeNull();
    expect(verbOf('')).toBeNull();
    expect(verbOf('boon')).toBeNull();
  });

  it('finds no prototype keys', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      expect(verbOf(key)).toBeNull();
  });
});
