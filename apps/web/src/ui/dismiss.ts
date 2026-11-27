/**
 * When a pointer press closes a desktop drawer: a primary press outside it, on the map or bare ground. The
 * drawer's own contents, the round HUD buttons (their own tap opens or toggles a drawer, so closing first
 * would reopen it), and a popover or tip on top of it (a drawer stays open to mark a popover's target)
 * keep it open. A secondary press is left to the settings' right-click rule.
 */
export interface PressInfo {
  /** `PointerEvent.button`: 0 is the primary button, a touch or a pen's contact. */
  readonly button: number;
  readonly insideDrawer: boolean;
  /** On a HUD button, a popover or a tip. */
  readonly onKept: boolean;
}

export const closesDrawer = (p: PressInfo): boolean =>
  p.button === 0 && !p.insideDrawer && !p.onKept;

/** A mouse right-click outside the drawer closes it when the settings allow it, as it does a popover. */
export const closesOnRightClick = (
  p: Pick<PressInfo, 'insideDrawer' | 'onKept'>,
  settings: { readonly closeOnRightClick: boolean },
): boolean => settings.closeOnRightClick && !p.insideDrawer && !p.onKept;

/** The selector of what a press may land on without closing the drawer. */
export const KEEPS_DRAWER_OPEN = '.drawer, button.round, [data-popover], .tip';

/** Desktop drawers (the side ones) are shown from this width, as `styles.css` has it. */
export const DESKTOP_QUERY = '(min-width: 900px)';
