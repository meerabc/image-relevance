const db = require('../db');

// fetching one suggestion along with the post and image details, useful for the inspect why endpoint
async function getSuggestionById(suggestionId) {
    const result = await db.query(
        `SELECT s.id, s.score, s.is_match, s.reason, s.review_status, s.reviewed_at,
                p.id AS post_id, p.title AS post_title, p.topic AS post_topic,
                i.id AS image_id, i.file_name, i.subject, i.category, i.confidence
         FROM suggestions s
         JOIN posts p ON p.id = s.post_id
         JOIN images i ON i.id = s.image_id
         WHERE s.id = $1`,
        [suggestionId]
    );
    return result.rows[0] || null;
}

// updating review status on a suggestion, used for both approve and reject
async function setReviewStatus(suggestionId, status) {
    const result = await db.query(
        `UPDATE suggestions
         SET review_status = $1, reviewed_at = now()
         WHERE id = $2
         RETURNING id, review_status, reviewed_at`,
        [status, suggestionId]
    );
    return result.rows[0] || null;
}

// where human decisions disagree with the guard's automatic verdict,
// these are exactly the cases worth investigating
async function getReviewStats() {
    const summary = await db.query(
        `SELECT count(*) FILTER (WHERE review_status = 'approved') AS total_approved,
                count(*) FILTER (WHERE review_status = 'rejected') AS total_rejected,
                count(*) FILTER (WHERE review_status = 'approved' AND is_match = false) AS approved_against_guard,
                count(*) FILTER (WHERE review_status = 'rejected' AND is_match = true) AS rejected_against_guard
         FROM suggestions`
    );

    const disagreements = await db.query(
        `SELECT s.id, s.score, s.is_match, s.reason, s.review_status, s.reviewed_at,
                p.title AS post_title, i.file_name, i.subject
         FROM suggestions s
         JOIN posts p ON p.id = s.post_id
         JOIN images i ON i.id = s.image_id
         WHERE (s.review_status = 'approved' AND s.is_match = false)
            OR (s.review_status = 'rejected' AND s.is_match = true)
         ORDER BY s.reviewed_at DESC NULLS LAST
         LIMIT 50`
    );

    return {
        summary: summary.rows[0],
        disagreements: disagreements.rows
    };
}

module.exports = {
    getSuggestionById,
    setReviewStatus,
    getReviewStats
};
