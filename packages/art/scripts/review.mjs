// Writes the art review batch to packages/art/review-out/: one SVG per item and items.json.
// Usage: pnpm --filter @behemoth-road/art review [--out <dir>] [--batch <YYYY-MM-DD-n>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { log } from 'node:console';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildReviewItems, nextBatch } from '../src/review.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

function versionOf(svg) {
  return createHash('sha256').update(svg).digest('hex').slice(0, 8);
}

function main() {
  const out = resolve(arg('--out') ?? join(here, '..', 'review-out'));
  mkdirSync(out, { recursive: true });
  const drafts = buildReviewItems();
  const items = drafts.map(({ svg, ...item }) => ({ ...item, version: versionOf(svg) }));
  for (const d of drafts) writeFileSync(join(out, d.file), d.svg);
  const index = join(out, 'items.json');
  const previous = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const batch = arg('--batch') ?? nextBatch(previous, items, today);
  writeFileSync(index, `${JSON.stringify({ batch, items }, null, 2)}\n`);
  log(`Wrote ${items.length} items to ${out} (batch ${batch})`);
}

if (resolve(argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
