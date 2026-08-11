"""In-memory presence tracking for the Splatdle page.

The page sends a heartbeat while it is open, so the admin portal can show how
many people are actually playing right now. Anonymous players count too, which
is why this is keyed on a browser-generated session id rather than a Discord id.

State is deliberately in-memory: it is a live gauge, not history, and a restart
losing it costs nothing.
"""
import time
from datetime import date, datetime, timezone

# A session counts as "playing now" this long after its last heartbeat. The page
# beats every 30s, so this tolerates one missed beat.
ACTIVE_WINDOW_SECONDS = 75

_sessions: dict[str, float] = {}
_seen_today: set[str] = set()
_peak_today: int = 0
_peak_at: float | None = None
_today: date = datetime.now(timezone.utc).date()


def _roll_day_if_needed() -> None:
    """Clear the daily counters when the UTC date changes, matching the game reset."""
    global _today, _seen_today, _peak_today, _peak_at
    today = datetime.now(timezone.utc).date()
    if today != _today:
        _today = today
        _seen_today = set()
        _peak_today = 0
        _peak_at = None


def _prune(now: float) -> None:
    """Drop sessions whose last heartbeat has aged out."""
    cutoff = now - ACTIVE_WINDOW_SECONDS
    for session_id in [s for s, seen in _sessions.items() if seen < cutoff]:
        del _sessions[session_id]


def touch(session_id: str) -> None:
    """Record a heartbeat from a player."""
    global _peak_today, _peak_at
    _roll_day_if_needed()
    now = time.time()
    _sessions[session_id] = now
    _seen_today.add(session_id)
    _prune(now)
    if len(_sessions) > _peak_today:
        _peak_today = len(_sessions)
        _peak_at = now


def stats() -> dict:
    """Current presence figures for the admin portal."""
    _roll_day_if_needed()
    now = time.time()
    _prune(now)
    return {
        "playing_now": len(_sessions),
        "sessions_today": len(_seen_today),
        "peak_today": _peak_today,
        "peak_at": (
            datetime.fromtimestamp(_peak_at, tz=timezone.utc).isoformat()
            if _peak_at else None
        ),
        "active_window_seconds": ACTIVE_WINDOW_SECONDS,
    }
