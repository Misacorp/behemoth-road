import { describe, expect, it } from 'vitest';
import wikiHtml from '../../web/wiki.html?raw';
import viteConfig from '../../web/vite.config.ts?raw';
import wranglerText from '../wrangler.jsonc?raw';
import { createHandler } from '../src/handler.ts';
import { ORIGIN, callHandler } from './helpers.ts';

/** wrangler.jsonc without its comments (none of its strings contain `//`). */
const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '')) as {
  assets: {
    not_found_handling: string;
    html_handling?: string;
    run_worker_first: string[];
  };
};

describe('the public skills wiki at /wiki', () => {
  it('is a second entry of the frontend build, served as /wiki.html', () => {
    expect(viteConfig).toMatch(/wiki:\s*'wiki\.html'/);
    expect(wikiHtml).toContain('/src/wiki/main.tsx');
  });

  it('is served by the assets before the single-page fallback, and never by the Worker', () => {
    const { assets } = wrangler;
    // /wiki finds wiki.html; /wiki/ redirects to it; unknown paths still fall back to the game.
    expect(assets.html_handling).toBe('auto-trailing-slash');
    expect(assets.not_found_handling).toBe('single-page-application');
    // Only /api/* runs the Worker's code (and its sessions), so /wiki needs no sign-in.
    expect(assets.run_worker_first).toEqual(['/api/*']);
  });

  it('is left to the assets without a session if the Worker is ever reached', async () => {
    const handler = createHandler();
    const seen: string[] = [];
    const assets = {
      fetch: (req: Request) => {
        seen.push(new URL(req.url).pathname);
        return Promise.resolve(new Response('wiki'));
      },
    } as unknown as Fetcher;
    for (const path of ['/wiki', '/wiki/']) {
      const res = await callHandler(handler, new Request(`${ORIGIN}${path}`), { ASSETS: assets });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('wiki');
    }
    expect(seen).toEqual(['/wiki', '/wiki/']);
  });
});
