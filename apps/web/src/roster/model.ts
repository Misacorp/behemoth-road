/**
 * The roster's rows, from the player view: every player in the game, you first, then the rest by their
 * Discord name. Pure, so the ordering and the marks are tested at this layer.
 */
import type { PlayerView } from '../api/schema.ts';

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
      tappable: active,
    };
  });
  return [...rows.filter((r) => r.mine), ...rows.filter((r) => !r.mine).sort(byName)];
}
