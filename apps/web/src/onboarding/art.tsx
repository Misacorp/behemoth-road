/**
 * The art kit's marks as small components for the onboarding screens: one place that turns a kit drawing
 * into an element, so the cards, hints and recap all draw the game's own art (never new art of their own).
 */
import {
  drawAppetiteBadge,
  drawCreatureIcon,
  drawIcon,
  drawSettlementIcon,
  drawThreatIcon,
  drawViaMark,
  GENTLE_AMBLER,
} from '@behemoth-road/art';
import type { JSX } from 'preact';
import { drawM5Moment, PALETTE } from '../map/art.ts';
import { MAP_TUNING } from '../map/config.ts';
import { toPreact } from '../map/svgToPreact.ts';

/** An ink icon from the kit by id (`sun`, `moon`, `cloud`, `shelter`, `role:scout`, an action or a material). */
export const ArtIcon = ({ id, size }: { id: string; size: number }): JSX.Element =>
  toPreact(drawIcon(id, PALETTE, size));

/** A moment mark (`reveal`, `find`, `trap`, `fire`, `threat`, `strike`...), as the map plays them. */
export const ArtMoment = ({ kind, size }: { kind: string; size: number }): JSX.Element =>
  toPreact(drawM5Moment(kind, PALETTE, size));

/** The creature, walking towards the viewer (or along a heading). */
export const ArtCreature = ({
  size,
  heading,
}: {
  size: number;
  heading?: { q: number; r: number };
}): JSX.Element =>
  toPreact(
    drawCreatureIcon(PALETTE, GENTLE_AMBLER, size, {
      squash: MAP_TUNING.tilt,
      ...(heading ? { heading } : {}),
    }),
  );

/** A threat by its content look (`captors`...). */
export const ArtThreat = ({ look, size }: { look: string; size: number }): JSX.Element =>
  toPreact(drawThreatIcon(look, PALETTE, size));

/** A settlement of the hill folk, wary (the first thing a player meets). */
export const ArtSettlement = ({ size }: { size: number }): JSX.Element =>
  toPreact(drawSettlementIcon(PALETTE, size, { look: 'hill-folk', attitude: 'wary' }));

/** The hungry creature's badge. */
export const ArtHungry = ({ size }: { size: number }): JSX.Element =>
  toPreact(drawAppetiteBadge(PALETTE, size, { kind: 'underfed', level: 2 }));

/** A `via` mark (what an engineer's item lets everyone do): the grappling hook. */
export const ArtVia = ({ id, size }: { id: string; size: number }): JSX.Element =>
  toPreact(drawViaMark(id, PALETTE, size));
