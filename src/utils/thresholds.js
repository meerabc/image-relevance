// Parsing and validating guard thresholds that arrive as query parameters.
// Kept pure and dependency-free so the contract is testable without a database:
// any value the caller sends either produces a sane number or a clear error.
const LIMITS = { min: 0.01, max: 0.99 };

function clamp(name, value) {
    return Math.min(LIMITS.max, Math.max(LIMITS.min, value));
}

// validThresholds: a plain object with all three thresholds present
// query: an object like req.query (string or undefined values)
// returns { ok: true, thresholds } or { ok: false, error }
function parseThresholdQuery(query, defaults) {
    const thresholds = { ...defaults };
    const parsed = {};

    for (const name of ['similarity', 'noOverlap', 'confidence']) {
        const raw = query ? query[name] : undefined;

        if (raw === undefined || raw === null || String(raw).trim() === '') continue;

        const value = Number(raw);
        if (!Number.isFinite(value)) {
            return { ok: false, error: `Threshold "${name}" must be a number between ${LIMITS.min} and ${LIMITS.max}` };
        }
        if (value < LIMITS.min || value > LIMITS.max) {
            return { ok: false, error: `Threshold "${name}" must be between ${LIMITS.min} and ${LIMITS.max}, got ${value}` };
        }
        parsed[name] = value;
    }

    // any provided value overrides the default for that check only
    Object.assign(thresholds, parsed);

    // the no-overlap line only makes sense as the stricter of the two similarity
    // bars; a client sending the opposite gets a clear error instead of silent
    // reordering, so the UI can keep the pair consistent
    if (thresholds.noOverlap < thresholds.similarity) {
        return { ok: false, error: 'noOverlap must be greater than or equal to similarity' };
    }

    return { ok: true, thresholds };
}

module.exports = { parseThresholdQuery, LIMITS };
