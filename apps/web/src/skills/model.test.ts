import { SKILL_IDS } from '@behemoth-road/art';
import { characterOf, DEFAULT_CONFIG, SKILL_NODES, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { chainScenario, USERS } from '../api/fixtures.ts';
import { WHY_BY_REFUSAL, whyOfPick } from '../game/why.ts';
import { TIP_TABLE, type TipId } from '../text/tips.ts';
import { nodeState, nodeTip, orderedTabs, pickReady, ringOf, tapNode, treeOf } from './model.ts';

const PER = DEFAULT_CONFIG.xpPerPick;

type Stage = NonNullable<Parameters<typeof chainScenario>[0]>;

function staged(stage: Stage) {
  const s = chainScenario(stage);
  const view = toPlayerView(s.state);
  const me = characterOf(s.state, USERS.MISA)!;
  return { view, me };
}

const nodeOf = (tree: ReturnType<typeof treeOf>, id: string) =>
  tree.flatMap((b) => b.nodes).find((n) => n.node.id === id)!;

describe('the tree model', () => {
  it('has two branches of three nodes, tiers 2 and 3 veiled', () => {
    const { view, me } = staged({ role: 'scout', xp: PER });
    const tree = treeOf(view, me, 'scout');
    expect(tree.map((b) => b.nodes.map((n) => n.node.id))).toEqual([
      ['scout-a1', 'scout-a2', 'scout-a3'],
      ['scout-b1', 'scout-b2', 'scout-b3'],
    ]);
    for (const b of tree) {
      expect(b.nodes.map((n) => n.state)).toEqual(['available', 'veiled', 'veiled']);
      expect(b.closed).toBe(false);
      expect(b.paths).toEqual(['open', 'open', 'open']);
    }
  });

  it('draws tier 1 plain without a pick (no-pick), keeping the refusal as the reason', () => {
    const { view, me } = staged({ role: 'scout' });
    const a1 = nodeOf(treeOf(view, me, 'scout'), 'scout-a1');
    expect(a1.state).toBe('plain');
    expect(a1.refusal).toBe('no-pick');
    expect(nodeTip(a1)).toBe('why:no-pick');
  });

  it('shows a taken node with its path inked, and closes the other branch with a cut path', () => {
    const { view, me } = staged({
      role: 'scout',
      xp: PER * 2,
      taken: ['scout-b1'],
    });
    const [a, b] = treeOf(view, me, 'scout');
    expect(b!.nodes[0]!.state).toBe('taken');
    expect(b!.paths).toEqual(['taken', 'open', 'open']);
    expect(b!.closed).toBe(false);
    expect(a!.closed).toBe(true);
    expect(a!.nodes[0]!.state).toBe('closed');
    expect(a!.nodes[0]!.refusal).toBe('branch-closed');
    expect(a!.paths).toEqual(['closed', 'closed', 'closed']);
    expect(nodeTip(a!.nodes[0]!)).toBe('why:branch-closed');
    expect(nodeTip(b!.nodes[0]!)).toBe('skill:scout-b1');
  });

  it('gives each refusal its own state and tip', () => {
    expect(nodeState(null)).toBe('available');
    expect(nodeState('already-have')).toBe('taken');
    expect(nodeState('branch-closed')).toBe('closed');
    expect(nodeState('skill-veiled')).toBe('veiled');
    for (const r of ['no-pick', 'skill-tier-order', 'skill-tier-limit', 'unknown-skill'] as const)
      expect(nodeState(r)).toBe('plain');
    const { view, me } = staged({ role: 'scout', xp: PER });
    expect(nodeTip(nodeOf(treeOf(view, me, 'scout'), 'scout-a2'))).toBe('why:veiled');
  });

  it('shows another role as tier 1 only, open to any pick (XP is one pool)', () => {
    const none = staged({ role: 'scout' });
    const locked = treeOf(none.view, none.me, 'warden', true);
    expect(locked.map((b) => b.nodes.length)).toEqual([1, 1]);
    expect(locked[0]!.nodes[0]!.state).toBe('plain');
    const earned = staged({ role: 'scout', xp: PER });
    const tree = treeOf(earned.view, earned.me, 'warden', true);
    expect(tree.map((b) => b.nodes[0]!.state)).toEqual(['available', 'available']);
  });

  it('has a tab per role, your own first, ready when a node of it can be bought', () => {
    const { view, me } = staged({ role: 'keeper', xp: PER });
    const tabs = orderedTabs(view, me);
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toMatchObject({ role: 'keeper', mine: true });
    // One pool: every tree has a tier 1 you can buy.
    expect(tabs.every((t) => t.ready)).toBe(true);
    expect(pickReady(view, me)).toBe(true);
    const idle = staged({ role: 'keeper' });
    expect(pickReady(idle.view, idle.me)).toBe(false);
  });

  it('fills the ring toward the next pick, and fully only when a pick can be spent', () => {
    const per = staged({ role: 'scout' }).view.config.xpPerPick;
    const some = staged({ role: 'scout', xp: 2 });
    expect(ringOf(some.view, some.me)).toEqual({ notches: 2, perPick: per });
    const full = staged({ role: 'scout', xp: per });
    expect(ringOf(full.view, full.me).notches).toBe(per);
    // One pick taken: the ring counts on from there.
    const after = staged({ role: 'scout', xp: per + 1, taken: ['scout-a1'] });
    expect(ringOf(after.view, after.me).notches).toBe(1);
    // A pick earned with nothing open to spend it on leaves the ring one short (no false glow).
    const all = ['scout-a1', 'scholar-a1', 'keeper-a1', 'warden-a1', 'engineer-a1'];
    const stuck = staged({ role: 'scout', xp: per * 7, taken: all });
    expect(ringOf(stuck.view, stuck.me).notches).toBe(per - 1);
    expect(pickReady(stuck.view, stuck.me)).toBe(false);
  });
});

describe('arming a node', () => {
  const ready = () => {
    const { view, me } = staged({ role: 'scout', xp: PER });
    const tree = treeOf(view, me, 'scout');
    return {
      a1: nodeOf(tree, 'scout-a1'),
      b1: nodeOf(tree, 'scout-b1'),
      a2: nodeOf(tree, 'scout-a2'),
    };
  };

  it('arms on a tap, keeps the arming on a second tap and never sends', () => {
    const { a1 } = ready();
    const first = tapNode(null, a1);
    expect(first).toEqual({ armed: 'scout-a1' });
    expect(tapNode(first.armed, a1)).toEqual({ armed: 'scout-a1' });
  });

  it('moves the arming to another available node instead of sending', () => {
    const { b1 } = ready();
    expect(tapNode('scout-a1', b1)).toEqual({ armed: 'scout-b1' });
  });

  it('never arms a node that is not available', () => {
    const { a2 } = ready();
    expect(tapNode(null, a2)).toEqual({ armed: null });
    const { view, me } = staged({ role: 'scout' });
    const locked = nodeOf(treeOf(view, me, 'scout'), 'scout-a1');
    expect(tapNode(null, locked)).toEqual({ armed: null });
    expect(tapNode('scout-b1', locked)).toEqual({ armed: 'scout-b1' });
  });
});

describe('skill tips', () => {
  it('has a name and a line for every active node', () => {
    for (const n of SKILL_NODES.filter((x) => x.active)) {
      const tip = TIP_TABLE[`skill:${n.id}` as TipId];
      expect(tip, n.id).toBeDefined();
      expect(tip.title).toBe(n.name);
    }
  });

  it('has a one-line tip for every Warden node, tiers 2 and 3 included (the skills wiki lists them)', () => {
    for (const n of SKILL_NODES.filter((x) => x.role === 'warden')) {
      const tip = TIP_TABLE[`skill:${n.id}` as TipId];
      expect(tip, n.id).toBeDefined();
      expect(tip.title).toBe(n.name);
    }
  });

  it('never shows a veiled node its own tip in the drawer', () => {
    const { view, me } = staged({ role: 'warden', xp: PER });
    const tree = treeOf(view, me, 'warden');
    const veiled = SKILL_NODES.filter((x) => !x.active && x.role === 'warden');
    expect(veiled).toHaveLength(4);
    for (const n of veiled) {
      const shown = nodeOf(tree, n.id);
      expect(shown.state, n.id).toBe('veiled');
      expect(nodeTip(shown), n.id).not.toBe(`skill:${n.id}`);
    }
  });

  it('maps each skill refusal to a written reason', () => {
    for (const r of [
      'unknown-skill',
      'skill-veiled',
      'already-have',
      'no-pick',
      'branch-closed',
      'skill-tier-order',
      'skill-tier-limit',
    ] as const) {
      expect(TIP_TABLE[whyOfPick(r)], r).toBeDefined();
    }
    expect(whyOfPick('already-have')).toBe('why:taken');
    expect(WHY_BY_REFUSAL['skill-tier-limit']).toBe('why:tier-limit');
    expect(WHY_BY_REFUSAL['no-pick']).toBe('why:no-pick');
    // Only an unknown node keeps the generic reason.
    const generic = Object.entries(WHY_BY_REFUSAL).filter(
      ([k, v]) => v === 'why:other' && k.includes('skill'),
    );
    expect(generic.map(([k]) => k)).toEqual(['unknown-skill']);
  });
});

describe('node art', () => {
  it('has a drawing for every node icon the content names (none falls back to the veiled blank)', () => {
    for (const n of SKILL_NODES) {
      expect(SKILL_IDS, n.id).toContain(n.icon);
    }
  });
});
