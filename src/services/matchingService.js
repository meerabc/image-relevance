const { generateEmbedding } = require('./embeddingService');
const { evaluateMatch } = require('./mismatchGuard');

async function findMatchesForPost(post, imageCollection) {
    // Generating embedding vector for the post content
    const postEmbeddingResult = await generateEmbedding(post.content);

    if (!postEmbeddingResult.success) {
        return {
            success: false,
            error: `Failed generating embedding for post: ${postEmbeddingResult.error}`
        };
    }

    const postVector = postEmbeddingResult.vector;
    const evaluations = [];

    // Evaluating each candidate image in the collection
    for (const imageItem of imageCollection) {
        const evaluation = evaluateMatch(
            postVector,
            imageItem.embedding,
            imageItem.data,
            post.topic
        );

        evaluations.push({
            file: imageItem.file,
            subject: imageItem.data.subject,
            category: imageItem.data.category,
            confidence: imageItem.data.confidence,
            score: evaluation.score,
            isMatch: evaluation.isMatch,
            reason: evaluation.reason
        });
    }

    // Sorting candidates by semantic similarity score in descending order
    evaluations.sort((a, b) => b.score - a.score);

    // Selecting approved candidates
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

    // Returning refusal response when no candidate clears safety criteria
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