/**
 * Milestone 5 on the HUD: the peril gauge beside the day (its marks jolt when a threat strikes the
 * creature), the route strip toward home, a light darkening of the map's edges as peril rises, and the
 * ending that fills the screen once the season is over (a title, the outcome's scene, the route and the days
 * taken; admins on staging get a new-season button). The only prose is the ending's line of story.
 */
import { tipProps } from '../ui/press.ts';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { endingText, endingVignetteOf } from '../text/story.ts';
import {
  type Accent,
  type CharacterLook,
  drawIcon,
  drawEnding,
  drawPerilGauge,
  drawPerilVignette,
  drawRouteDestination,
  drawRouteStrip,
  drawStoryVignette,
  drawThreatIcon,
} from '@behemoth-road/art';
import type { PerilLog } from '@behemoth-road/core';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { type PerilBreakdown, perilBreakdown, type PerilRow } from '../game/perilBreakdown.ts';
import { type Recap, STAT_ICONS, STAT_TIPS } from '../game/recap.ts';
import { setTipExtra } from '../ui/press.ts';
import { RoleEmblem } from '../ui/emblems.tsx';
import { NewSeasonIcon, RecapIcon, SunIcon, TopMark } from './icons.tsx';

export interface PerilProps {
  readonly peril: number;
  readonly max: number;
  readonly woundedAt: number;
  /** Where peril came from so far: a tap on the gauge opens it as a popover (the same view as the ending's). */
  readonly log?: PerilLog;
}

export interface RouteProps {
  readonly steps: number;
  readonly length: number;
}

/** The peril gauge: `max` marks, the wounded threshold notched; it jolts on a strike, swells on relief. */
export function PerilGauge({
  peril,
  max,
  woundedAt,
  log,
  jolt = false,
  relieved = false,
  hungry = false,
}: PerilProps & { jolt?: boolean; relieved?: boolean; hungry?: boolean }) {
  // A tap opens the gauge's tip with the breakdown inside (like the pack: passing help, no interaction in it),
  // and a tap anywhere, Escape or a right-click closes it.
  useEffect(() => {
    if (!log) return undefined;
    return setTipExtra('hud:peril', () => <PerilBreakdownView breakdown={perilBreakdown(log)} />);
  });
  return (
    <span
      class={`hud-peril${jolt ? ' is-jolted' : relieved ? ' is-relieved' : ''}`}
      aria-label="Peril"
      {...tipProps('hud:peril')}
      {...(log ? { 'data-tip-tap': true } : {})}
      data-peril={peril}
      data-max={max}
    >
      {toPreact(drawPerilGauge(PALETTE, 120, peril, { max, woundedAt }))}
      {/* The cause of a rise at the tick, for a moment: hunger shows as the feeding icon beside the gauge. */}
      {hungry && (
        <span class="hud-peril-cause" data-cause="hunger" aria-hidden="true">
          {toPreact(drawIcon('feed', PALETTE, 22))}
        </span>
      )}
    </span>
  );
}

/** The colours of a breakdown's slots, one per source in order (the bar's segments and the rows' dots). */
const SLOTS: readonly Accent[] = ['coral', 'ochre', 'plum', 'sky', 'sage', 'rose'];
const slotFill = (i: number): string => PALETTE.accents[SLOTS[i % SLOTS.length] as Accent].base;
const BAR = { width: 150, height: 12 } as const;

/** A row's picture: the icon of the answer (feed, rest, shelter, defend) or the threat's own figure. */
function RowArt({ row }: { row: PerilRow }) {
  return toPreact(
    row.art.kind === 'threat'
      ? drawThreatIcon(row.art.look, PALETTE, 30)
      : drawIcon(row.art.id, PALETTE, 28),
  );
}

/** One source: a colour dot (added rows), its picture and its number; the tip hints at what to do. */
function PerilRowView({ row, slot }: { row: PerilRow; slot: number | null }) {
  const kind = slot !== null ? 'added' : row.source === 'held' ? 'held' : 'eased';
  const sign = kind === 'added' ? '+' : kind === 'eased' ? '\u2212' : '';
  return (
    <span
      class="peril-row"
      data-source={row.source}
      data-amount={row.amount}
      data-kind={kind}
      {...tipProps(row.tip)}
    >
      {slot !== null && (
        <svg class="peril-dot" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <circle cx="4" cy="4" r="4" fill={slotFill(slot)} />
        </svg>
      )}
      <RowArt row={row} />
      <span class="peril-n">
        {sign}
        {row.amount}
      </span>
    </span>
  );
}

