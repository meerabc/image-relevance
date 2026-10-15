require('dotenv').config();
const db = require('./db');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');
const { rankImagesForPost } = require('./services/matchingService');

// proving semantic matching: a post titled only with the scientific name
// "Vulpes vulpes" shares zero words with any image subject, yet must match
// red fox images through embedding meaning alone
async function run() {
    console.log('Inserting a temporary post using the scientific name instead of "red fox"\n');

    const content = 'Vulpes vulpes is a wild canid species widely distributed across the northern hemisphere, adapted to forests, grasslands, and urban edges, known for its keen senses and opportunistic hunting behavior.';

    const insertResult = await db.query(
        `INSERT INTO posts (title, topic, content) VALUES ($1, $2, $3) RETURNING id`,
        ['The Vulpes Vulpes Species', 'Vulpes vulpes', content]
    );
    const postId = insertResult.rows[0].id;

    const embeddingResult = await generateEmbedding(content);
    await db.query(
        `INSERT INTO post_embeddings (post_id, vector, model) VALUES ($1, $2::vector, $3)`,
        [postId, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
    );

    console.log('Querying for matches, topic "Vulpes vulpes" shares zero words with any image subject like "red fox"\n');

    const result = await rankImagesForPost(postId);

    const foxCandidate = result.evaluations.find(c => c.file === 'fox.jpg');
    const topMatch = result.evaluations.find(c => c.isMatch);
    console.log('Top match:', topMatch ? topMatch.file : 'no confident match');
    console.log('fox.jpg candidate score:', foxCandidate.score);
    console.log('fox.jpg candidate reason:', foxCandidate.reason);

    console.log('\nCleaning up, removing the temporary post');
    await db.query('DELETE FROM posts WHERE id = $1', [postId]);

    await db.pool.end();
}

run().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
