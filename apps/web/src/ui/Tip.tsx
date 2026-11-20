/**
 * Tips on icons: `useTip(id)` gives the props to spread on any icon or control (HTML or SVG), and
 * `<TipLayer />` (rendered once, at the root) draws the one open tip: its title (the content name unless the
 * text file gives one; one document-level rule makes an icon that is not a button show its tip on a tap, see `isPlainIcon`) and a line or two of text, placed like the map's popovers, beside the thing and never
 * over it, with the same chevron. The texts live in `text/tips.ts`.
 */
import { contextMenuDismisses, isHeldClick, lastPress, watchPointers } from './pointer.ts';
import {
  DEFAULT_CONFIG,
  FEATURE_TYPES,
  MATERIALS,
  PEOPLE_TYPES,
  THREAT_TYPES,
  type TuningConfig,
  UNLOCKS,
} from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { TIP_TABLE, type TipId } from '../text/tips.ts';
import { fillTip, tipValues } from '../text/tipValues.ts';
import { chevronFor, placePopover } from '../map/compose.ts';
import { setCssTransform } from '../map/cssTransform.ts';
import { contentName } from './emblems.tsx';
import { type OpenTip, TipController, type TipTarget } from './tip.ts';

/** The app's one tip controller. */
export const TIPS = new TipController({
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h),
});

/** The numbers tips show, from the game's tuning (the defaults until a game is loaded). */
let values = tipValues(DEFAULT_CONFIG);
let valuesFor: TuningConfig = DEFAULT_CONFIG;

/** The game's tuning, so the numbers in tips follow it. */
export function setTipConfig(config: TuningConfig): void {
  if (config === valuesFor) return;
  valuesFor = config;
  values = tipValues(config);
}

/** A tip's target for an element: its rectangle while it is in the page, and its own clicks. */
export function elementTarget(el: Element): TipTarget {
  return {
    rect: () => {
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    },
    alive: () => el.isConnected,
    owns: (t) => t instanceof Node && el.contains(t),
  };
}

/** A tip's title: the one in the text file, else the content's own name, else the id. */
export function titleOf(id: TipId): string {
  const tip = TIP_TABLE[id];
  if (tip.title) return tip.title;
  const [kind = '', key = ''] = id.split(':');
  if (kind === 'role' || kind === 'trait' || kind === 'quirk') return contentName(kind, key);
  const named: readonly { readonly id: string; readonly name: string }[] =
    kind === 'material'
      ? MATERIALS
      : kind === 'unlock'
        ? UNLOCKS
        : kind === 'threat'
          ? THREAT_TYPES
          : kind === 'people'
            ? PEOPLE_TYPES
            : kind === 'feature'
              ? FEATURE_TYPES
              : [];
  return named.find((x) => x.id === key)?.name ?? key;
}

export interface TipProps {
  readonly 'data-tip'?: string;
  readonly onPointerEnter?: (e: PointerEvent) => void;
  readonly onPointerLeave?: (e: PointerEvent) => void;
  readonly onPointerDown?: (e: PointerEvent) => void;
  readonly onPointerMove?: (e: PointerEvent) => void;
  readonly onPointerUp?: (e: PointerEvent) => void;
  readonly onPointerCancel?: (e: PointerEvent) => void;
}

/** Things that act on a tap: an icon inside (or being) one of these is not a plain icon. */
const ACTS = 'button, a, [role=button], [role=option], [data-action], [data-acts]';

/** A tip icon that does nothing on tap (or says so with `data-tip-tap`): its tap shows the tip. */
export const isPlainIcon = (el: Element): boolean =>
  el.hasAttribute('data-tip-tap') || el.closest(ACTS) === null;

