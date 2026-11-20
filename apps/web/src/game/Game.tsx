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
import { cellStateAt, featureArtAt } from '../map/cells.ts';
import { actionsAt, packUnits, stockOf, surveyOf, unlockOptions } from './chain.ts';
import type { Target } from '../map/pick.ts';
import { getSettings } from '../settings.ts';

/** The width from which the layout is the desktop one (`styles.css` media queries). */
const DESKTOP_FROM = 900;
import { identities, partySeeds, setAccents } from './identity.ts';
import { eventKeys, type Moment, momentsFromEvents, momentsMs } from './moments.ts';
import { toGameState } from './viewState.ts';

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
    // Back to the window (another app or tab had focus): refresh now.
    const onFocus = (): void => void s.refresh();
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      s.hidden();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => setFlow((f) => keyDown(f, e.key));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const state = useMemo(() => toGameState(view.game), [view]);
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

  // Moments: what happened, from the server's events that come with each view (your own move or action,
  // and since your last view: others, the tick). Each event plays once, keyed by version and index; when
  // some were dropped from the log (`eventsTruncated`), none play.
  const [moments, setMoments] = useState<readonly Moment[]>([]);
  const momentTimer = useRef(0);
  const played = useRef(new Set<string>());
  useEffect(() => () => window.clearTimeout(momentTimer.current), []);
  // Worked out while rendering the new view, so the map knows of a creature step in the same frame (it
  // holds the camera and walks the creature).
  const fresh = useMemo((): readonly Moment[] => {
    if (view.eventsTruncated || view.events.length === 0) return [];
    const keys = eventKeys(view.events);
    const unseen = view.events.filter((_, i) => !played.current.has(keys[i]!));
    for (const k of keys) played.current.add(k);
    // Forget keys for versions long past, so the set stays small.
    for (const k of played.current) {
      if (Number(k.split(':')[0]) < view.version - 200) played.current.delete(k);
    }
    return momentsFromEvents(unseen, view.game.creature.centre, view.you.characterId ?? '');
  }, [view]);
  const applied = useRef<readonly Moment[]>(fresh);
  useEffect(() => {
    applied.current = fresh;
    if (fresh.length === 0) return;
    window.clearTimeout(momentTimer.current);
    setMoments(fresh);
    momentTimer.current = window.setTimeout(() => setMoments([]), momentsMs(fresh));
  }, [fresh]);
  // New moments show from this render on; once handed to state, a tap or the timer clears them.
  const shownMoments = fresh.length > 0 && fresh !== applied.current ? fresh : moments;
  const walk = shownMoments.find((m) => m.kind === 'step');
  const step = walk?.kind === 'step' ? { from: walk.from, to: walk.hex } : null;
  // Your character lost: the fog moment plays out before the join drawer opens.
  const fading = shownMoments.some((m) => m.kind === 'lost' && m.mine);

  // A plan made on an older view may no longer hold: drop it when the view changes under it.
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
      const before = view.version;
      const next = await run();
      planVersion.current = next.version;
      sync.current!.accept(next);
      setFlow(after(next));
      // What others (and the tick) did since the view this action started from.
      void sync.current!.catchUp(before);
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

  const drawerOpen = need !== 'none' && offers.length > 0 && !drawerClosed && !fading;

  // Milestone 3's chain: what you can do where you stand, a survey next to you, your pack, the hub.
  const here = useMemo((): Here | null => {
    if (me?.status !== 'active' || me.at.kind !== 'hex') return null;
    const feature = featureArtAt(state, hexKey(me.at.hex));
    if (!feature) return null;
    const terrain = terrainOf(state, me.at.hex)?.id ?? 'unknown';
    return { terrain, feature, actions: actionsAt(state, me.id) };
  }, [state, me]);
  const stillSelected = (next: PlayerView): Flow => {
    const mine = next.game.characters.find((c) => c.id === next.you.characterId);
    return mine && mine.actionsLeft > 0 ? { kind: 'selected' } : IDLE;
  };
  const onAct = (kind: string): void => {
    if (kind !== 'gather' && kind !== 'work-site') return;
    void act(() => api.act(view.version, { kind }), stillSelected);
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
        flow={flow}
        characterId={id}
        identities={who}
        onTap={(target: Target) => {
          // Moments are skippable: any tap clears them.
          setMoments([]);
          setFlow((f) => tap(f, state, id, target));
        }}
        moments={shownMoments}
        step={step}
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
        snapped={shownMoments.some((m) => m.kind === 'trap' && m.mine)}
        warned={
          me?.status === 'active' &&
          me.at.kind === 'hex' &&
          cellStateAt(state, hexKey(me.at.hex)) === 'fading'
        }
        me={who.get(id) ?? null}
        onFocus={(target) => setFocus((f) => ({ target, n: f.n + 1 }))}
        onNextDay={
          showsNextDay(view)
            ? () =>
                void act(
                  async () => {
                    // The tick's answer carries no events: take the view from the log since this one,
                    // so the creature's step arrives with it (the camera holds while it walks).
                    const ticked = await api.nextDay();
                    const since = await api.game(view.version);
                    return 'unchanged' in since ? ticked : since;
                  },
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
        stores={stockOf(state.stores)}
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
