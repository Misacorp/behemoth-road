/**
 * Popover contents, drawn in SVG in screen px (the map places and clamps them). Visual only: a terrain
 * miniature and a visibility mark for a hex, or the cost pips and a confirm button for a planned move.
 */
import {
  accentRamp,
  actionArrowNodes,
  ART_TUNING,
  drawCharacter,
  drawCreature,
  drawAppetiteBadge,
  drawIcon,
  drawSettlementIcon,
  drawSkillNode,
  drawThreatIcon,
  type CharacterLook,
  type Drawn,
  GENTLE_AMBLER,
  el,
  hexCenter,
  isometric,
  moodOf,
  renderScene,
  type CellState,
  type FeatureArt,
  type SvgNode,
} from '@behemoth-road/art';
import type { CreatureSigns, GameStateView } from '@behemoth-road/core';

type CreatureAppetiteSign = NonNullable<CreatureSigns['appetite']>;
import type { JSX } from 'preact';
import { iconOf } from '../game/chain.ts';
import { Pips, TickMark } from '../hud/icons.tsx';
import type { Identity } from '../game/identity.ts';
import { QuirkIcon, RoleEmblem, TraitIcon } from '../ui/emblems.tsx';
import type { TipId } from '../text/tips.ts';
import { defendedBy } from '../game/season.ts';
import { WHY_ELSEWHERE } from '../game/why.ts';
import { tipFor } from '../ui/tip.ts';
import { greyedProps, tipProps } from '../ui/press.ts';
import { getSettings } from '../settings.ts';
import { verbOf } from '../text/verbs.ts';
import type { SettlementInfo, ThreatCardInfo } from '../game/season.ts';
import { press } from './arm.ts';
import { drawRoleBadge, PALETTE } from './art.ts';
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
  tip = null,
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
  /** Its tip: what the tile is (its feature, or its ground). */
  tip?: TipId | null;
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
  return (
    <g {...tipProps(tip)} data-tile-tip={tip ?? undefined}>
      {toPreact(
        el('svg', { ...scene.attrs, x, y, width: 64 * scale, height: 56 * scale }, scene.children),
      )}
    </g>
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
  risk = false,
}: {
  id: string;
  x: number;
  y: number;
  size: number;
  /** The art kit's risk mark (a cracked triangle) on the icon. */
  risk?: boolean;
}): JSX.Element {
  const icon = drawIcon(id, PALETTE, size, risk ? { risk: true } : {});
  return toPreact({ ...icon, attrs: { ...icon.attrs, x, y, width: size, height: size } });
}

/** The inspect card, wider for each button it offers (a survey, a fire hint). */
export const inspectSize = (survey: boolean, fire = false): { width: number; height: number } => ({
  width: INSPECT_SIZE.width + ((survey ? 1 : 0) + (fire ? 1 : 0)) * ACTION_W,
  height: INSPECT_SIZE.height + TITLE_H + (survey || fire ? labelH() : 0),
});

/**
 * The inspect card: the tile as the map draws it (under its veil while unexplored, with its revealed
 * feature) and its visibility; next to you and unexplored, a survey button (a spyglass and its cost); on a
 * timber stand, a faded fire with its timber, hinting what the wood is for (never a button that does
 * anything: a fire is lit where you stand).
 */
