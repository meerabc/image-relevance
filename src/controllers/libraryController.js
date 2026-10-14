const db = require('../db');

// listing every post so the frontend can show a picker (read only, no embeddings returned)
async function listPosts(req, res) {
    try {
        const result = await db.query(
            `SELECT p.id, p.title, p.topic, p.content,
                    (pe.post_id IS NOT NULL) AS has_embedding
             FROM posts p
             LEFT JOIN post_embeddings pe ON pe.post_id = p.id
             ORDER BY p.id`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// listing the processed image library with its AI metadata (read only, no embeddings returned)
async function listImages(req, res) {
    try {
        const result = await db.query(
            `SELECT id, file_name, subject, category, attributes, caption, confidence, status, error_message
             FROM images
             ORDER BY category NULLS LAST, file_name`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    listPosts,
    listImages
};
