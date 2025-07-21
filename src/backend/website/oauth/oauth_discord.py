import time
import logging
from urllib.parse import urlparse
from aiohttp import web
from typing import Any, Optional, Dict
from backend.util.database_context_manager import DBContextManager
from . import OauthBase
from backend.util.config import global_config

logger = logging.getLogger("webserver")


class DiscordOauthHandler(OauthBase):
    """Discord OAuth2 authentication handler.

    Handles Discord OAuth2 flow including authorization, token exchange,
    user information retrieval, and authentication status checking.

    Inherits from OauthBase and implements Discord-specific OAuth logic.
    """
    def __init__(self) -> None:
        """Initialize the Discord OAuth handler.

        Sets up Discord API endpoints and client configuration.
        """
        base_url = "https://discord.com/api/v10"
        super().__init__(
            platform="discord",
            base_url=base_url,
            token_url=f"{base_url}/oauth2/token",
            auth_url=f"{base_url}/oauth2/authorize",
            scopes="identify",
            client_dict={
                "client_id": global_config.client_id,
                "client_secret": global_config.client_secret,
                "redirect_uri": global_config.redirect_uri
            }
        )

    async def handle_callback(self, request: web.Request) -> web.Response:
        """Handle the OAuth2 callback from Discord.

        Processes the authorization code, exchanges it for tokens,
        stores user information, and sets authentication cookies.

        Args:
            request: The callback request containing the authorization code.

        Returns:
            Redirect response to the authorized page or error response.
        """

        auth_response_url = self.get_request_url(request)
        print(auth_response_url)
        parsed_url = urlparse(auth_response_url)
        if not parsed_url.scheme:
            auth_response_url = f"http://{auth_response_url}"

        code = request.query.get("code")
        if not code:
            return web.HTTPFound("/")

        try:
            token = self.oauth2_client.fetch_token(
                self._token_url,
                authorization_response=auth_response_url,
                client_secret=self._client_secret,
            )
        except Exception as e:
            return web.Response(text=f"Error fetching token: {str(e)}", status=500)

        access_token = token.get("access_token")
        refresh_token = token.get("refresh_token")
        expires_at = time.time() + token.get("expires_in", 3600)

        if access_token:
            user = await self.get_user_info(access_token)
            if user:
                user_id = user.get("id")
                if user_id:
                    async with DBContextManager() as cur:
                        # Log the values being inserted
                        # logger.debug(
                        #     "Inserting/Updating UserTokens: discord_id=%s, access_token=%s, refresh_token=%s, expires_at=%s",
                        #     user_id, access_token, refresh_token, int(
                        #         expires_at)
                        # )
                        # Insert or update the user's tokens in UserTokens table
                        await cur.execute(
                            """
                            INSERT INTO UserTokens (discord_id, access_token, refresh_token, expires_at)
                            VALUES (%s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE
                                access_token = VALUES(access_token),
                                refresh_token = VALUES(refresh_token),
                                expires_at = VALUES(expires_at)
                            """,
                            (int(user_id), access_token,
                             refresh_token, int(expires_at))
                        )
                    response = web.HTTPFound("/authorised")
                    response.set_cookie("discord_user_id", str(
                        user_id), httponly=True, secure=global_config.secured, samesite="Lax")
                    response.set_cookie("discord_access_token", access_token, httponly=True,
                                        secure=global_config.secured, samesite="Lax", max_age=3600)
                    response.set_cookie("discord_refresh_token", refresh_token, httponly=True,
                                        secure=global_config.secured, samesite="Lax", max_age=86400 * 7)
                    logger.debug(
                        "%s has authorised via Discord Oauth2", user_id)

                    return response
                return web.Response(text="Unable to fetch user information.", status=500)
            else:
                return web.Response(text="Unable to fetch user information.", status=500)
        else:
            return web.Response(text="Access token not found.", status=500)

    async def get_user_info(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Fetch Discord user information using access token.

        Args:
            access_token: Valid Discord access token.

        Returns:
            Dictionary containing user data or None if request fails.
        """
        if not access_token:
            return
        async with self.session.get(
            f"{self._base_url}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as response:
            if response.status != 200:
                return None
            user_data = await response.json()
            return user_data

    async def check_auth_status(self, request: web.Request) -> web.Response:
        """Check if the user is authenticated and return their status.

        Validates the access token and returns user information along
        with their Splatdle statistics if available.

        Args:
            request: The request containing authentication cookies.

        Returns:
            JSON response with authentication status and user data.
        """
        access_token = request.cookies.get("discord_access_token")
        logger.debug("Checking discord auth status...")
        if not access_token:
            logger.debug("Rejected because there is no discord access token")
            return web.json_response({"logged_in": False}, status=401)

        user_data = await self.get_user_info(access_token)
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT discord_id, streak, times_played, average_guess_count FROM UserStats WHERE discord_id = %s",
                (user_data["id"],)
            )
            row = await cur.fetchone()
            player = None
            if row:
                player = {
                    "id": str(row[0]),
                    "streak": row[1],
                    "times_played": row[2],
                    "average_guess_count": row[3]
                }
        if player is not None:
            player_data = {
                "id": str(user_data.get("id")),
                "avatar": user_data.get("avatar"),
                "username": user_data.get("username")
            }
        else:
            player_data = {
                "id": str(user_data.get("id")),
                "avatar": user_data.get("avatar"),
                "username": None
            }
        if user_data:
            return web.json_response({"logged_in": True, "player": player_data})

        logger.debug("Rejected because there is no discord user data")
        return web.json_response({"logged_in": False}, status=401)
