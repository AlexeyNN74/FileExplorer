import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFileDate, formatDate, calculateTimeElapsed } from '../src/utils/formatters.js';

test('legacy UTC timestamps and RFC3339 denote the same instant, independent of host timezone', () => {
    assert.equal(parseFileDate('2025-06-04 12:47:48').toISOString(), '2025-06-04T12:47:48.000Z');
    assert.equal(parseFileDate('2025-06-04T15:47:48+03:00').getTime(), parseFileDate('2025-06-04 12:47:48').getTime());
    assert.equal(parseFileDate(0).toISOString(), '1970-01-01T00:00:00.000Z');
    assert.ok(parseFileDate(new Date(0)));
    assert.ok(parseFileDate('2024-02-29'));
    assert.ok(!formatDate('2025-06-04 12:47:48').includes('Invalid'));
});
test('missing and invalid metadata stay unknown rather than displaying Invalid date', () => {
    for (const value of [null, undefined, '', 'not-a-date', '2025-02-30 12:00:00', '2025-13-01 00:00:00', '2025-02-30T12:00:00Z']) {
        assert.equal(parseFileDate(value), null);
        assert.equal(formatDate(value), 'Unknown');
        assert.equal(calculateTimeElapsed(value), 'Unknown');
    }
});
