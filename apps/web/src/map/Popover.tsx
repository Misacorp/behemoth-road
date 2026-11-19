/**
 * Popover contents, drawn in SVG in screen px (the map places and clamps them). Visual only: a terrain
 * miniature and a visibility mark for a hex, or the cost pips and a confirm button for a planned move.
 */
import {
  accentRamp,
  ART_TUNING,
  drawCharacter,
  drawCreature,
  drawIcon,
  type CharacterLook,
  type Drawn,
  GENTLE_AMBLER,
  el,
  hexCenter,
  isometric,
  renderScene,
  type CellState,
  type FeatureArt,
} from '@behemoth-road/art';
import type { GameStateView } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { Pips, TickMark } from '../hud/icons.tsx';
import type { Identity } from '../game/identity.ts';
import { QuirkIcon, RoleEmblem, TraitIcon } from '../ui/emblems.tsx';
import { PALETTE } from './art.ts';
import { creatureArt } from './cells.ts';
import { MAP_TUNING } from './config.ts';
import { toPreact } from './svgToPreact.ts';

export const INSPECT_SIZE = { width: 132, height: 76 } as const;
export const CREATURE_SIZE = { width: 140, height: 76 } as const;
export const CONFIRM_SIZE = { width: 150, height: 60 } as const;

const MINI = isometric(24, MAP_TUNING.tilt);

function Card({ width, height }: { width: number; height: number }): JSX.Element {
  return (
    <g>
      <rect x={2} y={3} width={width - 2} height={height - 2} rx={12} fill={PALETTE.paperDeep} />
      <rect
        width={width - 2}
        height={height - 2}
        rx={12}
        fill={PALETTE.paper}
        stroke={PALETTE.inkSoft}
        stroke-width={1.2}
      />
    </g>
  );
}

/** A one-tile scene from the art kit: the terrain as the map draws it. */
function Miniature({
  terrain,
  state,
  x,
  y,
  feature = null,
  hint = false,
  scale = 1,
}: {
  terrain: string;
  state: CellState;
  x: number;
  y: number;
  /** 1 draws it 64 × 56 px. */
  scale?: number;
  /** A revealed feature, drawn on the tile as the map draws it. */
  feature?: FeatureArt | null;
  /** The glint: something sensed here. */
  hint?: boolean;
}) {
  const scene = renderScene({
    cells: [
      { q: 0, r: 0, terrain, state, ...(feature ? { feature } : {}), ...(hint ? { hint } : {}) },
    ],
    projection: MINI,
    palette: PALETTE,
    seed: terrain,
    idPrefix: 'pop',
    // On the card, a page frame would show as a box.
    frame: 'none',
  });
  return toPreact(
    el('svg', { ...scene.attrs, x, y, width: 64 * scale, height: 56 * scale }, scene.children),
  );
}

