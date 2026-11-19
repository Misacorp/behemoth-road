/**
 * The mapper's allowlist: tags and attribute names come from the art kit (`ALLOWED_TAGS`,
 * `isAllowedAttribute`); this adds a check on values, since the page renders without `toSvgString`:
 * references must be local `url(#id)`, and no value may carry markup or a `javascript:` URL.
 */
import { ALLOWED_TAGS, isAllowedAttribute } from '@behemoth-road/art';

/** Attributes whose value may reference something: only a local `url(#id)` is allowed. */
const REFERENCE_ATTRS: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
]);

const LOCAL_URL = /^url\(#[A-Za-z][\w-]*\)$/;

/**
 * Names that mean something to Preact rather than to SVG: `dangerouslySetInnerHTML` would set innerHTML,
 * `ref`, `key` and `children` would change how the tree renders, and `class` is set by the mapper itself.
 * The art kit's name check (written for `toSvgString`) does not know about them.
 */
const PREACT_PROPS: ReadonlySet<string> = new Set([
  'dangerouslysetinnerhtml',
  'ref',
  'key',
  'children',
  'class',
  'classname',
]);

export function isAllowedTag(tag: string): boolean {
  return ALLOWED_TAGS.has(tag);
}

export function isAllowedAttr(name: string, value: string | number): boolean {
  if (!isAllowedAttribute(name, value)) return false;
  if (PREACT_PROPS.has(name.toLowerCase())) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (/url\s*\(/i.test(value)) return REFERENCE_ATTRS.has(name) && LOCAL_URL.test(value);
  return !/[<>]/.test(value) && !/javascript:/i.test(value);
}
