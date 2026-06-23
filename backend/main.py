"""HRR-Bee: Simplified podcast backlog manager.

FastAPI backend serving API + static frontend.
Mobile-first, no AI chat, auto-sort by unplayed.
"""
from __future__ import annotations

import os
import json
import time
import httpx
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import Config
from .database import create_pool, get_pool, run_migrations
from .rss import fetch_and_parse
from .llm import parse_titles
from .models import (
    Episode,
    ProgressUpdate,
    PlaybackReport,
    PreferenceUpdate,
    BulkUpdate,
    MetaOptions,
)

app = FastAPI(title="HRR-Bee")
config = Config.from_env()
pool = None

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@app.on_event("startup")
async def startup():
    global pool
    pool = await create_pool(config.database_url)
    if pool:
        print("[INFO] Database connected, running migrations...")
        try:
            await run_migrations(pool)
        except Exception as e:
            print(f"[ERROR] Migration error: {e}. Continuing without DB.")
            pool = None
    else:
        print("[WARN] No DATABASE_URL — frontend-only mode")

    print(f"[INFO] === HRR-Bee ready on port {config.port} (db={'yes' if pool else 'no'}) ===")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "has_db": pool is not None}


# ---------------------------------------------------------------------------
# Auth (simple cookie session)
# ---------------------------------------------------------------------------

@app.get("/api/auth/check")
async def auth_check(request: Request):
    session = request.cookies.get("hrr_session")
    if not config.app_password:
        return {"authenticated": True, "passwordRequired": False}
    if session == config.session_secret:
        return {"authenticated": True, "passwordRequired": True}
    return {"authenticated": False, "passwordRequired": True}


@app.post("/api/auth/login")
async def login(body: dict):
    password = body.get("password", "")
    if not config.app_password:
        resp = JSONResponse({"success": True})
        resp.set_cookie("hrr_session", config.session_secret, httponly=True, samesite="lax", max_age=86400 * 30)
        return resp
    if password == config.app_password:
        resp = JSONResponse({"success": True})
        resp.set_cookie("hrr_session", config.session_secret, httponly=True, samesite="lax", max_age=86400 * 30)
        return resp
    return JSONResponse({"success": False, "message": "Invalid password"}, status_code=401)


@app.post("/api/auth/logout")
async def logout():
    resp = JSONResponse({"success": True})
    resp.delete_cookie("hrr_session")
    return resp


# ---------------------------------------------------------------------------
# Episodes
# ---------------------------------------------------------------------------

def _check_auth(request: Request):
    if not config.app_password:
        return
    session = request.cookies.get("hrr_session")
    if session != config.session_secret:
        raise HTTPException(status_code=401, detail="Not authenticated")


def _row_to_episode(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "episode_number": row["episode_number"],
        "description": row["description"],
        "pub_date": row["pub_date"],
        "audio_url": row["audio_url"],
        "duration": row["duration"],
        "play_state": row["play_state"],
        "last_position": row["last_position"],
        "image_url": row["image_url"],
        "parsed_title": row["parsed_title"] if row["parsed_title"] else None,
    }


