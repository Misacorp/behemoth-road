import { describe, expect, it } from 'vitest';
import { holdMs } from '../text/tips.ts';
import {
  contextMenuDismisses,
  enteredHost,
  idOf,
  isHeldClick,
  keepsNativeMenu,
  isPlainIcon,
  leftHost,
  setTipExtra,
  tipHost,
} from './press.ts';

describe('pointer rules', () => {
  it('only a mouse context menu dismisses', () => {
    expect(contextMenuDismisses('mouse')).toBe(true);
    expect(contextMenuDismisses('touch')).toBe(false);
    expect(contextMenuDismisses('pen')).toBe(false);
  });
  it('a touch click after a hold is dropped, a quick one and a mouse click are not', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs + 1 }, holdMs + 5)).toBe(true);
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs - 50 }, holdMs - 40)).toBe(false);
    expect(isHeldClick({ type: 'mouse', id: 1, at: 0, up: holdMs + 500 }, holdMs + 505)).toBe(
      false,
    );
  });
  it('a click long after a quick touch press is not held, even if the press was long ago', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: 100 }, 10_000)).toBe(false);
  });
  it('a press whose lift never came drops nothing', () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: null }, holdMs + 1)).toBe(false);
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: null }, 60_000)).toBe(false);
  });
  it("a click long after a held press's lift is not that press's click", () => {
    expect(isHeldClick({ type: 'touch', id: 1, at: 0, up: holdMs + 100 }, holdMs + 5_000)).toBe(
      false,
    );
  });
});

/** A tiny stand-in for the DOM: a tree of nodes with attributes, `closest` and `contains`. */
class Fake {
  nodeType = 1;
  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
    readonly parent: Fake | null = null,
  ) {}
  hasAttribute(n: string): boolean {
    return n in this.attrs;
  }
  getAttribute(n: string): string | null {
    return Object.hasOwn(this.attrs, n) ? this.attrs[n]! : null;
  }
  matches(sel: string): boolean {
    return sel.split(',').some((part) => {
      const q = part.trim();
      const m = /^\[([a-z-]+)(?:=([a-z]+))?\]$/.exec(q);
      if (m) return m[1]! in this.attrs && (m[2] === undefined || this.attrs[m[1]!] === m[2]);
      return q === this.tag;
    });
  }
  closest(sel: string): Fake | null {
    return this.matches(sel) ? this : (this.parent?.closest(sel) ?? null);
  }
  contains(o: Fake): boolean {
    return o === this || (o.parent !== null && this.contains(o.parent));
  }
}

const el = (f: Fake): Element => f as unknown as Element;

describe('tip delegation', () => {
  const icon = new Fake('span', { 'data-tip': 'role:scout' });
  const inner = new Fake('svg', {}, icon);
  const outside = new Fake('div');
  const button = new Fake('button', { 'data-tip': 'hud:day' });
  const buttonChild = new Fake('span', {}, button);
  const inButton = new Fake('span', { 'data-tip': 'role:keeper' }, button);
  const packButton = new Fake('button', { 'data-tip': 'hud:pack', 'data-tip-tap': '' });

  it('finds the nearest element with a tip, from anywhere inside it', () => {
    expect(tipHost(inner)).toBe(icon);
    expect(tipHost(icon)).toBe(icon);
    expect(tipHost(buttonChild)).toBe(button);
    expect(tipHost(outside)).toBeNull();
    expect(tipHost(null)).toBeNull();
  });
  it('a plain icon shows its tip on a tap; one in a button does not unless it says so', () => {
    expect(isPlainIcon(el(icon))).toBe(true);
    expect(isPlainIcon(el(button))).toBe(false);
    expect(isPlainIcon(el(inButton))).toBe(false);
    expect(isPlainIcon(el(packButton))).toBe(true);
  });
  it('a mouse entering counts once, not when moving between an element and its children', () => {
    expect(enteredHost(inner, outside)).toBe(icon);
    expect(enteredHost(inner, null)).toBe(icon);
    expect(enteredHost(inner, icon)).toBeNull();
    expect(enteredHost(icon, inner)).toBeNull();
    expect(enteredHost(outside, icon)).toBeNull();
  });
  it('a mouse leaving counts only when it goes out of the element', () => {
    expect(leftHost(inner, outside)).toBe(icon);
    expect(leftHost(icon, null)).toBe(icon);
    expect(leftHost(inner, icon)).toBeNull();
    expect(leftHost(outside, icon)).toBeNull();
  });
  it('from a nested tip out to its parent area it leaves the child only (as pointerenter did)', () => {
    const parent = new Fake('g', { 'data-tip': 'settlement:a' });
    const child = new Fake('g', { 'data-tip': 'boon:b' }, parent);
    expect(leftHost(child, parent)).toBe(child);
    expect(enteredHost(parent, child)).toBeNull();
  });
  it('a tip extra can be registered and removed', () => {
    const off = setTipExtra('hud:pack', () => 1);
    expect(() => off()).not.toThrow();
  });
  it('only ids in the tips table count', () => {
    expect(idOf(el(icon))).toBe('role:scout');
    expect(idOf(el(new Fake('span', { 'data-tip': 'no:such-tip' })))).toBeNull();
    expect(idOf(el(new Fake('span', { 'data-tip': 'constructor' })))).toBeNull();
    expect(idOf(el(outside))).toBeNull();
    expect(idOf(null)).toBeNull();
  });
  it("a long press in a text field keeps the phone's own menu; elsewhere it is dropped", () => {
    const input = new Fake('input');
    expect(keepsNativeMenu(input)).toBe(true);
    expect(keepsNativeMenu(new Fake('span', {}, new Fake('div', { contenteditable: '' })))).toBe(
      true,
    );
    expect(keepsNativeMenu(inner)).toBe(false);
    expect(keepsNativeMenu(null)).toBe(false);
  });
});
