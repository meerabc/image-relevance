// Threshold cut-offs for the guard's checks. The values below are the code
// fallbacks; the tuned values come from tuneThresholds.js and are adopted
// through .env (SIMILARITY_THRESHOLD, NO_OVERLAP_THRESHOLD,
// CONFIDENCE_THRESHOLD), so tuning never requires a code change.
function thresholdFromEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

const DEFAULT_THRESHOLDS = {
    similarity: thresholdFromEnv('SIMILARITY_THRESHOLD', 0.55),
    noOverlap: thresholdFromEnv('NO_OVERLAP_THRESHOLD', 0.65),
    confidence: thresholdFromEnv('CONFIDENCE_THRESHOLD', 0.70)
};

// does anything in the image's tagged description relate to the post topic?
// the whole description counts, not just the subject: "empowerment" hiding in
// the attributes should rescue a raised-fist photo for a women-empowerment post
function hasTopicOverlap(imageMetadata, postTopic) {
    const topicTokens = postTopic.toLowerCase().split(' ').filter(word => word.length > 2);
    const imageText = [
        imageMetadata.subject,
        imageMetadata.category,
        imageMetadata.caption,
        Array.isArray(imageMetadata.attributes) ? imageMetadata.attributes.join(' ') : ''
    ].filter(Boolean).join(' ').toLowerCase();

    return topicTokens.some(token => imageText.includes(token));
}

// similarity is computed by pgvector in SQL, so the guard is a pure decision
// function: score in, verdict out, no data access and no vector math.
// every verdict carries a machine-readable `checks` breakdown so the UI can
// show exactly which check passed or failed and by how much.
function evaluateMatch(similarityScore, imageMetadata, postTopic, thresholds = DEFAULT_THRESHOLDS) {
    const confidence = Number(imageMetadata.confidence) || 0;
    const topicOverlap = hasTopicOverlap(imageMetadata, postTopic);
    // a mentioned topic relaxes the bar (similarity); unrelated subjects must clear a stricter one
    const similarityLine = topicOverlap ? thresholds.similarity : thresholds.noOverlap;

    const checks = [
        {
            name: 'confidence',
            label: 'Tag confidence',
            passed: confidence >= thresholds.confidence,
            detail: `${confidence.toFixed(2)} (needs ${thresholds.confidence})`
        },
        {
            name: 'similarity',
            label: 'Semantic similarity',
            passed: similarityScore >= similarityLine,
            detail: topicOverlap
                ? `${similarityScore.toFixed(2)} (needs ${thresholds.similarity})`
                : `${similarityScore.toFixed(2)} (needs ${thresholds.noOverlap}, stricter because no tag relates to the topic)`
        },
        {
            name: 'topic',
            label: 'Topic alignment',
            passed: topicOverlap,
            detail: topicOverlap
                ? `tags relate to "${postTopic}"`
                : `no tag relates to "${postTopic}"`
        }
    ];

    // check 1: the tags themselves must be trustworthy before anything else
    if (!checks[0].passed) {
        checks[0].detail = `${confidence.toFixed(2)}, below the ${thresholds.confidence} trust line; the tags may be unreliable`;
        return {
            isMatch: false,
            score: similarityScore,
            reason: `REJECTED: tag confidence ${confidence.toFixed(2)} is below the ${thresholds.confidence} trust line, so the tags on this image may be unreliable.`,
            checks
        };
    }

    // check 2: semantic distance between the post text and the image text
    // (post topic, title and content vs image subject, category, attributes and caption)
    if (!checks[1].passed) {
        return {
            isMatch: false,
            score: similarityScore,
            reason: topicOverlap
                ? `REJECTED: semantic similarity ${similarityScore.toFixed(2)} is below the ${thresholds.similarity} requirement. The image text (subject, category, attributes and caption) and the post text (topic, title and content) describe the topic in different words, so their vectors stay further apart than the requirement allows.`
                : `REJECTED: semantic similarity ${similarityScore.toFixed(2)} is below the stricter ${thresholds.noOverlap} requirement that applies because no image tag relates to "${postTopic}".`,
            checks
        };
    }

    return {
        isMatch: true,
        score: similarityScore,
        reason: topicOverlap
            ? `APPROVED: semantic similarity ${similarityScore.toFixed(2)} clears the ${thresholds.similarity} requirement and the image tags relate to "${postTopic}".`
            : `APPROVED: semantic similarity ${similarityScore.toFixed(2)} clears the stricter ${thresholds.noOverlap} requirement that applies when no image tag relates to the topic.`,
        checks
    };
}

module.exports = {
    evaluateMatch,
    hasTopicOverlap,
    DEFAULT_THRESHOLDS,
    SIMILARITY_THRESHOLD: DEFAULT_THRESHOLDS.similarity
};
