require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const IMAGES_PER_CATEGORY = 10;

// categories matching the brief's own animal example set
const categories = [
    { slug: 'red-fox', query: 'red fox' },
    { slug: 'gray-wolf', query: 'gray wolf' },
    { slug: 'dog', query: 'dog' },
    { slug: 'bear', query: 'bear' },
    { slug: 'deer', query: 'deer' }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchPhotos(query, count) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`;
    const response = await fetch(url, {
        headers: { Authorization: PEXELS_API_KEY }
    });

    if (!response.ok) {
        throw new Error(`Pexels search failed for "${query}", status ${response.status}`);
    }

    const data = await response.json();
    return data.photos;
}

async function downloadImage(imageUrl, savePath) {
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(savePath, buffer);
}

async function run() {
    const imageDir = path.join(__dirname, '../data/images');
    let totalDownloaded = 0;

    for (const category of categories) {
        console.log(`Searching for ${category.query}`);
        const photos = await searchPhotos(category.query, IMAGES_PER_CATEGORY);

        let index = 1;
        for (const photo of photos) {
            const fileName = `${category.slug}-${index}.jpg`;
            const savePath = path.join(imageDir, fileName);

            await downloadImage(photo.src.large, savePath);
            console.log(`Saved ${fileName}`);

            totalDownloaded++;
            index++;
            await delay(300);
        }
    }

    console.log(`Downloaded ${totalDownloaded} images total`);
}

run().catch((err) => {
    console.error('Download failed:', err);
    process.exit(1);
});