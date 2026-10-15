const fs = require('fs');
const crypto = require('crypto');
const { understandImage } = require('./visionService');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./embeddingService');
const { logCost } = require('./costService');
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
// used to skip vision calls entirely, which saves free tier quota
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

// inserting a new image row or updating the existing one if the file was already processed before
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
        [fileName, subject, category, attributes, caption, confidence, status, errorMessage, fileHash]
    );
    return result.rows[0].id;
}

// generating and storing the embedding for a caption, attributed to the current model
async function storeImageEmbedding(imageId, fileName, caption) {
    const embeddingResult = await generateEmbedding(caption);
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

// one image through the whole pipeline: vision, schema validation, status decision,
// upsert with hash, embed the caption. Used by the batch job and the upload queue alike.
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

    const embedded = await storeImageEmbedding(imageId, fileName, data.caption);

    return { success: true, imageId, status, confidence: data.confidence, embedded, data };
}

module.exports = {
    determineStatus,
    hashFile,
    findImageByHash,
    upsertImage,
    processImageIntake
};
