import { SKILL_NODES } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import {
  costOf,
  emptyPlan,
  formatHash,
  parseHash,
  type Plan,
  refusalOf,
  roleIds,
  togglePick,
  treeOf,
  validPicks,
  withRole,
  WIKI_XP_PER_DAY,
  XP_PER_PICK,
} from './model.ts';

const [first = '', second = ''] = roleIds();
const pick = (plan: Plan, ...ids: string[]): Plan => ids.reduce(togglePick, plan);

describe('the build planner (rules come from the core)', () => {
  it('lets tiers 2 and 3 be planned, in tier order', () => {
    const plan = emptyPlan(first);
    expect(refusalOf(first, [], `${first}-a2`)).toBe('skill-tier-order');
    expect(pick(plan, `${first}-a2`).picks).toEqual([]);
    expect(pick(plan, `${first}-a1`, `${first}-a2`, `${first}-a3`).picks).toEqual([
      `${first}-a1`,
      `${first}-a2`,
      `${first}-a3`,
    ]);
  });

  it('closes the other branch of a tree at the first pick', () => {
    const plan = pick(emptyPlan(first), `${first}-a1`);
    expect(refusalOf(first, plan.picks, `${first}-b1`)).toBe('branch-closed');
    expect(pick(plan, `${first}-b1`)).toEqual(plan);
    const tree = treeOf(plan, first);
    expect(tree[1]?.closed).toBe(true);
    expect(tree[1]?.paths).toEqual(['closed', 'closed', 'closed']);
    expect(tree[0]?.paths).toEqual(['taken', 'open', 'open']);
    expect(tree[0]?.nodes.map((n) => n.state)).toEqual(['taken', 'available', 'plain']);
  });

  it('opens only tier 1 of the other roles', () => {
    const plan = emptyPlan(first);
    expect(pick(plan, `${second}-a1`).picks).toEqual([`${second}-a1`]);
    expect(refusalOf(first, [`${second}-a1`], `${second}-a2`)).toBe('skill-tier-limit');
    // The other branch of another role's tree closes too.
    expect(refusalOf(first, [`${second}-a1`], `${second}-b1`)).toBe('branch-closed');
  });

  it('removes a pick with the higher tiers that depended on it', () => {
    const plan = pick(emptyPlan(first), `${first}-a1`, `${first}-a2`, `${first}-a3`);
    expect(togglePick(plan, `${first}-a2`).picks).toEqual([`${first}-a1`]);
    expect(togglePick(plan, `${first}-a1`).picks).toEqual([]);
  });

  it('drops picks that no longer fit when your role changes', () => {
    const plan = pick(emptyPlan(first), `${first}-a1`, `${first}-a2`);
    const moved = withRole(plan, second);
    expect(moved.me).toBe(second);
    expect(moved.picks).toEqual([`${first}-a1`]);
    expect(validPicks(second, plan.picks)).toEqual([`${first}-a1`]);
    expect(withRole(plan, 'nobody')).toBe(plan);
  });

  it('is built from the content, whatever the roles are', () => {
    for (const role of roleIds()) {
      const tree = treeOf(emptyPlan(role), role);
      expect(tree.flatMap((b) => b.nodes.map((n) => n.node.id)).sort()).toEqual(
        SKILL_NODES.filter((n) => n.role === role)
          .map((n) => n.id)
          .sort(),
      );
    }
  });
});

describe('the cost', () => {
  it('is picks, XP at xpPerPick and days at the one assumption', () => {
    const plan = pick(emptyPlan(first), `${first}-a1`, `${first}-a2`, `${first}-a3`);
    expect(costOf(plan)).toEqual({
      picks: 3,
      xp: 3 * XP_PER_PICK,
      days: Math.ceil((3 * XP_PER_PICK) / WIKI_XP_PER_DAY),
    });
    expect(costOf(plan, 5).days).toBe(Math.ceil((3 * XP_PER_PICK) / 5));
    expect(costOf(emptyPlan())).toEqual({ picks: 0, xp: 0, days: 0 });
  });
});

describe('the URL hash', () => {
  it('round-trips a plan', () => {
    const plan: Plan = {
      me: second,
      picks: [`${first}-a1`, `${second}-b1`, `${second}-b2`],
    };
    const hash = formatHash(plan);
    expect(hash).toBe(`#me=${second};${first}:a1;${second}:b1,b2`);
    expect(parseHash(hash)).toEqual({
      me: second,
      picks: [`${first}-a1`, `${second}-b1`, `${second}-b2`],
    });
  });

  it('writes nothing for an empty plan and reads an empty hash as one', () => {
    expect(formatHash(emptyPlan())).toBe('');
    expect(parseHash('')).toEqual(emptyPlan());
    expect(parseHash('#')).toEqual(emptyPlan());
  });

  it('reads the example form without a role', () => {
    expect(parseHash(`#${first}:a1,a2;${second}:a1`)).toEqual({
      me: first,
      picks: [`${first}-a1`, `${first}-a2`, `${second}-a1`],
    });
  });

  it('refuses anything unknown, repeated, out of order or against the rules', () => {
    const bad = [
      `#nobody:a1`,
      `#${first}:a4`,
      `#${first}:c1`,
      `#${first}:a1,a1`,
      `#${first}:a1;${first}:a2`,
      `#${first}:a2`,
      `#${first}:a1,b1`,
      `#${first}:a1:a2`,
      `#${first}`,
      `#${first}:`,
      `#${second}:a1,a2`,
      `#${first}:a1;me=${second}`,
      `#me=nobody`,
      `#me=${first};me=${second}`,
      `#${first}:a1;;`,
      `#<script>`,
      `#${first}:a1,a2,a3,${'a1,'.repeat(200)}`,
    ];
    for (const hash of bad) expect(parseHash(hash), hash).toBeNull();
  });
});
