from os import getenv
from dotenv import load_dotenv
from typing import Optional


import os
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime
import logging

LOG_DIR = "logs"


class Config:
    """Configuration management class.

    Handles loading and managing application configuration from environment
    variables including Discord credentials, database settings, and server options.

    Attributes:
        client_id: Discord application client ID.
        client_secret: Discord application client secret.
        redirect_uri: OAuth redirect URI.
        mysql_database: MySQL database name.
        mysql_user: MySQL username.
        mysql_pass: MySQL password.
        mysql_host: MySQL host address.
        token: Discord bot token.
        secured: Whether to use HTTPS/SSL.
        discord_token: Discord bot token (duplicate of token).
        port: Server port number.
        discord_verify: Discord verification token.
        error_log_channel: Channel ID for error logging.
        theme_colour: Default theme color for embeds.
    """

    def __init__(self) -> None:
        """Initialize configuration with default values and load from environment.
        """
        self.client_id: Optional[str] = None
        self.client_secret: Optional[str] = None
        self.redirect_uri: Optional[str] = None
        self.mysql_database: Optional[str] = None
        self.mysql_user: Optional[str] = None
        self.mysql_pass: Optional[str] = None
        self.mysql_host: Optional[str] = None
        self.token: Optional[str] = None
        self.secured: bool = False
        self.discord_token: Optional[str] = None
        self.port: int = 8080
        self.discord_verify: str = ""
        self.error_log_channel: Optional[str] = None
        self.theme_colour: int = 0x7e32f0
        self.twitch_bot_token: Optional[str] = None
        self.twitch_bot_nick: Optional[str] = None
        self.twitch_channel: Optional[str] = None
        self.twitch_guild_id: Optional[int] = None
        self.tournament_guild_id: Optional[int] = None
        self.tournament_results_channel: Optional[int] = None
        self.website_url: str = "https://sneakyofficial.com"
        self.splatdle_url: str = "https://splatdle.ink"
        self.oauth_hosts: list[str] = []
        self.discord_invite: str = "https://discord.gg/Y6aMwgMUsC"
        self.tournament_admin_ids: list[int] = []
        self.assign_values()

    def assign_values(self) -> None:
        """Load configuration values from environment variables.
        """

        load_dotenv()
        self.client_id = getenv("DISCORD_CLIENT_ID")
        self.discord_token = getenv("DISCORD_TOKEN")
        self.client_secret = getenv("DISCORD_CLIENT_SECRET")
        self.redirect_uri = getenv("DISCORD_REDIRECT_URI")
        self.token = getenv("DISCORD_TOKEN")
        self.mysql_database = getenv("MYSQL_DB")
        self.mysql_user = getenv("MYSQL_USER")
        self.mysql_pass = getenv("MYSQL_PASS")
        self.mysql_host = getenv("MYSQL_HOST")
        self.secured = getenv("SECURED") == "1"
        self.port = getenv("PORT")
        self.discord_verify = getenv("DISCORD_VERIFY")
        self.error_log_channel = getenv("ERROR_LOG_CHANNEL")
        self.twitch_bot_token = getenv("TWITCH_BOT_TOKEN")
        self.twitch_bot_nick = getenv("TWITCH_BOT_NICK")
        self.twitch_channel = getenv("TWITCH_CHANNEL")
        twitch_guild = getenv("TWITCH_GUILD_ID")
        self.twitch_guild_id = int(twitch_guild) if twitch_guild else None
        tournament_guild = getenv("TOURNAMENT_GUILD_ID")
        self.tournament_guild_id = int(tournament_guild) if tournament_guild else None
        results_channel = getenv("TOURNAMENT_RESULTS_CHANNEL")
        self.tournament_results_channel = int(results_channel) if results_channel else None
        self.website_url = getenv("WEBSITE_URL", "https://sneakyofficial.com")
        self.splatdle_url = getenv("SPLATDLE_URL", "https://splatdle.ink")
        # Splatdle lives on its own domain but shares this backend, so the OAuth
        # flow has to be able to start and finish on either site. Each host here
        # gets its own redirect URI and its own cookie domain; anything else
        # falls back to DISCORD_REDIRECT_URI.
        oauth_hosts_raw = getenv(
            "OAUTH_HOSTS",
            "sneakyofficial.com,www.sneakyofficial.com,splatdle.ink,www.splatdle.ink",
        )
        self.oauth_hosts = [h.strip().lower() for h in oauth_hosts_raw.split(",") if h.strip()]
        self.discord_invite = getenv("DISCORD_INVITE", "https://discord.gg/Y6aMwgMUsC")
        admin_ids_raw = getenv("TOURNAMENT_ADMIN_IDS", "339866237922181121")
        self.tournament_admin_ids = [int(x.strip()) for x in admin_ids_raw.split(",") if x.strip()]


class ScannerErrorFilter(logging.Filter):
    """Filter to suppress harmless errors from malicious bots/scanners.

    Filters out error logs from invalid HTTP methods that are just
    scanner/bot traffic (SSL handshakes, Redis/Memcached probes, etc).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter out scanner-related errors.

        Args:
            record: The log record to filter.

        Returns:
            False if the record should be filtered out, True otherwise.
        """
        scanner_patterns = [
            'BadStatusLine',
            'BadHttpMessage',
            'Invalid method encountered',
            b'\x16\x03\x01'.decode('latin1', errors='ignore'),  # SSL handshake
            'MGLNDD',  # Memcached scanner
            'HELP',  # Redis scanner
        ]

        msg = record.getMessage()
        for pattern in scanner_patterns:
            if pattern in msg:
                return False

        return True


def setup_logging() -> None:
    """Set up application logging configuration.

    Configures logging with file rotation, console output, and
    appropriate log levels for different components.
    """
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

    log_filename = f"logs/bot_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s: %(message)s',
        handlers=[
            TimedRotatingFileHandler(
                log_filename, when="midnight", interval=1, backupCount=7),
            logging.StreamHandler(),
        ]
    )

    logging.getLogger('interactions').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('aiohttp.access').setLevel(logging.INFO)
    logging.getLogger('aiomysql').setLevel(logging.INFO)

    # Add filter to suppress scanner/bot errors
    scanner_filter = ScannerErrorFilter()
    logging.getLogger('aiohttp.server').addFilter(scanner_filter)


load_dotenv()
global_config = Config()
