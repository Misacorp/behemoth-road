import { characterOf, ROLES, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type ChainStage, chainScenario, seasonScenario, USERS } from '../api/fixtures.ts';
import { TIP_TABLE } from '../text/tips.ts';
import { tipValues } from '../text/tipValues.ts';
import { greyedProps, isPlainIcon } from '../ui/press.ts';
import { actionsAt, careOptions, fireAction, unlockOptions } from './chain.ts';
import { defendedBy, defendOption, threatCard } from './season.ts';
import { WHY_BY_REFUSAL, whyTip } from './why.ts';

function staged(stage: ChainStage) {
  const s = chainScenario(stage);
  return { s, view: toPlayerView(s.state), me: characterOf(s.state, USERS.MISA)!.id };
}

function seasonStaged(stage: Parameters<typeof seasonScenario>[0]) {
  const s = seasonScenario(stage);
  return { s, view: toPlayerView(s.state), me: characterOf(s.state, USERS.MISA)!.id };
}

describe('the reason an action is greyed', () => {
  it('has a written tip for every refusal and every role', () => {
    for (const id of Object.values(WHY_BY_REFUSAL)) expect(TIP_TABLE[id], id).toBeDefined();
    for (const role of ROLES) {
      const id = whyTip('needs-keeper', role.id);
      expect(id).toBe(`why:role-${role.id}`);
      expect(TIP_TABLE[id]).toBeDefined();
    }
  });

  it('is the role that can, when the refusal is about who you are, else the refusal itself', () => {
    expect(whyTip('needs-keeper', 'keeper')).toBe('why:role-keeper');
    expect(whyTip('not-enough-actions')).toBe('why:not-enough-actions');
    expect(whyTip('pack-full', null)).toBe('why:pack-full');
    // A role the content does not know falls back to the refusal's own tip.
    expect(whyTip('needs-warden', 'nobody')).toBe('why:role-warden');
  });

  it('comes from the same check that greys each action', () => {
    const scout = staged({ role: 'scout', at: 'creature', stores: { forage: 2 } });
    const care = careOptions(scout.view, scout.me);
    expect(care.find((a) => a.kind === 'linger')?.why).toBe('why:role-keeper');
    expect(care.find((a) => a.kind === 'feed')?.why).toBeUndefined();
    expect(defendOption(scout.view, scout.me)?.why).toBe('why:role-warden');

    const tired = {
      ...scout.view,
      characters: scout.view.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(careOptions(tired, scout.me).find((a) => a.kind === 'feed')?.why).toBe(
      'why:not-enough-actions',
    );

    const walker = staged({ pack: { timber: 1 } });
    const spent = {
      ...walker.view,
      characters: walker.view.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(fireAction(spent, walker.me)?.why).toBe('why:not-enough-actions');
    expect(actionsAt(spent, walker.me).every((a) => a.enabled || a.why !== undefined)).toBe(true);

    const engineer = staged({ role: 'scout', at: 'creature', stores: {} });
    const unlocks = unlockOptions(engineer.view, engineer.me);
    for (const o of unlocks) {
      if (!o.enabled) expect(o.why, o.unlock.id).not.toBeNull();
    }
  });

  it('is not given to an action that can be taken', () => {
    const keeper = staged({ role: 'keeper', at: 'creature', stores: { forage: 2 } });
    for (const a of careOptions(keeper.view, keeper.me)) {
      expect(a.enabled).toBe(true);
      expect(a.why).toBeUndefined();
    }
  });
});

describe('a greyed action is a button that does not act', () => {
  const button = { hasAttribute: (n: string) => n === 'data-tip-tap', closest: () => ({}) };

  it('carries its reason as its tip and asks for a tap to show it', () => {
    const props = greyedProps(false, 'why:role-keeper', 'action:linger');
    expect(props['data-tip']).toBe('why:role-keeper');
    expect(props['data-tip-tap']).toBe('');
    // The press layer treats a tap on it as a plain icon's: it shows the tip and goes no further.
    expect(isPlainIcon(button as unknown as Element)).toBe(true);
  });

  it('is the ordinary action tip when it can be taken (or no reason is known)', () => {
    expect(greyedProps(true, 'why:done', 'action:linger')).toEqual({ 'data-tip': 'action:linger' });
    expect(greyedProps(false, null, 'action:linger')).toEqual({ 'data-tip': 'action:linger' });
    expect(greyedProps(true, null)).toEqual({});
  });

  it('only uses numbers from the rules in its texts', () => {
    const values = tipValues(staged({}).view.config);
    expect(TIP_TABLE['why:pack-full'].text).toContain('{packSize}');
    expect(values.packSize).toBeDefined();
  });
});

describe('how the creature is defended', () => {
  it('counts the wardens riding who defended, and what they take off a strike', () => {
    const idle = seasonStaged({ role: 'warden', at: 'creature' });
    expect(defendedBy(idle.view)).toEqual({ wardens: 0, reduction: 0 });
    const guarding = seasonStaged({ role: 'warden', at: 'creature', defending: true });
    // A threat's card carries the same reduction, to draw as shields against its strength marks.
    const withThreat = seasonStaged({
      role: 'warden',
      at: 'creature',
      defending: true,
      threats: [{ type: 'swarm', at: { q: 3, r: 0 }, strength: 3 }],
    });
    const id = withThreat.view.threats[0]!.id;
    expect(threatCard(withThreat.view, withThreat.me, id)?.defence).toBe(
      withThreat.view.config.defendReduction,
    );
    expect(defendedBy(guarding.view)).toEqual({
      wardens: 1,
      reduction: guarding.view.config.defendReduction,
    });
  });
});
