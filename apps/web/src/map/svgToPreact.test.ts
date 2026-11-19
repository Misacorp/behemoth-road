import { el, isometric, MORNING, renderScene, samplePatch, type SvgNode } from '@behemoth-road/art';
import type { VNode } from 'preact';
import { describe, expect, it } from 'vitest';
import { isAllowedAttr } from './svgAllow.ts';
import { EFFECT_CLASS, GRAIN_CLASS, SvgRefused, toPreact } from './svgToPreact.ts';

const sample = (): SvgNode =>
  renderScene({ ...samplePatch(), projection: isometric(), palette: MORNING, seed: 7 });

function count(v: VNode): number {
  const children = (v.props as { children?: VNode[] }).children ?? [];
  return 1 + (Array.isArray(children) ? children : [children]).reduce((n, c) => n + count(c), 0);
}

describe('SvgNode to Preact mapper', () => {
  it("maps the art kit's whole sample scene, node for node", () => {
    const scene = sample();
    const vnode = toPreact(scene);
    expect(vnode.type).toBe('svg');
    let nodes = 0;
    const walk = (n: SvgNode): void => {
      nodes += 1;
      n.children.forEach(walk);
    };
    walk(scene);
    expect(count(vnode)).toBe(nodes);
  });

  it('marks filtered layers so gestures can switch effects off, but not the grain', () => {
    const v = toPreact(
      el('g', {}, [el('g', { filter: 'url(#br-wash)' }), el('rect', { filter: 'url(#br-grain)' })]),
    );
    const [wash, grain] = (v.props as { children: VNode[] }).children;
    expect((wash!.props as Record<string, unknown>)['class']).toBe(EFFECT_CLASS);
    expect((grain!.props as Record<string, unknown>)['class']).toBe(
      `${EFFECT_CLASS} ${GRAIN_CLASS}`,
    );
  });

  it.each([
    ['script', {}],
    ['foreignObject', {}],
    ['a', {}],
    ['image', {}],
    ['use', {}],
    ['text', {}],
  ])('refuses the tag %s', (tag, attrs) => {
    expect(() => toPreact(el('g', {}, [el(tag, attrs)]))).toThrow(SvgRefused);
  });

  it.each([
    ['onclick', 'alert(1)'],
    ['onload', 'x'],
    ['href', '#a'],
    ['xlink:href', '#a'],
    ['style', 'fill:red'],
    ['class', 'x'],
    ['dangerouslySetInnerHTML', 'x'],
    ['fill', 'url(https://example.com/x.svg#a)'],
    ['filter', 'url( #a)'],
    ['d', 'javascript:alert(1)'],
    ['d', '<script>'],
    ['opacity', Number.NaN],
  ])('refuses the attribute %s=%s', (name, value) => {
    expect(() => toPreact(el('path', { [name]: value }))).toThrow(SvgRefused);
  });

  it('allows local references and ordinary paint', () => {
    expect(isAllowedAttr('filter', 'url(#br-ink)')).toBe(true);
    expect(isAllowedAttr('fill', '#f4ecdc')).toBe(true);
    expect(isAllowedAttr('stroke-width', 1.5)).toBe(true);
    expect(isAllowedAttr('d', 'url(#x)')).toBe(false);
  });
});
