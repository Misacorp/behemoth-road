/**
 * Tips on icons: `tipProps(id)` (in `press.ts`, with every press, hold, tap and hover rule) marks any icon or
 * control (HTML or SVG) with `data-tip`, and `<TipLayer />` (rendered once, at the root) starts the
 * document listeners and draws the one open tip: its title (the content name unless the text file gives
 * one) and a line or two of text, placed like the map's popovers, beside the thing and never over it, with
 * the same chevron. The texts live in `text/tips.ts`.
 */
import { drawBurnableMark, drawFearsFireMark } from '@behemoth-road/art';
import { TIPS, watchPress } from './press.ts';
import {
  DEFAULT_CONFIG,
  FEATURE_TYPES,
  MATERIALS,
  PEOPLE_TYPES,
  THREAT_TYPES,
  type TuningConfig,
  UNLOCKS,
} from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { TIP_TABLE, type TipId } from '../text/tips.ts';
import { fillTip, tipValues } from '../text/tipValues.ts';
import { chevronFor, placePopover } from '../map/compose.ts';
import { setCssTransform } from '../map/cssTransform.ts';
import { contentName } from './emblems.tsx';
import { tipMarkOf } from './tipMarks.ts';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import type { OpenTip } from './tip.ts';

/** The numbers tips show, from the game's tuning (the defaults until a game is loaded). */
let values = tipValues(DEFAULT_CONFIG);
let valuesFor: TuningConfig = DEFAULT_CONFIG;

/** The game's tuning, so the numbers in tips follow it. */
export function setTipConfig(config: TuningConfig): void {
  if (config === valuesFor) return;
  valuesFor = config;
  values = tipValues(config);
}

/** A tip's title: the one in the text file, else the content's own name, else the id. */
export function titleOf(id: TipId): string {
  const tip = TIP_TABLE[id];
  if (tip.title) return tip.title;
  const [kind = '', key = ''] = id.split(':');
  // A threat's row in the peril breakdown is titled with the threat's own name.
  if (kind === 'peril' && key === 'threat') {
    const type = id.split(':')[2];
    return THREAT_TYPES.find((t) => t.id === type)?.name ?? type ?? key;
  }
  if (kind === 'role' || kind === 'trait' || kind === 'quirk') return contentName(kind, key);
  const named: readonly { readonly id: string; readonly name: string }[] =
    kind === 'material'
      ? MATERIALS
      : kind === 'unlock'
        ? UNLOCKS
        : kind === 'threat'
          ? THREAT_TYPES
          : kind === 'people'
            ? PEOPLE_TYPES
            : kind === 'feature'
              ? FEATURE_TYPES
              : [];
  return named.find((x) => x.id === key)?.name ?? key;
}

/** The open tip, drawn once for the whole app. */
export function TipLayer(): JSX.Element | null {
  const [open, setOpen] = useState<OpenTip | null>(TIPS.open);
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const [chevron, setChevron] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    watchPress();
    return TIPS.subscribe(setOpen);
  }, []);

  // Its thing gone (a drawer closed under it): the tip goes too. Checked each frame only while one is open.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const check = (): void => {
      if (!open.alive()) TIPS.close();
      else frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Place it once its size is known: beside the thing (above, or below when there is no room), never over
  // it, inside the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const a = open.anchor;
    const top = { x: a.x + a.width / 2, y: a.y };
    const rect = placePopover(
      top,
      a.height,
      size,
      { width: window.innerWidth, height: window.innerHeight },
      8,
    );
    setCssTransform(
      el,
      `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`,
    );
    const c = chevronFor(rect, top, a.height);
    fill.current?.setAttribute('d', c.fill);
    edge.current?.setAttribute('d', c.edge);
    setChevron(size);
  }, [open]);

  if (!open) return null;
  const tip = TIP_TABLE[open.id];
  const mark = tipMarkOf(open.id);
  return (
    <div ref={box} class="tip" role="tooltip" data-tip-open={open.id}>
      <strong class="tip-title">{titleOf(open.id)}</strong>
      <span class="tip-text">{fillTip(tip.text, { ...values, note: open.note ?? '' })}</span>
      {mark !== null && (
        <span class="tip-mark" data-tip-mark={mark}>
          {toPreact(
            mark === 'burnable' ? drawBurnableMark(PALETTE, 22) : drawFearsFireMark(PALETTE, 22),
          )}
        </span>
      )}
      {typeof open.extra === 'function' && (open.extra as () => JSX.Element)()}
      <svg
        class="tip-chevron"
        aria-hidden="true"
        {...(chevron ? { viewBox: `0 0 ${String(chevron.width)} ${String(chevron.height)}` } : {})}
      >
        <path ref={fill} class="tip-chevron-fill" />
        <path ref={edge} class="tip-chevron-edge" />
      </svg>
    </div>
  );
}
