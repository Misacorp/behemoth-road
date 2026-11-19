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

const NAME = /^[a-zA-Z][a-zA-Z0-9:-]*$/;

/** Serialises a node tree. The root `svg` gets the SVG namespace when it has none. */
export function toSvgString(node: SvgNode): string {
  const attrs: Record<string, AttrValue> =
    node.tag === 'svg' && !('xmlns' in node.attrs)
      ? { xmlns: 'http://www.w3.org/2000/svg', ...node.attrs }
      : { ...node.attrs };
  return serialise({ ...node, attrs });
}

function serialise(node: SvgNode): string {
  if (!NAME.test(node.tag)) throw new Error(`Bad SVG tag: ${node.tag}`);
  let out = `<${node.tag}`;
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!NAME.test(name)) throw new Error(`Bad SVG attribute: ${name}`);
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
