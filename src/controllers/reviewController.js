const { getSuggestionById, setReviewStatus } = require('../services/reviewService');

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
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    inspectSuggestion,
    approveSuggestion,
    rejectSuggestion
};