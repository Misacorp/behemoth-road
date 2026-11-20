import { describe, expect, it } from 'vitest';
import {
  drawCreature,
  GENTLE_AMBLER,
  moodOf,
  riderAnchor,
  type CreatureMood,
} from '../src/creature.ts';
import { drawFire } from '../src/fire.ts';
import { featureDrawer } from '../src/features.ts';
import { ACTION_MOTIFS, drawIcon, hasIcon } from '../src/icons.ts';
import { drawStayMark } from '../src/marks.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { DIRECTIONS, isometric } from '../src/projection.ts';
import { rngFor } from '../src/rng.ts';
import { renderScene } from '../src/scene.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';

const allowed = paletteColours(SPRING);
const within = (node: SvgNode): void => {
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), v).toBe(true);
    }
  });
  expect(toSvgString(node)).not.toMatch(/NaN|undefined|Infinity/);
};
const EAST = { q: 1, r: 0 };
const creature = (mood: CreatureMood, heading = EAST) =>
  el(
    'g',
    {},
    drawCreature(SPRING, GENTLE_AMBLER, { x: 0, y: 0 }, 64, 0.8, 1.4, heading, 0, mood).nodes,
  );
const svg = (mood: CreatureMood, heading = EAST): string => toSvgString(creature(mood, heading));
const count = (node: SvgNode, attr: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[attr] === value) n += 1;
  });
  return n;
};
/** Number of subpaths (`M` commands) in the path carrying `attr=value`. */
const marks = (node: SvgNode, attr: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[attr] === value) n += String(x.attrs.d).split('M').length - 1;
  });
  return n;
};

describe('appetite signs', () => {
  const calm = svg({});

  it('draws every kind, level and faint version within the palette, each different', () => {
    const seen = new Set([calm]);
    for (const kind of ['underfed', 'overfed'] as const)
      for (const level of [1, 2, 3] as const)
        for (const faint of [false, true]) {
          const mood = { appetite: { kind, level, faint } };
          within(creature(mood));
          const drawn = svg(mood);
          expect(seen.has(drawn), `${kind} ${level} ${faint}`).toBe(false);
          seen.add(drawn);
        }
  });

  it('counts the level in ribs when underfed and doze bubbles when overfed, never in text', () => {
    for (const level of [1, 2, 3] as const) {
      // Ribs show on the flank facing the viewer only.
      expect(marks(creature({ appetite: { kind: 'underfed', level } }), 'data-sign', 'ribs')).toBe(
        level,
      );
      expect(marks(creature({ appetite: { kind: 'overfed', level } }), 'data-sign', 'doze')).toBe(
        level,
      );
    }
    expect(svg({ appetite: { kind: 'overfed', level: 3 } })).not.toMatch(/<text/);
    expect(count(creature({ appetite: { kind: 'overfed', level: 2 } }), 'data-sign', 'ribs')).toBe(
      0,
    );
    expect(count(creature({ appetite: { kind: 'underfed', level: 2 } }), 'data-sign', 'doze')).toBe(
      0,
    );
  });

  it('droops when underfed and grows rounder when overfed', () => {
    const box = (mood: CreatureMood) =>
      drawCreature(SPRING, GENTLE_AMBLER, { x: 0, y: 0 }, 64, 0.8, 1.4, { q: 0, r: 1 }, 0, mood)
        .box;
    const base = box({});
    const thin = box({ appetite: { kind: 'underfed', level: 3 } });
    const fat = box({ appetite: { kind: 'overfed', level: 3 } });
    expect(fat.x1 - fat.x0).toBeGreaterThan(base.x1 - base.x0);
    expect(thin.x1 - thin.x0).toBeLessThan(base.x1 - base.x0);
  });

  it('treats a missing, null or unknown appetite as calm, and clamps a bad level', () => {
    expect(svg({ appetite: null })).toBe(calm);
    expect(svg({ appetite: { kind: 'peckish' as 'underfed', level: 2 } })).toBe(calm);
    expect(svg({ appetite: { kind: 'underfed', level: 9 as 3 } })).toBe(
      svg({ appetite: { kind: 'underfed', level: 3 } }),
    );
  });
});

