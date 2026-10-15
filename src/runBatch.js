require('dotenv').config();
const path = require('path');
const { processBatch } = require('./services/batchService');
const db = require('./db');

async function run() {
    const imageDir = path.join(__dirname, '../data/images');
    // --retag re-runs the vision model on files already in the library,
    // used after the vision prompt changes to refresh tags and captions
    const forceRetag = process.argv.includes('--retag');

    console.log(forceRetag ? 'Starting batch re-tagging (vision quota will be spent)' : 'Starting batch processing');

    const summary = await processBatch(imageDir, { forceRetag });

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

