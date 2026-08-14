const { cosineSimilarity } = require('../utils/vectorUtils');

// Setting threshold cut-offs
const SIMILARITY_THRESHOLD = 0.55;
const CONFIDENCE_THRESHOLD = 0.70;

function evaluateMatch(postVector, imageVector, imageMetadata, postTopic) {
    // Calculating semantic similarity
    const similarityScore = cosineSimilarity(postVector, imageVector);

    // Guard 1: Checking AI confidence score
    if (imageMetadata.confidence < CONFIDENCE_THRESHOLD) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: Low AI confidence score (${imageMetadata.confidence}).`
        };
    }

    // Guard 2: Checking overall semantic similarity threshold
    if (similarityScore < SIMILARITY_THRESHOLD) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: No confident match found. Similarity score (${similarityScore.toFixed(2)}) below threshold.`
        };
    }

    // Guard 3: Dynamically checking subject compatibility
    const normalizedSubject = imageMetadata.subject.toLowerCase();
    const normalizedTopic = postTopic.toLowerCase();

    // Splitting topic and subject into key words for generic evaluation
    const topicTokens = normalizedTopic.split(' ').filter(word => word.length > 2);
    const subjectTokens = normalizedSubject.split(' ').filter(word => word.length > 2);

    // Checking for token alignment between post topic and detected image subject
    const hasSubjectOverlap = topicTokens.some(token => normalizedSubject.includes(token)) ||
                              subjectTokens.some(token => normalizedTopic.includes(token));

    // Rejecting when subjects diverge despite falling near the similarity threshold
    if (!hasSubjectOverlap && similarityScore < 0.65) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: Subject mismatch: expected concept related to "${postTopic}", detected "${imageMetadata.subject}".`
        };
    }

    return {
        isMatch: true,
        score: similarityScore,
        reason: 'APPROVED: Image satisfies semantic similarity and subject verification criteria.'
    };
}

module.exports = {
    evaluateMatch,
    SIMILARITY_THRESHOLD
};