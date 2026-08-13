require('dotenv').config();
const path = require('path');
const { processBatch } = require('./services/batchService');
const { costLog } = require('./services/visionService');

async function run() {
    // Defining the path to the image directory
    const imageDir = path.join(__dirname, '../data/images');

    console.log('STARTING BATCH PROCESSING\n');
    
    // Executing the batch process
    const results = await processBatch(imageDir);

    console.log('\nBATCH PROCESSING RESULTS\n');
    console.log(JSON.stringify(results, null, 2));

    console.log('\nCOST TRACKING\n');
    console.log(`TOTAL VISION API CALLS: ${costLog.totalVisionCalls}\n`);
}

run();