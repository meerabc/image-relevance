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

module.exports = {
    getSuggestionById,
    setReviewStatus
};