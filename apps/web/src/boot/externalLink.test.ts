import { describe, expect, it, vi } from 'vitest';
import { openExternal, siteUrl } from './externalLink.ts';

describe('openExternal', () => {
  it('opens the absolute site URL through the SDK inside Discord', () => {
    const openExternalLink = vi.fn(() => Promise.resolve());
    const event = { preventDefault: vi.fn() };
    const handled = openExternal(event, '/wiki', 'https://game.example', {
      commands: { openExternalLink },
    });
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternalLink).toHaveBeenCalledWith({ url: 'https://game.example/wiki' });
  });

  it('leaves the link alone outside Discord', () => {
    const event = { preventDefault: vi.fn() };
    expect(openExternal(event, '/wiki', 'https://game.example', null)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('survives a rejected SDK call and builds the URL from the origin only', async () => {
    const event = { preventDefault: vi.fn() };
    const openExternalLink = vi.fn(() => Promise.reject(new Error('no')));
    expect(openExternal(event, '/wiki', 'https://x.test', { commands: { openExternalLink } })).toBe(
      true,
    );
    await Promise.resolve();
    expect(siteUrl('/wiki', 'https://x.test/a/b')).toBe('https://x.test/wiki');
  });
});
