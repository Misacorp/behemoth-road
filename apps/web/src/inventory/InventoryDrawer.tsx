/**
 * The team inventory: materials and items as icons with counts, and the recipes as cards (inputs →
 * output, the action cost as pips; for a non-engineer the extra material shows marked). A craft is the
 * second tap, on the card's button. Icons only; counts are the only text.
 */
import { drawIcon } from '@behemoth-road/art';
import { iconOf, type CraftOption } from '../game/chain.ts';
import type { JSX } from 'preact';
import { Pips, TickMark } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { Drawer } from '../ui/Drawer.tsx';

function Icon({ id, size }: { id: string; size: number }): JSX.Element {
  return toPreact(drawIcon(iconOf(id), PALETTE, size));
}

function Stack({ id, count, extra = false }: { id: string; count: number; extra?: boolean }) {
  return (
    <span class={extra ? 'stack is-extra' : 'stack'} data-item={id}>
      <Icon id={id} size={28} />
      <span class="stack-count">{count}</span>
    </span>
  );
}

export interface InventoryDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Materials and items with their counts, in a stable order. */
  readonly stock: readonly (readonly [string, number])[];
  readonly crafts: readonly CraftOption[];
  readonly busy: boolean;
  readonly onCraft: (recipe: string) => void;
}

export function InventoryDrawer(props: InventoryDrawerProps): JSX.Element | null {
  return (
    <Drawer open={props.open} onClose={props.onClose} side="right" label="Inventory">
      <div class="inventory">
        <div class="inventory-stock" data-empty={props.stock.length === 0 ? true : undefined}>
          {props.stock.map(([id, n]) => (
            <Stack key={id} id={id} count={n} />
          ))}
        </div>
        <div class="inventory-recipes">
          {props.crafts.map((c) => (
            <div
              key={c.recipe.id}
              class={c.enabled ? 'recipe' : 'recipe is-off'}
              data-recipe={c.recipe.id}
            >
              <span class="recipe-inputs">
                {c.inputs.map(([id, n]) => (
                  <Stack key={id} id={id} count={n} extra={c.extra !== null && c.extra[0] === id} />
                ))}
              </span>
              <svg class="recipe-arrow" viewBox="0 0 24 12" aria-hidden="true">
                <path
                  d="M2 6h18M15 2l5 4-5 4"
                  fill="none"
                  stroke={PALETTE.ink}
                  stroke-width={1.6}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="recipe-output">
                <Icon id={c.recipe.makes} size={40} />
              </span>
              <span class="recipe-cost">
                <Pips total={c.cost} left={c.cost} size={10} />
              </span>
              <button
                type="button"
                class="recipe-go"
                aria-label="Craft"
                disabled={!c.enabled || props.busy}
                onClick={() => props.onCraft(c.recipe.id)}
              >
                <svg viewBox="-24 -24 48 48" aria-hidden="true">
                  <TickMark r={20} />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
