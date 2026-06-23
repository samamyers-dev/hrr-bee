"""Database connection pool and migration runner."""
import os
import asyncio
from pathlib import Path

import asyncpg

_pool: asyncpg.Pool | None = None


async def create_pool(database_url: str) -> asyncpg.Pool | None:
    """Create a connection pool. Returns None if no DATABASE_URL."""
    if not database_url:
        return None
    global _pool
    _pool = await asyncpg.create_pool(
        database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    return _pool


def get_pool() -> asyncpg.Pool | None:
    return _pool


async def run_migrations(pool: asyncpg.Pool) -> None:
    """Run all .sql files in migrations/ directory in order."""
    mig_dir = Path(__file__).parent.parent / "migrations"
    if not mig_dir.exists():
        print("[WARN] migrations/ directory not found")
        return

    files = sorted(f for f in mig_dir.iterdir() if f.suffix == ".sql")
    print(f"[INFO] Running {len(files)} migrations...")

    for f in files:
        sql = f.read_text()
        async with pool.acquire() as conn:
            for stmt in sql.split(";"):
                stmt = stmt.strip()
                if not stmt:
                    continue
                try:
                    await conn.execute(stmt)
                except Exception as e:
                    msg = str(e)
                    if "already exists" not in msg and "duplicate" not in msg.lower():
                        print(f"[ERROR] Migration {f.name}: {e}")
                        raise
    print("[INFO] Migrations complete")
