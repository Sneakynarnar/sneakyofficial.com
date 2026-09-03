from aiohttp.web_request import Request
from functools import wraps
import aiohttp
from aiohttp import web
from typing import Any, Callable, Dict, Optional
from .splatdle import Splatdle
from .oauth import DiscordOauthHandler
from ..util.database_context_manager import DBContextManager
from ..util.broadcaster import TournamentBroadcaster
from ..util import overlay_settings as _ov
from ..util import splatdle_presence as _presence
from . import splatdle_history as _history
from ..tournament import TournamentManager
from ..bingo import (BingoManager, REJECT_CATEGORIES, parse_submission,
                     notifier as bingo_notifier)
from ..util.config import global_config
import interactions
import logging
import time

logger = logging.getLogger("API")

# discord_id -> (fetched_at, {username, avatar_url}) for the public leaderboard.
_name_cache: Dict[int, Any] = {}
_NAME_CACHE_TTL = 3600

# An average over one or two games says nothing, and the weighting alone still
# lets a lucky first game near the top. Ranking is for players with a record.
LEADERBOARD_MIN_GAMES = 10


def verify_tournament_admin(func: Callable) -> Callable:
    """Decorator that checks Discord auth and confirms the user is a tournament admin."""
    @wraps(func)
    async def wrapper(self: 'SneakyApi', request: Request, *args: Any, **kwargs: Any) -> Any:
        try:
            access_token = request.cookies.get("discord_access_token")
            if not access_token:
                return web.json_response({"error": "Not authenticated"}, status=401)

            discord_info = await self.dc_token_handler.get_user_info(access_token)
            if not discord_info:
                return web.json_response({"error": "Invalid token"}, status=401)

            user_id = int(discord_info.get("id", 0))
            if user_id not in global_config.tournament_admin_ids:
                return web.json_response({"error": "Forbidden"}, status=403)

            return await func(self, request, user_id, *args, **kwargs)
        except Exception:
            logger.exception("verify_tournament_admin failed for %s %s", request.method, request.path)
            return web.json_response({"error": "Server error"}, status=500)
    return wrapper


def verify_access_token(func: Callable) -> Callable:
    """Decorator to verify Discord access token from request cookies.

    Extracts and validates the Discord access token from request cookies,
    then passes the Discord user ID to the wrapped function.

    Args:
        func: The function to wrap with token verification.

    Returns:
        The wrapped function that includes token verification.
    """
    @wraps(func)
    async def wrapper(self: 'SneakyApi', request: Request, *args: Any, **kwargs: Any) -> Any:
        access_token = request.cookies.get("discord_access_token")
        if not access_token:
            return self.json_response("ACCESS_TOKEN_MISSING", "Access token is missing.", 401)

        discord_info = await self.dc_token_handler.get_user_info(access_token)
        if not discord_info:
            return self.json_response("ACCESS_TOKEN_INVALID", "Discord rejected access token.", 401)
        discord_info["access_token"] = access_token

        return await func(self, request, discord_info.get("id"), *args, **kwargs)
    return wrapper




