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

describe('Milestone 4 moments', () => {
  it('come from the fire-lit, fed, linger, fire-out and creature-ate events', () => {
    const hex = { q: centre.q + 2, r: centre.r };
    expect(
      momentsFromEvents(
        [
          { kind: 'fire-lit', hex },
          { kind: 'fed', material: 'forage' },
          { kind: 'linger' },
          { kind: 'fire-out', hex },
          { kind: 'creature-ate', material: 'timber' },
        ],
        centre,
        'me',
      ),
    ).toEqual([
      { kind: 'fire', hex },
      { kind: 'feed', hex: centre, item: 'forage' },
      { kind: 'linger', hex: centre },
      { kind: 'fire-out', hex },
      { kind: 'ate', hex: centre, item: 'timber' },
    ]);
  });

  it('play the day step as a walk, and a step that stays (a linger) as stayed', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 1, r: -1 };
    expect(
      momentsFromEvents(
        [
          { kind: 'creature-step', from, to },
          { kind: 'creature-step', from: to, to },
        ],
        centre,
        'me',
      ),
    ).toEqual([
      { kind: 'step', hex: to, from },
      { kind: 'stayed', hex: to },
    ]);
    // Without its hexes, a step plays nothing.
    expect(momentsFromEvents([{ kind: 'creature-step' }], centre, 'me')).toEqual([]);
  });
});

describe('Milestone 5 moments', () => {
  const where = {
    threat: (id: string) => (id === 't1' ? { q: 4, r: 0 } : null),
    settlement: (id: string) => (id === 's1' ? { q: -3, r: 2 } : null),
    character: (id: string) =>
      id === 'me' ? { q: 1, r: 2 } : id === 'other' ? { q: 2, r: 2 } : null,
  };

  it('places each on its threat, settlement, character or the creature; skips the quiet ones', () => {
    const hex = { q: 5, r: -1 };
    expect(
      momentsFromEvents(
        [
          { kind: 'threat-appears', id: 't2', hex },
          { kind: 'threat-moves', id: 't1' },
          { kind: 'threat-strikes', id: 't1' },
          { kind: 'struck', characterId: 'me' },
          { kind: 'struck', characterId: 'other' },
          { kind: 'threat-hit', id: 't1', characterId: 'me' },
          { kind: 'threat-cleared', id: 't1', characterId: 'me' },
          { kind: 'threat-gone', id: 't1' },
          { kind: 'defend', characterId: 'me' },
          { kind: 'peril' },
          { kind: 'settlement-appears', id: 's1' },
          { kind: 'parley', id: 's1', characterId: 'me' },
          { kind: 'befriended', id: 's1' },
          { kind: 'angered', id: 's1' },
          { kind: 'offer', id: 's1', characterId: 'me', material: 'old-coin' },
          { kind: 'boon', id: 's1', characterId: 'me', boon: 'shelter' },
          { kind: 'season-over' },
        ],
        centre,
        'me',
        where,
      ),
    ).toEqual([
      { kind: 'threat', hex },
      { kind: 'strike', hex: centre },
      { kind: 'struck', hex: { q: 1, r: 2 }, mine: true },
      { kind: 'struck', hex: { q: 2, r: 2 }, mine: false },
      { kind: 'hit', hex: { q: 4, r: 0 } },
      { kind: 'cleared', hex: { q: 4, r: 0 } },
      { kind: 'defend', hex: centre },
      { kind: 'befriended', hex: { q: -3, r: 2 } },
      { kind: 'angered', hex: { q: -3, r: 2 } },
      { kind: 'boon', hex: { q: -3, r: 2 }, item: 'shelter' },
      { kind: 'season-over', hex: centre },
    ]);
  });

  it('drops a moment it cannot place (a thing it never saw)', () => {
    expect(
      momentsFromEvents(
        [
          { kind: 'threat-hit', id: 'unknown' },
          { kind: 'befriended', id: 'unknown' },
        ],
        centre,
        'me',
        where,
      ),
    ).toEqual([]);
  });
});

describe('polish round moments', () => {
  it('a survey that revealed nothing is the "nothing here" moment; one that revealed something is a survey', () => {
    const empty = { q: 1, r: 0 };
    const found = { q: 2, r: 0 };
    expect(
      momentsFromEvents(
        [
          { kind: 'survey', hex: empty },
          { kind: 'explore', hex: empty },
          { kind: 'survey', hex: found },
          { kind: 'explore', hex: found },
          { kind: 'reveal', hex: found },
        ],
        centre,
        'me',
      ),
    ).toEqual([
      { kind: 'nothing-here', hex: empty },
      { kind: 'explore', hex: empty },
      { kind: 'survey', hex: found },
      { kind: 'explore', hex: found },
      { kind: 'reveal', hex: found },
    ]);
  });

  it('reads a survey-empty event, should the core send one', () => {
    const hex = { q: 0, r: 2 };
    expect(momentsFromEvents([{ kind: 'survey-empty', hex }], centre, 'me')).toEqual([
      { kind: 'nothing-here', hex },
    ]);
  });

  it('pursuers led away by a mislead turn and go where they stood; a threat gone otherwise shows nothing', () => {
    const where = {
      threat: (id: string) => (id === 't1' ? { q: 3, r: 1 } : null),
      settlement: () => ({ q: 1, r: 1 }),
      character: () => null,
    };
    expect(
      momentsFromEvents(
        [
          { kind: 'boon', id: 's1', boon: 'mislead' },
          { kind: 'threat-gone', id: 't1' },
        ],
        centre,
        'me',
        where,
      ),
    ).toEqual([
      { kind: 'boon', hex: { q: 1, r: 1 }, item: 'mislead' },
      { kind: 'misled', hex: { q: 3, r: 1 } },
    ]);
    expect(momentsFromEvents([{ kind: 'threat-gone', id: 't1' }], centre, 'me', where)).toEqual([]);
  });

  it('peril that drops (a shelter) is relieved on the creature; peril that rises is not', () => {
    expect(momentsFromEvents([{ kind: 'peril', from: 5, to: 2 }], centre, 'me')).toEqual([
      { kind: 'relieved', hex: centre },
    ]);
    expect(momentsFromEvents([{ kind: 'peril', from: 2, to: 3 }], centre, 'me')).toEqual([]);
  });
});
