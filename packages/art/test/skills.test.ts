import { describe, expect, it } from 'vitest';
import { drawIcon, hasIcon, ROLE_IDS } from '../src/icons.ts';
import { drawNotchRing, drawPickGlow } from '../src/notch-ring.ts';
import { PALETTES, paletteColours, SPRING } from '../src/palette.ts';
import {
  drawBranchPath,
  drawSkillNode,
  SKILL_IDS,
  SKILL_MOTIFS,
  SKILL_STATES,
  skillRoleOf,
} from '../src/skills.ts';
import { ALLOWED_TAGS, isAllowedAttr, toSvgString, walk, type SvgNode } from '../src/svg.ts';

const colours = (node: SvgNode): string[] => {
  const out: string[] = [];
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url(')) out.push(v.toLowerCase());
    }
  });
  return out;
};

/** Whether every absolute coordinate pair in the (untransformed) path data lies within lo..hi. */
const inBox = (node: SvgNode, lo: number, hi: number): boolean => {
  let ok = true;
  walk(node, (n) => {
    if (typeof n.attrs.d !== 'string' || n.attrs.transform) return;
    const d = n.attrs.d;
    for (const m of d.matchAll(/[MLCQS]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (x < lo || x > hi || y < lo || y > hi) ok = false;
    }
  });
  return ok;
};

describe('skill node icons', () => {
  it('has the 36 ids, six roles by two branches by three tiers, and each draws', () => {
    expect(SKILL_IDS).toHaveLength(36);
    expect(new Set(SKILL_IDS).size).toBe(36);
    expect(Object.keys(SKILL_MOTIFS).sort()).toEqual([...SKILL_IDS].sort());
    for (const role of ROLE_IDS) {
      for (const branch of ['a', 'b']) {
        for (const tier of [1, 2, 3]) expect(SKILL_IDS).toContain(`skill:${role}-${branch}${tier}`);
      }
    }
    for (const id of SKILL_IDS) {
      expect(hasIcon(id)).toBe(true);
      expect(skillRoleOf(id)).not.toBeNull();
      expect(toSvgString(drawIcon(id, SPRING, 48))).not.toMatch(/NaN|undefined/);
    }
  });

  it('draws every node differently', () => {
    const svgs = SKILL_IDS.map((id) => toSvgString(drawIcon(id, SPRING, 48)));
    expect(new Set(svgs).size).toBe(36);
  });

  it('stays in the allowlist and the palette, in every state and palette', () => {
    for (const palette of PALETTES) {
      const allowed = paletteColours(palette);
      for (const id of SKILL_IDS) {
        for (const state of SKILL_STATES) {
          const node = drawSkillNode(palette, id, 48, state);
          walk(node, (n) => {
            expect(ALLOWED_TAGS.has(n.tag), n.tag).toBe(true);
            for (const name of Object.keys(n.attrs)) expect(isAllowedAttr(name), name).toBe(true);
          });
          for (const c of colours(node)) expect(allowed.has(c), `${id} ${state} ${c}`).toBe(true);
          expect(() => toSvgString(node)).not.toThrow();
        }
      }
    }
  });

  it('keeps node drawings inside the 48-unit tile', () => {
    for (const id of SKILL_IDS) {
      expect(inBox(drawSkillNode(SPRING, id, 48), 0, 48), id).toBe(true);
    }
  });

  it('gives each state its own look, and drawIcon passes the state on', () => {
    const id = 'skill:scout-a1';
    const looks = SKILL_STATES.map((s) => toSvgString(drawSkillNode(SPRING, id, 48, s)));
    expect(new Set(looks).size).toBe(SKILL_STATES.length);
    expect(toSvgString(drawIcon(id, SPRING, 48, { skill: 'taken' }))).toBe(
      toSvgString(drawSkillNode(SPRING, id, 48, 'taken')),
    );
    expect(looks[SKILL_STATES.indexOf('available')]).toContain('data-glow="ready"');
    expect(looks[SKILL_STATES.indexOf('veiled')]).toContain('pattern');
  });

  it('draws a veiled blank for an unknown id and a bad size, never an error', () => {
    const blank = drawSkillNode(SPRING, 'skill:nope-a1', Number.NaN, 'taken');
    expect(blank.attrs.width).toBe(48);
    expect(blank.attrs['data-skill-state']).toBe('veiled');
    expect(hasIcon('skill:scout-c1')).toBe(false);
    expect(skillRoleOf('skill:pathfinder-a1')).toBeNull();
  });

  it('draws the three branch path looks, each different', () => {
    const paths = (['open', 'taken', 'closed'] as const).map((s) =>
      toSvgString(drawBranchPath(SPRING, s, 48)),
    );
    expect(new Set(paths).size).toBe(3);
    expect(drawBranchPath(SPRING, 'open', 0).attrs.width).toBe(48);
    expect(drawBranchPath(SPRING, 'open', 30).attrs.height).toBe(20);
  });
});

describe('notch ring', () => {
  it('fills one notch per earned action, and glows once a pick is ready', () => {
    const count = (n: SvgNode, v: string): number => {
      let c = 0;
      walk(n, (x) => {
        if (x.attrs['data-notch'] === v) c += 1;
      });
      return c;
    };
    const part = drawNotchRing(SPRING, 'guardian', 4, 10);
    expect(count(part, 'earned')).toBe(4);
    expect(count(part, 'empty')).toBe(6);
    expect(part.attrs['data-ready']).toBe('no');
    expect(toSvgString(part)).not.toContain('data-glow');

    const ready = drawNotchRing(SPRING, 'guardian', 10, 10);
    expect(count(ready, 'earned')).toBe(10);
    expect(ready.attrs['data-ready']).toBe('yes');
    expect(toSvgString(ready)).toContain('data-glow="ready"');
  });

  it('clamps odd numbers and draws every role in the palette', () => {
    expect(drawNotchRing(SPRING, 'scout', 99, 4).attrs['data-notches']).toBe(4);
    expect(drawNotchRing(SPRING, 'scout', -3, 4).attrs['data-notches']).toBe(0);
    expect(drawNotchRing(SPRING, 'scout', Number.NaN, Number.NaN).attrs['data-per-pick']).toBe(1);
    expect(drawNotchRing(SPRING, 'scout', 1, 4, Number.NaN).attrs.width).toBe(64);
    const allowed = paletteColours(SPRING);
    for (const role of ROLE_IDS) {
      const ring = drawNotchRing(SPRING, role, 3, 10);
      expect(toSvgString(ring)).not.toMatch(/NaN|undefined/);
      for (const c of colours(ring)) expect(allowed.has(c), `${role} ${c}`).toBe(true);
    }
    expect(drawPickGlow(SPRING, 40).attrs.width).toBe(40);
  });
});
