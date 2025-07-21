import argparse
import asyncio
import traceback
import os
import logging
import pkgutil
from typing import List
from dotenv import load_dotenv
import interactions
from interactions import Intents
from backend.util import global_config
from backend.website import WebServer, __version__, __author__, setup_logging

setup_logging()

logger = logging.getLogger("sneakyoffical.com")
# fmt: off
# pylint: disable=line-too-long
ASCII_BANNER = fr"""
=================================================================================================================================================================

  ______                                 __                             ______    ______   __                      __
 /      \                               /  |                           /      \  /      \ /  |                    /  |
/$$$$$$  | _______    ______    ______  $$ |   __  __    __   ______  /$$$$$$  |/$$$$$$  |$$/   _______   ______  $$ |      _______   ______   _____  ____
$$ \__$$/ /       \  /      \  /      \ $$ |  /  |/  |  /  | /      \ $$ |_ $$/ $$ |_ $$/ /  | /       | /      \ $$ |     /       | /      \ /     \/    \
$$      \ $$$$$$$  |/$$$$$$  | $$$$$$  |$$ |_/$$/ $$ |  $$ |/$$$$$$  |$$   |    $$   |    $$ |/$$$$$$$/  $$$$$$  |$$ |    /$$$$$$$/ /$$$$$$  |$$$$$$ $$$$  |
 $$$$$$  |$$ |  $$ |$$    $$ | /    $$ |$$   $$<  $$ |  $$ |$$ |  $$ |$$$$/     $$$$/     $$ |$$ |       /    $$ |$$ |    $$ |      $$ |  $$ |$$ | $$ | $$ |
/  \__$$ |$$ |  $$ |$$$$$$$$/ /$$$$$$$ |$$$$$$  \ $$ \__$$ |$$ \__$$ |$$ |      $$ |      $$ |$$ \_____ /$$$$$$$ |$$ | __ $$ \_____ $$ \__$$ |$$ | $$ | $$ |
$$    $$/ $$ |  $$ |$$       |$$    $$ |$$ | $$  |$$    $$ |$$    $$/ $$ |      $$ |      $$ |$$       |$$    $$ |$$ |/  |$$       |$$    $$/ $$ | $$ | $$ |
 $$$$$$/  $$/   $$/  $$$$$$$/  $$$$$$$/ $$/   $$/  $$$$$$$ | $$$$$$/  $$/       $$/       $$/  $$$$$$$/  $$$$$$$/ $$/ $$/  $$$$$$$/  $$$$$$/  $$/  $$/  $$/
                                                  /  \__$$ |
                                                  $$    $$/
                                                   $$$$$$/

==================================================================================================================================================================
Version: {__version__}
==================================================================================================================================================================
Author: {__author__}
==================================================================================================================================================================
"""
# pylint: enable=line-too-long
# fmt: on

logger.info(ASCII_BANNER)

parser = argparse.ArgumentParser(description="Sneaky's application")
parser.add_argument('--override-env', action='store_true',
                    help='Override environment variables')
args = parser.parse_args()

load_dotenv(override=args.override_env)
INTENTS = Intents.PRIVILEGED | Intents.GUILD_MESSAGES | Intents.GUILDS | Intents.GUILD_VOICE_STATES | \
    Intents.DIRECT_MESSAGES | Intents.REACTIONS
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_DIR = os.path.join(CURRENT_DIR, 'backend', 'bot')

bot = interactions.Client(intents=INTENTS)

ext_names: List[str] = [m.name for m in pkgutil.iter_modules([BOT_DIR], prefix='backend.bot.')]
for ext in ext_names:
    try:
        bot.load_extension(ext)
        logger.info("Loaded %s", ext + ".")
    except Exception as e:
        logger.error("Error loading %s: %s", ext + " extention.", e)
        traceback.print_exc()


async def run_services() -> None:
    """Run the main application services.

    Starts the web server and Discord bot concurrently,
    handling the main application loop.
    """
    """
    Main method
    """
    webserver = WebServer(bot=bot)
    logger.info("Using client ID: %s", global_config.client_id)
    logger.info("Running the application...")
    await asyncio.gather(
        webserver.run(),
        bot.astart(global_config.discord_token),
    )

if __name__ == "__main__":
    try:
        asyncio.run(run_services())
    except RuntimeError as e:
        if str(e) == "asyncio.run() cannot be called from a running event loop":
            loop = asyncio.get_event_loop()
            loop.run_until_complete(run_services())
        else:
            raise ValueError() from e
    except KeyboardInterrupt:
        print("Shutting down...")