/** The props that give an icon or control its tip (nothing for a null id). */
export function tipProps(id: TipId | null): TipProps {
  if (id === null) return {};
  return {
    'data-tip': id,
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse') return;
      // The element now: by the time the delay ends, the event no longer has its current target.
      TIPS.hover(id, elementTarget(e.currentTarget as Element));
    },
    onPointerLeave: (e) => {
      if (e.pointerType === 'mouse') TIPS.unhover(id);
    },
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      TIPS.press(id, elementTarget(e.currentTarget as Element), e.clientX, e.clientY);
    },
    onPointerMove: (e) => {
      if (e.pointerType !== 'mouse') TIPS.move(e.clientX, e.clientY);
    },
    onPointerUp: (e) => {
      if (e.pointerType !== 'mouse') TIPS.release();
    },
    onPointerCancel: () => {
      TIPS.release();
    },
  };
}

/** The open tip, drawn once for the whole app. */
export function TipLayer(): JSX.Element | null {
  const [open, setOpen] = useState<OpenTip | null>(TIPS.open);
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const [chevron, setChevron] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    watchPointers();
    const off = TIPS.subscribe(setOpen);
    // A click that ends a hold must not act (only that thing's own click).
    const onClick = (e: MouseEvent): void => {
      // takeClick first: it must run to end the swallow. A touch press held past the hold time never acts.
      const swallowed = TIPS.takeClick(e.target);
      if (swallowed || isHeldClick(lastPress, e.timeStamp)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // One rule: an icon that is not a button shows its tip on a tap (touch or mouse), and the tap goes no further.
      const icon = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
      const id = icon?.getAttribute('data-tip');
      if (icon && id && isPlainIcon(icon)) {
        e.preventDefault();
        e.stopPropagation();
        TIPS.tap(id as TipId, elementTarget(icon));
      }
    };
    // Escape closes the tip and goes no further (an open drawer stays open).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && TIPS.open) {
        TIPS.close();
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    // A press anywhere but on a thing with a tip closes it (a tip's own thing manages its press itself).
    const onDown = (e: PointerEvent): void => {
      if (!TIPS.open) return;
      if (e.target instanceof Element && e.target.closest('[data-tip]')) return;
      TIPS.close();
    };
    // A wheel turn or a right-click closes it.
    const onDismiss = (): void => TIPS.close();
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('wheel', onDismiss, { passive: true });
    const onMenu = (): void => {
      if (contextMenuDismisses(lastPress.type)) TIPS.close();
    };
    document.addEventListener('contextmenu', onMenu, true);
    return () => {
      document.removeEventListener('contextmenu', onMenu, true);
      off();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', onDismiss);
    };
  }, []);

  // Its thing gone (a drawer closed under it): the tip goes too. Checked each frame only while one is open.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const check = (): void => {
      if (!open.alive()) TIPS.close();
      else frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Place it once its size is known: beside the thing (above, or below when there is no room), never over
  // it, inside the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const a = open.anchor;
    const top = { x: a.x + a.width / 2, y: a.y };
    const rect = placePopover(
      top,
      a.height,
      size,
      { width: window.innerWidth, height: window.innerHeight },
      8,
    );
    setCssTransform(
      el,
      `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`,
    );
    const c = chevronFor(rect, top, a.height);
    fill.current?.setAttribute('d', c.fill);
    edge.current?.setAttribute('d', c.edge);
    setChevron(size);
  }, [open]);

  if (!open) return null;
  const tip = TIP_TABLE[open.id];
  return (
    <div ref={box} class="tip" role="tooltip" data-tip-open={open.id}>
      <strong class="tip-title">{titleOf(open.id)}</strong>
      <span class="tip-text">{fillTip(tip.text, values)}</span>
      {typeof open.extra === 'function' && (open.extra as () => JSX.Element)()}
      <svg
        class="tip-chevron"
        aria-hidden="true"
        {...(chevron ? { viewBox: `0 0 ${String(chevron.width)} ${String(chevron.height)}` } : {})}
      >
        <path ref={fill} class="tip-chevron-fill" />
        <path ref={edge} class="tip-chevron-edge" />
      </svg>
    </div>
  );
}
