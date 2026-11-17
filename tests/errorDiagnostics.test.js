import test from 'node:test';
import assert from 'node:assert/strict';
import { captureErrorReport, persistErrorReport } from '../src/utils/errorDiagnostics.js';

test('captures message, JS stack and React component stack without serializing other data', () => {
    const error = new Error('render failed');
    error.secret = 'do not copy';
    const report = captureErrorReport(error, { componentStack: '\n at MainLayout' });
    assert.equal(report.message, 'render failed');
    assert.match(report.stack, /render failed/);
    assert.equal(report.componentStack, '\n at MainLayout');
    assert.equal('secret' in report, false);
});

test('bounds text and handles thrown strings, null and hostile getters', () => {
    assert.equal(captureErrorReport('bad', {}).message, 'bad');
    assert.equal(captureErrorReport(null, null).message, 'Unknown application error');
    assert.equal(captureErrorReport({ message: 'x'.repeat(10000) }, {}).message.length, 4096);
    assert.equal(captureErrorReport({ get message() { throw Error('getter'); } }, {}).message, 'Unable to read application error');
});

test('disabled reporting reveals no path; opted-in reporting returns only local status', async () => {
    assert.equal(await persistErrorReport(async () => null, Error('private'), {}), null);
    let call;
    const result = await persistErrorReport(async (...args) => { call = args; return '/local/logs/frontend-error.json'; }, Error('failure'), { componentStack: 'at App' });
    assert.equal(call[0], 'report_frontend_error');
    assert.equal(call[1].report.componentStack, 'at App');
    assert.deepEqual(result, { saved: true, path: '/local/logs/frontend-error.json' });
});

test('unavailable IPC cannot throw from the diagnostic error handler', async () => {
    assert.deepEqual(await persistErrorReport(async () => { throw Error('IPC unavailable'); }, Error('failure'), {}), { saved: false });
});
