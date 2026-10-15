const fs = require('fs');
const path = require('path');
const { hashFile, findImageByHash, upsertImage, processImageIntake, determineStatus } = require('./imageIntake');

// waiting a bit before retrying to avoid rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// pacing between images to stay under the free tier vision quota
const PACE_DELAY_MS = 4500;
const MAX_RETRIES = 3;

async function processBatch(imageDirectory, { forceRetag = false } = {}) {
    const files = fs.readdirSync(imageDirectory)
        .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
        .sort();

    const summary = { processed: 0, lowConfidence: 0, failed: 0, skipped: 0 };

    for (const file of files) {
        const imagePath = path.join(imageDirectory, file);
        const fileHash = hashFile(imagePath);

        // hash dedupe: never spend a vision call on a file the library already has.
        // forceRetag bypasses it once, to re-tag the library after the vision prompt changes
        const existing = forceRetag ? null : await findImageByHash(fileHash);
        if (existing) {
            console.log(`Skipping ${file}, already in the library as ${existing.file_name}`);
            summary.skipped++;
            continue;
        }

        await delay(PACE_DELAY_MS);

        let attempt = 1;
        let success = false;
        let lastError = null;

        // attempting to process the image with retries
        while (attempt <= MAX_RETRIES && !success) {
            console.log(`Processing ${file}, attempt ${attempt}`);
            const result = await processImageIntake({ fileName: file, filePath: imagePath, fileHash });

            if (result.success) {
                success = true;
                console.log(`Status for ${file}: ${result.status}, confidence ${result.confidence}`);
                if (result.status === 'low_confidence') summary.lowConfidence++;
                else summary.processed++;
            } else {
                lastError = result.error;
                console.log(`Failed on ${file}, error: ${result.error}`);
                attempt++;
                if (attempt <= MAX_RETRIES) {
                    await delay(20000);
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
                errorMessage: lastError,
                fileHash
            });
            console.log(`Status for ${file}: failed, all ${MAX_RETRIES} attempts exhausted`);
            summary.failed++;
        }
    }

    return summary;
}

module.exports = {
    processBatch,
    determineStatus
};
