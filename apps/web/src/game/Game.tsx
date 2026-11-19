/**
 * The shared game, driven by the server's player view. The client never has the seed: every rule check
 * (what you can reach, the path, its cost) runs in the core on the view, and the server re-checks and
 * applies each move. The view is refreshed after your own actions, when the page becomes visible and every
 * 30 seconds while it is visible.
 */
import { findCharacter, type Hex, hexKey, terrainOf } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client.ts';
import type { ActionAnswer, PlayerView } from '../api/schema.ts';
import { Sync } from '../api/sync.ts';
import { Hud } from '../hud/Hud.tsx';
import { JoinDrawer } from '../join/JoinDrawer.tsx';
import {
  type Flow,
  IDLE,
  isSelecting,
  keyDown,
  openCharacter,
  openHub,
  rightClick,
  tap,
} from '../map/flow.ts';
import { type FocusTarget, type Here, MapView } from '../map/MapView.tsx';
import { HubDrawer } from '../hub/HubDrawer.tsx';
import { featureArtAt } from '../map/cells.ts';
import {
  actionsAt,
  careOptions,
  type CostedAction,
  fireAction,
  packUnits,
  stockOf,
  surveyOf,
  unlockOptions,
} from './chain.ts';
import type { Target } from '../map/pick.ts';
import { getSettings } from '../settings.ts';

/** The width from which the layout is the desktop one (`styles.css` media queries). */
const DESKTOP_FROM = 900;
import { identities, partySeeds, setAccents } from './identity.ts';
import { MOMENT_MS, type Moment, momentsBetween, momentsFromEvents } from './moments.ts';
import { toGameState, toSigns } from './viewState.ts';

export interface GameProps {
  readonly api: ApiClient;
  readonly initial: PlayerView;
}

/** What the player needs before they can play: nothing, a first character, or a new one (lost). */
export function characterNeed(view: PlayerView): 'none' | 'join' | 'replace' {
  const id = view.you.characterId;
  if (id === null) return 'join';
  const me = view.game.characters.find((c) => c.id === id);
  return me?.status === 'lost' ? 'replace' : 'none';
}

/**
 * How much of the screen the half drawer covers on a phone (as `styles.css` sizes it: the smaller of 56 %
 * of the height and 520 px); none on desktop, where the drawer sits at the side.
 */
export const halfDrawerCover = (width: number, height: number): number =>
  width >= DESKTOP_FROM ? 0 : Math.min(height * 0.56, 520);

/** The "next day" control shows only when the server offers dev tools and you are an admin. */
export const showsNextDay = (view: PlayerView): boolean => view.devTools && view.you.admin;

