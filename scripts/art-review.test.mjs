// Tests for scripts/art-review.mjs. Run: node --test 'scripts/*.test.mjs'
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { artPath, merge, safeName } from './art-review.mjs';

const item = (id, version, extra = {}) => ({
  id,
  group: 'Tiles',
  title: id,
  file: `${id}.svg`,
  version,
  kind: 'glance',
  ...extra,
});

describe('merge', () => {
  test('a first export puts every item in its batch', () => {
    const { manifest, fresh } = merge(null, {
      batch: 'b1',
      items: [item('a', 'v1'), item('b', 'v1')],
    });
    assert.deepEqual(manifest.batches, ['b1']);
    assert.deepEqual(
      manifest.items.map((i) => [i.id, i.batch, i.file]),
      [
        ['a', 'b1', 'art/a-v1.svg'],
        ['b', 'b1', 'art/b-v1.svg'],
      ],
    );
    assert.equal(fresh.length, 2);
  });

  test('unchanged items keep their batch; changed ones move to the new batch; missing ones stay', () => {
    const first = merge(null, {
      batch: 'b1',
      items: [item('a', 'v1'), item('b', 'v1'), item('c', 'v1')],
    });
    const { manifest, fresh } = merge(first.manifest, {
      batch: 'b2',
      items: [item('a', 'v1'), item('b', 'v2')],
    });
    assert.deepEqual(manifest.batches, ['b1', 'b2']);
    const by = Object.fromEntries(manifest.items.map((i) => [i.id, i]));
    assert.equal(by.a.batch, 'b1');
    assert.equal(by.b.batch, 'b2');
    assert.equal(by.b.file, 'art/b-v2.svg');
    assert.equal(by.c.batch, 'b1');
    assert.deepEqual(
      fresh.map((i) => i.id),
      ['b'],
    );
  });

  test('a reused batch name from the export gets the next number', () => {
    const first = merge(null, { batch: '2026-11-19-1', items: [item('a', 'v1')] });
    const { manifest } = merge(first.manifest, { batch: '2026-11-19-1', items: [item('a', 'v2')] });
    assert.deepEqual(manifest.batches, ['2026-11-19-1', '2026-11-19-2']);
    assert.equal(manifest.items[0].batch, '2026-11-19-2');
  });

  test('an export with nothing new adds no batch', () => {
    const first = merge(null, { batch: 'b1', items: [item('a', 'v1')] });
    const again = merge(first.manifest, { batch: 'b2', items: [item('a', 'v1')] });
    assert.deepEqual(again.manifest.batches, ['b1']);
    assert.equal(again.fresh.length, 0);
  });

  test('picks need a pick key and a question', () => {
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('p', 'v1', { kind: 'pick' })] }),
      /pick needs/,
    );
    const ok = merge(null, {
      batch: 'b1',
      items: [item('p', 'v1', { kind: 'pick', pick: 'palette', question: 'Which?' })],
    });
    assert.equal(ok.manifest.items[0].pick, 'palette');
  });

  test('rejects duplicates and unknown kinds', () => {
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', 'v1'), item('a', 'v2')] }),
      /duplicate/,
    );
    assert.throws(
      () => merge(null, { batch: 'b1', items: [item('a', 'v1', { kind: 'other' })] }),
      /bad kind/,
    );
  });
});

test('file names are safe and versioned', () => {
  assert.equal(safeName('style/morning'), 'style-morning');
  assert.equal(
    artPath({ id: 'props/tree conifer', version: 'ab12cd34' }),
    'art/props-tree-conifer-ab12cd34.svg',
  );
});
