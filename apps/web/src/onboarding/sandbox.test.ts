import { characterOf, type GameStateView, type Hex, hexKey } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type Flow, IDLE, planMove, tap } from '../map/flow.ts';
import { type Target } from '../map/pick.ts';
import {
  captionFor,
  coachMap,
  coachStep,
  hasArrived,
  planFor,
  type PracticeAction,
  type Step,
} from './coach.ts';
import { createSandbox } from './sandboxApi.ts';
import { SANDBOX_USERS, sandboxState, sandboxView, SPOTS } from './sandbox.ts';

const ROLES = ['scout', 'scholar', 'keeper', 'engineer', 'warden'] as const;

describe('the practice map', () => {
  it('is the same map for the same role, and has no secrets of a real game', () => {
    for (const role of ROLES) {
      expect(sandboxState(role)).toEqual(sandboxState(role));
    }
    const view = sandboxView(sandboxState('scout'), 1);
    expect(view.devTools).toBe(false);
    expect(view.you.admin).toBe(false);
    expect(view.offers).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"seed"');
  });

  it('puts you on your start hex with the day full, beside a party', () => {
    for (const role of ROLES) {
      const state = sandboxState(role);
      const me = characterOf(state, SANDBOX_USERS.you);
      expect(me?.role).toBe(role);
      expect(me?.status).toBe('active');
      expect(me?.actionsLeft).toBe(state.config.actionsPerDay);
      expect(me?.at).toEqual({
        kind: 'hex',
        hex: {
          q: state.creature.centre.q + SPOTS.start.q,
          r: state.creature.centre.r + SPOTS.start.r,
        },
      });
      expect(state.characters).toHaveLength(3);
      expect(state.threats).toHaveLength(0);
    }
  });

  it('veils the iron for a scout to look at, and shows it to everyone else', () => {
    const scout = sandboxView(sandboxState('scout'), 1);
    const engineer = sandboxView(sandboxState('engineer'), 1);
    expect(Object.keys(scout.game.features)).toHaveLength(1);
    expect(Object.keys(engineer.game.features)).toHaveLength(2);
  });
});

/** Plays the guided day through the practice API the way a finger would: tap, tap, confirm, act. */
async function playGuidedDay(role: (typeof ROLES)[number]): Promise<Step[]> {
  const sandbox = createSandbox(role);
  const steps: Step[] = [];
  let flow: Flow = IDLE;
  let arrivalActions: number | null = null;
  const read = async () => {
    const got = await sandbox.api.game();
    if ('unchanged' in got) throw new Error('unchanged');
    return got;
  };
  let view = await read();
  const id = view.you.characterId ?? '';
  const plan = planFor(view.game, role);
  const step = (): Step => {
    if (arrivalActions === null && hasArrived(plan, view.game, id)) {
      arrivalActions = characterOf(sandbox.state(), SANDBOX_USERS.you)?.actionsLeft ?? null;
    }
    const s = coachStep(plan, { flow, state: view.game, characterId: id, arrivalActions });
    if (steps[steps.length - 1] !== s) steps.push(s);
    return s;
  };
  const tapOn = (target: Target): void => {
    flow = tap(flow, view.game, id, target);
    step();
  };
  step();
  const targetHex: Hex = plan.target.kind === 'hex' ? plan.target.hex : view.game.creature.centre;
  tapOn({ kind: 'hex', hex: targetHex });
  // The glowing tile's card is open: the first tap on its Move plans the route, the second confirms it.
  const card = flow;
  const planned = planMove(view.game, id, plan.target, card);
  if (planned === null) throw new Error('no Move');
  flow = planned;
  step();
  expect(flow.kind).toBe('planned');
  if (flow.kind !== 'planned') throw new Error('no plan');
  view = await sandbox.api.move(
    view.version,
    flow.steps.map((s) => s.place),
  );
  flow = { kind: 'selected' };
  step();
  const act: Record<PracticeAction, () => Promise<void>> = {
    survey: async () => {
      view = await sandbox.api.act(view.version, { kind: 'survey', hex: plan.look as Hex });
    },
    gather: async () => {
      view = await sandbox.api.act(view.version, { kind: 'gather' });
    },
    'work-site': async () => {
      view = await sandbox.api.act(view.version, { kind: 'work-site' });
    },
    feed: async () => {
      view = await sandbox.api.act(view.version, { kind: 'feed' });
    },
    defend: async () => {
      view = await sandbox.api.act(view.version, { kind: 'defend' });
    },
  };
  await act[plan.action]();
  flow = IDLE;
  step();
  return steps;
}

/** The view with you standing on the guided tile, one action spent getting there. */
function arrivedAt(
  state: GameStateView,
  id: string,
  plan: ReturnType<typeof planFor>,
): GameStateView {
  const to =
    plan.target.kind === 'hex'
      ? { kind: 'hex' as const, hex: plan.target.hex }
      : { kind: 'creature' as const };
  return {
    ...state,
    characters: state.characters.map((c) => (c.id === id ? { ...c, at: to, actionsLeft: 2 } : c)),
  };
}

