const { getSuggestionById, setReviewStatus, getReviewStats } = require('../services/reviewService');
const logger = require('../utils/logger');

// getting a suggestion and explaining why it was approved or rejected
async function inspectSuggestion(req, res) {
    const suggestionId = parseInt(req.params.id);

    if (isNaN(suggestionId)) {
        return res.status(400).json({ error: 'Suggestion id must be a number' });
    }

    try {
        const suggestion = await getSuggestionById(suggestionId);

        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }

        res.json(suggestion);
    } catch (error) {
        logger.error('Suggestion inspection failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// marking a suggestion as approved
async function approveSuggestion(req, res) {
    const suggestionId = parseInt(req.params.id);

    if (isNaN(suggestionId)) {
        return res.status(400).json({ error: 'Suggestion id must be a number' });
    }

    try {
        const updated = await setReviewStatus(suggestionId, 'approved');

        if (!updated) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }

        res.json(updated);
    } catch (error) {
        logger.error('Suggestion approval failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// marking a suggestion as rejected
async function rejectSuggestion(req, res) {
    const suggestionId = parseInt(req.params.id);

    if (isNaN(suggestionId)) {
        return res.status(400).json({ error: 'Suggestion id must be a number' });
    }

    try {
        const updated = await setReviewStatus(suggestionId, 'rejected');

        if (!updated) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }

        res.json(updated);
    } catch (error) {
        logger.error('Suggestion rejection failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// human vs guard disagreement metrics, the feedback loop made visible
async function reviewStats(req, res) {
    try {
        const stats = await getReviewStats();
        res.json(stats);
    } catch (error) {
        logger.error('Review stats failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    inspectSuggestion,
    approveSuggestion,
    rejectSuggestion,
    reviewStats
};
