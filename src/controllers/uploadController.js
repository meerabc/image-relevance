const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { findImageByHash } = require('../services/imageIntake');
const { enqueueJob, getJobById, listRecentJobs } = require('../services/jobQueue');
const logger = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'images');
const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png' };

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
        const ext = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, path.extname(file.originalname))
            .replace(/[^a-z0-9-_]+/gi, '-')
            .slice(0, 40) || 'image';
        cb(null, `upload-${Date.now()}-${base}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED_TYPES[file.mimetype]))
});

// accepting an image: hash it, refuse duplicates, then hand the real
// processing to the job queue so the request returns immediately
async function uploadImage(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'Attach a JPG or PNG in the "image" form field' });
    }

    try {
        const fileHash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
        const existing = await findImageByHash(fileHash);

        if (existing) {
            // identical bytes are already indexed, discard the upload
            fs.unlinkSync(req.file.path);
            return res.json({ duplicate: true, image: existing });
        }

        const job = enqueueJob('process-image', {
            fileName: req.file.filename,
            filePath: req.file.path,
            fileHash
        });

        res.status(202).json({ duplicate: false, jobId: job.id, fileName: req.file.filename });
    } catch (error) {
        logger.error('Upload intake failed', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function getJob(req, res) {
    const job = getJobById(req.params.id);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
}

function listJobs(req, res) {
    res.json(listRecentJobs());
}

module.exports = {
    upload,
    uploadImage,
    getJob,
    listJobs
};
