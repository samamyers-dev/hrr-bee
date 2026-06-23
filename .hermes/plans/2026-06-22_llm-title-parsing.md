# Integrate Cheap LLM Title Parsing for Better Organization

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enrich each episode with structured metadata parsed from episode titles using a cheap LLM, then expose that metadata for search/filter/sort in HRR-Bee.

**Architecture:** Add a new `parsed_title` column (JSONB) to `episodes`. During RSS sync, after the existing feed parse, send each episode title (in batches) to a cheap LLM via the OpenRouter API with a tiny structured-output prompt asking for title, riddle_theme, guest_names, format, and is_bonus. Store the JSON result. Extend API list/meta endpoints and the frontend filters/search to use these new fields.

**Tech Stack:** Python/FastAPI/asyncpg (backend), React/TypeScript/Vite (frontend), OpenRouter API with `google/gemini-2.5-flash-lite` (cheap, fast, JSON mode), `httpx` for HTTP.

**Estimated Cost:** Gemini 2.5 Flash-Lite is ~$0.10/1M input tokens and ~$0.40/1M output tokens. A 50-character title with 200-token prompt + 100-token structured output costs roughly `250/1M * $0.10 + 100/1M * $0.40 = $0.000065` per episode. For 1,000 episodes ≈ $0.065 per full sync. Subsequent syncs use the existing metadata unless titles change.

---

## Background / Current State

- Episodes are synced from a Patreon RSS feed in `backend/rss.py::fetch_and_parse(url)`.
- Sync endpoint is `backend/main.py::sync_feed` at `POST /api/admin/sync`.
- Episode schema is in `migrations/001_episodes.sql` and `backend/models.py`.
- Episode list/filter/sort is in `backend/main.py::list_episodes` and `frontend/src/components/EpisodeList.tsx`.
- API client types are in `frontend/src/api/client.ts`.
- Config is in `backend/config.py`. No LLM provider key currently loaded.
- `backend/requirements.txt` already includes `httpx==0.28.1`.

---

## Task 1: Add `parsed_title` JSONB column to episodes table

**Objective:** Persist structured LLM output per episode.

**Files:**
- Create: `migrations/004_parsed_title.sql`

**Step 1: Write migration**

```sql
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS parsed_title JSONB;
CREATE INDEX IF NOT EXISTS idx_episodes_parsed_title ON episodes USING GIN(parsed_title);
```

**Step 2: Verify migration file exists**

Run: `ls -la migrations/004_parsed_title.sql`
Expected: file exists with content above.

**Step 3: Commit**

```bash
git add migrations/004_parsed_title.sql
git commit -m "feat(db): add parsed_title JSONB column to episodes"
```

---

## Task 2: Add LLM config and client

**Objective:** Load OpenRouter key/model and add a reusable async JSON-mode LLM client.

**Files:**
- Modify: `backend/config.py`
- Create: `backend/llm.py`

**Step 1: Update Config dataclass**

Add fields after `patreon_rss_url`:

```python
    openrouter_api_key: str = ""
    llm_model: str = "google/gemini-2.5-flash-lite"
    enable_llm_parsing: bool = False
```

And populate in `from_env`:

```python
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
            llm_model=os.environ.get("LLM_MODEL", "google/gemini-2.5-flash-lite").strip(),
            enable_llm_parsing=os.environ.get("ENABLE_LLM_PARSING", "false").strip().lower() == "true",
```

**Step 2: Create backend/llm.py**

