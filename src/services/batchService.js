const fs = require('fs');
const path = require('path');
const { understandImage } = require('./visionService');
const { generateEmbedding } = require('./embeddingService');
const { logCost } = require('./costService');
const db = require('../db');

// waiting a bit before retrying to avoid rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// flagging images below this confidence instead of trusting them
const CONFIDENCE_FLAG_THRESHOLD = 0.70;

// inserting a new image row or updating the existing one if the file was already processed before
async function upsertImage({ fileName, subject, category, attributes, caption, confidence, status, errorMessage }) {
    const result = await db.query(
        `INSERT INTO images (file_name, subject, category, attributes, caption, confidence, status, error_message, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (file_name) DO UPDATE SET
            subject = EXCLUDED.subject,
            category = EXCLUDED.category,
            attributes = EXCLUDED.attributes,
            caption = EXCLUDED.caption,
            confidence = EXCLUDED.confidence,
            status = EXCLUDED.status,
            error_message = EXCLUDED.error_message,
            updated_at = now()
         RETURNING id`,
        [fileName, subject, category, attributes, caption, confidence, status, errorMessage]
    );
    return result.rows[0].id;
}

async function processBatch(imageDirectory) {
    // reading all files from the target directory
    const files = fs.readdirSync(imageDirectory);
    const summary = { processed: 0, lowConfidence: 0, failed: 0 };

    for (const file of files) {
        // filtering for image files only
        if (!file.match(/\.(png|jpg|jpeg)$/i)) {
            continue;
        }

        const imagePath = path.join(imageDirectory, file);
        let attempt = 1;
        const maxRetries = 3;
        let success = false;
        let lastError = null;

        // attempting to process the image with retries
        while (attempt <= maxRetries && !success) {
            console.log(`Processing ${file}, attempt ${attempt}`);
            const result = await understandImage(imagePath);
            await logCost('vision', file, result.success);

            if (result.success) {
                success = true;
                const data = result.data;

                // deciding status based on confidence, flagging low confidence instead of accepting it silently
                const status = data.confidence < CONFIDENCE_FLAG_THRESHOLD
                    ? 'low_confidence'
                    : 'processed';

                const imageId = await upsertImage({
                    fileName: file,
                    subject: data.subject,
                    category: data.category,
                    attributes: data.attributes,
                    caption: data.caption,
                    confidence: data.confidence,
                    status,
                    errorMessage: null
                });

                console.log(`Status for ${file}: ${status}, confidence ${data.confidence}`);
                if (status === 'low_confidence') summary.lowConfidence++;
                else summary.processed++;

                // generating and storing the embedding for this image's caption
                const embeddingResult = await generateEmbedding(data.caption);
                await logCost('embedding', file, embeddingResult.success);

                if (embeddingResult.success) {
                    await db.query(
                        `INSERT INTO image_embeddings (image_id, vector) VALUES ($1, $2)
                         ON CONFLICT (image_id) DO UPDATE SET vector = EXCLUDED.vector`,
                        [imageId, embeddingResult.vector]
                    );
                } else {
                    console.log(`Embedding failed for ${file}: ${embeddingResult.error}`);
                }

            } else {
                lastError = result.error;
                console.log(`Failed on ${file}, error: ${result.error}`);
                attempt++;
                if (attempt <= maxRetries) {
                    await delay(2000);
                }
            }
        }

        // recording the failure instead of dropping it silently if every retry failed
        if (!success) {
            await upsertImage({
                fileName: file,
                subject: null,
                category: null,
                attributes: null,
                caption: null,
                confidence: null,
                status: 'failed',
                errorMessage: lastError
            });
            console.log(`Status for ${file}: failed, all ${maxRetries} attempts exhausted`);
            summary.failed++;
        }
    }

    return summary;
}

module.exports = {
    processBatch
};