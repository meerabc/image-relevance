const { z } = require('zod');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('../services/embeddingService');
const { logCost } = require('../services/costService');
const db = require('../db');
const logger = require('../utils/logger');

const createPostSchema = z.object({
    title: z.string().min(3).max(200),
    topic: z.string().min(2).max(100),
    content: z.string().min(20).max(5000)
});

// creating a post and embedding it in the same request, the post is
// immediately matchable — no API key and no quota involved
async function createPost(req, res) {
    const parsed = createPostSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid post',
            details: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
        });
    }

    const { title, topic, content } = parsed.data;

    try {
        const embeddingResult = await generateEmbedding(content);
        await logCost('embedding', 'post:new', embeddingResult.success);

        if (!embeddingResult.success) {
            return res.status(502).json({ error: `Embedding failed: ${embeddingResult.error}` });
        }

        const insert = await db.query(
            `INSERT INTO posts (title, topic, content) VALUES ($1, $2, $3)
             RETURNING id, title, topic, content`,
            [title, topic, content]
        );
        const post = insert.rows[0];

        await db.query(
            `INSERT INTO post_embeddings (post_id, vector, model) VALUES ($1, $2::vector, $3)`,
            [post.id, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
        );

        res.status(201).json({ ...post, has_embedding: true });
    } catch (error) {
        logger.error('Post creation failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { createPost };
