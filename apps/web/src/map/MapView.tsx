/**
 * The map: the art kit's scene and the overlays in one SVG, panned and zoomed by a transform on one group.
 * Gestures update the view imperatively (no re-render per frame); taps find their hex by maths.
 */
import { hexCenter, paperGrain, renderScene } from '@behemoth-road/art';
import {
  type GameState,
  type Hex,
  predictCreature,
  reachableHexes,
  terrainIdAt,
} from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PALETTE, PROJECTION } from './art.ts';
import { cellStateAt, characterArts, creatureArt, sceneCells } from './cells.ts';
import { placePopover, splitScene } from './compose.ts';
import { MAP_TUNING } from './config.ts';
import type { Flow } from './flow.ts';
import { GestureTracker, type Gesture } from './gestures.ts';
import { buildOverlays, feetOf } from './overlays.ts';
import { pickHex, type Point } from './pick.ts';
import { CONFIRM_SIZE, ConfirmCard, INSPECT_SIZE, InspectCard } from './Popover.tsx';
import { toPreact } from './svgToPreact.ts';
import {
  centreOn,
  clampScale,
  inkZoomFor,
  lerpView,
  panBy,
  type Size,
  toScreen,
  toWorld,
  transformAttr,
  type View,
  zoomAt,
} from './view.ts';

export type FocusTarget = 'me' | 'creature';

