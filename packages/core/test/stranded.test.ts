import { describe, expect, it } from 'vitest';
import {
  createGame,
  hex,
  isInWindow,
  nextDay,
  planPath,
  stranded,
  visibilityAt,
} from '../src/index.ts';
import { placeCharacter, withCharacter } from './helpers.ts';

const straight = { veerWeights: { left: 0, right: 0 } };
const GRACE = hex(0, 6);

/** Day 2 with character `a` on a grace hex, `b` riding. */
const inGrace = () => {
  const start = placeCharacter(
    createGame(1, { characterIds: ['a', 'b'], config: straight }),
    'a',
    GRACE,
  );
  return nextDay(start);
};

const edit = (
  state: ReturnType<typeof inGrace>,
  patch: { actionsLeft?: number; waiting?: boolean },
) => {
  const a = state.characters.find((c) => c.id === 'a');
  if (!a) throw new Error('no a');
  return withCharacter(state, { ...a, ...patch });
};

describe('stranded', () => {
  it('is false on a grace hex while today’s actions can afford the way back', () => {
    const state = inGrace();
    expect(isInWindow(state, GRACE)).toBe(false);
    expect(visibilityAt(state, GRACE)).toBe('seen');
    const back = planPath(state, 'a', hex(0, 5));
    expect(back.ok).toBe(true);
    expect(stranded(state, 'a')).toBe(false);
  });

  it('is true on a grace hex when the actions cannot afford the way back', () => {
    const state = inGrace();
    expect(stranded(edit(state, { actionsLeft: 0 }), 'a')).toBe(true);
    expect(stranded(edit(state, { actionsLeft: 1 }), 'a')).toBe(
      (planPath(edit(state, { actionsLeft: 3 }), 'a', hex(0, 5)) as { cost: number }).cost > 1,
    );
  });

  it('is true when the character waits, whatever the actions', () => {
    expect(stranded(edit(inGrace(), { waiting: true }), 'a')).toBe(true);
  });

  it('is false for riders, characters in the window, the lost and unknown ids', () => {
    const state = inGrace();
    expect(stranded(state, 'b')).toBe(false);
    expect(stranded(placeCharacter(edit(state, { actionsLeft: 0 }), 'a', hex(0, 0)), 'a')).toBe(
      false,
    );
    expect(stranded(state, 'nobody')).toBe(false);
    const lost = nextDay(edit(state, { actionsLeft: 0 }));
    expect(lost.characters.find((c) => c.id === 'a')?.status).toBe('lost');
    expect(stranded(lost, 'a')).toBe(false);
  });
});
