const { evaluateMatch } = require('./mismatchGuard');
const db = require('../db');

// fetching a post along with its stored embedding
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

// fetching every image that has a stored embedding
// images that failed processing never got an embedding, so they are excluded naturally here
async function getImagesWithEmbeddings() {
    const result = await db.query(
        `SELECT i.id, i.file_name, i.subject, i.category, i.attributes, i.caption, i.confidence, i.status, ie.vector
         FROM images i
         JOIN image_embeddings ie ON ie.image_id = i.id`
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

    const images = await getImagesWithEmbeddings();
    const evaluations = [];

    // evaluating every candidate image against the post through the mismatch guard
    for (const image of images) {
        const evaluation = evaluateMatch(
            post.vector,
            image.vector,
            { subject: image.subject, confidence: image.confidence },
            post.topic
        );

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

    // sorting candidates by semantic similarity score, highest first
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