require('dotenv').config();
const db = require('./db');
const { findMatchesForPost } = require('./services/matchingService');
const { evalSet } = require('./evalSet');

async function getPostByTopic(topic) {
    const result = await db.query(
        `SELECT id, title FROM posts WHERE topic = $1`,
        [topic]
    );
    return result.rows[0] || null;
}

async function run() {
    console.log('Running evaluation\n');

    let correct = 0;
    let total = 0;
    const details = [];

    for (const testCase of evalSet) {
        const post = await getPostByTopic(testCase.topic);

        if (!post) {
            console.log(`No post found for topic "${testCase.topic}", skipping`);
            continue;
        }

        const result = await findMatchesForPost(post.id);
        total++;

        let isCorrect = false;

        if (testCase.expectedPrefixes === null) {
            // expecting no confident match at all for this post
            isCorrect = result.topMatch === null;
        } else if (result.topMatch) {
            // checking if the top match's file starts with any of the accepted prefixes
            isCorrect = testCase.expectedPrefixes.some(prefix => result.topMatch.file.startsWith(prefix));
        }

        if (isCorrect) correct++;

        const expectedLabel = testCase.expectedPrefixes ? testCase.expectedPrefixes.join(' or ') : 'no match';

        details.push({
            topic: testCase.topic,
            expected: expectedLabel,
            actual: result.topMatch ? result.topMatch.file : 'no match',
            correct: isCorrect
        });

        console.log(`Topic: ${testCase.topic}`);
        console.log(`Expected: ${testCase.expectedPrefixes ? testCase.expectedPrefixes.join(' or ') : 'no confident match'}`);
        console.log(`Actual: ${result.topMatch ? result.topMatch.file : 'no confident match'}`);
        console.log(`Correct: ${isCorrect}\n`);
    }

    const precision = total > 0 ? (correct / total) * 100 : 0;

    console.log('Evaluation complete');
    console.log(`Top 1 precision: ${precision.toFixed(1)}% (${correct}/${total})`);

    await db.pool.end();
}

run().catch((err) => {
    console.error('Evaluation failed:', err);
    process.exit(1);
});