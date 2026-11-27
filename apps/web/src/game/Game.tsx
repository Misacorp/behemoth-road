/**
 * The shared game, driven by the server's player view. The client never has the seed: every rule check
 * (what you can reach, the path, its cost) runs in the core on the view, and the server re-checks and
 * applies each move. The view is refreshed after your own actions, when the page becomes visible and every
 * 10 seconds while it is visible.
 */
import {
  findCharacter,
  unpinned,
  type Hex,
  hexKey,
  packCapacityOf,
  type SkillNode,
  terrainOf,
} from '@behemoth-road/core';
import type { HereAction } from '../map/Popover.tsx';
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client.ts';
import type { ActionAnswer, PlayerView } from '../api/schema.ts';
import { browserSocket, createLiveSocket, liveUrl } from '../api/live-socket.ts';
import { Sync } from '../api/sync.ts';
import { Hud } from '../hud/Hud.tsx';
import { SkillDrawer } from '../skills/SkillDrawer.tsx';
import { pickReady, ringOf } from '../skills/model.ts';
import { WHY_BY_REFUSAL } from './why.ts';
import { JoinDrawer } from '../join/JoinDrawer.tsx';
import {
  type Flow,
  IDLE,
  isSelecting,
  keyDown,
  choose,
  entryKey,
  goBack,
  pickEntries,
  openCharacter,
  openHub,
  rightClick,
  startLead,
  tap,
} from '../map/flow.ts';
import { type FocusTarget, type Here, MapView } from '../map/MapView.tsx';
import { Roster } from '../roster/Roster.tsx';
import { keepFound, rosterRows, type RosterRow } from '../roster/model.ts';
import type { Snap } from '../ui/Drawer.tsx';
import { HubDrawer } from '../hub/HubDrawer.tsx';
import { DayBanner, DayCountdown, PaceToggle } from '../hud/Pace.tsx';
import { setTipConfig, TipLayer } from '../ui/Tip.tsx';
import { cellStateAt, featureArtAt } from '../map/cells.ts';
import { digOption, greyedForPin, struggleOption, takesFire } from './fire.ts';
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
import { recapOf } from './recap.ts';
import { Ending, PerilEdge } from '../hud/Season.tsx';
import type { CoachMap } from '../onboarding/coach.ts';
import { Guides } from '../onboarding/Guides.tsx';
import {
  defendOption,
  ENDING_TITLES,
  seasonEnd,
  settlementActions,
  settlementAt,
  settlementInfo,
} from './season.ts';

/** The width from which the layout is the desktop one (`styles.css` media queries). */
const DESKTOP_FROM = 900;
import { identities, partySeeds, setAccents } from './identity.ts';
import { cartAt } from './cart.ts';
import { grabOption, throwOption } from './tow.ts';
import {
  eventKeys,
  type Moment,
  momentsFromEvents,
  momentsMs,
  type Whereabouts,
} from './moments.ts';
import { canWait, stanceView } from './stances.ts';
import { toGameState, toSigns } from './viewState.ts';
import {
  anchorsOf,
  arrive,
  badgeShown,
  type CardAnchor,
  cardOf,
  closeByLoss,
  closeByTap,
  NO_STORY,
  READ_AFTER_MS,
  readBatches,
  settle,
  type Step,
  type StoryModel,
  tapBadge,
  unreadOf,
} from './story.ts';

/** How long story reads wait to go out together, in ms. */
const READ_FLUSH_MS = 500;

