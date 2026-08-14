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

describe('findMatchesForPost, real corpus matching accuracy', () => {
    test('the red fox post top matches a red fox image', async () => {
        const postId = await getPostIdByTopic('red fox');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).not.toBeNull();
        expect(result.topMatch.file).toMatch(/fox/);
    });

    test('the gray wolf post top matches a gray wolf image', async () => {
        const postId = await getPostIdByTopic('gray wolf');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).not.toBeNull();
        expect(result.topMatch.file).toMatch(/gray-wolf/);
    });

    test('the astronomy post gets no confident match, since nothing in the corpus is space related', async () => {
        const postId = await getPostIdByTopic('astronomy');
        const result = await findMatchesForPost(postId);

        expect(result.topMatch).toBeNull();
        expect(result.status).toBe('NO_CONFIDENT_MATCH');
    });

    test('forcing a wolf candidate against the red fox post gets rejected', async () => {
        const postId = await getPostIdByTopic('red fox');
        const result = await findMatchesForPost(postId);

        const wolfCandidate = result.allCandidates.find(c => c.file.startsWith('gray-wolf'));

        expect(wolfCandidate).toBeDefined();
        expect(wolfCandidate.isMatch).toBe(false);
    });
});