@app.get("/api/episodes")
async def list_episodes(
    request: Request,
    sort: str = "unplayed-first",
    filter: str = "all",
    format: str = "all",
    search: str = "",
    range: str = "all",
):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    # Build ORDER BY — the key feature: unplayed-first is the default
    order_map = {
        "newest": "pub_date DESC",
        "oldest": "pub_date ASC",
        "unplayed-first": "CASE WHEN play_state='unplayed' THEN 0 WHEN play_state='in-progress' THEN 1 ELSE 2 END, pub_date ASC",
        "unplayed-first-newest": "CASE WHEN play_state='unplayed' THEN 0 WHEN play_state='in-progress' THEN 1 ELSE 2 END, pub_date DESC",
    }
    order = order_map.get(sort, order_map["unplayed-first"])

    where_parts = ["1=1"]
    params: list = []

    if filter == "played":
        where_parts.append("play_state = 'played'")
    elif filter == "unplayed":
        where_parts.append("play_state = 'unplayed'")
    elif filter == "in-progress":
        where_parts.append("play_state = 'in-progress'")

    if format != "all":
        params.append(format)
        where_parts.append(f"parsed_title->>'format' = ${len(params)}")

    if search:
        params.append(f"%{search}%")
        search_param = len(params)
        where_parts.append(
            f"""(
                title ILIKE ${search_param}
                OR description ILIKE ${search_param}
                OR parsed_title->>'title' ILIKE ${search_param}
                OR parsed_title->>'riddle_theme' ILIKE ${search_param}
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(parsed_title->'guest_names') AS g
                    WHERE g ILIKE ${search_param}
                )
            )"""
        )

    if range.startswith("year-"):
        year_str = range[5:]
        try:
            year = int(year_str)
            start_ms = int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
            end_ms = int(datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
            params.append(start_ms)
            where_parts.append(f"pub_date >= ${len(params)}")
            params.append(end_ms)
            where_parts.append(f"pub_date <= ${len(params)}")
        except ValueError:
            pass
    elif range != "all":
        parts = range.split("-")
        if len(parts) == 2:
            try:
                start_ep, end_ep = int(parts[0]), int(parts[1])
                params.append(start_ep)
                where_parts.append(f"episode_number >= ${len(params)}")
                params.append(end_ep)
                where_parts.append(f"episode_number <= ${len(params)}")
            except ValueError:
                pass

    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM episodes WHERE {where_clause} ORDER BY {order}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
        return [_row_to_episode(r) for r in rows]


@app.get("/api/episodes/meta-options")
async def meta_options(request: Request):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT MIN(episode_number) as min_ep, MAX(episode_number) as max_ep FROM episodes WHERE episode_number IS NOT NULL"
        )
        min_ep = row["min_ep"] or 1
        max_ep = row["max_ep"] or 1

        year_rows = await conn.fetch(
            "SELECT DISTINCT to_char(to_timestamp(pub_date / 1000.0), 'YYYY') as year FROM episodes ORDER BY year DESC"
        )
        years = [r["year"] for r in year_rows]

        format_rows = await conn.fetch(
            "SELECT DISTINCT parsed_title->>'format' as format FROM episodes WHERE parsed_title->>'format' IS NOT NULL ORDER BY format"
        )
        formats = [r["format"] for r in format_rows]

    return {"minEpisodeNumber": min_ep, "maxEpisodeNumber": max_ep, "years": years, "formats": formats}


@app.get("/api/episodes/{episode_id}")
async def get_episode(request: Request, episode_id: str):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM episodes WHERE id = $1", episode_id)
        if not row:
            raise HTTPException(404, "Episode not found")
        return _row_to_episode(row)


@app.post("/api/episodes/progress")
async def update_progress(request: Request, body: ProgressUpdate):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE episodes SET play_state = $1, last_position = $2 WHERE id = $3",
            body.play_state,
            body.last_position or 0,
            body.id,
        )
    return {"success": True}


