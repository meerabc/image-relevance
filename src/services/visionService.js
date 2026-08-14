const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs'); 
const { imageMetadataSchema } = require('../utils/schema');

// Initializing Gemini with API key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

// Simple cost tracker in memory
const costLog = {
    totalVisionCalls: 0,
    estimatedCost: 0 // Flash free tier is $0, but we track usage count
};

async function understandImage(imagePath) {
    // 1. Reading the image file and convert it to Base64 (text format)
    const imageBytes = fs.readFileSync(imagePath);
    const imageBase64 = imageBytes.toString('base64');
    
    // Determining the image type
    const mimeType = imagePath.endsWith('png') ? 'image/png' : 'image/jpeg';

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: mimeType
        }
    };

    // Strict instructions for the AI
    const prompt = `Analyze this image. Return a JSON object strictly matching this exact structure. 
    Ensure the confidence field is a float number, not a string.
    {
      "subject": "string describing the main subject",
      "category": "string describing the broad category",
      "attributes": ["string", "string"],
      "caption": "string providing a descriptive caption",
      "confidence": float between 0.0 and 1.0 representing certainty
    }
    Only output the raw JSON without any extra formatting or text.`;

    try {
        // 2. Calling the AI model
        const result = await model.generateContent([prompt, imagePart]);
        
        // Tracking the cost/usage per call 
        costLog.totalVisionCalls += 1; 

        // 3. Cleaning and parsing the AI's text response into a JavaScript object
        let textResponse = result.response.text();
        // Stripping out markdown formatting if the AI includes it by mistake
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const parsedJSON = JSON.parse(textResponse);

        // 4. Validating against the Zod schema; this is the mismatch guard for bad data
        const validatedData = imageMetadataSchema.parse(parsedJSON);
        
        return {
            success: true,
            data: validatedData
        };

    } catch (error) {
        // If validation fails or AI fails, we safely catch it and report the error
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

