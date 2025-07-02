import os
import logging
from aiohttp import web

import aiohttp_cors

# from .config import global_config
from .oauth import DiscordOauthHandler
from ..util.config import global_config
from .api import SneakyApi
logger = logging.getLogger("webserver")


class WebServer:

    def __init__(self):
        self.app = web.Application()

        self.discord_token_handler: DiscordOauthHandler = DiscordOauthHandler()
        self.sneaky_api: SneakyApi = SneakyApi()
        self.cors = aiohttp_cors.setup(self.app, defaults={
            "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*",
            )
        })
        self.build_dir = os.path.join(os.getcwd(), "src", "frontend")
        self.static_dir = os.path.join(self.build_dir, "dist")

        if global_config.secured:
            logger.debug("Using SSL encryption")
        self._add_routes()

    async def serve_index(self, request):
        index_path = os.path.join(self.static_dir, "index.html")
        return web.FileResponse(index_path)

    async def serve_static_file(self, request):
        filename = request.match_info['filename']
        filepath = os.path.join(self.static_dir, filename)

        if os.path.exists(filepath) and os.path.isfile(filepath):
            return web.FileResponse(filepath)
        else:
            raise web.HTTPNotFound()

    async def handle_discord_verification(self, request):
        print("Verfying using: ", global_config.discord_verify)
        return web.Response(text=global_config.discord_verify)

    def _add_routes(self):
        # API Routes

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
        # Serve index.html for SPA routes
        self.app.router.add_get("/{tail:.*}", self.serve_index)
        for route in list(self.app.router.routes()):
            self.cors.add(route)

    async def run(self):
        """
        Starts the web server.

        This method sets up the web server using the provided `app`
        and starts it on the specified `PORT`. It prints a message
        indicating the server is running and listening on the specified port.

        Parameters:
        - self: The current instance of the class.

        Returns:
        - None
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

    async def close(self):
        await self.discord_token_handler.close()

    async def handle_500(self, _):
        """
        Custom handler for 500 Internal Server Error.
        """
        return web.HTTPFound('/500')


# if __name__ == "__main__":
#     loop = asyncio.get_event_loop()

#     webserver = WebServer()
#     loop.run_until_complete(webserver.start_server())
#     loop.run_forever()
