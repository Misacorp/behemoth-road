/**
 * The one place the app writes a CSS property from script: the world layer's transform, every frame of a
 * pan or zoom. A CSSOM write is allowed by the CSP (it blocks style attributes and inline <style>, not the
 * CSSOM), and a CSS transform on an HTML element is what lets the compositor move the map without
 * redrawing it. The page-guard test exempts this file only.
 */
export function setCssTransform(el: HTMLElement, value: string): void {
  el.style.transform = value;
}
