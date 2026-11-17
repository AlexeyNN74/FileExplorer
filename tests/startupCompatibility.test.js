import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { subscribeMediaQuery } from '../src/utils/mediaQuery.js';

test('Safari 13 media query supports subscription, change and cleanup', () => {
    let listener;
    const query = { addListener(fn) { listener = fn; }, removeListener(fn) { assert.equal(fn, listener); listener = null; } };
    assert.throws(() => query.addEventListener('change', () => {}), TypeError); // Old startup call on Safari 13.
    let value;
    const cleanup = subscribeMediaQuery(query, event => { value = event.matches; });
    listener({ matches: true }); assert.equal(value, true);
    cleanup(); assert.equal(listener, null);
});
test('modern media query uses change event; absent APIs remain safe', () => {
    let active;
    const fn = () => {};
    const cleanup = subscribeMediaQuery({ addEventListener(type, cb) { assert.equal(type, 'change'); active = cb; }, removeEventListener(type, cb) { assert.equal(type, 'change'); assert.equal(cb, active); active = null; } }, fn);
    assert.equal(active, fn); cleanup(); assert.equal(active, null);
    subscribeMediaQuery(null, fn)(); subscribeMediaQuery({}, fn)();
});
function boot() {
    const handlers = {};
    const make = () => ({ childNodes: [], appendChild(child) { this.childNodes.push(child); } });
    const root = make();
    const window = { addEventListener(type, handler) { handlers[type] = handler; } };
    const document = { getElementById() { return root; }, createElement: make, addEventListener(type, handler) { handlers[type] = handler; } };
    vm.runInNewContext(readFileSync('public/startup-diagnostics.js', 'utf8'), { window, document, navigator: { userAgent: 'Safari 13 fixture' }, location: { href: 'tauri://localhost/' } });
    return { window, root, handlers };
}
test('module load failure gives a generic screen with explicit local details, without IPC', () => {
    const { window, root, handlers } = boot();
    handlers.error({ target: { tagName: 'SCRIPT', src: 'tauri://localhost/assets/missing.js' } });
    assert.equal(root.childNodes[3].hidden, true);
    root.childNodes[2].onclick();
    assert.equal(root.childNodes[3].hidden, false);
    assert.match(root.childNodes[3].textContent, /missing.js/);
    assert.match(window.__EXPLR_STARTUP__.snapshot().userAgent, /Safari 13/);
});
test('JS/promise/CSP failures are bounded and never replace an existing React screen', () => {
    const { window, root, handlers } = boot();
    root.childNodes.push({ textContent: 'existing UI' });
    handlers.error({ target: window, message: 'TypeError', error: { stack: 'at startup' } });
    handlers.unhandledrejection({ reason: new Error('rejected') });
    for (let i = 0; i < 12; i++) handlers.securitypolicyviolation({ violatedDirective: 'style-src', blockedURI: 'https://fonts.googleapis.com' });
    assert.equal(root.childNodes.length, 1);
    assert.equal(window.__EXPLR_STARTUP__.snapshot().events.length, 8);
    assert.equal(window.__EXPLR_STARTUP__.snapshot().firstFailure.message, 'TypeError');
});