export function InspectCard({
  title = null,
  tileTip = null,
  terrain,
  state,
  feature = null,
  survey = null,
  fire = null,
  onSurvey,
  surveyRef,
  arm,
}: {
  terrain: string;
  state: CellState;
  /** A revealed feature on the hex, drawn on the tile. */
  feature?: FeatureArt | null;
  survey?: { readonly cost: number; readonly enabled: boolean; readonly why?: TipId } | null;
  /** The fire hint on a timber stand: what a fire costs and the fuel it takes. */
  fire?: { readonly cost: number; readonly uses: string } | null;
  onSurvey?: () => void;
  surveyRef?: (el: SVGGElement | null) => void;
  /** Two taps spend the survey. */
  arm?: Arming;
  /** Its noun ("Plains", "Berry bushes"), or null while it is unseen. */
  title?: string | null;
  /** The tile picture's tip. */
  tileTip?: TipId | null;
}): JSX.Element {
  return (
    <g data-popover="inspect" data-feature={feature?.look} data-state={state}>
      <Card {...inspectSize(survey !== null, fire !== null)} />
      <Title text={title} />
      <g transform={`translate(0 ${TITLE_H})`}>
        <Miniature terrain={terrain} state={state} x={6} y={8} feature={feature} tip={tileTip} />
        <g transform="translate(84 22)">
          <VisibilityMark state={state} />
        </g>
        {survey && (
          <ActionButton
            kind="survey"
            icon="spyglass"
            cost={survey.cost}
            enabled={survey.enabled}
            why={survey.why ?? null}
            x={INSPECT_SIZE.width - 6}
            y={12}
            onRun={() => onSurvey?.()}
            {...(arm ? { arm } : {})}
            {...(surveyRef ? { buttonRef: surveyRef } : {})}
          />
        )}
        {fire && (
          <ActionButton
            kind="light-fire"
            icon="light-fire"
            cost={fire.cost}
            enabled={false}
            why={WHY_ELSEWHERE}
            x={INSPECT_SIZE.width - 6 + (survey ? ACTION_W : 0)}
            y={12}
            uses={iconOf(fire.uses)}
            onRun={() => {}}
          />
        )}
      </g>
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

/**
 * The creature's heading: an ink arrow pointing the way it walks on the map. No ring around it, so it does
 * not read as a button.
 */
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
      <path d={`M${tail.x} ${tail.y}L${tip.x} ${tip.y}`} {...eyeLine} stroke-width={2.2} />
      <path d={`M${a.x} ${a.y}L${tip.x} ${tip.y}L${b.x} ${b.y}`} {...eyeLine} stroke-width={2.2} />
    </g>
  );
}

/** A small shield, its top-left corner at the origin (the defence mark, as one warden's or one point's). */
function Shield({ x, y, w = 10 }: { x: number; y: number; w?: number }): JSX.Element {
  const h = w * 1.2;
  return (
    <path
      d={`M${x} ${y}h${w}v${h * 0.5}c0 ${h * 0.35} ${-w * 0.5} ${h * 0.5} ${-w * 0.5} ${h * 0.5}s${-w * 0.5} ${-h * 0.15} ${-w * 0.5} ${-h * 0.5}z`}
      fill={PALETTE.accents.sky.base}
      stroke={PALETTE.ink}
      stroke-width={1}
      stroke-linejoin="round"
    />
  );
}

/**
 * The creature is defended: one shield per warden riding who defended today, bottom right of its card
 * (the reduction they give shows against a threat's strength on its card). Nothing while undefended.
 */
function DefendedMark({
  wardens,
  reduction,
}: {
  wardens: number;
  reduction: number;
}): JSX.Element | null {
  if (wardens <= 0) return null;
  const shown = Math.min(wardens, 5);
  return (
    <g
      transform={`translate(${CREATURE_SIZE.width - 14 - shown * 13} 54)`}
      data-mark="defended"
      data-wardens={wardens}
      data-reduction={reduction}
      {...tipProps('map:defended')}
    >
      <rect x={-3} y={-3} width={shown * 13 + 3} height={20} fill="transparent" />
      {Array.from({ length: shown }, (_, i) => (
        <Shield key={i} x={i * 13} y={0} />
      ))}
    </g>
  );
}

/**
 * The creature: a small drawing of it, turned to its heading (lying down while it lingers, with your signs:
 * its appetite as you see it), and the heading as a compass mark.
 */
