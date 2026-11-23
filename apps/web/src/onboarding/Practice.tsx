/**
 * The practice map: the real map UI on a small game that runs only in the browser (`sandboxApi.ts`), with
 * the guided first day lit over it (`coach.ts`): select yourself, tap the glowing tile, confirm the arrow,
 * one action of your role. Mistakes are free; "Join the expedition" is there at every step (leaving the
 * practice by it, or by finishing, goes to the real game). It never sends a request: its own API answers
 * from the core, and nothing it does is stored or shared.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlayerView } from '../api/schema.ts';
import { Game } from '../game/Game.tsx';
import { PALETTE } from '../map/art.ts';
import type { Flow } from '../map/flow.ts';
import { IDLE } from '../map/flow.ts';
import { ArtIcon } from './art.tsx';
import { captionFor, coachMap, coachStep, dotOf, hasArrived, planFor, STEPS } from './coach.ts';
import { createSandbox } from './sandboxApi.ts';
import { sandboxView } from './sandbox.ts';

export interface PracticeProps {
  /** Your role (a first-time player practises as a scout; a replay uses your own). */
  readonly role: string;
  /** Leave for the real game: the join button, or the end of the guided day. */
  readonly onExit: () => void;
}

export function Practice({ role, onExit }: PracticeProps): JSX.Element {
  // Starting over is a new map: a new run.
  const [run, setRun] = useState(0);
  const sandbox = useMemo(() => createSandbox(role), [role, run]);
  const initial = useMemo((): PlayerView => sandboxView(sandbox.state(), 1), [sandbox]);
  const plan = useMemo(() => planFor(initial.game, role), [initial, role]);
  const id = initial.you.characterId ?? '';

  const [snap, setSnap] = useState<{ flow: Flow; view: PlayerView }>({ flow: IDLE, view: initial });
  // Your actions when you first reached the glowing tile: the action after it is the one that counts.
  const [arrival, setArrival] = useState<number | null>(null);
  const me = snap.view.game.characters.find((c) => c.id === id);
  useEffect(() => {
    setSnap({ flow: IDLE, view: initial });
    setArrival(null);
  }, [initial]);
  useEffect(() => {
    if (arrival === null && hasArrived(plan, snap.view.game, id) && me?.status === 'active') {
      setArrival(me.actionsLeft);
    }
  }, [arrival, plan, snap, id, me]);

  const input = {
    flow: snap.flow,
    state: snap.view.game,
    characterId: id,
    arrivalActions: arrival,
  };
  const map = coachMap(plan, input);
  const step = coachStep(plan, input);
  // The hub's own care buttons carry the guide there, so the caption steps aside.
  const caption = snap.flow.kind === 'creature' ? null : captionFor(step, plan);
  const practice = useMemo(() => ({ coach: map, onSnapshot: setSnap }), [map]);
  const exit = useRef(onExit);
  exit.current = onExit;

  return (
    <>
      <Game key={run} api={sandbox.api} initial={initial} practice={practice} />
      <div class="coach-bar" data-step={step}>
        <span class="coach-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <i key={s} class={i < dotOf(step) || step === 'done' ? 'on' : ''} />
          ))}
        </span>
        <button
          type="button"
          class="round coach-restart"
          aria-label="Start again"
          data-hint={step === 'stuck' ? 'stuck' : undefined}
          onClick={() => setRun((n) => n + 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4"
              fill="none"
              stroke={PALETTE.ink}
              stroke-width={2}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="cta coach-join"
          data-ready={step === 'done' ? true : undefined}
          onClick={() => exit.current()}
        >
          Join the expedition
        </button>
      </div>
      {caption !== null && (
        <div class="coach-line" role="status" data-step={step}>
          {step === 'act' && <ArtIcon id={ACTION_ICONS[plan.action]} size={26} />}
          <span>{caption}</span>
        </div>
      )}
    </>
  );
}

const ACTION_ICONS = {
  survey: 'eye',
  gather: 'iron',
  'work-site': 'scroll',
  feed: 'feed',
  defend: 'defend',
} as const;
