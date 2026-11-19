/**
 * The heads-up layer: day counter, action pips, recentre buttons, a way to join (or replace a lost
 * character) when you have none, and the staging-only "next day" for admins.
 */
import type { CharacterLook } from '@behemoth-road/art';
import type { JSX } from 'preact';
import type { FocusTarget } from '../map/MapView.tsx';
import {
  SatchelIcon,
  CharacterFigure,
  CharacterIcon,
  CreatureIcon,
  JoinIcon,
  NextDayIcon,
  Pips,
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
  /** How your character looks (the recentre button shows it); null before joining. */
  readonly me: { readonly accent: string; readonly look: CharacterLook | undefined } | null;
  readonly onFocus: (target: FocusTarget) => void;
  /** Shown only when the server offers dev tools and you are an admin. */
  readonly onNextDay: (() => void) | null;
  /** Opens the team inventory; null hides the satchel (no character yet). */
  readonly onInventory: (() => void) | null;
  /** How many things the team holds (a small count on the satchel). */
  readonly inventoryCount: number;
  /** Shown when you have no active character: opens the join (or replace) drawer. */
  readonly onJoin: (() => void) | null;
}

export function Hud(props: HudProps): JSX.Element {
  return (
    <>
      <div class="hud-day" aria-label="Day">
        <SunIcon />
        <span>{props.day}</span>
      </div>
      <div
        class={`hud-actions${props.lost ? ' is-lost' : ''}${props.snapped ? ' is-snapped' : ''}`}
        aria-label="Actions"
      >
        <Pips
          total={props.actionsPerDay}
          left={props.lost ? 0 : props.actionsLeft}
          planned={props.planned}
          size={16}
        />
      </div>
      <div class="hud-focus">
        <button
          type="button"
          class="round"
          aria-label="Your character"
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
          onClick={() => props.onFocus('creature')}
        >
          <CreatureIcon />
        </button>
      </div>
      {props.onInventory && (
        <button
          type="button"
          class="round hud-satchel"
          aria-label="Inventory"
          onClick={props.onInventory}
        >
          <SatchelIcon />
          {props.inventoryCount > 0 && <span class="hud-badge">{props.inventoryCount}</span>}
        </button>
      )}
      {props.onJoin && (
        <button type="button" class="round hud-join" aria-label="Join" onClick={props.onJoin}>
          <JoinIcon />
        </button>
      )}
      {props.onNextDay && (
        <div class="hud-dev">
          <button type="button" class="dev" aria-label="Next day" onClick={props.onNextDay}>
            <NextDayIcon />
          </button>
        </div>
      )}
    </>
  );
}
