/**
 * The join wizard's steps: pick a character, pick a role, confirm. On phones one step shows at a time
 * (with a back control); on desktop every step shows at once and the same state drives it.
 */
export type Step = 'character' | 'role' | 'confirm';

export interface Wizard {
  readonly step: Step;
  readonly offer: number | null;
  readonly role: string | null;
}

export const START: Wizard = { step: 'character', offer: null, role: null };

export type WizardAction =
  | { readonly kind: 'offer'; readonly index: number }
  | { readonly kind: 'role'; readonly role: string }
  | { readonly kind: 'back' };

export function wizard(w: Wizard, a: WizardAction): Wizard {
  switch (a.kind) {
    case 'offer':
      return { ...w, offer: a.index, step: w.role === null ? 'role' : 'confirm' };
    case 'role':
      return { ...w, role: a.role, step: w.offer === null ? 'character' : 'confirm' };
    case 'back':
      return { ...w, step: w.step === 'confirm' ? 'role' : 'character' };
  }
}

/** Whether the choice is complete and can be sent. */
export const ready = (w: Wizard): w is Wizard & { offer: number; role: string } =>
  w.offer !== null && w.role !== null;
