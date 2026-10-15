const { EMBEDDING_PROVIDER, EMBEDDING_MODEL_NAME } = require('../services/embeddingService');
const db = require('../db');
const logger = require('../utils/logger');

// liveness plus a quick look at what the service is running on,
// useful in the UI header and for any deployment check
async function getHealth(req, res) {
    try {
        await db.query('SELECT 1');

        const counts = await db.query(
            `SELECT (SELECT count(*) FROM posts) AS posts,
                    (SELECT count(*) FROM images) AS images_total,
                    (SELECT count(*) FROM images WHERE status = 'processed') AS images_processed
           `
        );

        res.json({
            status: 'ok',
            database: 'connected',
            embeddingProvider: EMBEDDING_PROVIDER,
            embeddingModel: EMBEDDING_MODEL_NAME,
            ...counts.rows[0],
            uptimeSeconds: Math.round(process.uptime())
        });
    } catch (error) {
        logger.error('Health check failed', error);
        res.status(503).json({
            status: 'degraded',
            database: 'unreachable',
            embeddingProvider: EMBEDDING_PROVIDER,
            embeddingModel: EMBEDDING_MODEL_NAME
        });
    }
}

module.exports = { getHealth };
