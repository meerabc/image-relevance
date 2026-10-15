const { evaluateMatch, DEFAULT_THRESHOLDS } = require('./mismatchGuard');
const { EMBEDDING_MODEL_NAME } = require('./embeddingService');
const { maybeRepairMissingEmbeddings } = require('./embeddingRepair');
const db = require('../db');

// fetching a post along with its stored embedding
// pgvector returns the vector column as a string like "[0.1,0.2,...]"
// the model filter guarantees vectors from different embedding models are never compared
async function getPostWithEmbedding(postId) {
    const result = await db.query(
        `SELECT p.id, p.title, p.topic, p.content, pe.vector
         FROM posts p
         JOIN post_embeddings pe ON pe.post_id = p.id
         WHERE p.id = $1 AND pe.model = $2`,
        [postId, EMBEDDING_MODEL_NAME]
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
         WHERE ie.model = $2
         ORDER BY ie.vector <=> $1::vector`,
        [postVector, EMBEDDING_MODEL_NAME]
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

// images that have vision tags but no embedding for the active model are
// excluded by the join above, so they are counted separately and reported:
// a silent gap between library size and scored candidates is exactly the kind
// of staleness this service exists to prevent. Each hit schedules a repair.
async function countUnscoredImages() {
    const result = await db.query(
        `SELECT count(*)::int AS unscored
         FROM images i
         LEFT JOIN image_embeddings ie ON ie.image_id = i.id AND ie.model = $1
         WHERE i.caption IS NOT NULL AND ie.image_id IS NULL`,
        [EMBEDDING_MODEL_NAME]
    );
    return result.rows[0].unscored;
}

// shared core: rank, evaluate through the guard, optionally persist
// the persist flag keeps measurement scripts (eval, threshold sweep) from
// writing anything, only the live API path saves suggestions.
// thresholds: optional override object { similarity, noOverlap, confidence };
// when omitted the guard's configured defaults are used.
async function evaluateCandidates(postId, { persist, thresholds } = {}) {
    const post = await getPostWithEmbedding(postId);

    if (!post) {
        return {
            success: false,
            error: 'Post not found or its embedding is missing for the current embedding model'
        };
    }

    const rankedImages = await rankImagesBySimilarity(post.vector);
    const evaluations = [];

    for (const image of rankedImages) {
        const evaluation = evaluateMatch(Number(image.score), image, post.topic, thresholds || DEFAULT_THRESHOLDS);
        let suggestionId = null;
        let reviewStatus = null;

        if (persist) {
            const saved = await saveSuggestion(post.id, image.id, evaluation.score, evaluation.isMatch, evaluation.reason);
            suggestionId = saved.id;
            reviewStatus = saved.review_status;
        }

        evaluations.push({
            suggestionId,
            reviewStatus,
            file: image.file_name,
            subject: image.subject,
            category: image.category,
            confidence: image.confidence,
            score: evaluation.score,
            isMatch: evaluation.isMatch,
            reason: evaluation.reason,
            checks: evaluation.checks
        });
    }

    // rows already come back ranked, keeping the sort as a safety net
    evaluations.sort((a, b) => b.score - a.score);

    const unscored = await countUnscoredImages();
    if (unscored > 0) {
        // fire and forget: repairs run outside the request, the response
        // already tells the UI how many images are waiting to be embedded
        maybeRepairMissingEmbeddings();
    }

    return { success: true, post, evaluations, unscored };
}

async function findMatchesForPost(postId, thresholds) {
    const result = await evaluateCandidates(postId, { persist: true, thresholds });

    if (!result.success) {
        return result;
    }

    const { post, evaluations, unscored } = result;
    const approvedMatches = evaluations.filter(item => item.isMatch);

    if (approvedMatches.length > 0) {
        return {
            success: true,
            postTitle: post.title,
            postTopic: post.topic,
            postContent: post.content,
            topMatch: approvedMatches[0],
            allCandidates: evaluations,
            unscored
        };
    }

    // returning a refusal response when nothing clears the guard
    return {
        success: true,
        postTitle: post.title,
        postTopic: post.topic,
        postContent: post.content,
        topMatch: null,
        status: 'NO_CONFIDENT_MATCH',
        reason: evaluations.length > 0
            ? evaluations[0].reason
            : 'No image candidates were available for matching.',
        allCandidates: evaluations,
        unscored
    };
}

// measurement path, identical logic but nothing is written to the database
async function rankImagesForPost(postId) {
    return evaluateCandidates(postId, { persist: false });
}

module.exports = {
    findMatchesForPost,
    rankImagesForPost
};