/**
 * Where peril came from: a stacked bar (each source's share of what was added) over rows of icon and number,
 * biggest first, then what took it off (quiet days, shelters) and what defence held off. Visual only; the
 * rows' tips hint at what to do.
 */
export function PerilBreakdownView({ breakdown }: { breakdown: PerilBreakdown }) {
  if (breakdown.empty && breakdown.held === null) return null;
  let at = 0;
  return (
    <div class="peril-breakdown" data-total={breakdown.total}>
      {breakdown.total > 0 && (
        <svg
          class="peril-bar"
          width={BAR.width}
          height={BAR.height}
          viewBox={`0 0 ${String(BAR.width)} ${String(BAR.height)}`}
          aria-hidden="true"
        >
          <rect
            width={BAR.width}
            height={BAR.height}
            rx={BAR.height / 2}
            fill={PALETTE.paperDeep}
            stroke={PALETTE.inkSoft}
          />
          {breakdown.added.map((r, i) => {
            const w = (r.amount / breakdown.total) * (BAR.width - 2);
            const x = 1 + at;
            at += w;
            return (
              <rect
                key={r.source}
                data-seg={r.source}
                x={x}
                y={1}
                width={Math.max(2, w - 1)}
                height={BAR.height - 2}
                rx={3}
                fill={slotFill(i)}
              />
            );
          })}
        </svg>
      )}
      <div class="peril-rows">
        {breakdown.added.map((r, i) => (
          <PerilRowView key={r.source} row={r} slot={i} />
        ))}
      </div>
      {(breakdown.eased.length > 0 || breakdown.held) && (
        <div class="peril-rows peril-eased">
          {breakdown.eased.map((r) => (
            <PerilRowView key={r.source} row={r} slot={null} />
          ))}
          {breakdown.held && <PerilRowView row={breakdown.held} slot={null} />}
        </div>
      )}
    </div>
  );
}

/** The date: the step walked of the route's length ("9 of 40"). A linger keeps its step. */
export const dateOf = (steps: number, length: number): string =>
  `${String(Math.min(Math.max(steps, 0), length))} of ${String(length)}`;

/** The route: steps walked of the season's length, the Greyfold's mark at its end, the date beside it. */
export function RouteStrip({
  steps,
  length,
  width = 160,
  date = true,
}: RouteProps & { width?: number; date?: boolean }) {
  return (
    <span class="hud-routeline">
      <span
        class="hud-route"
        aria-label="Route"
        data-steps={steps}
        data-length={length}
        {...tipProps('hud:route')}
      >
        {toPreact(drawRouteStrip(PALETTE, width, steps, length))}
      </span>
      <span class="hud-greyfold" aria-label="Greyfold" {...tipProps('hud:greyfold')}>
        {toPreact(drawRouteDestination(PALETTE, 20))}
      </span>
      {date && (
        <span
          class="hud-date"
          aria-label="Step"
          data-date={dateOf(steps, length)}
          {...tipProps('hud:date')}
        >
          {dateOf(steps, length)}
        </span>
      )}
    </span>
  );
}

/** How dark the map's edges get at a peril (the vignette's level, 0..1): none when calm, full at the end. */
export const edgeShade = (peril: number, max: number): number =>
  max > 0 ? Math.round(Math.min(1, Math.max(0, peril / max)) * 100) / 100 : 0;

/** The map's edges darkening a little as peril rises (the art kit's vignette; no inline styles). */
export function PerilEdge({ peril, max }: { peril: number; max: number }): JSX.Element | null {
  const shade = edgeShade(peril, max);
  if (shade === 0) return null;
  return (
    <div class="peril-edge" aria-hidden="true" data-shade={shade}>
      {toPreact(drawPerilVignette(PALETTE, shade, 'peril'))}
    </div>
  );
}

/** One stat: its icon (with the tip) and its number; `top` adds the star of whoever led. */
function Stat({
  id,
  value,
  top = false,
}: {
  id: keyof typeof STAT_ICONS;
  value: number;
  top?: boolean;
}) {
  return (
    <span class="stat" data-stat={id} data-top={top ? '' : undefined} {...tipProps(STAT_TIPS[id])}>
      {toPreact(drawIcon(STAT_ICONS[id], PALETTE, 28))}
      <span class="stat-n">{value}</span>
      {top && (
        <span class="stat-top" {...tipProps('stat:top')}>
          <TopMark />
        </span>
      )}
    </span>
  );
}

