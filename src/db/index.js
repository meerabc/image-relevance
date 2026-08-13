const { Pool } = require('pg');

// Single shared connection pool — every other module imports this
// instead of opening its own connection.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};