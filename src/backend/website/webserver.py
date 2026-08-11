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
        self.app.router.add_post(
            "/api/splatdle/heartbeat", self.sneaky_api.splatdle_heartbeat)
        self.app.router.add_get(
            "/api/splatdle/activity", self.sneaky_api.serve_splatdle_activity)
        self.app.router.add_get(
            "/api/tournament/ws", self.sneaky_api.handle_tournament_ws)
        self.app.router.add_get(
            "/api/tournament/signups", self.sneaky_api.serve_tournament_signups)
        self.app.router.add_get(
            "/api/tournament/my-match", self.sneaky_api.serve_my_match)
        self.app.router.add_post(
            "/api/tournament/report", self.sneaky_api.tournament_web_report)
        self.app.router.add_post(
            "/api/tournament/confirm", self.sneaky_api.tournament_web_confirm)
        self.app.router.add_post(
            "/api/tournament/dispute", self.sneaky_api.tournament_web_dispute)
        self.app.router.add_post(
            "/api/tournament/report-game", self.sneaky_api.tournament_web_report_game)
        self.app.router.add_post(
            "/api/tournament/confirm-game", self.sneaky_api.tournament_web_confirm_game)
        self.app.router.add_post(
            "/api/tournament/dispute-game", self.sneaky_api.tournament_web_dispute_game)
        self.app.router.add_post(
            "/api/tournament/counterpick", self.sneaky_api.tournament_web_counterpick)
        self.app.router.add_get(
            "/api/tournament/list", self.sneaky_api.serve_tournament_list)
        self.app.router.add_get(
            "/api/tournament", self.sneaky_api.serve_tournament_current)
        self.app.router.add_get(
            "/api/tournament/admin", self.sneaky_api.tournament_admin_get)
        self.app.router.add_post(
            "/api/tournament/admin/create", self.sneaky_api.tournament_admin_create)
        self.app.router.add_post(
            "/api/tournament/admin/cancel", self.sneaky_api.tournament_admin_cancel)
        self.app.router.add_post(
            "/api/tournament/admin/teams", self.sneaky_api.tournament_admin_save_teams)
        self.app.router.add_post(
            "/api/tournament/admin/lock", self.sneaky_api.tournament_admin_lock)
        self.app.router.add_post(
            "/api/tournament/admin/match/complete", self.sneaky_api.tournament_admin_complete_match)
        self.app.router.add_post(
            "/api/tournament/admin/match/revert", self.sneaky_api.tournament_admin_revert_match)
        self.app.router.add_post(
            "/api/tournament/admin/game/revert", self.sneaky_api.tournament_admin_revert_game)
        self.app.router.add_post(
            "/api/tournament/admin/schedule", self.sneaky_api.tournament_admin_save_schedule)
        self.app.router.add_post(
            "/api/tournament/admin/pin-match", self.sneaky_api.tournament_admin_pin_match)
        self.app.router.add_post(
            "/api/tournament/admin/game-score", self.sneaky_api.tournament_admin_game_score)
        self.app.router.add_post(
            "/api/tournament/admin/match-game-stage", self.sneaky_api.tournament_admin_set_match_game_stage)
        self.app.router.add_post(
            "/api/tournament/admin/report-game", self.sneaky_api.tournament_admin_report_game)
        self.app.router.add_get(
            "/api/tournament/admin/map-pool", self.sneaky_api.tournament_admin_get_map_pool)
        self.app.router.add_post(
            "/api/tournament/admin/map-pool", self.sneaky_api.tournament_admin_set_map_pool)
        self.app.router.add_get(
            "/api/tournament/admin/map-pool-presets", self.sneaky_api.tournament_admin_list_presets)
        self.app.router.add_post(
            "/api/tournament/admin/map-pool-presets", self.sneaky_api.tournament_admin_save_preset)
        self.app.router.add_post(
            "/api/tournament/admin/map-pool-presets/delete", self.sneaky_api.tournament_admin_delete_preset)
        self.app.router.add_post(
            "/api/tournament/admin/map-pool-presets/apply", self.sneaky_api.tournament_admin_apply_preset)
        self.app.router.add_get(
            "/api/tournament/overlay/map-pool", self.sneaky_api.serve_overlay_map_pool)
        self.app.router.add_post(
            "/api/tournament/admin/signup/add", self.sneaky_api.tournament_admin_add_signup)
        self.app.router.add_post(
            "/api/tournament/admin/signup/remove", self.sneaky_api.tournament_admin_remove_signups)
        self.app.router.add_post(
            "/api/tournament/admin/team-size", self.sneaky_api.tournament_admin_update_team_size)
        self.app.router.add_get(
            "/api/tournament/overlay", self.sneaky_api.serve_overlay_data)
        self.app.router.add_get(
            "/api/tournament/overlay-upnext", self.sneaky_api.serve_overlay_upnext)
        self.app.router.add_get(
            "/api/tournament/overlay/settings", self.sneaky_api.serve_overlay_settings)
        self.app.router.add_post(
            "/api/tournament/admin/overlay-settings", self.sneaky_api.tournament_admin_set_overlay_settings)
        self.app.router.add_post(
            "/api/tournament/admin/private-rotation", self.sneaky_api.tournament_admin_set_private_rotation)
        self.app.router.add_get(
            "/api/player/{discord_id}", self.sneaky_api.serve_player_profile)
        self.app.router.add_get(
            "/api/leaderboard", self.sneaky_api.serve_leaderboard)
        self.app.router.add_get(
            "/api/admin/players", self.sneaky_api.serve_all_players)
        self.app.router.add_post(
            "/api/admin/player/{player_id}/rank", self.sneaky_api.admin_set_player_rank)
        self.app.router.add_post(
            "/api/admin/player/{player_id}/splattag", self.sneaky_api.admin_override_splattag)
        self.app.router.add_post(
            "/api/admin/player/{player_id}/discord", self.sneaky_api.admin_set_discord)
        self.app.router.add_get(
            "/api/admin/discord-lookup", self.sneaky_api.admin_discord_lookup)
        self.app.router.add_post(
            "/api/admin/player/{player_id}/twitch-native/toggle", self.sneaky_api.admin_toggle_twitch_native)
        self.app.router.add_post(
            "/api/admin/player/{player_id}/tournament-wins", self.sneaky_api.admin_adjust_tournament_wins)
        self.app.router.add_delete(
            "/api/admin/player/{player_id}", self.sneaky_api.admin_delete_player)
        self.app.router.add_post(
            "/api/admin/tournament/end", self.sneaky_api.admin_end_tournament)

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


