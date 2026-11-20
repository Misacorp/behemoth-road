import { describe, expect, it } from 'vitest';
import * as entry from '../src/index.ts';

describe('the Worker entry', () => {
  it('exports only the default handler and Durable Object classes (workerd refuses anything else)', () => {
    for (const [name, value] of Object.entries(entry)) {
      if (name === 'default') {
        expect(typeof (value as { fetch?: unknown }).fetch).toBe('function');
        continue;
      }
      // A class: a function with a prototype of its own methods (a plain const or function would fail here).
      expect(typeof value, name).toBe('function');
      expect(/^class\s/.test(Function.prototype.toString.call(value)), name).toBe(true);
    }
    expect(Object.keys(entry).sort()).toEqual(['GuildWorld', 'default']);
  });
});
