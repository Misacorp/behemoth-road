// Plain JS so it can read files without Node type definitions (the package has no @types/node).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const COLOUR =
  /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b(black|white|red|green|blue|grey|gray)\b(?=['"])/i;

describe('colour lint', () => {
  it('writes colours only in palette.ts', () => {
    for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'palette.ts')) {
      const lines = readFileSync(join(SRC, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        expect(COLOUR.test(line), `${file}:${i + 1}: ${line.trim()}`).toBe(false);
      });
    }
  });
});
