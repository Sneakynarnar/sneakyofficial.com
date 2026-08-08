"""Shared in-memory overlay/ribbon settings, mutated by the web API and read by the Twitch bot."""

_settings: dict = {
    "ribbon_mode": "active",
    "open_lobby_match_type": "open_battle",
    # Map slot 1
    "open_lobby_stage": None,
    "open_lobby_mode_id": None,
    "open_lobby_mode_name": None,
    # Map slot 2 (open battle only)
    "open_lobby_stage_2": None,
    "open_lobby_mode_id_2": None,
    "open_lobby_mode_name_2": None,
    "open_lobby_room_code": None,
    # Pool tag viewers type in-game to find the room
    "lobby_pool": "sneakyn",
}


def get() -> dict:
    return _settings


def update(data: dict) -> None:
    _settings.update(data)
