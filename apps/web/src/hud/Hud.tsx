/**
 * The heads-up layer: day counter, action pips, recentre buttons, a way to join (or replace a lost
 * character) when you have none, and the staging-only "next day" for admins.
 */
import {
  type CharacterLook,
  drawNotchRing,
  drawPackIcon,
  drawPickGlow,
  type RoleId,
} from '@behemoth-road/art';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Stock } from '../game/chain.ts';
import { Stack } from '../hub/Stack.tsx';
import { setTipExtra, tipProps } from '../ui/press.ts';
import { PALETTE } from '../map/art.ts';
import type { FocusTarget } from '../map/MapView.tsx';
import { toPreact } from '../map/svgToPreact.ts';
import { PartyIcon } from '../roster/marks.tsx';
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
  /** Your role's emblem with the notch ring toward the next pick; a tap opens the skill tree. */
  readonly skills?: {
    readonly role: string;
    readonly notches: number;
    readonly perPick: number;
    /** A pick can be taken now: the ready glow pulses. */
    readonly ready: boolean;
    readonly onOpen: () => void;
  } | null;
  /** The day readout opens the replay menu when held (the real game's guides). */
  readonly menu?: boolean;
  /** Opens or closes the player roster (the party button above the recentre buttons). */
  readonly onRoster?: () => void;
  /** A threat just struck the creature: the gauge jolts. */
  readonly jolt?: boolean;
  /** Peril just rose from hunger at the tick: the feeding icon shows beside the gauge for a moment. */
  readonly hungry?: boolean;
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
  useEffect(() => setTipExtra('hud:pack', contents));
  return (
    <button
      type="button"
      class="round hud-pack"
      aria-label="Pack"
      data-units={units}
      data-tip-tap
      {...tipProps('hud:pack')}
    >
      {toPreact(drawPackIcon(PALETTE, 44, units, capacity))}
    </button>
  );
}

/** Your role emblem ringed by the notches toward your next pick; it pulses when a pick is ready. */
function SkillsButton({ skills }: { skills: NonNullable<HudProps['skills']> }): JSX.Element {
  return (
    <button
      type="button"
      class="round hud-skills"
      aria-label="Skills"
      data-ready={skills.ready ? true : undefined}
      data-notches={skills.notches}
      {...tipProps('hud:skills')}
      onClick={skills.onOpen}
    >
      {/* A pick waiting in another role's tree glows behind the ring (a full ring brings its own glow). */}
      {skills.ready && skills.notches < skills.perPick && (
        <span class="hud-skills-glow">{toPreact(drawPickGlow(PALETTE, 64))}</span>
      )}
      {toPreact(drawNotchRing(PALETTE, skills.role as RoleId, skills.notches, skills.perPick, 64))}
    </button>
  );
}

export function Hud(props: HudProps): JSX.Element {
  return (
    <>
      <div class="hud-top">
        <div
          class="hud-day"
          aria-label="Day"
          {...tipProps('hud:day')}
          {...(props.menu ? { 'data-hold-menu': true } : {})}
        >
          <SunIcon />
          <span>{props.day}</span>
          {props.peril && (
            <PerilGauge
              {...props.peril}
              jolt={props.jolt ?? false}
              hungry={props.hungry ?? false}
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
        {props.onRoster && (
          <button
            type="button"
            class="round hud-roster"
            aria-label="Players"
            {...tipProps('hud:roster')}
            onClick={props.onRoster}
          >
            <PartyIcon />
          </button>
        )}
        {props.skills && <SkillsButton skills={props.skills} />}
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
