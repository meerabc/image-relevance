const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const { normalizeCategory } = require('../utils/categories');

const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384 dims
const GEMINI_MODEL = 'gemini-embedding-001';   // 3072 dims, kept for the provider comparison

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });

// which provider is active, embeddings from different models are never mixed in the DB
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER === 'gemini' ? 'gemini' : 'local';
const EMBEDDING_MODEL_NAME = EMBEDDING_PROVIDER === 'gemini' ? GEMINI_MODEL : LOCAL_MODEL;

// the local model is loaded lazily, once, on the first embedding call
// the require lives inside so importing this module never loads the library
let extractorPromise = null;
function getExtractor() {
    if (!extractorPromise) {
        const { pipeline, env } = require('@xenova/transformers');
        env.allowLocalModels = false;
        // the fetch cache must live in ./.cache, the folder the compose file
        // bind-mounts into the container. The library default is .cache inside
        // node_modules, which is wiped on every image rebuild, so the model
        // would be re-downloaded from the Hugging Face hub at runtime on every
        // fresh container. One download here is shared by the container, the
        // CLI scripts and the repair sweep, and survives rebuilds.
        env.cacheDir = path.resolve('./.cache');
        extractorPromise = pipeline('feature-extraction', LOCAL_MODEL);
    }
    return extractorPromise;
}

async function embedWithLocalModel(text) {
    try {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return { success: true, vector: Array.from(output.data) };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// kept for the provider comparison benchmark, switching providers requires
// re-embedding everything since different models produce incomparable vectors
async function embedWithGemini(text) {
    try {
        const result = await geminiModel.embedContent(text);
        return { success: true, vector: result.embedding.values };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function generateEmbedding(text) {
    if (EMBEDDING_PROVIDER === 'gemini') {
        return embedWithGemini(text);
    }
    return embedWithLocalModel(text);
}

// pgvector columns take a literal like "[0.1,0.2,...]", not a JS array
function toVectorLiteral(vector) {
    return `[${vector.join(',')}]`;
}

// ---------- embedding text builders ----------
// WHAT gets embedded matters as much as the model embedding it. Both sides of
// the comparison are built here so their "concept density" stays comparable:
// an image is represented by every tag the vision model produced, a post by
// its theme (topic + title) plus a content excerpt that fits the model window.
// Embedding only the raw caption or content lets long prose dominate short
// captions and bury the topic the post is actually about.
function buildImageEmbeddingText(meta) {
    const parts = [
        meta.subject,
        normalizeCategory(meta.category),
        Array.isArray(meta.attributes) ? meta.attributes.join(', ') : '',
        meta.caption
    ];
    return parts.filter(Boolean).join('. ');
}

function buildPostEmbeddingText(post) {
    const excerpt = (post.content || '').slice(0, 600);
    return [post.topic, post.title, excerpt].filter(Boolean).join('. ');
}

module.exports = {
    generateEmbedding,
    toVectorLiteral,
    buildImageEmbeddingText,
    buildPostEmbeddingText,
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL_NAME
};
