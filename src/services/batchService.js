const fs = require('fs');
const path = require('path');
const { understandImage } = require('./visionService');

// Sleeping for a specified amount of time to handle retries gracefully
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processBatch(imageDirectory) {
    // Reading all files from the target directory
    const files = fs.readdirSync(imageDirectory);
    const results = [];

    for (const file of files) {
        // Filtering for image files only
        if (!file.match(/\.(png|jpg|jpeg)$/i)) {
            continue;
        }

        const imagePath = path.join(imageDirectory, file);
        let attempt = 1;
        const maxRetries = 3;
        let success = false;

        // Attempting to process the image with retries
        while (attempt <= maxRetries && !success) {
            console.log(`Processing ${file}, attempt ${attempt}...`);
            const result = await understandImage(imagePath);

            if (result.success) {
                results.push({
                    file,
                    data: result.data
                });
                success = true;
                console.log(`Successfully processed ${file}`);
            } else {
                console.log(`Failed on ${file}, error: ${result.error}`);
                attempt++;
                if (attempt <= maxRetries) {
                    // Waiting 2 seconds before retrying to avoid rate limits
                    await delay(2000);
                }
            }
        }
    }

    return results;
}

module.exports = {
    processBatch
};