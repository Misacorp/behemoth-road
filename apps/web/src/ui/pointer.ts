/**
 * Which kind of pointer pressed last, and the rules that follow from it. A touch or pen long press fires
 * `contextmenu` and may end in a click; neither may close or act on anything. Pure rules, tested directly;
 * `watchPointers` wires them to the document once.
 */
import { holdMs } from '../text/tips.ts';

export interface PressState {
  type: string;
  /** The pointer that pressed; only its own lift counts. */
  id: number;
  /** When the press went down, and when it came up (`null` while it is still down). */
  at: number;
  up: number | null;
}

export const lastPress: PressState = { type: 'mouse', id: -1, at: 0, up: null };

/** A press's own click arrives right after it lifts; a click later than this is not that press's. */
export const CLICK_AFTER_UP_MS = 800;

/** Only a mouse right-click may dismiss. */
export const contextMenuDismisses = (pointerType: string): boolean => pointerType === 'mouse';

/**
 * A touch/pen press held past the tip hold time never acts: the click it ends in is dropped. Only that
 * press's own click: one that comes long after the finger lifted (a key, a script) is not affected.
 */
export const isHeldClick = (press: PressState, now: number): boolean => {
  // Without its lift (lost, or still down) a click is not this press's: never dropped.
  if (press.type === 'mouse' || press.up === null) return false;
  return press.up - press.at > holdMs && now - press.up <= CLICK_AFTER_UP_MS;
};

let watching = false;

/** Tracks the last pointer type and drops the touch context menu. Idempotent. */
export function watchPointers(): void {
  if (watching) return;
  watching = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPress.type = e.pointerType;
      lastPress.id = e.pointerId;
      lastPress.at = e.timeStamp;
      lastPress.up = null;
    },
    true,
  );
  const lift = (e: PointerEvent): void => {
    if (e.pointerId === lastPress.id && lastPress.up === null) lastPress.up = e.timeStamp;
  };
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', lift, true);
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!contextMenuDismisses(lastPress.type)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}
