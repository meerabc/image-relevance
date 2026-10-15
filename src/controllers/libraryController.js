const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const db = require('../db');
const { normalizeCategory } = require('../utils/categories');
const { EMBEDDING_MODEL_NAME } = require('../services/embeddingService');
const { maybeRepairMissingEmbeddings } = require('../services/embeddingRepair');
const logger = require('../utils/logger');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

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
        logger.error('Post listing failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// listing the processed image library with its AI metadata (read only, no embeddings returned)
// has_embedding is included so the UI can flag images that will never appear
// in matching until they are embedded, instead of the gap staying invisible
async function listImages(req, res) {
    try {
        const result = await db.query(
            `SELECT i.id, i.file_name, i.subject, i.category, i.attributes, i.caption,
                    i.confidence, i.status, i.error_message,
                    (ie.image_id IS NOT NULL) AS has_embedding
             FROM images i
             LEFT JOIN image_embeddings ie ON ie.image_id = i.id AND ie.model = $1
             ORDER BY i.category NULLS LAST, i.file_name`,
            [EMBEDDING_MODEL_NAME]
        );

        const rows = result.rows.map((row) => ({ ...row, category: normalizeCategory(row.category) }));

        // a tagged image without an embedding is repairable, schedule the sweep
        if (rows.some((row) => row.caption && !row.has_embedding)) {
            maybeRepairMissingEmbeddings();
        }

        // categories are normalized on read so every row maps to the same filter chip
        res.json(rows);
    } catch (error) {
        logger.error('Image listing failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// deleting a post removes its embedding and every suggestion that referenced
// it through the schema's ON DELETE CASCADE, so no stale row survives anywhere
async function deletePost(req, res) {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Post id must be a number' });
    }

    try {
        const result = await db.query('DELETE FROM posts WHERE id = $1 RETURNING id, title', [postId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        logger.info(`Post ${postId} deleted`);
        res.json({ deleted: true, id: postId, title: result.rows[0].title });
    } catch (error) {
        logger.error(`Post deletion failed for ${postId}`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// deleting an image removes its embedding and suggestions through the cascade,
// then deletes the file from disk. The file removal is best effort: if the row
// is gone the library is already consistent, a missing file on disk is only
// cosmetic and is reported honestly in the response.
async function deleteImage(req, res) {
    const imageId = parseInt(req.params.id);

    if (isNaN(imageId)) {
        return res.status(400).json({ error: 'Image id must be a number' });
    }

    try {
        const result = await db.query('DELETE FROM images WHERE id = $1 RETURNING file_name', [imageId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const fileName = result.rows[0].file_name;
        let fileDeleted = false;

        try {
            // the resolved path must stay inside the images dir, file names come
            // from the database and this keeps the unlink bounded even if a row
            // was edited by hand
            const filePath = path.resolve(IMAGES_DIR, fileName);
            if (filePath.startsWith(IMAGES_DIR + path.sep) && fs.existsSync(filePath)) {
                await fsp.unlink(filePath);
                fileDeleted = true;
            }
        } catch (fileError) {
            logger.warn(`Could not delete file for image ${imageId}: ${fileError.message}`);
        }

        logger.info(`Image ${imageId} deleted (file removed: ${fileDeleted})`);
        res.json({ deleted: true, id: imageId, file_name: fileName, fileDeleted });
    } catch (error) {
        logger.error(`Image deletion failed for ${imageId}`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    listPosts,
    listImages,
    deletePost,
    deleteImage
};
