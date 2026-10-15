require('dotenv').config();
const fs = require('fs');
const path = require('path');

// grows the library with real photos at $0: downloads Pexels photos for each
// query and records their alt text in a manifest. `npm run embed:manifest`
// then embeds them locally (no vision API, no quota), so the corpus can reach
// thousands of searchable images without spending anything.
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const OUT_DIR = path.join(__dirname, '..', 'data', 'images');
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'pexels-manifest.json');
const PER_PAGE_MAX = 80; // Pexels per_page limit

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs() {
    const get = (flag, fallback) => {
        const index = process.argv.indexOf(flag);
        return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
    };
    const queries = get('--queries', '')
        .split(',').map(q => q.trim()).filter(Boolean);
    const perQuery = Math.max(1, Math.min(200, parseInt(get('--per-query', '40'), 10) || 40));
    return { queries, perQuery };
}

async function fetchPage(query, page) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE_MAX}&page=${page}`;
    const response = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });

    if (!response.ok) {
        throw new Error(`Pexels search failed for "${query}" page ${page}, status ${response.status}`);
    }
    const data = await response.json();
    return data.photos || [];
}

async function downloadPhoto(photo, fileName) {
    const response = await fetch(photo.src.large);
    if (!response.ok) throw new Error(`download failed, status ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(OUT_DIR, fileName), buffer);
}

async function run() {
    if (!PEXELS_API_KEY) {
        console.error('PEXELS_API_KEY missing in .env - get a free key at https://www.pexels.com/api/');
        process.exit(1);
    }

    const { queries, perQuery } = parseArgs();
    if (queries.length === 0) {
        console.error('Usage: node src/fetchPexels.js --queries "dog,puppy at the vet" --per-query 40');
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : [];
    const known = new Set(manifest.map(entry => entry.fileName));
    let added = 0;

    for (const query of queries) {
        const pages = Math.ceil(perQuery / PER_PAGE_MAX);
        let photos = [];

        for (let page = 1; page <= pages; page++) {
            const batch = await fetchPage(query, page);
            photos = photos.concat(batch);
            if (batch.length < PER_PAGE_MAX) break;
            await delay(250);
        }

        let fromQuery = 0;
        for (const photo of photos.slice(0, perQuery)) {
            const fileName = `pexels-${photo.id}.jpg`;
            if (known.has(fileName)) continue;

            try {
                await downloadPhoto(photo, fileName);
                manifest.push({
                    fileName,
                    query,
                    alt: (photo.alt || '').trim(),
                    photographer: photo.photographer || null,
                    width: photo.width,
                    height: photo.height
                });
                known.add(fileName);
                added++;
                fromQuery++;
            } catch (error) {
                console.log(`Skipping one "${query}" photo: ${error.message}`);
            }
            await delay(200);
        }
        console.log(`"${query}": added ${fromQuery} new images`);
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\nAdded ${added} images total. Manifest: ${path.relative(process.cwd(), MANIFEST_PATH)}`);
    console.log('Next: npm run embed:manifest');
}

run().catch((err) => {
    console.error('Pexels fetch failed:', err);
    process.exit(1);
});