export interface GameProps {
  readonly api: ApiClient;
  readonly initial: PlayerView;
  /**
   * The practice map (its `api` answers from the core in the browser): the guided day's lights for the map
   * and a way to tell the guide what the map is showing. No guides, hints or recap run in it.
   */
  readonly practice?: {
    readonly coach: CoachMap | null;
    readonly onSnapshot: (s: { readonly flow: Flow; readonly view: PlayerView }) => void;
  };
  /** The real game's guides (hints, the recap, the day menu): what was seen, and the ways out to the intro and the practice. */
  readonly guides?: {
    readonly seen: ReadonlySet<string>;
    readonly onSeen: (ids: readonly string[]) => void;
    readonly recapDue: boolean;
    readonly onRecapDone: () => void;
    readonly onReplayIntro: () => void;
    readonly onPractice: () => void;
  };
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

/** How much of the screen the roster's peek covers on a phone. `peekPx` is the CSS's `--peek-h`, the one source. */
export const peekCover = (width: number, peekPx: number): number =>
  width >= DESKTOP_FROM ? 0 : peekPx;
/** Reads `--peek-h` from the stylesheet (where `.drawer[data-snap='peek']` uses it). */
const peekHeight = (): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek-h')) || 0;

/** The "next day" control shows only when the server offers dev tools and you are an admin. */
export const showsNextDay = (view: PlayerView): boolean => view.devTools && view.you.admin;

export function Game({ api, initial, practice, guides }: GameProps): JSX.Element {
  const [view, setView] = useState(initial);
  const [flow, setFlow] = useState<Flow>(IDLE);
  const [focus, setFocus] = useState<{ target: FocusTarget; n: number; id?: string }>({
    target: 'me',
    n: 0,
  });
  // The roster drawer: open or not, how often a row asked it to peek, and the height it settled at.
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterPeek, setRosterPeek] = useState(0);
  const [rosterSnap, setRosterSnap] = useState<Snap>('half');
  const [busy, setBusy] = useState(false);
  // The skill tree drawer, opened from the HUD's role emblem.
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [drawerClosed, setDrawerClosed] = useState(false);

