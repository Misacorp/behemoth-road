/**
 * What the SvgNode mapper lets through. Anything else is refused, so a drawing bug or bad data can never
 * add scripts, links, event handlers or inline styles. Kept in one small module so the art kit's own
 * exported allowlists can replace it.
 */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'filter',
  'feTurbulence',
  'feDisplacementMap',
  'feColorMatrix',
  'feGaussianBlur',
  'feOffset',
  'feBlend',
  'feComposite',
  'feFlood',
  'feMerge',
  'feMergeNode',
  'radialGradient',
  'linearGradient',
  'stop',
  'clipPath',
  'mask',
]);

export const ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  // Geometry
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'width',
  'height',
  'points',
  'viewBox',
  'transform',
  'offset',
  'gradientUnits',
  'gradientTransform',
  'preserveAspectRatio',
  // Paint
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'stop-color',
  'stop-opacity',
  'filter',
  'clip-path',
  'mask',
  'vector-effect',
  'shape-rendering',
  // References and filter primitives
  'id',
  'in',
  'in2',
  'result',
  'type',
  'values',
  'baseFrequency',
  'numOctaves',
  'seed',
  'scale',
  'stitchTiles',
  'xChannelSelector',
  'yChannelSelector',
  'stdDeviation',
  'dx',
  'dy',
  'mode',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'flood-color',
  'flood-opacity',
  'filterUnits',
  'primitiveUnits',
  'color-interpolation-filters',
  'clipPathUnits',
  'maskUnits',
]);

/** Attributes whose value may reference something: only a local `url(#id)` is allowed. */
const REFERENCE_ATTRS: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
]);

const LOCAL_URL = /^url\(#[A-Za-z][\w-]*\)$/;

export function isAllowedTag(tag: string): boolean {
  return ALLOWED_TAGS.has(tag);
}

export function isAllowedAttr(name: string, value: string | number): boolean {
  if (!ALLOWED_ATTRS.has(name)) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (/url\s*\(/i.test(value)) return REFERENCE_ATTRS.has(name) && LOCAL_URL.test(value);
  return !/[<>]/.test(value) && !/javascript:/i.test(value);
}
