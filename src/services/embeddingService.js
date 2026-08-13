const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initializing Gemini with API key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initializing the embedding model rather than a vision model
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// Tracking API usage for the embedding model
const embeddingCostLog = {
    totalEmbeddingCalls: 0
};

async function generateEmbedding(text) {
    try {
        // Generating the mathematical vector for the provided text
        const result = await model.embedContent(text);
        
        // Tracking the API call
        embeddingCostLog.totalEmbeddingCalls += 1;
        
        return {
            success: true,
            vector: result.embedding.values
        };
    } catch (error) {
        // Catching and reporting any errors during the API call
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    generateEmbedding,
    embeddingCostLog
};