from aiohttp.web_request import Request
from functools import wraps
from aiohttp import web
from typing import Any, Callable, Dict, Optional
from .splatdle import Splatdle
from .oauth import DiscordOauthHandler
from ..util.database_context_manager import DBContextManager
import interactions
import logging

logger = logging.getLogger("API")


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
        except Exception as e:
            return web.json_response({"error": "Database error"}, status=500)

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
