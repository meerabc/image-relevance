const { GoogleGenerativeAI } = require('@google/generative-ai');

const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384 dims
const GEMINI_MODEL = 'gemini-embedding-001';   // 3072 dims

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });

// the local model is loaded lazily, once, on the first embedding call
// the require lives inside so importing this module never loads the library
let extractorPromise = null;
function getExtractor() {
    if (!extractorPromise) {
        const { pipeline, env } = require('@xenova/transformers');
        env.allowLocalModels = false;
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
    if (process.env.EMBEDDING_PROVIDER === 'gemini') {
        return embedWithGemini(text);
    }
    return embedWithLocalModel(text);
}

// pgvector columns take a literal like "[0.1,0.2,...]", not a JS array
function toVectorLiteral(vector) {
    return `[${vector.join(',')}]`;
}

module.exports = { generateEmbedding, toVectorLiteral };
