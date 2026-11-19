import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';

// Node's process exists here (vitest config runs in Node) but the Worker tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Placeholders so wrangler does not warn about missing required secrets. Tests inject a fake Discord
// client and never use these values against Discord.
process.env['DISCORD_CLIENT_SECRET'] ??= 'test-only-client-secret';
process.env['DISCORD_BOT_TOKEN'] ??= 'test-only-bot-token';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    testTimeout: 30_000,
    // scripts/*.test.mjs are node:test files, run by `node --test`. test/capture/** is the fixture
    // capture (`pnpm fixtures:capture`, vitest.capture.config.ts).
    exclude: [...configDefaults.exclude, 'scripts/**', 'test/capture/**'],
  },
});
