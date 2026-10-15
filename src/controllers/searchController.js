const { z } = require('zod');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('../services/embeddingService');
const db = require('../db');
const logger = require('../utils/logger');

const searchSchema = z.object({
    q: z.string().trim().min(2).max(300),
    limit: z.coerce.number().int().min(1).max(100).default(24)
});

// semantic search over the image library: the plain-text query is embedded with
// the same local model the library was embedded with, then pgvector ranks every
// image by cosine similarity in SQL. No vision call, no keyword matching -
// ranking is purely meaning-based, and costs $0 per query.
async function searchImages(req, res) {
    const parsed = searchSchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid search',
            details: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
        });
    }

    const { q, limit } = parsed.data;
    const started = Date.now();

    try {
        const embeddingResult = await generateEmbedding(q);
        if (!embeddingResult.success) {
            return res.status(502).json({ error: `Embedding failed: ${embeddingResult.error}` });
        }
        const embeddingMs = Date.now() - started;

        const ranked = await db.query(
            `SELECT i.id, i.file_name, i.subject, i.category, i.attributes, i.caption, i.confidence, i.status,
                    1 - (ie.vector <=> $1::vector) AS score
             FROM images i
             JOIN image_embeddings ie ON ie.image_id = i.id
             WHERE ie.model = $2
             ORDER BY ie.vector <=> $1::vector
             LIMIT $3`,
            [toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME, limit]
        );

        res.json({
            query: q,
            embeddingModel: EMBEDDING_MODEL_NAME,
            embeddingMs,
            searchMs: Date.now() - started - embeddingMs,
            tookMs: Date.now() - started,
            results: ranked.rows.map(row => ({ ...row, score: Number(row.score) }))
        });
    } catch (error) {
        logger.error('Semantic search failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { searchImages };
