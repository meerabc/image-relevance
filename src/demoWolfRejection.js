require('dotenv').config();

// demonstrating the mismatch guard's core rejection scenario
// forces a comparison between the red fox post and a gray wolf image
// run this after the server is started and the corpus has been processed
const db = require('./db');

async function run() {
    // look the post up by topic instead of assuming a fixed id,
    // ids shift whenever posts are reseeded
    const postResult = await db.query(`SELECT id FROM posts WHERE topic = 'red fox' LIMIT 1`);
    const postId = postResult.rows[0].id;

    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/posts/${postId}/images`);
    const data = await response.json();

    console.log('Post:', data.postTitle);
    console.log('Topic:', data.postTopic);
    console.log('');
    console.log('Top match:', data.topMatch.file);
    console.log('Reason:', data.topMatch.reason);
    console.log('');

    const wolfCandidate = data.allCandidates.find(c => c.file.startsWith('gray-wolf'));
    console.log('Wolf candidate forced into evaluation:', wolfCandidate.file);
    console.log('Subject detected:', wolfCandidate.subject);
    console.log('Result:', wolfCandidate.isMatch ? 'APPROVED' : 'REJECTED');
    console.log('Reason:', wolfCandidate.reason);

    await db.pool.end();
}

run().catch((err) => {
    console.error('Demo failed:', err);
    process.exit(1);
});
