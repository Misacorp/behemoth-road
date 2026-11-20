/**
 * Review sheets for the playtest feedback marks (`feedback-marks.ts`): features on their plinths beside
 * plain props at phone zoom, and the small marks and moments on their own.
 */
import { ART_TUNING } from './config.ts';
import { ACTION_MOTIFS, drawIcon, ROLE_IDS } from './icons.ts';
import {
  drawEmptyMark,
  drawMisledMark,
  drawOutOfReachMark,
  drawRoleBadge,
  FEEDBACK_MOMENT_KINDS,
} from './feedback-marks.ts';
import { drawMoment } from './marks.ts';
import { SPRING } from './palette.ts';
import { hexCenter, isometric } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { renderSceneFramed } from './scene.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ArtCell } from './tile.ts';

const PALETTE = SPRING;

function paperSheet(width: number, height: number, children: SvgNode[]): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      ...children,
    ]),
  );
}

function placed(icon: SvgNode, x: number, y: number): SvgNode {
  return el('svg', { ...icon.attrs, x, y }, icon.children);
}

/**
 * A patch of plains, rocks, desert and forest with their props, and features on some tiles: the new
 * open-ground nodes, the older nodes, a trap, a used-up node and a village. Two explored empty hexes carry
 * the explored-empty mark.
 */
function featureCells(): { cells: ArtCell[]; empty: { q: number; r: number }[] } {
  const terrains = ['plains', 'rocks', 'plains', 'desert', 'forest', 'plains'];
  const features: Record<string, ArtCell['feature']> = {
    '0,0': { look: 'fieldstones' },
    '2,-1': { look: 'outcrop' },
    '4,-2': { look: 'deadfall' },
    '1,1': { look: 'stones' },
    '3,0': { look: 'ore' },
    '5,-1': { look: 'berries', state: 'depleted' },
    '0,2': { look: 'snare' },
    '4,1': { look: 'logs' },
  };
  const empty = [
    { q: 2, r: 1 },
    { q: 1, r: 2 },
  ];
  const cells: ArtCell[] = [];
  for (let r = -1; r <= 3; r += 1) {
    for (let q = -1; q <= 6; q += 1) {
      const terrain = terrains[(q + 2 * r + 12) % terrains.length]!;
      const key = `${q},${r}`;
      const feature = features[key];
      cells.push({
        q,
        r,
        terrain,
        ...(feature ? { feature } : {}),
        ...(key === '3,2' ? { settlement: { look: 'hill-folk', attitude: 'wary' as const } } : {}),
      });
    }
  }
  return { cells, empty };
}

/** The patch as a phone shows it (zoom ≈ 0.58), full effects and lite side by side. */
function phoneFeatures(): string {
  const p = isometric();
  const zoom = 390 / (2 * 3.5 * 1.5 * ART_TUNING.hexSize);
  const { cells, empty } = featureCells();
  const views = (['full', 'lite'] as const).map((effects, i) => {
    const scene = renderSceneFramed({
      cells,
      projection: p,
      palette: PALETTE,
      seed: 'feedback-phone',
      effects,
      frame: 'none',
      zoom,
    });
    const marks = empty.map((h) => {
      const c = hexCenter(p, h.q, h.r);
      const size = p.size * 0.7;
      return placed(drawEmptyMark(PALETTE, size), c.x - size / 2, c.y - size / 2);
    });
    const centre = hexCenter(p, 2.5, 0.8);
    const w = 380 / zoom;
    const h = 420 / zoom;
    const x = 16 + i * 396;
    return [
      el('rect', { x, y: 16, width: 380, height: 420, fill: PALETTE.paper }),
      el(
        'svg',
        {
          viewBox: `${centre.x - w / 2} ${centre.y - h / 2} ${w} ${h}`,
          x,
          y: 16,
          width: 380,
          height: 420,
        },
        [...scene.svg.children, ...marks],
      ),
    ];
  });
  return paperSheet(808, 452, views.flat());
}

/** A greyed action button with the role badge of the role it needs in its corner. */
function greyedButton(action: string, role: string, x: number, y: number): SvgNode[] {
  const icon = drawIcon(action, PALETTE, 40);
  return [
    el('rect', {
      x,
      y,
      width: 64,
      height: 64,
      rx: 14,
      fill: PALETTE.ramps.stone.light,
      stroke: PALETTE.inkSoft,
      'stroke-width': 1.4,
    }),
    el('g', { opacity: 0.4 }, [placed(icon, x + 12, y + 12)]),
    placed(drawRoleBadge(role, PALETTE, 26), x + 44, y - 6),
  ];
}

/** The small marks: explored-empty fading, out of reach at three angles, misled, role badges; the moments. */
function marksSheet(): string {
  const nodes: SvgNode[] = [];
  [0, 0.4, 0.8].forEach((fade, i) => {
    nodes.push(placed(drawEmptyMark(PALETTE, 56, fade), 20 + i * 70, 20));
  });
  [0, -Math.PI / 3, Math.PI * 0.8].forEach((angle, i) => {
    nodes.push(placed(drawOutOfReachMark(PALETTE, 56, angle), 250 + i * 70, 20));
  });
  nodes.push(placed(drawMisledMark(PALETTE, 56), 480, 20));
  nodes.push(placed(drawMisledMark(PALETTE, 28), 550, 34));
  const actions = Object.keys(ACTION_MOTIFS);
  ROLE_IDS.forEach((role, i) => {
    nodes.push(...greyedButton(actions[i % actions.length]!, role, 24 + i * 100, 112));
  });
  ROLE_IDS.forEach((role, i) => {
    nodes.push(placed(drawRoleBadge(role, PALETTE, 20), 44 + i * 100, 196));
  });
  FEEDBACK_MOMENT_KINDS.forEach((kind, i) => {
    nodes.push(placed(drawMoment(kind, PALETTE, 110), 20 + i * 150, 236));
  });
  return paperSheet(640, 366, nodes);
}

export function feedbackReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const group = 'Playtest feedback';
  return [
    {
      id: 'feedback/phone-features',
      group,
      title:
        'At phone zoom: features on plinths (fieldstones, outcrop, deadfall, river stones, iron, picked berries, snare, logs, a village) beside plain props; two explored-empty hexes (full, then lite)',
      file: 'feedback-phone-features.svg',
      ...glance,
      svg: phoneFeatures(),
    },
    {
      id: 'feedback/marks',
      group,
      title:
        'Explored-empty fading; out of reach; misled; greyed actions with the role they need; nothing here, misled and peril relieved moments',
      file: 'feedback-marks.svg',
      ...glance,
      svg: marksSheet(),
    },
  ];
}
