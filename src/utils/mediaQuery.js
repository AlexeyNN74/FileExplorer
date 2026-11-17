// Safari 13's MediaQueryList predates EventTarget inheritance (Safari 14).
export function subscribeMediaQuery(query, listener) {
    if (!query) return () => {};
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', listener);
        return () => query.removeEventListener('change', listener);
    }
    if (typeof query.addListener === 'function') {
        query.addListener(listener);
        return () => query.removeListener(listener);
    }
    return () => {};
}
