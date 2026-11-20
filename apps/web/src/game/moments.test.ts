import { describe, expect, it } from 'vitest';
import { eventKeys, momentsFromEvents } from './moments.ts';

const centre = { q: 0, r: 0 };

describe('moments from the server events', () => {
  it('maps explore, survey, reveal, trap, find, deposit and unlock-done; skips the rest', () => {
    const hex = { q: 1, r: 0 };
    expect(
      momentsFromEvents(
        [
          { kind: 'survey', hex },
          { kind: 'explore', hex },
          { kind: 'reveal', hex },
          { kind: 'gather', hex, material: 'iron' },
          { kind: 'trap', hex, characterId: 'other' },
          { kind: 'find', hex, material: 'ancient-alloy' },
          { kind: 'deposit', materials: { iron: 1, timber: 2 } },
          { kind: 'unlock-progress', unlock: 'lantern' },
          { kind: 'unlock-done', unlock: 'lantern' },
          { kind: 'creature-step' },
          { kind: 'meteor', hex },
        ],
        centre,
        'me',
      ),
    ).toEqual([
      { kind: 'survey', hex },
      { kind: 'explore', hex },
      { kind: 'reveal', hex },
      { kind: 'trap', hex, mine: false },
      { kind: 'find', hex, item: 'ancient-alloy' },
      { kind: 'deposit', hex: centre, item: 'timber' },
      { kind: 'unlock', hex: centre, item: 'lantern' },
    ]);
  });

  it('marks a trap that caught your own character', () => {
    const hex = { q: 0, r: 3 };
    expect(momentsFromEvents([{ kind: 'trap', hex, characterId: 'me' }], centre, 'me')).toEqual([
      { kind: 'trap', hex, mine: true },
    ]);
  });

  it('keys each event by its version and its place within that version', () => {
    expect(eventKeys([{ version: 6 }, { version: 7 }, { version: 7 }])).toEqual([
      '6:0',
      '7:0',
      '7:1',
    ]);
  });
});
