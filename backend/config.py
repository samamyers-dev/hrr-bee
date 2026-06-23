"""Configuration loaded from environment variables."""
import os
from dataclasses import dataclass, field


@dataclass
class Config:
    port: int = 8080
    database_url: str = ""
    session_secret: str = "default-insecure-session-secret-change-me!!"
    app_password: str = ""
    patreon_rss_url: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        port = int(os.environ.get("PORT", "8080"))
        database_url = os.environ.get("DATABASE_URL", "").strip()
        if not database_url:
            print("[WARN] DATABASE_URL not set — running in frontend-only mode")
        session_secret = os.environ.get("SESSION_SECRET", "")
        if len(session_secret) < 32:
            print("[WARN] SESSION_SECRET is less than 32 chars — sessions may be insecure")
        return cls(
            port=port,
            database_url=database_url,
            session_secret=session_secret or cls.session_secret,
            app_password=os.environ.get("APP_PASSWORD", "").strip(),
            patreon_rss_url=os.environ.get("PATREON_RSS_URL", "").strip(),
        )
