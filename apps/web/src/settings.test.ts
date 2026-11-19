import { afterEach, describe, expect, it } from 'vitest';
import { IDLE, keyDown, rightClick, type Flow } from './map/flow.ts';
import { DEFAULT_SETTINGS, getSettings, resetSettings, setSettings } from './settings.ts';

const open: Flow[] = [
  { kind: 'inspect', hex: { q: 1, r: 2 } },
  { kind: 'bubble', selecting: true },
  { kind: 'creature' },
  { kind: 'selected' },
  { kind: 'planned', to: { kind: 'creature' }, steps: [], cost: 1 },
];

describe('closing with Escape and right-click', () => {
  afterEach(resetSettings);

  it('Escape closes any popover, bubble or card and cancels a plan', () => {
    for (const f of open) expect(keyDown(f, 'Escape')).toEqual(IDLE);
    expect(keyDown(open[0]!, 'Enter')).toBe(open[0]);
  });

  it('right-click closes them the same way, by default', () => {
    expect(DEFAULT_SETTINGS.closeOnRightClick).toBe(true);
    for (const f of open) expect(rightClick(f, getSettings())).toEqual(IDLE);
  });

  it('with the setting off, right-click leaves everything open', () => {
    setSettings({ closeOnRightClick: false });
    for (const f of open) expect(rightClick(f, getSettings())).toBe(f);
  });
});
