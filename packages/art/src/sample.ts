/**
 * The 37-hex sample patch used by the style review: the creature heading north in the middle, unseen paper
 * ahead, fading tiles behind, forest to the west, desert, cliff and hills to the east, a river, a ruin
 * with a character beside it, and one hint mark.
 */
import type { CharacterArt } from './character.ts';
import { GENTLE_AMBLER, type CreatureArt } from './creature.ts';
import { hexDistance } from './projection.ts';
import type { ArtCell } from './tile.ts';

const RIVER = new Set(['1,-3', '0,-2', '-1,-1', '-2,0', '-3,1', '-3,2']);

const EXPLICIT: Readonly<Record<string, Partial<ArtCell>>> = {
  '-2,-1': { terrain: 'forest' },
  '-3,0': { terrain: 'pines' },
  '-2,1': { terrain: 'forest' },
  '-2,2': { terrain: 'forest' },
  '-3,3': { terrain: 'pines' },
  '-2,3': { terrain: 'forest' },
  '-1,2': { terrain: 'plains', hint: true },
  '2,-3': { terrain: 'desert' },
  '3,-3': { terrain: 'desert' },
  '2,-2': { terrain: 'desert' },
  '2,-1': { terrain: 'desert' },
  '3,-2': { terrain: 'cliff' },
  '3,-1': { terrain: 'rocks' },
  '2,0': { terrain: 'hills' },
  '3,0': { terrain: 'hills' },
  '1,-2': { terrain: 'plains' },
  '1,1': { terrain: 'plains', site: 'ruin' },
  '0,-3': { terrain: 'plains' },
  '-1,-2': { terrain: 'forest' },
};

export function samplePatch(heading: { q: number; r: number } = { q: 0, r: -1 }): {
  cells: ArtCell[];
  creature: CreatureArt;
  characters: CharacterArt[];
} {
  const cells: ArtCell[] = [];
  for (let q = -3; q <= 3; q += 1) {
    for (let r = -3; r <= 3; r += 1) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) > 3) continue;
      const key = `${q},${r}`;
      const row = r + q / 2;
      const state = row <= -2.5 ? 'unseen' : row >= 2.5 ? 'fading' : 'seen';
      const terrain = RIVER.has(key) ? 'river' : 'plains';
      cells.push({ q, r, terrain, state, ...EXPLICIT[key] });
    }
  }
  return {
    cells,
    creature: { q: 0, r: 0, heading, look: GENTLE_AMBLER },
    characters: [
      { id: 'sample-scout', q: 1, r: 1, accent: 'rose' },
      // Two riders on the creature's back.
      { id: 'sample-keeper', q: 0, r: 0, accent: 'teal' },
      { id: 'sample-envoy', q: 0, r: 1, accent: 'ochre' },
    ],
  };
}
