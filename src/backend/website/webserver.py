import os
import logging
from aiohttp import web
from typing import Any

import aiohttp_cors
import interactions
from .oauth import DiscordOauthHandler
from ..util.config import global_config
from .api import SneakyApi
logger = logging.getLogger("webserver")


class WebServer:
    """Web server for Sneaky's application.

    Handles HTTP routes, serves static files, manages API endpoints,
    and integrates Discord OAuth authentication.

    Attributes:
        app: The aiohttp web application.
        discord_token_handler: Handler for Discord OAuth operations.
        sneaky_api: API handler for application endpoints.
        cors: CORS configuration for the application.
        build_dir: Directory containing frontend build files.
        static_dir: Directory containing static assets.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the web server.

        Args:
            bot: The Discord bot client instance.
        """
        self.app: web.Application = web.Application()

        self.discord_token_handler: DiscordOauthHandler = DiscordOauthHandler()
        self.sneaky_api: SneakyApi = SneakyApi(bot)
        self.cors: Any = aiohttp_cors.setup(self.app, defaults={
            "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*",
            )
        })
        self.build_dir: str = os.path.join(os.getcwd(), "src", "frontend")
        self.static_dir: str = os.path.join(self.build_dir, "dist")

        if global_config.secured:
            logger.debug("Using SSL encryption")
        self._add_routes()

    async def serve_index(self, request: web.Request) -> web.FileResponse:
        """Serve the main index.html file.

        Args:
            request: The HTTP request.

        Returns:
            FileResponse containing the index.html file.
        """
        index_path = os.path.join(self.static_dir, "index.html")
        return web.FileResponse(index_path)

    async def serve_static_file(self, request: web.Request) -> web.FileResponse:
        """Serve static files from the build directory.

        Args:
            request: The HTTP request containing the filename.

        Returns:
            FileResponse for the requested file.

        Raises:
            HTTPNotFound: If the requested file doesn't exist.
        """
        filename = request.match_info['filename']
        filepath = os.path.join(self.static_dir, filename)

        if os.path.exists(filepath) and os.path.isfile(filepath):
            return web.FileResponse(filepath)
        else:
            raise web.HTTPNotFound()

    async def handle_discord_verification(self, request: web.Request) -> web.Response:
        """Handle Discord verification endpoint.

        Args:
            request: The HTTP request.

        Returns:
            Response containing the Discord verification token.
        """
        print("Verfying using: ", global_config.discord_verify)
        return web.Response(text=global_config.discord_verify)

    def _add_routes(self) -> None:
        """Configure all HTTP routes and CORS settings.

        Sets up API endpoints, static file serving, and applies CORS
        configuration to all routes.
        """

        self.app.router.add_get("/.well-known/discord", self.handle_discord_verification)
        self.app.router.add_post(
            "/api/auth/discord/refresh-token", self.discord_token_handler.refresh_token)
        self.app.router.add_get(
            "/api/auth/discord/status", self.discord_token_handler.check_auth_status)
        self.app.router.add_get("/api/auth/discord/login",
                                self.discord_token_handler.login_redirect)
        self.app.router.add_post(
            "/api/auth/discord/logout", self.discord_token_handler.logout_platform)
        self.app.router.add_get(
            '/api/auth/callback', self.discord_token_handler.handle_callback)
        self.app.router.add_get(
            "/api/splatdle", self.sneaky_api.serve_splatdle)
        self.app.router.add_post(
            "/api/splatdle/stats", self.sneaky_api.post_stats)

        logger.debug("Static directory: %s", self.static_dir)
        assets_dir = os.path.join(self.static_dir, "assets")
        images_dir = os.path.join(self.static_dir, "images")
        self.app.router.add_static(
            "/static", path=self.static_dir, show_index=False)
        self.app.router.add_static(
            "/assets", path=assets_dir, show_index=False)
        self.app.router.add_static(
            "/images", path=images_dir, show_index=True)

        self.app.router.add_get("/{filename:favicon\\.ico|.*\\.jpg|.*\\.png|.*\\.css|.*\\.js|.*\\.txt|.*\\.xml}",
                                self.serve_static_file)
        self.app.router.add_get("/{tail:.*}", self.serve_index)
        for route in list(self.app.router.routes()):
            self.cors.add(route)

    async def run(self) -> None:
        """Start the web server.

        Initializes OAuth handlers, sets up the HTTP server, and begins
        serving requests. Also starts the Splatdle game loop.
        """
        await self.discord_token_handler.init()
        await self.sneaky_api.dc_token_handler.init()
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0',
                           global_config.port, ssl_context=None)
        await site.start()
        logger.debug("Running webserver....")
        if global_config.secured:
            logger.info(
                "Running server webserver on port: %s with SSL", global_config.port)
        else:
            logger.info("Running server webserver on port: %s",
                        global_config.port)
        await self.sneaky_api.splatdle.run()

    async def close(self) -> None:
        """Close the web server and cleanup resources.
        """
        await self.discord_token_handler.close()

    async def handle_500(self, _: Any) -> web.HTTPFound:
        """Handle 500 Internal Server Error responses.

        Args:
            _: Unused error parameter.

        Returns:
            Redirect to the 500 error page.
        """
        return web.HTTPFound('/500')


