/**
 * The appetite badge for the hub bubble's creature entry: a tiny creature head on a disc. Calm: a round head
 * with closed eyes. Underfed: a narrow, grey head with hollow cheeks and drooping ears on a cool disc.
 * Overfed: a wide head with heavy lids and a doze bubble on a warm disc. A keeper's badge is sharp and shows
 * the level as one to three dots under the head; the faint badge others see is paler and has no dots.
 * A self-contained `<svg>` on a 24-unit grid.
 */
import { ellipsePath, poly, smoothOpen, type Point } from './geom.ts';
import type { CreatureAppetite } from './creature.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

const P = (x: number, y: number): Point => ({ x, y });

export function drawAppetiteBadge(
  palette: Palette,
  size: number,
  appetite: CreatureAppetite | null,
): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 20;
  const kind =
    appetite && (appetite.kind === 'underfed' || appetite.kind === 'overfed')
      ? appetite.kind
      : null;
  const faint = appetite?.faint === true;
  const level =
    appetite && Number.isFinite(appetite.level)
      ? Math.min(3, Math.max(1, Math.round(appetite.level)))
      : 1;
  const inkC = faint ? palette.inkSoft : palette.ink;
  const tint =
    kind === 'underfed' ? palette.accents.slate : kind === 'overfed' ? palette.accents.ochre : null;
  const line = (d: string, width: number, colour = inkC): SvgNode =>
    el('path', {
      d,
      fill: 'none',
      stroke: colour,
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
  const hide = palette.ramps.hide;
  const nodes: SvgNode[] = [
    el('path', {
      d: ellipsePath(12, 12, 11, 11),
      fill: tint && !faint ? tint.light : palette.paper,
      stroke: tint ? (faint ? tint.base : tint.shade) : inkC,
      'stroke-width': faint ? 1 : 1.4,
    }),
  ];
  // Head shape by kind: narrow and long, wide and flat, or round.
  const [rx, ry, cy] =
    kind === 'underfed' ? [4.3, 5.6, 11.6] : kind === 'overfed' ? [7.6, 5, 12.4] : [6, 5.2, 12];
  // Ears: pricked when calm or overfed, drooping when underfed.
  const ears =
    kind === 'underfed'
      ? [
          [P(12 - rx + 0.6, cy - 2.6), P(12 - rx - 2.4, cy + 1.6), P(12 - rx + 0.8, cy - 0.4)],
          [P(12 + rx - 0.6, cy - 2.6), P(12 + rx + 2.4, cy + 1.6), P(12 + rx - 0.8, cy - 0.4)],
        ]
      : [
          [
            P(12 - rx * 0.55, cy - ry + 1.2),
            P(12 - rx * 0.9, cy - ry - 2.4),
            P(12 - rx * 0.15, cy - ry + 0.4),
          ],
          [
            P(12 + rx * 0.55, cy - ry + 1.2),
            P(12 + rx * 0.9, cy - ry - 2.4),
            P(12 + rx * 0.15, cy - ry + 0.4),
          ],
        ];
  for (const ear of ears)
    nodes.push(
      el('path', {
        d: poly(ear),
        fill: hide.shade,
        stroke: inkC,
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
      }),
    );
  nodes.push(
    el('path', {
      d: ellipsePath(12, cy, rx, ry),
      fill: hide.base,
      stroke: inkC,
      'stroke-width': 1.1,
    }),
  );
  if (kind === 'underfed')
    nodes.push(
      el('path', {
        d: ellipsePath(12, cy, rx, ry),
        fill: palette.accents.slate.base,
        opacity: faint ? 0.35 : 0.55,
      }),
    );
  // Muzzle.
  nodes.push(
    el('path', {
      d: ellipsePath(12, cy + ry * 0.45, rx * 0.55, ry * 0.36),
      fill: palette.belly,
      stroke: inkC,
      'stroke-width': 0.8,
    }),
  );
  // Eyes.
  const ex = rx * 0.48;
  const ey = cy - ry * 0.18;
  if (kind === 'overfed') {
    for (const side of [-1, 1])
      nodes.push(
        el('path', {
          d: `M${12 + side * ex - 1.6} ${ey}A1.6 1.3 0 0 1 ${12 + side * ex + 1.6} ${ey}Z`,
          fill: hide.shade,
          stroke: inkC,
          'stroke-width': 0.8,
        }),
      );
  } else {
    const drop = kind === 'underfed' ? -0.8 : 0.8;
    nodes.push(
      line(
        [-1, 1]
          .map((side) =>
            smoothOpen([
              P(12 + side * ex - 1.2, ey),
              P(12 + side * ex, ey + drop),
              P(12 + side * ex + 1.2, ey),
            ]),
          )
          .join(''),
        0.9,
      ),
    );
  }
  if (!faint) {
    if (kind === 'underfed')
      // Hollow cheeks.
      nodes.push(
        line(
          `M${12 - rx + 1.1} ${cy + 0.4}l0.6 2.2M${12 + rx - 1.1} ${cy + 0.4}l-0.6 2.2`,
          0.8,
          palette.inkSoft,
        ),
      );
    if (kind === 'overfed')
      nodes.push(
        el('path', {
          d: ellipsePath(19.2, 4.8, 1.8, 1.8),
          fill: palette.paper,
          stroke: inkC,
          'stroke-width': 0.8,
        }),
      );
    // The keeper's level: one to three dots under the head.
    if (kind && tint)
      nodes.push(
        el('path', {
          d: Array.from({ length: level }, (_, i) =>
            ellipsePath(12 + (i - (level - 1) / 2) * 3.2, 20.2, 1.1, 1.1),
          ).join(''),
          fill: tint.shade,
          'data-level': level,
        }),
      );
  }
  return el('svg', { viewBox: '0 0 24 24', width: px, height: px }, nodes);
}
