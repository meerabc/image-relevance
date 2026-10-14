const { evaluateMatch } = require('./mismatchGuard');
const db = require('../db');

// fetching a post along with its stored embedding
// pgvector returns the vector column as a string like "[0.1,0.2,...]"
async function getPostWithEmbedding(postId) {
    const result = await db.query(
        `SELECT p.id, p.title, p.topic, p.content, pe.vector
         FROM posts p
         JOIN post_embeddings pe ON pe.post_id = p.id
         WHERE p.id = $1`,
        [postId]
    );
    return result.rows[0] || null;
}

// ranking every image with an embedding against the post vector in SQL
// pgvector's <=> operator is cosine distance, so similarity = 1 - distance
// images that failed processing never got an embedding, so they are excluded naturally here
async function rankImagesBySimilarity(postVector) {
    const result = await db.query(
        `SELECT i.id, i.file_name, i.subject, i.category, i.attributes, i.caption, i.confidence, i.status,
                1 - (ie.vector <=> $1::vector) AS score
         FROM images i
         JOIN image_embeddings ie ON ie.image_id = i.id
         ORDER BY ie.vector <=> $1::vector`,
        [postVector]
    );
    return result.rows;
}

// saving or updating the evaluation for a post and image pair
// review_status is left untouched on conflict so a human decision is not overwritten by a rerun
async function saveSuggestion(postId, imageId, score, isMatch, reason) {
    const result = await db.query(
        `INSERT INTO suggestions (post_id, image_id, score, is_match, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (post_id, image_id) DO UPDATE SET
            score = EXCLUDED.score,
            is_match = EXCLUDED.is_match,
            reason = EXCLUDED.reason
         RETURNING id, review_status`,
        [postId, imageId, score, isMatch, reason]
    );
    return result.rows[0];
}

async function findMatchesForPost(postId) {
    const post = await getPostWithEmbedding(postId);

    if (!post) {
        return {
            success: false,
            error: 'Post not found or missing an embedding'
        };
    }

    const rankedImages = await rankImagesBySimilarity(post.vector);
    const evaluations = [];

    // evaluating every candidate image through the mismatch guard
    for (const image of rankedImages) {
        const evaluation = evaluateMatch(Number(image.score), image, post.topic);

        const saved = await saveSuggestion(
            post.id,
            image.id,
            evaluation.score,
            evaluation.isMatch,
            evaluation.reason
        );

        evaluations.push({
            suggestionId: saved.id,
            reviewStatus: saved.review_status,
            file: image.file_name,
            subject: image.subject,
            category: image.category,
            confidence: image.confidence,
            score: evaluation.score,
            isMatch: evaluation.isMatch,
            reason: evaluation.reason
        });
    }

    // rows already come back ranked, keeping the sort as a safety net
    evaluations.sort((a, b) => b.score - a.score);

    const approvedMatches = evaluations.filter(item => item.isMatch);

    if (approvedMatches.length > 0) {
        return {
            success: true,
            postTitle: post.title,
            postTopic: post.topic,
            topMatch: approvedMatches[0],
            allCandidates: evaluations
        };
    }

    // returning a refusal response when nothing clears the guard
    return {
        success: true,
        postTitle: post.title,
        postTopic: post.topic,
        topMatch: null,
        status: 'NO_CONFIDENT_MATCH',
        reason: evaluations.length > 0
            ? evaluations[0].reason
            : 'No image candidates were available for matching.',
        allCandidates: evaluations
    };
}

module.exports = {
    findMatchesForPost
};