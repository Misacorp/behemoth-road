/**
 * The creature's hub, from the bubble's creature entry: the creature and its heading (with your signs), the
 * team stores, caring for it (feed, and for keepers linger), and the unlocks: done ones sealed, the one in
 * progress with its work bar, the others with their material cost (faded where the stores fall short). An
 * engineer riding the creature starts or works on an unlock with the card's button (the second tap). Icons,
 * counts and pips only.
 */
import { drawStoresIcon, drawWorkBar } from '@behemoth-road/art';
import type { CreatureSigns, GameStateView } from '@behemoth-road/core';
import type { JSX } from 'preact';
import type { CostedAction, Stock, UnlockOption } from '../game/chain.ts';
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
  /** What you read off the creature, drawn on it. */
  readonly signs?: CreatureSigns | null;
  readonly stores: Stock;
  /** Feed and (keepers) linger. */
  readonly care?: readonly CostedAction[];
  readonly onCare?: (kind: CostedAction['kind']) => void;
  readonly unlocks: readonly UnlockOption[];
  readonly busy: boolean;
  readonly onBuild: (unlock: string) => void;
}

function UnlockCard({
  o,
  busy,
  onBuild,
}: {
  o: UnlockOption;
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
                short={o.missing.some((m) => m.material === c.material)}
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

/**
 * Feeding or lingering, laid out like an unlock card: the action's icon, the food it takes (faded when the
 * stores hold none), its pips and the go button; a linger already asked for today shows sealed.
 */
function CareCard({
  a,
  busy,
  onCare,
}: {
  a: CostedAction;
  busy: boolean;
  onCare: (kind: CostedAction['kind']) => void;
}): JSX.Element {
  if (a.done) {
    return (
      <div class="unlock care is-done" data-care={a.kind}>
        <span class="unlock-icon">
          <ContentIcon id={a.kind} size={44} done />
        </span>
      </div>
    );
  }
  return (
    <div class={`unlock care${a.enabled ? '' : ' is-off'}`} data-care={a.kind}>
      <span class="unlock-icon">
        <ContentIcon id={a.kind} size={44} />
      </span>
      <span class="unlock-cost">
        {a.uses && <Stack id={a.uses} count={1} short={a.short ?? false} />}
      </span>
      <span class="unlock-pips">
        <Pips total={a.cost} left={a.cost} size={10} />
      </span>
      <button
        type="button"
        class="unlock-go"
        aria-label={a.kind}
        disabled={!a.enabled || busy}
        onClick={() => onCare(a.kind)}
      >
        <svg viewBox="-24 -24 48 48" aria-hidden="true">
          <TickMark r={20} />
        </svg>
      </button>
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
            <CreatureCard state={props.state} signs={props.signs ?? null} />
          </svg>
        </div>
        <div class="hub-stores" data-empty={props.stores.length === 0 ? true : undefined}>
          <span class="hub-stores-icon">{STORES}</span>
          {props.stores.map(([id, n]) => (
            <Stack key={id} id={id} count={n} />
          ))}
        </div>
        {(props.care?.length ?? 0) > 0 && (
          <div class="hub-care">
            {props.care?.map((a) => (
              <CareCard key={a.kind} a={a} busy={props.busy} onCare={props.onCare ?? (() => {})} />
            ))}
          </div>
        )}
        <div class="hub-unlocks">
          {props.unlocks.map((o) => (
            <UnlockCard key={o.unlock.id} o={o} busy={props.busy} onBuild={props.onBuild} />
          ))}
        </div>
      </div>
    </Drawer>
  );
}
