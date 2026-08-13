# FlyRank Capstone: AI Image Understanding & Content Matching Engine

## The Mission
A backend service that automatically tags an image library using Vision AI and semantically matches the right image to the right blog post. It features a "mismatch guard" that safely rejects images when it is not confident, prioritizing accuracy over forced recommendations.

## Design Document

### 1. Problem Statement
The goal is to match images to articles based on semantic meaning, not just keywords. Crucially, the system must recognize when no suitable image exists and refuse to provide a bad recommendation (e.g., rejecting a wolf image for an article about red foxes).

### 2. Image Metadata Schema
Every image processed by the Vision model will produce structured output validated against this JSON schema:
{
  "subject": "string",
  "category": "string",
  "attributes": ["string"],
  "caption": "string",
  "confidence": "number (0-1)"
}

### 3. Database Design
*   **Images Table:** Stores image URLs, the structured tags (subject, category, attributes), the caption, and the confidence score.
*   **Embeddings Table:** Stores the vector embeddings generated from the image captions.
*   **Posts Table:** Stores blog post content and their corresponding vector embeddings.

### 4. API Surface
*   `GET /posts/:id/images`: Calculates similarity ranking, passes candidates through the mismatch guard, and returns either a suggested image (ranked and explained) or a "No good match" rejection.

### 5. Explicit Non-Goal
This project is explicitly **not** building a frontend user interface or a massive image search engine. The focus is strictly on the backend decision logic and the AI safety layer across a bounded dataset of ~50 images.

## Setup Instructions
(To be completed in Phase 4)