const eyeLine = {
  fill: 'none',
  stroke: PALETTE.ink,
  'stroke-width': 1.8,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/**
 * Visibility as a mark: open eye (in play), closed eye (not yet explored), half-lidded (fading), mist (lost),
 * dotted lid (never seen).
 */
function VisibilityMark({ state }: { state: CellState }): JSX.Element {
  switch (state) {
    case 'seen':
      return (
        <g>
          <path d="M2 16Q18 2 34 16Q18 30 2 16Z" {...eyeLine} fill={PALETTE.paper} />
          <circle cx={18} cy={16} r={5} fill={PALETTE.ramps.water.shade} stroke={PALETTE.ink} />
        </g>
      );
    case 'fading':
      return (
        <g>
          <path d="M2 16Q18 30 34 16" {...eyeLine} />
          <path d="M2 16Q18 9 34 16" {...eyeLine} />
          <path d="M12 17.5a6 4 0 0 0 12 0Z" fill={PALETTE.ramps.water.shade} />
        </g>
      );
    case 'lost':
      return (
        <g>
          <path
            d="M3 13q5-5 10 0t10 0t10 0M3 21q5-5 10 0t10 0t10 0"
            {...eyeLine}
            stroke={PALETTE.inkSoft}
          />
        </g>
      );
    case 'unexplored':
      // A closed eye: the terrain is known, but no one has looked yet.
      return (
        <g>
          <path d="M2 16Q18 30 34 16" {...eyeLine} />
          <path d="M10 21.5l-1.5 3M18 23v3.4M26 21.5l1.5 3" {...eyeLine} stroke-width={1.4} />
        </g>
      );
    case 'unseen':
      return (
        <g>
          <path
            d="M2 16Q18 30 34 16"
            {...eyeLine}
            stroke-dasharray="2 3.5"
            stroke={PALETTE.inkSoft}
          />
        </g>
      );
  }
}

/** An art kit icon (`drawIcon`), placed at (x, y) in a card. */
function CardIcon({
  id,
  x,
  y,
  size,
}: {
  id: string;
  x: number;
  y: number;
  size: number;
}): JSX.Element {
  const icon = drawIcon(id, PALETTE, size);
  return toPreact({ ...icon, attrs: { ...icon.attrs, x, y, width: size, height: size } });
}

/** The inspect card, wider when it offers a survey. */
export const inspectSize = (survey: boolean): { width: number; height: number } =>
  survey ? { width: INSPECT_SIZE.width + ACTION_W, height: INSPECT_SIZE.height } : INSPECT_SIZE;

/**
 * The inspect card: the tile as the map draws it (under its veil while unexplored, with its revealed
 * feature) and its visibility; next to you and unexplored, a survey button (a spyglass and its cost).
 */
export function InspectCard({
  terrain,
  state,
  feature = null,
  survey = null,
  onSurvey,
  surveyRef,
}: {
  terrain: string;
  state: CellState;
  /** A revealed feature on the hex, drawn on the tile. */
  feature?: FeatureArt | null;
  survey?: { readonly cost: number; readonly enabled: boolean } | null;
  onSurvey?: () => void;
  surveyRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  return (
    <g data-popover="inspect" data-feature={feature?.look} data-state={state}>
      <Card {...inspectSize(survey !== null)} />
      <Miniature terrain={terrain} state={state} x={6} y={8} feature={feature} />
      <g transform="translate(84 22)">
        <VisibilityMark state={state} />
      </g>
      {survey && (
        <ActionButton
          kind="survey"
          icon="spyglass"
          cost={survey.cost}
          enabled={survey.enabled}
          x={INSPECT_SIZE.width - 6}
          y={12}
          onRun={() => onSurvey?.()}
          {...(surveyRef ? { buttonRef: surveyRef } : {})}
        />
      )}
    </g>
  );
}

export function ConfirmCard({
  cost,
  onConfirm,
  buttonRef,
}: {
  cost: number;
  onConfirm: () => void;
  buttonRef: (el: SVGGElement | null) => void;
}): JSX.Element {
  const r = 22;
  const cx = CONFIRM_SIZE.width - r - 8;
  const cy = CONFIRM_SIZE.height / 2 - 1;
  return (
    <g data-popover="confirm">
      <Card {...CONFIRM_SIZE} />
      <g transform={`translate(12 ${cy - 8})`}>
        <Pips total={cost} left={cost} size={14} />
      </g>
      <g
        ref={buttonRef}
        class="svg-button"
        role="button"
        tabindex={0}
        aria-label="Confirm"
        transform={`translate(${cx} ${cy})`}
        onClick={onConfirm}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <TickMark r={r} />
      </g>
    </g>
  );
}

/** The creature's heading as a compass mark: an ink arrow in a ring, pointing the way it walks on the map. */
function HeadingMark({ heading }: { heading: { q: number; r: number } }): JSX.Element {
  const d = hexCenter(MINI, heading.q, heading.r);
  const len = Math.hypot(d.x, d.y) || 1;
  const ux = d.x / len;
  const uy = d.y / len;
  const r = 14;
  const tip = { x: ux * r * 0.8, y: uy * r * 0.8 };
  const tail = { x: -ux * r * 0.6, y: -uy * r * 0.6 };
  const side = (s: number) => ({
    x: tip.x - ux * 6 + -uy * 4.5 * s,
    y: tip.y - uy * 6 + ux * 4.5 * s,
  });
  const a = side(1);
  const b = side(-1);
  return (
    <g>
      <circle r={r + 4} {...eyeLine} stroke={PALETTE.inkSoft} stroke-dasharray="2 3" />
      <path d={`M${tail.x} ${tail.y}L${tip.x} ${tip.y}`} {...eyeLine} stroke-width={2.2} />
      <path d={`M${a.x} ${a.y}L${tip.x} ${tip.y}L${b.x} ${b.y}`} {...eyeLine} stroke-width={2.2} />
    </g>
  );
}

/** The creature: a small drawing of it, turned to its heading, and the heading as a compass mark. */
export function CreatureCard({ state }: { state: GameStateView }): JSX.Element {
  const art = creatureArt(state);
  const drawn = drawCreature(
    PALETTE,
    art.look,
    { x: 0, y: 0 },
    MINI.size * 0.7,
    MINI.squash,
    ART_TUNING.inkWidth * MINI.k,
    art.heading,
  );
  const { x0, y0, x1, y1 } = drawn.box;
  const pad = 2;
  const viewBox = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
  return (
    <g data-popover="creature">
      <Card {...CREATURE_SIZE} />
      <svg x={8} y={8} width={80} height={58} viewBox={viewBox} aria-hidden="true">
        {drawn.nodes.map(toPreact)}
      </svg>
      <g transform="translate(110 37)">
        <HeadingMark heading={art.heading} />
      </g>
    </g>
  );
}

/** A drawing from the art kit, fitted into a box with a little padding. */
function Fitted({
  drawn,
  x,
  y,
  width,
  height,
}: {
  drawn: Drawn;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const { x0, y0, x1, y1 } = drawn.box;
  const pad = 2;
  const w = x1 - x0 + 2 * pad;
  const h = y1 - y0 + 2 * pad;
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`${x0 - pad} ${y0 - pad} ${w} ${h}`}
      aria-hidden="true"
    >
      {drawn.nodes.map(toPreact)}
    </svg>
  );
}

const FIGURE_W = 34;
// Drawn once per accent and look: the bubble's figures and its creature entry are not redrawn per tap.
const bubbleFigures = new Map<string, Drawn>();
function bubbleFigure(accent: string, look?: CharacterLook): Drawn {
  const key = `${accent}|${JSON.stringify(look ?? null)}`;
  let drawn = bubbleFigures.get(key);
  if (!drawn) {
    drawn = drawCharacter(
      PALETTE,
      accent,
      { x: 0, y: 0 },
      40,
      MAP_TUNING.tilt,
      ART_TUNING.inkWidth * 0.98,
      look,
    );
    bubbleFigures.set(key, drawn);
  }
  return drawn;
}
const BUBBLE_CREATURE = drawCreature(
  PALETTE,
  GENTLE_AMBLER,
  { x: 0, y: 0 },
  14,
  MAP_TUNING.tilt,
  1.8,
  {
    q: 0,
    r: 1,
  },
);
const PLACE_W = 56;
const BUBBLE_H = 64;

/** The bubble's size for `count` characters and a place entry. */
export function bubbleSize(count: number, place = true): { width: number; height: number } {
  return { width: 16 + count * FIGURE_W + (place ? PLACE_W : 0), height: BUBBLE_H };
}

export interface BubbleCharacter {
  readonly id: string;
  readonly accent: string;
  readonly look?: CharacterLook | undefined;
  /** Another player's character: tapping it opens their card. */
  readonly other: boolean;
  /** Drawn with a selection ring (your own character, when the tap selected it). */
  readonly selected: boolean;
}

/**
 * The bubble by a place with characters: their figures in a row (inert for now; Milestone 2 opens a
 * character's details), and, for a place like the creature, a round entry into it. Generic so any hex with
 * several characters can use it later.
 */
export function Bubble({
  characters,
  place,
  onOpenPlace,
  onCharacter,
  placeRef,
}: {
  characters: readonly BubbleCharacter[];
  onCharacter: (id: string) => void;
  place?: 'creature';
  onOpenPlace: () => void;
  placeRef: (el: SVGGElement | null) => void;
}): JSX.Element {
  const size = bubbleSize(characters.length, place !== undefined);
  return (
    <g data-popover="bubble">
      <Card {...size} />
      {characters.map((c, i) => {
        const x = 8 + i * FIGURE_W;
        const ramp = accentRamp(PALETTE, c.accent);
        const open = (): void => onCharacter(c.id);
        // Other players' characters open their card; your own figure is shown, not a button.
        const button = c.other
          ? {
              class: 'svg-button',
              role: 'button' as const,
              tabindex: 0,
              'aria-label': 'Character',
              onClick: open,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open();
                }
              },
            }
          : {};
        return (
          <g key={c.id} data-character={c.id} transform={`translate(${x} 6)`} {...button}>
            <rect width={FIGURE_W} height={50} fill={PALETTE.paper} opacity={0} />
            {c.selected && (
              <ellipse
                cx={FIGURE_W / 2}
                cy={44}
                rx={13}
                ry={5}
                fill={ramp.light}
                stroke={ramp.shade}
                stroke-width={1.6}
              />
            )}
            <Fitted
              drawn={bubbleFigure(c.accent, c.look)}
              x={3}
              y={0}
              width={FIGURE_W - 6}
              height={46}
            />
          </g>
        );
      })}
      {place === 'creature' && (
        <g
          ref={placeRef}
          class="svg-button"
          role="button"
          tabindex={0}
          aria-label="Behemoth"
          transform={`translate(${size.width - PLACE_W / 2 - 6} ${BUBBLE_H / 2 - 1})`}
          onClick={onOpenPlace}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenPlace();
            }
          }}
        >
          <circle r={23} fill={PALETTE.paper} stroke={PALETTE.inkSoft} stroke-width={1.4} />
          <Fitted drawn={BUBBLE_CREATURE} x={-17} y={-17} width={34} height={34} />
        </g>
      )}
    </g>
  );
}