@app.post("/api/episodes/bulk-update")
async def bulk_update(request: Request, body: BulkUpdate):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    if body.mode == "date":
        if not body.start_date or not body.end_date:
            raise HTTPException(400, "Missing startDate/endDate")
        start_dt = datetime.strptime(body.start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(body.end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        start_ms = int(start_dt.timestamp() * 1000)
        end_ms = int(end_dt.timestamp() * 1000)
        where_clause = f"pub_date BETWEEN {start_ms} AND {end_ms}"
    else:
        start_ep = body.start_episode or 1
        end_ep = body.end_episode or 1
        where_clause = f"episode_number BETWEEN {start_ep} AND {end_ep}"

    set_clause = {
        "played": "play_state = 'played', last_position = COALESCE(duration, 0)",
        "unplayed": "play_state = 'unplayed', last_position = 0",
    }.get(body.play_state, "play_state = 'in-progress'")

    sql = f"UPDATE episodes SET {set_clause} WHERE {where_clause}"

    async with pool.acquire() as conn:
        result = await conn.execute(sql)
        count = int(result.split()[-1]) if result else 0

    return {"success": True, "updatedCount": count}


# ---------------------------------------------------------------------------
# Playback
# ---------------------------------------------------------------------------

@app.post("/api/playback/report")
async def playback_report(request: Request, body: PlaybackReport):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    now_ms = int(time.time() * 1000)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO playback_history (episode_id, position_seconds, playback_speed, recorded_at) VALUES ($1, $2, $3, $4)",
            body.episode_id,
            body.position_seconds,
            body.playback_speed,
            now_ms,
        )
        await conn.execute(
            "UPDATE episodes SET last_position = $1, play_state = CASE WHEN $1 >= COALESCE(duration, 0) - 30 AND COALESCE(duration, 0) > 0 THEN 'played' ELSE 'in-progress' END WHERE id = $2",
            body.position_seconds,
            body.episode_id,
        )
    return {"success": True}


@app.get("/api/playback/position/{episode_id}")
async def playback_position(request: Request, episode_id: str):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT last_position FROM episodes WHERE id = $1", episode_id)
        if not row:
            raise HTTPException(404, "Episode not found")
    return {"position_seconds": row["last_position"]}


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------

@app.get("/api/preferences")
async def get_preferences(request: Request):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM user_preferences")
    return {r["key"]: json.loads(r["value"]) if isinstance(r["value"], str) else r["value"] for r in rows}


@app.post("/api/preferences")
async def set_preference(request: Request, body: PreferenceUpdate):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    now_ms = int(time.time() * 1000)
    value_json = json.dumps(body.value)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO user_preferences (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3",
            body.key,
            value_json,
            now_ms,
        )
    return {"success": True}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.get("/api/admin/status")
async def admin_status(request: Request):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")

    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM episodes")
        unplayed = await conn.fetchval("SELECT COUNT(*) FROM episodes WHERE play_state = 'unplayed'")
        in_progress = await conn.fetchval("SELECT COUNT(*) FROM episodes WHERE play_state = 'in-progress'")
        played = await conn.fetchval("SELECT COUNT(*) FROM episodes WHERE play_state = 'played'")

    return {
        "total_episodes": total,
        "unplayed": unplayed,
        "in_progress": in_progress,
        "played": played,
    }


@app.post("/api/admin/sync")
async def sync_feed(request: Request):
    _check_auth(request)
    if not pool:
        raise HTTPException(503, "Database not configured")
    if not config.patreon_rss_url:
        raise HTTPException(400, "Patreon RSS URL not configured")

    episodes = fetch_and_parse(config.patreon_rss_url)
    BATCH_SIZE = 20

    async with pool.acquire() as conn:
        before = await conn.fetchval("SELECT COUNT(*) FROM episodes")

        # Insert/update episode rows first (preserve existing parsed_title)
        for ep in episodes:
            await conn.execute(
                """INSERT INTO episodes (id, title, episode_number, description, pub_date, audio_url, duration, image_url)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   ON CONFLICT (id) DO UPDATE SET
                     title = EXCLUDED.title,
                     description = EXCLUDED.description,
                     audio_url = EXCLUDED.audio_url,
                     duration = EXCLUDED.duration,
                     image_url = COALESCE(EXCLUDED.image_url, episodes.image_url)""",
                ep["id"],
                ep["title"],
                ep["episode_number"],
                ep["description"],
                ep["pub_date"],
                ep["audio_url"],
                ep["duration"],
                ep["image_url"],
            )

        # If LLM parsing enabled, enrich episodes missing parsed_title
        if config.enable_llm_parsing and config.openrouter_api_key and episodes:
            rows = await conn.fetch(
                "SELECT id, title FROM episodes WHERE parsed_title IS NULL ORDER BY episode_number"
            )
            to_parse = [(r["id"], r["title"]) for r in rows]

            async with httpx.AsyncClient(timeout=60.0) as client:
                for i in range(0, len(to_parse), BATCH_SIZE):
                    batch = to_parse[i : i + BATCH_SIZE]
                    ids = [b[0] for b in batch]
                    titles = [b[1] for b in batch]
                    print(f"[INFO] Parsing episode titles {i + 1}-{i + len(batch)} of {len(to_parse)} via LLM")
                    parsed = await parse_titles(titles, config, client)
                    for ep_id, parsed_data in zip(ids, parsed):
                        if parsed_data:
                            await conn.execute(
                                "UPDATE episodes SET parsed_title = $1 WHERE id = $2",
                                json.dumps(parsed_data),
                                ep_id,
                            )

        after = await conn.fetchval("SELECT COUNT(*) FROM episodes")

    return {"success": True, "total": after, "added": after - before, "synced": len(episodes)}


# ---------------------------------------------------------------------------
# Static frontend serving (SPA fallback)
# ---------------------------------------------------------------------------

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """Serve the React SPA for any non-API route."""
    if full_path.startswith("api/"):
        raise HTTPException(404, "Not found")

    # Try to serve a static file first
    file_path = FRONTEND_DIST / full_path
    if full_path and file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))

    # Fallback to index.html for SPA routing
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text())

    return HTMLResponse(
        "<h1>HRR-Bee</h1><p>Frontend not built. Run: cd frontend && npm run build</p>",
        status_code=200,
    )
