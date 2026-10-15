require('dotenv').config();
const db = require('./db');
const { generateEmbedding, buildPostEmbeddingText, buildImageEmbeddingText, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');

// re-embeds every stored post and image with the current embedding provider
// AND the current embedding-text strategy. needed whenever the model changes
// or the text builders change, vectors from different setups are never mixed.
// vision results (tags, captions) are kept, only embeddings are recomputed,
// so this never spends vision quota.
async function reembedPosts() {
    const posts = await db.query(`SELECT p.id, p.title, p.topic, p.content FROM posts p`);

    for (const post of posts.rows) {
        const embeddingResult = await generateEmbedding(buildPostEmbeddingText(post));
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
        `SELECT i.id, i.subject, i.category, i.attributes, i.caption FROM images i
         WHERE i.caption IS NOT NULL`
    );

    for (const image of images.rows) {
        const embeddingResult = await generateEmbedding(buildImageEmbeddingText(image));
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
