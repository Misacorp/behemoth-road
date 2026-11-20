import type { ComponentChildren, VNode } from 'preact';
import { describe, expect, it } from 'vitest';
import { AppetiteBadge, Bubble } from './Popover.tsx';

/** Every element's props in a VNode tree, rendering function components by calling them (no DOM). */
function propsIn(node: ComponentChildren): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(propsIn);
  const v = node as VNode<Record<string, unknown>>;
  if (typeof v.type === 'function') {
    return propsIn((v.type as (p: unknown) => ComponentChildren)(v.props));
  }
  return [v.props, ...propsIn(v.props.children as ComponentChildren)];
}

const bubble = (appetite: Parameters<typeof AppetiteBadge>[0]['appetite'] | null) =>
  propsIn(
    Bubble({
      characters: [],
      place: 'creature',
      appetite,
      onCharacter: () => {},
      onOpenPlace: () => {},
      placeRef: () => {},
    }),
  );

describe('the appetite badge on the bubble', () => {
  it('shows a keeper the sharp sign with its kind and level', () => {
    const props = bubble({ kind: 'underfed', level: 2, faint: false });
    const badge = props.find((p) => p['data-appetite'] !== undefined);
    expect(badge?.['data-appetite']).toBe('underfed:2');
    expect(badge?.['data-faint']).toBeUndefined();
  });

  it('marks a non-keeper read as faint', () => {
    const props = bubble({ kind: 'overfed', level: 1, faint: true });
    expect(props.find((p) => p['data-appetite'] !== undefined)?.['data-faint']).toBe(true);
  });

  it('shows no badge while the creature is comfortable', () => {
    expect(bubble(null).some((p) => p['data-appetite'] !== undefined)).toBe(false);
  });
});
