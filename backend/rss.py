"""RSS feed parser for Patreon podcast feeds.

Uses httpx for async network I/O and feedparser for robust XML parsing,
then maps entries to Episode dicts.
"""
import feedparser
import httpx
from datetime import datetime, timezone
from typing import Any


async def fetch_feed(url: str, timeout: float = 60.0) -> str:
    """Fetch raw RSS/XML content from a URL asynchronously."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        return resp.text


def parse_episode_number(title: str, explicit: str | None) -> int | None:
    if explicit:
        try:
            return int(explicit)
        except ValueError:
            pass
    title = title.strip()
    if title.startswith("#"):
        rest = title[1:]
        if ":" in rest:
            num_str = rest.split(":")[0].strip()
            try:
                return int(num_str)
            except ValueError:
                pass
    if ":" in title:
        num_str = title.split(":")[0].strip()
        try:
            return int(num_str)
        except ValueError:
            pass
    return None


def parse_duration(dur: str | None) -> int | None:
    if not dur:
        return None
    parts = dur.split(":")
    try:
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + int(float(s))
        elif len(parts) == 2:
            m, s = parts
            return int(m) * 60 + int(float(s))
        else:
            return int(float(dur))
    except (ValueError, IndexError):
        return None


def parse_date(date_struct: Any) -> int:
    """Convert feedparser's time.struct_time to epoch millis."""
    if date_struct:
        try:
            dt = datetime(*date_struct[:6], tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except (TypeError, ValueError):
            pass
    return 0


def _get_itunes_field(entry: Any, name: str) -> str | None:
    """Return an iTunes-namespaced field value if present.

    feedparser exposes iTunes tags both as attributes (entry.itunes_duration)
    and, in some builds, inside the generic tags list with an itunes_ label.
    """
    # Preferred: direct attribute exposed by feedparser
    value = getattr(entry, f"itunes_{name}", None)
    if value:
        return str(value)

    # Fallback: scan tags list for label like "itunes_duration"
    for tag in entry.get("tags", []):
        if tag.get("label") == f"itunes_{name}":
            return tag.get("term")

    return None


def parse_feed(content: str) -> list[dict[str, Any]]:
    """Parse RSS/XML content and return a list of episode dicts."""
    feed = feedparser.parse(content)

    if feed.bozo and not feed.entries:
        raise RuntimeError(f"RSS parse error: {feed.bozo_exception}")

    episodes: list[dict[str, Any]] = []

    for entry in feed.entries:
        guid = entry.get("id") or entry.get("link")
        title = entry.get("title", "")

        # Find audio enclosure
        audio_url = ""
        for link in entry.get("links", []):
            if link.get("type", "").startswith("audio"):
                audio_url = link.get("href", "")
                break
        if not audio_url and "enclosures" in entry:
            for enc in entry["enclosures"]:
                if enc.get("type", "").startswith("audio"):
                    audio_url = enc.get("href", "")
                    break

        if not audio_url:
            continue

        pub_date = parse_date(entry.get("published_parsed"))

        # iTunes namespace fields
        itunes_episode = _get_itunes_field(entry, "episode")
        itunes_duration = _get_itunes_field(entry, "duration")
        image_url = _get_itunes_field(entry, "image")

        episode_number = parse_episode_number(title, itunes_episode)
        duration = parse_duration(itunes_duration)

        # Description: prefer content, then summary. Guard against empty content list.
        content_list = entry.get("content") or []
        description = ""
        if content_list:
            description = content_list[0].get("value", "")
        if not description:
            description = entry.get("summary", "")

        if guid:
            episodes.append({
                "id": guid,
                "title": title,
                "episode_number": episode_number,
                "description": description,
                "pub_date": pub_date,
                "audio_url": audio_url,
                "duration": duration,
                "image_url": image_url,
            })

    return episodes


async def fetch_and_parse(url: str) -> list[dict[str, Any]]:
    """Fetch and parse an RSS feed asynchronously, returning list of episode dicts."""
    print(f"[INFO] Fetching RSS feed: {url}")
    content = await fetch_feed(url)
    episodes = parse_feed(content)
    print(f"[INFO] RSS parsed {len(episodes)} entries")
    return episodes
