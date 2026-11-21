/**
 * Review sheets for the second art review round: features rising from sandstone plinths, the shared danger
 * cue on traps (live and harmless) next to nodes and sites, and the creature's ring of trodden ground with
 * the defended mark, next to the darker unexplored veil.
 */
import { GENTLE_AMBLER } from './creature.ts';
import { SPRING } from './palette.ts';
import { DIRECTIONS, isometric } from './projection.ts';
import { renderScene } from './scene.ts';
import { toSvgString } from './svg.ts';
import type { ArtCell } from './tile.ts';
import type { ReviewDraft } from './review.ts';

/** Nodes and sites (calm), live traps (danger cue) and defused traps (muted cue), one row each. */
function dangerSheet(): string {
  const rows: [string, string, 'ready' | 'depleted' | 'spent'][][] = [
    [
      ['ore', 'desert', 'ready'],
      ['logs', 'forest', 'ready'],
      ['berries', 'plains', 'ready'],
      ['tomb', 'plains', 'ready'],
      ['deep-tomb', 'plains', 'ready'],
    ],
    [
      ['snare', 'plains', 'ready'],
      ['pitfall', 'plains', 'ready'],
      ['undertow', 'lake', 'ready'],
    ],
    [
      ['snare', 'plains', 'spent'],
      ['pitfall', 'plains', 'spent'],
      ['undertow', 'lake', 'spent'],
    ],
  ];
  const cells: ArtCell[] = rows.flatMap((row, r) =>
    row.map(([look, terrain, state], col) => ({
      q: 2 * col,
      r: -col + 2 * r,
      terrain,
      feature: { look, state },
    })),
  );
  return toSvgString(
    renderScene({ cells, projection: isometric(56), palette: SPRING, seed: 'round2-danger' }),
  );
}

/** The creature on cliffs and a river, two guardians defending, with explored, unexplored and fading ground. */
function telegraphSheet(): string {
  const cells: ArtCell[] = [];
  for (let q = -4; q <= 4; q += 1) {
    for (let r = -4; r <= 4; r += 1) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (d > 4) continue;
      const near = DIRECTIONS.some((n) => n.q === q && n.r === r);
      const terrain = near && q + r !== 0 ? (r > 0 ? 'cliff' : 'river') : 'plains';
      cells.push({ q, r, terrain, ...(d > 2 && q > 0 ? { state: 'unexplored' as const } : {}) });
    }
  }
  return toSvgString(
    renderScene({
      cells,
      creature: { q: 0, r: 0, heading: DIRECTIONS[0]!, look: GENTLE_AMBLER, defenders: 2 },
      projection: isometric(58),
      palette: SPRING,
      seed: 'round2-telegraph',
    }),
  );
}

export function round2ReviewItems(): ReviewDraft[] {
  return [
    {
      id: 'features/danger',
      group: 'Features',
      title:
        'Features on raised plinths: finds and sites calm, live traps with the coral danger cue, defused traps muted',
      file: 'features-danger.svg',
      kind: 'glance',
      svg: dangerSheet(),
    },
    {
      id: 'map/telegraph',
      group: 'Creature care',
      title:
        'Trodden ground that keeps cliffs and river readable, the defended ring and shields, the darker unexplored veil',
      file: 'map-telegraph.svg',
      kind: 'glance',
      svg: telegraphSheet(),
    },
  ];
}
