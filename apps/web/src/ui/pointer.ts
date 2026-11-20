/**
 * Which kind of pointer pressed last, and the rules that follow from it. A touch or pen long press fires
 * `contextmenu` and may end in a click; neither may close or act on anything. Pure rules, tested directly;
 * `watchPointers` wires them to the document once.
 */
import { holdMs } from '../text/tips.ts';

export interface PressState {
  type: string;
  at: number;
}

export const lastPress: PressState = { type: 'mouse', at: 0 };

/** Only a mouse right-click may dismiss. */
export const contextMenuDismisses = (pointerType: string): boolean => pointerType === 'mouse';

/** A touch/pen press held past the tip hold time never acts: its click is dropped. */
export const isHeldClick = (press: PressState, now: number): boolean =>
  press.type !== 'mouse' && now - press.at > holdMs;

let watching = false;

/** Tracks the last pointer type and drops the touch context menu. Idempotent. */
export function watchPointers(): void {
  if (watching) return;
  watching = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPress.type = e.pointerType;
      lastPress.at = e.timeStamp;
    },
    true,
  );
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
