const db = require('../db');

// returning every cost log entry along with a summary count per call type
async function getCosts(req, res) {
    try {
        const entries = await db.query(
            `SELECT id, call_type, reference, success, created_at
             FROM cost_log
             ORDER BY created_at DESC`
        );

        const summary = await db.query(
            `SELECT call_type, count(*) AS total_calls, count(*) FILTER (WHERE success) AS successful_calls
             FROM cost_log
             GROUP BY call_type`
        );

        res.json({
            summary: summary.rows,
            entries: entries.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getCosts
};
