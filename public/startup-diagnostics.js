/* Classic ES5 script: must run before the module graph, with no React or IPC dependency. */
(function () {
    'use strict';
    var records = [];
    var firstFailure = null;
    function text(value) { return typeof value === 'string' ? value.slice(0, 4096) : ''; }
    function snapshot() {
        return { userAgent: navigator.userAgent, url: location.href, firstFailure: firstFailure, events: records.slice() };
    }
    function record(kind, message, stack) {
        var entry = { kind: kind, message: text(message), stack: text(stack) };
        if (!firstFailure && (kind === 'javascript' || kind === 'promise' || kind === 'script')) firstFailure = entry;
        records.push(entry);
        if (records.length > 8) records.shift();
    }
    function showFailure() {
        var root = document.getElementById('root');
        // React's own error boundary owns any already rendered interface.
        if (!root || root.childNodes.length) return;
        var title = document.createElement('h1');
        title.textContent = 'Fast File Explorer';
        var message = document.createElement('p');
        message.textContent = 'The interface could not be loaded. Please restart the application.';
        var button = document.createElement('button');
        button.textContent = 'Show diagnostic details';
        var details = document.createElement('pre');
        details.hidden = true;
        button.onclick = function () {
            details.textContent = JSON.stringify(snapshot(), null, 2);
            details.hidden = !details.hidden;
        };
        root.appendChild(title); root.appendChild(message); root.appendChild(button); root.appendChild(details);
    }
    window.__EXPLR_STARTUP__ = { snapshot: snapshot };
    window.addEventListener('error', function (event) {
        var target = event.target;
        if (target && target !== window) {
            record(target.tagName === 'SCRIPT' ? 'script' : 'resource', target.src || target.href || target.tagName, '');
            if (target.tagName === 'SCRIPT') showFailure();
        } else {
            record('javascript', event.message, event.error && event.error.stack);
            showFailure();
        }
    }, true);
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        try { record('promise', typeof reason === 'string' ? reason : reason && reason.message, reason && reason.stack); }
        catch (_) { record('promise', 'Unable to read rejection', ''); }
        showFailure();
    });
    document.addEventListener('securitypolicyviolation', function (event) {
        record('csp', event.violatedDirective + ': ' + event.blockedURI, '');
    });
}());
