/**
 * Milestone 5 on the HUD: the peril gauge beside the day (its marks jolt when a threat strikes the
 * creature), the route strip toward home, a light darkening of the map's edges as peril rises, and the
 * ending that fills the screen once the season is over (a title, the outcome's scene, the route and the days
 * taken; admins on staging get a new-season button). No prose: the three ending titles are the only words.
 */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ENDING_TITLES } from '../game/season.ts';
import { drawEndingScene, drawPerilGauge, drawRouteStrip, PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { NewSeasonIcon, SunIcon } from './icons.tsx';

export interface PerilProps {
  readonly peril: number;
  readonly max: number;
  readonly woundedAt: number;
}

export interface RouteProps {
  readonly steps: number;
  readonly length: number;
}

/** The peril gauge: `max` marks, the wounded threshold notched. */
export function PerilGauge({
  peril,
  max,
  woundedAt,
  jolt = false,
}: PerilProps & { jolt?: boolean }) {
  return (
    <span
      class={`hud-peril${jolt ? ' is-jolted' : ''}`}
      aria-label="Peril"
      data-peril={peril}
      data-max={max}
    >
      {toPreact(drawPerilGauge(PALETTE, peril, max, woundedAt, 100))}
    </span>
  );
}

/** The route: steps walked of the season's length, home at the end. */
export function RouteStrip({ steps, length, width = 160 }: RouteProps & { width?: number }) {
  return (
    <span class="hud-route" aria-label="Route" data-steps={steps} data-length={length}>
      {toPreact(drawRouteStrip(PALETTE, steps, length, width))}
    </span>
  );
}

/** How dark the map's edges get at a peril: none when calm, up to about half at the end. */
export const edgeShade = (peril: number, max: number): number =>
  max > 0 ? Math.round(Math.min(1, Math.max(0, peril / max)) * 55) / 100 : 0;

/** The map's edges darkening a little as peril rises (an SVG gradient; no inline styles). */
export function PerilEdge({ peril, max }: { peril: number; max: number }): JSX.Element | null {
  const shade = edgeShade(peril, max);
  if (shade === 0) return null;
  return (
    <svg class="peril-edge" aria-hidden="true" data-shade={shade}>
      <defs>
        <radialGradient id="peril-edge" cx="50%" cy="50%" r="72%">
          <stop offset="58%" stop-color={PALETTE.ink} stop-opacity={0} />
          <stop offset="100%" stop-color={PALETTE.ink} stop-opacity={1} />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#peril-edge)" opacity={shade} />
    </svg>
  );
}

export interface EndingProps {
  readonly outcome: 'safe' | 'wounded' | 'lost';
  /** Days the season took (the day it ended). */
  readonly days: number;
  readonly route: RouteProps;
  /** Admins on staging and locally: start a new season. Null hides it. */
  readonly onNewSeason: (() => void) | null;
  readonly busy: boolean;
}

/** The season's end, over everything: focus moves into it when it opens. */
export function Ending(props: EndingProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={root} class="ending" data-outcome={props.outcome} tabindex={-1} role="dialog">
      <h1 class="ending-title">{ENDING_TITLES[props.outcome]}</h1>
      <div class="ending-scene">{toPreact(drawEndingScene(PALETTE, props.outcome, 320))}</div>
      <div class="ending-route">
        <RouteStrip {...props.route} width={240} />
        <span class="ending-days" aria-label="Days">
          <SunIcon />
          <span>{props.days}</span>
        </span>
      </div>
      {props.onNewSeason && (
        <button
          type="button"
          class="round ending-new"
          aria-label="New season"
          disabled={props.busy}
          onClick={props.onNewSeason}
        >
          <NewSeasonIcon />
        </button>
      )}
    </div>
  );
}
