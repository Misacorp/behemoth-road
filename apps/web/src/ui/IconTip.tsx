/**
 * An icon with a tip, in HTML. Hover (mouse) or press-and-hold (touch) opens it. With `tapShows`, an icon
 * that has no action of its own (a trait on a character offer) also opens its tip on a plain tap, and the
 * tap goes no further (it does not pick the card it sits in).
 */
import type { ComponentChildren, JSX } from 'preact';
import type { TipId } from '../text/tips.ts';
import { elementTarget, TIPS, tipProps } from './Tip.tsx';

export function IconTip({
  id,
  children,
  tapShows = false,
}: {
  id: TipId | null;
  children: ComponentChildren;
  tapShows?: boolean;
}): JSX.Element {
  return (
    <span
      class="icon-tip"
      {...tipProps(id)}
      {...(tapShows && id
        ? {
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              TIPS.tap(id, elementTarget(e.currentTarget as Element));
            },
          }
        : {})}
    >
      {children}
    </span>
  );
}
