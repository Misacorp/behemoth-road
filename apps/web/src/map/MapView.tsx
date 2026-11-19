/**
 * The map: the art kit's scene and the overlays drawn into one world SVG inside an HTML layer, which pans
 * and zooms by a CSS transform, so the compositor moves the finished drawing instead of redrawing it every
 * frame. The world SVG is redrawn crisp when a gesture settles at a new zoom step. Above it, a static SVG
 * carries the paper grain and a full-screen SVG (`svg.map`) takes the pointer and holds the popover.
 * Gestures update the view imperatively (no re-render per frame); taps find their hex by maths.
 */
import { hexCenter, paperGrain, renderSceneFramed, type SvgNode } from '@behemoth-road/art';
import {
  type GameStateView,
  terrainOf,
  predictCreature,
  hexKey,
  placeKey,
  reachablePlaces,
} from '@behemoth-road/core';
import { Component, type ComponentChildren, type JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PALETTE, PROJECTION } from './art.ts';
import { cellStateAt, characterArts, creatureArt, sceneCells } from './cells.ts';
import { chevronFor, placePopover, splitScene } from './compose.ts';
import { accentOf, type Identity, lookOf } from '../game/identity.ts';
import { MAP_TUNING } from './config.ts';
import { type Flow, isSelecting } from './flow.ts';
import { GestureTracker, type Gesture } from './gestures.ts';
import { buildOverlays } from './overlays.ts';
import { figureFeet, pickableFeet, placePoint } from './figures.ts';
import { pickTarget, type Point, type Target } from './pick.ts';
import {
  Bubble,
  CHARACTER_SIZE,
  CharacterCard,
  bubbleSize,
  CONFIRM_SIZE,
  ConfirmCard,
  CREATURE_SIZE,
  CreatureCard,
  INSPECT_SIZE,
  InspectCard,
} from './Popover.tsx';
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
  type Size,
  toScreen,
  toWorld,
  type View,
  zoomAt,
} from './view.ts';

export type FocusTarget = 'me' | 'creature';

export interface MapViewProps {
  readonly state: GameStateView;
  readonly flow: Flow;
  readonly characterId: string;
  readonly onTap: (target: Target) => void;
  readonly onConfirm: () => void;
  /** The bubble's way into the hub was tapped. */
  readonly onOpenHub: () => void;
  /** Another player's character in the bubble was tapped. */
  readonly onCharacter: (id: string) => void;
  /** Who each character is (names, roles, traits, quirks), from the player view. */
  readonly identities?: ReadonlyMap<string, Identity>;
  /** The map was right-clicked (the browser's menu is never shown over the map). */
  readonly onRightClick: () => void;
  /** Recentre requests: a new `n` animates the view to the target. */
  readonly focus: { readonly target: FocusTarget; readonly n: number };
  /**
   * Screen px covered at the bottom (a phone's half drawer). Centring then uses the space above it, and
   * a change recentres on your character (or the creature before you have one).
   */
  readonly coverBottom?: number;
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
}

