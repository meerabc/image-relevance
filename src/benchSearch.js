require('dotenv').config();
const db = require('./db');
const { generateEmbedding, toVectorLiteral, EMBEDDING_MODEL_NAME } = require('./services/embeddingService');

// latency benchmark for pgvector HNSW ranking (the same ORDER BY the API runs).
// --synthetic N temporarily pads a scratch table with N vectors so latency can
// be measured at production scale (10k+) without needing N real images.
// synthetic vectors are jittered copies of real embeddings, so the index works
// on a realistic data distribution. This measures DATABASE speed, not AI quality.
const SCRATCH_TABLE = 'bench_vectors';

function parseArgs() {
    const get = (flag, fallback) => {
        const index = process.argv.indexOf(flag);
        return index !== -1 && process.argv[index + 1] ? parseInt(process.argv[index + 1], 10) : fallback;
    };
    return {
        synthetic: Math.max(0, get('--synthetic', 0) || 0),
        queryCount: Math.max(1, Math.min(30, get('--queries', 12) || 12)),
        runs: Math.max(1, Math.min(30, get('--runs', 5) || 5))
    };
}

// Box-Muller, standard normal noise for jittering real vectors
function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return magnitude > 0 ? vector.map(value => value / magnitude) : vector;
}

function jitterVector(base, sigma = 0.05) {
    return normalize(base.map(value => value + gaussian() * sigma));
}

function percentile(sorted, p) {
    const index = Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length));
    return sorted[index];
}

const SAMPLE_QUERIES = [
    'a dog resting at the vet',
    'misty forest at sunrise',
    'protest march with a raised fist',
    'wild red fox in the snow',
    'puppy playing on the grass',
    'gray wolf howling',
    'a woman speaking at a podium',
    'close up portrait of a bear',
    'deer standing in a meadow',
    'veterinarian examining an animal',
    'people volunteering together',
    'silhouette against a dramatic sky',
    'mother animal with her cubs',
    'autumn leaves on the ground',
    'mountain landscape with fog'
];

async function loadRealVectors() {
    const result = await db.query(
        `SELECT vector::text AS vector_text FROM image_embeddings WHERE model = $1 LIMIT 500`,
        [EMBEDDING_MODEL_NAME]
    );
    return result.rows.map(row => JSON.parse(row.vector_text));
}

async function buildScratchTable(realVectors, syntheticCount) {
    await db.query(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    await db.query(`CREATE TABLE ${SCRATCH_TABLE} (id serial PRIMARY KEY, vector vector(384))`);

    // real vectors first, then jittered copies so the distribution stays realistic
    const allVectors = [...realVectors];
    while (allVectors.length < Math.max(realVectors.length, syntheticCount)) {
        allVectors.push(jitterVector(realVectors[allVectors.length % realVectors.length]));
    }

    const BATCH = 500;
    for (let start = 0; start < allVectors.length; start += BATCH) {
        const batch = allVectors.slice(start, start + BATCH);
        await db.query(
            `INSERT INTO ${SCRATCH_TABLE} (vector) SELECT unnest($1::vector[])`,
            [batch.map(toVectorLiteral)]
        );
    }

    // the same index type and operator class the live tables use
    await db.query(`CREATE INDEX idx_bench_vector ON ${SCRATCH_TABLE} USING hnsw (vector vector_cosine_ops)`);
    return allVectors.length;
}

async function embedQueries(queryCount) {
    const queries = SAMPLE_QUERIES.slice(0, queryCount);
    const vectors = [];
    for (const query of queries) {
        const result = await generateEmbedding(query);
        if (!result.success) throw new Error(`embedding failed: ${result.error}`);
        vectors.push(result.vector);
    }
    return vectors;
}

async function measure(queryVectors, runs) {
    const times = [];
    // one untimed warm-up pass so pages and the index are hot, like a live server
    for (const vector of queryVectors) {
        await db.query(`SELECT id FROM ${SCRATCH_TABLE} ORDER BY vector <=> $1::vector LIMIT 10`, [toVectorLiteral(vector)]);
    }
    for (let run = 0; run < runs; run++) {
        for (const vector of queryVectors) {
            const started = process.hrtime.bigint();
            await db.query(`SELECT id FROM ${SCRATCH_TABLE} ORDER BY vector <=> $1::vector LIMIT 10`, [toVectorLiteral(vector)]);
            times.push(Number(process.hrtime.bigint() - started) / 1e6);
        }
    }
    times.sort((a, b) => a - b);
    return times;
}

async function run() {
    const { synthetic, queryCount, runs } = parseArgs();

    const realVectors = await loadRealVectors();
    if (realVectors.length === 0) {
        console.error('No embeddings in the database - run migrate/seed/reembed first.');
        process.exit(1);
    }

    const totalVectors = await buildScratchTable(realVectors, synthetic);
    const syntheticUsed = totalVectors - realVectors.length;
    console.log(`\npgvector HNSW latency - ${totalVectors.toLocaleString()} vectors (${realVectors.length} real + ${syntheticUsed.toLocaleString()} synthetic), cosine distance, top-10`);
    console.log(`embedding ${queryCount} realistic queries locally, then ${runs} timed runs each (after warm-up)\n`);

    const queryVectors = await embedQueries(queryCount);
    const times = await measure(queryVectors, runs);

    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    console.log(`  p50: ${percentile(times, 50).toFixed(2)} ms`);
    console.log(`  p95: ${percentile(times, 95).toFixed(2)} ms`);
    console.log(`  p99: ${percentile(times, 99).toFixed(2)} ms`);
    console.log(`  mean: ${mean.toFixed(2)} ms over ${times.length} queries`);

    if (syntheticUsed > 0) {
        console.log('\nNote: synthetic vectors measure index/database speed, not AI quality.');
    }
}

run()
    .catch((err) => {
        console.error('Benchmark failed:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.query(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
        } catch { /* scratch cleanup is best effort */ }
        await db.pool.end();
    });