```python
"""Cheap LLM client for parsing episode titles via OpenRouter."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .config import Config

SYSTEM_PROMPT = """You parse Hey Riddle Riddle podcast episode titles into structured JSON.

Rules:
- title: clean display title (remove episode number prefix like "#123:")
- riddle_theme: one short theme describing the episode's riddle topic, or null if unclear
- guest_names: list of guest names if present, else empty list
- format: one of "main", "bonus", "live", "patron-exclusive", "other"
- is_bonus: true if format is "bonus" or title contains "Bonus", "Bonusode", "Mini", or "Patreon Exclusive"

Respond with ONLY valid JSON matching this schema:
{
  "title": string,
  "riddle_theme": string | null,
  "guest_names": string[],
  "format": "main" | "bonus" | "live" | "patron-exclusive" | "other",
  "is_bonus": boolean
}
"""


def _build_user_message(title: str) -> str:
    return f"Parse this episode title into JSON: {title}"


async def parse_titles(
    titles: list[str],
    config: Config,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any] | None]:
    """Parse a batch of episode titles. Returns list aligned with input titles.

    None is returned for any title that could not be parsed.
    """
    if not config.enable_llm_parsing or not config.openrouter_api_key:
        return [None] * len(titles)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Parse each episode title on a new line into valid JSON objects. "
                "Return a JSON array of objects in the same order.\n\n"
                + "\n".join(titles)
            ),
        },
    ]

    payload = {
        "model": config.llm_model,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {config.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hrr-bee.local",
        "X-Title": "HRR-Bee",
    }

    close_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=60.0)

    try:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        results: list[dict[str, Any] | None]
        if isinstance(parsed, list):
            results = [(_normalize_result(item) if isinstance(item, dict) else None) for item in parsed]
        elif isinstance(parsed, dict) and "episodes" in parsed:
            results = [(_normalize_result(item) if isinstance(item, dict) else None) for item in parsed["episodes"]]
        else:
            results = [None] * len(titles)

        # Ensure length alignment
        if len(results) < len(titles):
            results.extend([None] * (len(titles) - len(results)))
        elif len(results) > len(titles):
            results = results[: len(titles)]
        return results
    except Exception as e:
        print(f"[WARN] LLM title parse failed: {e}")
        return [None] * len(titles)
    finally:
        if close_client:
            await client.aclose()


async def parse_title(title: str, config: Config, client: httpx.AsyncClient | None = None) -> dict[str, Any] | None:
    """Parse a single episode title."""
    results = await parse_titles([title], config, client)
    return results[0]


def _normalize_result(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": str(item.get("title", "")).strip() or None,
        "riddle_theme": str(item.get("riddle_theme", "")).strip() or None if item.get("riddle_theme") is not None else None,
        "guest_names": [str(g).strip() for g in item.get("guest_names", []) if str(g).strip()],
        "format": item.get("format", "other") if item.get("format") in {"main", "bonus", "live", "patron-exclusive", "other"} else "other",
        "is_bonus": bool(item.get("is_bonus", False)),
    }
```

**Step 3: Add type hint for config in main.py import**

No change needed now; import will be added in Task 4.

**Step 4: Run backend syntax check**

Run: `cd /home/samathaen/hrr-bee && python3 -m py_compile backend/config.py backend/llm.py`
Expected: no output (success).

**Step 5: Commit**

```bash
git add backend/config.py backend/llm.py
git commit -m "feat(llm): add OpenRouter config and async title parser"
```

---

## Task 3: Unit test for LLM title parser

**Objective:** Ensure parsing normalization works offline without an API key.

**Files:**
- Create: `backend/tests/test_llm.py`

**Step 1: Create test file**

```python
import json
from backend.llm import _normalize_result, parse_titles
from backend.config import Config


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


class FakeClient:
    def __init__(self, response_payload):
        self._response_payload = response_payload

    async def post(self, *args, **kwargs):
        return FakeResponse(self._response_payload)

    async def aclose(self):
        pass


def test_normalize_result_defaults():
    assert _normalize_result({}) == {
        "title": None,
        "riddle_theme": None,
        "guest_names": [],
        "format": "other",
        "is_bonus": False,
    }


def test_normalize_result_complete():
    item = {
        "title": "The Clockwork Riddle",
        "riddle_theme": "clockwork",
        "guest_names": [" Alex ", "  "],
        "format": "bonus",
        "is_bonus": True,
    }
    assert _normalize_result(item) == {
        "title": "The Clockwork Riddle",
        "riddle_theme": "clockwork",
        "guest_names": ["Alex"],
        "format": "bonus",
        "is_bonus": True,
    }


async def test_parse_titles_list_response():
    config = Config(openrouter_api_key="fake", enable_llm_parsing=True)
    payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps([
                        {"title": "A", "riddle_theme": "x", "guest_names": [], "format": "main", "is_bonus": False},
                        {"title": "B", "format": "bonus"},
                    ])
                }
            }
        ]
    }
    client = FakeClient(payload)
    results = await parse_titles(["raw A", "raw B"], config, client)
    assert results[0]["title"] == "A"
    assert results[0]["format"] == "main"
    assert results[1]["title"] == "B"
    assert results[1]["format"] == "bonus"


async def test_parse_titles_disabled():
    config = Config(enable_llm_parsing=False)
    results = await parse_titles(["whatever"], config)
    assert results == [None]
```

