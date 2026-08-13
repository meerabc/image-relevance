require('dotenv').config();
const express = require('express');
const { getPostImages } = require('./controllers/matchingController');
const { inspectSuggestion, approveSuggestion, rejectSuggestion } = require('./controllers/reviewController');
const { getCosts } = require('./controllers/costController');

const app = express();

// parsing incoming JSON requests
app.use(express.json());

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