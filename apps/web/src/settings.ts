/**
 * Player settings: one small module with defaults, so an options screen can expose them later. In-memory
 * for Milestone 1 (nothing is stored between visits).
 */
export interface Settings {
  /** Right-clicking the map closes the open popover, bubble or card (desktop). */
  readonly closeOnRightClick: boolean;
}

export const DEFAULT_SETTINGS: Settings = { closeOnRightClick: true };

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