**Step 2: Run tests**

Run: `cd /home/samathaen/hrr-bee && python3 -m pytest backend/tests/test_llm.py -v`
Expected: 4 passed.

If pytest is missing, install it:
Run: `cd /home/samathaen/hrr-bee && . .venv/bin/activate && pip install pytest`

**Step 3: Commit**

```bash
git add backend/tests/test_llm.py
git commit -m "test(llm): add title parser normalization tests"
```

---

## Task 4: Wire LLM parsing into RSS sync

**Objective:** During admin sync, batch-parse new episode titles and store `parsed_title`.

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/rss.py` (optional helper if needed)

**Step 1: Add imports in backend/main.py**

Add to existing imports at top:

```python
import httpx
from .llm import parse_titles
```

**Step 2: Modify sync_feed in backend/main.py**

Replace the inner `for ep in episodes:` insert loop with LLM-enhanced version:

```python
    # Build batches of episodes needing parsing
    BATCH_SIZE = 20

    async with pool.acquire() as conn:
        before = await conn.fetchval("SELECT COUNT(*) FROM episodes")

        # Insert/update episode rows first (without parsed_title)
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

        # If LLM parsing enabled, enrich rows that lack parsed_title or whose title changed
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
```

Also ensure `json` is imported at the top of `main.py` (it already is).

**Step 3: Verify sync endpoint compiles**

Run: `cd /home/samathaen/hrr-bee && python3 -m py_compile backend/main.py`
Expected: no output.

**Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat(sync): batch-parse episode titles via cheap LLM during RSS sync"
```

---

## Task 5: Expose parsed_title through API

**Objective:** Frontend can read parsed metadata and use it for filtering/search.

**Files:**
- Modify: `backend/main.py` (`_row_to_episode` and `list_episodes`)

**Step 1: Update _row_to_episode**

Add to returned dict:

```python
        "parsed_title": row["parsed_title"] if row["parsed_title"] else None,
```

**Step 2: Extend search/filter in list_episodes**

Currently `search` checks `title ILIKE`. Also search inside `parsed_title->>'title'`, `parsed_title->>'riddle_theme'`, and `parsed_title->'guest_names'`.

Change the search block to:

```python
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
```

**Step 3: Add filter by format**

Add `format` query param to `list_episodes` signature:

```python
@app.get("/api/episodes")
async def list_episodes(
    request: Request,
    sort: str = "unplayed-first",
    filter: str = "all",
    format: str = "all",
    search: str = "",
    range: str = "all",
):
```

Add filter block after play_state filter:

```python
    if format != "all":
        params.append(format)
        where_parts.append(f"parsed_title->>'format' = ${len(params)}")
```

**Step 4: Update meta-options endpoint to return formats**

Modify `/api/episodes/meta-options` to include distinct formats:

```python
        format_rows = await conn.fetch(
            "SELECT DISTINCT parsed_title->>'format' as format FROM episodes WHERE parsed_title->>'format' IS NOT NULL ORDER BY format"
        )
        formats = [r["format"] for r in format_rows]

    return {"minEpisodeNumber": min_ep, "maxEpisodeNumber": max_ep, "years": years, "formats": formats}
```

**Step 5: Verify compilation**

Run: `cd /home/samathaen/hrr-bee && python3 -m py_compile backend/main.py`
Expected: no output.

**Step 6: Commit**

```bash
git add backend/main.py
ngit commit -m "feat(api): expose parsed_title in episodes and support format filter/search"
```

---

## Task 6: Update frontend types and UI for parsed metadata

