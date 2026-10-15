// threshold cut-offs for the guard's three checks, tunable through tuneThresholds.js
const DEFAULT_THRESHOLDS = {
    similarity: 0.55,
    noOverlap: 0.65,
    confidence: 0.70
};

// similarity is computed by pgvector in SQL, so the guard is a pure decision
// function: score in, verdict out, no data access and no vector math
function evaluateMatch(similarityScore, imageMetadata, postTopic, thresholds = DEFAULT_THRESHOLDS) {
    // Guard 1: checking AI confidence score
    if (imageMetadata.confidence < thresholds.confidence) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: Low AI confidence score (${imageMetadata.confidence}).`
        };
    }

    // Guard 2: checking overall semantic similarity threshold
    if (similarityScore < thresholds.similarity) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: No confident match found. Similarity score (${similarityScore.toFixed(2)}) below threshold.`
        };
    }

    // Guard 3: dynamically checking subject compatibility
    const normalizedSubject = imageMetadata.subject.toLowerCase();
    const normalizedTopic = postTopic.toLowerCase();

    const topicTokens = normalizedTopic.split(' ').filter(word => word.length > 2);
    const subjectTokens = normalizedSubject.split(' ').filter(word => word.length > 2);

    const hasSubjectOverlap = topicTokens.some(token => normalizedSubject.includes(token)) ||
                              subjectTokens.some(token => normalizedTopic.includes(token));

    if (!hasSubjectOverlap && similarityScore < thresholds.noOverlap) {
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
    DEFAULT_THRESHOLDS,
    SIMILARITY_THRESHOLD: DEFAULT_THRESHOLDS.similarity
};
