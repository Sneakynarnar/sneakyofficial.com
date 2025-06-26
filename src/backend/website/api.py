from aiohttp.web_request import Request
from functools import wraps
import os
from aiohttp import web
from .splatdle import Splatdle
from .oauth import DiscordOauthHandler
from ..util.database_context_manager import DBContextManager
import logging

logger = logging.getLogger("API")


def verify_access_token(func):
    @wraps(func)
    async def wrapper(self, request: Request, *args, **kwargs):
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
    def __init__(self,):
        self.splatdle: Splatdle = Splatdle()
        self.dc_token_handler: DiscordOauthHandler = DiscordOauthHandler()

    @verify_access_token
    async def post_stats(self, request: Request, discord_id: int):
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

                # Only count as a streak increase if they haven’t already won today
                new_streak = old_streak + 1 if not played_today else old_streak
                new_times_played = old_times_played + 1
                new_avg = ((old_avg_guess * old_times_played) +
                           guess_count) // new_times_played

                await cur.execute("""
                    UPDATE UserStats
                    SET streak = %s, times_played = %s, average_guess_count = %s, played_today = TRUE
                    WHERE discord_id = %s
                """, (new_streak, new_times_played, new_avg, discord_id))
            else:
                # New user who just clutched their first W
                await cur.execute("""
                    INSERT INTO UserStats (discord_id, streak, times_played, average_guess_count, played_today)
                    VALUES (%s, %s, %s, %s, TRUE)
                """, (discord_id, 1, 1, guess_count))
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Database error"}, status=500)

    async def serve_splatdle(self, request: Request):
        return web.json_response({"weapons": self.splatdle.weapons, "answer": self.splatdle.current_weapon})
