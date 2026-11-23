/**
 * What the player opens into: for a new player the intro cards, then the practice map, then the real game;
 * for everyone else the game at once. The intro and the practice are shown once per Discord user (the
 * server keeps the record, `POST /api/me/seen`); both can be opened again later from the day readout's menu.
 * The practice runs only in the browser and never touches the real game; leaving it fetches the game as it
 * is now, whatever day that is.
 */
import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../api/client.ts';
import type { PlayerView } from '../api/schema.ts';
import { Game } from '../game/Game.tsx';
import { watchPress } from '../ui/press.ts';
import './onboarding.css';
import { IntroCards } from './IntroCards.tsx';
import { Practice } from './Practice.tsx';
import { AFTER_INTRO, AFTER_PRACTICE, openingStage, type Stage, withSeen } from './seen.ts';
import { welcomeNeeded } from './welcomeBack.ts';

export interface RootProps {
  readonly api: ApiClient;
  readonly initial: PlayerView;
}

export function Root({ api, initial }: RootProps): JSX.Element {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(initial.you.seen));
  const [stage, setStage] = useState<Stage>(() => openingStage(initial, new Set(initial.you.seen)));
  // The view the game opens from: the first one, then a fresh one after the practice.
  const [view, setView] = useState(initial);
  const [gameKey, setGameKey] = useState(0);
  // The intro shown again over the game, from the menu.
  const [replay, setReplay] = useState(false);
  // The recap runs once, on the first open that has days to tell.
  const [recapDue, setRecapDue] = useState(() => welcomeNeeded(initial));
  const [loading, setLoading] = useState(false);

  // The press rules (a hold never acts, no browser menu on a long press) cover the intro and the
  // practice too, which have no tip layer of their own. Idempotent.
  useEffect(() => watchPress(), []);

  const markSeen = useCallback(
    (ids: readonly string[]) => {
      setSeen((s) => withSeen(s, ids));
      api.markSeen(ids).catch((err: unknown) => console.warn('seen not recorded', err));
    },
    [api],
  );

  const afterIntro = (): void => {
    markSeen(AFTER_INTRO);
    setStage(openingStage(view, withSeen(seen, AFTER_INTRO)));
  };

  const leavePractice = (): void => {
    markSeen(AFTER_PRACTICE);
    setLoading(true);
    // The game in progress, whatever day it is now.
    void api
      .game()
      .then((got) => {
        if (!('unchanged' in got)) setView(got);
      })
      .catch((err: unknown) => console.warn('refresh failed', err))
      .finally(() => {
        setGameKey((n) => n + 1);
        setRecapDue(false);
        setStage('game');
        setLoading(false);
      });
  };

  if (loading) return <main class="game" />;
  if (stage === 'intro') return <IntroCards onDone={afterIntro} onSkip={afterIntro} />;
  if (stage === 'practice') {
    // A new player practises as a scout; one who plays practises as their own role.
    const mine = view.game.characters.find((c) => c.id === view.you.characterId);
    const role = mine?.status === 'active' ? mine.role : 'scout';
    return <Practice role={role} onExit={leavePractice} />;
  }
  return (
    <>
      <Game
        key={gameKey}
        api={api}
        initial={view}
        guides={{
          seen,
          onSeen: markSeen,
          recapDue,
          onRecapDone: () => setRecapDue(false),
          onReplayIntro: () => setReplay(true),
          onPractice: () => setStage('practice'),
        }}
      />
      {replay && <IntroCards onDone={() => setReplay(false)} onSkip={() => setReplay(false)} />}
    </>
  );
}
