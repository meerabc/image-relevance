require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const { getPostImages } = require('./controllers/matchingController');
const { inspectSuggestion, approveSuggestion, rejectSuggestion, reviewStats } = require('./controllers/reviewController');
const { getCosts } = require('./controllers/costController');
const { listPosts, listImages, deletePost, deleteImage } = require('./controllers/libraryController');
const { searchImages } = require('./controllers/searchController');
const { createPost } = require('./controllers/postController');
const { upload, uploadImage, getJob, listJobs } = require('./controllers/uploadController');
const { getHealth } = require('./controllers/healthController');
const { registerProcessor } = require('./services/jobQueue');
const { processImageIntake } = require('./services/imageIntake');
const logger = require('./utils/logger');

const app = express();

// parsing incoming JSON requests
app.use(express.json());

// CORS headers, so other apps and scripts can call this API from their own
// origin. The matching, search, review and cost endpoints are a public API,
// the bundled frontend is only one of its clients.
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// the upload job's processor, wired here so the queue stays dependency-free
registerProcessor('process-image', processImageIntake);

// frontend, static files from /public, and the image files themselves served at /media
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/media', express.static(path.join(__dirname, '..', 'data', 'images')));

// health and model info for the UI header and deployment checks
app.get('/health', getHealth);

// read only listing endpoints used by the frontend
app.get('/posts', listPosts);
app.get('/images', listImages);

// semantic search, embeds the query locally and ranks the library in SQL
app.get('/search', searchImages);

// write endpoints, posts embed instantly, images go through the job queue
app.post('/posts', createPost);
app.post('/images', upload.single('image'), uploadImage);

// delete endpoints, embeddings and suggestions are removed by the schema cascades
app.delete('/posts/:id', deletePost);
app.delete('/images/:id', deleteImage);

// job polling for the upload flow
app.get('/jobs', listJobs);
app.get('/jobs/:id', getJob);

// matching endpoint, returns the ranked suggestion or a refusal for a given post
app.get('/posts/:id/images', getPostImages);

// review endpoints, inspecting why a suggestion was made and approving or rejecting it
app.get('/review/stats', reviewStats);
app.get('/suggestions/:id', inspectSuggestion);
app.post('/suggestions/:id/approve', approveSuggestion);
app.post('/suggestions/:id/reject', rejectSuggestion);

// cost tracking endpoint
app.get('/costs', getCosts);

// multer and JSON body errors become clean 400s instead of stack traces
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: error.message });
    }
    logger.error('Unhandled request error', error);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
