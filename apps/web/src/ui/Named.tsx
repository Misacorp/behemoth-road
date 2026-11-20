/**
 * An icon that shows its name (content `name`, nothing more) in a tiny tip: on hover with a mouse, and on a
 * tap, which does not reach what the icon sits in (a tap on a trait icon does not pick the card).
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** How long a tapped name stays, in ms. */
const TAP_MS = 1800;

export function Named({
  name,
  children,
  shown = false,
  passTap = false,
}: {
  name: string;
  children: ComponentChildren;
  /** Also show the name without a hover or tap (a chosen role). */
  shown?: boolean;
  /** Let a tap through to the parent too (the role buttons: a tap picks the role and names it). */
  passTap?: boolean;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  const [tapped, setTapped] = useState(0);
  useEffect(() => {
    if (tapped === 0) return;
    const t = window.setTimeout(() => setTapped(0), TAP_MS);
    return () => window.clearTimeout(t);
  }, [tapped]);
  return (
    <span
      class="named"
      data-name={name}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onClick={(e) => {
        if (!passTap) {
          e.stopPropagation();
          e.preventDefault();
        }
        setTapped((n) => n + 1);
      }}
    >
      {children}
      {(hover || tapped > 0 || shown) && (
        <span class="name-tip" role="tooltip">
          {name}
        </span>
      )}
    </span>
  );
}
