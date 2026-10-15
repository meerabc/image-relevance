require('dotenv').config();
const db = require('./db');
const { rankImagesForPost } = require('./services/matchingService');
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

    let total = 0;
    let correct = 0;
    let shouldMatch = 0;
    let matchedCorrect = 0;
    let shouldRefuse = 0;
    let falseAccepts = 0;

    for (const testCase of evalSet) {
        const post = await getPostByTopic(testCase.topic);

        if (!post) {
            console.log(`No post found for topic "${testCase.topic}", skipping`);
            continue;
        }

        const result = await rankImagesForPost(post.id);
        total++;

        const topMatch = result.evaluations.find(item => item.isMatch) || null;
        const actual = topMatch ? topMatch.file : 'no confident match';
        let isCorrect;

        if (testCase.expectedPrefixes === null) {
            // expecting a refusal, returning any match here is a false accept
            shouldRefuse++;
            isCorrect = topMatch === null;
            if (!isCorrect) falseAccepts++;
        } else {
            shouldMatch++;
            isCorrect = topMatch
                ? testCase.expectedPrefixes.some(prefix => topMatch.file.startsWith(prefix))
                : false;
            if (isCorrect) matchedCorrect++;
        }

        if (isCorrect) correct++;

        const expectedLabel = testCase.expectedPrefixes ? testCase.expectedPrefixes.join(' or ') : 'no match';
        console.log(`Topic: ${testCase.topic}`);
        console.log(`Expected: ${expectedLabel}`);
        console.log(`Actual: ${actual}`);
        console.log(`Correct: ${isCorrect}\n`);
    }

    const precision = total > 0 ? (correct / total) * 100 : 0;
    const recall = shouldMatch > 0 ? (matchedCorrect / shouldMatch) * 100 : 0;
    const falseAcceptRate = shouldRefuse > 0 ? (falseAccepts / shouldRefuse) * 100 : 0;

    console.log('Evaluation complete');
    console.log(`Top 1 precision: ${precision.toFixed(1)}% (${correct}/${total})`);
    console.log(`Recall on should-match cases: ${recall.toFixed(1)}% (${matchedCorrect}/${shouldMatch})`);
    console.log(`False accept rate on should-refuse cases: ${falseAcceptRate.toFixed(1)}% (${falseAccepts}/${shouldRefuse})`);

    await db.pool.end();
}

run().catch((err) => {
    console.error('Evaluation failed:', err);
    process.exit(1);
});
