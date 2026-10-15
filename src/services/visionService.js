const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs'); 
const { imageMetadataSchema } = require('../utils/schema');

// The vision model that tags every image: Gemini Flash, authenticated with the API key from .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

// In-memory counter of vision calls. The Flash free tier costs $0, the count shows how much work vision did.
const costLog = {
    totalVisionCalls: 0,
    estimatedCost: 0
};

async function understandImage(imagePath) {
    // the image file is read and sent to the API as Base64 text
    const imageBytes = fs.readFileSync(imagePath);
    const imageBase64 = imageBytes.toString('base64');

    // the mime type comes from the file extension
    const mimeType = imagePath.endsWith('png') ? 'image/png' : 'image/jpeg';

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: mimeType
        }
    };

    // The prompt asks for rich tags and a full caption: every field ends up
    // in the embedding text, so richer descriptions mean better matching.
    const prompt = `Analyze this image for a blog-content library. Return a JSON object strictly matching this exact structure.
    Ensure the confidence field is a float number, not a string.
    {
      "subject": "the main subject in 2-5 words, e.g. 'red fox' or 'woman raising fist'",
      "category": "one broad category in lowercase, e.g. 'wildlife', 'people', 'sports and recreation'",
      "attributes": ["3-6 short lowercase tags covering setting, mood and theme, e.g. 'sunset', 'protest', 'empowerment', 'autumn forest'"],
      "caption": "one sentence describing the scene: the subject, what it is doing, the setting, and any symbolic or emotional theme, e.g. 'A woman raises her fist against an orange sunset sky, a symbol of empowerment and protest.'",
      "confidence": float between 0.0 and 1.0 representing certainty
    }
    Only output the raw JSON without any extra formatting or text.`;

    try {
        // the vision model is called with the prompt and the image
        const result = await model.generateContent([prompt, imagePart]);

        // one call is one usage count
        costLog.totalVisionCalls += 1;

        // the response text is parsed into a JavaScript object
        let textResponse = result.response.text();
        // the model sometimes wraps JSON in markdown fences, those are stripped first
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedJSON = JSON.parse(textResponse);

        // the parsed object must match the metadata schema, invalid vision output never gets stored
        const validatedData = imageMetadataSchema.parse(parsedJSON);
        
        return {
            success: true,
            data: validatedData
        };

    } catch (error) {
        // any failure (API error, invalid JSON, schema mismatch) is reported to the caller instead of throwing
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    understandImage,
    costLog
};

