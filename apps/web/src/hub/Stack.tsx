/** A material as an art kit icon with its count; the count is the only text. */
import { drawIcon } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { iconOf } from '../game/chain.ts';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { tipFor } from '../ui/tip.ts';
import { tipProps } from '../ui/press.ts';

export function ContentIcon({
  id,
  size,
  done = false,
}: {
  id: string;
  size: number;
  done?: boolean;
}): JSX.Element {
  return toPreact(drawIcon(iconOf(id), PALETTE, size, done ? { done: true } : {}));
}

export function Stack({
  id,
  count,
  short = false,
}: {
  id: string;
  count: number;
  /** The stores hold fewer than this: drawn faded. */
  short?: boolean;
}): JSX.Element {
  return (
    <span
      class={short ? 'stack is-short' : 'stack'}
      data-item={id}
      {...tipProps(tipFor('material', id))}
    >
      <ContentIcon id={id} size={28} />
      <span class="stack-count">{count}</span>
    </span>
  );
}
