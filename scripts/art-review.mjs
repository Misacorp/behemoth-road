#!/usr/bin/env node
// Prepares a batch for the art review page (tools/art-review/index.html).
//
// The art kit's export (packages/art/review-out/items.json plus one SVG per item) describes the current
// drawings. This script merges it into the cumulative manifest kept in tools/art-review/manifest.json:
// an item whose drawing changed (new `version`) moves into the new batch, an unchanged item keeps the
// batch it first appeared in, and items the export no longer has stay in the manifest as history. The
// review page decides what needs Misa from those batches, so silence on an older item means "accepted".
//
// Then it writes a staging folder to publish: items.json (the manifest with each item's file path) and
// the SVG files of items that are new in this batch, named by version so a changed drawing never reuses
// an old URL.
//
//   node scripts/art-review.mjs [--export packages/art/review-out] [--stage <dir>] [--dry-run]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = join(ROOT, 'tools/art-review/manifest.json');
const ITEM_KEYS = ['id', 'group', 'title', 'version', 'kind', 'pick', 'question'];

export function safeName(id) {
  return id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The review page's database key for an id (tools/art-review/index.html `docId`); must stay in step. */
export function docKey(id) {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function artPath(item) {
  return `art/${safeName(item.id)}-${item.version}.svg`;
}

function validate(exp) {
  if (!exp || typeof exp.batch !== 'string' || !Array.isArray(exp.items)) {
    throw new Error('export: expected { batch, items[] }');
  }
  const seen = new Set();
  const pickKeys = new Map();
  for (const it of exp.items) {
    for (const k of ['id', 'group', 'title', 'file', 'version', 'kind']) {
      if (typeof it[k] !== 'string' || !it[k]) throw new Error(`export item: missing ${k}`);
    }
    if (it.kind !== 'glance' && it.kind !== 'pick')
      throw new Error(`export item ${it.id}: bad kind`);
    if (it.kind === 'pick' && (!it.pick || !it.question)) {
      throw new Error(`export item ${it.id}: a pick needs pick and question`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(it.id))
      throw new Error(`export item: bad id ${it.id}`);
    if (!/^[0-9a-f]{6,64}$/.test(it.version)) throw new Error(`export item ${it.id}: bad version`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/.test(it.file) || it.file.includes('..')) {
      throw new Error(`export item ${it.id}: bad file name`);
    }
    // Ids must stay distinct once made safe for file names and for the page's database keys.
    for (const key of [`file:${safeName(it.id)}`, `doc:${docKey(it.id)}`]) {
      if (seen.has(key)) throw new Error(`export: duplicate id ${it.id}`);
      seen.add(key);
    }
    if (it.kind === 'pick') {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(it.pick)) {
        throw new Error(`export item ${it.id}: bad pick key`);
      }
      const owner = pickKeys.get(docKey(it.pick));
      if (owner !== undefined && owner !== it.pick) {
        throw new Error(`export: pick keys ${owner} and ${it.pick} collide`);
      }
      pickKeys.set(docKey(it.pick), it.pick);
    }
  }
}

/**
 * Merges an export into the cumulative manifest. Pure: returns { manifest, fresh } where `fresh` lists
 * the export items whose drawing is new in this batch.
 */
export function merge(manifest, exp) {
  validate(exp);
  const prev = manifest ?? { batches: [], items: [] };
  const batch = nextBatch(prev.batches, exp.batch);
  const byId = new Map(prev.items.map((it) => [it.id, it]));
  const fresh = [];
  let listChanged = false;
  for (const it of exp.items) {
    const old = byId.get(it.id);
    if (old?.removed) listChanged = true;
    const entry = {};
    for (const k of ITEM_KEYS) if (it[k] !== undefined) entry[k] = it[k];
    if (old && old.version === it.version) {
      entry.batch = old.batch;
    } else {
      entry.batch = batch;
      fresh.push(it);
    }
    entry.file = artPath(entry);
    byId.set(it.id, entry);
  }
  // Items the export no longer has stay as history, marked removed so the page hides them.
  const exported = new Set(exp.items.map((it) => it.id));
  for (const [id, entry] of byId) {
    if (!exported.has(id) && !entry.removed) {
      byId.set(id, { ...entry, removed: true });
      listChanged = true;
    }
  }
  if (fresh.length === 0 && !listChanged) return { manifest: prev, fresh };
  const batches = fresh.length ? [...prev.batches, batch] : prev.batches;
  return { manifest: { batches, items: [...byId.values()] }, fresh };
}

/**
 * The manifest owns batch names: the export's name is used unless the manifest already has it, in which
 * case the number after the date goes up past the highest one seen for that date.
 */
export function nextBatch(batches, wanted) {
  if (!batches.includes(wanted)) return wanted;
  const shape = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;
  const date = wanted.match(shape)?.[1] ?? wanted;
  let n = 0;
  for (const b of batches) {
    const m = b.match(shape);
    if (m && m[1] === date) n = Math.max(n, Number(m[2] ?? 0));
  }
  return `${date}-${n + 1}`;
}

function main(argv) {
  const arg = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : def;
  };
  const exportDir = resolve(ROOT, arg('--export', 'packages/art/review-out'));
  const stage = resolve(ROOT, arg('--stage', 'tools/art-review/stage'));
  const dry = argv.includes('--dry-run');
  const exp = JSON.parse(readFileSync(join(exportDir, 'items.json'), 'utf8'));
  const prev = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
  const { manifest, fresh } = merge(prev, exp);
  console.log(`${fresh.length} new or changed item(s) in batch ${manifest.batches.at(-1)}`);
  for (const it of fresh) console.log(`  ${it.id} -> ${artPath(it)}`);
  if (dry || fresh.length === 0) return;
  mkdirSync(join(stage, 'art'), { recursive: true });
  for (const it of fresh) copyFileSync(join(exportDir, it.file), join(stage, artPath(it)));
  const out = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(stage, 'items.json'), out);
  writeFileSync(MANIFEST, out);
  console.log(`staged in ${stage}; manifest updated`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