class SneakyApi:
    """API handler for Sneaky's web application.

    Provides HTTP endpoints for Splatdle game functionality including
    statistics submission and game data retrieval.

    Attributes:
        splatdle: Splatdle game instance.
        dc_token_handler: Discord OAuth handler for authentication.
    """
    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the API handler.

        Args:
            bot: The Discord bot client instance.
        """
        self.splatdle: Splatdle = Splatdle(bot)
        # Bingo review decisions are pushed straight back out to Discord, and
        # the bot shares this process with the webserver.
        self.bot: interactions.Client = bot
        self.dc_token_handler: DiscordOauthHandler = DiscordOauthHandler()

    def json_response(self, code: str, message: str, status: int = 200) -> web.Response:
        """Create a standardized JSON response.

        Args:
            code: Response code identifier.
            message: Human-readable message.
            status: HTTP status code (default: 200).

        Returns:
            JSON response with code and message.
        """
        """Helper method to create JSON responses"""
        return web.json_response({"code": code, "message": message}, status=status)

    @verify_access_token
    async def post_stats(self, request: Request, discord_id: int) -> web.Response:
        """Submit Splatdle game statistics.

        Processes a player's game completion, updates their statistics,
        manages streaks, and adds them to today's leaderboard.

        Args:
            request: The HTTP request containing guess count data.
            discord_id: The Discord user ID (injected by decorator).

        Returns:
            JSON response with updated statistics or error information.
        """
        try:
            data = await request.json()
            guess_count = int(data["guess_count"])
            async with DBContextManager() as cur:
                await cur.execute("""
                    SELECT streak, times_played, average_guess_count, played_today
                    FROM UserStats
                    WHERE discord_id = %s
                    """, (discord_id,))
                row = await cur.fetchone()

                if row:
                    old_streak, old_times_played, old_avg_guess, played_today = row

                    # Check if they already played today
                    if played_today:
                        # Get their existing stats and today's game info
                        await cur.execute("""
                            SELECT guess_count, created_at
                            FROM TodaysLeaderboard
                            WHERE discord_id = %s
                        """, (discord_id,))
                        today_row = await cur.fetchone()

                        # Get global average for comparison
                        await cur.execute("SELECT AVG(average_guess_count) as global_avg FROM UserStats WHERE times_played > 0")
                        global_avg_row = await cur.fetchone()
                        global_avg = float(global_avg_row[0]) if global_avg_row and global_avg_row[0] else 0.0

                        return web.json_response({
                            "status": "already_played",
                            "message": "Stats already posted for today",
                            "playedAt": today_row[1].isoformat() if today_row else None,
                            "todaysGuesses": today_row[0] if today_row else guess_count,
                            "streak": old_streak,
                            "totalGames": old_times_played,
                            "averageGuesses": float(old_avg_guess),
                            "globalAverage": global_avg
                        })

                    # Only count as a streak increase if they haven't already won today
                    new_streak = old_streak + 1
                    new_times_played = old_times_played + 1
                    new_avg = ((old_avg_guess * old_times_played) +
                               guess_count) / new_times_played

                    await cur.execute("""
                        UPDATE UserStats
                        SET streak = %s, times_played = %s, average_guess_count = %s, played_today = TRUE
                        WHERE discord_id = %s
                    """, (new_streak, new_times_played, new_avg, discord_id))

                    # Add to today's leaderboard
                    await cur.execute("""
                        INSERT INTO TodaysLeaderboard (discord_id, guess_count, created_at)
                        VALUES (%s, %s, NOW())
                        ON DUPLICATE KEY UPDATE guess_count = %s
                    """, (discord_id, guess_count, guess_count))
                else:
                    # New user who just clutched their first W
                    await cur.execute("""
                        INSERT INTO UserStats (discord_id, streak, times_played, average_guess_count, played_today)
                        VALUES (%s, %s, %s, %s, TRUE)
                    """, (discord_id, 1, 1, guess_count))

                    # Add to today's leaderboard
                    await cur.execute("""
                        INSERT INTO TodaysLeaderboard (discord_id, guess_count, created_at)
                        VALUES (%s, %s, NOW())
                        ON DUPLICATE KEY UPDATE guess_count = %s
                    """, (discord_id, guess_count, guess_count))

            # TodaysLeaderboard is wiped at every reset, so keep a permanent row
            # for the long range stats in the admin portal.
            await _history.record_play(discord_id, guess_count)

            # A second connection, because the one above was handed back to the
            # pool when its block ended. The writes are committed by now, so
            # this reads the numbers we just wrote.
            async with DBContextManager() as cur:
                # Get global average for comparison
                await cur.execute("SELECT AVG(average_guess_count) as global_avg FROM UserStats WHERE times_played > 0")
                global_avg_row = await cur.fetchone()
                global_avg = float(global_avg_row[0]) if global_avg_row and global_avg_row[0] else 0.0

                # Get updated user stats to return
                await cur.execute("""
                    SELECT streak, times_played, average_guess_count, played_today
                    FROM UserStats
                    WHERE discord_id = %s
                """, (discord_id,))
                updated_stats = await cur.fetchone()

            if updated_stats:
                current_streak, total_games, current_avg, _ = updated_stats

                # Calculate personal performance for this game
                personal_performance = "equal"  # Default
                if guess_count < current_avg:
                    personal_performance = "above"  # Better than average (fewer guesses)
                elif guess_count > current_avg:
                    personal_performance = "below"  # Worse than average (more guesses)

                return web.json_response({
                    "status": "ok",
                    "streak": current_streak,
                    "totalGames": total_games,
                    "averageGuesses": float(current_avg),
                    "globalAverage": global_avg,
                    "isNewStreak": not row or not row[3],  # True if they hadn't played today
                    "guessCount": guess_count,
                    "personalPerformance": personal_performance
                })
            else:
                return web.json_response({"status": "ok"})
        except Exception:
            logger.exception("post_stats failed for discord_id=%s", discord_id)
            return web.json_response({"error": "Database error"}, status=500)

    # ------------------------------------------------------------------ #
    #  Tournament admin endpoints                                          #
    # ------------------------------------------------------------------ #

    @verify_tournament_admin
    async def tournament_admin_get(self, request: Request, admin_id: int) -> web.Response:
        """Return tournament + signups data for the admin panel."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"error": "guild_id required"}, status=400)
        guild_id = int(guild_id_param)

        t = await TournamentManager.get_active_tournament(guild_id)
        if not t:
            return web.json_response({"tournament": None, "signups": [], "pre_teams": []})

        data = await TournamentManager.get_signups_for_admin(t["id"])
        return web.json_response({"tournament": t, **data})

    @verify_tournament_admin
    async def tournament_admin_create(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            name = body.get("name", "Community Tournament")
            guild_id = int(body["guild_id"])
            team_size = int(body.get("team_size", 4))
            special_rules = body.get("special_rules") or None
            affects_rating = bool(body.get("affects_rating", True))
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        try:
            ok, msg, tid = await TournamentManager.create(
                guild_id=guild_id, name=name, channel_id=0, created_by=admin_id,
                team_size=team_size, special_rules=special_rules, affects_rating=affects_rating,
            )
        except Exception:
            logger.exception("tournament_admin_create failed")
            return web.json_response({"error": "Server error"}, status=500)
        return web.json_response({"ok": ok, "message": msg, "tournament_id": tid})

    @verify_tournament_admin
    async def tournament_admin_cancel(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        try:
            ok, msg = await TournamentManager.cancel(guild_id=guild_id)
        except Exception:
            logger.exception("tournament_admin_cancel failed")
            return web.json_response({"error": "Server error"}, status=500)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_save_teams(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            teams_data = body["teams"]
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        try:
            ok, msg = await TournamentManager.save_pre_teams(tournament_id, teams_data)
        except Exception:
            logger.exception("tournament_admin_save_teams failed for tournament_id=%s", tournament_id)
            return web.json_response({"ok": False, "message": "Server error while saving teams — check logs."}, status=500)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_add_signup(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            display_name = str(body["display_name"]).strip()
            discord_id = int(body["discord_id"]) if body.get("discord_id") else None
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            ok, msg = await TournamentManager.admin_add_signup(tournament_id, display_name, discord_id)
        except Exception:
            logger.exception("tournament_admin_add_signup failed")
            return web.json_response({"error": "Server error"}, status=500)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_remove_signups(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            signup_ids = [int(x) for x in body["signup_ids"]]
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            ok, msg = await TournamentManager.admin_remove_signups(tournament_id, signup_ids)
        except Exception:
            logger.exception("tournament_admin_remove_signups failed")
            return web.json_response({"error": "Server error"}, status=500)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_update_team_size(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            team_size = int(body["team_size"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            ok, msg = await TournamentManager.update_team_size(tournament_id, team_size)
        except Exception:
            logger.exception("tournament_admin_update_team_size failed")
            return web.json_response({"error": "Server error"}, status=500)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_lock(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg, teams = await TournamentManager.lock(guild_id=guild_id)
        return web.json_response({"ok": ok, "message": msg, "teams": teams})

    @verify_tournament_admin
    async def tournament_admin_complete_match(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            winner_team_id = int(body["winner_team_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.admin_complete_match(match_id, winner_team_id)
        return web.json_response({"ok": ok, "message": msg})

    # ------------------------------------------------------------------ #
    #  Public tournament endpoint                                          #
    # ------------------------------------------------------------------ #

    @verify_tournament_admin
    async def serve_player_profile(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            discord_id = int(request.match_info["discord_id"])
        except (KeyError, ValueError):
            return web.json_response({"error": "Invalid discord_id"}, status=400)
        p = await ProfileManager.get_profile_full(discord_id)
        if not p:
            return web.json_response({"error": "Not found"}, status=404)
        if p.get("created_at"):
            p["created_at"] = p["created_at"].isoformat()
        if p.get("first_played_at"):
            p["first_played_at"] = p["first_played_at"].isoformat()
        if p.get("updated_at"):
            p["updated_at"] = p["updated_at"].isoformat()
        return web.json_response(p)

    async def serve_leaderboard(self, request: Request) -> web.Response:
        from ..profile import ProfileManager
        sort = request.rel_url.query.get("sort", "rating")
        rows = await ProfileManager.get_leaderboard(sort=sort, limit=50)
        for r in rows:
            if r.get("first_played_at"):
                r["first_played_at"] = r["first_played_at"].isoformat() if hasattr(r["first_played_at"], "isoformat") else str(r["first_played_at"])
        return web.json_response({"leaderboard": rows, "sort": sort})

    @verify_tournament_admin
    async def serve_all_players(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        search = request.rel_url.query.get("search") or None
        players = await ProfileManager.get_all_profiles(search=search)
        return web.json_response({"players": players})

    @verify_tournament_admin
    async def admin_set_player_rank(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
            body = await request.json()
            rank = body.get("rank")
            tier = body.get("rank_tier")
            rank_type = body.get("rank_type", "actual")
            rank = int(rank) if rank is not None else None
            tier = int(tier) if tier is not None else None
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        if rank_type == "predicted":
            ok, msg = await ProfileManager.set_predicted_rank_by_id(player_id, rank, tier)
        else:
            ok, msg = await ProfileManager.set_rank_by_id(player_id, rank, tier)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def admin_adjust_tournament_wins(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
            body = await request.json()
            delta = int(body["delta"])
            if delta not in (1, -1):
                raise ValueError
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body. delta must be 1 or -1."}, status=400)
        ok, msg = await ProfileManager.adjust_tournament_wins(player_id, delta)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def admin_end_tournament(self, request: Request, admin_id: int) -> web.Response:
        from ..tournament import TournamentManager
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        ok, msg = await TournamentManager.admin_end_tournament(guild_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def admin_set_discord(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
            body = await request.json()
            discord_id = int(body["discord_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        ok, msg = await ProfileManager.set_discord_id_by_profile_id(player_id, discord_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def admin_discord_lookup(self, request: Request, admin_id: int) -> web.Response:
        import re
        q = request.rel_url.query.get("q", "").strip()
        if not q:
            return web.json_response({"ok": False, "error": "No query"}, status=400)
        guild_id_str = request.rel_url.query.get("guild_id") or (
            str(global_config.tournament_guild_id) if global_config.tournament_guild_id else None
        )
        if re.match(r'^\d{17,20}$', q):
            try:
                user = await self.splatdle.bot.fetch_user(int(q))
                return web.json_response({
                    "ok": True,
                    "discord_id": str(user.id),
                    "username": user.username,
                    "avatar_url": str(user.avatar_url) if user.avatar_url else None,
                })
            except Exception:
                return web.json_response({"ok": False, "error": "User not found"})
        if not guild_id_str:
            return web.json_response({"ok": False, "error": "No guild configured for username lookup"})
        try:
            guild = await self.splatdle.bot.fetch_guild(int(guild_id_str))
            members = await guild.search_members(q, limit=1)
            if members:
                member = members[0]
                return web.json_response({
                    "ok": True,
                    "discord_id": str(member.id),
                    "username": member.username,
                    "avatar_url": str(member.avatar_url) if member.avatar_url else None,
                })
            return web.json_response({"ok": False, "error": "No member found with that username"})
        except Exception:
            logger.exception("admin_discord_lookup failed for q=%r", q)
            return web.json_response({"ok": False, "error": "Lookup failed"})

    @verify_tournament_admin
    async def admin_toggle_twitch_native(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
        except (KeyError, ValueError):
            return web.json_response({"error": "Invalid player_id"}, status=400)
        ok, msg, new_val = await ProfileManager.toggle_twitch_native(player_id)
        if not ok:
            return web.json_response({"ok": False, "message": msg}, status=404)
        return web.json_response({"ok": True, "twitch_native": new_val})

    @verify_tournament_admin
    async def admin_override_splattag(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
            body = await request.json()
            splattag = str(body["splattag"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        ok, msg = await ProfileManager.set_splattag_by_id(player_id, splattag)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def admin_delete_player(self, request: Request, admin_id: int) -> web.Response:
        from ..profile import ProfileManager
        try:
            player_id = int(request.match_info["player_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid player_id"}, status=400)
        ok, msg = await ProfileManager.delete_player(player_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_save_schedule(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            schedule = body["schedule"]  # [{"round": int, "stage_name": str, "mode_id": str, "mode_name": str, "best_of": int}]
        except (KeyError, ValueError):
            return web.json_response({"error": "Invalid body"}, status=400)

        async with DBContextManager() as cur:
            await cur.execute("DELETE FROM tournament_round_games WHERE tournament_id = %s", (tournament_id,))
            for entry in schedule:
                await cur.execute(
                    """INSERT INTO tournament_round_schedule (tournament_id, round, stage_name, mode_id, mode_name, best_of)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name), mode_id = VALUES(mode_id),
                                               mode_name = VALUES(mode_name), best_of = VALUES(best_of)""",
                    (tournament_id, entry.get("round"), entry.get("stage_name"), entry.get("mode_id"), entry.get("mode_name"), entry.get("best_of", 1))
                )
                for gm in entry.get("game_maps", []):
                    game_num = gm.get("game_number")
                    stage = gm.get("stage_name")
                    gm_mode_id = gm.get("mode_id")
                    gm_mode_name = gm.get("mode_name")
                    if game_num:
                        await cur.execute(
                            """INSERT INTO tournament_round_games (tournament_id, round, game_number, stage_name, mode_id, mode_name)
                               VALUES (%s, %s, %s, %s, %s, %s)
                               ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name), mode_id = VALUES(mode_id), mode_name = VALUES(mode_name)""",
                            (tournament_id, entry.get("round"), game_num, stage, gm_mode_id, gm_mode_name)
                        )
        return web.json_response({"ok": True, "message": "Schedule saved."})

    @verify_tournament_admin
    async def tournament_admin_pin_match(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
            match_id = body.get("match_id")
            if match_id is not None:
                match_id = int(match_id)
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        TournamentManager.pin_match(guild_id, match_id)
        from ..util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({"event": "match_pinned", "match_id": match_id})
        return web.json_response({"ok": True})

    @verify_tournament_admin
    async def tournament_admin_game_score(self, request: Request, admin_id: int) -> web.Response:
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            team1_games = int(body["team1_games"])
            team2_games = int(body["team2_games"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        TournamentManager.set_game_score(match_id, team1_games, team2_games)
        from ..util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "game_score",
            "match_id": match_id,
            "team1_games": team1_games,
            "team2_games": team2_games,
            "game_results": TournamentManager.get_game_results(match_id),
        })
        return web.json_response({"ok": True})

    async def serve_overlay_settings(self, request: Request) -> web.Response:
        """Return current overlay/ribbon settings (public — used by the stream overlay)."""
        return web.json_response(_ov.snapshot())

    @verify_tournament_admin
    async def tournament_admin_set_overlay_settings(self, request: Request, admin_id: int) -> web.Response:
        """Update overlay/ribbon settings and broadcast the change to all connected overlays."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        ribbon_mode = body.get("ribbon_mode", "active")
        if ribbon_mode not in ("idle", "active", "open_lobby"):
            return web.json_response({"error": "Invalid ribbon_mode"}, status=400)

        _ov.update({
            "ribbon_mode": ribbon_mode,
            "open_lobby_match_type": body.get("open_lobby_match_type") or "open_battle",
            "open_lobby_stage": body.get("open_lobby_stage") or None,
            "open_lobby_mode_id": body.get("open_lobby_mode_id") or None,
            "open_lobby_mode_name": body.get("open_lobby_mode_name") or None,
            "open_lobby_stage_2": body.get("open_lobby_stage_2") or None,
            "open_lobby_room_code": body.get("open_lobby_room_code") or None,
            "lobby_pool": (body.get("lobby_pool") or "").strip() or None,
        })
        if "private_rotation_index" in body:
            try:
                _ov.set_rotation_index(int(body["private_rotation_index"]))
            except (TypeError, ValueError):
                return web.json_response({"error": "Invalid private_rotation_index"}, status=400)
        await TournamentBroadcaster.get().broadcast({"event": "overlay_settings", **_ov.snapshot()})
        return web.json_response({"ok": True, **_ov.snapshot()})

    @verify_tournament_admin
    async def tournament_admin_set_private_rotation(self, request: Request, admin_id: int) -> web.Response:
        """Move the private battle rotation along without touching the rest of the settings.

        The stream runs Turf War → Splat Zones → Tower Control → Rainmaker →
        Clam Blitz, then the lobby is remade, so the admin panel only needs to
        nudge the position between games.
        """
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        action = body.get("action", "next")
        if action == "next":
            _ov.advance_rotation(1)
        elif action == "back":
            _ov.advance_rotation(-1)
        elif action == "reset":
            _ov.set_rotation_index(0)
        elif action == "set":
            try:
                _ov.set_rotation_index(int(body.get("index", 0)))
            except (TypeError, ValueError):
                return web.json_response({"error": "Invalid index"}, status=400)
        else:
            return web.json_response({"error": "Invalid action"}, status=400)

        await TournamentBroadcaster.get().broadcast({"event": "overlay_settings", **_ov.snapshot()})
        return web.json_response({"ok": True, **_ov.snapshot()})

    async def serve_overlay_data(self, request: Request) -> web.Response:
        """Return pinned match overlay data for the stream overlay."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"match": None})
        try:
            data = await TournamentManager.get_pinned_match_data(int(guild_id_param))
            return web.json_response({"match": data})
        except Exception as e:
            logger.exception("Overlay data error: %s", e)
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def tournament_admin_set_match_game_stage(self, request: Request, admin_id: int) -> web.Response:
        """Set the counterpick stage for a specific game in a match."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
            stage_name = body.get("stage_name")  # None = clear
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT tournament_id, round FROM tournament_matches WHERE id = %s",
                (match_id,)
            )
            row = await cur.fetchone()
            if not row:
                return web.json_response({"error": "Match not found"}, status=404)
            tournament_id, round_num = row[0], row[1]
            from ..tournament.manager import _ensure_round_games_match_id
            await _ensure_round_games_match_id(cur)
            await cur.execute(
                """INSERT INTO tournament_round_games (tournament_id, round, match_id, game_number, stage_name)
                   VALUES (%s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name)""",
                (tournament_id, round_num, match_id, game_number, stage_name)
            )

        from ..util.broadcaster import TournamentBroadcaster
        await TournamentBroadcaster.get().broadcast({
            "event": "counterpick_stage",
            "match_id": match_id,
            "game_number": game_number,
            "stage_name": stage_name,
        })
        return web.json_response({"ok": True})

    @verify_tournament_admin
    async def tournament_admin_revert_match(self, request: Request, admin_id: int) -> web.Response:
        """Revert a completed (or awaiting-confirmation) match back to pending."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.admin_revert_match(match_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_revert_game(self, request: Request, admin_id: int) -> web.Response:
        """Revert the last confirmed game within a match, undoing its TrueSkill update."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.admin_revert_game(match_id, game_number)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_report_game(self, request: Request, admin_id: int) -> web.Response:
        """Admin force-sets a confirmed game result within a match, overwriting any existing record."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
            winner_team_id = int(body["winner_team_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.admin_set_game_result(match_id, game_number, winner_team_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_tournament_admin
    async def tournament_admin_get_map_pool(self, request: Request, admin_id: int) -> web.Response:
        """Return the map pool (allowed stages per mode) for the current tournament."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"error": "Missing guild_id"}, status=400)
        tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
        if not tournament:
            tournament = await TournamentManager.get_recent_completed_tournament(int(guild_id_param))
        if not tournament:
            return web.json_response({"pool": {}})
        pool = await TournamentManager.get_map_pool(tournament["id"])
        return web.json_response({"tournament_id": tournament["id"], "pool": pool})

    @verify_tournament_admin
    async def tournament_admin_set_map_pool(self, request: Request, admin_id: int) -> web.Response:
        """Set allowed stages per mode for a tournament."""
        try:
            body = await request.json()
            tournament_id = int(body["tournament_id"])
            pool = body["pool"]
            if not isinstance(pool, dict):
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            await TournamentManager.set_map_pool(tournament_id, pool)
            return web.json_response({"ok": True, "message": "Map pool saved."})
        except Exception:
            logger.exception("tournament_admin_set_map_pool failed")
            return web.json_response({"ok": False, "message": "Failed to save map pool."})

    @verify_tournament_admin
    async def tournament_admin_list_presets(self, request: Request, admin_id: int) -> web.Response:
        """List all saved map pool presets."""
        try:
            presets = await TournamentManager.get_map_pool_presets()
            return web.json_response({"presets": presets})
        except Exception:
            logger.exception("tournament_admin_list_presets failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def tournament_admin_save_preset(self, request: Request, admin_id: int) -> web.Response:
        """Create or update a map pool preset."""
        try:
            body = await request.json()
            name = str(body["name"]).strip()
            pool = body["pool"]
            preset_id = body.get("id") or None
            if not name or not isinstance(pool, dict):
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            new_id = await TournamentManager.upsert_map_pool_preset(
                int(preset_id) if preset_id else None, name, pool
            )
            return web.json_response({"ok": True, "id": new_id, "message": "Preset saved."})
        except Exception:
            logger.exception("tournament_admin_save_preset failed")
            return web.json_response({"ok": False, "message": "Failed to save preset."})

    @verify_tournament_admin
    async def tournament_admin_delete_preset(self, request: Request, admin_id: int) -> web.Response:
        """Delete a map pool preset by id."""
        try:
            body = await request.json()
            preset_id = int(body["id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            await TournamentManager.delete_map_pool_preset(preset_id)
            return web.json_response({"ok": True, "message": "Preset deleted."})
        except Exception:
            logger.exception("tournament_admin_delete_preset failed")
            return web.json_response({"ok": False, "message": "Failed to delete preset."})

    @verify_tournament_admin
    async def tournament_admin_apply_preset(self, request: Request, admin_id: int) -> web.Response:
        """Apply a preset's pool to the current tournament."""
        try:
            body = await request.json()
            preset_id = int(body["preset_id"])
            tournament_id = int(body["tournament_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)
        try:
            presets = await TournamentManager.get_map_pool_presets()
            preset = next((p for p in presets if p["id"] == preset_id), None)
            if not preset:
                return web.json_response({"ok": False, "message": "Preset not found."})
            await TournamentManager.set_map_pool(tournament_id, preset["pool"])
            return web.json_response({"ok": True, "message": f"Applied \"{preset['name']}\" to tournament."})
        except Exception:
            logger.exception("tournament_admin_apply_preset failed")
            return web.json_response({"ok": False, "message": "Failed to apply preset."})

    async def serve_overlay_map_pool(self, request: Request) -> web.Response:
        """Public endpoint: return current tournament map pool for the overlay."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"pool": {}})
        try:
            tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
            if not tournament:
                tournament = await TournamentManager.get_recent_completed_tournament(int(guild_id_param))
            if not tournament:
                return web.json_response({"pool": {}})
            pool = await TournamentManager.get_map_pool(tournament["id"])
            return web.json_response({"tournament_id": tournament["id"], "name": tournament["name"], "pool": pool})
        except Exception:
            logger.exception("serve_overlay_map_pool failed")
            return web.json_response({"error": "Server error"}, status=500)

    async def serve_overlay_upnext(self, request: Request) -> web.Response:
        """Return the next pending (unpinned) match for the 'up next' overlay."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"match": None})
        try:
            data = await TournamentManager.get_next_pending_match_data(int(guild_id_param))
            return web.json_response({"match": data})
        except Exception as e:
            logger.exception("Overlay upnext error: %s", e)
            return web.json_response({"error": "Server error"}, status=500)

    async def serve_tournament_list(self, request: Request) -> web.Response:
        """Return all completed tournaments for a guild (public)."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"tournaments": []})
        try:
            tournaments = await TournamentManager.get_tournament_list(int(guild_id_param))
            for t in tournaments:
                if t.get("created_at"):
                    t["created_at"] = t["created_at"].isoformat()
            return web.json_response({"tournaments": tournaments})
        except Exception as e:
            logger.exception("Tournament list error: %s", e)
            return web.json_response({"error": "Server error"}, status=500)

    async def serve_tournament_current(self, request: Request) -> web.Response:
        """Return the current active tournament bracket data (public, no auth needed)."""
        guild_id_param = request.rel_url.query.get("guild_id")
        tournament_id_param = request.rel_url.query.get("id")

        try:
            if tournament_id_param:
                data = await TournamentManager.get_bracket_data(int(tournament_id_param))
            elif guild_id_param:
                tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
                if not tournament:
                    tournament = await TournamentManager.get_recent_completed_tournament(int(guild_id_param))
                if not tournament:
                    return web.json_response({"tournament": None}, status=200)
                data = await TournamentManager.get_bracket_data(tournament["id"])
            else:
                return web.json_response({"tournament": None, "rounds": []}, status=200)

            return web.json_response(data)
        except Exception as e:
            logger.exception("Tournament API error: %s", e)
            return web.json_response({"error": "Server error"}, status=500)

    @verify_access_token
    async def serve_my_match(self, request: Request, discord_id: str) -> web.Response:
        """Return the calling player's current active match and their team id (for subs with no active match)."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"match": None})
        tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
        if not tournament or tournament["status"] != "active":
            return web.json_response({"match": None})
        match = await TournamentManager.get_player_active_match(tournament["id"], discord_id=int(discord_id))
        if match:
            # Check if the logged-in user is the team captain
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute(
                    "SELECT captain_discord_id FROM tournament_teams WHERE id = %s",
                    (match["player_team_id"],)
                )
                cap_row = await cur.fetchone()
                match["is_captain"] = bool(
                    cap_row and cap_row["captain_discord_id"] and
                    int(cap_row["captain_discord_id"]) == int(discord_id)
                )
        player_team_id = (
            match["player_team_id"] if match
            else await TournamentManager.get_player_team_id(tournament["id"], discord_id=int(discord_id))
        )
        return web.json_response({"match": dict(match) if match else None, "player_team_id": player_team_id})

    @verify_access_token
    async def tournament_web_report(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player reports a match result (win or loss)."""
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
            result = body["result"]  # "win" or "loss"
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        tournament = await TournamentManager.get_active_tournament(guild_id)
        if not tournament or tournament["status"] != "active":
            return web.json_response({"ok": False, "message": "No active tournament."})

        match = await TournamentManager.get_player_active_match(tournament["id"], discord_id=int(discord_id))
        if not match:
            return web.json_response({"ok": False, "message": "You don't have an active match right now."})
        if match["status"] == "awaiting_confirmation":
            return web.json_response({"ok": False, "message": "Your match result is already reported — waiting for the opposing team to confirm."})

        player_team_id = match["player_team_id"]
        if result == "win":
            winner_team_id = player_team_id
        else:
            winner_team_id = match["team2_id"] if player_team_id == match["team1_id"] else match["team1_id"]

        ok, msg = await TournamentManager.report_win(
            match_id=match["id"],
            winner_team_id=winner_team_id,
            reporter_discord=int(discord_id),
        )
        if ok:
            from ..bot.tournament import post_match_confirmation_embed
            from ..util.database_context_manager import DBContextManager as _DB
            async with _DB(use_dict=True) as cur:
                await cur.execute("SELECT team_name FROM tournament_teams WHERE id = %s", (winner_team_id,))
                row = await cur.fetchone()
                winner_name = row["team_name"] if row else "Unknown"
                opposing_id = match["team2_id"] if winner_team_id == match["team1_id"] else match["team1_id"]
                await cur.execute(
                    """SELECT COALESCE(s.discord_id, pp.discord_id) AS discord_id
                       FROM tournament_team_members ttm
                       JOIN tournament_signups s ON s.id = ttm.signup_id
                       LEFT JOIN player_profiles pp ON (
                           s.discord_id IS NULL AND s.twitch_username IS NOT NULL
                           AND LOWER(pp.twitch_username) = LOWER(s.twitch_username)
                       )
                       WHERE ttm.team_id = %s
                       AND (s.discord_id IS NOT NULL OR pp.discord_id IS NOT NULL)""",
                    (opposing_id,)
                )
                opposing = await cur.fetchall()
            opposing_ids = [m["discord_id"] for m in opposing]
            await post_match_confirmation_embed(self.splatdle.bot, match["id"], winner_team_id, winner_name, opposing_ids)
        return web.json_response({"ok": ok, "message": msg})

    @verify_access_token
    async def tournament_web_confirm(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player confirms a pending match result."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg, _ = await TournamentManager.confirm_win(match_id=match_id, confirmer_discord=int(discord_id))
        return web.json_response({"ok": ok, "message": msg})

    @verify_access_token
    async def tournament_web_dispute(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player disputes a pending match result."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.dispute_win(match_id=match_id)
        return web.json_response({"ok": ok, "message": msg})

    @verify_access_token
    async def tournament_web_report_game(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player reports the winner of a single game within their match."""
        try:
            body = await request.json()
            guild_id = int(body["guild_id"])
            game_number = int(body["game_number"])
            result = body["result"]  # "win" or "loss"
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        tournament = await TournamentManager.get_active_tournament(guild_id)
        if not tournament or tournament["status"] != "active":
            return web.json_response({"ok": False, "message": "No active tournament."})

        match = await TournamentManager.get_player_active_match(tournament["id"], discord_id=int(discord_id))
        if not match:
            return web.json_response({"ok": False, "message": "You don't have an active match right now."})

        player_team_id = match["player_team_id"]

        # Only the team captain (or an admin) can report game results
        is_admin_user = int(discord_id) in global_config.tournament_admin_ids
        if not is_admin_user:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute(
                    "SELECT captain_discord_id FROM tournament_teams WHERE id = %s",
                    (player_team_id,)
                )
                cap_row = await cur.fetchone()
                if not cap_row or not cap_row["captain_discord_id"] or int(cap_row["captain_discord_id"]) != int(discord_id):
                    return web.json_response({"ok": False, "message": "Only the team captain can report game results."})

        winner_team_id = player_team_id if result == "win" else (
            match["team2_id"] if player_team_id == match["team1_id"] else match["team1_id"]
        )

        ok, msg = await TournamentManager.report_game_win(
            match_id=match["id"],
            game_number=game_number,
            winner_team_id=winner_team_id,
            reporter_discord=int(discord_id),
        )
        return web.json_response({"ok": ok, "message": msg})

    @verify_access_token
    async def tournament_web_confirm_game(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player confirms a pending game result."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg, series_complete = await TournamentManager.confirm_game_win(
            match_id=match_id,
            game_number=game_number,
            confirmer_discord=int(discord_id),
        )
        return web.json_response({"ok": ok, "message": msg, "series_complete": series_complete})

    @verify_access_token
    async def tournament_web_dispute_game(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player disputes a pending game result."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.dispute_game(match_id=match_id, game_number=game_number)
        return web.json_response({"ok": ok, "message": msg})

    @verify_access_token
    async def tournament_web_counterpick(self, request: Request, discord_id: str) -> web.Response:
        """Logged-in player locks in a counterpick stage for an upcoming game."""
        try:
            body = await request.json()
            match_id = int(body["match_id"])
            game_number = int(body["game_number"])
            stage_name = str(body["stage_name"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "Invalid body"}, status=400)

        ok, msg = await TournamentManager.player_set_counterpick(
            match_id=match_id,
            game_number=game_number,
            stage_name=stage_name,
            picker_discord=int(discord_id),
        )
        return web.json_response({"ok": ok, "message": msg})

    async def handle_tournament_ws(self, request: web.Request) -> web.WebSocketResponse:
        """WebSocket endpoint — streams signup/match events to connected clients."""
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)

        guild_id_param = request.rel_url.query.get("guild_id")
        if guild_id_param:
            try:
                tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
                if tournament and tournament["status"] == "signup":
                    signups = await TournamentManager.get_public_signups(tournament["id"])
                    await ws.send_str(__import__("json").dumps({
                        "event": "hello",
                        "tournament_id": tournament["id"],
                        "signups": signups,
                        "count": len(signups),
                    }))
            except Exception:
                logger.exception("WS hello send failed")

        broadcaster = TournamentBroadcaster.get()
        broadcaster.add(ws)
        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.ERROR:
                    break
        finally:
            broadcaster.remove(ws)
        return ws

    async def serve_tournament_signups(self, request: Request) -> web.Response:
        """Public: return the current signup list (display names only, no ratings)."""
        guild_id_param = request.rel_url.query.get("guild_id")
        if not guild_id_param:
            return web.json_response({"signups": [], "count": 0})
        tournament = await TournamentManager.get_active_tournament(int(guild_id_param))
        if not tournament or tournament["status"] != "signup":
            return web.json_response({"signups": [], "count": 0})
        signups = await TournamentManager.get_public_signups(tournament["id"])
        return web.json_response({"signups": signups, "count": len(signups)})

    async def serve_splatdle(self, request: Request) -> web.Response:
        """Serve Splatdle game data.

        Returns the current weapon to guess and the full weapons list
        for the Splatdle game.

        Args:
            request: The HTTP request.

        Returns:
            JSON response containing weapons list and current answer.
        """
        current_weapon = self.splatdle.get_current_weapon()
        # Format answer as "WeaponName (GameName)" for frontend compatibility
        answer = f"{current_weapon['name']} ({current_weapon['game']})" if current_weapon else ""
        return web.json_response({"weapons": self.splatdle.weapons,
                                  "answer": answer
                                  })

    async def splatdle_heartbeat(self, request: Request) -> web.Response:
        """Record that a browser still has Splatdle open.

        Public and unauthenticated: anonymous players are most of the traffic,
        and the session id is generated by the page itself.
        """
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        session_id = str(body.get("session_id") or "").strip()[:64]
        if not session_id:
            return web.json_response({"error": "Missing session_id"}, status=400)

        _presence.touch(session_id)

        # The visitor id survives between sessions, so it is what the history
        # tables count. Only the first beat of the day hits the database.
        visitor_id = str(body.get("visitor_id") or "").strip()[:64]
        if visitor_id and _presence.claim_visit(visitor_id):
            await _history.record_visit(visitor_id)
        return web.json_response({"ok": True})

    async def serve_splatdle_leaderboard(self, request: Request) -> web.Response:
        """Public Splatdle leaderboard: the global table, or just today's.

        Mirrors what /splatdle-leaderboard shows in Discord so the site and the
        bot can never disagree. Only players who logged in and finished a daily
        game are in here — the game itself is playable anonymously.

        The global table only lists players with LEADERBOARD_MIN_GAMES games
        behind them. Today's lists everyone who finished today, newcomers
        included: it is a record of the day, not a ranking of averages.

        Query:
            scope: "global" (default) or "today".
            limit: 1-100, default 25.
        """
        scope = "today" if request.rel_url.query.get("scope") == "today" else "global"
        try:
            limit = int(request.rel_url.query.get("limit", 25))
        except ValueError:
            limit = 25
        limit = max(1, min(limit, 100))

        try:
            async with DBContextManager(use_dict=True) as cur:
                if scope == "today":
                    await cur.execute(
                        "SELECT discord_id, guess_count, created_at FROM TodaysLeaderboard "
                        "ORDER BY guess_count ASC, created_at ASC LIMIT %s",
                        (limit,),
                    )
                else:
                    # Same weighting as the bot: a low average only counts once
                    # you have the games to back it up. The gate on top of it
                    # keeps the table to players with a real record.
                    await cur.execute(
                        "SELECT discord_id, average_guess_count, streak, times_played, "
                        "       (average_guess_count + 4.0 / SQRT(times_played)) AS weighted "
                        "FROM UserStats WHERE times_played >= %s "
                        "ORDER BY weighted ASC LIMIT %s",
                        (LEADERBOARD_MIN_GAMES, limit),
                    )
                records = await cur.fetchall()
        except Exception:
            logger.exception("serve_splatdle_leaderboard failed to read %s table", scope)
            return web.json_response({"error": "Leaderboard unavailable"}, status=503)

        names = await self._resolve_discord_names([r["discord_id"] for r in records])

        entries = []
        for i, r in enumerate(records):
            discord_id = int(r["discord_id"])
            name = names.get(discord_id) or {}
            entry = {
                "rank": i + 1,
                "discordId": str(discord_id),
                "username": name.get("username") or "Unknown player",
                "avatarUrl": name.get("avatar_url"),
            }
            if scope == "today":
                entry["guessCount"] = int(r["guess_count"])
                entry["playedAt"] = r["created_at"].isoformat() if r["created_at"] else None
            else:
                entry["averageGuesses"] = float(r["average_guess_count"])
                entry["weightedScore"] = round(float(r["weighted"]), 2)
                entry["streak"] = int(r["streak"])
                entry["timesPlayed"] = int(r["times_played"])
            entries.append(entry)

        return web.json_response({
            "scope": scope,
            "entries": entries,
            "minGames": LEADERBOARD_MIN_GAMES if scope == "global" else 0,
        })

    async def _resolve_discord_names(self, discord_ids: list) -> Dict[int, Dict[str, Any]]:
        """Turn Discord ids into usernames and avatars for a leaderboard page.

        Cached for an hour: the leaderboard is public and can be reloaded as
        often as anyone likes, and a table of 100 uncached ids would otherwise
        be 100 calls to Discord every time.
        """
        now = time.monotonic()
        resolved: Dict[int, Dict[str, Any]] = {}
        for raw in discord_ids:
            discord_id = int(raw)
            cached = _name_cache.get(discord_id)
            if cached and now - cached[0] < _NAME_CACHE_TTL:
                resolved[discord_id] = cached[1]
                continue
            user = self.bot.get_user(discord_id)
            if user is None:
                try:
                    user = await self.bot.fetch_user(discord_id)
                except Exception:
                    logger.warning("leaderboard could not resolve discord id %s", discord_id)
                    user = None
            info = {
                "username": user.username if user else None,
                "avatar_url": str(user.avatar_url) if user and user.avatar_url else None,
            }
            _name_cache[discord_id] = (now, info)
            resolved[discord_id] = info
        return resolved

    @verify_tournament_admin
    async def serve_splatdle_activity(self, request: Request, admin_id: int) -> web.Response:
        """Live Splatdle activity for the admin portal: who is on now, who finished today."""
        data = dict(_presence.stats())
        try:
            async with DBContextManager() as cur:
                await cur.execute("SELECT COUNT(*) FROM UserStats WHERE played_today = TRUE")
                row = await cur.fetchone()
                data["completed_today"] = int(row[0]) if row else 0

                await cur.execute("SELECT COUNT(*) FROM UserStats")
                row = await cur.fetchone()
                data["registered_players"] = int(row[0]) if row else 0

                await cur.execute("SELECT AVG(guess_count) FROM TodaysLeaderboard")
                row = await cur.fetchone()
                data["average_guesses_today"] = float(row[0]) if row and row[0] else None
        except Exception:
            logger.exception("serve_splatdle_activity failed to read stats")
            data["completed_today"] = None
            data["registered_players"] = None
            data["average_guesses_today"] = None

        try:
            days = int(request.rel_url.query.get("days", 30))
        except ValueError:
            days = 30
        days = max(1, min(days, 365))
        try:
            data["history"] = await _history.summary(days)
            data["history_week"] = await _history.summary(7)
        except Exception:
            logger.exception("serve_splatdle_activity failed to read history")
            data["history"] = None
            data["history_week"] = None
        return web.json_response(data)

    # --------------------------------------------------------------------- #
    #  Splatoon Bingo                                                        #
    # --------------------------------------------------------------------- #

    @verify_tournament_admin
    async def bingo_admin_get(self, request: Request, admin_id: int) -> web.Response:
        """Return the whole suggestion pool, saved cards and headline counts."""
        try:
            guild_id = request.rel_url.query.get("guild_id")
            guild = int(guild_id) if guild_id else None
            return web.json_response({
                "suggestions": await BingoManager.list_suggestions(guild),
                "cards": await BingoManager.list_cards(),
                "stats": await BingoManager.get_stats(guild),
                "reject_categories": [
                    {"id": key, "label": value["label"], "explanation": value["explanation"]}
                    for key, value in REJECT_CATEGORIES.items()
                ],
            })
        except Exception:
            logger.exception("bingo_admin_get failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_add(self, request: Request, admin_id: int) -> web.Response:
        """Add the admin's own suggestions to the pool by hand.

        The text is parsed the same way a Discord submission is, so a numbered
        or bulleted list pasted in adds one square per line.
        """
        try:
            body = await request.json()
            guild_id = body.get("guild_id")
            ok, error, suggestions = parse_submission(str(body.get("text", "")))
            if not ok:
                return web.json_response(
                    {"ok": False, "message": "Put each suggestion on its own line."},
                    status=400,
                )

            author = " ".join(str(body.get("author", "")).split())
            if not author:
                user = self.bot.get_user(admin_id)
                if user is None:
                    try:
                        user = await self.bot.fetch_user(admin_id)
                    except Exception:
                        user = None
                author = (user.display_name if user else None) or "Admin"

            ok, msg, added = await BingoManager.add_manual_suggestions(
                guild_id=int(guild_id) if guild_id else 0,
                discord_id=admin_id,
                display_name=author,
                suggestions=suggestions,
                approved=bool(body.get("approved", True)),
            )
            return web.json_response(
                {"ok": ok, "message": msg, "added": added}, status=200 if ok else 400
            )
        except Exception:
            logger.exception("bingo_admin_add failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_exclude(self, request: Request, admin_id: int) -> web.Response:
        """Exclude suggestions from future draws, or put them back."""
        try:
            body = await request.json()
            ids = [int(i) for i in body.get("ids", [])]
            excluded = bool(body.get("excluded", True))
            changed = await BingoManager.set_excluded(ids, excluded)
            return web.json_response({"ok": True, "changed": changed})
        except Exception:
            logger.exception("bingo_admin_exclude failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_used(self, request: Request, admin_id: int) -> web.Response:
        """Mark suggestions as used, or release them back into the pool."""
        try:
            body = await request.json()
            ids = [int(i) for i in body.get("ids", [])]
            used = bool(body.get("used", True))
            changed = await BingoManager.set_used(ids, used)
            return web.json_response({"ok": True, "changed": changed})
        except Exception:
            logger.exception("bingo_admin_used failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_edit(self, request: Request, admin_id: int) -> web.Response:
        """Reword a single suggestion."""
        try:
            body = await request.json()
            ok, msg = await BingoManager.edit_suggestion(
                int(body.get("id", 0)), str(body.get("text", ""))
            )
            return web.json_response({"ok": ok, "message": msg}, status=200 if ok else 400)
        except Exception:
            logger.exception("bingo_admin_edit failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_delete(self, request: Request, admin_id: int) -> web.Response:
        """Delete suggestions outright."""
        try:
            body = await request.json()
            ids = [int(i) for i in body.get("ids", [])]
            deleted = await BingoManager.delete_suggestions(ids)
            return web.json_response({"ok": True, "deleted": deleted})
        except Exception:
            logger.exception("bingo_admin_delete failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_review(self, request: Request, admin_id: int) -> web.Response:
        """Approve or reject suggestions and push the verdict back to Discord.

        Approving everything on a message swaps its 👁️ for a ☑️; anything turned
        down is explained to the submitter by DM.
        """
        try:
            body = await request.json()
            ids = [int(i) for i in body.get("ids", [])]
            ok, msg, message_ids = await BingoManager.set_status(
                ids,
                str(body.get("status", "")),
                category=body.get("category"),
                reason=body.get("reason"),
                admin_id=admin_id,
            )
            if not ok:
                return web.json_response({"ok": False, "message": msg}, status=400)

            synced = await bingo_notifier.sync_messages(self.bot, message_ids)
            return web.json_response({"ok": True, "message": msg, "synced": synced})
        except Exception:
            logger.exception("bingo_admin_review failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_resync(self, request: Request, admin_id: int) -> web.Response:
        """Re-run the channel catch-up and repair reactions on every submission.

        With notify on this also does retroactively what the live path does:
        members are DMed their own text back and unusable messages are cleared
        away, but only once that DM has landed.
        """
        try:
            # Registered under the class name, with the module name as a fallback.
            extension = self.bot.get_ext("BingoExt") or self.bot.get_ext("backend.bot.bingo")
            if extension is None:
                return web.json_response(
                    {"ok": False, "message": "The bingo bot extension isn't loaded."}, status=503
                )
            body = await request.json() if request.can_read_body else {}
            counts = await extension.catch_up(notify=bool(body.get("notify", True)))
            return web.json_response({
                "ok": True,
                "counts": counts,
                "message": (
                    f"Scanned {counts['scanned']} messages, accepted "
                    f"{counts['accepted']} new one(s), resynced {counts['resynced']}."
                ),
            })
        except Exception:
            logger.exception("bingo_admin_resync failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_draw(self, request: Request, admin_id: int) -> web.Response:
        """Draw a random card from the pool without saving or consuming it."""
        try:
            body = await request.json()
            guild_id = body.get("guild_id")
            ok, msg, cells = await BingoManager.draw_card(
                rows=int(body.get("rows", 5)),
                cols=int(body.get("cols", 5)),
                free_space=bool(body.get("free_space", False)),
                exclude_ids=[int(i) for i in body.get("exclude_ids", [])],
                guild_id=int(guild_id) if guild_id else None,
                balanced=bool(body.get("balanced", False)),
            )
            return web.json_response(
                {"ok": ok, "message": msg, "cells": cells}, status=200 if ok else 400
            )
        except Exception:
            logger.exception("bingo_admin_draw failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_save_card(self, request: Request, admin_id: int) -> web.Response:
        """Save a drawn card, marking its squares used so they never repeat."""
        try:
            body = await request.json()
            ok, msg, card_id = await BingoManager.save_card(
                name=str(body.get("name", "")),
                rows=int(body.get("rows", 5)),
                cols=int(body.get("cols", 5)),
                free_space=bool(body.get("free_space", False)),
                cells=body.get("cells", []),
            )
            return web.json_response(
                {"ok": ok, "message": msg, "card_id": card_id}, status=200 if ok else 400
            )
        except Exception:
            logger.exception("bingo_admin_save_card failed")
            return web.json_response({"error": "Server error"}, status=500)

    @verify_tournament_admin
    async def bingo_admin_delete_card(self, request: Request, admin_id: int) -> web.Response:
        """Delete a saved card, optionally freeing its squares."""
        try:
            body = await request.json()
            ok, msg = await BingoManager.delete_card(
                int(body.get("card_id", 0)), bool(body.get("release", True))
            )
            return web.json_response({"ok": ok, "message": msg}, status=200 if ok else 400)
        except Exception:
            logger.exception("bingo_admin_delete_card failed")
            return web.json_response({"error": "Server error"}, status=500)
