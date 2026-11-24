/**
 * The map: the art kit's scene and the overlays drawn into one world SVG inside an HTML layer, which pans
 * and zooms by a CSS transform, so the compositor moves the finished drawing instead of redrawing it every
 * frame. The world SVG is redrawn crisp when a gesture settles at a new zoom step. Above it, a static SVG
 * carries the paper grain and a full-screen SVG (`svg.map`) takes the pointer and holds the popover.
 * Gestures update the view imperatively (no re-render per frame); taps find their hex by maths.
 */
import {
  type FeatureArt,
  hexCenter,
  hexCorners,
  drawStoryVignette,
  paperGrain,
  renderSceneFramed,
  type SvgNode,
} from '@behemoth-road/art';
import {
  type CreatureSigns,
  directionOffset,
  type GameStateView,
  type Hex,
  terrainOf,
  predictCreature,
  forecastDays,
  hexEquals,
  hexesInRange,
  hexKey,
  placeKey,
  reachablePlaces,
} from '@behemoth-road/core';
import { Component, type ComponentChildren, type JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { armedAfter } from './arm.ts';
import { type Box, FrameCache, frameFrom } from './frame.ts';
import { drawOutOfReach, PALETTE, PROJECTION } from './art.ts';
import {
  cellStateAt,
  characterArts,
  creatureArt,
  featureArtAt,
  sceneCells,
  terrainKnown,
} from './cells.ts';
import { chevronFor, placeClear, placePopover, splitScene, trailClear } from './compose.ts';
import { fireHintAt } from '../game/chain.ts';
import { accentOf, type Identity, lookOf } from '../game/identity.ts';
import { type Moment, STEP_MS } from '../game/moments.ts';
import { MomentMark } from './MomentMark.tsx';
import { CoachLayer } from '../onboarding/CoachLayer.tsx';
import type { CoachMap } from '../onboarding/coach.ts';
import { mapTipAt, placeNoun, tileTipAt } from './mapTips.ts';
import type { TipId } from '../text/tips.ts';
import type { TipTarget } from '../ui/tip.ts';
import { holdEnded, onRightClick, TIPS } from '../ui/press.ts';
import { type StoryCard } from '../game/story.ts';
import { beatText, vignetteOf } from '../text/story.ts';
import { standingStones, traceTipAt } from '../game/traces.ts';
import { MAP_TUNING } from './config.ts';
import { type Flow, entryKey, isSelecting, pickEntries } from './flow.ts';
import { holdMs } from '../text/tips.ts';
import { GestureTracker, type Gesture } from './gestures.ts';
import { buildOverlays } from './overlays.ts';
import { figureFeet, pickableFeet, placePoint } from './figures.ts';
import { pickTarget, type Point, type Target, worldToHex } from './pick.ts';
import {
  HereCard,
  type HereAction,
  hereSize,
  inspectSize,
  Bubble,
  characterSize,
  CharacterCard,
  bubbleSize,
  actionKey,
  type Arming,
  CONFIRM_SIZE,
  ConfirmCard,
  InspectCard,
  SETTLEMENT_SIZE,
  SettlementCard,
  ThreatCard,
  threatSize,
  BackButton,
  Picker,
  type PickBubble,
  pickSize,
} from './Popover.tsx';
import {
  type SettlementInfo,
  settlementAt,
  settlementInfo,
  threatCard,
  threatMarks,
  threatNextPath,
} from '../game/season.ts';
import { setCssTransform } from './cssTransform.ts';
import { toPreact } from './svgToPreact.ts';
import {
  centreOn,
  clampScale,
  inkZoomFor,
  layerRaster,
  layerTransform,
  lerpView,
  panBy,
  type Frame,
  type Size,
  toScreen,
  toWorld,
  type View,
  zoomAt,
} from './view.ts';

export type FocusTarget = 'me' | 'creature';

/** Your own hex in the "here" card: its revealed feature (if any) and the actions it offers. */
export interface Here {
  readonly terrain: string;
  readonly feature: FeatureArt | null;
  readonly actions: readonly HereAction[];
  /** The settlement you stand on (drawn in place of the tile), if any. */
  readonly settlement?: SettlementInfo | null;
}

export interface MapViewProps {
  readonly state: GameStateView;
  /** What you read off the creature (your appetite sign, a keeper's cues); none by default. */
  readonly signs?: CreatureSigns | null;
  /** Hexes that glint for you (the scout's skill): drawn with the glint mark. Yours alone. */
  readonly glints?: readonly Hex[];
  readonly flow: Flow;
  readonly characterId: string;
  readonly onTap: (target: Target) => void;
  readonly onConfirm: () => void;
  /** The bubble's way into the hub was tapped. */
  readonly onOpenHub: () => void;
  /** Your own hex's revealed feature and the actions there, shown while you are selected. */
  readonly here?: Here | null;
  /** An action in the "here" card was tapped (the second tap that spends). */
  readonly onAct?: (kind: string) => void;
  /** Surveying a hex next to you: its cost and whether it can be done now, or null where it is not offered. */
  readonly surveyAt?: (h: Hex) => { readonly cost: number; readonly enabled: boolean } | null;
  /** The survey button on an inspect card was tapped. */
  readonly onSurvey?: (h: Hex) => void;
  /** The strike button on a threat's card was tapped. */
  readonly onStrike?: (threat: string) => void;
  /** The tow line: what throwing it to this character offers you (a rider with the line built), or null. */
  readonly towOf?: (
    id: string,
  ) => { readonly cost: number; readonly enabled: boolean; readonly why?: TipId } | null;
  /** The throw button on a character's card was tapped (the second tap that spends). */
  readonly onThrow?: (id: string) => void;
  /** Short visual beats to play on the map (reveals, finds, a trap); they end by themselves. */
  readonly moments?: readonly Moment[];
  /**
   * The creature's step being walked (from the tick's event), if any: the world layer leaves the creature
   * and its riders out while the moments layer walks them, and the camera follows only afterwards.
   */
  readonly step?: { readonly from: Hex; readonly to: Hex } | null;
  /** Another player's character in the bubble was tapped. */
  readonly onCharacter: (id: string) => void;
  /** The back button of a card opened inside another popup (a character from the bubble). */
  readonly onBack?: () => void;
  /** A bubble in the tile picker was tapped (its key: `me`, `character:id`, `threat:id`, `tile`). */
  readonly onPick?: (key: string) => void;
  /** Who each character is (names, roles, traits, quirks), from the player view. */
  readonly identities?: ReadonlyMap<string, Identity>;
  /** The map was right-clicked (the browser's menu is never shown over the map). */
  readonly onRightClick: () => void;
  /** Recentre requests: a new `n` animates the view to the target. */
  readonly focus: { readonly target: FocusTarget; readonly n: number; readonly id?: string };
  /**
   * Screen px covered at the bottom (a phone's half drawer). Centring then uses the space above it, and
   * a change recentres on your character (or the creature before you have one).
   */
  readonly coverBottom?: number;
  /** The story card passing now (anchored to the creature or a hex); the next tap anywhere closes it. */
  readonly story?: StoryCard | null;
  /** The practice map's guided day: what to light (glowing hexes, a ring, a ghost hand), and which part of the card to pulse. */
  readonly coach?: CoachMap | null;
}

/** Paper grain over the whole screen; it uses the filter defs in the scene (default id prefix). */
const GRAIN = toPreact(paperGrain(PALETTE));

const LIMITS = { min: MAP_TUNING.minZoom, max: MAP_TUNING.maxZoom };
const p = PROJECTION;

/**
 * The first zoom: on a phone, `fitRadius` hexes around the centre fill the screen; on a wide screen, the
 * whole window and one ring more, never above `wideMaxZoom`.
 */
export function fitScale(screen: Size, windowRadius: number): number {
  const wide = screen.width >= MAP_TUNING.wideFrom;
  const r = wide ? windowRadius + 1 : MAP_TUNING.fitRadius;
  const w = (r * 2 * 1.5 + 2) * p.size;
  const h = (r * 2 + 1) * Math.sqrt(3) * p.size * p.squash;
  const fit = Math.min(screen.width / w, screen.height / h);
  return clampScale(wide ? Math.min(fit, MAP_TUNING.wideMaxZoom) : fit, LIMITS);
}

/**
 * Where the first view looks: your character on a hex; otherwise (riding, or not joined yet) the creature
 * and the way ahead, `openAhead` hexes along its heading.
 */
function openingPoint(state: GameStateView, characterId: string): Point {
  const me = state.characters.find((c) => c.id === characterId);
  if (me?.status === 'active' && me.at.kind === 'hex') return targetPoint(state, characterId, 'me');
  const { centre, heading } = state.creature;
  const d = directionOffset(heading);
  const a = hexCenter(p, centre.q, centre.r);
  const b = hexCenter(p, centre.q + d.q, centre.r + d.r);
  const t = MAP_TUNING.openAhead;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function targetPoint(state: GameStateView, characterId: string, target: FocusTarget): Point {
  // A rider's figure is on the creature's back, so recentring on it centres on the creature.
  const feet = target === 'me' ? figureFeet(state, characterId, p) : null;
  if (feet) return feet;
  return hexCenter(p, state.creature.centre.q, state.creature.centre.r);
}

/** The characters riding the creature, in character order (the bubble lists them). */
const ridersOf = (state: GameStateView) =>
  state.characters.filter((c) => c.status === 'active' && c.at.kind === 'creature');

/** Where a popover points: the top of what it is about, and how far below that the thing ends (world px). */
interface Anchor {
  readonly key: string;
  readonly top: Point;
  readonly below: number;
  readonly size: { readonly width: number; readonly height: number };
  /** Below when the path arrives from above, so the card does not cover the arrow. */
  readonly prefer?: 'above' | 'below';
  /** A card about your own hex: these hexes (yours first, then its neighbours) stay uncovered. */
  readonly clear?: readonly Hex[];
}

/** The bubbles of a tile's picker: one per thing on it, each with its own drawing. */
function pickBubbles(state: GameStateView, characterId: string, hex: Hex): PickBubble[] {
  return pickEntries(state, characterId, hex).map((e): PickBubble => {
    const key = entryKey(e);
    if (e.kind === 'me' || e.kind === 'character') {
      const id = e.kind === 'me' ? characterId : e.id;
      return {
        key,
        kind: 'character',
        accent: accentOf(id, MAP_TUNING.accent),
        look: lookOf(id),
        ...(e.kind === 'me' ? { mine: true } : {}),
      };
    }
    if (e.kind === 'threat') {
      const t = state.threats.find((x) => x.id === e.id);
      const mark = threatMarks(state).find((x) => x.id === e.id);
      return {
        key,
        kind: 'threat',
        threat: { icon: mark?.icon ?? t?.type ?? '', type: t?.type ?? '' },
      };
    }
    const sid = settlementAt(state, hex);
    return {
      key,
      kind: 'tile',
      settlement: sid ? settlementInfo(state, sid) : null,
      terrain: terrainOf(state, hex)?.id ?? 'unknown',
      feature: featureArtAt(state, hexKey(hex)),
    };
  });
}

function popoverAnchor(
  state: GameStateView,
  flow: Flow,
  characterId: string,
  here: Here | null,
  survey: boolean,
  fire: boolean,
  tow: boolean,
): Anchor | null {
  const tile = 2 * p.size * p.squash;
  const me = state.characters.find((c) => c.id === characterId);
  const mine = me?.status === 'active' && me.at.kind === 'hex' ? me.at.hex : null;
  /** Your hex and its six neighbours, when the card is about your own hex. */
  const clearOf = (h: Hex | null): { clear?: readonly Hex[] } =>
    h && mine && hexEquals(h, mine)
      ? { clear: [mine, ...hexesInRange(mine, 1).filter((n) => !hexEquals(n, mine))] }
      : {};
  const bubbleAnchor = (size: { width: number; height: number }): Anchor => {
    // Above the creature's back, clear of its footprint.
    const c = hexCenter(p, state.creature.centre.q, state.creature.centre.r);
    const lift = tile * 1.5 + 0.5 * p.size;
    return { key: 'bubble', top: { x: c.x, y: c.y - lift }, below: lift + tile, size };
  };
  if (flow.kind === 'pick') {
    // Round bubbles above the tile (below it when there is no room above: the placement flips by itself).
    const c = hexCenter(p, flow.hex.q, flow.hex.r);
    const lift = 0.9 * p.size;
    const count = pickBubbles(state, characterId, flow.hex).length;
    return {
      key: `pick:${hexKey(flow.hex)}:${String(count)}`,
      top: { x: c.x, y: c.y - lift },
      below: lift + tile / 2,
      size: pickSize(count),
    };
  }
  if (flow.kind === 'character' && flow.back && flow.back.kind !== 'pick') {
    // Opened from the bubble: in the bubble's place, as the next step of the same popup.
    return {
      ...bubbleAnchor(characterSize(true, skillsOf(state, flow.id))),
      key: `bubble:character:${flow.id}`,
    };
  }
  if (flow.kind === 'character') {
    // Above the character's head, wherever it stands (on a hex or on the creature's back).
    const feet = figureFeet(state, flow.id, p);
    if (!feet) return null;
    const head = 0.9 * p.size;
    return {
      key: `character:${flow.id}:${flow.back ? 'back' : ''}${tow ? ':tow' : ''}`,
      top: { x: feet.x, y: feet.y - head },
      below: head,
      size: flow.back
        ? characterSize(true, skillsOf(state, flow.id))
        : characterSize(false, skillsOf(state, flow.id), tow),
    };
  }
  if (flow.kind === 'threat' || flow.kind === 'settlement') {
    const thing =
      flow.kind === 'threat'
        ? state.threats.find((t) => t.id === flow.id)
        : state.settlements.find((x) => x.id === flow.id);
    if (!thing) return null;
    const c = hexCenter(p, thing.hex.q, thing.hex.r);
    const strike = flow.kind === 'threat' ? threatCard(state, characterId, flow.id)?.strike : null;
    const lift = 0.9 * p.size;
    return {
      key: `${flow.kind}:${flow.id}:${strike ? String(strike.enabled) : ''}`,
      top: { x: c.x, y: c.y - lift },
      below: lift + tile / 2,
      size: flow.kind === 'threat' ? threatSize(Boolean(strike)) : SETTLEMENT_SIZE,
      ...clearOf(thing.hex),
      // A threat's card stays off its trail: its hex first, then the hexes it crosses at the next tick.
      ...(flow.kind === 'threat'
        ? trailClear(
            thing.hex,
            threatNextPath(state, flow.id, forecastDays(state)),
            clearOf(thing.hex).clear,
          )
        : {}),
    };
  }
  if (flow.kind === 'inspect') {
    const c = hexCenter(p, flow.hex.q, flow.hex.r);
    return {
      key: `inspect:${hexKey(flow.hex)}:${survey ? 'survey' : ''}:${fire ? 'fire' : ''}`,
      top: { x: c.x, y: c.y - tile / 2 },
      below: tile,
      size: inspectSize(survey, fire),
      ...clearOf(flow.hex),
    };
  }
  if (flow.kind === 'bubble' || flow.kind === 'creature') {
    // The hub's drawer opens with the bubble still open, marking the creature it is about.
    return bubbleAnchor(bubbleSize(ridersOf(state).length));
  }
  if (flow.kind === 'selected' && here) {
    // Your own hex's feature and actions, above your figure.
    const feet = figureFeet(state, characterId, p);
    if (feet) {
      const head = 0.9 * p.size;
      return {
        key: `here:${here.feature?.look ?? ''}:${here.settlement?.id ?? ''}:${here.actions.map((a) => a.kind).join(',')}`,
        top: { x: feet.x, y: feet.y - head },
        below: head,
        size: hereSize(here.actions.length),
        ...clearOf(mine),
      };
    }
  }
  if (flow.kind === 'planned') {
    // Above the figure's head where it would stand (its seat, for the creature).
    const feet = placePoint(state, characterId, flow.to, p);
    const head = 0.9 * p.size;
    const last = flow.steps[flow.steps.length - 2];
    const from = last
      ? placePoint(state, characterId, last.place, p)
      : (figureFeet(state, characterId, p) ?? feet);
    return {
      key: `planned:${placeKey(flow.to)}`,
      top: { x: feet.x, y: feet.y - head },
      below: head,
      size: CONFIRM_SIZE,
      prefer: from.y < feet.y ? 'below' : 'above',
    };
  }
  return null;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Renders its `nodes` and re-renders only when they are a new array, so a tap that changes the flow does not
 * make Preact walk the hundreds of scene elements again.
 */
class Static extends Component<{ nodes: ComponentChildren }> {
  override shouldComponentUpdate(next: { nodes: ComponentChildren }): boolean {
    return next.nodes !== this.props.nodes;
  }
  override render(): ComponentChildren {
    return this.props.nodes;
  }
}

/** Room around the scene's own frame for overlays that reach past it (world px, in hex sizes). */
const LAYER_MARGIN = 2;

/** How many skill nodes a character has taken (its card grows a row for them). */
const skillsOf = (state: GameStateView, id: string): number =>
  state.characters.find((c) => c.id === id)?.skills.taken.length ?? 0;

export function MapView(props: MapViewProps): JSX.Element {
  const { state, flow, characterId } = props;
  const signs = props.signs ?? null;
  const glints = props.glints;
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<SVGGElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  // The popover's chevron: its path data is set with the card's position, every frame it moves.
  const chevronFillRef = useRef<SVGPathElement>(null);
  const chevronEdgeRef = useRef<SVGPathElement>(null);
  // The control that takes focus when a popover opens (the confirm button, the bubble's hub entry).
  const popoverFocusRef = useRef<SVGGElement | null>(null);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const size = useRef<Size>({ width: 0, height: 0 });
  const tracker = useRef(new GestureTracker(MAP_TUNING.tapSlop, holdMs));
  const frame = useRef(0);
  const animation = useRef(0);
  const popover = useRef<Anchor | null>(null);
  // The card's armed action (the first of the two taps that spend); dropped when the card changes.
  const [armed, setArmed] = useState<string | null>(null);
  const arm: Arming = { armed, onArm: setArmed };
  // The zoom the scene's ink widths were drawn for; changes only when a gesture settles at a new step.
  const [inkZoom, setInkZoom] = useState(1);
  const settleZoom = (): void => setInkZoom(inkZoomFor(view.current.scale));
  const latest = useRef(props);
  latest.current = props;
  /** Measures the frame the map is seen in (the only place that reads layout for it). */
  const readFrame = (): Frame => {
    const rect = (el: Element | null | undefined): Box | null =>
      el?.getBoundingClientRect() ?? null;
    return frameFrom({
      size: size.current,
      map: rect(svgRef.current),
      hudTop: rect(document.querySelector('.hud-top')),
      pips: rect(document.querySelector('.hud-actions')),
      coverBottom: latest.current.coverBottom ?? 0,
      pad: MAP_TUNING.framePad,
    });
  };
  // Held between refreshes, so `apply` (every animation frame) reads no layout.
  const frameCache = useRef(new FrameCache(readFrame));
  /** The part of the screen the map is seen in: below the top HUD, above the pips and any drawer. */
  const seen = (): Frame => frameCache.current.get();

  // The scene depends on the game state only; overlays also on the flow.
  const walking = props.step != null;
  const layers = useMemo(() => {
    const { svg: scene, viewBox } = renderSceneFramed({
      cells: sceneCells(state, glints),
      ...(walking ? {} : { creature: creatureArt(state, signs) }),
      characters: characterArts(state, walking ? 'walkers' : 'all'),
      projection: p,
      palette: PALETTE,
      seed: state.artSeed,
      zoom: inkZoom,
      minInkPx: MAP_TUNING.minInkPx,
      // No page frame: its edges would show while panning. The grain is drawn over the screen instead.
      frame: 'none',
    });
    const split = splitScene(scene);
    const m = LAYER_MARGIN * p.size;
    const box = {
      x: viewBox.x - m,
      y: viewBox.y - m,
      width: viewBox.width + 2 * m,
      height: viewBox.height + 2 * m,
    };
    return {
      ground: split.ground.map((n: SvgNode) => toPreact(n)),
      figures: split.figures.map((n: SvgNode) => toPreact(n)),
      // The world layer: this box of world px, drawn at `raster` CSS px per world px.
      box,
      raster: layerRaster(inkZoom, box, window.devicePixelRatio, MAP_TUNING.layer),
    };
  }, [state, signs, glints, inkZoom, walking]);
  const stoneMemory = useRef(new Map<string, Hex>());
  const stones = useMemo(() => standingStones(state, stoneMemory.current), [state]);
  const layerRef = useRef(layers);
  layerRef.current = layers;

  const overlays = useMemo(() => {
    const selecting = isSelecting(flow);
    const o = buildOverlays({
      state,
      flow,
      characterId,
      reachable: selecting ? reachablePlaces(state, characterId) : [],
      predicted: predictCreature(state),
      projection: p,
      palette: PALETTE,
      zoom: inkZoom,
      stones,
    });
    return { under: o.under.map(toPreact), over: o.over.map(toPreact) };
  }, [state, flow, characterId, inkZoom, stones]);

  const survey = flow.kind === 'inspect' ? (props.surveyAt?.(flow.hex) ?? null) : null;
  const fireHint = flow.kind === 'inspect' ? fireHintAt(state, flow.hex) : null;
  popover.current = popoverAnchor(
    state,
    flow,
    characterId,
    props.here ?? null,
    survey !== null,
    fireHint !== null,
    flow.kind === 'character' && !flow.back && (props.towOf?.(flow.id) ?? null) !== null,
  );

  function apply(): void {
    frame.current = 0;
    const v = view.current;
    const world = worldRef.current;
    const layer = layerRef.current;
    if (world) setCssTransform(world, layerTransform(v, layer.raster, layer.box));
    // Read by the screenshot script to find hexes on screen.
    svgRef.current?.setAttribute(
      'data-view',
      `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.scale.toFixed(4)}`,
    );
    const pop = popover.current;
    if (pop && popRef.current) {
      // Placed inside the frame (clear of the HUD above and the pips below): placed in the frame's own
      // coordinates, then moved back to the screen's.
      const f = seen();
      const inFrame = (pt: Point): Point => ({ x: pt.x - f.x, y: pt.y - f.y });
      const placed = pop.clear
        ? placeClear(
            inFrame(toScreen(v, pop.top)),
            pop.below * v.scale,
            pop.size,
            f,
            MAP_TUNING.popoverMargin,
            pop.clear.map((h) =>
              hexCorners(p, hexCenter(p, h.q, h.r)).map((c) => inFrame(toScreen(v, c))),
            ),
          )
        : placePopover(
            inFrame(toScreen(v, pop.top)),
            pop.below * v.scale,
            pop.size,
            f,
            MAP_TUNING.popoverMargin,
            pop.prefer,
          );
      const rect = { ...placed, x: placed.x + f.x, y: placed.y + f.y };
      popRef.current.setAttribute('transform', `translate(${rect.x} ${rect.y})`);
      const chevron = chevronFor(rect, toScreen(v, pop.top), pop.below * v.scale);
      chevronFillRef.current?.setAttribute('d', chevron.fill);
      chevronEdgeRef.current?.setAttribute('d', chevron.edge);
    }
    placeStory(v);
  }

  /** The story card sits above its anchor like a popover, inside the frame, and never takes a tap. */
  function placeStory(v: View): void {
    const el = storyRef.current;
    const card = latest.current.story;
    if (!el || !card) return;
    const s = latest.current.state;
    const tile = 2 * p.size * p.squash;
    const at = card.anchor.kind === 'hex' ? card.anchor.hex : s.creature.centre;
    const c = hexCenter(p, at.q, at.r);
    const lift = card.anchor.kind === 'hex' ? tile / 2 : tile * 1.5 + 0.5 * p.size;
    const below = card.anchor.kind === 'hex' ? tile : lift + tile;
    const f = seen();
    const top = toScreen(v, { x: c.x, y: c.y - lift });
    const rect = placePopover(
      { x: top.x - f.x, y: top.y - f.y },
      below * v.scale,
      { width: el.offsetWidth, height: el.offsetHeight },
      f,
      MAP_TUNING.popoverMargin,
    );
    setCssTransform(
      el,
      `translate(${String(Math.round(rect.x + f.x))}px, ${String(Math.round(rect.y + f.y))}px)`,
    );
  }

  function requestApply(): void {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  }

  function stopAnimation(): void {
    if (animation.current) cancelAnimationFrame(animation.current);
    animation.current = 0;
  }

  function animateTo(target: View, ms: number): void {
    stopAnimation();
    const from = view.current;
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / ms);
      view.current = lerpView(from, target, easeOut(t));
      apply();
      animation.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    animation.current = requestAnimationFrame(step);
  }

  function handle(gestures: readonly Gesture[]): void {
    for (const g of gestures) {
      switch (g.type) {
        case 'start':
          stopAnimation();
          break;
        case 'pan':
          view.current = panBy(view.current, g.dx, g.dy);
          break;
        case 'zoom':
          view.current = zoomAt(view.current, g.at, g.factor, LIMITS);
          break;
        case 'tap': {
          const { state: s, characterId: id } = latest.current;
          const feet = pickableFeet(s, id, p);
          latest.current.onTap(pickTarget(p, toWorld(view.current, g.at), feet.mine, feet.others));
          break;
        }
        case 'end':
          settleZoom();
          break;
      }
    }
    requestApply();
  }

  const local = (e: PointerEvent | WheelEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  // Size, first view and resizing.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = (): Size => {
      const r = svg.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    size.current = measure();
    const s = latest.current.state;
    const frameNow = seen();
    view.current = centreOn(
      openingPoint(s, latest.current.characterId),
      fitScale(frameNow, s.config.windowRadius),
      frameNow,
    );
    apply();
    settleZoom();
    const observer = new ResizeObserver(() => {
      const next = measure();
      view.current = panBy(
        view.current,
        (next.width - size.current.width) / 2,
        (next.height - size.current.height) / 2,
      );
      size.current = next;
      frameCache.current.refresh();
      requestApply();
    });
    observer.observe(svg);
    // The HUD's own size moves the frame without the map resizing.
    for (const el of document.querySelectorAll('.hud-top, .hud-actions')) observer.observe(el);
    // A rotation or window resize moves the HUD and the map's position.
    const onResize = (): void => {
      frameCache.current.refresh();
      requestApply();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      observer.disconnect();
      stopAnimation();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // The frame moves with the drawer cover and when a flow (a drawer, a card) opens or closes.
  useLayoutEffect(() => {
    frameCache.current.refresh();
  }, [props.coverBottom, flow]);

  // A gesture must not outlive the window losing focus or being hidden (pointer-ups never arrive).
  useEffect(() => {
    const drop = (): void => handle(tracker.current.reset());
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') drop();
    };
    window.addEventListener('blur', drop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', drop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Wheel and trackpad zoom around the pointer. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let idle = 0;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      stopAnimation();
      window.clearTimeout(idle);
      idle = window.setTimeout(settleZoom, 160);
      const perPixel = e.ctrlKey ? MAP_TUNING.pinchWheelZoomPerPixel : MAP_TUNING.wheelZoomPerPixel;
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.current.height : 1;
      const factor = Math.exp(-e.deltaY * lines * perPixel);
      view.current = zoomAt(view.current, local(e), factor, LIMITS);
      requestApply();
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      window.clearTimeout(idle);
    };
  }, []);

  // A new day: follow the creature so the map scrolls under it. A new game, or a new character of
  // yours (joined or replaced): jump to it.
  const snapshot = () => ({
    game: state.artSeed,
    me: characterId,
    centre: state.creature.centre,
    day: state.day,
  });
  const previous = useRef(snapshot());
  const followTimer = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot();
    if (before.game !== state.artSeed || before.me !== characterId || state.day < before.day) {
      stopAnimation();
      view.current = centreOn(targetPoint(state, characterId, 'me'), view.current.scale, seen());
      requestApply();
      return;
    }
    if (
      before.centre.q === state.creature.centre.q &&
      before.centre.r === state.creature.centre.r
    ) {
      return;
    }
    const a = hexCenter(p, before.centre.q, before.centre.r);
    const b = hexCenter(p, state.creature.centre.q, state.creature.centre.r);
    const follow = (): void => {
      const v = view.current;
      animateTo(panBy(v, (a.x - b.x) * v.scale, (a.y - b.y) * v.scale), MAP_TUNING.followMs);
    };
    // While the creature walks its step, the camera holds still; then it eases after it.
    // (Its own timer: a later render of the same day must not cancel the follow.)
    window.clearTimeout(followTimer.current);
    const step = latest.current.step;
    if (step && step.to.q === state.creature.centre.q && step.to.r === state.creature.centre.r) {
      followTimer.current = window.setTimeout(follow, STEP_MS);
      return;
    }
    follow();
  }, [state, characterId]);
  useEffect(() => () => window.clearTimeout(followTimer.current), []);

  // A mouse right-click on the map dismisses (the press module has already closed any tip).
  useEffect(
    () =>
      onRightClick((e) => {
        if (!(e.target instanceof Node && svgRef.current?.contains(e.target))) return;
        e.preventDefault();
        latest.current.onRightClick();
      }),
    [],
  );

  // Recentre buttons.
  const focusN = props.focus.n;
  useEffect(() => {
    if (focusN === 0) return;
    const { state: s, characterId: id, focus } = latest.current;
    animateTo(
      centreOn(targetPoint(s, focus.id ?? id, focus.target), view.current.scale, seen()),
      MAP_TUNING.followMs,
    );
  }, [focusN]);

  // A drawer opened or closed over the map: keep what matters in the space still seen.
  const cover = props.coverBottom ?? 0;
  const firstCover = useRef(true);
  useEffect(() => {
    if (firstCover.current) {
      firstCover.current = false;
      return;
    }
    // A character found from the roster stays centred in the space still seen.
    const { state: s, characterId: id, focus } = latest.current;
    animateTo(
      centreOn(targetPoint(s, focus.id ?? id, 'me'), view.current.scale, seen()),
      MAP_TUNING.followMs,
    );
  }, [cover]);

  // A redrawn world layer (new zoom step or a new day) needs its transform in the same frame.
  useLayoutEffect(() => {
    apply();
  }, [layers]);

  // A story card passing: placed once it is drawn and its size is known.
  const storyId = props.story?.id ?? '';
  useLayoutEffect(() => {
    apply();
  }, [storyId]);

  // The card's enabled buttons, by arm key: a refresh that disables the armed one drops the arming.
  const enabledKeys: string[] =
    flow.kind === 'inspect'
      ? survey?.enabled
        ? ['survey']
        : []
      : flow.kind === 'selected' && props.here
        ? props.here.actions.filter((a) => a.enabled).map(actionKey)
        : flow.kind === 'threat' && threatCard(state, characterId, flow.id)?.strike?.enabled
          ? ['strike']
          : [];
  const enabledSig = enabledKeys.join('|');
  useLayoutEffect(() => {
    setArmed((a) => armedAfter(a, enabledKeys));
  }, [enabledSig]);

  // Place the popover, and move focus into it when it opens (out again when it closes).
  const popKey = popover.current?.key ?? '';
  useLayoutEffect(() => {
    setArmed(null);
    apply();
    if (popKey) {
      const target =
        flow.kind === 'planned' ||
        flow.kind === 'bubble' ||
        flow.kind === 'pick' ||
        (flow.kind === 'character' && flow.back !== undefined) ||
        flow.kind === 'selected' ||
        (flow.kind === 'inspect' && survey) ||
        (flow.kind === 'threat' && popKey.endsWith(':true'))
          ? popoverFocusRef.current
          : popRef.current;
      // A card without a button (a settlement with nothing left to do) takes focus itself.
      (target?.isConnected ? target : popRef.current)?.focus({ preventScroll: true });
    } else {
      // The popover's content is already gone, so its focused control may have dropped focus to the body.
      const a = document.activeElement;
      if (!a || a === document.body || popRef.current?.contains(a)) {
        svgRef.current?.focus({ preventScroll: true });
      }
    }
  }, [popKey]);

  // Tips on the map (a threat, a settlement, a struck or escorted character, a fire): a mouse resting on one,
  // or a finger held on one; a hold never becomes a tap.
  const hoverTip = useRef<TipId | null>(null);
  /** A trace or a standing stone on the hex: its tip, with who and which step as plain text under it. */
  const traceOrStoneTip = (hex: Hex): { id: TipId; extra?: () => JSX.Element } | null => {
    const s = latest.current.state;
    const trace = traceTipAt(s, hex, (cid) => latest.current.identities?.get(cid)?.name ?? null);
    if (trace) {
      return {
        id: trace.id,
        extra: () => (
          <span class="tip-trace" data-trace-tip>
            {trace.who !== null && <span class="tip-trace-who">{trace.who}</span>}
            <span class="tip-trace-step">{`Step ${String(trace.step)}`}</span>
          </span>
        ),
      };
    }
    return stoneMarks.some((x) => x.hex.q === hex.q && x.hex.r === hex.r)
      ? { id: 'map:standing-stone' }
      : null;
  };
  const stoneMarks = stones;
  const mapTip = (
    e: PointerEvent,
  ): { id: TipId; target: TipTarget; extra?: () => JSX.Element } | null => {
    const svg = svgRef.current;
    if (!svg || (e.target instanceof Node && popRef.current?.contains(e.target))) return null;
    const v = view.current;
    const hex = worldToHex(p, toWorld(v, local(e)));
    const id = mapTipAt(latest.current.state, hex);
    const found = id ? null : traceOrStoneTip(hex);
    if (!id && !found) return null;
    const tipId: TipId = id ?? found!.id;
    return {
      id: tipId,
      ...(found?.extra ? { extra: found.extra } : {}),
      target: {
        rect: () => {
          if (!svg.isConnected) return null;
          const box = svg.getBoundingClientRect();
          const c = toScreen(view.current, hexCenter(p, hex.q, hex.r));
          const s = view.current.scale * p.size;
          // The hex's top face and what stands on it (a figure, a threat).
          return {
            x: box.left + c.x - s,
            y: box.top + c.y - 1.1 * s,
            width: 2 * s,
            height: 1.6 * s,
          };
        },
        // Still what is there: a threat that moved or was cleared takes its tip with it.
        alive: () =>
          svg.isConnected &&
          (id ? mapTipAt(latest.current.state, hex) === id : traceOrStoneTip(hex) !== null),
        owns: (t) => t instanceof Node && svg.contains(t),
      },
    };
  };
  const unhoverTip = (): void => {
    if (hoverTip.current) TIPS.unhover(hoverTip.current);
    hoverTip.current = null;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // No compatibility mouse-down: its default focus move would pull focus out of a popover the tap opens.
    e.preventDefault();
    // A press holds the view still (a follow or recentre easing stops), so a tap lands where it was seen.
    stopAnimation();
    svgRef.current?.setPointerCapture(e.pointerId);
    unhoverTip();
    if (e.pointerType !== 'mouse') {
      const tip = tracker.current.count === 0 ? mapTip(e) : null;
      if (tip) TIPS.press(tip.id, tip.target, e.clientX, e.clientY, tip.extra);
      else TIPS.release();
    }
    handle(tracker.current.down(e.pointerId, local(e), e.timeStamp));
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      const tip = mapTip(e);
      if (tip?.id !== hoverTip.current) {
        unhoverTip();
        if (tip) {
          hoverTip.current = tip.id;
          TIPS.hover(tip.id, tip.target, tip.extra);
        }
      }
    }
    handle(tracker.current.move(e.pointerId, local(e)));
  };
  const onPointerUp = (e: PointerEvent): void => {
    // A hold that opened a tip is not a tap.
    // (The press module released the tip on this lift, before this ran, and says whether it was a hold.)
    if (e.pointerType !== 'mouse' && holdEnded()) {
      handle(tracker.current.cancel(e.pointerId));
      return;
    }
    handle(tracker.current.up(e.pointerId, local(e), e.timeStamp));
  };
  const onPointerCancel = (e: PointerEvent): void => {
    handle(tracker.current.cancel(e.pointerId));
  };

  let card: JSX.Element | null = null;
  // A card opened from the picker carries a back button at its top left corner, returning to it.
  const withBack = (inner: JSX.Element): JSX.Element =>
    'back' in flow && flow.back ? (
      <g data-back-card="true">
        {inner}
        <g transform="translate(-14 -14)">
          <BackButton
            onBack={() => props.onBack?.()}
            buttonRef={(el) => {
              popoverFocusRef.current = el;
            }}
          />
        </g>
      </g>
    ) : (
      inner
    );
  const mineAt = state.characters.find((c) => c.id === characterId)?.at;
  const mineHex = mineAt?.kind === 'hex' ? mineAt.hex : null;
  if (flow.kind === 'inspect') {
    const cellState = cellStateAt(state, `${flow.hex.q},${flow.hex.r}`);
    const known = terrainKnown(cellState);
    const at = flow.hex;
    card = (
      <InspectCard
        title={known ? placeNoun(state, flow.hex) : null}
        tileTip={known ? tileTipAt(state, flow.hex) : null}
        terrain={known ? (terrainOf(state, flow.hex)?.id ?? 'unknown') : 'unknown'}
        state={cellState}
        feature={known ? featureArtAt(state, hexKey(flow.hex)) : null}
        survey={survey}
        fire={fireHint}
        onSurvey={() => props.onSurvey?.(at)}
        arm={arm}
        surveyRef={(el) => {
          popoverFocusRef.current = el;
        }}
      />
    );
  } else if (flow.kind === 'selected' && props.here) {
    card = (
      <HereCard
        title={props.here.settlement?.name ?? (mineHex ? placeNoun(state, mineHex) : null)}
        tileTip={mineHex ? tileTipAt(state, mineHex) : null}
        terrain={props.here.terrain}
        feature={props.here.feature}
        actions={props.here.actions}
        onAct={(kind) => props.onAct?.(kind)}
        settlement={props.here.settlement ?? null}
        arm={arm}
        firstRef={(el) => {
          popoverFocusRef.current = el;
        }}
      />
    );
  } else if (flow.kind === 'threat') {
    const threat = threatCard(state, characterId, flow.id);
    const id = flow.id;
    if (threat) {
      card = (
        <ThreatCard
          threat={threat}
          onStrike={() => props.onStrike?.(id)}
          arm={arm}
          strikeRef={(el) => {
            popoverFocusRef.current = el;
          }}
        />
      );
    }
  } else if (flow.kind === 'settlement') {
    const settlement = settlementInfo(state, flow.id);
    if (settlement) card = <SettlementCard settlement={settlement} />;
  } else if (flow.kind === 'character') {
    const who = props.identities?.get(flow.id);
    if (who) {
      card = flow.back ? (
        <CharacterCard
          who={who}
          onBack={() => props.onBack?.()}
          backRef={(el) => {
            popoverFocusRef.current = el;
          }}
        />
      ) : (
        <CharacterCard
          who={who}
          tow={props.towOf?.(flow.id) ?? null}
          onThrow={() => props.onThrow?.(flow.id)}
          arm={arm}
        />
      );
    }
  } else if (flow.kind === 'bubble' || flow.kind === 'creature') {
    card = (
      <Bubble
        characters={ridersOf(state).map((c) => ({
          id: c.id,
          accent: accentOf(c.id, MAP_TUNING.accent),
          look: lookOf(c.id),
          other: c.id !== characterId,
          selected: c.id === characterId && flow.kind === 'bubble' && flow.selecting,
        }))}
        onCharacter={(id) => props.onCharacter(id)}
        place="creature"
        appetite={signs?.appetite ?? null}
        onOpenPlace={props.onOpenHub}
        placeRef={(el) => {
          popoverFocusRef.current = el;
        }}
      />
    );
  } else if (flow.kind === 'planned') {
    card = (
      <ConfirmCard
        cost={flow.cost}
        onConfirm={props.onConfirm}
        buttonRef={(el) => {
          popoverFocusRef.current = el;
        }}
      />
    );
  }

  if (flow.kind === 'pick') {
    card = (
      <Picker
        bubbles={pickBubbles(state, characterId, flow.hex)}
        onPick={(key) => props.onPick?.(key)}
        firstRef={(el) => {
          popoverFocusRef.current = el;
        }}
      />
    );
  } else if (
    card &&
    (flow.kind === 'inspect' || flow.kind === 'threat' || flow.kind === 'settlement')
  ) {
    card = withBack(card);
  }

  // Out of reach: a faded arrow from your feet ending in a cross on the tapped hex, fading by itself (CSS);
  // keyed by hex so a new tap plays it again.
  let outOfReach: JSX.Element | null = null;
  if (flow.kind === 'out-of-reach') {
    const feet = figureFeet(state, characterId, p);
    if (feet) {
      const to = hexCenter(p, flow.hex.q, flow.hex.r);
      outOfReach = (
        <g key={`oor:${hexKey(flow.hex)}`} class="out-of-reach">
          {toPreact(drawOutOfReach(PALETTE, feet, to, Math.max(p.k, p.k / inkZoom)))}
        </g>
      );
    }
  }

  const { box, raster } = layers;
  return (
    <div class="map-root" data-coach={props.coach?.mark ?? undefined}>
      <div ref={worldRef} class="map-world">
        <svg
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          width={box.width * raster}
          height={box.height * raster}
          aria-hidden="true"
        >
          <Static nodes={layers.ground} />
          {overlays.under}
          <Static nodes={layers.figures} />
          {overlays.over}
          {outOfReach}
          {props.coach && (
            <CoachLayer
              coach={props.coach}
              state={state}
              characterId={characterId}
              ink={Math.max(p.k, p.k / inkZoom)}
            />
          )}
        </svg>
        {props.moments && props.moments.length > 0 && (
          <svg
            class="map-moments"
            viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
            width={box.width * raster}
            height={box.height * raster}
            aria-hidden="true"
          >
            {props.moments.map((m, i) => (
              <MomentMark
                key={`${m.kind}:${m.hex.q},${m.hex.r}:${String(i)}`}
                moment={m}
                state={state}
                signs={signs}
              />
            ))}
          </svg>
        )}
      </div>
      {props.story && beatText(props.story.id) !== null && (
        <div
          ref={storyRef}
          class="story-card"
          role="status"
          data-story={props.story.id}
          data-anchor={props.story.anchor.kind}
        >
          <span class="story-art" aria-hidden="true">
            {toPreact(drawStoryVignette(PALETTE, vignetteOf(props.story.id), 132))}
          </span>
          <p class="story-text">{beatText(props.story.id)}</p>
        </div>
      )}
      <svg class="map-grain" aria-hidden="true">
        {GRAIN}
      </svg>
      <svg
        ref={svgRef}
        class="map"
        data-creature={`${state.creature.centre.q} ${state.creature.centre.r}`}
        data-projection={`${p.size} ${p.squash}`}
        tabindex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={unhoverTip}
        onLostPointerCapture={onPointerCancel}
      >
        <g
          ref={popRef}
          class="popover"
          tabindex={-1}
          onPointerDown={(e) => {
            // A lone press on the card stays on the card (its button clicks); a finger landing on it
            // while another is down on the map joins the pinch.
            if (tracker.current.count === 0) e.stopPropagation();
          }}
        >
          {card}
          {card && (
            <g class="pass-through">
              <path ref={chevronFillRef} fill={PALETTE.paper} />
              <path
                ref={chevronEdgeRef}
                fill="none"
                stroke={PALETTE.inkSoft}
                stroke-width={1.2}
                stroke-linejoin="round"
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