**Objective:** Display parsed themes/guests/formats and add format filter.

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/EpisodeList.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Extend Episode and MetaOptions types**

In `frontend/src/api/client.ts`:

```typescript
export interface ParsedTitle {
  title: string | null;
  riddle_theme: string | null;
  guest_names: string[];
  format: 'main' | 'bonus' | 'live' | 'patron-exclusive' | 'other';
  is_bonus: boolean;
}

export interface Episode {
  id: string;
  title: string;
  episode_number: number | null;
  description: string | null;
  pub_date: number;
  audio_url: string;
  duration: number | null;
  play_state: 'unplayed' | 'in-progress' | 'played';
  last_position: number;
  image_url: string | null;
  parsed_title: ParsedTitle | null;
}

export interface MetaOptions {
  minEpisodeNumber: number;
  maxEpisodeNumber: number;
  years: string[];
  formats: string[];
}
```

Add `FormatOption` type:

```typescript
export type FormatOption = 'all' | ParsedTitle['format'];
```

**Step 2: Extend episodes.list params**

In `api.episodes.list`, add format param:

```typescript
    list: (params: Record<string, string>) =>
      request<Episode[]>(`/api/episodes?${new URLSearchParams(params)}`),
```

No code change needed — it already passes arbitrary params.

**Step 3: Add format filter UI in EpisodeList.tsx**

Update Props:

```typescript
interface Props {
  episodes: Episode[];
  sort: SortOption;
  setSort: (s: SortOption) => void;
  filter: FilterOption;
  setFilter: (f: FilterOption) => void;
  format: FormatOption;
  setFormat: (f: FormatOption) => void;
  formats: string[];
  search: string;
  setSearch: (s: string) => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onPlay: (ep: Episode) => void;
  currentPlayingId: string | null;
  isPlaying: boolean;
}
```

Update component signature and add format chip group after FILTER group:

```typescript
export function EpisodeList({
  episodes,
  sort,
  setSort,
  filter,
  setFilter,
  format,
  setFormat,
  formats,
  search,
  setSearch,
  onRefresh,
  onOpen,
  onPlay,
  currentPlayingId,
  isPlaying,
}: Props) {
```

Add format filter group:

```tsx
          <div className="filter-group">
            <label className="filter-label">FORMAT</label>
            <div className="filter-chips">
              {(
                [
                  ['all', 'ALL'],
                  ['main', 'MAIN'],
                  ['bonus', 'BONUS'],
                  ['live', 'LIVE'],
                  ['patron-exclusive', 'PATRON'],
                ] as [FormatOption, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  className={`chip ${format === val ? 'active' : ''}`}
                  onClick={() => setFormat(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
```

**Step 4: Display metadata in episode card**

In the episode card render, add after `ep-card-title`:

```tsx
                  {ep.parsed_title?.riddle_theme && (
                    <span className="ep-theme">{ep.parsed_title.riddle_theme}</span>
                  )}
                  {ep.parsed_title?.guest_names.length > 0 && (
                    <span className="ep-guests">
                      w/ {ep.parsed_title.guest_names.join(', ')}
                    </span>
                  )}
```

Update stats line to show bonus count if format filter not active (optional, leave out to keep YAGNI).

**Step 5: Wire format state in App.tsx**

Add state:

```typescript
  const [format, setFormat] = useState<FormatOption>('all');
```

Update fetchEps dependency and params:

```typescript
  const fetchEps = useCallback(async () => {
    const p: Record<string, string> = { sort, filter };
    if (format !== 'all') p.format = format;
    if (search) p.search = search;
    try {
      setEpisodes(await api.episodes.list(p));
    } catch {
      // ignore
    }
  }, [sort, filter, format, search]);
```

Update EpisodeList props and SettingsSheet (if you want format there too, optional). Keep filter panel in EpisodeList.

**Step 6: Build frontend**

Run: `cd /home/samathaen/hrr-bee/frontend && npm run build`
Expected: build succeeds with no TS errors.

