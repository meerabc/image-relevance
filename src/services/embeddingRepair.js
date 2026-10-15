// Self-healing for the library. The matching SQL joins on embeddings, so an
// image that has vision tags but no embedding for the active model is
// silently excluded from every match. This module finds such images and
// re-embeds them from their stored tags, with zero vision spend, so a
// one-off embedding failure does not remove an image from matching forever.
const { generateEmbedding, buildImageEmbeddingText, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./embeddingService');
const { logCost } = require('./costService');
const db = require('../db');
const logger = require('../utils/logger');

// repairs are debounced so a burst of requests produces at most one sweep per
// window, and a failing model cannot turn into a hot retry loop
const MIN_INTERVAL_MS = 60 * 1000;

let lastRunAt = 0;
let running = false;
// the outcome of the most recent sweep, surfaced through /health so a repair
// that keeps failing explains itself instead of leaving an unexplained count
let lastRepairStatus = null;

async function findImagesMissingEmbedding() {
    const result = await db.query(
        `SELECT i.id, i.file_name, i.subject, i.category, i.attributes, i.caption
         FROM images i
         LEFT JOIN image_embeddings ie ON ie.image_id = i.id AND ie.model = $1
         WHERE i.caption IS NOT NULL AND ie.image_id IS NULL
         ORDER BY i.id`,
        [EMBEDDING_MODEL_NAME]
    );
    return result.rows;
}

// one sweep: embed every tagged image that is missing an embedding row for
// the active model. Vision results are reused as-is, so this never costs a
// vision call; only local embedding compute.
async function repairMissingEmbeddings() {
    const startedAt = new Date().toISOString();

    try {
        const missing = await findImagesMissingEmbedding();

        if (missing.length === 0) {
            lastRepairStatus = { at: startedAt, scanned: 0, repaired: 0, failed: 0, error: null };
            return { repaired: 0, failed: [] };
        }

        logger.warn(`Embedding repair: ${missing.length} image(s) in the library have no embedding for ${EMBEDDING_MODEL_NAME}, repairing`);

        const failed = [];
        let repaired = 0;

        for (const image of missing) {
            try {
                const embeddingResult = await generateEmbedding(buildImageEmbeddingText(image));
                await logCost('embedding', `repair:${image.file_name}`, embeddingResult.success);

                if (!embeddingResult.success) {
                    failed.push({ file: image.file_name, error: embeddingResult.error });
                    continue;
                }

                await db.query(
                    `INSERT INTO image_embeddings (image_id, vector, model) VALUES ($1, $2::vector, $3)
                     ON CONFLICT (image_id) DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
                    [image.id, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
                );
                repaired += 1;
            } catch (error) {
                failed.push({ file: image.file_name, error: error.message });
            }
        }

        logger.info(`Embedding repair finished: ${repaired} repaired, ${failed.length} failed`);
        lastRepairStatus = {
            at: startedAt,
            scanned: missing.length,
            repaired,
            failed: failed.length,
            error: failed.length > 0 ? `${failed[0].file}: ${failed[0].error}` : null
        };
        return { repaired, failed };
    } catch (error) {
        // sweep-level failure (database unreachable, module load error)
        lastRepairStatus = { at: startedAt, scanned: 0, repaired: 0, failed: 0, error: error.message };
        throw error;
    }
}

// debounced, fire-and-forget entry point for request paths: it never throws
// and never blocks the caller, it just makes sure a sweep happens soon.
function maybeRepairMissingEmbeddings() {
    const now = Date.now();

    if (running || now - lastRunAt < MIN_INTERVAL_MS) return;

    lastRunAt = now;
    running = true;

    repairMissingEmbeddings()
        .catch((error) => logger.error('Embedding repair failed', error))
        .finally(() => { running = false; });
}

async function countMissingEmbeddings() {
    const rows = await findImagesMissingEmbedding();
    return rows.length;
}

function getRepairStatus() {
    return lastRepairStatus;
}

module.exports = {
    repairMissingEmbeddings,
    maybeRepairMissingEmbeddings,
    countMissingEmbeddings,
    getRepairStatus
};
