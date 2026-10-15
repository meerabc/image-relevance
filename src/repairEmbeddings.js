require('dotenv').config();
const { repairMissingEmbeddings } = require('./services/embeddingRepair');
const { EMBEDDING_MODEL_NAME } = require('./services/embeddingService');
const db = require('./db');

// manual repair entry point: embeds every tagged image that is missing an
// embedding row for the active model. Runs on the host with the host's
// network and the shared ./.cache model folder, so it also warms the cache
// the container bind-mounts, which is exactly what unblocks the container's
// own repair sweep when the Hugging Face fetch inside the container is flaky.
async function run() {
    console.log(`Embedding repair (model: ${EMBEDDING_MODEL_NAME})`);

    const result = await repairMissingEmbeddings();

    console.log(`Repaired: ${result.repaired}, failed: ${result.failed.length}`);
    for (const item of result.failed) {
        console.log(`  FAILED ${item.file}: ${item.error}`);
    }

    await db.pool.end();
}

run().catch((error) => {
    console.error('Repair failed:', error.message);
    process.exit(1);
});
