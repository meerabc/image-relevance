const db = require('../db');

// Records one row per AI call; vision or embedding, so cost is
// attributed and queryable, not just a running counter.
async function logCost(callType, reference, success) {
    await db.query(
        `INSERT INTO cost_log (call_type, reference, success) VALUES ($1, $2, $3)`,
        [callType, reference, success]
    );
}

module.exports = { logCost };