**Step 7: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/EpisodeList.tsx frontend/src/App.tsx frontend/dist/
git commit -m "feat(ui): add format filter and display parsed title metadata"
```

---

## Task 7: Update Dockerfile / Railway docs and env example

**Objective:** New env vars are discoverable for deploy.

**Files:**
- Modify: `README.md`

**Step 1: Add env vars to Railway deployment section**

Add under environment variables list:

```markdown
   - `OPENROUTER_API_KEY` (optional — needed for LLM title enrichment)
   - `LLM_MODEL` (optional — default `google/gemini-2.5-flash-lite`)
   - `ENABLE_LLM_PARSING` (optional — set `true` to enable; default `false`)
```

**Step 2: Add cost note in README**

Add a short paragraph after the env vars:

```markdown
### LLM Title Parsing

Set `ENABLE_LLM_PARSING=true` and provide an `OPENROUTER_API_KEY` to enrich episodes with structured metadata during RSS sync. The default model `google/gemini-2.5-flash-lite` costs roughly $0.10/1M input tokens and $0.40/1M output tokens — typically a few cents for hundreds of episodes.
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document LLM parsing env vars and costs"
```

---

## Task 8: Manual integration verification

**Objective:** Confirm the whole flow works in local dev.

**Step 1: Run backend tests**

Run: `cd /home/samathaen/hrr-bee && . .venv/bin/activate && python3 -m pytest backend/tests/ -v`
Expected: all tests pass.

**Step 2: Start backend with DATABASE_URL set**

Assuming local Postgres exists, set env and run:

```bash
cd /home/samathaen/hrr-bee
source .venv/bin/activate
DATABASE_URL=postgresql://user:pass@localhost:5432/hrrbee uvicorn backend.main:app --reload --port 8080
```

If no local Postgres is available, use Railway remote DATABASE_URL.

**Step 3: Run admin sync without LLM**

Hit: `POST http://localhost:8080/api/admin/sync`
Expected: episodes sync normally, `parsed_title` remains NULL, response includes synced count.

**Step 4: Enable LLM sync**

Set `OPENROUTER_API_KEY=<your-key> ENABLE_LLM_PARSING=true`, restart, and hit sync again.
Expected: logs show `Parsing episode titles ... via LLM`, and `/api/episodes` returns `parsed_title` fields.

**Step 5: Verify frontend format filter**

Open `http://localhost:8080`, open filter panel, choose BONUS / MAIN, confirm list filters.

**Step 6: Verify search on metadata**

Search for a theme or guest name known to exist in `parsed_title`. Confirm matching episodes appear.

**Step 7: Commit any final changes**

```bash
git status
# commit if anything changed
git commit -m "verify: LLM title parsing integration tested locally"
```

---

## Risks, Trade-offs, and Open Questions

| Risk | Mitigation |
|------|------------|
| LLM API failures block sync partially | Parser returns None per batch; sync still succeeds. |
| Rate limits on OpenRouter free/cheap tier | Use batch size 20; add delay/backoff if needed. |
| Cost spikes on large back catalogs | Only parse episodes with `parsed_title IS NULL`; future syncs are incremental. |
| JSON parsing drift from model | `_normalize_result` coerces unknown values to safe defaults. |
| Sync slows down with many episodes | Synchronous during sync; acceptable for backlog size of hundreds. If thousands, consider background task. |

**Open questions:**

1. Should we expose a manual "Re-parse all titles" admin button? (Not in this plan; add later if needed.)
2. Should `parsed_title->>'title'` replace the raw title in the UI? For now display raw title plus metadata.
3. Should we cache failed titles to avoid repeated LLM cost? Skipped — re-sync cost is tiny.

---

## File Checklist

- [ ] `migrations/004_parsed_title.sql`
- [ ] `backend/config.py`
- [ ] `backend/llm.py`
- [ ] `backend/tests/test_llm.py`
- [ ] `backend/main.py`
- [ ] `frontend/src/api/client.ts`
- [ ] `frontend/src/components/EpisodeList.tsx`
- [ ] `frontend/src/App.tsx`
- [ ] `frontend/dist/` (rebuilt)
- [ ] `README.md`

---

*Plan generated for HRR-Bee LLM title parsing integration.*
