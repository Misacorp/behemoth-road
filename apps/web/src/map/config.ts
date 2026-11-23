/**
 * Tuning for the map interface, in one place. Game rules and their numbers live in
 * `@behemoth-road/core` (`DEFAULT_CONFIG`); these are only how the page looks and feels.
 */
export const MAP_TUNING = {
  /** Seed of the first game. "New game" counts up from it, so every game is reproducible. */
  seed: 20261119,
  /** The one character in the Milestone 1 prototype. */
  characterId: 'you',
  /** Its cloak colour, an accent key from the art kit palette. */
  accent: 'rose',
  /** Art kit palette id (`morning`, `mist`, `spring`); Misa picked Spring. */
  paletteId: 'spring',
  /** Vertical squash of the map plane (1 is top-down); Misa picked a high view, 0.8. */
  tilt: 0.8,
  /** Ink lines never get thinner than this on screen, in px (the scene is redrawn when zoom settles). */
  minInkPx: 1,
  /** The world layer's bitmap stays within these, in device px (phone GPU texture limits). */
  layer: { maxSide: 4096, maxPixels: 16_000_000 },
  /** Hex circumradius in world px at zoom 1. */
  hexSize: 64,
  /** Zoom limits (screen px per world px). */
  minZoom: 0.3,
  maxZoom: 2.4,
  /** The first view fits this many hexes around the character (phone). */
  fitRadius: 3.5,
  /** The opening view looks this many hexes ahead of the creature, along its heading. */
  openAhead: 1.5,
  /** Space kept between the map's frame and the HUD above and below it, in screen px. */
  framePad: 6,
  /** From this screen width up, the first view fits the whole window plus one ring, at most at zoom 1. */
  wideFrom: 900,
  wideMaxZoom: 1,
  /** A pointer that moves further than this (screen px) is a drag, never a tap. */
  tapSlop: 8,
  /** Wheel zoom: factor per pixel of wheel delta (trackpad pinch sends ctrl+wheel). */
  wheelZoomPerPixel: 0.0015,
  pinchWheelZoomPerPixel: 0.01,
  /** Hidden hexes drawn as blank paper beyond the window edge, in rings. */
  paperRings: 2,
  /** Lost tiles further than this from the creature (in hexes beyond the window) are not drawn. */
  lostRings: 4,
  /** Gap kept between a popover and the screen edge, in px. */
  popoverMargin: 10,
  /** How long the view takes to follow the creature after a day passes, in ms. */
  followMs: 450,
} as const;
