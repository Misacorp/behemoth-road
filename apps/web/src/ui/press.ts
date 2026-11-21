/**
 * Every press, hold, tap, hover and context-menu rule for tips, in one place. Elements declare a tip with
 * attributes only (`data-tip="<id>"`, plus `data-tip-tap` to make a tap show it even on a button); this
 * module finds them with `closest('[data-tip]')` and owns the app's ONE capture listener per event type on
 * the document (`watchPress`, started by `<TipLayer />`). The pure rules (which element, plain icon or
 * button, which pointer may dismiss, which click is a held press's) are exported and tested directly.
 *
 * The one thing that is not an element is the map's own hit-tested tips (a tile, a threat, a settlement
 * drawn in the SVG): they have no DOM node each, so `MapView` finds them by position and calls `TIPS`
 * itself, as a thin adapter into the same controller. It reads `holdEnded()` to know a lift ended a hold.
 *
 * A touch or pen long press fires `contextmenu` and may end in a click; neither may close or act on
 * anything. A mouse right-click closes the tip and is announced to `onRightClick` subscribers.
 */
import { holdMs, TIP_TABLE, type TipId } from '../text/tips.ts';
import { TipController, type TipTarget } from './tip.ts';

/** The app's one tip controller. */
export const TIPS = new TipController({
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h),
});

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

/** The attributes that give an icon or control its tip (nothing for a null id). */
export function tipProps(id: TipId | null): { readonly 'data-tip'?: string } {
  return id === null ? {} : { 'data-tip': id };
}

/** Things that act on a tap: an icon inside (or being) one of these is not a plain icon. */
const ACTS = 'button, a, [role=button], [role=option], [data-action], [data-acts]';

/** A tip icon that does nothing on tap (or says so with `data-tip-tap`): its tap shows the tip. */
export const isPlainIcon = (el: Element): boolean =>
  el.hasAttribute('data-tip-tap') || el.closest(ACTS) === null;

/** The nearest element with a tip at or above an event target, or null. */
export const tipHost = (target: unknown): Element | null => {
  const el = target as Element | null | undefined;
  return typeof el?.closest === 'function' ? el.closest('[data-tip]') : null;
};

const isNode = (x: unknown): x is Node => typeof (x as Node | null)?.nodeType === 'number';

/** What the pack and the like show under a tip's text, by tip id (a tap on its element reads it). */
const extras = new Map<string, () => unknown>();

/** Registers the extra content for a tip id; returns the function that removes it. */
export function setTipExtra(id: TipId, extra: () => unknown): () => void {
  extras.set(id, extra);
  return () => {
    if (extras.get(id) === extra) extras.delete(id);
  };
}

/**
 * A mouse came over `target` from `from`: the tip element it entered, or null when it was already inside
 * it (moving between its children) or there is none. Like `pointerenter`, not `pointerover`.
 */
export function enteredHost(target: unknown, from: unknown): Element | null {
  const host = tipHost(target);
  if (!host) return null;
  return isNode(from) && host.contains(from) ? null : host;
}

/** A mouse went out of `target` towards `to`: the tip element it left, or null (like `pointerleave`). */
export function leftHost(target: unknown, to: unknown): Element | null {
  const host = tipHost(target);
  if (!host) return null;
  return isNode(to) && host.contains(to) ? null : host;
}

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
let ended = false;
const rightClicks = new Set<(e: MouseEvent) => void>();

/** Whether the last non-mouse lift or cancel ended a hold (its tip opened): that press is not a tap. */
export const holdEnded = (): boolean => ended;

/** A mouse right-click happened (it has closed the tip; the event is passed on, anywhere on the page). */
export function onRightClick(fn: (e: MouseEvent) => void): () => void {
  rightClicks.add(fn);
  return () => rightClicks.delete(fn);
}

/** The tip id an element names, only if the tips table has it. */
export const idOf = (host: Element | null): TipId | null => {
  const id = host?.getAttribute('data-tip') ?? null;
  return id !== null && Object.hasOwn(TIP_TABLE, id) ? (id as TipId) : null;
};

/** Where the phone's own long-press menu is still wanted: text the player types or selects. */
const EDITABLE = 'input, textarea, select, [contenteditable]';
export const keepsNativeMenu = (target: unknown): boolean => {
  const el = target as Element | null | undefined;
  return typeof el?.closest === 'function' && el.closest(EDITABLE) !== null;
};

/** The one set of document listeners for tips and presses. Idempotent. */
export function watchPress(): void {
  if (watching) return;
  watching = true;
  const lift = (e: PointerEvent): void => {
    if (e.pointerId === lastPress.id && lastPress.up === null) lastPress.up = e.timeStamp;
  };
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPress.type = e.pointerType;
      lastPress.id = e.pointerId;
      lastPress.at = e.timeStamp;
      lastPress.up = null;
      const host = tipHost(e.target);
      const id = idOf(host);
      // A press anywhere but on a thing with a tip closes the open one.
      if (!host && TIPS.open) TIPS.close();
      if (host && id && e.pointerType !== 'mouse') {
        TIPS.press(id, elementTarget(host), e.clientX, e.clientY);
      }
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') TIPS.move(e.clientX, e.clientY);
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    (e) => {
      lift(e);
      ended = e.pointerType !== 'mouse' && TIPS.release();
    },
    true,
  );
  document.addEventListener(
    'pointercancel',
    (e) => {
      lift(e);
      ended = TIPS.release();
    },
    true,
  );
  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const host = enteredHost(e.target, e.relatedTarget);
      const id = idOf(host);
      // The element now: by the time the delay ends, the event no longer has its target.
      if (host && id) TIPS.hover(id, elementTarget(host));
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const id = idOf(leftHost(e.target, e.relatedTarget));
      if (id) TIPS.unhover(id);
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      // takeClick first: it must run to end the swallow. A touch press held past the hold time never acts.
      const swallowed = TIPS.takeClick(e.target);
      if (swallowed || isHeldClick(lastPress, e.timeStamp)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // One rule: an icon that is not a button (or says `data-tip-tap`) shows its tip on a tap, touch or
      // mouse, and the tap goes no further.
      const host = tipHost(e.target);
      const id = idOf(host);
      if (host && id && isPlainIcon(host)) {
        e.preventDefault();
        e.stopPropagation();
        TIPS.tap(id, elementTarget(host), extras.get(id));
      }
    },
    true,
  );
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!contextMenuDismisses(lastPress.type)) {
        // A touch or pen long press: no menu (except in a text field, for paste), and nothing hears it.
        if (!keepsNativeMenu(e.target)) e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      TIPS.close();
      for (const fn of rightClicks) fn(e);
    },
    true,
  );
  // Escape closes the tip and goes no further (an open drawer stays open); a wheel turn closes it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && TIPS.open) {
        TIPS.close();
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
  window.addEventListener('wheel', () => TIPS.close(), { passive: true });
}
