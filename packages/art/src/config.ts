/** Tuning for the art, in one place. Sizes in px are at the reference hex size and scale with it. */
export const ART_TUNING = {
  /** Vertical squash of the isometric-style plane (1 would be top-down). */
  tilt: 0.8,
  /** Hex circumradius in px at which line widths and prop sizes are designed. */
  hexSize: 64,
  /** Side face depth as a share of the hex size when the plane is fully tilted; shrinks as tilt nears 1. */
  sideDepth: 0.26,
  /** Ink line width in px at the reference hex size. */
  inkWidth: 1.4,
  /** Thinnest ink line on screen in px, whatever the zoom (keeps faint details visible on phones). */
  minInkPx: 1,
  /** Opacity of the tile ink outlines (applied to the outline group, so shared edges do not darken). */
  outlineOpacity: 0.3,
  /** How strongly the ground wash bleeds (displacement in px) and how much ink lines wobble. */
  washBleed: 4.5,
  inkWobble: 1.4,
  /** Paper grain strength (0..1). */
  grain: 0.16,
  /** Fading tiles: paper veil over the ground, and the opacity of their props. */
  fadingVeil: 0.55,
  fadingPropOpacity: 0.45,
  /** Unexplored tiles: their props under the veil. */
  veilPropOpacity: 0.6,
  /** Character height, in hex sizes. */
  characterHeight: 0.74,
  /** Revealed features (nodes, sites, traps) are the tile's focus: drawn this much larger than props. */
  featureScale: 1.6,
  /** A lit fire on a hex, against the props. */
  fireScale: 1.3,
  /** Space around a scene, in hex sizes. */
  padding: 0.45,
} as const;
