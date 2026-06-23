"""RSS feed parser for Patreon podcast feeds.

Uses feedparser for robust XML parsing, then maps entries to Episode dicts.
"""
import feedparser
from datetime import datetime, timezone
from typing import Any


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


def fetch_and_parse(url: str) -> list[dict[str, Any]]:
    """Fetch and parse an RSS feed, returning list of episode dicts."""
    print(f"[INFO] Fetching RSS feed: {url}")
    feed = feedparser.parse(url)

    if feed.bozo and not feed.entries:
        raise RuntimeError(f"RSS parse error: {feed.bozo_exception}")

    print(f"[INFO] RSS parsed {len(feed.entries)} entries")

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
        itunes_episode = None
        itunes_duration = None
        image_url = None

        for tag in entry.get("tags", []):
            term = tag.get("term", "")
            label = tag.get("label", "")
            if label == "itunes_episode":
                itunes_episode = term
            elif label == "itunes_duration":
                itunes_duration = term
            elif label == "itunes_image":
                image_url = term

        episode_number = parse_episode_number(title, itunes_episode)
        duration = parse_duration(itunes_duration)

        # Description: prefer content, then summary
        description = entry.get("content", [{}])[0].get("value", "") if entry.get("content") else ""
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
