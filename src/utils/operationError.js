export function operationError(error) {
    if (typeof error === 'string') {
        try { const data = JSON.parse(error); return data.custom_message || data.message || error; }
        catch { return error; }
    }
    return error?.custom_message || error?.message || 'The operation could not be completed.';
}
