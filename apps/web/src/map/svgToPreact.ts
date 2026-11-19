/**
 * Maps the art kit's `SvgNode` trees to Preact elements. Never `innerHTML`: each node becomes an element
 * through `h`, and tags and attributes outside the allowlist are refused (an error, so a bad drawing is
 * caught by tests rather than rendered).
 */
import type { SvgNode } from '@behemoth-road/art';
import { h, type VNode } from 'preact';
import { isAllowedAttr, isAllowedTag } from './svgAllow.ts';

/** Class on every element that carries an SVG filter; the map turns them off while a gesture runs. */
export const EFFECT_CLASS = 'fx';
/** Class on the paper grain instead: it covers the screen and does not move, so it stays on. */
export const GRAIN_CLASS = 'grain-fx';

export class SvgRefused extends Error {}

export function toPreact(node: SvgNode): VNode {
  if (!isAllowedTag(node.tag)) throw new SvgRefused(`SVG tag not allowed: ${node.tag}`);
  const props: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!isAllowedAttr(name, value)) throw new SvgRefused(`SVG attribute not allowed: ${name}`);
    props[name] = value;
  }
  const filter = node.attrs['filter'];
  if (typeof filter === 'string') {
    props['class'] = /grain\)$/.test(filter) ? GRAIN_CLASS : EFFECT_CLASS;
  }
  return h(node.tag, props, ...node.children.map(toPreact));
}