  const sync = useRef<Sync | null>(null);
  sync.current ??= new Sync({
    api,
    // The socket only says "something changed"; the view still comes from `api.game`. Without it (an
    // unsupported browser, the flag off, a full guild) the poll stays at 10 s.
    ...(api.liveEnabled()
      ? {
          live: createLiveSocket({
            getTicket: () => api.liveTicket(),
            url: (ticket) => liveUrl(window.location, ticket),
            createSocket: browserSocket,
            onLive: (up) => sync.current?.setLive(up),
            onChanged: (version) => sync.current?.changed(version),
          }),
        }
      : {}),
    onView: setView,
    onError: (err) => console.warn('refresh failed', err),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (h) => window.clearInterval(h),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h),
    now: () => Date.now(),
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
  // The numbers in tips follow this game's rules.
  setTipConfig(state.config);
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
  // The practice guide reads what the map shows (the flow and the view) to know its step.
  const snapshot = practice?.onSnapshot;
  useEffect(() => snapshot?.({ flow, view }), [snapshot, flow, view]);
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
  // Worked out while rendering the new view, so the map knows of a creature step in the same frame (it
  // holds the camera and walks the creature).
  const fresh = useMemo((): readonly Moment[] => {
    const prev = before.current;
    before.current = view;
    if (view.eventsTruncated || view.events.length === 0) return [];
    const keys = eventKeys(view.events);
    const unseen = view.events.filter((_, i) => !played.current.has(keys[i]!));
    for (const k of keys) played.current.add(k);
    // Forget keys for versions long past, so the set stays small.
    for (const k of played.current) {
      if (Number(k.split(':')[0]) < view.version - 200) played.current.delete(k);
    }
    // Milestone 5's events name things: a threat cleared or spent is gone from this view, so the view
    // before it places its moment.
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
    return momentsFromEvents(unseen, view.game.creature.centre, view.you.characterId ?? '', where);
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

  // Story cards (docs/design/story.md): the unread ones are `story.fired` minus what you have read, whether or
  // not an event came with them (a new game fires its opening beats without one). One plays on load; the rest
  // wait behind the badge. Never in the practice map. Reads go out in batches.
  const [story, setStory] = useState<StoryModel>(NO_STORY);
  const storyRef = useRef<StoryModel>(NO_STORY);
  storyRef.current = story;
  const storyAnchors = useRef(new Map<string, CardAnchor>());
  const toRead = useRef<string[]>([]);
  const readTimer = useRef(0);
  const flushReads = (): void => {
    window.clearTimeout(readTimer.current);
    const batches = readBatches(toRead.current);
    toRead.current = [];
    for (const ids of batches) {
      api.markStoryRead(ids).catch((err: unknown) => console.warn('story read not recorded', err));
    }
  };
  // Reads still waiting go out when the game closes or the page is hidden for good (a keepalive request).
  const flushRef = useRef(flushReads);
  flushRef.current = flushReads;
  useEffect(() => {
    const onHide = (): void => flushRef.current();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.clearTimeout(readTimer.current);
      flushRef.current();
    };
  }, []);
  const queueRead = (id: string): void => {
    toRead.current.push(id);
    window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(flushReads, READ_FLUSH_MS);
  };
  anchorsOf(view.events, storyAnchors.current);
  const unread = useMemo(
    () => (practice ? [] : unreadOf(view.game.story.fired, view.you.storyRead, story.shown)),
    [view, story.shown, practice],
  );

  // A plan made on an older view may no longer hold: drop it when the view changes under it.
  const planVersion = useRef(view.version);
  useEffect(() => {
    if (planVersion.current !== view.version) {
      planVersion.current = view.version;
      setFlow((f) => (f.kind === 'planned' || f.kind === 'lead' ? IDLE : f));
    }
  }, [view.version]);

  /**
   * Runs an action: its answer is the new view; a refusal refreshes and clears the plan. Answers the
   * server's refusal code (null when it went through or failed some other way).
   */
  async function act(
    run: () => Promise<PlayerView | ActionAnswer>,
    after: (v: PlayerView) => Flow,
  ): Promise<string | null> {
    if (busy) return null;
    setBusy(true);
    try {
      const before = view.version;
      const generation = sync.current!.generation;
      const next = await run();
      // An answer from before a new season belongs to the old game.
      if (generation !== sync.current!.generation) return null;
      planVersion.current = next.version;
      sync.current!.accept(next, generation);
      setFlow(after(next));
      // What others (and the tick) did since the view this action started from.
      void sync.current!.catchUp(before);
      return null;
    } catch (err) {
      if (!(err instanceof ApiError)) console.warn('action failed', err);
      setFlow(IDLE);
      await sync.current!.refresh();
      return err instanceof ApiError ? err.code : null;
    } finally {
      setBusy(false);
    }
  }

  const onConfirm = (): void => {
    if (flow.kind === 'lead' && flow.to) {
      // Leading the lure to the chosen hex; with leads and actions left its card stays for the next lead.
      const { id: lure, to } = flow;
      void act(
        () => api.act(view.version, { kind: 'lead', lure, to }),
        (next) => {
          const mine = next.game.characters.find((c) => c.id === next.you.characterId);
          const left = next.game.lures.find((l) => l.id === lure);
          return left && left.leadsLeft > 0 && mine && mine.actionsLeft > 0
            ? { kind: 'lure', id: lure }
            : IDLE;
        },
      );
      return;
    }
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

  // What you can do where you stand (gather, work a site, light a fire), a survey next to you, your pack,
  // and the hub (unlocks, feeding, lingering).
  const here = useMemo((): Here | null => {
    if (me?.status !== 'active' || me.at.kind !== 'hex') return null;
    const pinned = me.pinnedDay !== undefined;
    // Pinned, you cannot act: the card shows what you could do unpinned, all greyed with the reason.
    const state0 = pinned
      ? { ...state, characters: state.characters.map((c) => (c.id === me.id ? unpinned(c) : c)) }
      : state;
    const feature = featureArtAt(state, hexKey(me.at.hex));
    // Without fuel the fire still hints, faded, on a brazier or a burnable (the only places it can be lit).
    const fire = fireAction(state0, me.id, takesFire(state, me.at.hex));
    // Milestone 5: what you can do at the settlement you stand on (parley, offer, a boon).
    const settlement = settlementActions(state0, me.id).map((a): HereAction => ({
      kind: a.kind === 'offer' ? `offer:${a.uses ?? ''}` : a.kind,
      cost: a.cost,
      enabled: a.enabled,
      ...(a.kind === 'offer' ? { icon: 'offer', uses: a.uses ?? null } : {}),
      ...(a.kind.startsWith('boon:') ? { icon: a.kind.slice(5) } : {}),
      ...(a.odds ? { odds: a.odds } : {}),
      ...(a.why ? { why: a.why } : {}),
    }));
    // A tow line thrown to you: grab it (its own action, never forced).
    const grab = grabOption(state0, me.id);
    // A cart on your hex: its card (hitch, board, load) is one tap away, free.
    const cartHere = cartAt(state, me.at.hex);
    const offered = [
      ...(feature ? actionsAt(state0, me.id) : []),
      ...(cartHere
        ? [{ kind: 'cart', icon: 'cart', cost: 0, noArm: true, enabled: true } satisfies HereAction]
        : []),
      ...(fire ? [fire] : []),
      ...settlement,
      ...(grab
        ? [
            {
              kind: 'grab-line',
              icon: 'towline',
              cost: grab.cost,
              enabled: grab.enabled,
              ...(grab.why ? { why: grab.why } : {}),
            } satisfies HereAction,
          ]
        : []),
    ];
    // Pinned, the one thing you can do is struggle: first on the card, with its odds.
    const struggle = pinned ? struggleOption(state, me.id) : null;
    const actions: HereAction[] = pinned
      ? [
          ...(struggle
            ? [
                {
                  kind: 'struggle',
                  cost: struggle.cost,
                  enabled: struggle.enabled,
                  ...(struggle.odds ? { odds: struggle.odds } : {}),
                  ...(struggle.why ? { why: struggle.why } : {}),
                } satisfies HereAction,
              ]
            : []),
          ...greyedForPin(offered),
        ]
      : offered;
    // A settlement where you stand always opens the card (its attitude and the boon it gave), even with
    // nothing left to do there.
    const sid = settlementAt(state, me.at.hex);
    const place = sid ? settlementInfo(state, sid) : null;
    if (!feature && !place && actions.length === 0) return null;
    const terrain = terrainOf(state, me.at.hex)?.id ?? 'unknown';
    return { terrain, feature, actions, settlement: place };
  }, [state, me]);
  const stillSelected = (next: PlayerView): Flow => {
    const mine = next.game.characters.find((c) => c.id === next.you.characterId);
    return mine && mine.actionsLeft > 0 ? { kind: 'selected' } : IDLE;
  };
  const onAct = (kind: string): void => {
    if (kind === 'cart') {
      const here =
        me?.status === 'active' && me.at.kind === 'hex' ? cartAt(state, me.at.hex) : null;
      if (here) setFlow({ kind: 'cart', id: here.id });
    } else if (kind === 'grab-line') {
      void act(
        () => api.act(view.version, { kind }),
        () => IDLE,
      );
    } else if (
      kind === 'gather' ||
      kind === 'work-site' ||
      kind === 'light-fire' ||
      kind === 'parley'
    ) {
      void act(() => api.act(view.version, { kind }), stillSelected);
    } else if (kind === 'struggle') {
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
  // The lure's lead button: lead mode on (the hexes it can go to light up), or off again.
  const onLead = (): void =>
    setFlow((f) =>
      f.kind === 'lead'
        ? { kind: 'lure', id: f.id, ...(f.back ? { back: f.back } : {}) }
        : f.kind === 'lure'
          ? startLead(f)
          : f,
    );
  // The cart's card stays open through its actions, so the cart is seen to change.
  const onCart = (kind: 'hitch' | 'unhitch' | 'board-cart' | 'leave-cart'): void => {
    if (flow.kind !== 'cart') return;
    const keep: Flow = flow;
    void act(
      () => api.act(view.version, { kind }),
      () => keep,
    );
  };
  const onCartMove = (kind: 'load' | 'unload', material: string): void => {
    if (flow.kind !== 'cart') return;
    const keep: Flow = flow;
    void act(
      () => api.act(view.version, { kind, material, amount: 1 }),
      () => keep,
    );
  };
  // Throwing the line from the target's card: the card closes, and the line shows on their figure.
  const towOf = (id: string) => (me?.status === 'active' ? throwOption(state, me.id, id) : null);
  const onThrow = (to: string): void => {
    void act(
      () => api.act(view.version, { kind: 'throw-line', to }),
      () => IDLE,
    );
  };
  // Digging out a pinned character from their card: the card closes, and the stones lift on their hex.
  const digOf = (target: string) =>
    me?.status === 'active' ? digOption(state, me.id, target) : null;
  const onDig = (target: string): void => {
    void act(
      () => api.act(view.version, { kind: 'dig-out', target }),
      () => IDLE,
    );
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
  // Stances: choosing one is free and keeps whatever is open; waiting ends your day.
  const onStance = (stance: string): void => {
    void act(
      () => api.act(view.version, { kind: 'set-stance', stance }),
      () => flow,
    );
  };
  const onWait = (): void => {
    void act(
      () => api.act(view.version, { kind: 'wait' }),
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
      ? { stock: stockOf(me.pack), units: packUnits(me.pack), capacity: packCapacityOf(state, me) }
      : null;
  // The skill tree: only for an active character, and never over the join drawer or the hub.
  const skillsShown = skillsOpen && me?.status === 'active' && !drawerOpen && !hubOpen;
  useEffect(() => {
    if (hubOpen || drawerOpen) setSkillsOpen(false);
  }, [hubOpen, drawerOpen]);
  const onPickSkill = async (node: SkillNode): Promise<string | null> => {
    const code = await act(
      () => api.act(view.version, { kind: 'pick-skill', node: node.id }),
      () => IDLE,
    );
    // Only a refusal the web knows a reason for becomes a tip (a stale view just refreshes).
    return code !== null && Object.hasOwn(WHY_BY_REFUSAL, code) ? code : null;
  };
  const anyDrawer = drawerOpen || hubOpen || skillsShown;
  // One drawer at a time: the join drawer or the hub takes over from the roster. A character found from the
  // roster stops holding the map's centre once the roster closes.
  const rosterShown = rosterOpen && !anyDrawer;
  useEffect(() => {
    if (!rosterShown) setFocus((f) => (f.id === undefined ? f : { target: f.target, n: f.n }));
  }, [rosterShown]);
  useEffect(() => {
    if (anyDrawer) setRosterOpen(false);
  }, [anyDrawer]);
  const rows = useMemo(() => rosterRows(view, state.config.actionsPerDay), [view, state]);
  // A found character that is lost or gone: close its card and let go of the map's centre.
  useEffect(() => {
    const kept = keepFound(rows, flow, focus.id);
    if (kept.pinned === focus.id) return;
    setFlow(kept.flow);
    setFocus((f) => ({ target: f.target, n: f.n }));
  }, [rows, flow, focus.id]);
  /** Finds a player's character: centre on it (on the creature if riding) and open its card. */
  const onPickRow = (row: RosterRow): void => {
    if (!row.tappable || row.characterId === null) return;
    setMoments([]);
    setFocus((f) => ({ target: 'me', n: f.n + 1, id: row.characterId! }));
    // A rider's card continues the hub bubble's popup, in its place.
    setFlow(
      openCharacter(
        row.characterId,
        row.where === 'riding' ? { kind: 'bubble', selecting: false } : undefined,
      ),
    );
    setRosterPeek((n) => n + 1);
  };
  const ended = seasonEnd(state);
  // The map is free for a card when nothing else is open or moving on it.
  const storyFree =
    !practice &&
    flow.kind === 'idle' &&
    !anyDrawer &&
    !rosterShown &&
    !ended &&
    !fading &&
    step === null &&
    !guides?.recapDue;
  const applyStory = (r: Step): void => {
    if (r.model !== storyRef.current) {
      storyRef.current = r.model;
      setStory(r.model);
    }
    if (r.read !== null) queueRead(r.read);
  };
  useEffect(() => {
    applyStory(arrive(storyRef.current, unread, storyAnchors.current, storyFree, Date.now()));
  }, [unread, storyFree]);
  // A card never stays over a popover or a drawer that opens. Taken down too soon, it is unread again and
  // plays once the map is free.
  useEffect(() => {
    if (!storyFree) applyStory(closeByLoss(storyRef.current, Date.now()));
  }, [storyFree]);
  // A card up for a while counts as read even if no tap closes it.
  const playingId = story.playing?.id ?? null;
  useEffect(() => {
    if (playingId === null) return undefined;
    const t = window.setTimeout(
      () => applyStory(settle(storyRef.current, Date.now())),
      READ_AFTER_MS,
    );
    return () => window.clearTimeout(t);
  }, [playingId]);
  // A new game (a new season) starts the story afresh.
  const gameSeed = state.artSeed;
  const seedRef = useRef(gameSeed);
  useEffect(() => {
    if (seedRef.current === gameSeed) return;
    seedRef.current = gameSeed;
    storyAnchors.current.clear();
    storyRef.current = NO_STORY;
    setStory(NO_STORY);
  }, [gameSeed]);
  const onStoryBadge = (): void => {
    applyStory(tapBadge(storyRef.current, unread, storyAnchors.current, Date.now()));
  };
  const care = me
    ? [...careOptions(state, me.id), ...[defendOption(state, me.id)].filter((a) => a !== null)]
    : [];
  // Staging and local only (dev tools), admins: a new season after the end. Its view replaces this game's.
  // A new season that failed: the button shakes and fades back (no prose).
  const [seasonFailed, setSeasonFailed] = useState(0);
  const onNewSeason = (): void => {
    if (busy) return;
    setBusy(true);
    setSeasonFailed(0);
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
        setSeasonFailed((n) => n + 1);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <main
      class="game"
      data-coach={practice?.coach?.mark ?? undefined}
      data-coach-do={practice?.coach?.mark === 'act' ? practice.coach.action : undefined}
    >
      <MapView
        state={state}
        signs={signs}
        glints={view.glints}
        flow={flow}
        characterId={id}
        identities={who}
        onTap={(target: Target) => {
          // Moments are skippable: any tap clears them. A story card passes: the next tap closes it and
          // goes no further.
          setMoments([]);
          if (storyRef.current.playing) {
            applyStory(closeByTap(storyRef.current));
            return;
          }
          setFlow((f) => tap(f, state, id, target));
        }}
        moments={shownMoments}
        story={cardOf(story)}
        step={step}
        onConfirm={onConfirm}
        onOpenHub={() => setFlow(openHub())}
        onCharacter={(other) =>
          // From the bubble (or the hub it marks), the card continues in that same popup, with a back.
          setFlow((f) =>
            openCharacter(other, f.kind === 'bubble' || f.kind === 'creature' ? f : undefined),
          )
        }
        onBack={() => setFlow(goBack)}
        onPick={(key) =>
          setFlow((f) => {
            const entry = pickEntries(state, id, f.kind === 'pick' ? f.hex : { q: 0, r: 0 }).find(
              (e) => entryKey(e) === key,
            );
            return entry ? choose(state, id, f, entry) : f;
          })
        }
        onRightClick={() => setFlow((f) => rightClick(f, getSettings()))}
        focus={focus}
        coach={practice?.coach ?? null}
        coverBottom={
          rosterShown && rosterSnap === 'peek'
            ? peekCover(window.innerWidth, peekHeight())
            : anyDrawer || (rosterShown && rosterSnap !== 'peek')
              ? halfDrawerCover(window.innerWidth, window.innerHeight)
              : 0
        }
        here={here}
        onAct={onAct}
        surveyAt={surveyAt}
        onSurvey={onSurvey}
        onStrike={onStrike}
        towOf={towOf}
        onThrow={onThrow}
        digOf={digOf}
        onDig={onDig}
        onLead={onLead}
        onCart={onCart}
        onCartMove={onCartMove}
      />
      <PerilEdge peril={state.peril} max={state.config.perilMax} />
      <DayCountdown
        fastTickAt={view.fastTickAt}
        now={() => sync.current?.serverNow() ?? Date.now()}
      />
      <DayBanner day={view.day} />
      <Hud
        day={view.day}
        actionsLeft={me?.actionsLeft ?? 0}
        actionsPerDay={state.config.actionsPerDay}
        planned={flow.kind === 'planned' && isSelecting(flow) ? flow.cost : 0}
        lost={me?.status !== 'active'}
        snapped={shownMoments.some((m) => m.kind === 'trap' && m.mine)}
        pinned={me?.status === 'active' && me.pinnedDay !== undefined}
        warned={
          me?.status === 'active' &&
          me.at.kind === 'hex' &&
          cellStateAt(state, hexKey(me.at.hex)) === 'fading'
        }
        me={who.get(id) ?? null}
        onFocus={(target) => setFocus((f) => ({ target, n: f.n + 1 }))}
        onRoster={() => setRosterOpen((o) => !o)}
        skills={
          me?.status === 'active'
            ? {
                role: me.role,
                ...ringOf(state, me),
                ready: pickReady(state, me),
                onOpen: () => {
                  setFlow(IDLE);
                  setSkillsOpen(true);
                },
              }
            : null
        }
        menu={guides !== undefined}
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
        stance={
          me?.status === 'active' ? { stance: stanceView(state, me), onChoose: onStance } : null
        }
        wait={
          me?.status === 'active'
            ? { enabled: canWait(me) && !busy, waiting: me.waiting, onWait }
            : null
        }
        peril={{
          peril: state.peril,
          max: state.config.perilMax,
          woundedAt: state.config.perilWoundedAt,
          log: state.stats.peril,
        }}
        route={{ steps: state.creature.steps, length: state.config.routeLength }}
        story={badgeShown(story, unread) && storyFree ? { onTap: onStoryBadge } : null}
        jolt={moments.some((m) => m.kind === 'strike' || m.kind === 'hungry')}
        hungry={moments.some((m) => m.kind === 'hungry')}
        relieved={moments.some((m) => m.kind === 'relieved')}
      />
      {showsNextDay(view) && (
        <PaceToggle
          pace={view.pace}
          onToggle={() =>
            void act(
              () => api.setPace(view.pace === 'fast' ? 'daily' : 'fast'),
              () => IDLE,
            )
          }
        />
      )}
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
      {me?.status === 'active' && (
        <SkillDrawer
          open={skillsShown}
          onClose={() => setSkillsOpen(false)}
          state={state}
          me={me}
          busy={busy}
          onPick={onPickSkill}
        />
      )}
      <Roster
        open={rosterShown}
        rows={rows}
        selected={flow.kind === 'character' ? flow.id : null}
        peek={rosterPeek}
        onSnap={setRosterSnap}
        onPick={onPickRow}
        onClose={() => setRosterOpen(false)}
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
          recap={recapOf(view, who)}
          perilMax={state.config.perilMax}
          perilWoundedAt={state.config.perilWoundedAt}
          outcome={ended.outcome}
          title={view.ending?.title ?? ENDING_TITLES[ended.outcome]}
          line={view.ending?.line ?? null}
          days={ended.day}
          route={{ steps: state.creature.steps, length: state.config.routeLength }}
          onNewSeason={showsNextDay(view) ? onNewSeason : null}
          failed={seasonFailed}
          party={state.characters
            .filter((c) => c.status === 'active')
            .map((c) => {
              const w = who.get(c.id);
              return { accent: w?.accent ?? '', ...(w?.look ? { look: w.look } : {}) };
            })}
          busy={busy}
        />
      )}
      {guides && (
        <Guides
          api={api}
          initial={initial}
          view={view}
          seen={guides.seen}
          onSeen={guides.onSeen}
          hungry={moments.some((m) => m.kind === 'hungry')}
          covered={anyDrawer}
          recapDue={guides.recapDue}
          onRecapDone={guides.onRecapDone}
          onFocusCreature={() => setFocus((f) => ({ target: 'creature', n: f.n + 1 }))}
          onReplayIntro={guides.onReplayIntro}
          onPractice={guides.onPractice}
        />
      )}
      <TipLayer />
    </main>
  );
}
