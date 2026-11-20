/**
 * Tips on icons: `useTip(id)` gives the props to spread on any icon or control (HTML or SVG), and
 * `<TipLayer />` (rendered once, at the root) draws the one open tip: its title (the content name unless the
 * text file gives one) and a line or two of text, placed like the map's popovers, beside the thing and never
 * over it, with the same chevron. The texts live in `text/tips.ts`.
 */
import {
  DEFAULT_CONFIG,
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
import { type OpenTip, type TipAnchor, TipController } from './tip.ts';

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

const rectOf = (el: Element): TipAnchor => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

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

/** The props that give an icon or control its tip (nothing for a null id). */
export function tipProps(id: TipId | null): TipProps {
  if (id === null) return {};
  return {
    'data-tip': id,
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse') return;
      // The element now: by the time the delay ends, the event no longer has its current target.
      const el = e.currentTarget as Element;
      TIPS.hover(id, () => rectOf(el));
    },
    onPointerLeave: (e) => {
      if (e.pointerType === 'mouse') TIPS.unhover(id);
    },
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      const el = e.currentTarget as Element;
      TIPS.press(id, () => rectOf(el), e.clientX, e.clientY);
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
    const off = TIPS.subscribe(setOpen);
    // A click that ends a hold must not act; Escape closes the tip; a press elsewhere too.
    const onClick = (e: MouseEvent): void => {
      if (TIPS.takeClick()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') TIPS.close();
    };
    const onScroll = (): void => TIPS.close();
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      off();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onScroll);
    };
  }, []);

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
