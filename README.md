# HRR-Bee

A simplified, mobile-first podcast backlog manager for the Hey Riddle Riddle podcast.

Refactored from the original [hrr-backlog](https://github.com/samamyers-dev/hrr-backlog-manager) — now TypeScript + Python instead of Rust.

## What's Different

- **No AI chat** — stripped out for simplicity
- **No S3 storage** — audio streams directly from RSS feed URLs
- **No transcription pipeline** — no STT, no queue workers
- **Mobile-first UI** — designed for phone browsers, 1980s terminal aesthetic
- **Auto-sort by unplayed** — unplayed episodes always appear first by default
- **Nous Research brand** — phosphor green, monospace, CRT scanlines

## Stack

- **Backend**: Python / FastAPI / asyncpg
- **Frontend**: TypeScript / React / Vite / Howler.js
- **Database**: PostgreSQL
- **Deploy**: Railway (Dockerfile)

## Project Structure

```
hrr-bee/
  backend/
    main.py          # FastAPI app with all routes
    config.py        # Environment config
    database.py      # asyncpg pool + migration runner
    models.py        # Pydantic models
    rss.py           # RSS feed parser (feedparser)
  frontend/
    src/
      App.tsx               # Main app component
      api/client.ts         # API client
      hooks/useAudioPlayer  # Audio player hook (Howler.js)
      components/            # EpisodeList, EpisodeDetail, AudioBar, etc.
      styles/main.css       # 1980s terminal aesthetic
    dist/                   # Pre-built (committed for Railway)
  migrations/
    001_episodes.sql
    002_playback_history.sql
    003_user_preferences.sql
  Dockerfile               # Multi-stage Python build
  railway.toml
```

## Local Development

### Frontend
```bash
cd frontend
npm install
npm run dev    # Vite dev server on :5173
```

### Backend
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8080
```

### Build frontend for production
```bash
cd frontend && npm run build
# dist/ is committed to git for Railway
```

## Railway Deployment

1. Push this repo to GitHub
2. Create new Railway project from the repo
3. Add PostgreSQL database (+ New -> Database -> PostgreSQL)
4. Set environment variables:
   - `DATABASE_URL` (auto-injected by Railway PostgreSQL)
   - `SESSION_SECRET` (32+ char random string)
   - `APP_PASSWORD` (optional — protect with a password)
   - `PATREON_RSS_URL` (your Patreon RSS feed URL)
   - `OPENROUTER_API_KEY` (optional — needed for LLM title enrichment)
   - `LLM_MODEL` (optional — default `google/gemini-2.5-flash-lite`)
   - `ENABLE_LLM_PARSING` (optional — set `true` to enable; default `false`)
5. Railway will build using the Dockerfile and serve on port 8080

### LLM Title Parsing

Set `ENABLE_LLM_PARSING=true` and provide an `OPENROUTER_API_KEY` to enrich episodes with structured metadata during RSS sync. The default model `google/gemini-2.5-flash-lite` costs roughly $0.10/1M input tokens and $0.40/1M output tokens — typically a few cents for hundreds of episodes.

### Key Notes
- Frontend is pre-built and committed — Dockerfile just copies `frontend/dist/`
- App works in frontend-only mode if no DATABASE_URL (shows UI, API returns 503)
- PORT is read from environment (Railway sets 8080)
