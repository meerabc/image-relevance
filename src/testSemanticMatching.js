require('dotenv').config();
const db = require('./db');
const { generateEmbedding } = require('./services/embeddingService');
const { findMatchesForPost } = require('./services/matchingService');

async function run() {
    console.log('Inserting a temporary post using the scientific name instead of "red fox"\n');

    const insertResult = await db.query(
        `INSERT INTO posts (title, topic, content) VALUES ($1, $2, $3) RETURNING id`,
        [
            'The Vulpes Vulpes Species',
            'Vulpes vulpes',
            'Vulpes vulpes is a wild canid species widely distributed across the northern hemisphere, adapted to forests, grasslands, and urban edges, known for its keen senses and opportunistic hunting behavior.'
        ]
    );
    const postId = insertResult.rows[0].id;

    const embeddingResult = await generateEmbedding('Vulpes vulpes is a wild canid species widely distributed across the northern hemisphere, adapted to forests, grasslands, and urban edges, known for its keen senses and opportunistic hunting behavior.');
    await db.query(
        `INSERT INTO post_embeddings (post_id, vector) VALUES ($1, $2)`,
        [postId, embeddingResult.vector]
    );

    console.log('Querying for matches, topic "Vulpes vulpes" shares zero words with any image subject like "red fox"\n');

    const result = await findMatchesForPost(postId);

    const foxCandidate = result.allCandidates.find(c => c.file === 'fox.jpg');
    console.log('Top match:', result.topMatch ? result.topMatch.file : 'no confident match');
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