/** The season's recap: shared stats and the peak of peril, then each player with their own and a star on what they led. */
export function RecapPanel(props: {
  recap: Recap;
  perilMax: number;
  perilWoundedAt: number;
}): JSX.Element {
  const { recap } = props;
  return (
    <div class="recap" aria-label="Recap">
      <div class="recap-shared">
        {recap.shared.map((s) => (
          <Stat key={s.id} id={s.id} value={s.value} />
        ))}
        <PerilGauge peril={recap.peakPeril} max={props.perilMax} woundedAt={props.perilWoundedAt} />
      </div>
      <PerilBreakdownView breakdown={recap.perilSources} />
      <ul class="recap-players">
        {recap.players.map((p) => (
          <li key={p.characterId} class="recap-player" data-character={p.characterId}>
            <RoleEmblem role={p.role} size={32} />
            <span class="recap-name">{p.name}</span>
            <span class="recap-stats">
              {p.stats.map((s) => (
                <Stat key={s.id} id={s.id} value={s.value} top={s.top} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface EndingProps {
  /** The recap (public tallies). */
  readonly recap: Recap;
  readonly perilMax: number;
  readonly perilWoundedAt: number;
  readonly outcome: 'safe' | 'wounded' | 'lost';
  /** The core's title for how it ended, and the key of its line of story (null: the plain title). */
  readonly title: string;
  readonly line: string | null;
  /** Days the season took (the day it ended). */
  readonly days: number;
  readonly route: RouteProps;
  /** Admins on staging and locally: start a new season. Null hides it. */
  readonly onNewSeason: (() => void) | null;
  readonly busy: boolean;
  /** How many times starting a new season failed in a row (0: none): each failure shakes the button. */
  readonly failed?: number;
  /** The party, drawn by the creature when it comes home. */
  readonly party?: readonly { readonly accent: string; readonly look?: CharacterLook }[];
}

/** The season's end, over everything: focus moves into it when it opens (and back to its button after a failed new season). */
export function Ending(props: EndingProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const failed = props.failed ?? 0;
  const text = endingText(props.line);
  // The recap is part of the ending and open with it; its button hides it to see the whole scene.
  const [recapOpen, setRecapOpen] = useState(true);
  // The scene is drawn at the size of its box (the screen above the foot's strip), measured once laid out.
  const [box, setBox] = useState({ width: window.innerWidth, height: window.innerHeight });
  useLayoutEffect(() => {
    const measure = (): void => {
      const r = scene.current?.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return;
      setBox((b) =>
        Math.round(b.width) === Math.round(r.width) && Math.round(b.height) === Math.round(r.height)
          ? b
          : { width: r.width, height: r.height },
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (failed > 0) button.current?.focus({ preventScroll: true });
  }, [failed]);
  return (
    <div ref={root} class="ending" data-outcome={props.outcome} tabindex={-1} role="dialog">
      <div ref={scene} class="ending-scene" aria-hidden="true">
        {toPreact(
          drawEnding(props.outcome, PALETTE, box.width, box.height, {
            party: props.party ?? [],
            idPrefix: 'end',
          }),
        )}
      </div>
      <h1 class="ending-title">{props.title}</h1>
      {text !== null && props.line !== null && (
        <div class="ending-story" data-line={props.line}>
          <span class="ending-line-art" aria-hidden="true">
            {toPreact(drawStoryVignette(PALETTE, endingVignetteOf(props.line), 150))}
          </span>
          <p class="ending-line">{text}</p>
        </div>
      )}
      {recapOpen && (
        <RecapPanel
          recap={props.recap}
          perilMax={props.perilMax}
          perilWoundedAt={props.perilWoundedAt}
        />
      )}
      <div class="ending-foot">
        <div class="ending-route">
          <RouteStrip {...props.route} width={240} />
          <span class="ending-days" aria-label="Days">
            <SunIcon />
            <span>{props.days}</span>
          </span>
        </div>
        <div class="ending-buttons">
          <button
            type="button"
            class="round ending-recap-toggle"
            aria-label="Recap"
            aria-pressed={recapOpen}
            {...tipProps('hud:recap')}
            onClick={() => setRecapOpen((o) => !o)}
          >
            <RecapIcon />
          </button>
          {props.onNewSeason && (
            <button
              ref={button}
              // A new key per failure restarts the shake.
              key={`new-${String(failed)}`}
              type="button"
              class={`round ending-new${failed > 0 ? ' is-failed' : ''}`}
              aria-label="New season"
              data-failed={failed > 0 ? failed : undefined}
              disabled={props.busy}
              onClick={props.onNewSeason}
            >
              <NewSeasonIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
