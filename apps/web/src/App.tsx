import { createGame, findCharacter, type GameState, nextDay } from '@behemoth-road/core';
import { useEffect, useState } from 'preact/hooks';
import { Hud } from './hud/Hud.tsx';
import { MAP_TUNING } from './map/config.ts';
import { confirmMove, type Flow, IDLE, keyDown, openHub, rightClick, tap } from './map/flow.ts';
import { type FocusTarget, MapView } from './map/MapView.tsx';
import type { Target } from './map/pick.ts';
import { getSettings } from './settings.ts';

/** Game number `n` uses seed `MAP_TUNING.seed + n`, so every game can be replayed. */
export function startGame(n: number): GameState {
  return createGame((MAP_TUNING.seed + n) >>> 0, { characterIds: [MAP_TUNING.characterId] });
}

export function App() {
  const id = MAP_TUNING.characterId;
  const [game, setGame] = useState(() => ({ n: 0, state: startGame(0) }));
  const [flow, setFlow] = useState<Flow>(IDLE);
  const [focus, setFocus] = useState<{ target: FocusTarget; n: number }>({ target: 'me', n: 0 });
  const { state } = game;
  const me = findCharacter(state, id);

  // Escape closes popovers and cancels a plan (desktop convenience; nothing else needs a keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => setFlow((f) => keyDown(f, e.key));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onTap = (target: Target): void => setFlow((f) => tap(f, state, id, target));
  const onConfirm = (): void => {
    const result = confirmMove(flow, state, id);
    setFlow(result.flow);
    if (result.state !== state) setGame((g) => ({ ...g, state: result.state }));
  };
  const onNextDay = (): void => {
    setFlow(IDLE);
    setGame((g) => ({ ...g, state: nextDay(g.state) }));
  };
  const onNewGame = (): void => {
    setFlow(IDLE);
    setGame((g) => ({ n: g.n + 1, state: startGame(g.n + 1) }));
  };

  return (
    <main class="game">
      <MapView
        state={state}
        flow={flow}
        characterId={id}
        onTap={onTap}
        onConfirm={onConfirm}
        onOpenHub={() => setFlow(openHub())}
        onRightClick={() => setFlow((f) => rightClick(f, getSettings()))}
        focus={focus}
      />
      <Hud
        day={state.day}
        actionsLeft={me?.actionsLeft ?? 0}
        actionsPerDay={state.config.actionsPerDay}
        planned={flow.kind === 'planned' ? flow.cost : 0}
        lost={me?.status !== 'active'}
        onFocus={(target) => setFocus((f) => ({ target, n: f.n + 1 }))}
        onNextDay={onNextDay}
        onNewGame={onNewGame}
      />
    </main>
  );
}
