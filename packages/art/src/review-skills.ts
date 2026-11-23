/**
 * Review sheets for the skill trees: all five trees (emblem root, two branches of three nodes, the first
 * tree shown mid-pick) and the states, notch rings and branch paths.
 */
import { drawIcon } from './icons.ts';
import { drawNotchRing } from './notch-ring.ts';
import { SPRING, type Palette } from './palette.ts';
import {
  drawBranchPath,
  drawSkillNode,
  SKILL_ROLES,
  SKILL_STATES,
  type BranchPathState,
  type SkillRole,
  type SkillState,
} from './skills.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ReviewDraft } from './review.ts';

const put = (node: SvgNode, x: number, y: number): SvgNode => ({
  ...node,
  attrs: { ...node.attrs, x, y },
});

/** One tree: the emblem on top, branch a down the left, branch b down the right. `mid` shows a pick made. */
function tree(pal: Palette, role: SkillRole, x: number, y: number, mid: boolean): SvgNode[] {
  const out: SvgNode[] = [put(drawIcon(`role:${role}`, pal, 48), x + 32, y)];
  for (const [bi, branch] of (['a', 'b'] as const).entries()) {
    const bx = x + bi * 64;
    const closed = mid && branch === 'b';
    const taken = mid && branch === 'a';
    out.push(
      put(drawBranchPath(pal, closed ? 'closed' : taken ? 'taken' : 'open', 48), bx, y + 48),
    );
    for (const tier of [1, 2, 3]) {
      const ny = y + 80 + (tier - 1) * 78;
      let state: SkillState = tier === 1 ? 'plain' : 'veiled';
      if (closed) state = 'closed';
      else if (taken) state = tier === 1 ? 'taken' : tier === 2 ? 'available' : 'veiled';
      out.push(put(drawSkillNode(pal, `skill:${role}-${branch}${tier}`, 48, state), bx, ny));
      if (tier < 3) {
        const path: BranchPathState = closed ? 'closed' : taken && tier === 1 ? 'taken' : 'open';
        out.push(put(drawBranchPath(pal, path, 48), bx, ny + 48));
      }
    }
  }
  return out;
}

function treesSheet(): string {
  const pal = SPRING;
  const colW = 140;
  const trees = SKILL_ROLES.flatMap((role, i) => tree(pal, role, 12 + i * colW, 10, i === 0));
  // Every node finished (no state), under the trees.
  const plain = SKILL_ROLES.flatMap((role, i) =>
    (['a', 'b'] as const).flatMap((branch, bi) =>
      [1, 2, 3].map((tier) =>
        put(
          drawSkillNode(pal, `skill:${role}-${branch}${tier}`, 48),
          12 + i * colW + bi * 64,
          360 + (tier - 1) * 56,
        ),
      ),
    ),
  );
  const w = 24 + SKILL_ROLES.length * colW;
  return toSvgString(
    el('svg', { viewBox: `0 0 ${w} 540`, width: w, height: 540 }, [
      el('rect', { x: 0, y: 0, width: w, height: 540, fill: pal.paper }),
      ...trees,
      ...plain,
    ]),
  );
}

function statesSheet(): string {
  const pal = SPRING;
  const items: SvgNode[] = [];
  SKILL_STATES.forEach((state, i) => {
    items.push(put(drawSkillNode(pal, 'skill:warden-a1', 64, state), 12 + i * 80, 10));
    items.push(put(drawSkillNode(pal, 'skill:keeper-a2', 64, state), 12 + i * 80, 84));
  });
  (['open', 'taken', 'closed'] as const).forEach((state, i) =>
    items.push(put(drawBranchPath(pal, state, 64), 424 + i * 70, 20)),
  );
  [0, 3, 6, 9, 10].forEach((n, i) =>
    items.push(put(drawNotchRing(pal, 'scout', n, 10, 72), 12 + i * 84, 168)),
  );
  [0, 2, 4].forEach((n, i) =>
    items.push(put(drawNotchRing(pal, 'warden', n, 4, 72), 12 + i * 84, 250)),
  );
  return toSvgString(
    el('svg', { viewBox: '0 0 640 330', width: 640, height: 330 }, [
      el('rect', { x: 0, y: 0, width: 640, height: 330, fill: pal.paper }),
      ...items,
    ]),
  );
}

export function skillReviewItems(): ReviewDraft[] {
  return [
    {
      id: 'skills/trees',
      group: 'Skills',
      title:
        'The five skill trees: emblem root, two branches of three nodes (scout shown mid-pick: branch a taken, next available, last veiled, branch b closed and cut), then all 36 nodes finished',
      file: 'skills-trees.svg',
      kind: 'glance',
      svg: treesSheet(),
    },
    {
      id: 'skills/states',
      group: 'Skills',
      title:
        'Node looks (plain, veiled, available, taken, closed), branch paths (open, taken, closed) and the notch ring filling toward a pick, glowing when ready',
      file: 'skills-states.svg',
      kind: 'glance',
      svg: statesSheet(),
    },
  ];
}
