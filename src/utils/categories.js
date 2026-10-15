// The vision model returns free-form category strings ("Animals", "wildlife",
// "Wildlife Photography"), which floods the library filters with near-duplicate
// chips. One canonical form keeps the chips clean.
function normalizeCategory(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    return raw.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
}

module.exports = { normalizeCategory };
