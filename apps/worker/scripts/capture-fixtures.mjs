#!/usr/bin/env node
// Re-captures the contract fixtures of `apps/web/src/api/fixtures` from real server output (creatures'
// decision "Client-server contract fixtures are captured from the real server"). Never edit them by hand.
//
//   pnpm fixtures:capture           write the files
//   pnpm fixtures:capture --check   write nothing; exit 1 if a file would change (CI runs this)
//
// It runs `test/capture/capture.test.ts` with `vitest.capture.config.ts`, reads the `FIXTURE <json>` line
// it prints, writes one file per response plus `errors.json` and `requests.json`, formats them with
// Prettier and says which files changed. Node only; vitest and Prettier come from the workspace.
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(workerDir, '../..');
export const FIXTURES_DIR = path.join(repoRoot, 'apps/web/src/api/fixtures');

/** `--check` or nothing; anything else is a usage error. */
export function parseArgs(argv) {
  const options = { check: false };
  for (const arg of argv) {
    if (arg === '--check') options.check = true;
    else throw new Error(`unknown argument ${arg} (only --check)`);
  }
  return options;
}

const NAME = /^[a-z][a-z0-9-]*$/;

/** The files of a captured set: `{ file name: value }`. */
export function filesOf(captured) {
  const out = {};
  for (const [name, value] of Object.entries(captured.responses)) {
    if (!NAME.test(name) || name === 'errors' || name === 'requests') {
      throw new Error(`bad response name ${name}`);
    }
    out[`${name}.json`] = value;
  }
  out['errors.json'] = captured.errors;
  out['requests.json'] = captured.requests;
  return out;
}

/** Runs the capture test; resolves with the parsed `FIXTURE` lines. */
function runCapture() {
  const vitest = path.join(
    path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
    'vitest.mjs',
  );
  const args = [
    vitest,
    'run',
    '--config',
    'vitest.capture.config.ts',
    '--disable-console-intercept',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workerDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const sets = [];
    const rest = [];
    let pending = '';
    const onLine = (line) => {
      const at = line.indexOf('FIXTURE {');
      if (at === -1) rest.push(line);
      else sets.push(JSON.parse(line.slice(at + 'FIXTURE '.length)));
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(onLine);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => rest.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (pending !== '') onLine(pending);
      if (code === 0) resolve(sets);
      else reject(new Error(`vitest failed (exit ${String(code)}):\n${rest.join('\n')}`));
    });
  });
}

function prettier(files) {
  const bin = createRequire(path.join(repoRoot, 'package.json')).resolve(
    'prettier/bin/prettier.cjs',
  );
  const config = path.join(repoRoot, '.prettierrc.json');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [bin, '--write', '--log-level', 'warn', '--config', config, ...files],
      { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`prettier failed (exit ${String(code)})`)),
    );
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sets = await runCapture();
  if (sets.length !== 1) throw new Error(`expected one fixture set, got ${String(sets.length)}`);
  const staging = mkdtempSync(path.join(tmpdir(), 'fixtures-'));
  try {
    const staged = new Map();
    for (const [file, value] of Object.entries(filesOf(sets[0]))) {
      const target = path.join(staging, file);
      writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
      staged.set(file, target);
    }
    await prettier([...staged.values()]);
    if (!options.check) mkdirSync(FIXTURES_DIR, { recursive: true });
    const changed = [];
    for (const [file, target] of staged) {
      const real = path.join(FIXTURES_DIR, file);
      const next = readFileSync(target, 'utf8');
      const before = existsSync(real) ? readFileSync(real, 'utf8') : null;
      if (before === next) continue;
      changed.push(file);
      if (!options.check) copyFileSync(target, real);
    }
    // A file the capture no longer writes is stale: removed when writing, reported by --check.
    const stale = existsSync(FIXTURES_DIR)
      ? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json') && !staged.has(f))
      : [];
    for (const file of stale) {
      changed.push(`${file} (no longer captured)`);
      if (!options.check) rmSync(path.join(FIXTURES_DIR, file));
    }
    changed.sort();
    const total = String(staged.size);
    if (options.check) {
      if (changed.length === 0) console.log(`fixtures are up to date (${total} files checked)`);
      else {
        console.error(
          `${String(changed.length)} of ${total} fixture files differ from a fresh capture:`,
        );
        for (const file of changed) console.error(`  ${file}`);
        console.error('run `pnpm fixtures:capture` and review the diff');
        process.exitCode = 1;
      }
    } else {
      console.log(`captured ${total} files, ${String(changed.length)} changed:`);
      for (const file of changed) console.log(`  ${file}`);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
