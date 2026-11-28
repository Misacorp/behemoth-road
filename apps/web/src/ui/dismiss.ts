/**
 * When a mouse press closes a desktop drawer. Only a press on the map surface itself counts (not a popover
 * over it, not the HUD, the dev buttons or the drawer). A click with no movement closes the drawer and does
 * nothing else (its pointer-up and click are swallowed, so no tile is picked); a drag that starts there
 * closes it at once and goes on to pan the map. Every press on a control outside the map acts as usual and
 * leaves the drawer open. Touch and pen keep their old behaviour. A mouse right-click on the map closes it
 * too, when the settings allow, as it does a popover.
 */

/** Movement, in px, past which a press is a drag, not a click. */
export const DRAG_SLOP = 5;

/**
 * Desktop drawers (the side ones) are shown from this width. `styles.css` has the same 900px breakpoint
 * (`@media (min-width: 900px)` on `.drawer`): change both together.
 */
export const DESKTOP_QUERY = '(min-width: 900px)';

/** Whether an element is the map surface: in the map's svg, and not in its popover. */
export const onMapSurface = (el: { closest(selector: string): unknown } | null): boolean =>
  el !== null && el.closest('svg.map') !== null && el.closest('.popover') === null;

export type OutsideOutcome = 'close' | 'close-and-swallow' | null;

/** One mouse press that began on the map while a drawer was open. */
export class OutsidePress {
  private press: { id: number; x: number; y: number } | null = null;

  /** A press begins. Only a primary mouse press on the map surface is tracked. */
  down(p: {
    pointerType: string;
    button: number;
    id: number;
    x: number;
    y: number;
    onMap: boolean;
  }): void {
    this.press =
      p.pointerType === 'mouse' && p.button === 0 && p.onMap ? { id: p.id, x: p.x, y: p.y } : null;
  }

  /** It moves: the first move past the slop is a drag, which closes the drawer and lets the map pan. */
  move(id: number, x: number, y: number): OutsideOutcome {
    const s = this.press;
    if (!s || s.id !== id || Math.hypot(x - s.x, y - s.y) <= DRAG_SLOP) return null;
    this.press = null;
    return 'close';
  }

  /** It lifts with no drag: a click, which closes the drawer and is swallowed. */
  up(id: number): OutsideOutcome {
    const s = this.press;
    if (!s || s.id !== id) return null;
    this.press = null;
    return 'close-and-swallow';
  }

  /** It is cancelled: nothing happens. */
  cancel(id: number): void {
    if (this.press?.id === id) this.press = null;
  }

  get tracking(): boolean {
    return this.press !== null;
  }
}

/** A right-click on the map closes the drawer when the settings allow it. */
export const closesOnRightClick = (
  onMap: boolean,
  settings: { readonly closeOnRightClick: boolean },
): boolean => settings.closeOnRightClick && onMap;
