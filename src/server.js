require('dotenv').config();
const express = require('express');
const { getPostImages } = require('./controllers/matchingController');

const app = express();

// Parsing incoming JSON requests
app.use(express.json());

// Defining the API endpoint for fetching matched images
app.get('/posts/:id/images', getPostImages);

const PORT = process.env.PORT || 3000;

// Starting the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test endpoint: http://localhost:${PORT}/posts/1/images`);
});