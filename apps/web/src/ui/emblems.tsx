/**
 * Small ink emblems for roles, traits and quirks, keyed by content ids (and later by the content's `icon`
 * ids). Unknown ids get a neutral mark built from the id, so new content shows something until it gets
 * its own drawing. Palette colours only; no text.
 */
import type { JSX } from 'preact';
import { PALETTE } from '../map/art.ts';

export const ROLES = ['scout', 'scholar', 'keeper', 'guardian', 'engineer', 'envoy'] as const;
export type Role = (typeof ROLES)[number];

const line = {
  fill: 'none',
  stroke: PALETTE.ink,
  'stroke-width': 1.8,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/** One drawing per role, in a 32-unit box. */
const ROLE_ART: Readonly<Record<Role, () => JSX.Element>> = {
  // A spyglass.
  scout: () => (
    <g>
      <path d="M7 22L22 9l3 3-15 13Z" {...line} fill={PALETTE.accents.ochre.light} />
      <path d="M20 11l3 3M9 20l3 3M14 22l-3 6M14 22l5 6" {...line} />
    </g>
  ),
  // An open book.
  scholar: () => (
    <g>
      <path
        d="M16 9C12 7 8 7 5 8v15c3-1 7-1 11 1 4-2 8-2 11-1V8c-3-1-7-1-11 1Z"
        {...line}
        fill={PALETTE.accents.teal.light}
      />
      <path d="M16 9v15" {...line} />
    </g>
  ),
  // A lantern.
  keeper: () => (
    <g>
      <path d="M12 9h8l1 13H11Z" {...line} fill={PALETTE.accents.ochre.light} />
      <path d="M13 6h6M16 4v2M10 25h12M16 13v4" {...line} />
    </g>
  ),
  // A shield.
  guardian: () => (
    <g>
      <path
        d="M16 4l10 4c0 9-4 16-10 20C10 24 6 17 6 8Z"
        {...line}
        fill={PALETTE.accents.rose.light}
      />
      <path d="M16 9v14M11 14h10" {...line} />
    </g>
  ),
  // A cog.
  engineer: () => (
    <g>
      <circle cx={16} cy={16} r={7} {...line} fill={PALETTE.accents.plum.light} />
      <circle cx={16} cy={16} r={2.5} {...line} />
      <path d="M16 5v3M16 24v3M5 16h3M24 16h3M8 8l2 2M22 22l2 2M8 24l2-2M22 10l2-2" {...line} />
    </g>
  ),
  // A pennant.
  envoy: () => (
    <g>
      <path d="M9 4v24" {...line} />
      <path d="M9 6l15 4-15 5Z" {...line} fill={PALETTE.accents.teal.light} />
    </g>
  ),
};

export const isRole = (id: string | null): id is Role =>
  id !== null && (ROLES as readonly string[]).includes(id);

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function RoleEmblem({
  role,
  size = 32,
}: {
  role: string | null;
  size?: number;
}): JSX.Element {
  const art = isRole(role) ? ROLE_ART[role] : null;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {art ? art() : <circle cx={16} cy={16} r={9} {...line} stroke-dasharray="2 3" />}
    </svg>
  );
}

/**
 * A trait (a strength: a small star-like mark) or a quirk (a mixed blessing: a small swirl), varied by
 * the id until content icons land. Null draws nothing (the plain character).
 */
export function TraitIcon({
  id,
  size = 20,
}: {
  id: string | null;
  size?: number;
}): JSX.Element | null {
  if (id === null) return null;
  const points = 4 + (hash(id) % 3);
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 8 : 3.5;
    pts.push(`${(12 + Math.cos(a) * r).toFixed(1)} ${(12 + Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} data-trait={id} aria-hidden="true">
      <path d={`M${pts.join('L')}Z`} {...line} fill={PALETTE.accents.ochre.base} />
    </svg>
  );
}

export function QuirkIcon({
  id,
  size = 20,
}: {
  id: string | null;
  size?: number;
}): JSX.Element | null {
  if (id === null) return null;
  const turn = hash(id) % 2 === 0 ? 1 : 0;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} data-quirk={id} aria-hidden="true">
      <circle cx={12} cy={12} r={8.5} {...line} fill={PALETTE.accents.plum.light} />
      <path
        d={`M12 12a2.5 2.5 0 0 ${turn} 2.5 -2.5a5 5 0 0 ${turn} -5 5a7 7 0 0 ${turn} 7 -7`}
        {...line}
      />
    </svg>
  );
}
