require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { upsertImage } = require('./services/imageIntake');
const { toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');

// rebuilds the library from a corpus export (data/corpus-export.json).
// vectors are inserted as-is, so this needs no embedding model, no vision key
// and no quota - a fresh clone becomes fully searchable in seconds.
const EXPORT_PATH = path.join(__dirname, '..', 'data', 'corpus-export.json');
const IMAGE_DIR = path.join(__dirname, '..', 'data', 'images');

async function run() {
    if (!fs.existsSync(EXPORT_PATH)) {
        console.error(`No export found at ${EXPORT_PATH}`);
        console.error('Run "npm run corpus:export" on the machine with the processed library, commit the file, then seed here.');
        process.exit(1);
    }

    const corpus = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
    console.log(`Seeding ${corpus.count} images (export model: ${corpus.model}) - zero AI calls\n`);

    if (corpus.model !== EMBEDDING_MODEL_NAME) {
        console.warn(`WARNING: active embedding model is ${EMBEDDING_MODEL_NAME}, the export used ${corpus.model}.`);
        console.warn('Search and matching only see vectors of the active model - run "npm run reembed" after seeding.\n');
    }

    let seeded = 0;
    let missingFiles = 0;

    for (const image of corpus.images) {
        const { id } = await upsertImage({
            fileName: image.file_name,
            subject: image.subject,
            category: image.category,
            attributes: image.attributes,
            caption: image.caption,
            confidence: image.confidence,
            status: image.status,
            errorMessage: null,
            fileHash: null
        });

        await db.query(
            `INSERT INTO image_embeddings (image_id, vector, model) VALUES ($1, $2::vector, $3)
             ON CONFLICT (image_id) DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
            [id, toVectorLiteral(image.vector), corpus.model]
        );

        if (!fs.existsSync(path.join(IMAGE_DIR, image.file_name))) missingFiles++;
        seeded++;
        if (seeded % 25 === 0) console.log(`  ${seeded}/${corpus.count}`);
    }

    console.log(`\nSeeded ${seeded} images with vectors.`);
    if (missingFiles > 0) {
        console.log(`${missingFiles} image files are not on disk - search still works, thumbnails for those will 404.`);
    }
    await db.pool.end();
}

run().catch((err) => {
    console.error('Corpus seed failed:', err);
    process.exit(1);
});
