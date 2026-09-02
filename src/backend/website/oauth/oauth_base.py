import time
import logging
import secrets
from urllib.parse import urlunparse, urlencode
from aiohttp import web, ClientSession
from typing import Optional
from backend.util.database_context_manager import DBContextManager
from backend.util.config import global_config
logger = logging.getLogger("webserver")


def _request_host(request: web.Request) -> str:
    """The hostname the browser asked for, without any port."""
    return (request.host or "").split(":")[0].lower()


def _site_for(request: web.Request) -> Optional[str]:
    """Match a request against the sites allowed to run the OAuth flow.

    Splatdle has its own domain but shares this backend, so a login can start
    on either site. Returns the registrable host (www stripped) or None when the
    request came from somewhere we don't hand cookies to.
    """
    host = _request_host(request)
    for allowed in global_config.oauth_hosts:
        base = allowed[4:] if allowed.startswith("www.") else allowed
        if host == base or host.endswith(f".{base}"):
            return base
    return None


def cookie_domain_for(request: web.Request) -> Optional[str]:
    """Domain to scope session cookies to, so they stay first-party.

    Cookies set on splatdle.ink must belong to splatdle.ink: scoping them to
    sneakyofficial.com would make them third-party there, and browsers that
    block those would drop the session silently.
    """
    if not global_config.secured:
        return None
    site = _site_for(request)
    return f".{site}" if site else None


def redirect_uri_for(request: web.Request) -> str:
    """The OAuth redirect URI for the site this request came from.

    Every host listed here must also be registered in the Discord developer
    portal, or Discord rejects the login.
    """
    site = _site_for(request)
    if not site:
        return global_config.redirect_uri
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
    return f"{scheme}://{_request_host(request)}/api/auth/callback"


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
        self._auth_endpoint = auth_url
        self._token_url = token_url
        self._platform_name = platform
        self._scopes = scopes
        self._redirect_uri = client_dict["redirect_uri"]
        self._client_id = client_dict["client_id"]
        self._client_secret = client_dict["client_secret"]
        self.session = None
        logger.debug("Setting up Oauth for %s, Redirect URL: %s",
                     self._platform_name, self._redirect_uri)

    def build_auth_url(self, request: web.Request) -> str:
        """Authorisation URL that sends the user back to the site they started on.

        Args:
            request: The request that began the login.

        Returns:
            The provider's authorise URL with a matching redirect URI.
        """
        params = {
            'client_id': self._client_id,
            'redirect_uri': redirect_uri_for(request),
            'response_type': 'code',
            'scope': self._scopes,
            'state': secrets.token_urlsafe(32),
        }
        return f"{self._auth_endpoint}?{urlencode(params)}"

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

        raise web.HTTPFound(self.build_auth_url(request))

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
            async with self.session.post(
                self._token_url,
                data={
                    'client_id': self._client_id,
                    'client_secret': self._client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token',
                }
            ) as resp:
                if resp.status != 200:
                    logger.error("Failed to refresh token: HTTP %s", resp.status)
                    return None
                new_token = await resp.json()
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

        user_id = request.cookies.get(f"{self._platform_name}_user_id")

        response = web.json_response({"success": True})

        cookie_domain = cookie_domain_for(request)
        response.set_cookie(
            f"{self._platform_name}_access_token",
            new_access_token,
            httponly=True,
            secure=global_config.secured,
            samesite="Lax",
            max_age=3600,
            domain=cookie_domain,
        )
        response.set_cookie(
            f"{self._platform_name}_refresh_token",
            new_refresh_token,
            httponly=True,
            secure=global_config.secured,
            samesite="Lax",
            max_age=86400 * 7,
            domain=cookie_domain,
        )
        if user_id:
            response.set_cookie(
                f"{self._platform_name}_user_id",
                user_id,
                httponly=True,
                secure=global_config.secured,
                samesite="Lax",
                max_age=86400 * 30,
                domain=cookie_domain,
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

        # Remove cookies by setting them with an empty value and max_age=0.
        # The domain has to match the one they were set with or the browser
        # keeps them and the player stays logged in.
        cookie_domain = cookie_domain_for(request)
        response.del_cookie(f"{self._platform_name}_access_token", domain=cookie_domain)
        response.del_cookie(f"{self._platform_name}_refresh_token", domain=cookie_domain)
        response.del_cookie(f"{self._platform_name}_user_id", domain=cookie_domain)
        return response
    # async def logout_all_platforms(self, request):
    #     response = web.json_response({"message": "Logged out successfully"})

    #     response.del_cookie(f"{self._platform_name}_access_token")
    #     response.del_cookie(f"{self._platform_name}_refresh_token")
    #     response.del_cookie(f"{self._platform_name}_user_id")
