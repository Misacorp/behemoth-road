/**
 * A tiny SVG element tree. Drawing functions return this instead of strings, because the web app renders
 * without innerHTML (it maps nodes to Preact elements). `toSvgString` is for export files and tests.
 */
export type AttrValue = string | number;

export interface SvgNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, AttrValue>>;
  readonly children: readonly SvgNode[];
}

export function el(
  tag: string,
  attrs: Readonly<Record<string, AttrValue>> = {},
  children: readonly SvgNode[] = [],
): SvgNode {
  return { tag, attrs, children };
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attrText(value: AttrValue): string {
  if (typeof value === 'number') {
    const v = Math.round(value * 100) / 100;
    return Object.is(v, -0) ? '0' : String(v);
  }
  return value;
}

/** The only tags the art may produce. The web app's Preact mapper enforces the same lists. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'defs',
  'filter',
  'feTurbulence',
  'feDisplacementMap',
  'feColorMatrix',
  'path',
  'polygon',
  'polyline',
  'line',
  'ellipse',
  'circle',
  'rect',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
]);

const NAME = /^[a-zA-Z][a-zA-Z0-9:-]*$/;

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Prop names that mean something to Preact (or React) rather than to SVG. The web app renders these trees
 * through `h()`, where `dangerouslySetInnerHTML` would set innerHTML and the others change rendering or
 * styling, so the art never produces them.
 */
const RENDERER_PROPS: ReadonlySet<string> = new Set([
  'dangerouslysetinnerhtml',
  'ref',
  'key',
  'children',
  'class',
  'classname',
]);

/**
 * Attribute names the art may never produce: event handlers, any link (`href` under any prefix), inline
 * styles, renderer props (`RENDERER_PROPS`) and namespace declarations other than plain `xmlns` (whose
 * value `isAllowedAttribute` checks).
 */
export function isForbiddenAttr(name: string): boolean {
  const lower = name.toLowerCase();
  const local = lower.slice(lower.lastIndexOf(':') + 1);
  return (
    lower.startsWith('on') ||
    local === 'href' ||
    lower === 'style' ||
    lower.startsWith('xmlns:') ||
    RENDERER_PROPS.has(lower)
  );
}

/** Whether an attribute name is safe to emit: well formed and not forbidden. */
export function isAllowedAttr(name: string): boolean {
  return NAME.test(name) && !isForbiddenAttr(name);
}

/** Whether an attribute is safe to emit: an allowed name, and `xmlns` only as the SVG namespace. */
export function isAllowedAttribute(name: string, value: AttrValue): boolean {
  if (!isAllowedAttr(name)) return false;
  return name.toLowerCase() !== 'xmlns' || value === SVG_NAMESPACE;
}

/** Serialises a node tree. The root `svg` gets the SVG namespace when it has none. */
export function toSvgString(node: SvgNode): string {
  const attrs: Record<string, AttrValue> =
    node.tag === 'svg' && !('xmlns' in node.attrs)
      ? { xmlns: SVG_NAMESPACE, ...node.attrs }
      : { ...node.attrs };
  return serialise({ ...node, attrs });
}

function serialise(node: SvgNode): string {
  if (!ALLOWED_TAGS.has(node.tag)) throw new Error(`SVG tag not allowed: ${node.tag}`);
  let out = `<${node.tag}`;
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!isAllowedAttribute(name, value)) throw new Error(`SVG attribute not allowed: ${name}`);
    out += ` ${name}="${escapeAttr(attrText(value))}"`;
  }
  if (node.children.length === 0) return `${out}/>`;
  return `${out}>${node.children.map(serialise).join('')}</${node.tag}>`;
}

/** Calls `visit` for the node and every descendant, parents first. */
export function walk(node: SvgNode, visit: (n: SvgNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

export function countNodes(node: SvgNode): number {
  let n = 0;
  walk(node, () => {
    n += 1;
  });
  return n;
}
