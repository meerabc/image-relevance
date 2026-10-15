require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { upsertImage, storeImageEmbedding, hashFile } = require('./services/imageIntake');

// embeds the Pexels manifest locally: alt text becomes the caption/subject,
// the search query becomes the category, and the MiniLM embedding runs on
// your CPU for $0 - no vision calls, no quota, no paid API.
// file hashes are stored so a later `npm run batch` skips these files.
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'pexels-manifest.json');
const IMAGE_DIR = path.join(__dirname, '..', 'data', 'images');

async function run() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`No manifest at ${MANIFEST_PATH} - run "npm run fetch:pexels" first.`);
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const existing = await db.query('SELECT file_name FROM images');
    const known = new Set(existing.rows.map(row => row.file_name));

    console.log(`Manifest has ${manifest.length} entries, ${known.size} images already in the library\n`);

    let embedded = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of manifest) {
        if (known.has(entry.fileName)) {
            skipped++;
            continue;
        }

        const filePath = path.join(IMAGE_DIR, entry.fileName);
        if (!fs.existsSync(filePath)) {
            console.log(`Skipping ${entry.fileName}, file not on disk`);
            skipped++;
            continue;
        }

        const subject = (entry.alt || `Pexels photo: ${entry.query}`).slice(0, 140);
        const caption = entry.alt || subject;
        const meta = { subject, category: entry.query, attributes: [], caption };

        try {
            const { id } = await upsertImage({
                fileName: entry.fileName,
                subject,
                category: entry.query,
                attributes: [],
                caption,
                confidence: null,
                status: 'imported',
                errorMessage: null,
                fileHash: hashFile(filePath)
            });

            const ok = await storeImageEmbedding(id, entry.fileName, meta);
            if (ok) embedded++;
            else failed++;
        } catch (error) {
            console.log(`Failed ${entry.fileName}: ${error.message}`);
            failed++;
        }

        if ((embedded + skipped + failed) % 50 === 0) {
            console.log(`  ${embedded + skipped + failed}/${manifest.length}`);
        }
    }

    console.log(`\nEmbedded ${embedded}, skipped ${skipped} (already present or missing), failed ${failed}.`);
    console.log('These images carry alt-text metadata, not vision tags - tag quality is lower, which is exactly what the latency/scale story needs at $0.');
    await db.pool.end();
}

run().catch((err) => {
    console.error('Manifest embedding failed:', err);
    process.exit(1);
});
