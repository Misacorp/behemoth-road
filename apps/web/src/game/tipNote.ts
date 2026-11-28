/**
 * The tip an action button shows on its first tap (and on hover): which tip it is, and the one thing the
 * tip fills in for this button: the odds of a roll ("Success 70% · Angered 30%") or the name of the thing it
 * acts on. The line reads like Misa's examples: the verb, a full stop, one plain sentence, so "Parley. Win
 * the village over. Success 70% · Angered 30%". Pure, so it is tested here; the tip layer draws the same
 * title and text.
 */
import { DEFAULT_CONFIG, type TuningConfig } from '@behemoth-road/core';
import { TIP_TABLE, type TipId } from '../text/tips.ts';
import { fillTip, tipValues } from '../text/tipValues.ts';
import { tipFor } from '../ui/tip.ts';
import { verbOf } from '../text/verbs.ts';
import type { OddsView } from './odds.ts';

/** The tip of an action button: a boon's own, an offer's, or the action's. */
export function actionTip(kind: string): TipId | null {
  if (kind.startsWith('boon:')) return tipFor('boon', kind.slice(5));
  if (kind.startsWith('offer')) return 'action:offer';
  return tipFor('action', kind);
}

/** What fills the tip's `{note}`: the odds when the action rolls, else null. */
export const tipNoteOf = (odds: OddsView | null | undefined): string | null => odds?.note ?? null;

/**
 * The whole line a tip says for an action: "Verb. Sentence. Odds". `note` fills the text's `{note}` (the
 * odds, or a thing's name); an action with neither says just the sentence.
 */
export function actionLine(
  kind: string,
  note: string | null = null,
  config: TuningConfig = DEFAULT_CONFIG,
): string | null {
  const id = actionTip(kind);
  if (id === null) return null;
  const tip: { readonly title?: string; readonly text: string } = TIP_TABLE[id];
  const title = tip.title ?? verbOf(kind) ?? kind;
  const text = fillTip(tip.text, { ...tipValues(config), note: note ?? '' }).trim();
  return `${title}. ${text}`;
}
