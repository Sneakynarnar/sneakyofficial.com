import time
import logging
from urllib.parse import urlunparse
from aiohttp import web, ClientSession
from typing import Optional
from authlib.integrations.requests_client import OAuth2Session
from backend.util.database_context_manager import DBContextManager
from backend.util.config import global_config
logger = logging.getLogger("webserver")


class OauthBase:
    """Base class for OAuth2 authentication handlers.

    Provides common OAuth2 functionality including token management,
    session handling, and authentication flow coordination.

    Attributes:
        _base_url: Base URL for the OAuth provider API.
        _token_url: Token endpoint URL.
        _platform_name: Name of the OAuth platform (e.g., 'discord').
        _scopes: OAuth scopes to request.
        _redirect_uri: Redirect URI for OAuth callback.
        _client_id: OAuth client ID.
        _client_secret: OAuth client secret.
        session: aiohttp ClientSession for API requests.
        oauth2_client: OAuth2 client for token operations.
    """
    def __init__(
        self, platform: str, base_url: str, token_url: str, auth_url: str, scopes: str, client_dict: dict,
    ):
        """Initialize the OAuth base handler.

        Args:
            platform: Name of the OAuth platform.
            base_url: Base URL for API requests.
            token_url: Token endpoint URL.
            auth_url: Authorization endpoint URL.
            scopes: OAuth scopes to request.
            client_dict: Dictionary containing client credentials and redirect URI.
        """
        self._base_url = base_url
        self._token_url = token_url
        self._platform_name = platform
        self._scopes = scopes
        self._redirect_uri = client_dict["redirect_uri"]
        self._client_id = client_dict["client_id"]
        self._client_secret = client_dict["client_secret"]
        self.session = None
        logger.debug("Setting up Oauth for %s, Redirect URL: %s",
                     self._platform_name, self._redirect_uri)
        self.oauth2_client = OAuth2Session(
            client_id=self._client_id,
            client_secret=self._client_secret,
            redirect_uri=self._redirect_uri,
            scope=self._scopes
        )
        self._auth_url, _ = self.oauth2_client.create_authorization_url(
            auth_url)

    async def init(self) -> None:
        """Initialize the HTTP client session.
        """
        self.session = ClientSession()

    async def close(self) -> None:
        """Close the HTTP client session.
        """
        if self.session and not self.session.closed:
            await self.session.close()

    async def login_redirect(self, request: web.Request) -> web.HTTPFound:
        """Handle login redirect logic.

        Checks for valid tokens and either redirects to the main page
        or initiates the OAuth flow.

        Args:
            request: The HTTP request.

        Returns:
            Redirect response to either the main page or OAuth provider.
        """
        # Get session data
        session = await self.get_session(request)

        if session:
            user_id, access_token, refresh_token, expires_at = session
            if time.time() < expires_at:
                raise web.HTTPFound("/")

            new_token = await self._refresh_access_token(refresh_token)
            if new_token:
                access_token, refresh_token, expires_at = new_token
                async with DBContextManager as db:
                    await db.execute(
                        """
                        INSERT INTO UserTokens (discord_id, access_token, refresh_token, expires_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(discord_id) DO UPDATE SET
                            access_token=excluded.access_token,
                            refresh_token=excluded.refresh_token,
                            expires_at=excluded.expires_at
                        """,
                        (user_id, access_token, refresh_token, int(expires_at))
                    )
                raise web.HTTPFound("/")

        raise web.HTTPFound(self._auth_url)

    @staticmethod
    def get_request_url(request: web.Request) -> str:
        """Construct the full request URL.

        Args:
            request: The HTTP request.

        Returns:
            The complete request URL as a string.
        """
        scheme = request.scheme
        netloc = f"{request.host}"
        path = request.path
        query = request.query_string

        return urlunparse((scheme, netloc, path, "", query, ""))

    async def handle_callback(self, request: web.Request) -> web.Response:
        """Handle OAuth callback (must be implemented by subclasses).

        Args:
            request: The callback request.

        Returns:
            Response after processing the callback.

        Raises:
            NotImplementedError: If not implemented by subclass.
        """
        return NotImplementedError("Callback not implemented")

    async def check_auth_status(self, request: web.Request) -> web.Response:
        """Check authentication status (must be implemented by subclasses).

        Args:
            request: The HTTP request.

        Returns:
            JSON response with authentication status.

        Raises:
            NotImplementedError: If not implemented by subclass.
        """
        raise NotImplementedError("Check auth status not implemented")

    async def _refresh_access_token(self, refresh_token: str) -> Optional[tuple]:
        """Refresh the access token using the refresh token.

        Args:
            refresh_token: The refresh token to use.

        Returns:
            Tuple of (access_token, refresh_token, expires_at) or None if failed.
        """
        try:
            new_token = self.oauth2_client.refresh_token(
                self._token_url,
                refresh_token=refresh_token,
                client_id=self._client_id,
                client_secret=self._client_secret
            )
            return (
                new_token.get("access_token"),
                new_token.get("refresh_token"),
                time.time() + new_token.get("expires_in", 3600),
            )
        except Exception as e:
            logger.error("Failed to refresh token: %s", e)
            return None

    async def get_session(self, request: web.Request) -> Optional[tuple]:
        """Retrieve the user's session from the database.

        Args:
            request: The HTTP request containing cookies.

        Returns:
            Tuple of session data or None if no valid session.
        """
        user_id = request.cookies.get(f"{self._platform_name}_user_id")
        if not user_id:
            return None

        async with DBContextManager() as cur:
            session = await cur.execute(
                """
                SELECT access_token, refresh_token, expires_at
                FROM UserTokens
                WHERE discord_id = %s
                """,
                (user_id,)
            )
            session = await cur.fetchone()
        if not session:
            return None

        expires_at = session[2]
        if expires_at and time.time() > expires_at:
            return None
        return (user_id, *session)

    async def get_user_info(self, access_token: str) -> dict:
        """Fetch the platform user's info (must be implemented by subclasses).

        Args:
            access_token: Valid access token.

        Returns:
            User information dictionary.

        Raises:
            NotImplementedError: If not implemented by subclass.
        """
        raise NotImplementedError("No get user info provided")

    async def check_login_status(self, request: web.Request) -> web.Response:
        """Check if user is logged in.

        Args:
            request: The HTTP request.

        Returns:
            JSON response with login status.
        """
        user_id = request.cookies.get(f"{self._platform_name}_user_id")
        if not user_id:
            return web.json_response({"logged_in": False}, status=401)

        async with DBContextManager() as db:
            row = await db.fetchone(
                """
            SELECT access_token, refresh_token, expires_at
            FROM UserTokens
            WHERE discord_id = ?
            """,
                (user_id,)
            )

        if not row or row[2] < time.time():
            return web.json_response({"logged_in": False}, status=401)

        return web.json_response({"logged_in": True, "user_id": user_id})

    async def refresh_token(self, request: web.Request) -> web.Response:
        """Refresh user's access token.

        Args:
            request: The HTTP request containing refresh token cookie.

        Returns:
            JSON response with success status and updated cookies.
        """
        refresh_token = request.cookies.get(
            f"{self._platform_name}_refresh_token")

        if not refresh_token:
            return web.json_response({"error": "No refresh token"}, status=401)
        try:
            new_access_token, new_refresh_token, _ = await self._refresh_access_token(refresh_token)
        except Exception:
            return web.json_response({"error": "Invalid refresh token"}, status=500)

        if not new_access_token:
            return web.json_response({"error": "Invalid refresh token"}, status=401)

        # Create response
        response = web.json_response({"success": True})

        # Update cookies
        response.set_cookie(
            f"{self._platform_name}_access_token",
            new_access_token,
            httponly=True,
            secure=global_config.secured,
            samesite="Lax",
            max_age=3600
        )
        response.set_cookie(f"{self._platform_name}_refresh_token",
                            new_refresh_token,
                            httponly=True,
                            secure=global_config.secured,
                            samesite="Lax",
                            max_age=86400 * 7
                            )

        return response

    async def logout_platform(self, request: web.Request) -> web.Response:
        """Log out user from the platform.

        Args:
            request: The HTTP request.

        Returns:
            JSON response confirming logout and cleared cookies.
        """
        response = web.json_response({"message": "Logged out successfully"})

        # Remove cookies by setting them with an empty value and max_age=0
        response.del_cookie(f"{self._platform_name}_access_token")
        response.del_cookie(f"{self._platform_name}_refresh_token")
        response.del_cookie(f"{self._platform_name}_user_id")
        return response
    # async def logout_all_platforms(self, request):
    #     response = web.json_response({"message": "Logged out successfully"})

    #     response.del_cookie(f"{self._platform_name}_access_token")
    #     response.del_cookie(f"{self._platform_name}_refresh_token")
    #     response.del_cookie(f"{self._platform_name}_user_id")