export function CreatureCard({
  state,
  signs = null,
}: {
  state: GameStateView;
  signs?: CreatureSigns | null;
}): JSX.Element {
  const art = creatureArt(state, signs);
  const defended = defendedBy(state);
  const drawn = drawCreature(
    PALETTE,
    art.look,
    { x: 0, y: 0 },
    MINI.size * 0.7,
    MINI.squash,
    ART_TUNING.inkWidth * MINI.k,
    art.heading,
    0,
    moodOf(art),
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
      <DefendedMark wardens={defended.wardens} reduction={defended.reduction} />
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

/** A small icon placed with its top-left at (x, y). */
function Placed({ node, x, y, size }: { node: SvgNode; x: number; y: number; size: number }) {
  return toPreact({ ...node, attrs: { ...node.attrs, x, y, width: size, height: size } });
}

/**
 * The creature's appetite as you read it (the art kit's badge), in a corner of the bubble's creature entry:
 * sharp with level dots for a keeper, faint for anyone else.
 */
export function AppetiteBadge({ appetite }: { appetite: CreatureAppetiteSign }): JSX.Element {
  const size = 20;
  return (
    <g
      {...tipProps('hud:appetite')}
      data-appetite={`${appetite.kind}:${String(appetite.level)}`}
      data-faint={appetite.faint ? true : undefined}
    >
      <Placed
        node={drawAppetiteBadge(PALETTE, size, appetite)}
        x={-size / 2}
        y={-size / 2}
        size={size}
      />
    </g>
  );
}

/**
 * The bubble by a place with characters: their figures in a row (others open their card), and, for a
 * place like the creature, a round entry into it with your read of its appetite as a badge. Generic so any
 * hex with several characters can use it later.
 */
export function Bubble({
  characters,
  place,
  appetite = null,
  onOpenPlace,
  onCharacter,
  placeRef,
}: {
  characters: readonly BubbleCharacter[];
  onCharacter: (id: string) => void;
  place?: 'creature';
  /** Your read of the creature's appetite, as a badge on its entry; none when comfortable. */
  appetite?: CreatureAppetiteSign | null;
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
          {appetite && (
            <g transform="translate(14 -14)">
              <AppetiteBadge appetite={appetite} />
            </g>
          )}
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
/** The back button at a card's top left, when the card continues another popup (the bubble). */
const BACK_W = 30;

/** The row of taken skill nodes under the card's top part: the icon size, and how many fit in a row. */
const SKILL_ICON = 24;
const SKILL_ROW_H = 30;
const SKILL_MAX = 9;

export const characterSize = (
  back: boolean,
  skills = 0,
  tow = false,
): { width: number; height: number } => ({
  width: CHARACTER_SIZE.width + (back ? BACK_W : 0) + (tow ? ACTION_W : 0),
  height: CHARACTER_SIZE.height + (skills > 0 ? SKILL_ROW_H : 0),
});

export function BackButton({
  onBack,
  buttonRef,
}: {
  onBack: () => void;
  buttonRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  return (
    <g
      {...(buttonRef ? { ref: buttonRef } : {})}
      class="svg-button"
      role="button"
      tabindex={0}
      aria-label="Back"
      data-back
      transform="translate(4 4)"
      onClick={onBack}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBack();
        }
      }}
    >
      <rect width={24} height={24} rx={8} fill={PALETTE.paperDeep} />
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke={PALETTE.ink}
        stroke-width={2}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  );
}

export function CharacterCard({
  who,
  onBack,
  backRef,
  tow = null,
  onThrow,
  arm,
}: {
  who: Identity;
  /** The tow line, for a rider: the throw button (its cost and whether it can be done now), or none. */
  tow?: { readonly cost: number; readonly enabled: boolean; readonly why?: TipId | null } | null;
  onThrow?: () => void;
  /** Two taps spend the throw. */
  arm?: Arming;
  /** Opened inside another popup: the back button at its top left returns to it. */
  onBack?: () => void;
  backRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  const shift = onBack ? BACK_W : 0;
  // The role, trait and quirk icons each have their tip (hover, or press and hold).
  const tipped = (id: TipId | null, x: number, y: number, icon: JSX.Element) => (
    <g transform={`translate(${x} ${y})`} {...tipProps(id)}>
      {icon}
    </g>
  );
  return (
    <g data-popover="character" data-character={who.id} data-back={onBack ? true : undefined}>
      <Card {...characterSize(Boolean(onBack), who.skills.length, tow !== null)} />
      {tow && (
        <ActionButton
          kind="throw-line"
          icon="towline"
          cost={tow.cost}
          enabled={tow.enabled}
          why={tow.why ?? null}
          x={characterSize(Boolean(onBack), 0, true).width - ACTION_W - 2}
          y={12}
          onRun={() => onThrow?.()}
          {...(arm ? { arm } : {})}
        />
      )}
      {onBack && <BackButton onBack={onBack} {...(backRef ? { buttonRef: backRef } : {})} />}
      <g transform={`translate(${shift} 0)`}>
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
        {who.role &&
          tipped(tipFor('role', who.role), 54, 38, <RoleEmblem role={who.role} size={30} />)}
        {who.trait &&
          tipped(tipFor('trait', who.trait), 92, 43, <TraitIcon id={who.trait} size={22} />)}
        {who.quirk &&
          tipped(tipFor('quirk', who.quirk), 120, 43, <QuirkIcon id={who.quirk} size={22} />)}
        {/* The skill nodes they have taken, visible to everyone: small icons, each with its tip. */}
        {who.skills.slice(0, SKILL_MAX).map((id, i) => (
          <g
            key={id}
            data-skill-taken={id}
            transform={`translate(${8 + i * (SKILL_ICON + 2)} ${CHARACTER_SIZE.height - 4})`}
            {...tipProps(tipFor('skill', id))}
          >
            <Placed
              node={drawSkillNode(PALETTE, `skill:${id}`, SKILL_ICON, 'plain')}
              x={0}
              y={0}
              size={SKILL_ICON}
            />
          </g>
        ))}
      </g>
    </g>
  );
}

/** One action offered where you stand: its kind (an art kit icon id unless `icon` says otherwise) and cost. */
export interface HereAction {
  readonly kind: string;
  /** The art kit icon it shows, when not its kind's own. */
  readonly icon?: string;
  /** It may go wrong (a parley by a non-warden): a small risk mark on the button. */
  readonly risk?: boolean;
  readonly cost: number;
  readonly enabled: boolean;
  /** A material it takes (a fire's timber), drawn small beside the pips. */
  readonly uses?: string | null;
  /** The material is missing: drawn faded. */
  readonly short?: boolean;
  /** Greyed because another role can: that role's id (its emblem shows on the button). */
  readonly needs?: string | null;
  /** Why it is greyed, as a tip: a tap on the greyed button shows it and never acts. */
  readonly why?: TipId | null;
}

const ACTION_W = 54;

/** The row under each action for its verb, when the action labels setting is on. */
export const labelH = (): number => (getSettings().actionLabels ? 12 : 0);
/** The noun title's row on a card about a place or thing. */
export const TITLE_H = 18;

/** A card's noun title (what it is about: "Berry bushes", "Plains"), the card's only words besides names. */
function Title({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null;
  return (
    <text
      x={10}
      y={14}
      fill={PALETTE.ink}
      font-size={12}
      font-weight={600}
      font-family="system-ui, sans-serif"
      data-title={text}
    >
      {text.length > 22 ? `${text.slice(0, 21)}…` : text}
    </text>
  );
}

/** The tip of an action button: a boon's own, an offer's, or the action's. */
function actionTip(kind: string): TipId | null {
  if (kind.startsWith('boon:')) return tipFor('boon', kind.slice(5));
  if (kind.startsWith('offer')) return 'action:offer';
  return tipFor('action', kind);
}

/**
 * Two taps spend: the card's armed button (`arm.armed`), changed by each press (`press`). Without it a
 * button runs on its first tap (only hints that never spend go without).
 */
export interface Arming {
  readonly armed: string | null;
  readonly onArm: (key: string | null) => void;
}

const BADGE = 20;

/**
 * One action as a button: its art kit icon and cost pips; faded and inert when it cannot be done now, with
 * the emblem of the role that can when the core says so. The first tap arms it (its pips give way to a
 * tick), the second spends.
 */
function ActionButton({
  kind,
  icon,
  cost,
  enabled,
  x,
  y,
  uses = null,
  short = false,
  risk = false,
  needs = null,
  why = null,
  arm,
  armKey = kind,
  onRun,
  buttonRef,
}: {
  kind: string;
  icon: string;
  cost: number;
  enabled: boolean;
  x: number;
  y: number;
  /** An art kit icon id for a material it takes, drawn before the pips. */
  uses?: string | null;
  /** The material is missing: drawn faded. */
  short?: boolean;
  /** It may go wrong: a small cracked-triangle mark in the corner. */
  risk?: boolean;
  /** Greyed because this role can: its emblem as a badge on the corner. */
  needs?: string | null;
  /** Why it is greyed, as a tip id: the tap on a greyed button shows it (see `greyedProps`). */
  why?: TipId | null;
  arm?: Arming;
  /** This button's key among the card's buttons (default its kind). */
  armKey?: string;
  onRun: () => void;
  buttonRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  const material = uses ? 15 : 0;
  const row = material + (material ? 2 : 0) + cost * 10;
  const left = (ACTION_W - 6) / 2 - row / 2;
  const armed = enabled && arm !== undefined && arm.armed === armKey;
  const run = (): void => {
    // A greyed button never acts (its tap shows the reason, in the press layer).
    if (!enabled) return;
    if (!arm) {
      if (enabled) onRun();
      return;
    }
    const next = press(arm.armed, armKey, enabled);
    arm.onArm(next.armed);
    if (next.run) onRun();
  };
  return (
    <g
      {...(buttonRef ? { ref: buttonRef } : {})}
      class={enabled ? 'svg-button' : 'svg-button is-off'}
      role="button"
      tabindex={0}
      aria-label={kind}
      aria-disabled={!enabled}
      aria-pressed={arm ? armed : undefined}
      data-action={kind}
      data-armed={armed ? true : undefined}
      {...greyedProps(enabled, why, actionTip(kind))}
      data-needs={needs ?? undefined}
      transform={`translate(${x} ${y})`}
      onClick={run}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run();
        }
      }}
    >
      <g opacity={enabled ? 1 : 0.4}>
        <rect
          width={ACTION_W - 6}
          height={50 + labelH()}
          rx={9}
          fill={PALETTE.paperDeep}
          {...(armed ? { stroke: PALETTE.ink, 'stroke-width': 1.6 } : {})}
        />
        <g data-risk={risk ? 'true' : undefined}>
          <CardIcon id={icon} x={(ACTION_W - 6) / 2 - 14} y={3} size={28} risk={risk} />
        </g>
        {armed ? (
          <g transform={`translate(${(ACTION_W - 6) / 2} 39)`} data-mark="armed">
            <TickMark r={10} />
          </g>
        ) : (
          <>
            {uses && (
              <g opacity={short ? 0.45 : 1} data-short={short ? true : undefined}>
                <CardIcon id={uses} x={left} y={31} size={material} />
              </g>
            )}
            <g transform={`translate(${left + row - cost * 10 - 2} 34)`}>
              <Pips total={cost} left={cost} size={9} />
            </g>
          </>
        )}
        {labelH() > 0 && verbOf(kind) && (
          <text
            x={(ACTION_W - 6) / 2}
            y={58}
            text-anchor="middle"
            fill={PALETTE.ink}
            font-size={10}
            font-weight={600}
            font-family="system-ui, sans-serif"
            data-verb={verbOf(kind)}
          >
            {verbOf(kind)}
          </text>
        )}
      </g>
      {needs && (
        <g data-mark="needs-role">
          <Placed
            node={drawRoleBadge(needs, PALETTE, BADGE)}
            x={ACTION_W - 6 - BADGE + 6}
            y={-6}
            size={BADGE}
          />
        </g>
      )}
    </g>
  );
}

/** The art kit icon each action shows (an open hand to gather, a key to work a site). */
const ACTION_ICONS: Readonly<Record<string, string>> = { gather: 'hand', 'work-site': 'key' };

/** The action pips and a button's own id, shared by the here card's actions. */
export const actionKey = (a: HereAction): string => `${a.kind}:${a.uses ?? ''}`;

// Compact, so the neighbours up-left and up-right of your figure stay tappable on a phone.
export const hereSize = (count: number): { width: number; height: number } => ({
  width: Math.max(58 + count * ACTION_W, 120),
  height: 62 + TITLE_H + labelH(),
});

/**
 * Your own hex: the revealed feature there and the actions it offers (gather, work the site, light a fire),
 * each a button with its action icon and cost pips (and the material it takes). The first tap on an
 * action arms it, the second spends.
 */
export function HereCard({
  title = null,
  tileTip = null,
  terrain,
  feature,
  actions,
  onAct,
  firstRef,
  arm,
  settlement = null,
}: {
  terrain: string;
  feature: FeatureArt | null;
  /** The settlement you stand on, drawn in place of the tile (its attitude and any boon it gave). */
  settlement?: SettlementInfo | null;
  actions: readonly HereAction[];
  onAct: (kind: string) => void;
  firstRef: (el: SVGGElement | null) => void;
  /** Two taps spend: the armed action. */
  arm?: Arming;
  /** Its noun: the feature or ground you stand on, or the settlement's people. */
  title?: string | null;
  /** The tile picture's tip. */
  tileTip?: TipId | null;
}): JSX.Element {
  const size = hereSize(actions.length);
  return (
    <g
      data-popover="here"
      data-feature={feature?.look}
      data-settlement={settlement?.id}
      data-attitude={settlement?.attitude}
      data-boon={settlement?.boon ?? undefined}
    >
      {/* Taps on the card body reach the map below (a neighbour's hex); only the actions catch them. */}
      <g class="pass-through">
        <Card {...size} />
        <Title text={title} />
      </g>
      <g transform={`translate(0 ${TITLE_H})`}>
        {settlement ? (
          <SettlementFigure settlement={settlement} x={5} y={7} size={48} />
        ) : (
          <Miniature
            terrain={terrain}
            state="seen"
            x={4}
            y={9}
            feature={feature}
            scale={0.78}
            tip={tileTip}
          />
        )}
        {actions.map((a, i) => (
          <ActionButton
            key={actionKey(a)}
            kind={a.kind}
            icon={a.icon ?? ACTION_ICONS[a.kind] ?? a.kind}
            risk={a.risk ?? false}
            cost={a.cost}
            enabled={a.enabled}
            x={56 + i * ACTION_W}
            y={5}
            uses={a.uses ? iconOf(a.uses) : null}
            short={a.short ?? false}
            needs={a.needs ?? null}
            why={a.why ?? null}
            armKey={actionKey(a)}
            {...(arm ? { arm } : {})}
            onRun={() => onAct(a.kind)}
            {...(i === 0 ? { buttonRef: firstRef } : {})}
          />
        ))}
      </g>
    </g>
  );
}

/** How far something moves, as one action arrow (the art kit's cost glyph) per hex, at most ten. */
export function DistanceMarks({
  count,
  x,
  y,
}: {
  count: number;
  x: number;
  y: number;
}): JSX.Element {
  const w = 8;
  const nodes = Array.from({ length: Math.min(count, 10) }, (_, i) =>
    actionArrowNodes(PALETTE, i * (w + 2), 0, w),
  ).flat();
  return (
    <g transform={`translate(${x} ${y})`} data-mark="distance" data-distance={count}>
      {nodes.map((n, i) => (
        <g key={i}>{toPreact(n)}</g>
      ))}
    </g>
  );
}

/** The threat card, wider when it offers a strike. */
export const threatSize = (strike: boolean): { width: number; height: number } => ({
  width: 206 + (strike ? ACTION_W : 0),
  height: 76 + (strike ? labelH() : 0),
});

/**
 * A threat: its drawing, its name (the only text), its strength as marks and how far it moves at the next
 * tick (its trail is on the map); when you stand on or next to it, the strike button with its pips (faded
 * without the actions).
 */
export function ThreatCard({
  threat,
  onStrike,
  strikeRef,
  arm,
}: {
  threat: ThreatCardInfo;
  onStrike: () => void;
  strikeRef: (el: SVGGElement | null) => void;
  /** Two taps spend the strike. */
  arm?: Arming;
}): JSX.Element {
  const size = threatSize(threat.strike !== null);
  const marks = Math.min(threat.strength, 10);
  const blocked = Math.min(threat.defence, marks);
  const drawn = drawThreatIcon(threat.icon, PALETTE, 60);
  return (
    <g data-popover="threat" data-threat={threat.id} data-strength={threat.strength}>
      <Card {...size} />
      <g {...tipProps(tipFor('threat', threat.type))}>
        {toPreact({ ...drawn, attrs: { ...drawn.attrs, x: 6, y: 8 } })}
      </g>
      <text
        x={72}
        y={30}
        fill={PALETTE.ink}
        font-size={13}
        font-weight={600}
        font-family="system-ui, sans-serif"
      >
        {threat.name.length > 20 ? `${threat.name.slice(0, 19)}…` : threat.name}
      </text>
      <g transform="translate(72 42)" data-mark="strength">
        {Array.from({ length: marks }, (_, i) => (
          <path
            key={i}
            d={`M${i * 9} 5l3.5 -5l3.5 5l-3.5 5z`}
            fill={PALETTE.accents.coral.shade}
            stroke={PALETTE.ink}
            stroke-width={1}
            opacity={i < blocked ? 0.3 : 1}
          />
        ))}
        {/* The creature's defence, as shields over the marks it takes off a strike on the creature. */}
        {blocked > 0 && (
          <g data-mark="defence" data-blocked={blocked} {...tipProps('map:defended')}>
            {Array.from({ length: blocked }, (_, i) => (
              <Shield key={i} x={i * 9 - 0.5} y={-1} w={8} />
            ))}
          </g>
        )}
      </g>
      <DistanceMarks count={threat.steps} x={72} y={56} />
      {threat.strike && (
        <ActionButton
          kind="strike"
          icon="strike"
          cost={threat.strike.cost}
          enabled={threat.strike.enabled}
          why={threat.strike.why ?? null}
          x={size.width - ACTION_W - 2}
          y={12}
          onRun={onStrike}
          {...(arm ? { arm } : {})}
          buttonRef={strikeRef}
        />
      )}
    </g>
  );
}

export const SETTLEMENT_SIZE = { width: 172, height: 80 } as const;

/**
 * A settlement's drawing by attitude (with its favour marks while wary), and once a boon is taken, that
 * boon's icon sealed on its corner: what the settlement gave.
 */
function SettlementFigure({
  settlement,
  x,
  y,
  size,
}: {
  settlement: SettlementInfo;
  x: number;
  y: number;
  size: number;
}): JSX.Element {
  const drawn = drawSettlementIcon(PALETTE, size, {
    look: settlement.look,
    attitude: settlement.attitude,
    favour: settlement.favour,
    favourNeeded: settlement.needed,
  });
  const seal = Math.round(size * 0.42);
  return (
    <g>
      <g {...tipProps(tipFor('settlement', settlement.attitude))}>
        {toPreact({ ...drawn, attrs: { ...drawn.attrs, x, y } })}
      </g>
      {settlement.boon && (
        <g data-boon={settlement.boon} {...tipProps(tipFor('boon', settlement.boon))}>
          <Placed
            node={drawIcon(settlement.boon, PALETTE, seal, { done: true })}
            x={x + size - seal * 0.75}
            y={y + size - seal * 0.9}
            size={seal}
          />
        </g>
      )}
    </g>
  );
}

/**
 * A settlement from afar (or where you stand with nothing left to do there): its drawing by attitude, the
 * boon it gave, and its people's name.
 */
export function SettlementCard({ settlement }: { settlement: SettlementInfo }): JSX.Element {
  return (
    <g
      data-popover="settlement"
      data-settlement={settlement.id}
      data-attitude={settlement.attitude}
      data-favour={settlement.favour}
      data-boon={settlement.boon ?? undefined}
    >
      <Card {...SETTLEMENT_SIZE} />
      <SettlementFigure settlement={settlement} x={7} y={5} size={70} />
      <text
        x={84}
        y={44}
        fill={PALETTE.ink}
        font-size={13}
        font-weight={600}
        font-family="system-ui, sans-serif"
      >
        {settlement.name.length > 12 ? `${settlement.name.slice(0, 11)}…` : settlement.name}
      </text>
    </g>
  );
}

/** One thing on a shared tile, as a round bubble: its own drawing, no text. */
export interface PickBubble {
  /** Its key among the bubbles (`me`, `character:id`, `threat:id`, `tile`). */
  readonly key: string;
  readonly kind: 'character' | 'threat' | 'tile';
  /** A character's accent and look. */
  readonly accent?: string;
  readonly look?: CharacterLook | undefined;
  /** A threat's content icon and type (for its tip). */
  readonly threat?: { readonly icon: string; readonly type: string };
  /** The tile: a settlement's drawing, or the ground with its revealed feature. */
  readonly settlement?: SettlementInfo | null;
  readonly terrain?: string;
  readonly feature?: FeatureArt | null;
  /** Your own character: its bubble carries a ring. */
  readonly mine?: boolean;
}

const BUBBLE_D = 44;
const BUBBLE_GAP = 6;

/** The picker's size: the bubbles side by side. */
export const pickSize = (count: number): { width: number; height: number } => ({
  width: count * BUBBLE_D + (count - 1) * BUBBLE_GAP,
  height: BUBBLE_D,
});

/**
 * Choosing among several things on one tile: a round bubble for each (a character's figure, a threat, the
 * settlement or feature), side by side. A bubble is a button: a tap opens that thing's card, a hold shows its tip.
 */
export function Picker({
  bubbles,
  onPick,
  firstRef,
}: {
  bubbles: readonly PickBubble[];
  onPick: (key: string) => void;
  firstRef: (el: SVGGElement | null) => void;
}): JSX.Element {
  const r = BUBBLE_D / 2;
  return (
    <g data-popover="pick">
      {bubbles.map((b, i) => {
        const open = (): void => onPick(b.key);
        const tip = b.kind === 'threat' && b.threat ? tipFor('threat', b.threat.type) : null;
        return (
          <g
            key={b.key}
            {...(i === 0 ? { ref: firstRef } : {})}
            class="svg-button"
            role="button"
            tabindex={0}
            aria-label={b.kind}
            data-pick={b.key}
            transform={`translate(${i * (BUBBLE_D + BUBBLE_GAP)} 0)`}
            {...tipProps(tip)}
            onClick={open}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            }}
          >
            <circle cx={r} cy={r} r={r} fill={PALETTE.paperDeep} />
            <circle
              cx={r}
              cy={r}
              r={r - 0.6}
              fill={PALETTE.paper}
              stroke={b.mine ? PALETTE.ink : PALETTE.inkSoft}
              stroke-width={b.mine ? 2 : 1.2}
            />
            {b.kind === 'character' && b.accent && (
              <Fitted drawn={bubbleFigure(b.accent, b.look)} x={9} y={3} width={26} height={38} />
            )}
            {b.kind === 'threat' && b.threat && <g>{toPreact(pickThreat(b.threat.icon))}</g>}
            {b.kind === 'tile' &&
              (b.settlement ? (
                <SettlementFigure settlement={b.settlement} x={5} y={5} size={34} />
              ) : (
                <Miniature
                  terrain={b.terrain ?? 'unknown'}
                  state="seen"
                  x={4}
                  y={7}
                  feature={b.feature ?? null}
                  scale={0.56}
                />
              ))}
          </g>
        );
      })}
    </g>
  );
}

const pickThreat = (icon: string) => {
  const drawn = drawThreatIcon(icon, PALETTE, 36);
  return { ...drawn, attrs: { ...drawn.attrs, x: 4, y: 4 } };
};
