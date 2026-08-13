require('dotenv').config();
const path = require('path');
const { processBatch } = require('./services/batchService');
const { generateEmbedding } = require('./services/embeddingService');
const { findMatchesForPost } = require('./services/matchingService');

async function run() {
    const imageDir = path.join(__dirname, '../data/images');

    console.log('PROCESSING IMAGE LIBRARY AND GENERATING EMBEDDINGS\n');
    const batchResults = await processBatch(imageDir);

    // Generating vector embeddings for processed image captions
    const imageCollection = [];
    for (const item of batchResults) {
        const embeddingResult = await generateEmbedding(item.data.caption);
        if (embeddingResult.success) {
            imageCollection.push({
                file: item.file,
                data: item.data,
                embedding: embeddingResult.vector
            });
        } else {
            // Logging if an image caption fails to embed
            console.log(`Embedding generation failed for ${item.file}: ${embeddingResult.error}`);
        }
    }

    // Defining test blog posts to evaluate match and refusal scenarios
    const testPosts = [
        {
            id: 1,
            title: "Behavior and Habitat of Red Foxes",
            topic: "red fox",
            content: "Red foxes are highly adaptable mammals found in forests and woodlands across the northern hemisphere. They are known for their reddish fur, bushy tails, and keen senses."
        },
        {
            id: 2,
            title: "Understanding Gray Wolf Pack Dynamics",
            topic: "gray wolf",
            content: "Gray wolves are large apex predators that live and hunt in structured packs. They communicate through howling and visual displays within remote wilderness regions."
        },
        {
            id: 3,
            title: "Deep Space Exploration and Galaxies",
            topic: "astronomy",
            content: "Modern astrophysics utilizes space telescopes to photograph distant galaxies, black holes, and cosmic nebula formations light years away from earth."
        }
    ];

    console.log('\nRUNNING MATCHING ENGINE EVALUATIONS\n');

    for (const post of testPosts) {
        console.log(`EVALUATING POST: "${post.title}" (Topic: ${post.topic})`);
        const result = await findMatchesForPost(post, imageCollection);

        // Catching and displaying the specific API error if the embedding fails
        if (!result.success) {
            console.log(`ERROR: ${result.error}\n`);
        } else if (result.topMatch) {
            console.log(`STATUS: APPROVED MATCH FOUND`);
            console.log(`SELECTED IMAGE: ${result.topMatch.file}`);
            console.log(`SIMILARITY SCORE: ${result.topMatch.score.toFixed(2)}`);
            console.log(`REASON: ${result.topMatch.reason}\n`);
        } else {
            console.log(`STATUS: ${result.status}`);
            console.log(`REASON: ${result.reason}\n`);
        }
    }
}

run();