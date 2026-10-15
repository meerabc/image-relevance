// minimal structured logger so failures are visible instead of swallowed
function log(level, message, error) {
    const stamp = new Date().toISOString();
    const detail = error ? (error.stack || error.message || String(error)) : '';
    console[level === 'error' ? 'error' : 'log'](`[${stamp}] ${level.toUpperCase()} ${message}${detail ? ` - ${detail}` : ''}`);
}

module.exports = {
    info: (message, error) => log('info', message, error),
    error: (message, error) => log('error', message, error)
};
