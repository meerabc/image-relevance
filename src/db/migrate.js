require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrate() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Applying schema...');
    await db.query(schema);
    console.log('Schema applied successfully.');

    await db.pool.end();
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});