const { findMatchesForPost } = require('../services/matchingService');
const { parseThresholdQuery } = require('../utils/thresholds');
const { DEFAULT_THRESHOLDS } = require('../services/mismatchGuard');
const logger = require('../utils/logger');

// GET /posts/:id/images?similarity=&noOverlap=&confidence=
// every parameter is optional: a client that sends none gets the server's
// configured defaults, a client that sends a full valid set gets results
// scored against its own operating point (the UI's guard panel).
async function getPostImages(req, res) {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Post id must be a number' });
    }

    const parsed = parseThresholdQuery(req.query, DEFAULT_THRESHOLDS);

    if (!parsed.ok) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        const result = await findMatchesForPost(postId, parsed.thresholds);

        if (!result.success) {
            return res.status(404).json({ error: result.error });
        }

        res.json(result);
    } catch (error) {
        logger.error(`Matching failed for post ${postId}`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getPostImages
};
