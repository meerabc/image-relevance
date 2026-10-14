require('dotenv').config();
const path = require('path');
const express = require('express');
const { getPostImages } = require('./controllers/matchingController');
const { inspectSuggestion, approveSuggestion, rejectSuggestion } = require('./controllers/reviewController');
const { getCosts } = require('./controllers/costController');
const { listPosts, listImages } = require('./controllers/libraryController');

const app = express();

// parsing incoming JSON requests
app.use(express.json());

// frontend, static files from /public, and the image files themselves served at /media
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/media', express.static(path.join(__dirname, '..', 'data', 'images')));

// read only listing endpoints used by the frontend
app.get('/posts', listPosts);
app.get('/images', listImages);

// matching endpoint, returns the ranked suggestion or a refusal for a given post
app.get('/posts/:id/images', getPostImages);

// review endpoints, inspecting why a suggestion was made and approving or rejecting it
app.get('/suggestions/:id', inspectSuggestion);
app.post('/suggestions/:id/approve', approveSuggestion);
app.post('/suggestions/:id/reject', rejectSuggestion);

// cost tracking endpoint
app.get('/costs', getCosts);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});