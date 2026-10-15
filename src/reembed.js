require('dotenv').config();
const db = require('./db');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');

// re-embeds every stored caption and post with the current embedding provider.
// needed whenever the embedding model changes, vectors from different models
// are never compared and the matching queries filter on the model column.
// vision results (tags, captions) are kept, only embeddings are recomputed,
// so this never spends vision quota.
async function reembedPosts() {
    const posts = await db.query(`SELECT p.id, p.content FROM posts p LEFT JOIN post_embeddings pe ON pe.post_id = p.id`);

    for (const post of posts.rows) {
        const embeddingResult = await generateEmbedding(post.content);
        if (!embeddingResult.success) {
            console.log(`Post ${post.id} embedding failed: ${embeddingResult.error}`);
            continue;
        }
        await db.query(
            `INSERT INTO post_embeddings (post_id, vector, model) VALUES ($1, $2::vector, $3)
             ON CONFLICT (post_id) DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
            [post.id, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
        );
        console.log(`Post ${post.id} re-embedded`);
    }
}

async function reembedImages() {
    const images = await db.query(
        `SELECT i.id, i.caption FROM images i LEFT JOIN image_embeddings ie ON ie.image_id = i.id
         WHERE i.caption IS NOT NULL`
    );

    for (const image of images.rows) {
        const embeddingResult = await generateEmbedding(image.caption);
        if (!embeddingResult.success) {
            console.log(`Image ${image.id} embedding failed: ${embeddingResult.error}`);
            continue;
        }
        await db.query(
            `INSERT INTO image_embeddings (image_id, vector, model) VALUES ($1, $2::vector, $3)
             ON CONFLICT (image_id) DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
            [image.id, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
        );
        console.log(`Image ${image.id} re-embedded`);
    }
}

async function run() {
    console.log(`Re-embedding everything with model: ${EMBEDDING_MODEL_NAME}\n`);
    await reembedPosts();
    await reembedImages();
    console.log('\nRe-embedding complete.');
    await db.pool.end();
}

run().catch((err) => {
    console.error('Re-embedding failed:', err);
    process.exit(1);
});
