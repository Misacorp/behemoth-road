/**
 * The one place the app writes a CSS property from script: the world layer's transform, every frame of a
 * pan or zoom, and the creature's one-hex walk (a Web Animation of a transform, run by the compositor). A CSSOM write is allowed by the CSP (it blocks style attributes and inline <style>, not the
 * CSSOM), and a CSS transform on an HTML element is what lets the compositor move the map without
 * redrawing it. The page-guard test exempts this file only.
 */
export function setCssTransform(el: HTMLElement | SVGElement, value: string): void {
  el.style.transform = value;
}

/** Slides an element from an offset (px in its own coordinates) back to where it is drawn, easing out. */
export function slideFrom(el: Element, dx: number, dy: number, ms: number): Animation {
  return el.animate(
    [
      { transform: `translate(${String(dx)}px, ${String(dy)}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: ms, easing: 'ease-in-out', fill: 'both' },
  );
}