describe('the guided first day', () => {
  for (const role of ROLES) {
    it(`walks a ${role} through tile, move, confirm, one action, done`, async () => {
      expect(await playGuidedDay(role)).toEqual(['tile', 'move', 'confirm', 'act', 'done']);
    });
  }

  it('lights what the step is about, and nothing else', () => {
    const state = sandboxView(sandboxState('scout'), 1).game;
    const id = state.characters.find((c) => c.userId === SANDBOX_USERS.you)?.id ?? '';
    const plan = planFor(state, 'scout');
    const input = { flow: IDLE, state, characterId: id, arrivalActions: null };
    const target = (plan.target as { hex: Hex }).hex;
    const tile = coachMap(plan, input);
    expect(tile).toMatchObject({ step: 'tile', ringMe: false, mark: null });
    expect(tile.glow.map(hexKey)).toEqual([hexKey(target)]);
    // The card of that tile is open: its Move pulses; planned, the armed Move does.
    const card = coachMap(plan, { ...input, flow: { kind: 'inspect', hex: target } });
    expect(card).toMatchObject({ step: 'move', mark: 'move' });
    const route = planMove(state, id, plan.target, { kind: 'inspect', hex: target });
    expect(coachMap(plan, { ...input, flow: route! })).toMatchObject({
      step: 'confirm',
      mark: 'confirm',
    });
  });

  it('has a scout tap the veiled hex to look at it, once on the glowing tile', () => {
    const state = sandboxView(sandboxState('scout'), 1).game;
    const id = state.characters.find((c) => c.userId === SANDBOX_USERS.you)?.id ?? '';
    const plan = planFor(state, 'scout');
    const at = (flow: Flow) =>
      coachMap(plan, {
        flow,
        state: arrivedAt(state, id, plan),
        characterId: id,
        arrivalActions: 2,
      });
    const idle = at(IDLE);
    expect(idle).toMatchObject({ step: 'act', ringMe: false, mark: 'act' });
    expect(idle.glow.map(hexKey)).toEqual([hexKey(plan.look as Hex)]);
    expect(at({ kind: 'inspect', hex: plan.look as Hex })).toMatchObject({
      hand: null,
      mark: 'act',
    });
  });

  it('sends a keeper through the creature, its bubble and its hub for the action', () => {
    const state = sandboxView(sandboxState('keeper'), 1).game;
    const id = state.characters.find((c) => c.userId === SANDBOX_USERS.you)?.id ?? '';
    const plan = planFor(state, 'keeper');
    // Standing on the creature already, with the day's first action spent getting there.
    const riding = {
      ...state,
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, at: { kind: 'creature' as const }, actionsLeft: 2 } : c,
      ),
    };
    const at = (flow: Flow) =>
      coachMap(plan, { flow, state: riding, characterId: id, arrivalActions: 2 });
    expect(at({ kind: 'selected' })).toMatchObject({ step: 'act', mark: null });
    expect(at({ kind: 'selected' }).hand).not.toBeNull();
    expect(at({ kind: 'bubble', selecting: true })).toMatchObject({ mark: 'hub' });
    expect(at({ kind: 'creature' })).toMatchObject({ mark: 'act', glow: [] });
  });

  it('has a short line for each step, and none when done', () => {
    const state = sandboxView(sandboxState('keeper'), 1).game;
    const plan = planFor(state, 'keeper');
    expect(captionFor('tile', plan)).toBe('Tap the glowing tile');
    expect(captionFor('move', plan)).toBe('Tap Move');
    expect(captionFor('confirm', plan)).toBe('Tap Move again');
    expect(captionFor('act', plan)).toBe('Feed it');
    expect(captionFor('done', plan)).toBeNull();
    expect(captionFor('stuck', plan)).toBeNull();
  });

  it('never blocks: wandering off the path puts you back on the first steps, and no actions left is stuck', async () => {
    const sandbox = createSandbox('scholar');
    const first = await sandbox.api.game();
    if ('unchanged' in first) throw new Error('unchanged');
    const id = first.you.characterId ?? '';
    const plan = planFor(first.game, 'scholar');
    // Walk three steps somewhere else: out of actions without the guided move.
    let view = first;
    const c = view.game.creature.centre;
    for (const h of [
      { q: c.q + 1, r: c.r + 1 },
      { q: c.q + 1, r: c.r },
      { q: c.q + 1, r: c.r - 1 },
    ]) {
      const next = await sandbox.api
        .move(view.version, [{ kind: 'hex', hex: h }])
        .catch(() => null);
      if (next) view = next;
    }
    const step = coachStep(plan, {
      flow: IDLE,
      state: view.game,
      characterId: id,
      arrivalActions: null,
    });
    expect(['stuck', 'tile']).toContain(step);
  });
});

describe('the practice map and stances', () => {
  it('handles waiting in the local core, without a server', async () => {
    const sandbox = createSandbox('scout');
    const view = await sandbox.api.game();
    if ('unchanged' in view) throw new Error('unchanged');
    const waited = await sandbox.api.act(view.version, { kind: 'wait' });
    expect(waited.version).toBeGreaterThan(view.version);
    const me = characterOf(sandbox.state(), SANDBOX_USERS.you);
    expect(me?.waiting).toBe(true);
  });
});
