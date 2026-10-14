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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embeddings for images, kept in a separate table (1:1 with images)
-- 384 dims = all-MiniLM-L6-v2, the local embedding model
CREATE TABLE IF NOT EXISTS image_embeddings (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    vector vector(384) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posts: for now still small enough to seed manually
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suggestions: one row per (post, image) evaluation — this is what the Review API works on
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

-- cosine distance indexes, ranking happens in SQL instead of Node
CREATE INDEX IF NOT EXISTS idx_image_embeddings_vector ON image_embeddings USING hnsw (vector vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_post_embeddings_vector ON post_embeddings USING hnsw (vector vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_suggestions_post_id ON suggestions(post_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_review_status ON suggestions(review_status);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_cost_log_call_type ON cost_log(call_type);