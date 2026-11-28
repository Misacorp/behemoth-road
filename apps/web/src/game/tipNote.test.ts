import { describe, expect, it } from 'vitest';
import { TIP_TABLE } from '../text/tips.ts';
import { verbOf, verbs } from '../text/verbs.ts';
import { oddsView } from './odds.ts';
import { actionLine, actionTip, tipNoteOf } from './tipNote.ts';

describe('the tip an action shows on its first tap', () => {
  it('reads like the examples: verb, a full stop, one plain sentence', () => {
    expect(actionLine('gather')).toBe('Gather. Collect a resource.');
    expect(actionLine('survey')).toBe('Survey. Reveal the tile for everyone.');
    expect(actionLine('move')).toBe('Move. Move to this hex along the route.');
  });

  it('fills the thing the action acts on from content: the lure', () => {
    expect(actionLine('lead')).toBe('Lead. Move the capybara to a neighbouring tile.');
  });

  it('adds the odds of an action that rolls, from the core odds', () => {
    const parley = oddsView({ success: 0.7, failure: 0.3, failureKind: 'angered' });
    expect(tipNoteOf(parley)).toBe('Success 70% · Angered 30%');
    expect(actionLine('parley', tipNoteOf(parley))).toBe(
      'Parley. Win a wary settlement’s favour. Success 70% · Angered 30%',
    );
    const strike = oddsView({ success: 0.8, failure: 0.2, failureKind: 'buried' });
    expect(actionLine('strike', tipNoteOf(strike))).toBe(
      'Strike. Deal damage to the foe. Success 80% · Pinned 20%',
    );
    const work = oddsView({ success: 0.5, failure: 0.5, failureKind: 'site-failed' });
    expect(actionLine('work-site', tipNoteOf(work))).toBe(
      'Search. Search this site for finds. Success 50% · Nothing 50%',
    );
    const struggle = oddsView({ success: 0.4, failure: 0.6, failureKind: 'still-pinned' });
    expect(actionLine('struggle', tipNoteOf(struggle))).toBe(
      'Struggle. Try to free yourself. Each try is likelier to work. Success 40% · Pinned 60%',
    );
  });

  it('says only the sentence when there are no odds (a sure strike, a gather)', () => {
    expect(tipNoteOf(null)).toBeNull();
    expect(tipNoteOf(oddsView({ success: 1, failure: 0, failureKind: 'buried' }))).toBeNull();
    expect(actionLine('strike')).toBe('Strike. Deal damage to the foe.');
    expect(actionLine('parley')).toBe('Parley. Win a wary settlement’s favour.');
  });

  it('has one short line, led by its verb, for every action a button can show', () => {
    for (const kind of [...Object.keys(verbs), 'move']) {
      if (kind === 'pick-skill' || kind === 'set-stance' || kind === 'wait') continue;
      const line = actionLine(kind, 'Success 50% · Failure 50%');
      expect(line, kind).not.toBeNull();
      expect(line!.startsWith(`${verbOf(kind)!}. `), kind).toBe(true);
      expect(line, kind).not.toMatch(/[{}]/);
      expect(line!.length, kind).toBeLessThanOrEqual(90);
    }
  });

  it('puts the odds only into the actions that roll', () => {
    const rolls = Object.entries(TIP_TABLE)
      .filter(([id, tip]) => id.startsWith('action:') && tip.text.includes('{note}'))
      .map(([id]) => id)
      .sort();
    expect(rolls).toEqual([
      'action:parley',
      'action:strike',
      'action:struggle',
      'action:work-site',
    ]);
  });

  it('finds the tip of an offer and of a boon by their button kinds', () => {
    expect(actionTip('offer:old-coin')).toBe('action:offer');
    expect(actionTip('boon:gift')).toBe('boon:gift');
    expect(actionTip('nothing-like-it')).toBeNull();
  });
});
