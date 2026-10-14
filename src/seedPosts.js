require('dotenv').config();
const db = require('./db');
const { generateEmbedding, toVectorLiteral } = require('./services/embeddingService');
const { logCost } = require('./services/costService');

const posts = [
    {
        title: "Behavior and Habitat of Red Foxes",
        topic: "red fox",
        content: "Red foxes are highly adaptable mammals found in forests and woodlands across the northern hemisphere. They are known for their reddish fur, bushy tails, and keen senses."
    },
    {
        title: "Understanding Gray Wolf Pack Dynamics",
        topic: "gray wolf",
        content: "Gray wolves are large apex predators that live and hunt in structured packs. They communicate through howling and visual displays within remote wilderness regions."
    },
    {
        title: "Caring for Your Dog at Home",
        topic: "dog",
        content: "Dogs are loyal companion animals that require regular exercise, grooming, and a balanced diet. Training and socialization from an early age help dogs adapt well to family life."
    },
    {
        title: "Black Bears in North American Forests",
        topic: "bear",
        content: "Black bears roam dense forests across North America, foraging for berries, nuts, and small animals. They are strong swimmers and climbers, and typically avoid direct contact with humans."
    },
    {
        title: "Migration Patterns of Wild Deer",
        topic: "deer",
        content: "Deer travel in herds across grasslands and forest edges, often migrating seasonally in search of food. Their keen sense of smell and hearing help them detect predators from a distance."
    },
    {
        title: "Deep Space Exploration and Galaxies",
        topic: "astronomy",
        content: "Modern astrophysics utilizes space telescopes to photograph distant galaxies, black holes, and cosmic nebula formations light years away from earth."
    }
];

async function seed() {
    console.log('Seeding posts...\n');

    // a seed run starts from a clean posts table so reruns never duplicate
    await db.query('DELETE FROM posts');

    for (const post of posts) {
        // Inserting the post itself
        const insertResult = await db.query(
            `INSERT INTO posts (title, topic, content) VALUES ($1, $2, $3)
             RETURNING id`,
            [post.title, post.topic, post.content]
        );
        const postId = insertResult.rows[0].id;
        console.log(`Inserted post ${postId}: "${post.title}"`);

        // Generating and store its embedding
        const embeddingResult = await generateEmbedding(post.content);
        await logCost('embedding', `post:${postId}`, embeddingResult.success);

        if (!embeddingResult.success) {
            console.log(`  Embedding FAILED: ${embeddingResult.error}\n`);
            continue;
        }

        await db.query(
            `INSERT INTO post_embeddings (post_id, vector) VALUES ($1, $2::vector)`,
            [postId, toVectorLiteral(embeddingResult.vector)]
        );
        console.log(`  Embedding stored.\n`);
    }

    console.log('Done seeding posts.');
    await db.pool.end();
}

seed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});