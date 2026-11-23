/**
 * The day readout's hold menu: replay the intro, or practise again. A small popover under the readout
 * (like the tips' look, placed the same way), opened by holding the readout (`press.ts` sends the event).
 * It is a popover with things to tap, so it is not a tip: a tap outside, Escape, or choosing an entry
 * closes it. Focus moves in and out without a ring.
 */
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chevronFor, placePopover } from '../map/compose.ts';
import { setCssTransform } from '../map/cssTransform.ts';
import { HOLD_MENU_EVENT, type HoldMenuDetail } from '../ui/press.ts';
import { ArtIcon } from './art.tsx';

export interface DayMenuProps {
  readonly onReplayIntro: () => void;
  readonly onPractice: () => void;
}

export function DayMenu({ onReplayIntro, onPractice }: DayMenuProps): JSX.Element | null {
  const [anchor, setAnchor] = useState<HoldMenuDetail | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // The readout was held.
  useEffect(() => {
    const onHold = (e: Event): void => setAnchor((e as CustomEvent<HoldMenuDetail>).detail);
    document.addEventListener(HOLD_MENU_EVENT, onHold);
    return () => document.removeEventListener(HOLD_MENU_EVENT, onHold);
  }, []);

  // Closes on a press outside it (the press that follows the hold's own lift is outside too, but it has
  // not happened yet when the menu opens) and on Escape.
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return;
      setAnchor(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setAnchor(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor]);

  // Focus moves in on open, and out on close.
  useEffect(() => {
    if (!anchor) return;
    box.current?.focus({ preventScroll: true });
    return () => {
      if (box.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    };
  }, [anchor]);

  // Placed once its size is known: below the readout, inside the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!anchor || !el) return;
    const s = { width: el.offsetWidth, height: el.offsetHeight };
    const top = { x: anchor.x + anchor.width / 2, y: anchor.y };
    const rect = placePopover(
      top,
      anchor.height,
      s,
      { width: window.innerWidth, height: window.innerHeight },
      8,
      'below',
    );
    setCssTransform(
      el,
      `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`,
    );
    const c = chevronFor(rect, top, anchor.height);
    fill.current?.setAttribute('d', c.fill);
    edge.current?.setAttribute('d', c.edge);
    setSize(s);
  }, [anchor]);

  if (!anchor) return null;
  const pick = (run: () => void) => (): void => {
    setAnchor(null);
    run();
  };
  return (
    <div ref={box} class="tip day-menu" role="menu" aria-label="Day menu" tabindex={-1}>
      <button
        type="button"
        class="day-menu-item"
        role="menuitem"
        data-menu="intro"
        onClick={pick(onReplayIntro)}
      >
        <ArtIcon id="sun" size={28} />
        <span>Replay the intro</span>
      </button>
      <button
        type="button"
        class="day-menu-item"
        role="menuitem"
        data-menu="practice"
        onClick={pick(onPractice)}
      >
        <ArtIcon id="boot" size={28} />
        <span>Practise again</span>
      </button>
      <svg
        class="tip-chevron"
        aria-hidden="true"
        {...(size ? { viewBox: `0 0 ${String(size.width)} ${String(size.height)}` } : {})}
      >
        <path ref={fill} class="tip-chevron-fill" />
        <path ref={edge} class="tip-chevron-edge" />
      </svg>
    </div>
  );
}
