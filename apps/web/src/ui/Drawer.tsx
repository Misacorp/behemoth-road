/**
 * The drawer, the app's larger view. On phones it is one bottom drawer with two heights (half and full):
 * drag its handle up or down to move between them, and down from half to close. On desktop it slides in
 * from the left or right and scrolls where its content is tall. Focus moves into it when it opens and
 * back to the control that opened it when it closes, without outlines. On desktop it also closes by a mouse
 * click on the map outside it and by a small cross in its top corner. Only one drawer is open at a time.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setCssTransform } from '../map/cssTransform.ts';
import { PALETTE } from '../map/art.ts';
import { onRightClick } from './press.ts';
import { getSettings } from '../settings.ts';
import { closesOnRightClick, DESKTOP_QUERY, onMapSurface, OutsidePress } from './dismiss.ts';

export type Snap = 'peek' | 'half' | 'full';

/** What a vertical drag of `dy` px (positive is down) does from `snap`, given a slop. */
export function snapAfterDrag(snap: Snap, dy: number, slop = 48): Snap | 'close' | null {
  if (snap === 'peek') return dy <= -slop ? 'half' : dy >= slop ? 'close' : null;
  if (dy <= -slop) return snap === 'half' ? 'full' : null;
  if (dy >= slop) return snap === 'full' ? 'half' : 'close';
  return null;
}

export interface DrawerProps {
  readonly open: boolean;
  /** Closing is offered (handle, Escape) only when this is given. */
  readonly onClose?: () => void;
  /** Desktop side. Phones always use the bottom drawer. */
  readonly side?: 'left' | 'right';
  readonly label: string;
  /** Each increase lowers the phone drawer to a peek, so the map shows (the desktop drawer is unchanged). */
  readonly peek?: number;
  /** Told the height the phone drawer settles at, on open and after each change. */
  readonly onSnap?: (snap: Snap) => void;
  readonly children: ComponentChildren;
}

export function Drawer(props: DrawerProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const drag = useRef<{ id: number; y0: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Focus in on open, and back to the opener on every way of closing, without a ring (the stylesheet draws
  // none). In goes to `[data-autofocus]`, else the first control in the body (never the close cross).
  useEffect(() => {
    if (!props.open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    const body = ref.current?.querySelector('.drawer-body');
    const first =
      body?.querySelector<HTMLElement>('[data-autofocus]') ??
      body?.querySelector<HTMLElement>('button, [tabindex], a[href]');
    (first ?? ref.current)?.focus({ preventScroll: true });
    setSnap('half');
    return () => {
      const back = opener.current;
      if (back?.isConnected) back.focus({ preventScroll: true });
      else if (ref.current?.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
    };
  }, [props.open]);

  // A request to peek (a row was tapped); the count at open is the baseline.
  const peeked = useRef(props.peek ?? 0);
  useEffect(() => {
    if (!props.open) return;
    const n = props.peek ?? 0;
    if (n > peeked.current) setSnap('peek');
    peeked.current = n;
  }, [props.open, props.peek]);
  const told = useRef(props.onSnap);
  told.current = props.onSnap;
  useEffect(() => {
    if (props.open) told.current?.(snap);
  }, [props.open, snap]);

  useEffect(() => {
    if (!props.open || !props.onClose) return;
    const close = props.onClose;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  // Desktop, mouse: a click on the map outside the drawer closes it and does nothing else; a drag that
  // starts there closes it and still pans (see `dismiss.ts`).
  useEffect(() => {
    if (!props.open || !props.onClose) return;
    const close = props.onClose;
    const outside = new OutsidePress();
    let swallow: ((c: MouseEvent) => void) | null = null;
    const dropSwallow = (): void => {
      if (swallow) window.removeEventListener('click', swallow, true);
      window.removeEventListener('pointerdown', dropSwallow, true);
      swallow = null;
    };
    const wide = (): boolean => window.matchMedia(DESKTOP_QUERY).matches;
    const onDown = (e: PointerEvent): void => {
      dropSwallow();
      if (!wide()) return;
      const target = e.target instanceof Element ? e.target : null;
      outside.down({
        pointerType: e.pointerType,
        button: e.button,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        onMap: onMapSurface(target),
      });
    };
    const onMove = (e: PointerEvent): void => {
      if (outside.move(e.pointerId, e.clientX, e.clientY) === 'close') close();
    };
    const onUp = (e: PointerEvent): void => {
      if (outside.up(e.pointerId) !== 'close-and-swallow') return;
      e.stopPropagation();
      // The click this same press ends in goes nowhere; the next press (or a cancel) drops the catch.
      swallow = (c: MouseEvent): void => {
        c.stopPropagation();
        c.preventDefault();
        dropSwallow();
      };
      window.addEventListener('click', swallow, true);
      window.addEventListener('pointerdown', dropSwallow, { capture: true, once: true });
      close();
    };
    const onCancel = (e: PointerEvent): void => {
      outside.cancel(e.pointerId);
      dropSwallow();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    // A mouse right-click on the map closes it too, when the settings allow (the press module announces it).
    const offRight = onRightClick((e) => {
      if (!wide()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (closesOnRightClick(onMapSurface(target), getSettings())) close();
    });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      offRight();
      // A click already on its way (this very press closed the drawer) is still swallowed, once.
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  const onPointerDown = (e: PointerEvent): void => {
    drag.current = { id: e.pointerId, y0: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ref.current) return;
    setCssTransform(ref.current, `translateY(${String(Math.max(-80, e.clientY - d.y0))}px)`);
  };
  const onPointerUp = (e: PointerEvent): void => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ref.current) return;
    setCssTransform(ref.current, '');
    const next = snapAfterDrag(snap, e.clientY - d.y0);
    if (next === 'close') {
      if (props.onClose) props.onClose();
    } else if (next) setSnap(next);
  };

  return (
    <div
      ref={ref}
      class={`drawer drawer-${props.side ?? 'left'}`}
      data-snap={snap}
      role="dialog"
      aria-label={props.label}
      tabindex={-1}
    >
      <div
        class="drawer-handle"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span />
      </div>
      {props.onClose && (
        <button type="button" class="drawer-close" aria-label="Close" onClick={props.onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke={PALETTE.ink}
              stroke-width={2}
              stroke-linecap="round"
            />
          </svg>
        </button>
      )}
      <div class="drawer-body">{props.children}</div>
    </div>
  );
}
