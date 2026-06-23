"""Cheap LLM client for parsing episode titles via OpenRouter."""
from __future__ import annotations

import json
from typing import Any

import httpx

from .config import Config

SYSTEM_PROMPT = """You parse Hey Riddle Riddle podcast episode titles into structured JSON.

The episodes come from a Patreon private RSS feed. Patreon feeds usually contain:
- ad-free/pristine versions of the main numbered episodes -> format "ad-free"
- main feed episodes that still have ads -> format "main" (only if you are sure it is the public ad-supported version)
- bonus/minisodes/exclusive Patreon-only content -> format "bonus" or "patreon-exclusive"
- live show recordings -> format "live"

Rules:
- title: clean display title (remove episode number prefix like "#123:")
- riddle_theme: one short theme describing the episode's riddle topic, or null if unclear
- guest_names: list of guest names if present, else empty list
- format: one of "main", "ad-free", "bonus", "live", "patreon-exclusive", "other"
  - Use "ad-free" for ordinary numbered Hey Riddle Riddle episodes in a Patreon feed (they are usually ad-free there).
  - Use "main" only if you are certain the episode is the public ad-supported main feed version.
  - Use "bonus" for bonus episodes, minisodes, etc.
  - Use "patreon-exclusive" for episodes only available on Patreon (not part of the main numbered series).
  - Use "live" for live recordings.
  - Use "other" only if none of the above fit.
- is_bonus: true if title contains "Bonus", "Bonusode", "Mini", "Patreon Exclusive", or format is "bonus"

Respond with ONLY valid JSON matching this schema:
{
  "title": string,
  "riddle_theme": string | null,
  "guest_names": string[],
  "format": "main" | "ad-free" | "bonus" | "live" | "patreon-exclusive" | "other",
  "is_bonus": boolean
}
"""


def _normalize_result(item: dict[str, Any]) -> dict[str, Any]:
    """Coerce LLM output to a well-formed parsed_title record."""
    guest_names = []
    raw_guests = item.get("guest_names")
    if isinstance(raw_guests, list):
        guest_names = [str(g).strip() for g in raw_guests if str(g).strip()]

    raw_format = item.get("format", "other")
    if raw_format not in {"main", "ad-free", "bonus", "live", "patreon-exclusive", "other"}:
        raw_format = "other"

    riddle_theme = item.get("riddle_theme")
    if riddle_theme is not None:
        riddle_theme = str(riddle_theme).strip() or None

    title = item.get("title")
    if title is not None:
        title = str(title).strip() or None

    return {
        "title": title,
        "riddle_theme": riddle_theme,
        "guest_names": guest_names,
        "format": raw_format,
        "is_bonus": bool(item.get("is_bonus", False)),
    }


async def parse_titles(
    titles: list[str],
    config: Config,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any] | None]:
    """Parse a batch of episode titles. Returns a list aligned with input titles.

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