export function Game({ api, initial }: GameProps): JSX.Element {
  const [view, setView] = useState(initial);
  const [flow, setFlow] = useState<Flow>(IDLE);
  const [focus, setFocus] = useState<{ target: FocusTarget; n: number }>({ target: 'me', n: 0 });
  const [busy, setBusy] = useState(false);
  const [drawerClosed, setDrawerClosed] = useState(false);

  const sync = useRef<Sync | null>(null);
  sync.current ??= new Sync({
    api,
    onView: setView,
    onError: (err) => console.warn('refresh failed', err),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (h) => window.clearInterval(h),
  });

  // Poll while visible; refresh on becoming visible.
  useEffect(() => {
    const s = sync.current!;
    s.accept(initial);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') s.visible();
      else s.hidden();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      s.hidden();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => setFlow((f) => keyDown(f, e.key));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const state = useMemo(() => toGameState(view.game), [view]);
  const signs = useMemo(() => toSigns(view.signs), [view]);
  const who = useMemo(() => {
    const ids = identities(view);
    setAccents(ids);
    return ids;
  }, [view]);
  const id = view.you.characterId ?? '';
  const me = findCharacter(state, id);
  const need = characterNeed(view);
  const offers = view.offers ?? [];
  // The drawer opens by itself whenever a character is needed (first join, or after being lost).
  useEffect(() => setDrawerClosed(false), [need]);

  // A plan made on an older view may no longer hold: drop it when the view changes under it.
  // Moments: what changed between the last view and this one, shown briefly on the map.
  const [moments, setMoments] = useState<readonly Moment[]>([]);
  const momentTimer = useRef(0);
  const playMoments = (found: readonly Moment[]): void => {
    if (found.length === 0) return;
    window.clearTimeout(momentTimer.current);
    setMoments(found);
    momentTimer.current = window.setTimeout(() => setMoments([]), MOMENT_MS);
  };
  useEffect(() => () => window.clearTimeout(momentTimer.current), []);
  // Changes others made (or the day's tick) show as moments from the difference between views; your own
  // move or action brings its events instead (`ownAnswer`).
  const shown = useRef(view);
  const ownAnswer = useRef(-1);
  useEffect(() => {
    const before = shown.current;
    shown.current = view;
    if (before === view || ownAnswer.current === view.version) return;
    playMoments(momentsBetween(before.game, view.game, view.you.characterId ?? ''));
  }, [view]);

  const planVersion = useRef(view.version);
  useEffect(() => {
    if (planVersion.current !== view.version) {
      planVersion.current = view.version;
      setFlow((f) => (f.kind === 'planned' ? IDLE : f));
    }
  }, [view.version]);

  /** Runs an action: its answer is the new view; a refusal refreshes and clears the plan. */
  async function act(
    run: () => Promise<PlayerView | ActionAnswer>,
    after: (v: PlayerView) => Flow,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const answer = await run();
      const { events, ...next } = 'events' in answer ? answer : { ...answer, events: null };
      planVersion.current = next.version;
      if (events) {
        // Your own move or action reports what happened itself: play those, not a guess from the views.
        ownAnswer.current = next.version;
        playMoments(momentsFromEvents(events, next.game.creature.centre));
      }
      sync.current!.accept(next);
      setFlow(after(next));
    } catch (err) {
      if (!(err instanceof ApiError)) console.warn('action failed', err);
      setFlow(IDLE);
      await sync.current!.refresh();
    } finally {
      setBusy(false);
    }
  }

  const onConfirm = (): void => {
    if (flow.kind !== 'planned') return;
    const path = flow.steps.map((s) => s.place);
    void act(
      () => api.move(view.version, path),
      (next) => {
        const mine = next.game.characters.find((c) => c.id === next.you.characterId);
        return mine && mine.actionsLeft > 0 ? { kind: 'selected' } : IDLE;
      },
    );
  };

  const onJoin = (role: string, offer: number): void => {
    void act(
      () => (need === 'replace' ? api.replace(role, offer) : api.join(role, offer)),
      () => IDLE,
    ).then(() => setFocus((f) => ({ target: 'me', n: f.n + 1 })));
  };

  const drawerOpen = need !== 'none' && offers.length > 0 && !drawerClosed;

  // Milestone 3's chain: what you can do where you stand, a survey next to you, your pack, the hub.
  // Milestone 4: lighting a fire where you stand (when you carry fuel), feeding and lingering in the hub.
  const here = useMemo((): Here | null => {
    if (me?.status !== 'active' || me.at.kind !== 'hex') return null;
    const feature = featureArtAt(state, hexKey(me.at.hex));
    const fire = fireAction(state, me.id);
    const actions = [...(feature ? actionsAt(state, me.id) : []), ...(fire ? [fire] : [])];
    if (!feature && actions.length === 0) return null;
    const terrain = terrainOf(state, me.at.hex)?.id ?? 'unknown';
    return { terrain, feature, actions };
  }, [state, me]);
  const stillSelected = (next: PlayerView): Flow => {
    const mine = next.game.characters.find((c) => c.id === next.you.characterId);
    return mine && mine.actionsLeft > 0 ? { kind: 'selected' } : IDLE;
  };
  const onAct = (kind: string): void => {
    if (kind !== 'gather' && kind !== 'work-site' && kind !== 'light-fire') return;
    void act(() => api.act(view.version, { kind }), stillSelected);
  };
  // Feeding keeps the hub open; a linger closes it, so the creature is seen lying down.
  const onCare = (kind: CostedAction['kind']): void => {
    if (kind !== 'feed' && kind !== 'linger') return;
    void act(
      () => api.act(view.version, { kind }),
      () => (kind === 'linger' ? IDLE : { kind: 'creature' }),
    );
  };
  const surveyAt = (h: Hex) => (me?.status === 'active' ? surveyOf(state, me.id, h) : null);
  const onSurvey = (h: Hex): void => {
    void act(
      () => api.act(view.version, { kind: 'survey', hex: h }),
      () => IDLE,
    );
  };
  const hubOpen = flow.kind === 'creature' && need === 'none';
  const onBuild = (unlock: string): void => {
    void act(
      () => api.act(view.version, { kind: 'build', unlock }),
      // A finished unlock closes the hub, so its moment on the creature shows.
      (next) => (next.game.unlocks.includes(unlock) ? IDLE : { kind: 'creature' }),
    );
  };
  const pack =
    me?.status === 'active'
      ? { stock: stockOf(me.pack), units: packUnits(me.pack), capacity: state.config.packCapacity }
      : null;
  const anyDrawer = drawerOpen || hubOpen;

  return (
    <main class="game">
      <MapView
        state={state}
        signs={signs}
        flow={flow}
        characterId={id}
        identities={who}
        onTap={(target: Target) => {
          // Moments are skippable: any tap clears them.
          setMoments([]);
          setFlow((f) => tap(f, state, id, target));
        }}
        moments={moments}
        onConfirm={onConfirm}
        onOpenHub={() => setFlow(openHub())}
        onCharacter={(other) => setFlow(openCharacter(other))}
        onRightClick={() => setFlow((f) => rightClick(f, getSettings()))}
        focus={focus}
        coverBottom={anyDrawer ? halfDrawerCover(window.innerWidth, window.innerHeight) : 0}
        here={here}
        onAct={onAct}
        surveyAt={surveyAt}
        onSurvey={onSurvey}
      />
      <Hud
        day={view.day}
        actionsLeft={me?.actionsLeft ?? 0}
        actionsPerDay={state.config.actionsPerDay}
        planned={flow.kind === 'planned' && isSelecting(flow) ? flow.cost : 0}
        lost={me?.status !== 'active'}
        snapped={moments.some((m) => m.kind === 'trap')}
        me={who.get(id) ?? null}
        onFocus={(target) => setFocus((f) => ({ target, n: f.n + 1 }))}
        onNextDay={
          showsNextDay(view)
            ? () =>
                void act(
                  () => api.nextDay(),
                  () => IDLE,
                )
            : null
        }
        onJoin={need !== 'none' && offers.length > 0 ? () => setDrawerClosed(false) : null}
        pack={pack}
      />
      <HubDrawer
        open={hubOpen}
        onClose={() => setFlow(IDLE)}
        state={state}
        signs={signs}
        stores={stockOf(state.stores)}
        care={me ? careOptions(state, me.id) : []}
        onCare={onCare}
        unlocks={me ? unlockOptions(state, me.id) : []}
        busy={busy}
        onBuild={onBuild}
      />
      <JoinDrawer
        open={drawerOpen}
        offers={offers}
        party={partySeeds(view)}
        busy={busy}
        onConfirm={onJoin}
        onClose={() => setDrawerClosed(true)}
      />
    </main>
  );
}
