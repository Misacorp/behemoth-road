// Tests for scripts/art-review.mjs. Run: node --test 'scripts/*.test.mjs'
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { artPath, merge, nextBatch, safeName } from './art-review.mjs';

const V1 = 'aaaa0001';
const V2 = 'aaaa0002';
const item = (id, version, extra = {}) => ({
  id,
  group: 'Tiles',
  title: id,
  file: `${safeName(id)}.svg`,
  version,
  kind: 'glance',
  ...extra,
});

describe('merge', () => {
  test('a first export puts every item in its batch', () => {
    const { manifest, fresh } = merge(null, { batch: 'b1', items: [item('a', V1), item('b', V1)] });
    assert.deepEqual(manifest.batches, ['b1']);
    assert.deepEqual(
      manifest.items.map((i) => [i.id, i.batch, i.file]),
      [
        ['a', 'b1', `art/a-${V1}.svg`],
        ['b', 'b1', `art/b-${V1}.svg`],
      ],
    );
    assert.equal(fresh.length, 2);
  });

  test('unchanged items keep their batch; changed ones move to the new batch', () => {
    const first = merge(null, { batch: 'b1', items: [item('a', V1), item('b', V1)] });
    const { manifest, fresh } = merge(first.manifest, {
      batch: 'b2',
      items: [item('a', V1), item('b', V2)],
    });
    assert.deepEqual(manifest.batches, ['b1', 'b2']);
    const by = Object.fromEntries(manifest.items.map((i) => [i.id, i]));
    assert.equal(by.a.batch, 'b1');
    assert.equal(by.b.batch, 'b2');
    assert.equal(by.b.file, `art/b-${V2}.svg`);
    assert.deepEqual(
      fresh.map((i) => i.id),
      ['b'],
    );
  });

  test('items the export drops are kept but marked removed, and come back if exported again', () => {
    const first = merge(null, { batch: 'b1', items: [item('a', V1), item('c', V1)] });
    const second = merge(first.manifest, { batch: 'b2', items: [item('a', V1)] });
    const c = second.manifest.items.find((i) => i.id === 'c');
    assert.equal(c.removed, true);
    assert.deepEqual(second.manifest.batches, ['b1'], 'a removal alone adds no batch');
    const third = merge(second.manifest, { batch: 'b3', items: [item('a', V1), item('c', V1)] });
    assert.equal(third.manifest.items.find((i) => i.id === 'c').removed, undefined);
  });

  test('a reused batch name from the export gets the next number', () => {
    const first = merge(null, { batch: '2026-11-19-1', items: [item('a', V1)] });
    const { manifest } = merge(first.manifest, { batch: '2026-11-19-1', items: [item('a', V2)] });
    assert.deepEqual(manifest.batches, ['2026-11-19-1', '2026-11-19-2']);
    assert.equal(manifest.items[0].batch, '2026-11-19-2');
  });

  test('an export with nothing new adds no batch', () => {
    const first = merge(null, { batch: 'b1', items: [item('a', V1)] });
    const again = merge(first.manifest, { batch: 'b2', items: [item('a', V1)] });
    assert.deepEqual(again.manifest.batches, ['b1']);
    assert.equal(again.fresh.length, 0);
  });

  test('picks need a pick key and a question', () => {
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('p', V1, { kind: 'pick' })] }),
      /pick needs/,
    );
    const ok = merge(null, {
      batch: 'b1',
      items: [item('p', V1, { kind: 'pick', pick: 'palette', question: 'Which?' })],
    });
    assert.equal(ok.manifest.items[0].pick, 'palette');
  });

  test('rejects duplicates, ids that collide once made safe, and unknown kinds', () => {
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', V1), item('a', V2)] }),
      /duplicate/,
    );
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a/b', V1), item('a-b', V1)] }),
      /duplicate/,
    );
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', V1, { kind: 'other' })] }),
      /bad kind/,
    );
  });

  test('rejects versions and file names that could leave their folder', () => {
    assert.throws(() => merge(null, { batch: 'b1', items: [item('a', '../../x')] }), /bad version/);
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', V1, { file: '../secret.svg' })] }),
      /bad file/,
    );
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', V1, { file: 'dir/a.svg' })] }),
      /bad file/,
    );
    assert.throws(() => merge(null, { batch: 'b1', items: [item('../a', V1)] }), /bad id/);
  });
});

describe('nextBatch', () => {
  test('keeps a new name and numbers a repeated one by its date', () => {
    assert.equal(nextBatch([], '2026-11-19-1'), '2026-11-19-1');
    assert.equal(nextBatch(['2026-11-19-1', '2026-11-19-3'], '2026-11-19-1'), '2026-11-19-4');
  });

  test('a plain date keeps its day', () => {
    assert.equal(nextBatch(['2026-11-19'], '2026-11-19'), '2026-11-19-1');
  });
});

test('file names are safe and versioned', () => {
  assert.equal(safeName('style/morning'), 'style-morning');
  assert.equal(artPath({ id: 'props/tree', version: 'ab12cd34' }), 'art/props-tree-ab12cd34.svg');
});