export const CHARACTER_SIZE = { width: 236, height: 78 } as const;

/**
 * Another player's character: its figure, its name (the only text, rendered as text), its role emblem
 * and its trait and quirk icons.
 */
export function CharacterCard({ who }: { who: Identity }): JSX.Element {
  return (
    <g data-popover="character" data-character={who.id}>
      <Card {...CHARACTER_SIZE} />
      <Fitted drawn={bubbleFigure(who.accent, who.look)} x={8} y={8} width={40} height={60} />
      <text
        x={56}
        y={28}
        fill={PALETTE.ink}
        font-size={15}
        font-weight={600}
        font-family="system-ui, sans-serif"
      >
        {who.name.length > 22 ? `${who.name.slice(0, 21)}…` : who.name}
      </text>
      <g transform="translate(54 38)">
        <RoleEmblem role={who.role} size={30} />
      </g>
      <g transform="translate(92 43)">
        <TraitIcon id={who.trait} size={22} />
      </g>
      <g transform="translate(120 43)">
        <QuirkIcon id={who.quirk} size={22} />
      </g>
    </g>
  );
}

/** One action offered where you stand: its kind (an art kit icon id) and cost. */
export interface HereAction {
  readonly kind: string;
  readonly cost: number;
  readonly enabled: boolean;
}

