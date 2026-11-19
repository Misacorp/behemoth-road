/** The heads-up layer: day counter, action pips, recentre buttons and the prototype's dev controls. */
import type { JSX } from 'preact';
import type { FocusTarget } from '../map/MapView.tsx';
import { CharacterIcon, CreatureIcon, NewGameIcon, NextDayIcon, Pips, SunIcon } from './icons.tsx';

export interface HudProps {
  readonly day: number;
  readonly actionsLeft: number;
  readonly actionsPerDay: number;
  /** Actions the planned move would spend (shown hollow). */
  readonly planned: number;
  readonly lost: boolean;
  readonly onFocus: (target: FocusTarget) => void;
  readonly onNextDay: () => void;
  readonly onNewGame: () => void;
}

export function Hud(props: HudProps): JSX.Element {
  return (
    <>
      <div class="hud-day" aria-label="Day">
        <SunIcon />
        <span>{props.day}</span>
      </div>
      <div class={props.lost ? 'hud-actions is-lost' : 'hud-actions'} aria-label="Actions">
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
          <CharacterIcon />
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
      <div class="hud-dev">
        <button type="button" class="dev" aria-label="Next day" onClick={props.onNextDay}>
          <NextDayIcon />
        </button>
        <button type="button" class="dev" aria-label="New game" onClick={props.onNewGame}>
          <NewGameIcon />
        </button>
      </div>
    </>
  );
}
