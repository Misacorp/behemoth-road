/**
 * The shared game, driven by the server's player view. The client never has the seed: every rule check
 * (what you can reach, the path, its cost) runs in the core on the view, and the server re-checks and
 * applies each move. The view is refreshed after your own actions, when the page becomes visible and every
 * 30 seconds while it is visible.
 */
import { findCharacter, type Hex, hexKey, terrainOf } from '@behemoth-road/core';
import type { HereAction } from '../map/Popover.tsx';
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
import { Ending, PerilEdge } from '../hud/Season.tsx';
import { defendOption, seasonEnd, settlementActions } from './season.ts';

/** The width from which the layout is the desktop one (`styles.css` media queries). */
const DESKTOP_FROM = 900;
import { identities, partySeeds, setAccents } from './identity.ts';
import {
  eventKeys,
  MOMENT_MS,
  type Moment,
  momentsFromEvents,
  type Whereabouts,
} from './moments.ts';
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

  // Moments: what happened, from the server's events that come with each view (your own move or action,
  // and since your last view: others, the tick). Each event plays once, keyed by version and index; when
  // some were dropped from the log (`eventsTruncated`), none play.
  const [moments, setMoments] = useState<readonly Moment[]>([]);
  const momentTimer = useRef(0);
  const played = useRef(new Set<string>());
  // The view before this one: a threat cleared or spent is gone from the new view, but its moment plays
  // where it stood.
  const before = useRef(view);
  useEffect(() => () => window.clearTimeout(momentTimer.current), []);
  useEffect(() => {
    if (view.eventsTruncated || view.events.length === 0) {
      before.current = view;
      return;
    }
    const keys = eventKeys(view.events);
    const fresh = view.events.filter((_, i) => !played.current.has(keys[i]!));
    for (const k of keys) played.current.add(k);
    // Forget keys for versions long past, so the set stays small.
    for (const k of played.current) {
      if (Number(k.split(':')[0]) < view.version - 200) played.current.delete(k);
    }
    const prev = before.current;
    before.current = view;
    const where: Whereabouts = {
      threat: (tid) =>
        (view.game.threats.find((t) => t.id === tid) ?? prev.game.threats.find((t) => t.id === tid))
          ?.hex ?? null,
      settlement: (sid) => view.game.settlements.find((x) => x.id === sid)?.hex ?? null,
      character: (cid) => {
        const c = view.game.characters.find((x) => x.id === cid);
        return c?.at.kind === 'hex' ? c.at.hex : c ? view.game.creature.centre : null;
      },
    };
    const found = momentsFromEvents(
      fresh,
      view.game.creature.centre,
      view.you.characterId ?? '',
      where,
    );
    if (found.length === 0) return;
    window.clearTimeout(momentTimer.current);
    setMoments(found);
    momentTimer.current = window.setTimeout(() => setMoments([]), MOMENT_MS);
  }, [view]);

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
      const next = await run();
      planVersion.current = next.version;
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

  // Whether you have seen a fire on the map this session (kept in memory only): from then on, a here card
  // that opens for something else also hints at lighting one, faded, when you carry no fuel.
  const [sawFire, setSawFire] = useState(false);
  useEffect(() => {
    if (view.game.stimuli.length > 0) setSawFire(true);
  }, [view]);

  // Milestone 3's chain: what you can do where you stand, a survey next to you, your pack, the hub.
  // Milestone 4: lighting a fire where you stand, feeding and lingering in the hub.
  const here = useMemo((): Here | null => {
    if (me?.status !== 'active' || me.at.kind !== 'hex') return null;
    const feature = featureArtAt(state, hexKey(me.at.hex));
    // Without fuel the fire never opens the card by itself: only a hint on a card open for a feature.
    const fire = fireAction(state, me.id, feature !== null && sawFire);
    // Milestone 5: what you can do at the settlement you stand on (parley, offer, a boon).
    const settlement = settlementActions(state, me.id).map((a): HereAction => ({
      kind: a.kind === 'offer' ? `offer:${a.uses ?? ''}` : a.kind,
      cost: a.cost,
      enabled: a.enabled,
      ...(a.kind === 'offer' ? { icon: 'offer', uses: a.uses ?? null } : {}),
      ...(a.kind.startsWith('boon:') ? { icon: a.kind.slice(5) } : {}),
      ...(a.risk ? { risk: true } : {}),
    }));
    const actions = [
      ...(feature ? actionsAt(state, me.id) : []),
      ...(fire ? [fire] : []),
      ...settlement,
    ];
    if (!feature && actions.length === 0) return null;
    const terrain = terrainOf(state, me.at.hex)?.id ?? 'unknown';
    return { terrain, feature, actions };
  }, [state, me, sawFire]);
  const stillSelected = (next: PlayerView): Flow => {
    const mine = next.game.characters.find((c) => c.id === next.you.characterId);
    return mine && mine.actionsLeft > 0 ? { kind: 'selected' } : IDLE;
  };
  const onAct = (kind: string): void => {
    if (kind === 'gather' || kind === 'work-site' || kind === 'light-fire' || kind === 'parley') {
      void act(() => api.act(view.version, { kind }), stillSelected);
    } else if (kind.startsWith('offer:')) {
      void act(
        () => api.act(view.version, { kind: 'offer', material: kind.slice(6) }),
        stillSelected,
      );
    } else if (kind.startsWith('boon:')) {
      void act(
        () => api.act(view.version, { kind: 'ask-boon', boon: kind.slice(5) }),
        stillSelected,
      );
    }
  };
  // A strike keeps the threat's card open while it stands, so the next strike is one tap.
  const onStrike = (threat: string): void => {
    void act(
      () => api.act(view.version, { kind: 'strike', threat }),
      (next) =>
        next.game.threats.some((t) => t.id === threat) ? { kind: 'threat', id: threat } : IDLE,
    );
  };
  // Feeding keeps the hub open; a linger or a defence closes it, so the creature is seen lying down or
  // its defenders' shields go up.
  const onCare = (kind: CostedAction['kind']): void => {
    if (kind !== 'feed' && kind !== 'linger' && kind !== 'defend') return;
    void act(
      () => api.act(view.version, { kind }),
      () => (kind === 'feed' ? { kind: 'creature' } : IDLE),
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
  const ended = seasonEnd(state);
  const care = me
    ? [...careOptions(state, me.id), ...[defendOption(state, me.id)].filter((a) => a !== null)]
    : [];
  // Staging and local only (dev tools), admins: a new season after the end. Its view replaces this game's.
  const onNewSeason = (): void => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await api.newSeason();
        const fresh = await api.game();
        if (!('unchanged' in fresh)) {
          played.current.clear();
          before.current = fresh;
          setFlow(IDLE);
          sync.current!.restart(fresh);
        }
      } catch (err) {
        console.warn('new season failed', err);
      } finally {
        setBusy(false);
      }
    })();
  };

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
        onStrike={onStrike}
      />
      <PerilEdge peril={state.peril} max={state.config.perilMax} />
      <Hud
        day={view.day}
        actionsLeft={me?.actionsLeft ?? 0}
        actionsPerDay={state.config.actionsPerDay}
        planned={flow.kind === 'planned' && isSelecting(flow) ? flow.cost : 0}
        lost={me?.status !== 'active'}
        snapped={moments.some((m) => m.kind === 'trap' && m.mine)}
        me={who.get(id) ?? null}
        onFocus={(target) => setFocus((f) => ({ target, n: f.n + 1 }))}
        onNextDay={
          showsNextDay(view)
            ? () =>
                void act(
                  async () => {
                    // The tick's answer carries no events: read them from the log since this view.
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
        peril={{
          peril: state.peril,
          max: state.config.perilMax,
          woundedAt: state.config.perilWoundedAt,
        }}
        route={{ steps: state.creature.steps, length: state.config.routeLength }}
        jolt={moments.some((m) => m.kind === 'strike')}
      />
      <HubDrawer
        open={hubOpen}
        onClose={() => setFlow(IDLE)}
        state={state}
        signs={signs}
        stores={stockOf(state.stores)}
        care={care}
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
      {ended && (
        <Ending
          outcome={ended.outcome}
          days={ended.day}
          route={{ steps: state.creature.steps, length: state.config.routeLength }}
          onNewSeason={showsNextDay(view) ? onNewSeason : null}
          party={state.characters
            .filter((c) => c.status === 'active')
            .map((c) => {
              const w = who.get(c.id);
              return { accent: w?.accent ?? '', ...(w?.look ? { look: w.look } : {}) };
            })}
          busy={busy}
        />
      )}
    </main>
  );
}
