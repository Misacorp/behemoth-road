/**
 * The creature's hub, from the bubble's creature entry: the creature and its heading, the team stores, and
 * the unlocks: done ones sealed, the one in progress with its work bar, the others with their material cost
 * (faded where the stores fall short). An engineer riding the creature starts or works on an unlock with the
 * card's button (the second tap). Icons, counts and pips only.
 */
import { drawStoresIcon, drawWorkBar } from '@behemoth-road/art';
import type { GameStateView } from '@behemoth-road/core';
import type { JSX } from 'preact';
import type { Stock, UnlockOption } from '../game/chain.ts';
import { Pips, TickMark } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import { CreatureCard, CREATURE_SIZE } from '../map/Popover.tsx';
import { toPreact } from '../map/svgToPreact.ts';
import { Drawer } from '../ui/Drawer.tsx';
import { ContentIcon, Stack } from './Stack.tsx';

const STORES = toPreact(drawStoresIcon(PALETTE, 40));

export interface HubDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: GameStateView;
  readonly stores: Stock;
  readonly unlocks: readonly UnlockOption[];
  readonly busy: boolean;
  readonly onBuild: (unlock: string) => void;
}

function UnlockCard({
  o,
  stores,
  busy,
  onBuild,
}: {
  o: UnlockOption;
  stores: Readonly<Record<string, number>>;
  busy: boolean;
  onBuild: (unlock: string) => void;
}): JSX.Element {
  const state = o.done ? 'done' : o.work !== null ? 'working' : 'open';
  return (
    <div
      class={`unlock is-${state}${!o.done && !o.enabled ? ' is-off' : ''}`}
      data-unlock={o.unlock.id}
    >
      <span class="unlock-icon">
        <ContentIcon id={o.unlock.id} size={44} done={o.done} />
      </span>
      {o.work !== null ? (
        <span class="unlock-work">
          {toPreact(drawWorkBar(PALETTE, 120, o.work / o.unlock.work, o.unlock.work))}
        </span>
      ) : (
        !o.done && (
          <span class="unlock-cost">
            {o.unlock.cost.map((c) => (
              <Stack
                key={c.material}
                id={c.material}
                count={c.amount}
                short={(stores[c.material] ?? 0) < c.amount}
              />
            ))}
          </span>
        )
      )}
      {!o.done && (
        <>
          <span class="unlock-pips">
            <Pips total={o.cost} left={o.cost} size={10} />
          </span>
          <button
            type="button"
            class="unlock-go"
            aria-label="Build"
            disabled={!o.enabled || busy}
            onClick={() => onBuild(o.unlock.id)}
          >
            <svg viewBox="-24 -24 48 48" aria-hidden="true">
              <TickMark r={20} />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

export function HubDrawer(props: HubDrawerProps): JSX.Element | null {
  return (
    <Drawer open={props.open} onClose={props.onClose} side="right" label="Behemoth">
      <div class="hub">
        <div class="hub-creature">
          <svg
            viewBox={`0 0 ${CREATURE_SIZE.width} ${CREATURE_SIZE.height}`}
            width={CREATURE_SIZE.width}
            height={CREATURE_SIZE.height}
            aria-hidden="true"
          >
            <CreatureCard state={props.state} />
          </svg>
        </div>
        <div class="hub-stores" data-empty={props.stores.length === 0 ? true : undefined}>
          <span class="hub-stores-icon">{STORES}</span>
          {props.stores.map(([id, n]) => (
            <Stack key={id} id={id} count={n} />
          ))}
        </div>
        <div class="hub-unlocks">
          {props.unlocks.map((o) => (
            <UnlockCard
              key={o.unlock.id}
              o={o}
              stores={props.state.stores}
              busy={props.busy}
              onBuild={props.onBuild}
            />
          ))}
        </div>
      </div>
    </Drawer>
  );
}
