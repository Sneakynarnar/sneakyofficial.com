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


load_dotenv()
global_config = Config()
