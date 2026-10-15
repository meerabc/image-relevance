# FlyRank Capstone: AI Image Understanding & Content Matching Engine

## What this project does

A backend service that tags an image library with a Vision AI model and then finds the right image for a blog post by meaning, not by keywords. A "mismatch guard" sits between the scores and the final answer: when no image is good enough, the service refuses to recommend one instead of forcing a bad match.

A small web UI is included for reviewing the matches, but every feature lives behind an HTTP API, so other software can use the same endpoints directly (see [Using the API](#using-the-api)).

## How it works

```
Images ──(batch job or upload)──► Vision Model ──► tags, caption, confidence ──► images table
                                    └──► embed(all tags) ─────────► image_embeddings table

Posts ──(API or seed script)─────► embed(topic + title + content) ──► post_embeddings table

GET /posts/:id/images
    └──► load the post and every tagged image from the database
    └──► pgvector ranks all images by cosine similarity in SQL
    └──► the mismatch guard judges every candidate:
         1. tag confidence - are the vision tags trustworthy?
         2. semantic similarity - is the score above the required line?
         3. topic alignment - do the image tags relate to the post topic?
         ├──► yes to all: recommended image, ranked and explained, saved to suggestions
         └──► any failure: no confident match, with the reason spelled out

Review endpoints (approve / reject / inspect) record human decisions on top.
Every vision and embedding call is written to the cost_log table.
```

**Embeddings run locally** (`all-MiniLM-L6-v2` through `@xenova/transformers`), so post creation, semantic search and matching cost $0 and need no API key. The Gemini API key is only needed for the vision tagging of images. A Gemini embedding provider is kept in the code for the provider comparison, switching requires re-embedding everything.

## The mismatch guard

The guard is a pure function: score in, verdict out. Every verdict carries a machine-readable `checks` breakdown (what passed, what failed, by how much) and a plain-language reason.

Thresholds are not hardcoded into the flow:

- **Server side**: tuned values are adopted through `.env` (`SIMILARITY_THRESHOLD`, `NO_OVERLAP_THRESHOLD`, `CONFIDENCE_THRESHOLD`); the code fallbacks live in `src/services/mismatchGuard.js`. `npm run tune` sweeps the labeled evaluation set and prints the best operating point.
- **UI side**: the "Guard thresholds" panel in the match view adjusts all three thresholds per browser. Every match request sends the active thresholds as query parameters, so the results always reflect exactly the operating point shown in the panel.

## Database design

- **images** - one row per image: file name, subject, category, attributes, caption, confidence, `status` (`processed` / `low_confidence` / `failed`), and a sha256 `file_hash` for duplicate rejection
- **image_embeddings** - one row per image, the 384-dim embedding as pgvector `vector(384)`, tagged with the model that produced it
- **posts** - blog post title, topic keyword, and content
- **post_embeddings** - one row per post, same pgvector setup
- **suggestions** - one row per (post, image) evaluation: score, is_match, reason, review status (`pending` / `approved` / `rejected`)
- **cost_log** - one row per vision or embedding call, attributed by reference and success

Deleting a post or image cascades through its embeddings and suggestions at the database level, so no stale rows survive.

## API surface

| Method | Path | What it does |
|---|---|---|
| `GET` | `/health` | Liveness, model info, guard config, library counts, `imagesMissingEmbedding`, last repair status |
| `GET` | `/posts` | All posts with `has_embedding` flag |
| `POST` | `/posts` | Create a post `{ title, topic, content }`, embedded in the same request |
| `DELETE` | `/posts/:id` | Delete a post and everything referencing it (cascades) |
| `GET` | `/posts/:id/images` | The main matching endpoint (see below) |
| `GET` | `/images` | Image library with AI metadata and `has_embedding` flag |
| `POST` | `/images` | Multipart upload (`image` field), hashed, queued for vision tagging |
| `DELETE` | `/images/:id` | Delete an image row (cascades) and its file on disk |
| `GET` | `/search?q=&limit=` | Semantic search: embeds the query locally, ranks the library in SQL, reports latency |
| `GET` | `/suggestions/:id` | Inspect one suggestion: score, reason, review status |
| `POST` | `/suggestions/:id/approve` | Record a human approval |
| `POST` | `/suggestions/:id/reject` | Record a human rejection |
| `GET` | `/review/stats` | Human vs guard disagreement counts and rows |
| `GET` | `/costs` | Cost log entries plus per-type summary |
| `GET` | `/jobs/:id` | Poll an upload's processing job |

**`GET /posts/:id/images`** returns a top match (ranked and explained), every candidate with its guard checks, and an `unscored` count. All three threshold query parameters are optional: `?similarity=0.55&noOverlap=0.65&confidence=0.70` (each between 0.01 and 0.99, `noOverlap >= similarity` enforced). Omitted parameters fall back to the server's tuned defaults.

## Using the API

The Express server *is* the API. The UI in `public/` is just one client of it, and CORS is enabled, so any web app, script or service can call these endpoints directly.

While the server is running (default port 3000), test it from PowerShell:

```powershell
# health
Invoke-RestMethod http://localhost:3000/health

# match images for post 1 with default thresholds
Invoke-RestMethod "http://localhost:3000/posts/1/images" | ConvertTo-Json -Depth 6

# the same call with custom guard thresholds
Invoke-RestMethod "http://localhost:3000/posts/1/images?similarity=0.50&noOverlap=0.60&confidence=0.70"

# semantic search
(Invoke-RestMethod "http://localhost:3000/search?q=fox%20in%20snow").results |
  Select-Object file_name, subject, score
```

Or from any machine with `curl`:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/posts/1/images?similarity=0.55"
```

## Library self-healing

The matching SQL joins on embeddings, so an image with vision tags but no embedding row is excluded from matching. A debounced repair sweep (`src/services/embeddingRepair.js`) re-embeds such images from their stored tags - zero vision spend - and is triggered from health checks, library listings, match runs and failed intakes. The gap is also made visible instead of hidden: library cards show a "not scored" chip, match responses report `unscored`, and `/health` reports `imagesMissingEmbedding` plus the last repair status. `npm run repair` runs a manual sweep from the host.

## Setup

**Requirements:** Node.js 20+, Docker Desktop, a free Gemini API key from Google AI Studio. A Pexels API key is only needed to re-download the corpus.

### Option A: Docker (recommended)

```bash
# 1. configure
cp .env.example .env        # fill in GEMINI_API_KEY

# 2. build and start (database + app)
docker compose up -d --wait

# 3. first run only: create tables and load content
docker compose exec app node src/db/migrate.js
docker compose exec app node src/seedPosts.js
docker compose exec app node src/downloadImages.js   # needs PEXELS_API_KEY
docker compose exec app npm run batch                # tags every image (paced, several minutes)
```

The app serves the UI and the API on port 3000.

### Option B: local Node

```bash
# 1. configure
cp .env.example .env        # fill in GEMINI_API_KEY

# 2. start Postgres and create tables
docker compose up -d db
node src/db/migrate.js

# 3. load content
node src/seedPosts.js
node src/downloadImages.js  # needs PEXELS_API_KEY
npm run batch               # paced to stay under the free tier quota

# 4. start the server
npm start
```

### Rebuilding an existing database (no vision spend)

If a library already exists (or a `data/corpus-export.json` is committed), the whole library is rebuildable without spending any quota:

```bash
npm run corpus:seed    # rebuild library from the corpus export (vectors included)
npm run repair         # embed anything tagged but unembedded
```

Other maintenance scripts: `npm run reembed` (re-embed everything after a model or text-strategy change), `npm run tune` (threshold sweep), `npm run eval` (top-1 precision), `npm run bench` (pgvector latency benchmark).

## Testing

```bash
npx jest
```

The suite covers schema validation, low-confidence flagging, the mismatch guard (hand-picked vector angles for exact cosine control), threshold query parsing, and matching accuracy against the seeded corpus. The accuracy tests need a live database with the seeded corpus; all other tests run anywhere.

## Evaluation result

Top-1 precision measured against a 6-post labeled evaluation set: **100% (6/6)**. See `EVIDENCE.md` for the full run output.

## Demo highlights

- `GET /posts/:id/images` for the red fox post ranks a red fox image first.
- Forcing a gray wolf image against the red fox post gets rejected by the guard with an explained reason. Reproduce with `node src/demoWolfRejection.js`.
- The astronomy post returns "no confident match", since nothing in the corpus is space related.
- Matching works on meaning, not shared words: a post titled only with the scientific name "Vulpes vulpes" still matches red fox images. Reproduce with `node src/testSemanticMatching.js`.
- Human review decisions (`approve` / `reject`) persist independently of the guard's automatic verdict.

## Limitations

- The guard's topic-alignment check uses word token matching rather than a true semantic comparison. It works well for this corpus but could be fooled by categories with overlapping vocabulary.
- The image corpus is limited to 5 animal categories plus a few unrelated control images. Real-world coverage would need a larger and more varied dataset.
- The Gemini free tier's per-minute quotas mean a full corpus re-tag from scratch takes several minutes due to the pacing delay.
- `all-MiniLM-L6-v2` is a small local model: its score distribution is narrow (true matches often land around 0.45-0.55), which is exactly why the guard thresholds exist and are tunable. A stronger embedding model is the next real quality step.
