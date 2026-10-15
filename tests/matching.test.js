const db = require('../src/db');
const { findMatchesForPost } = require('../src/services/matchingService');

// closing the database connection pool after all tests finish
// so Jest actually exits instead of hanging on an open connection
afterAll(async () => {
    await db.pool.end();
});

async function getPostIdByTopic(topic) {
    const result = await db.query('SELECT id FROM posts WHERE topic = $1', [topic]);
    return result.rows[0].id;
}

// these tests exercise the real corpus, so they only run when images have
// actually been processed (CI runs without a vision API key skip them)
let hasCorpus = false;

beforeAll(async () => {
    const result = await db.query(`SELECT count(*)::int AS total FROM images WHERE status = 'processed'`);
    hasCorpus = result.rows[0].total > 5;
    if (!hasCorpus) {
        console.warn('Processed corpus not found, matching accuracy tests are skipped (run node src/runBatch.js locally)');
    }
});

describe('findMatchesForPost, real corpus matching accuracy', () => {
    test('the red fox post top matches a red fox image', async () => {
        if (!hasCorpus) return;
        const postId = await getPostIdByTopic('red fox');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).not.toBeNull();
        expect(result.topMatch.file).toMatch(/fox/);
    });

    test('the gray wolf post top matches a gray wolf image', async () => {
        if (!hasCorpus) return;
        const postId = await getPostIdByTopic('gray wolf');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).not.toBeNull();
        expect(result.topMatch.file).toMatch(/gray-wolf/);
    });

    test('the astronomy post gets no confident match, since nothing in the corpus is space related', async () => {
        if (!hasCorpus) return;
        const postId = await getPostIdByTopic('astronomy');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).toBeNull();
        expect(result.status).toBe('NO_CONFIDENT_MATCH');
    });

    test('forcing a wolf candidate against the red fox post gets rejected', async () => {
        if (!hasCorpus) return;
        const postId = await getPostIdByTopic('red fox');
        const result = await findMatchesForPost(postId);

        const wolfCandidate = result.allCandidates.find(c => c.file.startsWith('gray-wolf'));

        expect(wolfCandidate).toBeDefined();
        expect(wolfCandidate.isMatch).toBe(false);
    });
});
