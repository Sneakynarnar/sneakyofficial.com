"""Shared in-memory overlay/ribbon settings, mutated by the web API and read by the Twitch bot."""

# Private battle rotation used on stream: one game of each mode, then the lobby
# is remade and the rotation starts again.
PRIVATE_ROTATION: list[str] = [
    "turf_war",
    "splat_zones",
    "tower_control",
    "rainmaker",
    "clam_blitz",
]

_settings: dict = {
    "ribbon_mode": "active",
    "open_lobby_match_type": "open_battle",
    # Anarchy Open runs one mode across both maps, so the mode is shared
    "open_lobby_mode_id": None,
    "open_lobby_mode_name": None,
    "open_lobby_stage": None,
    "open_lobby_stage_2": None,
    "open_lobby_room_code": None,
    # Pool tag viewers type in-game to find the room
    "lobby_pool": "sneakyn",
    # Private battle rotation position (index into PRIVATE_ROTATION)
    "private_rotation_index": 0,
}


def get() -> dict:
    return _settings


def update(data: dict) -> None:
    _settings.update(data)


def rotation_index() -> int:
    """Current position in the private battle rotation, always in range."""
    return int(_settings.get("private_rotation_index") or 0) % len(PRIVATE_ROTATION)


def set_rotation_index(index: int) -> int:
    """Set the rotation position, wrapping around the mode list."""
    _settings["private_rotation_index"] = index % len(PRIVATE_ROTATION)
    return _settings["private_rotation_index"]


def advance_rotation(step: int = 1) -> int:
    """Move the rotation on by ``step`` games (negative steps go back)."""
    return set_rotation_index(rotation_index() + step)


def snapshot() -> dict:
    """Settings plus the derived private-rotation fields the overlays read."""
    data = dict(_settings)
    index = rotation_index()
    data["private_rotation"] = list(PRIVATE_ROTATION)
    data["private_rotation_index"] = index
    data["private_rotation_mode_id"] = PRIVATE_ROTATION[index]
    data["private_games_until_reset"] = len(PRIVATE_ROTATION) - index
    return data
