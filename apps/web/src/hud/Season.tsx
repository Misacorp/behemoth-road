/**
 * Milestone 5 on the HUD: the peril gauge beside the day (its marks jolt when a threat strikes the
 * creature), the route strip toward home, a light darkening of the map's edges as peril rises, and the
 * ending that fills the screen once the season is over (a title, the outcome's scene, the route and the days
 * taken; admins on staging get a new-season button). No prose: the three ending titles are the only words.
 */
import { tipProps } from '../ui/press.ts';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ENDING_TITLES } from '../game/season.ts';
import {
  type CharacterLook,
  drawIcon,
  drawEnding,
  drawPerilGauge,
  drawPerilVignette,
  drawRouteStrip,
} from '@behemoth-road/art';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { type Recap, STAT_ICONS, STAT_TIPS } from '../game/recap.ts';
import { RoleEmblem } from '../ui/emblems.tsx';
import { NewSeasonIcon, RecapIcon, SunIcon, TopMark } from './icons.tsx';

export interface PerilProps {
  readonly peril: number;
  readonly max: number;
  readonly woundedAt: number;
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
  jolt = false,
  relieved = false,
}: PerilProps & { jolt?: boolean; relieved?: boolean }) {
  return (
    <span
      class={`hud-peril${jolt ? ' is-jolted' : relieved ? ' is-relieved' : ''}`}
      aria-label="Peril"
      {...tipProps('hud:peril')}
      data-peril={peril}
      data-max={max}
    >
      {toPreact(drawPerilGauge(PALETTE, 120, peril, { max, woundedAt }))}
    </span>
  );
}

/** The route: steps walked of the season's length, home at the end. */
export function RouteStrip({ steps, length, width = 160 }: RouteProps & { width?: number }) {
  return (
    <span
      class="hud-route"
      aria-label="Route"
      data-steps={steps}
      data-length={length}
      {...tipProps('hud:route')}
    >
      {toPreact(drawRouteStrip(PALETTE, width, steps, length))}
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
      <h1 class="ending-title">{ENDING_TITLES[props.outcome]}</h1>
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
