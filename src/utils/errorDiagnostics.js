// Keep reports small and avoid invoking user-defined toString/getters on thrown objects.
function text(value) {
    return typeof value === 'string' ? value.slice(0, 4096) : '';
}

export function captureErrorReport(error, errorInfo) {
    try {
        return {
            message: text(error?.message) || text(error) || 'Unknown application error',
            stack: text(error?.stack),
            componentStack: text(errorInfo?.componentStack),
        };
    } catch {
        return { message: 'Unable to read application error', stack: '', componentStack: '' };
    }
}

export async function persistErrorReport(invoke, error, errorInfo) {
    try {
        const path = await invoke('report_frontend_error', { report: captureErrorReport(error, errorInfo) });
        return path ? { saved: true, path } : null;
    } catch {
        // The error boundary must remain usable even when IPC/storage is broken.
        return { saved: false };
    }
}
