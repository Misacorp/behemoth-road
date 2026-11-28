/**
 * The "while you were away" recap: up to three steps over the map, each with one Next. 1) the days that
 * passed, as moons and a sun, with the route walked; 2) what happened near the creature, as marks with
 * counts (the map is centred on the creature behind it); 3) peril and the route now, and the way to the map.
 * Everything in it is public (`welcomeBack.ts`). A tap on the map behind dismisses it, like the map's
 * other passing things.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PerilGauge, RouteStrip } from '../hud/Season.tsx';
import { daysLine, recapText } from '../text/story.ts';
import type { TipId } from '../text/tips.ts';
import { IconTip } from '../ui/IconTip.tsx';
import { ArtCreature, ArtIcon, ArtMoment } from './art.tsx';
import { type MarkKind, type Welcome } from './welcomeBack.ts';

/** The step the recap is on, from the steps it has (the marks step is left out when there are none). */
export type WelcomeStep = 'days' | 'marks' | 'now';
export const welcomeSteps = (w: Welcome): readonly WelcomeStep[] =>
  w.marks.length > 0 ? ['days', 'marks', 'now'] : ['days', 'now'];

/** The mark's picture: the map's own moment mark for it. */
const MARK_ART: Readonly<Record<MarkKind, string>> = {
  threat: 'threat',
  strike: 'strike',
  trap: 'trap',
  hungry: 'hungry',
  find: 'find',
  reveal: 'reveal',
  fire: 'fire',
  cleared: 'cleared',
  befriended: 'befriended',
  angered: 'angered',
};

/** The tip each mark's icon opens. */
const MARK_TIP: Readonly<Record<MarkKind, TipId>> = {
  threat: 'recap:threat',
  strike: 'recap:strike',
  trap: 'recap:trap',
  hungry: 'recap:hungry',
  find: 'recap:find',
  reveal: 'recap:reveal',
  fire: 'recap:fire',
  cleared: 'recap:cleared',
  befriended: 'recap:befriended',
  angered: 'recap:angered',
};

export interface WelcomeBackProps {
  readonly welcome: Welcome;
  /** The step changed (the map centres on the creature for the marks). */
  readonly onStep?: (step: WelcomeStep) => void;
  readonly onDone: () => void;
}

export function WelcomeBack({ welcome: w, onStep, onDone }: WelcomeBackProps): JSX.Element {
  const steps = welcomeSteps(w);
  const [i, setI] = useState(0);
  const step = steps[i] ?? 'now';
  const ref = useRef<HTMLDivElement>(null);
  const told = useRef(onStep);
  told.current = onStep;
  useEffect(() => told.current?.(step), [step]);
  // Focus moves in and out without a ring.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (ref.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    };
  }, []);
  const last = i === steps.length - 1;
  return (
    <>
      {/* The map behind: a tap on it ends the recap. */}
      <div class="onb-scrim" onClick={onDone} />
      <div ref={ref} class="onb-sheet" role="dialog" aria-label="While you were away" tabindex={-1}>
        {step === 'days' && (
          <>
            <h2 class="onb-sheet-title">While you were away</h2>
            <div class="onb-days" data-dusks={w.dusks}>
              {w.gap && <i class="onb-dash" />}
              {w.days.map((d, n) => (
                <span key={d} class={`onb-day${n === w.days.length - 1 ? ' is-now' : ''}`}>
                  <ArtIcon id={n === w.days.length - 1 ? 'sun' : 'moon'} size={40} />
                  <b>{d}</b>
                </span>
              ))}
            </div>
            <p class="onb-line" data-line="days">
              {daysLine(w.dusks)}
            </p>
            <div class="onb-sheet-route">
              <RouteStrip
                steps={w.steps}
                length={w.routeLength}
                progress={w.progress}
                width={220}
              />
            </div>
          </>
        )}
        {step === 'marks' && (
          <div class="onb-marks" data-count={w.marks.length}>
            {w.marks.map((m) => (
              <div key={m.kind} class="onb-mark" data-mark={m.kind}>
                <IconTip id={MARK_TIP[m.kind]} tapShows>
                  <ArtMoment kind={MARK_ART[m.kind]} size={52} />
                </IconTip>
                <p class="onb-line">{recapText(m.kind, m.count)}</p>
              </div>
            ))}
          </div>
        )}
        {step === 'now' && (
          <>
            <h2 class="onb-sheet-title">Now</h2>
            <div class="onb-now">
              <PerilGauge peril={w.peril} max={w.perilMax} woundedAt={w.perilWoundedAt} />
              <ArtCreature size={84} />
            </div>
            <div class="onb-sheet-route">
              <RouteStrip
                steps={w.steps}
                length={w.routeLength}
                progress={w.progress}
                width={220}
              />
            </div>
          </>
        )}
        <button
          type="button"
          class="cta onb-sheet-go"
          data-autofocus
          onClick={() => (last ? onDone() : setI(i + 1))}
        >
          {last ? 'Go to the map' : 'Next'}
        </button>
      </div>
    </>
  );
}
