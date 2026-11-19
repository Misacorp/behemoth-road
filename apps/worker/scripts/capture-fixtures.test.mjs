import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filesOf, parseArgs } from './capture-fixtures.mjs';

test('takes only --check', () => {
  assert.deepEqual(parseArgs([]), { check: false });
  assert.deepEqual(parseArgs(['--check']), { check: true });
  assert.throws(() => parseArgs(['--set', 'x']));
});

test('writes one file per response, plus the errors and the requests', () => {
  const files = filesOf({
    responses: { 'view-new': { a: 1 }, config: {} },
    errors: [{ route: 'GET /api/game', status: 401, body: {} }],
    requests: { join: { method: 'POST', path: '/api/game/join', body: {} } },
  });
  assert.deepEqual(Object.keys(files).sort(), [
    'config.json',
    'errors.json',
    'requests.json',
    'view-new.json',
  ]);
  assert.throws(() => filesOf({ responses: { '../x': 1 }, errors: [], requests: {} }));
  assert.throws(() => filesOf({ responses: { errors: 1 }, errors: [], requests: {} }));
});
