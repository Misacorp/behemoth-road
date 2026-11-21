/**
 * Fast pace in the heads-up layer, as separate pieces over the map: a ring that drains round the day sun
 * while the early next day counts down, the day banner (a band across the upper map that fades in and out
 * when the day number goes up, so the creature's walk shows beneath it), and the staging-only pace toggle
 * beside the "next day" control. All of it is drawn, with no text but the day's number.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { tipProps } from '../ui/press.ts';
import { PALETTE } from '../map/art.ts';
import { SunIcon } from './icons.tsx';
import { dayIncreased, PACE_TUNING, ringFraction } from './pace.ts';
import './pace.css';

const ink = PALETTE.ink;
const line = {
  fill: 'none',
  stroke: ink,
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/** Slow days: a tortoise. */
export function PaceDailyIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 21a9 8 0 0 1 18 0Z" {...line} fill={PALETTE.accents.ochre.light} />
      <path
        d="M24 21h2.5a2.5 2.5 0 0 0 2-4 2.5 2.5 0 0 0-3.5-.5M9 21v3M20 21v3M12 15l2 6M17 14l1 7"
        {...line}
      />
    </svg>
  );
}

/** Fast days: a double chevron. */
export function PaceFastIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 8l9 8-9 8M16 8l9 8-9 8" {...line} />
      <path d="M26 8v16" {...line} />
    </svg>
  );
}

const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A ring round the day sun that drains while `fastTickAt` is set (no text). */
export function DayCountdown({ fastTickAt }: { fastTickAt: number | null }): JSX.Element | null {
  const arc = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (fastTickAt === null) return;
    // The ring is full when the countdown is first seen and empty when the day turns.
    const total = Math.max(1, fastTickAt - Date.now());
    let frame = 0;
    const draw = (): void => {
      const left = ringFraction(fastTickAt - Date.now(), total);
      arc.current?.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - left)));
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [fastTickAt]);
  if (fastTickAt === null) return null;
  return (
    <svg class="day-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx="22"
        cy="22"
        r={RING_RADIUS}
        fill="none"
        stroke={PALETTE.accents.ochre.light}
        stroke-width="3"
      />
      <circle
        ref={arc}
        cx="22"
        cy="22"
        r={RING_RADIUS}
        fill="none"
        stroke={ink}
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray={RING_LENGTH}
        stroke-dashoffset="0"
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

/**
 * The day banner: the sun and the big numeral, for `dayBannerMs` after the day goes up. Not on the first
 * view, and not for a lower day (a new season). It takes no pointer and covers only a band.
 */
export function DayBanner({ day }: { day: number }): JSX.Element | null {
  const previous = useRef<number | null>(null);
  const [shown, setShown] = useState<{ day: number; in: boolean } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = day;
    if (!dayIncreased(before, day)) return;
    setShown({ day, in: false });
    const fadeIn = window.setTimeout(() => setShown({ day, in: true }), 30);
    const fadeOut = window.setTimeout(
      () => setShown({ day, in: false }),
      PACE_TUNING.dayBannerMs - PACE_TUNING.bannerFadeMs,
    );
    const gone = window.setTimeout(() => setShown(null), PACE_TUNING.dayBannerMs);
    return () => {
      window.clearTimeout(fadeIn);
      window.clearTimeout(fadeOut);
      window.clearTimeout(gone);
    };
  }, [day]);
  if (shown === null) return null;
  return (
    <div class="day-banner" data-shown={shown.in ? 'true' : 'false'} aria-hidden="true">
      <SunIcon />
      <span>{shown.day}</span>
    </div>
  );
}

/** The pace toggle: shows the current pace (tortoise or chevrons); a tap switches. */
export function PaceToggle({
  pace,
  onToggle,
}: {
  pace: 'daily' | 'fast';
  onToggle: () => void;
}): JSX.Element {
  return (
    <div class="hud-dev hud-pace">
      <button
        type="button"
        class="dev"
        aria-label="Pace"
        data-pace={pace}
        onClick={onToggle}
        {...tipProps(pace === 'fast' ? 'hud:pace-fast' : 'hud:pace-daily')}
      >
        {pace === 'fast' ? <PaceFastIcon /> : <PaceDailyIcon />}
      </button>
    </div>
  );
}
