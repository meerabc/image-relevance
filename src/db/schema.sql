-- pgvector must be enabled before the vector type is usable
CREATE EXTENSION IF NOT EXISTS vector;

-- Images: one row per image processed by the vision model
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    subject TEXT,
    category TEXT,
    attributes TEXT[],
    caption TEXT,
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | processed | low_confidence | failed
    error_message TEXT,
    file_hash TEXT, -- sha256 of the file bytes, duplicate uploads are rejected on this
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embeddings for images, kept in a separate table (1:1 with images)
-- 384 dims = all-MiniLM-L6-v2, the local embedding model
CREATE TABLE IF NOT EXISTS image_embeddings (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    vector vector(384) NOT NULL,
    model TEXT, -- embedding model that produced this vector, vectors from different models are never mixed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posts: seeded by script or created through POST /posts
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_embeddings (
    post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    vector vector(384) NOT NULL,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suggestions: one row per (post, image) evaluation - this is what the Review API works on
CREATE TABLE IF NOT EXISTS suggestions (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    is_match BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, image_id)
);

-- Cost log: one row per AI call, attributed
CREATE TABLE IF NOT EXISTS cost_log (
    id SERIAL PRIMARY KEY,
    call_type TEXT NOT NULL, -- 'vision' | 'embedding'
    reference TEXT NOT NULL, -- e.g. image file name or post id
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- columns added after the first schema version, migrating applies them to older databases
ALTER TABLE images ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE image_embeddings ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE post_embeddings ADD COLUMN IF NOT EXISTS model TEXT;
-- rows without a model label are filled in with the local MiniLM model
UPDATE image_embeddings SET model = 'Xenova/all-MiniLM-L6-v2' WHERE model IS NULL;
UPDATE post_embeddings SET model = 'Xenova/all-MiniLM-L6-v2' WHERE model IS NULL;

-- cosine distance indexes, ranking happens in SQL instead of Node
CREATE INDEX IF NOT EXISTS idx_image_embeddings_vector ON image_embeddings USING hnsw (vector vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_post_embeddings_vector ON post_embeddings USING hnsw (vector vector_cosine_ops);

-- duplicate uploads are rejected on hash before any AI call is spent
CREATE UNIQUE INDEX IF NOT EXISTS idx_images_file_hash ON images(file_hash) WHERE file_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suggestions_post_id ON suggestions(post_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_review_status ON suggestions(review_status);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_cost_log_call_type ON cost_log(call_type);
