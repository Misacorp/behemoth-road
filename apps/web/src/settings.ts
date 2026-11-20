/**
 * Player settings: one small module with defaults, so an options screen can expose them later. In-memory
 * for Milestone 1 (nothing is stored between visits).
 */
export interface Settings {
  /** Right-clicking the map closes the open popover, bubble or card (desktop). */
  readonly closeOnRightClick: boolean;
  /** An experiment: each action's verb ("Gather", "Strike") under its icon. Off by default. */
  readonly actionLabels: boolean;
}

export const DEFAULT_SETTINGS: Settings = { closeOnRightClick: true, actionLabels: false };

/** Settings a URL may switch for a comparison on staging: `?labels=1` (or `0`) for the action labels. */
export function settingsFromUrl(search: string): Partial<Settings> {
  const labels = new URLSearchParams(search).get('labels');
  if (labels === '1') return { actionLabels: true };
  if (labels === '0') return { actionLabels: false };
  return {};
}

let current: Settings = DEFAULT_SETTINGS;

export const getSettings = (): Settings => current;

export function setSettings(change: Partial<Settings>): Settings {
  current = { ...current, ...change };
  return current;
}

/** Back to the defaults (for tests). */
export function resetSettings(): void {
  current = DEFAULT_SETTINGS;
}
