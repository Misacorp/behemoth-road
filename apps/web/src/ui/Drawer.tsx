/**
 * The drawer, the app's larger view. On phones it is one bottom drawer with two heights (half and full):
 * drag its handle up or down to move between them, and down from half to close. On desktop it slides in
 * from the left or right and scrolls where its content is tall. Focus moves into it when it opens and
 * back to the control that opened it when it closes, without outlines. Only one drawer is open at a time.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setCssTransform } from '../map/cssTransform.ts';

export type Snap = 'half' | 'full';

/** What a vertical drag of `dy` px (positive is down) does from `snap`, given a slop. */
export function snapAfterDrag(snap: Snap, dy: number, slop = 48): Snap | 'close' | null {
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
  readonly children: ComponentChildren;
}

export function Drawer(props: DrawerProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const drag = useRef<{ id: number; y0: number } | null>(null);
  const opener = useRef<Element | null>(null);

  // Focus in on open; on close, back to the opener only if it had keyboard focus.
  useEffect(() => {
    if (!props.open) return;
    opener.current = document.activeElement;
    const wasKeyboard = opener.current?.matches(':focus-visible') ?? false;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], button, [tabindex]');
    (first ?? ref.current)?.focus({ preventScroll: true });
    setSnap('half');
    return () => {
      const back = opener.current;
      if (wasKeyboard && back instanceof HTMLElement) back.focus({ preventScroll: true });
      else if (ref.current?.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
    };
  }, [props.open]);

  useEffect(() => {
    if (!props.open || !props.onClose) return;
    const close = props.onClose;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <div class="drawer-body">{props.children}</div>
    </div>
  );
}
