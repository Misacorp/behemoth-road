/**
 * Review sheets for the second art review round: features rising tall from the ground, the shared danger
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

/** Every feature look, two settlements and fires on packed tiles, a character on some: tall, over their neighbours. */
function tallSheet(): string {
  const looks = [
    'ore',
    'logs',
    'tomb',
    'deep-tomb',
    'outcrop',
    'shrine',
    'berries',
    'stones',
    'fieldstones',
    'deadfall',
  ];
  const cells: ArtCell[] = looks.map((look, i) => ({
    q: (i % 5) * 2 - Math.floor(i / 5),
    r: Math.floor(i / 5) * 2 - (i % 5),
    terrain: look === 'logs' ? 'forest' : 'plains',
    feature: { look },
  }));
  cells.push(
    { q: 9, r: -2, terrain: 'plains', settlement: { look: 'hill-folk', attitude: 'wary' } },
    { q: 9, r: -4, terrain: 'plains', settlement: { look: 'river-folk', attitude: 'friendly' } },
    { q: 10, r: -2, terrain: 'plains', fire: true },
    { q: 8, r: 0, terrain: 'plains', feature: { look: 'snare' } },
  );
  const characters = [
    { id: 'a', q: 0, r: 0, accent: 'rose' },
    { id: 'b', q: 4, r: -2, accent: 'teal' },
    { id: 'c', q: 9, r: -2, accent: 'sage' },
  ];
  return toSvgString(
    renderScene({
      cells,
      characters,
      projection: isometric(42),
      palette: SPRING,
      seed: 'round3-tall',
    }),
  );
}

/** The creature on cliffs and a river, two wardens defending, with explored, unexplored and fading ground. */
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
        'Features drawn tall, rising above the tile with a ground shadow, no platform: finds and sites calm, live traps with the coral danger cue, defused traps muted',
      file: 'features-danger.svg',
      kind: 'glance',
      svg: dangerSheet(),
    },
    {
      id: 'features/tall',
      group: 'Features',
      title:
        'Tall features that rise above their tiles, no platform: iron, timber, tombs, outcrop, shrine, berries, stones, fieldstones, deadfall, villages, a fire and a snare, with characters standing in front',
      file: 'features-tall.svg',
      kind: 'glance',
      svg: tallSheet(),
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