describe('reaction cues', () => {
  const fire = { q: 2, r: 1 };

  it('draws a different mark for each reaction, on the fire side, within the palette', () => {
    const drawn = (['toward', 'away', 'unmoved'] as const).map((reaction) => {
      const node = creature({ cues: [{ reaction, offset: fire }] });
      within(node);
      expect(count(node, 'data-cue', reaction)).toBeGreaterThan(0);
      return toSvgString(node);
    });
    expect(new Set(drawn).size).toBe(3);
  });

  it('turns the head to a fire it is drawn to, and away from one it shies from', () => {
    const north = { q: 0, r: -1 };
    const headX = (mood: CreatureMood): number => {
      // The snout is the last belly-coloured fill: its x tells where the head points.
      let x = 0;
      walk(creature(mood, north), (n) => {
        if (n.attrs.fill === SPRING.belly) x = Number(/M(-?[\d.]+)/.exec(String(n.attrs.d))![1]);
      });
      return x;
    };
    const east = { q: 2, r: -1 };
    const still = headX({});
    expect(headX({ cues: [{ reaction: 'toward', offset: east }] })).toBeGreaterThan(still);
    expect(headX({ cues: [{ reaction: 'away', offset: east }] })).toBeLessThan(still);
    expect(headX({ cues: [{ reaction: 'unmoved', offset: east }] })).toBe(still);
  });

  it('ignores a cue on the creature centre, and maps hexes to offsets in a scene', () => {
    expect(svg({ cues: [{ reaction: 'toward', offset: { q: 0, r: 0 } }] })).toBe(svg({}));
    const mood = moodOf({
      q: 5,
      r: -2,
      heading: EAST,
      look: GENTLE_AMBLER,
      cues: [{ hex: { q: 7, r: -1 }, reaction: 'away' }],
    });
    expect(mood.cues).toEqual([{ reaction: 'away', offset: { q: 2, r: 1 } }]);
  });
});

describe('lying down', () => {
  it('draws a different, lower creature, and riders sit lower on its back', () => {
    for (const heading of DIRECTIONS) {
      const lying = creature({ pose: 'lying' }, heading);
      within(lying);
      expect(toSvgString(lying)).not.toBe(svg({}, heading));
      const stand = riderAnchor(GENTLE_AMBLER, heading, 0, { x: 0, y: 0 }, 64, 0.8);
      const low = riderAnchor(GENTLE_AMBLER, heading, 0, { x: 0, y: 0 }, 64, 0.8, {
        pose: 'lying',
      });
      expect(low.y).toBeGreaterThan(stand.y);
    }
  });
});

describe('fires and berries', () => {
  const ctx = {
    palette: SPRING,
    rng: rngFor('f'),
    origin: { x: 0, y: 0 },
    k: 1,
    squash: 0.8,
    ink: 1.4,
    rise: 0.875,
  };

  it('draws a fire with a flame and smoke the map can animate', () => {
    const node = el('g', {}, drawFire(ctx).nodes);
    within(node);
    for (const part of ['glow', 'flame', 'smoke'])
      expect(count(node, 'data-fire', part)).toBeGreaterThan(0);
  });

  it('draws a fire on its hex in a scene, also under the veil, replacing the terrain props', () => {
    const scene = (cell: object) =>
      toSvgString(
        renderScene({
          cells: [{ q: 0, r: 0, terrain: 'forest', ...cell }],
          projection: isometric(),
          palette: SPRING,
          seed: 'fire',
        }),
      );
    for (const state of ['seen', 'unexplored', 'fading'] as const)
      expect(scene({ state, fire: true }), state).toMatch(/data-fire="flame"/);
    expect(scene({ state: 'unseen', fire: true })).not.toMatch(/data-fire/);
    expect(scene({})).not.toMatch(/data-fire/);
  });

  it('draws berry bushes, picked bare when depleted', () => {
    const ready = el('g', {}, featureDrawer('berries')(ctx, 'ready').nodes);
    const bare = el('g', {}, featureDrawer('berries')(ctx, 'depleted').nodes);
    within(ready);
    within(bare);
    expect(toSvgString(ready)).toContain(SPRING.accents.rose.base);
    expect(toSvgString(bare)).not.toContain(SPRING.accents.rose.base);
  });
});

describe('care icons and the stay hint', () => {
  it('draws forage and the three actions by key, each different, within the palette', () => {
    expect(Object.keys(ACTION_MOTIFS)).toEqual([
      'light-fire',
      'feed',
      'linger',
      'strike',
      'defend',
      'parley',
      'offer',
      'gift',
      'mislead',
      'shelter',
    ]);
    const drawn = ['forage', 'light-fire', 'feed', 'linger'].map((id) => {
      expect(hasIcon(id), id).toBe(true);
      const node = drawIcon(id, SPRING, 48);
      within(node);
      return toSvgString(node);
    });
    expect(new Set(drawn).size).toBe(4);
  });

  it('draws the stay hint as a self-contained svg', () => {
    const node = drawStayMark(SPRING, 32);
    within(node);
    expect(node.attrs.width).toBe(32);
    expect(drawStayMark(SPRING, Number.NaN).attrs.width).toBe(48);
  });
});
