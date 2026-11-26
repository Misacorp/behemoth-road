/**
 * The roster's icons, composed from the ink kit already in use: the party button (two standees), and the
 * marks for done for the day, lost, riding, out on the map and no character yet. No text.
 */
import type { JSX } from 'preact';
import { CharacterIcon, CreatureIcon, TickMark } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import type { RosterWhere } from './model.ts';

const line = {
  fill: 'none',
  stroke: PALETTE.ink,
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/** The party: two standees side by side, the nearer one over the other. */
export function PartyIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <svg x={-3} y={4} width={26} height={26} opacity={0.65}>
        <CharacterIcon />
      </svg>
      <svg x={13} y={9} width={30} height={30}>
        <CharacterIcon />
      </svg>
    </svg>
  );
}

/** Done for the day: a tick in a disc. */
export const DoneMark = (): JSX.Element => (
  <svg viewBox="-24 -24 48 48" aria-hidden="true">
    <TickMark r={20} />
  </svg>
);

/** Pinned: a heap of fallen stones. */
export const PinnedMark = (): JSX.Element => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M4 26l2-8 6-4 7 3 3 9z" {...line} fill={PALETTE.ramps.rock.base} />
    <path d="M15 26l1-9 6-5 6 5 1 9z" {...line} fill={PALETTE.ramps.rock.light} />
    <path d="M10 14l1-6 5-3 4 4-1 6" {...line} fill={PALETTE.ramps.stone.light} />
  </svg>
);

/** Lost: a torn cross in faded ink. */
export const LostMark = (): JSX.Element => (
  <svg viewBox="0 0 32 32" aria-hidden="true" opacity={0.55}>
    <path d="M8 8l16 16M24 8L8 24" {...line} stroke-width={2.6} />
  </svg>
);

/** Out on the map: a hex with a dot in it. */
export const MapMark = (): JSX.Element => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 4l10 6v12l-10 6-10-6V10Z" {...line} fill={PALETTE.paperDeep} />
    <circle cx={16} cy={16} r={3} fill={PALETTE.ink} />
  </svg>
);

/** No character yet: an empty dashed standee ring. */
export const NoneMark = (): JSX.Element => (
  <svg viewBox="0 0 32 32" aria-hidden="true" opacity={0.55}>
    <circle cx={16} cy={16} r={11} {...line} stroke-dasharray="3 4" />
  </svg>
);

/** The mark for where a character is (riding draws the creature). */
export function WhereMark({ where }: { where: RosterWhere }): JSX.Element {
  switch (where) {
    case 'riding':
      return <CreatureIcon />;
    case 'map':
      return <MapMark />;
    case 'lost':
      return <LostMark />;
    case 'none':
      return <NoneMark />;
  }
}
