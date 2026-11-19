/**
 * The heads-up layer: day counter, action pips, recentre buttons, a way to join (or replace a lost
 * character) when you have none, and the staging-only "next day" for admins.
 */
import { type CharacterLook, drawPackIcon } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Stock } from '../game/chain.ts';
import { Stack } from '../hub/Stack.tsx';
import { PALETTE } from '../map/art.ts';
import type { FocusTarget } from '../map/MapView.tsx';
import { toPreact } from '../map/svgToPreact.ts';
import {
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
  /** Your pack: what it holds and its capacity; null hides it (no active character). */
  readonly pack: {
    readonly stock: Stock;
    readonly units: number;
    readonly capacity: number;
  } | null;
  /** Shown when you have no active character: opens the join (or replace) drawer. */
  readonly onJoin: (() => void) | null;
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
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        class="round hud-pack"
        aria-label="Pack"
        aria-expanded={open}
        data-units={units}
        onClick={() => setOpen((o) => !o)}
      >
        {toPreact(drawPackIcon(PALETTE, 44, units, capacity))}
      </button>
      {open && (
        <div
          ref={panel}
          class="hud-pack-contents"
          tabindex={-1}
          data-empty={stock.length === 0 ? true : undefined}
          onClick={() => setOpen(false)}
        >
          {stock.map(([id, n]) => (
            <Stack key={id} id={id} count={n} />
          ))}
        </div>
      )}
    </>
  );
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
      {props.pack && <PackButton {...props.pack} />}
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
