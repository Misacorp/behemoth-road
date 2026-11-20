/**
 * The heads-up layer: day counter, action pips, recentre buttons, a way to join (or replace a lost
 * character) when you have none, and the staging-only "next day" for admins.
 */
import { type CharacterLook, drawPackIcon } from '@behemoth-road/art';
import type { JSX } from 'preact';
import type { Stock } from '../game/chain.ts';
import { Stack } from '../hub/Stack.tsx';
import { elementTarget, TIPS, tipProps } from '../ui/Tip.tsx';
import { PALETTE } from '../map/art.ts';
import type { FocusTarget } from '../map/MapView.tsx';
import { toPreact } from '../map/svgToPreact.ts';
import { PerilGauge, type PerilProps, RouteStrip, type RouteProps } from './Season.tsx';
import {
  CharacterFigure,
  CharacterIcon,
  CreatureIcon,
  JoinIcon,
  NextDayIcon,
  Pips,
  Slots,
  SunIcon,
} from './icons.tsx';

export interface HudProps {
  readonly day: number;
  readonly actionsLeft: number;
  readonly actionsPerDay: number;
  /** Actions the planned move would spend (shown hollow). */
  readonly planned: number;
  readonly lost: boolean;
  /** A trap just ended your day: the pips shake as they go dark. */
  readonly snapped?: boolean;
  /** Your character stands where the window has left (its grace day): the pips take the warning tint. */
  readonly warned?: boolean;
  /** How your character looks (the recentre button shows it); null before joining. */
  readonly me: { readonly accent: string; readonly look: CharacterLook | undefined } | null;
  readonly onFocus: (target: FocusTarget) => void;
  /** Shown only when the server offers dev tools and you are an admin. */
  readonly onNextDay: (() => void) | null;
  /** Your pack: what it holds and its capacity; null hides it (no active character). */
  readonly pack: {
    readonly stock: Stock;
    readonly units: number;
    readonly capacity: number;
  } | null;
  /** Shown when you have no active character: opens the join (or replace) drawer. */
  readonly onJoin: (() => void) | null;
  /** Milestone 5: the creature's peril (the gauge beside the day) and the route toward home. */
  readonly peril?: PerilProps;
  readonly route?: RouteProps;
  /** A threat just struck the creature: the gauge jolts. */
  readonly jolt?: boolean;
  /** Peril just dropped (a shelter): the gauge swells softly. */
  readonly relieved?: boolean;
}

/** Your pack as a satchel with its fill mark; a tap shows what is in it (icons and counts). */
function PackButton({
  stock,
  units,
  capacity,
}: {
  stock: Stock;
  units: number;
  capacity: number;
}): JSX.Element {
  // What is in the pack shows as the pack's tip (passing help, never an interaction over a popup): a tap
  // opens it, and a tap anywhere, Escape or a right-click closes it.
  const contents = (): JSX.Element => (
    <div class="hud-pack-contents" data-empty={stock.length === 0 ? true : undefined}>
      {stock.length > 0 && (
        <div class="hud-pack-stock">
          {stock.map(([id, n]) => (
            <Stack key={id} id={id} count={n} />
          ))}
        </div>
      )}
      {/* One slot per unit the pack holds, filled as it fills: an empty pack reads as empty. */}
      <Slots total={capacity} left={units} size={10} />
    </div>
  );
  return (
    <button
      type="button"
      class="round hud-pack"
      aria-label="Pack"
      data-units={units}
      {...tipProps('hud:pack')}
      onClick={(e) => TIPS.tap('hud:pack', elementTarget(e.currentTarget), contents)}
    >
      {toPreact(drawPackIcon(PALETTE, 44, units, capacity))}
    </button>
  );
}

export function Hud(props: HudProps): JSX.Element {
  return (
    <>
      <div class="hud-top">
        <div class="hud-day" aria-label="Day" {...tipProps('hud:day')}>
          <SunIcon />
          <span>{props.day}</span>
          {props.peril && (
            <PerilGauge
              {...props.peril}
              jolt={props.jolt ?? false}
              relieved={props.relieved ?? false}
            />
          )}
        </div>
        {props.route && <RouteStrip {...props.route} />}
      </div>
      <div
        class={`hud-actions${props.lost ? ' is-lost' : ''}${props.snapped ? ' is-snapped' : ''}${
          props.warned ? ' is-warned' : ''
        }`}
        aria-label="Actions"
        {...tipProps('hud:actions')}
      >
        <Pips
          total={props.actionsPerDay}
          left={props.lost ? 0 : props.actionsLeft}
          planned={props.planned}
          size={16}
          {...(props.warned ? { tint: PALETTE.hint } : {})}
        />
      </div>
      <div class="hud-focus">
        <button
          type="button"
          class="round"
          aria-label="Your character"
          {...tipProps('hud:recentre-me')}
          onClick={() => props.onFocus('me')}
        >
          {props.me ? (
            <CharacterFigure
              accent={props.me.accent}
              {...(props.me.look ? { look: props.me.look } : {})}
            />
          ) : (
            <CharacterIcon />
          )}
        </button>
        <button
          type="button"
          class="round"
          aria-label="Behemoth"
          {...tipProps('hud:recentre-creature')}
          onClick={() => props.onFocus('creature')}
        >
          <CreatureIcon />
        </button>
      </div>
      {props.pack && <PackButton {...props.pack} />}
      {props.onJoin && (
        <button
          type="button"
          class="round hud-join"
          aria-label="Join"
          onClick={props.onJoin}
          {...tipProps('hud:join')}
        >
          <JoinIcon />
        </button>
      )}
      {props.onNextDay && (
        <div class="hud-dev">
          <button
            type="button"
            class="dev"
            aria-label="Next day"
            onClick={props.onNextDay}
            {...tipProps('hud:next-day')}
          >
            <NextDayIcon />
          </button>
        </div>
      )}
    </>
  );
}
