/**
 * The frame the map is seen in (below the top HUD, above the action pips and any drawer), kept apart from
 * the DOM so it can be tested: `frameFrom` is the arithmetic on measured rectangles, and `FrameCache` holds
 * the result so the per-frame placement code reads no layout. The owner refreshes it when something that
 * moves the frame changes (resize, the drawer cover, a flow opening or closing, the HUD resizing).
 */
import type { Frame, Size } from './view.ts';

/** The part of a screen rectangle the frame needs. */
export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}

export interface FrameInputs {
  /** The map's own size. */
  readonly size: Size;
  /** The map element's rectangle; without it the whole screen is the frame. */
  readonly map: Box | null;
  readonly hudTop: Box | null;
  readonly pips: Box | null;
  /** How far a drawer covers the map from the bottom, px. */
  readonly coverBottom: number;
  readonly pad: number;
}

export function frameFrom(i: FrameInputs): Frame {
  const { width, height } = i.size;
  const { map, hudTop, pips, pad } = i;
  const top = map && hudTop && hudTop.height > 0 ? Math.max(0, hudTop.bottom - map.top + pad) : 0;
  const drawer = height - i.coverBottom;
  const above = map && pips && pips.height > 0 ? pips.top - map.top - pad : height;
  const bottom = Math.max(top + 1, Math.min(drawer, above));
  return { x: 0, y: top, width, height: bottom - top };
}

/** A frame measured on demand and held until `refresh`: `get` never measures after the first time. */
export class FrameCache {
  private value: Frame | null = null;

  constructor(private readonly measure: () => Frame) {}

  get(): Frame {
    return this.value ?? this.refresh();
  }

  refresh(): Frame {
    this.value = this.measure();
    return this.value;
  }
}
