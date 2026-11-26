/**
 * The popover cards of the lure animal and the cart, in the same drawn style as the others: pictures, cost
 * pips and buttons, no prose. The capybara's card shows it (normal or settled), its leads left as paws and,
 * within reach, the lead button. The cart's card shows it in its state with its cargo mark, the hitch and
 * board toggles, and two rows of materials: tap one in your pack to load a unit, tap one in the cart to take
 * a unit out (they cost nothing, so one tap each).
 */
import { drawCapybara, drawCargoFill, drawCart, drawLeadsLeft, type Drawn } from '@behemoth-road/art';
import type { Cart, GameStateView, Lure } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { iconOf } from '../game/chain.ts';
import { accentOf } from '../game/identity.ts';
import { cargoFill, type CartMove, type CartToggle, cartLook } from '../game/cart.ts';
import { type LeadOption, lureLook } from '../game/lure.ts';
import { tipFor } from '../ui/tip.ts';
import { greyedProps, tipProps } from '../ui/press.ts';
import {
  ACTION_W,
  ActionButton,
  type Arming,
  Card,
  CardIcon,
  Fitted,
  labelH,
  Placed,
} from './Popover.tsx';
import { PALETTE } from './art.ts';
import { MAP_TUNING } from './config.ts';

/** The capybara's card: its picture, leads left, and the lead button when you are within reach. */
export const lureSize = (lead: boolean): { width: number; height: number } => ({
  width: 132 + (lead ? ACTION_W : 0),
  height: 72 + labelH(),
});

// Drawn once per look: a card is not redrawn per tap.
const lureDrawn = new Map<string, Drawn>();
function lureFigure(look: 'normal' | 'settled'): Drawn {
  let d = lureDrawn.get(look);
  if (!d) {
    d = drawCapybara(PALETTE, look, { k: 1, squash: MAP_TUNING.tilt, seed: 'card' });
    lureDrawn.set(look, d);
  }
  return d;
}

export function LureCard({
  lure,
  lead,
  leading = false,
  onLead,
  leadRef,
}: {
  lure: Lure;
  /** Lead mode is on: the button is drawn sealed, and a tap on it lets go. */
  leading?: boolean;
  /** Leading it, when you are on or next to it; null when out of reach. */
  lead: LeadOption | null;
  /** The lead button was tapped: lead mode, with the hexes it can go to lit. */
  onLead: () => void;
  leadRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  const look = lureLook(lure);
  const size = lureSize(lead !== null);
  return (
    <g data-popover="lure" data-lure={lure.id} data-look={look} data-leads={lure.leadsLeft}>
      <Card {...size} />
      <g
        {...tipProps(look === 'settled' ? 'map:lure-settled' : 'map:lure')}
        data-mark="lure-figure"
      >
        <Fitted drawn={lureFigure(look)} x={8} y={6} width={76} height={50} />
      </g>
      <g transform="translate(46 62)" {...tipProps('map:leads')} data-mark="leads-left">
        <Placed
          node={drawLeadsLeft(PALETTE, lure.leadsLeft, 14)}
          x={-17}
          y={-7}
          size={14 * 2.4}
        />
      </g>
      {lead && (
        <ActionButton
          kind="lead"
          icon="lead"
          cost={lead.cost}
          enabled={lead.enabled}
          why={lead.why ?? null}
          done={leading}
          x={size.width - ACTION_W - 2}
          y={8}
          onRun={onLead}
          {...(leadRef ? { buttonRef: leadRef } : {})}
        />
      )}
    </g>
  );
}

const CHIP_W = 38;
const ROW_H = 30;
const PAD = 8;

/** The cart's card size: the picture and toggles, then a row each for what you can load and unload. */
export function cartSize(
  toggles: number,
  loads: number,
  unloads: number,
): { width: number; height: number } {
  const chips = Math.max(loads, unloads);
  const rows = (loads > 0 ? 1 : 0) + (unloads > 0 ? 1 : 0);
  return {
    width: Math.max(150, 2 * PAD + 30 + chips * CHIP_W, 92 + toggles * ACTION_W),
    height: 72 + labelH() + (rows > 0 ? 6 + rows * ROW_H : 0),
  };
}

function Chip({
  move,
  kind,
  x,
  onMove,
}: {
  move: CartMove;
  kind: 'load' | 'unload';
  x: number;
  onMove: () => void;
}): JSX.Element {
  const run = (): void => {
    if (move.enabled) onMove();
  };
  return (
    <g
      class={move.enabled ? 'svg-button' : 'svg-button is-off'}
      role="button"
      tabindex={0}
      aria-label={kind}
      aria-disabled={!move.enabled}
      data-move={kind}
      data-material={move.material}
      {...greyedProps(move.enabled, move.why ?? null, tipFor('material', move.material))}
      transform={`translate(${x} 0)`}
      onClick={run}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run();
        }
      }}
    >
      <g opacity={move.enabled ? 1 : 0.4}>
        <rect width={CHIP_W - 4} height={ROW_H - 4} rx={7} fill={PALETTE.paperDeep} />
        <CardIcon id={iconOf(move.material)} x={2} y={1} size={22} />
        <text
          x={CHIP_W - 8}
          y={ROW_H - 9}
          text-anchor="end"
          fill={PALETTE.ink}
          font-size={11}
          font-weight={600}
          font-family="system-ui, sans-serif"
        >
          {move.count}
        </text>
      </g>
    </g>
  );
}

