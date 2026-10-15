require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { EMBEDDING_PROVIDER, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');

// snapshots the whole searchable library (metadata + vectors) into one JSON file.
// committing that file lets anyone rebuild the exact library on a fresh machine
// with `npm run corpus:seed` - no vision quota, no batch run, no model needed.
const EXPORT_PATH = path.join(__dirname, '..', 'data', 'corpus-export.json');

async function run() {
    const images = await db.query(
        `SELECT i.file_name, i.subject, i.category, i.attributes, i.caption, i.confidence, i.status,
                ie.vector::text AS vector_text
         FROM images i
         JOIN image_embeddings ie ON ie.image_id = i.id
         WHERE ie.model = $1
         ORDER BY i.id`,
        [EMBEDDING_MODEL_NAME]
    );

    // pgvector hands the vector back as "[0.1,0.2,...]" text, which is valid JSON
    const payload = {
        exportedAt: new Date().toISOString(),
        provider: EMBEDDING_PROVIDER,
        model: EMBEDDING_MODEL_NAME,
        count: images.rows.length,
        images: images.rows.map(({ vector_text, ...meta }) => ({ ...meta, vector: JSON.parse(vector_text) }))
    };

    fs.mkdirSync(path.dirname(EXPORT_PATH), { recursive: true });
    fs.writeFileSync(EXPORT_PATH, JSON.stringify(payload));
    console.log(`Exported ${payload.count} embedded images to ${path.relative(process.cwd(), EXPORT_PATH)}`);
    console.log('Commit this file so `npm run corpus:seed` can restore the library anywhere.');
    await db.pool.end();
}

run().catch((err) => {
    console.error('Corpus export failed:', err);
    process.exit(1);
});
