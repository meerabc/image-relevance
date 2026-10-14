// threshold cut-offs for the guard's three checks
const SIMILARITY_THRESHOLD = 0.55;
const CONFIDENCE_THRESHOLD = 0.70;
// similarity is computed by pgvector in SQL, so the guard only decides
const NO_OVERLAP_SIMILARITY = 0.65;

function evaluateMatch(similarityScore, imageMetadata, postTopic) {
    // Guard 1: checking AI confidence score
    if (imageMetadata.confidence < CONFIDENCE_THRESHOLD) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: Low AI confidence score (${imageMetadata.confidence}).`
        };
    }

    // Guard 2: checking overall semantic similarity threshold
    if (similarityScore < SIMILARITY_THRESHOLD) {
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

    if (!hasSubjectOverlap && similarityScore < NO_OVERLAP_SIMILARITY) {
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