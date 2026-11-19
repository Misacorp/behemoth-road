import { GENTLE_AMBLER } from '../src/creature.ts';
import { hexDistance } from '../src/projection.ts';
import { TERRAIN_LOOKS } from '../src/terrain.ts';
import type { ArtCell } from '../src/tile.ts';
import type { SceneInput } from '../src/scene.ts';
import { isometric } from '../src/projection.ts';
import { MIST } from '../src/palette.ts';

/** A 91-hex window (radius 5) cycling through every terrain, with the creature and one character. */
export function bigScene(): SceneInput {
  const ids = Object.keys(TERRAIN_LOOKS);
  const cells: ArtCell[] = [];
  for (let q = -5; q <= 5; q += 1) {
    for (let r = -5; r <= 5; r += 1) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) > 5) continue;
      cells.push({ q, r, terrain: ids[(q * 7 + r * 3 + 70) % ids.length]! });
    }
  }
  return {
    cells,
    creature: { q: 0, r: 0, heading: { q: 0, r: -1 }, look: GENTLE_AMBLER },
    characters: [{ id: 'a', q: 2, r: 0, accent: 'teal' }],
    projection: isometric(),
    palette: MIST,
    seed: 'budget',
  };
}
