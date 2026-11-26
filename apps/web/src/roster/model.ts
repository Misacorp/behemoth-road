/**
 * The roster's rows, from the player view: every player in the game, you first, then the rest by their
 * Discord name. Pure, so the ordering and the marks are tested at this layer.
 */
import type { PlayerView } from '../api/schema.ts';
import type { Flow } from '../map/flow.ts';
import { IDLE } from '../map/flow.ts';
import { effectiveStance } from '@behemoth-road/core';
import { toGameState } from '../game/viewState.ts';

/** Where a player's character is: not joined, lost to the fog, on the creature's back, or on the map. */
export type RosterWhere = 'none' | 'lost' | 'riding' | 'map';

export interface RosterRow {
  readonly userId: string;
  /** The Discord display name (rendered as text only). */
  readonly name: string;
  readonly characterId: string | null;
  readonly role: string | null;
  readonly mine: boolean;
  readonly where: RosterWhere;
  /** Actions still to spend today; 0 when there is no active character. */
  readonly actionsLeft: number;
  /** Actions a day (from the config). */
  readonly actionsPerDay: number;
  /** An active character with no actions left: done for the day. */
  readonly done: boolean;
  /** The stance that acts at the tick (the chosen one, or rest where it does not fit); null with no active character. */
  readonly stance: string | null;
  /** Ended their day: what is left goes to their stance. */
  readonly waiting: boolean;
  /** Pinned under a falling slide: cannot act until dug out or the stones give. */
  readonly pinned: boolean;
  /** The row can be tapped to find the character on the map. */
  readonly tappable: boolean;
}

const byName = (a: RosterRow, b: RosterRow): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  a.name.localeCompare(b.name, 'en') ||
  a.userId.localeCompare(b.userId, 'en');

export function rosterRows(view: PlayerView, actionsPerDay: number): RosterRow[] {
  const rows = view.players.map((p): RosterRow => {
    const c =
      p.characterId === null ? null : view.game.characters.find((x) => x.id === p.characterId);
    const where: RosterWhere = !c
      ? 'none'
      : c.status === 'lost'
        ? 'lost'
        : c.at.kind === 'creature'
          ? 'riding'
          : 'map';
    const active = where === 'riding' || where === 'map';
    const left = active && c ? c.actionsLeft : 0;
    return {
      userId: p.userId,
      name: p.name,
      characterId: c ? c.id : null,
      role: c?.role ?? p.role,
      mine: p.userId === view.you.userId,
      where,
      actionsLeft: left,
      actionsPerDay,
      done: active && left === 0,
      stance: active && c ? effectiveStance(toGameState(view.game), c).id : null,
      waiting: active && c ? c.waiting : false,
      pinned: active && c ? c.pinnedDay !== undefined : false,
      tappable: active,
    };
  });
  return [...rows.filter((r) => r.mine), ...rows.filter((r) => !r.mine).sort(byName)];
}

/**
 * A character found from the roster stays pinned only while the roster can still find it (active, in the
 * view). When it is lost or gone, a card open on it closes and the pin drops.
 */
export function keepFound(
  rows: readonly RosterRow[],
  flow: Flow,
  pinned: string | undefined,
): { readonly flow: Flow; readonly pinned: string | undefined } {
  if (pinned === undefined) return { flow, pinned };
  if (rows.some((r) => r.characterId === pinned && r.tappable)) return { flow, pinned };
  return { flow: flow.kind === 'character' && flow.id === pinned ? IDLE : flow, pinned: undefined };
}
