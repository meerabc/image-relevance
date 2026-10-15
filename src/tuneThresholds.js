require('dotenv').config();
const db = require('./db');
const { evaluateMatch, DEFAULT_THRESHOLDS } = require('./services/mismatchGuard');
const { rankImagesForPost } = require('./services/matchingService');
const { evalSet } = require('./evalSet');

// sweeping the guard thresholds over the labeled eval set.
// ranks each post once, then re-judges the same scores under every
// threshold combination, so the sweep itself is pure computation.
// this replaces hand tuning with a measured operating point.
const SIMILARITY_VALUES = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
const NO_OVERLAP_VALUES = [0.55, 0.60, 0.65, 0.70, 0.75];

async function getPostByTopic(topic) {
    const result = await db.query(`SELECT id FROM posts WHERE topic = $1`, [topic]);
    return result.rows[0] || null;
}

async function run() {
    console.log('Ranking every eval post once, then judging under each threshold pair\n');

    // cache the rankings, the sweep only re-judges scores
    const ranked = [];
    for (const testCase of evalSet) {
        const post = await getPostByTopic(testCase.topic);
        if (!post) {
            console.log(`No post found for topic "${testCase.topic}", skipping`);
            continue;
        }
        const result = await rankImagesForPost(post.id);
        ranked.push({ testCase, evaluations: result.evaluations });
    }

    const results = [];

    for (const similarity of SIMILARITY_VALUES) {
        for (const noOverlap of NO_OVERLAP_VALUES) {
            let correct = 0;
            const failures = [];

            for (const { testCase, evaluations } of ranked) {
                const thresholds = { ...DEFAULT_THRESHOLDS, similarity, noOverlap };
                const topMatch = evaluations.map(item =>
                    evaluateMatch(item.score, item, testCase.topic, thresholds)
                ).find(verdict => verdict.isMatch) || null;

                let isCorrect;
                if (testCase.expectedPrefixes === null) {
                    isCorrect = topMatch === null;
                } else if (topMatch) {
                    isCorrect = testCase.expectedPrefixes.some(prefix => topMatch.file.startsWith(prefix));
                } else {
                    isCorrect = false;
                }

                if (isCorrect) correct++;
                else failures.push(testCase.topic);
            }

            results.push({ similarity, noOverlap, correct, failures });
        }
    }

    console.log('similarity | no-overlap | precision | failing topics');
    console.log('-----------+------------+-----------+----------------');
    for (const r of results) {
        const line = `   ${r.similarity.toFixed(2)}    |   ${r.noOverlap.toFixed(2)}    |   ${r.correct}/${ranked.length}     | ${r.failures.join(', ') || '—'}`;
        console.log(line);
    }

    const best = [...results].sort((a, b) => b.correct - a.correct)[0];
    console.log(`\nBest operating point: similarity ${best.similarity}, no-overlap ${best.noOverlap} (${best.correct}/${ranked.length})`);
    console.log('Update DEFAULT_THRESHOLDS in src/services/mismatchGuard.js to adopt it.');

    await db.pool.end();
}

run().catch((err) => {
    console.error('Threshold sweep failed:', err);
    process.exit(1);
});
