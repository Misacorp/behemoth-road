/**
 * Where the season's peril came from, as the ending and the HUD gauge's popover show it: the core's public
 * log (`stats.peril`) turned into rows, biggest first. Each row is a source with its icon, the amount it added
 * (or took off) and a tip that hints at what to do about it (hint only, never the creature's nature). A
 * threat's row carries the threat's own figure. Numbers and icons only: the tips carry the words.
 */
import {
  PERIL_CALM,
  PERIL_HUNGER,
  PERIL_SHELTER,
  type PerilLog,
  THREAT_TYPES,
  threatOfSource,
} from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';

/** What a row draws: an art-kit icon id, or a threat's figure (its `icon` key). */
export type PerilArt =
  | { readonly kind: 'icon'; readonly id: string }
  | { readonly kind: 'threat'; readonly look: string };

export interface PerilRow {
  /** The core's source id (`hunger`, `threat:<type>`, `calm`, `shelter`) or `held`. */
  readonly source: string;
  readonly art: PerilArt;
  /** Peril added (or taken off, or held off), a positive number. */
  readonly amount: number;
  readonly tip: TipId;
}

export interface PerilBreakdown {
  /** Sources that added peril, biggest first (ties in the order of the log's keys). */
  readonly added: readonly PerilRow[];
  /** What took peril off: quiet days and shelters, biggest first. */
  readonly eased: readonly PerilRow[];
  /** What the guardians' defence kept off the creature (null for none). */
  readonly held: PerilRow | null;
  /** All the peril added, the sum of `added`. */
  readonly total: number;
  /** Nothing has been added or eased: there is nothing to show. */
  readonly empty: boolean;
}

/** The icon each plain source draws: the action that answers it. */
const SOURCE_ICONS: Readonly<Record<string, string>> = {
  [PERIL_HUNGER]: 'feed',
  [PERIL_CALM]: 'linger',
  [PERIL_SHELTER]: 'shelter',
};

/** The tip of a source; a threat type has its own (`peril:threat:<type>`). */
const tipOf = (source: string): TipId => {
  const type = threatOfSource(source);
  return (type === null ? `peril:${source}` : `peril:threat:${type}`) as TipId;
};

const artOf = (source: string): PerilArt | null => {
  const type = threatOfSource(source);
  if (type !== null) {
    const look = THREAT_TYPES.find((t) => t.id === type)?.icon;
    return look === undefined ? null : { kind: 'threat', look };
  }
  const id = SOURCE_ICONS[source];
  return id === undefined ? null : { kind: 'icon', id };
};

const rowsOf = (totals: Readonly<Record<string, number>>): PerilRow[] =>
  Object.entries(totals)
    .flatMap(([source, amount]) => {
      const art = artOf(source);
      return art && amount > 0 ? [{ source, art, amount, tip: tipOf(source) }] : [];
    })
    .sort((a, b) => b.amount - a.amount);

export function perilBreakdown(log: PerilLog): PerilBreakdown {
  const added = rowsOf(log.added);
  const eased = rowsOf(log.eased);
  return {
    added,
    eased,
    held:
      log.held > 0
        ? {
            source: 'held',
            art: { kind: 'icon', id: 'defend' },
            amount: log.held,
            tip: 'peril:held',
          }
        : null,
    total: added.reduce((n, r) => n + r.amount, 0),
    empty: added.length === 0 && eased.length === 0,
  };
}