const ACTION_W = 54;

/** One action as a button: its art kit icon and cost pips; faded and inert when it cannot be done now. */
function ActionButton({
  kind,
  icon,
  cost,
  enabled,
  x,
  y,
  onRun,
  buttonRef,
}: {
  kind: string;
  icon: string;
  cost: number;
  enabled: boolean;
  x: number;
  y: number;
  onRun: () => void;
  buttonRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  const run = (): void => {
    if (enabled) onRun();
  };
  return (
    <g
      {...(buttonRef ? { ref: buttonRef } : {})}
      class={enabled ? 'svg-button' : 'svg-button is-off'}
      role="button"
      tabindex={0}
      aria-label={kind}
      aria-disabled={!enabled}
      data-action={kind}
      transform={`translate(${x} ${y})`}
      opacity={enabled ? 1 : 0.4}
      onClick={run}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run();
        }
      }}
    >
      <rect width={ACTION_W - 6} height={50} rx={9} fill={PALETTE.paperDeep} />
      <CardIcon id={icon} x={(ACTION_W - 6) / 2 - 14} y={3} size={28} />
      <g transform={`translate(${(ACTION_W - 6) / 2 - (cost * 10) / 2 - 2} 34)`}>
        <Pips total={cost} left={cost} size={9} />
      </g>
    </g>
  );
}

/** The art kit icon each action shows (an open hand to gather, a key to work a site). */
const ACTION_ICONS: Readonly<Record<string, string>> = { gather: 'hand', 'work-site': 'key' };

// Compact, so the neighbours up-left and up-right of your figure stay tappable on a phone.
export const hereSize = (count: number): { width: number; height: number } => ({
  width: 58 + count * ACTION_W,
  height: 62,
});

/**
 * Your own hex: the revealed feature there and the actions it offers (gather, work the site), each a
 * button with its action icon and cost pips. Tapping an action is the second tap that spends.
 */
export function HereCard({
  terrain,
  feature,
  actions,
  onAct,
  firstRef,
}: {
  terrain: string;
  feature: FeatureArt;
  actions: readonly HereAction[];
  onAct: (kind: string) => void;
  firstRef: (el: SVGGElement | null) => void;
}): JSX.Element {
  const size = hereSize(actions.length);
  return (
    <g data-popover="here" data-feature={feature.look}>
      {/* Taps on the card body reach the map below (a neighbour's hex); only the actions catch them. */}
      <g class="pass-through">
        <Card {...size} />
        <Miniature terrain={terrain} state="seen" x={4} y={9} feature={feature} scale={0.78} />
      </g>
      {actions.map((a, i) => (
        <ActionButton
          key={a.kind}
          kind={a.kind}
          icon={ACTION_ICONS[a.kind] ?? a.kind}
          cost={a.cost}
          enabled={a.enabled}
          x={56 + i * ACTION_W}
          y={5}
          onRun={() => onAct(a.kind)}
          {...(i === 0 ? { buttonRef: firstRef } : {})}
        />
      ))}
    </g>
  );
}
