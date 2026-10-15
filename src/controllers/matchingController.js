const { findMatchesForPost } = require('../services/matchingService');
const logger = require('../utils/logger');

async function getPostImages(req, res) {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Post id must be a number' });
    }

    try {
        const result = await findMatchesForPost(postId);

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
