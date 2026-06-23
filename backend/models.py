"""Pydantic models for API request/response."""
from __future__ import annotations

from pydantic import BaseModel


class Episode(BaseModel):
    id: str
    title: str
    episode_number: int | None = None
    description: str | None = None
    pub_date: int
    audio_url: str
    duration: int | None = None
    play_state: str = "unplayed"
    last_position: int = 0
    image_url: str | None = None


class ProgressUpdate(BaseModel):
    id: str
    play_state: str
    last_position: int | None = 0


class PlaybackReport(BaseModel):
    episode_id: str
    position_seconds: int = 0
    playback_speed: float = 1.0


class PreferenceUpdate(BaseModel):
    key: str
    value: str


class BulkUpdate(BaseModel):
    mode: str = "episode"  # "episode", "date", or "all-previous"
    play_state: str
    start_episode: int | None = None
    end_episode: int | None = None
    start_date: str | None = None
    end_date: str | None = None
    reference_date: str | None = None  # YYYY-MM-DD anchor for "all-previous"


class MetaOptions(BaseModel):
    min_episode_number: int = 1
    max_episode_number: int = 1
    years: list[str] = []
