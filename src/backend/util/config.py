from os import getenv
from dotenv import load_dotenv


"""
Module for configuring logging.
This module provides functionality for configuring the logging system in the application.
It sets up a logger with a specified log level and format, and adds a timed rotating file handler
to log messages to a file that rotates daily.
Attributes:
    log_filename (str): The filename pattern for the log files.
    logger (logging.Logger): The logger object for the module.
Example:
    To use this module, import it and configure the logging system:
    ```python
    logging_config.logger.info("Logging system configured.")
    ```
import logging
"""
import os
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime
import logging

LOG_DIR = "logs"


class Config():

    def __init__(self):
        self.client_id: str = None
        self.client_secret: str = None
        self.redirect_uri: str = None
        self.mysql_database: str = None
        self.mysql_user: str = None
        self.mysql_pass: str = None
        self.mysql_host: str = None
        self.token: str = None
        self.secured = False
        self.port = 8080
        self.assign_values()

    def assign_values(self):

        load_dotenv()
        self.client_id = getenv("DISCORD_CLIENT_ID")
        self.client_secret = getenv("DISCORD_CLIENT_SECRET")
        self.redirect_uri = getenv("DISCORD_REDIRECT_URI")
        self.token = getenv("DISCORD_TOKEN")
        self.mysql_database = getenv("MYSQL_DB")
        self.mysql_user = getenv("MYSQL_USER")
        self.mysql_pass = getenv("MYSQL_PASS")
        self.mysql_host = getenv("MYSQL_HOST")
        self.secured = getenv("SECURED") == "1"
        self.port = getenv("PORT")


def setup_logging():
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

    # asyncio.get_event_loop().set_debug(True)
    logging.getLogger('interactions').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('aiohttp.access').setLevel(logging.INFO)
    logging.getLogger('aiomysql').setLevel(logging.INFO)


global_config = Config()
