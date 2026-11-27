import { describe, expect, it } from 'vitest';
import { entityDepth, ENTITY_FRONT, type EntityKind } from '../src/depth.ts';
import { FEATURE_DRAWERS } from '../src/features.ts';
import { TALL_DRAWERS } from '../src/features-tall.ts';
import { figureAnchor } from '../src/figure.ts';
import { MORNING } from '../src/palette.ts';
import { hexCenter, isometric, onPlane, topDown } from '../src/projection.ts';
import { renderSceneFramed, type SceneExtra } from '../src/scene.ts';
import { walk } from '../src/svg.ts';

const KINDS: readonly EntityKind[] = ['character', 'threat', 'lure', 'cart'];
const TALL = Object.keys(TALL_DRAWERS);
const HEX = { q: 1, r: 2 };

/** Where each kind of entity stands on its hex, as the scene and the map place them (hex-size offsets). */
const feetOf = (kind: EntityKind, slot: number, p = isometric()) => {
  const c = hexCenter(p, HEX.q, HEX.r);
  if (kind === 'character') return figureAnchor(p, HEX, slot, { tall: true });
  if (kind === 'threat') return onPlane(p, c, 0, 0.1);
  if (kind === 'lure') return { x: c.x, y: c.y + 0.12 * p.size };
  return onPlane(p, c, -0.1 * (p.size / (p.size * p.squash)), 0.1);
};

describe('entity depth on a hex', () => {
  for (const p of [isometric(), topDown()]) {
    for (const look of TALL) {
      for (const kind of KINDS) {
        it(`draws a ${kind} in front of a ${look} and every prop spot on its hex (${String(p.squash)})`, () => {
          expect(look in FEATURE_DRAWERS).toBe(true);
          const c = hexCenter(p, HEX.q, HEX.r);
          // Features stand at 0.08 of the hex deep; props reach 0.5 across, 0.85 of that deep.
          const featureY = onPlane(p, c, 0, 0.08).y;
          const propFront = onPlane(p, c, 0, 0.5 * 0.85).y;
          for (let slot = 0; slot < 8; slot += 1) {
            const feet = feetOf(kind, slot, p);
            expect(entityDepth(p, HEX, feet)).toBeGreaterThan(featureY);
            expect(entityDepth(p, HEX, feet)).toBeGreaterThan(propFront);
          }
        });
      }
    }
  }

  it('keeps depth across hexes: a figure on a hex behind sits behind a tree on the hex in front', () => {
    const p = isometric();
    const behind = { q: 1, r: 2 };
    const front = { q: 1, r: 3 };
    for (const kind of KINDS) {
      const figure = entityDepth(p, behind, feetOf(kind, 0, p));
      const cf = hexCenter(p, front.q, front.r);
      const tree = onPlane(p, cf, 0, 0.08).y;
      expect(figure).toBeLessThan(tree);
    }
  });

  it('keeps figures on one hex in their natural order', () => {
    const p = isometric();
    const slots = [0, 1, 2, 3].map((s) => entityDepth(p, HEX, figureAnchor(p, HEX, s)));
    expect(new Set(slots).size).toBe(4);
    expect(ENTITY_FRONT).toBeGreaterThan(0.425);
  });

  it('stands a figure to the front left of a tall feature, clear of its base', () => {
    const p = isometric();
    const plain = figureAnchor(p, HEX, 0);
    const tall = figureAnchor(p, HEX, 0, { tall: true });
    expect(tall.x).toBeLessThan(plain.x);
    expect(tall.y).toBeGreaterThan(plain.y);
    expect(figureAnchor(p, HEX, 0, { tall: true, site: true })).toEqual(
      figureAnchor(p, HEX, 0, { site: true }),
    );
  });
});

describe('scene extras in the depth order', () => {
  const p = isometric();
  const draw = (kind: SceneExtra['kind'], hex: { q: number; r: number }, at: SceneExtra['at']) =>
    ({
      kind,
      hex,
      at,
      drawn: {
        nodes: [{ tag: 'circle', attrs: { r: 1 }, children: [] }],
        box: { x0: at.x - 5, y0: at.y - 5, x1: at.x + 5, y1: at.y + 5 },
      },
    }) satisfies SceneExtra;
  const order = (extras: readonly SceneExtra[]): string[] => {
    const { svg } = renderSceneFramed({
      cells: [{ q: 1, r: 2, terrain: 'plain' }],
      characters: [],
      projection: p,
      palette: MORNING,
      seed: 'x',
      extras,
    });
    const out: string[] = [];
    walk(svg, (n) => {
      if (typeof n.attrs['data-entity'] === 'string') out.push(n.attrs['data-entity']);
    });
    return out;
  };

  it('draws the capybara and the cart after a standing stone on the same hex, whatever their feet', () => {
    const c = hexCenter(p, HEX.q, HEX.r);
    // The stone is set in front of the animal's feet; the animal still draws over it.
    const stone = draw('stone', HEX, onPlane(p, c, 0.3, 0.4));
    const lure = draw('lure', HEX, onPlane(p, c, 0, 0.12));
    const cart = draw('cart', HEX, onPlane(p, c, -0.1, 0.1));
    expect(order([lure, cart, stone])).toEqual(['stone', 'cart', 'lure']);
  });

  it('keeps a stone on a hex in front over an animal on a hex behind', () => {
    const behind = hexCenter(p, 1, 2);
    const front = hexCenter(p, 1, 4);
    const lure = draw('lure', { q: 1, r: 2 }, onPlane(p, behind, 0, 0.12));
    const stone = draw('stone', { q: 1, r: 4 }, onPlane(p, front, 0, 0.1));
    expect(order([stone, lure])).toEqual(['lure', 'stone']);
  });
});
