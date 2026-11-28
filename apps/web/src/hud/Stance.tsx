/**
 * The stance control and the wait button on the HUD (docs/design/stances.md). The control is a small round
 * button showing your stance's glyph (faded, with a moon, when it falls back to rest where you stand); a
 * tap opens a fan of the three stance bubbles above it to choose from (it sits by the hourglass) (a hold on one shows its tip). The wait
 * button, an hourglass beside the action arrows, ends your day in two taps: the first arms it, the second
 * confirms; it disarms by itself, or on any tap elsewhere. No text anywhere: glyphs only.
 */
import { drawGlyph } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type StanceView, waitTap } from '../game/stances.ts';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { tipFor } from '../ui/tip.ts';
import { tipProps } from '../ui/press.ts';
import { TickMark } from './icons.tsx';

/** A stance or waiting glyph (the art kit's ink drawing) at `size` px. */
export const Glyph = ({ name, size }: { name: string; size: number }): JSX.Element =>
  toPreact(drawGlyph(name, PALETTE, size));

/** How long an armed wait button waits for its confirming tap, in ms. */
export const ARMED_MS = 4000;

export interface StanceControlProps {
  readonly stance: StanceView;
  readonly onChoose: (id: string) => void;
}

export function StanceControl({ stance, onChoose }: StanceControlProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubbles = useRef<HTMLDivElement>(null);

  // Focus moves into the popover when it opens (without a ring) and back to the button when it closes,
  // as the drawers do, unless a tap elsewhere has already put focus somewhere of its own.
  useEffect(() => {
    if (!open) return;
    const current = bubbles.current?.querySelector<HTMLElement>('[data-chosen]');
    (current ?? bubbles.current?.querySelector<HTMLElement>('button'))?.focus({
      preventScroll: true,
    });
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || bubbles.current?.contains(now))
        button.current?.focus({ preventScroll: true });
    };
  }, [open]);

  // A tap anywhere else, or Escape, closes it. (A hold's tip is not a tap: the tip layer swallows those.)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div class="hud-stance-root" ref={root}>
      {open && (
        <div class="stance-pop" role="listbox" aria-label="Stance" ref={bubbles} data-stance-pop>
          {stance.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.chosen}
              class="round stance-bubble"
              data-stance={c.id}
              {...(c.chosen ? { 'data-chosen': true } : {})}
              {...(c.fits ? {} : { 'data-unfit': true })}
              {...(tipFor('stance', c.id) ? { 'data-tip': tipFor('stance', c.id)! } : {})}
              onClick={() => {
                setOpen(false);
                if (!c.chosen) onChoose(c.id);
              }}
            >
              <Glyph name={c.icon} size={30} />
            </button>
          ))}
        </div>
      )}
      <button
        ref={button}
        type="button"
        class="round hud-stance"
        aria-label="Stance"
        aria-expanded={open}
        data-stance={stance.chosen}
        {...(stance.fallback ? { 'data-fallback': true } : {})}
        {...tipProps('hud:stance')}
        onClick={() => setOpen((o) => !o)}
      >
        <Glyph name={stance.icon} size={30} />
        {stance.fallback && (
          <span class="stance-fallback" data-tip="stance:fallback">
            <Glyph name="moon" size={16} />
          </span>
        )}
      </button>
    </div>
  );
}

export interface WaitButtonProps {
  /** You have actions left and have not ended the day. */
  readonly enabled: boolean;
  /** You ended the day: the button rests, settled. */
  readonly waiting: boolean;
  readonly onWait: () => void;
}

/** The wait button: tap to arm, tap again to end the day. */
export function WaitButton({ enabled, waiting, onWait }: WaitButtonProps): JSX.Element {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // Disarms after a while, on a tap elsewhere, or when it stops being possible.
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), ARMED_MS);
    const away = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setArmed(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', away, true);
    };
  }, [armed]);
  useEffect(() => {
    if (!enabled) setArmed(false);
  }, [enabled]);
  return (
    <button
      ref={ref}
      type="button"
      class="round hud-wait"
      aria-label="Wait"
      aria-disabled={!enabled}
      data-disabled={enabled ? undefined : true}
      data-armed={armed ? true : undefined}
      data-waiting={waiting ? true : undefined}
      {...tipProps('action:wait')}
      onClick={() => {
        const tap = waitTap(armed, enabled);
        setArmed(tap.armed);
        if (tap.fire) onWait();
      }}
    >
      {armed ? (
        <svg viewBox="-24 -24 48 48" aria-hidden="true">
          <TickMark r={20} />
        </svg>
      ) : (
        <Glyph name="hourglass" size={26} />
      )}
    </button>
  );
}