export interface MapViewProps {
  readonly state: GameState;
  readonly flow: Flow;
  readonly characterId: string;
  readonly onTap: (hex: Hex) => void;
  readonly onConfirm: () => void;
  /** Recentre requests: a new `n` animates the view to the target. */
  readonly focus: { readonly target: FocusTarget; readonly n: number };
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

function targetPoint(state: GameState, characterId: string, target: FocusTarget): Point {
  const me = state.characters.find((c) => c.id === characterId);
  if (target === 'me' && me) return feetOf(p, me.position);
  return hexCenter(p, state.creature.centre.q, state.creature.centre.r);
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

export function MapView(props: MapViewProps): JSX.Element {
  const { state, flow, characterId } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const popRef = useRef<SVGGElement>(null);
  const confirmRef = useRef<SVGGElement | null>(null);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const size = useRef<Size>({ width: 0, height: 0 });
  const tracker = useRef(new GestureTracker(MAP_TUNING.tapSlop));
  const frame = useRef(0);
  const animation = useRef(0);
  const popover = useRef<{ hex: Hex; size: { width: number; height: number } } | null>(null);
  // The zoom the scene's ink widths were drawn for; changes only when a gesture settles at a new step.
  const [inkZoom, setInkZoom] = useState(1);
  const settleZoom = (): void => setInkZoom(inkZoomFor(view.current.scale));
  const latest = useRef(props);
  latest.current = props;

  // The scene depends on the game state only; overlays also on the flow.
  const layers = useMemo(() => {
    const scene = renderScene({
      cells: sceneCells(state),
      creature: creatureArt(state),
      characters: characterArts(state),
      projection: p,
      palette: PALETTE,
      seed: state.seed,
      zoom: inkZoom,
      minInkPx: MAP_TUNING.minInkPx,
      // No page frame: its edges would show while panning. The grain is drawn over the screen instead.
      frame: 'none',
    });
    const split = splitScene(scene);
    return {
      ground: split.ground.map(toPreact),
      figures: split.figures.map(toPreact),
    };
  }, [state, inkZoom]);

  const overlays = useMemo(() => {
    const selecting = flow.kind === 'selected' || flow.kind === 'planned';
    const o = buildOverlays({
      state,
      flow,
      characterId,
      reachable: selecting ? reachableHexes(state, characterId) : [],
      predicted: predictCreature(state),
      projection: p,
      palette: PALETTE,
    });
    return { under: o.under.map(toPreact), over: o.over.map(toPreact) };
  }, [state, flow, characterId]);

  popover.current =
    flow.kind === 'inspect'
      ? { hex: flow.hex, size: INSPECT_SIZE }
      : flow.kind === 'planned'
        ? { hex: flow.to, size: CONFIRM_SIZE }
        : null;

  function apply(): void {
    frame.current = 0;
    const v = view.current;
    worldRef.current?.setAttribute('transform', transformAttr(v));
    svgRef.current?.setAttribute('data-scale', v.scale.toFixed(3));
    const pop = popover.current;
    if (pop && popRef.current) {
      const c = hexCenter(p, pop.hex.q, pop.hex.r);
      const top = toScreen(v, { x: c.x, y: c.y - p.size * p.squash });
      const rect = placePopover(
        top,
        2 * p.size * p.squash * v.scale,
        pop.size,
        size.current,
        MAP_TUNING.popoverMargin,
      );
      popRef.current.setAttribute('transform', `translate(${rect.x} ${rect.y})`);
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

  function setLite(on: boolean): void {
    svgRef.current?.classList.toggle('lite', on);
  }

  function handle(gestures: readonly Gesture[]): void {
    for (const g of gestures) {
      switch (g.type) {
        case 'start':
          stopAnimation();
          setLite(true);
          break;
        case 'pan':
          view.current = panBy(view.current, g.dx, g.dy);
          break;
        case 'zoom':
          view.current = zoomAt(view.current, g.at, g.factor, LIMITS);
          break;
        case 'tap': {
          const { state: s, characterId: id } = latest.current;
          const me = s.characters.find((c) => c.id === id && c.status === 'active');
          latest.current.onTap(pickHex(p, toWorld(view.current, g.at), me?.position ?? null));
          break;
        }
        case 'end':
          setLite(false);
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
      size.current,
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

  // Wheel and trackpad zoom around the pointer. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let idle = 0;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      stopAnimation();
      setLite(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        setLite(false);
        settleZoom();
      }, 160);
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

  // A new day: follow the creature so the map scrolls under it. A new game: jump to the character.
  const previous = useRef({ seed: state.seed, centre: state.creature.centre, day: state.day });
  useEffect(() => {
    const before = previous.current;
    previous.current = { seed: state.seed, centre: state.creature.centre, day: state.day };
    if (before.seed !== state.seed || state.day < before.day) {
      stopAnimation();
      view.current = centreOn(
        targetPoint(state, characterId, 'me'),
        view.current.scale,
        size.current,
      );
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
  }, [state]);

  // Recentre buttons.
  const focusN = props.focus.n;
  useEffect(() => {
    if (focusN === 0) return;
    const { state: s, characterId: id, focus } = latest.current;
    animateTo(
      centreOn(targetPoint(s, id, focus.target), view.current.scale, size.current),
      MAP_TUNING.followMs,
    );
  }, [focusN]);

  // Place the popover, and move focus into it when it opens (out again when it closes).
  const popKey = popover.current
    ? `${flow.kind}:${popover.current.hex.q},${popover.current.hex.r}`
    : '';
  useLayoutEffect(() => {
    apply();
    if (popKey) {
      const target = flow.kind === 'planned' ? confirmRef.current : popRef.current;
      target?.focus({ preventScroll: true });
    } else if (popRef.current?.contains(document.activeElement)) {
      svgRef.current?.focus({ preventScroll: true });
    }
  }, [popKey]);

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
        terrain={known ? terrainIdAt(state.seed, flow.hex) : 'unknown'}
        state={cellState}
      />
    );
  } else if (flow.kind === 'planned') {
    card = (
      <ConfirmCard
        cost={flow.cost}
        onConfirm={props.onConfirm}
        buttonRef={(el) => {
          confirmRef.current = el;
        }}
      />
    );
  }

  return (
    <svg
      ref={svgRef}
      class="map"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <rect width="100%" height="100%" fill={PALETTE.paper} />
      <g ref={worldRef}>
        {layers.ground}
        {overlays.under}
        {layers.figures}
        {overlays.over}
      </g>
      <g class="grain">{GRAIN}</g>
      <g ref={popRef} class="popover" tabIndex={-1} onPointerDown={(e) => e.stopPropagation()}>
        {card}
      </g>
    </svg>
  );
}
