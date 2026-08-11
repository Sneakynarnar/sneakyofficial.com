"""Persistent Splatdle activity history.

The live gauge in ``util.splatdle_presence`` answers "who is on right now" but
keeps nothing, so it cannot answer "how many people played last month". Two
small tables cover that:

``SplatdleVisits``   one row per visitor per day, including anonymous players.
``SplatdlePlays``    one row per completed daily game by a logged in player.

Visitors are identified by a random id the browser keeps in localStorage. It is
not a person and not a login: the same human on a phone and a laptop counts
twice, and clearing site data starts a new id. That is accurate enough for
traffic trends and stores nothing identifying.
"""
import logging
from datetime import datetime, timezone

from ..util.database_context_manager import DBContextManager

logger = logging.getLogger("Splatdle")

_tables_ready = False


async def ensure_tables() -> None:
    """Create the history tables if they are not there yet."""
    global _tables_ready
    if _tables_ready:
        return
    async with DBContextManager() as cur:
        await cur.execute("""
            CREATE TABLE IF NOT EXISTS SplatdleVisits (
              visitor_id VARCHAR(64) NOT NULL,
              visit_date DATE NOT NULL,
              first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (visitor_id, visit_date),
              INDEX idx_visit_date (visit_date)
            )
        """)
        await cur.execute("""
            CREATE TABLE IF NOT EXISTS SplatdlePlays (
              id INT AUTO_INCREMENT PRIMARY KEY,
              discord_id BIGINT NOT NULL,
              guess_count INT NOT NULL,
              played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              play_date DATE NOT NULL,
              UNIQUE KEY uq_player_day (discord_id, play_date),
              INDEX idx_play_date (play_date)
            )
        """)
    _tables_ready = True
    logger.info("Splatdle history tables ready")


async def record_visit(visitor_id: str) -> None:
    """Note that this visitor was on the game today. Repeat calls are no-ops."""
    today = datetime.now(timezone.utc).date()
    try:
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                "INSERT IGNORE INTO SplatdleVisits (visitor_id, visit_date) VALUES (%s, %s)",
                (visitor_id, today),
            )
    except Exception:
        logger.exception("Failed to record Splatdle visit")


async def record_play(discord_id: int, guess_count: int) -> None:
    """Note a completed daily game. One row per player per day."""
    today = datetime.now(timezone.utc).date()
    try:
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                """
                INSERT INTO SplatdlePlays (discord_id, guess_count, play_date)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE guess_count = VALUES(guess_count)
                """,
                (discord_id, guess_count, today),
            )
    except Exception:
        logger.exception("Failed to record Splatdle play")


async def summary(days: int = 30) -> dict:
    """Visitor and completion totals over a window, plus a per-day series.

    Args:
        days: How many days back to look, today included.
    """
    await ensure_tables()
    async with DBContextManager() as cur:
        await cur.execute(
            """
            SELECT COUNT(DISTINCT visitor_id)
            FROM SplatdleVisits
            WHERE visit_date >= (UTC_DATE() - INTERVAL %s DAY)
            """,
            (days - 1,),
        )
        row = await cur.fetchone()
        unique_visitors = int(row[0]) if row and row[0] else 0

        await cur.execute(
            """
            SELECT COUNT(DISTINCT discord_id), COUNT(*), AVG(guess_count)
            FROM SplatdlePlays
            WHERE play_date >= (UTC_DATE() - INTERVAL %s DAY)
            """,
            (days - 1,),
        )
        row = await cur.fetchone()
        unique_players = int(row[0]) if row and row[0] else 0
        total_plays = int(row[1]) if row and row[1] else 0
        average_guesses = float(row[2]) if row and row[2] else None

        await cur.execute(
            """
            SELECT visit_date, COUNT(DISTINCT visitor_id)
            FROM SplatdleVisits
            WHERE visit_date >= (UTC_DATE() - INTERVAL %s DAY)
            GROUP BY visit_date
            ORDER BY visit_date
            """,
            (days - 1,),
        )
        visits_by_day = {str(r[0]): int(r[1]) for r in await cur.fetchall()}

        await cur.execute(
            """
            SELECT play_date, COUNT(*)
            FROM SplatdlePlays
            WHERE play_date >= (UTC_DATE() - INTERVAL %s DAY)
            GROUP BY play_date
            ORDER BY play_date
            """,
            (days - 1,),
        )
        plays_by_day = {str(r[0]): int(r[1]) for r in await cur.fetchall()}

    dates = sorted(set(visits_by_day) | set(plays_by_day))
    return {
        "days": days,
        "unique_visitors": unique_visitors,
        "unique_players": unique_players,
        "total_plays": total_plays,
        "average_guesses": average_guesses,
        "series": [
            {
                "date": d,
                "visitors": visits_by_day.get(d, 0),
                "plays": plays_by_day.get(d, 0),
            }
            for d in dates
        ],
    }