export function CartCard({
  state,
  cart,
  toggles,
  load,
  unload,
  onToggle,
  onMove,
  arm,
  firstRef,
}: {
  state: GameStateView;
  cart: Cart;
  toggles: readonly CartToggle[];
  /** Materials in your pack (a tap loads one unit) and in the cart (a tap unloads one). */
  load: readonly CartMove[];
  unload: readonly CartMove[];
  onToggle: (kind: CartToggle['kind']) => void;
  onMove: (kind: 'load' | 'unload', material: string) => void;
  /** Two taps spend a hitch or a seat (the toggles that cost an action). */
  arm?: Arming;
  firstRef?: (el: SVGGElement | null) => void;
}): JSX.Element {
  const size = cartSize(toggles.length, load.length, unload.length);
  const look = cartLook(cart);
  const who = cart.rider ?? cart.puller;
  const drawn = drawCart(PALETTE, look, {
    k: 1,
    squash: MAP_TUNING.tilt,
    seed: 'card',
    ...(who ? { accent: accentOf(who, MAP_TUNING.accent) } : {}),
  });
  const slots = Math.max(1, Math.min(8, state.config.cartCargo));
  const fill = drawCargoFill(PALETTE, cargoFill(state, cart), slots, 12);
  const fillW = (12 * (slots * 10.5 + 6)) / 16;
  const rows: { kind: 'load' | 'unload'; moves: readonly CartMove[] }[] = [
    ...(load.length > 0 ? [{ kind: 'load' as const, moves: load }] : []),
    ...(unload.length > 0 ? [{ kind: 'unload' as const, moves: unload }] : []),
  ];
  return (
    <g data-popover="cart" data-cart={cart.id} data-look={look}>
      <Card {...size} />
      <g {...tipProps('map:cart')} data-mark="cart-figure">
        <Fitted drawn={drawn} x={6} y={4} width={80} height={52} />
      </g>
      <g
        transform={`translate(${6 + 40 - fillW / 2} 58)`}
        {...tipProps('map:cargo')}
        data-mark="cargo-fill"
        data-fill={Math.round(cargoFill(state, cart) * 100)}
      >
        <Placed node={fill} x={0} y={0} size={fillW} />
      </g>
      {toggles.map((t, i) => (
        <ActionButton
          key={t.kind}
          kind={t.kind}
          icon={t.kind === 'unhitch' ? 'hitch' : t.kind === 'leave-cart' ? 'board-cart' : t.kind}
          cost={t.cost}
          enabled={t.enabled}
          why={t.why ?? null}
          done={t.done}
          x={size.width - (toggles.length - i) * ACTION_W - 2}
          y={8}
          onRun={() => onToggle(t.kind)}
          {...(t.cost > 0 && arm ? { arm } : {})}
          {...(i === 0 && firstRef ? { buttonRef: firstRef } : {})}
        />
      ))}
      {rows.map((row, r) => (
        <g
          key={row.kind}
          transform={`translate(${PAD} ${72 + labelH() + 6 + r * ROW_H})`}
          data-row={row.kind}
        >
          <g {...tipProps(tipFor('action', row.kind))}>
            <CardIcon id={row.kind} x={0} y={-1} size={26} />
          </g>
          {row.moves.map((m, i) => (
            <Chip
              key={m.material}
              move={m}
              kind={row.kind}
              x={30 + i * CHIP_W}
              onMove={() => onMove(row.kind, m.material)}
            />
          ))}
        </g>
      ))}
    </g>
  );
}