function popoverAnchor(state: GameStateView, flow: Flow, characterId: string): Anchor | null {
  const tile = 2 * p.size * p.squash;
  if (flow.kind === 'character') {
    // Above the character's head, wherever it stands (on a hex or on the creature's back).
    const feet = figureFeet(state, flow.id, p);
    if (!feet) return null;
    const head = 0.9 * p.size;
    return {
      key: `character:${flow.id}`,
      top: { x: feet.x, y: feet.y - head },
      below: head,
      size: CHARACTER_SIZE,
    };
  }
  if (flow.kind === 'inspect') {
    const c = hexCenter(p, flow.hex.q, flow.hex.r);
    return {
      key: `inspect:${hexKey(flow.hex)}`,
      top: { x: c.x, y: c.y - tile / 2 },
      below: tile,
      size: INSPECT_SIZE,
    };
  }
  if (flow.kind === 'creature' || flow.kind === 'bubble') {
    // Above the creature's back, clear of its footprint.
    const c = hexCenter(p, state.creature.centre.q, state.creature.centre.r);
    const lift = tile * 1.5 + 0.5 * p.size;
    return {
      key: flow.kind,
      top: { x: c.x, y: c.y - lift },
      below: lift + tile,
      size: flow.kind === 'bubble' ? bubbleSize(ridersOf(state).length) : CREATURE_SIZE,
    };
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

export function MapView(props: MapViewProps): JSX.Element {
  const { state, flow, characterId } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<SVGGElement>(null);
  // The popover's chevron: its path data is set with the card's position, every frame it moves.
  const chevronFillRef = useRef<SVGPathElement>(null);
  const chevronEdgeRef = useRef<SVGPathElement>(null);
  // The control that takes focus when a popover opens (the confirm button, the bubble's hub entry).
  const popoverFocusRef = useRef<SVGGElement | null>(null);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const size = useRef<Size>({ width: 0, height: 0 });
  const tracker = useRef(new GestureTracker(MAP_TUNING.tapSlop));
  const frame = useRef(0);
  const animation = useRef(0);
  const popover = useRef<Anchor | null>(null);
  // The zoom the scene's ink widths were drawn for; changes only when a gesture settles at a new step.
  const [inkZoom, setInkZoom] = useState(1);
  const settleZoom = (): void => setInkZoom(inkZoomFor(view.current.scale));
  const latest = useRef(props);
  latest.current = props;
  /** The part of the screen the map is seen in: all of it, less what a drawer covers. */
  const seen = (): Size => ({
    width: size.current.width,
    height: Math.max(1, size.current.height - (latest.current.coverBottom ?? 0)),
  });

  // The scene depends on the game state only; overlays also on the flow.
  const layers = useMemo(() => {
    const { svg: scene, viewBox } = renderSceneFramed({
      cells: sceneCells(state),
      creature: creatureArt(state),
      characters: characterArts(state),
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
  }, [state, inkZoom]);
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
    });
    return { under: o.under.map(toPreact), over: o.over.map(toPreact) };
  }, [state, flow, characterId, inkZoom]);

  popover.current = popoverAnchor(state, flow, characterId);

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
      const rect = placePopover(
        toScreen(v, pop.top),
        pop.below * v.scale,
        pop.size,
        size.current,
        MAP_TUNING.popoverMargin,
        pop.prefer,
      );
      popRef.current.setAttribute('transform', `translate(${rect.x} ${rect.y})`);
      const chevron = chevronFor(rect, toScreen(v, pop.top), pop.below * v.scale);
      chevronFillRef.current?.setAttribute('d', chevron.fill);
      chevronEdgeRef.current?.setAttribute('d', chevron.edge);
    }
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
    view.current = centreOn(
      targetPoint(s, latest.current.characterId, 'me'),
      fitScale(size.current, s.config.windowRadius),
      seen(),
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
      requestApply();
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
      stopAnimation();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

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
    const v = view.current;
    animateTo(panBy(v, (a.x - b.x) * v.scale, (a.y - b.y) * v.scale), MAP_TUNING.followMs);
  }, [state, characterId]);

  // Recentre buttons.
  const focusN = props.focus.n;
  useEffect(() => {
    if (focusN === 0) return;
    const { state: s, characterId: id, focus } = latest.current;
    animateTo(
      centreOn(targetPoint(s, id, focus.target), view.current.scale, seen()),
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
    const { state: s, characterId: id } = latest.current;
    animateTo(centreOn(targetPoint(s, id, 'me'), view.current.scale, seen()), MAP_TUNING.followMs);
  }, [cover]);

  // A redrawn world layer (new zoom step or a new day) needs its transform in the same frame.
  useLayoutEffect(() => {
    apply();
  }, [layers]);

  // Place the popover, and move focus into it when it opens (out again when it closes).
  const popKey = popover.current?.key ?? '';
  useLayoutEffect(() => {
    apply();
    if (popKey) {
      const target =
        flow.kind === 'planned' || flow.kind === 'bubble'
          ? popoverFocusRef.current
          : popRef.current;
      target?.focus({ preventScroll: true });
    } else {
      // The popover's content is already gone, so its focused control may have dropped focus to the body.
      const a = document.activeElement;
      if (!a || a === document.body || popRef.current?.contains(a)) {
        svgRef.current?.focus({ preventScroll: true });
      }
    }
  }, [popKey]);

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // No compatibility mouse-down: its default focus move would pull focus out of a popover the tap opens.
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    handle(tracker.current.down(e.pointerId, local(e)));
  };
  const onPointerMove = (e: PointerEvent): void =>
    handle(tracker.current.move(e.pointerId, local(e)));
  const onPointerUp = (e: PointerEvent): void => handle(tracker.current.up(e.pointerId, local(e)));
  const onPointerCancel = (e: PointerEvent): void => handle(tracker.current.cancel(e.pointerId));

  let card: JSX.Element | null = null;
  if (flow.kind === 'inspect') {
    const cellState = cellStateAt(state, `${flow.hex.q},${flow.hex.r}`);
    const known = cellState === 'seen' || cellState === 'fading';
    card = (
      <InspectCard
        terrain={known ? (terrainOf(state, flow.hex)?.id ?? 'unknown') : 'unknown'}
        state={cellState}
      />
    );
  } else if (flow.kind === 'creature') {
    card = <CreatureCard state={state} />;
  } else if (flow.kind === 'character') {
    const who = props.identities?.get(flow.id);
    if (who) card = <CharacterCard who={who} />;
  } else if (flow.kind === 'bubble') {
    card = (
      <Bubble
        characters={ridersOf(state).map((c) => ({
          id: c.id,
          accent: accentOf(c.id, MAP_TUNING.accent),
          look: lookOf(c.id),
          other: c.id !== characterId,
          selected: c.id === characterId && flow.selecting,
        }))}
        onCharacter={(id) => props.onCharacter(id)}
        place="creature"
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

  const { box, raster } = layers;
  return (
    <div class="map-root">
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
        </svg>
      </div>
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
        onContextMenu={(e) => {
          e.preventDefault();
          props.onRightClick();
        }}
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
            <>
              <path ref={chevronFillRef} fill={PALETTE.paper} />
              <path
                ref={chevronEdgeRef}
                fill="none"
                stroke={PALETTE.inkSoft}
                stroke-width={1.2}
                stroke-linejoin="round"
              />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
