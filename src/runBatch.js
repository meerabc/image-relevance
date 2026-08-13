require('dotenv').config();
const path = require('path');
const { processBatch } = require('./services/batchService');
const db = require('./db');

async function run() {
    const imageDir = path.join(__dirname, '../data/images');

    console.log('Starting batch processing');

    const summary = await processBatch(imageDir);

    console.log('Batch processing complete');
    console.log(`Processed: ${summary.processed}`);
    console.log(`Low confidence: ${summary.lowConfidence}`);
    console.log(`Failed: ${summary.failed}`);

    await db.pool.end();
}

run().catch((err) => {
    console.error('Batch run failed:', err);
    process.exit(1);
});

