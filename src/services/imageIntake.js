const fs = require('fs');
const crypto = require('crypto');
const { understandImage } = require('./visionService');
const { generateEmbedding, buildImageEmbeddingText, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./embeddingService');
const { normalizeCategory } = require('../utils/categories');
const { logCost } = require('./costService');
const { maybeRepairMissingEmbeddings } = require('./embeddingRepair');
const db = require('../db');

// flagging images below this confidence instead of trusting them
const CONFIDENCE_FLAG_THRESHOLD = 0.70;

// deciding whether a successfully tagged image should be trusted or flagged for review
function determineStatus(confidence) {
    return confidence < CONFIDENCE_FLAG_THRESHOLD ? 'low_confidence' : 'processed';
}

// sha256 of the file bytes, the identity used for dedupe regardless of file name
function hashFile(filePath) {
    const contents = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(contents).digest('hex');
}

// returns the existing row when this exact file was already processed,
// so the caller can skip vision calls entirely and save free tier quota
async function findImageByHash(fileHash) {
    if (!fileHash) return null;
    const result = await db.query(
        `SELECT id, file_name, subject, category, confidence, status
         FROM images
         WHERE file_hash = $1`,
        [fileHash]
    );
    return result.rows[0] || null;
}

// inserting the image row, or updating the existing row when the same file name is processed again
async function upsertImage({ fileName, subject, category, attributes, caption, confidence, status, errorMessage, fileHash }) {
    const result = await db.query(
        `INSERT INTO images (file_name, subject, category, attributes, caption, confidence, status, error_message, file_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (file_name) DO UPDATE SET
            subject = EXCLUDED.subject,
            category = EXCLUDED.category,
            attributes = EXCLUDED.attributes,
            caption = EXCLUDED.caption,
            confidence = EXCLUDED.confidence,
            status = EXCLUDED.status,
            error_message = EXCLUDED.error_message,
            file_hash = COALESCE(EXCLUDED.file_hash, images.file_hash),
            updated_at = now()
         RETURNING id`,
        [fileName, subject, normalizeCategory(category), attributes, caption, confidence, status, errorMessage, fileHash]
    );
    return result.rows[0].id;
}

// generating and storing the embedding for an image, attributed to the current model.
// embeds the full metadata text (subject + category + attributes + caption), not the bare caption
async function storeImageEmbedding(imageId, fileName, meta) {
    const embeddingResult = await generateEmbedding(buildImageEmbeddingText(meta));
    await logCost('embedding', fileName, embeddingResult.success);

    if (!embeddingResult.success) {
        console.log(`Embedding failed for ${fileName}: ${embeddingResult.error}`);
        return false;
    }

    await db.query(
        `INSERT INTO image_embeddings (image_id, vector, model) VALUES ($1, $2::vector, $3)
         ON CONFLICT (image_id) DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
        [imageId, toVectorLiteral(embeddingResult.vector), EMBEDDING_MODEL_NAME]
    );
    return true;
}

// one image through the whole pipeline: vision tagging, schema validation, status decision,
// upsert with hash, embedding of the full metadata text. Used by the batch job and the upload queue alike.
async function processImageIntake({ fileName, filePath, fileHash }) {
    const result = await understandImage(filePath);
    await logCost('vision', fileName, result.success);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    const data = result.data;
    const status = determineStatus(data.confidence);
    const imageId = await upsertImage({
        fileName,
        subject: data.subject,
        category: data.category,
        attributes: data.attributes,
        caption: data.caption,
        confidence: data.confidence,
        status,
        errorMessage: null,
        fileHash: fileHash || null
    });

    const embedded = await storeImageEmbedding(imageId, fileName, data);

    if (!embedded) {
        // the image row exists but it will never be matchable without an
        // embedding; the debounced repair sweep retries from the stored tags
        maybeRepairMissingEmbeddings();
    }

    return { success: true, imageId, status, confidence: data.confidence, embedded, data };
}

module.exports = {
    determineStatus,
    hashFile,
    findImageByHash,
    upsertImage,
    processImageIntake
};
