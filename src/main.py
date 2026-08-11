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
from backend.util.database_context_manager import DBContextManager
from backend.website import WebServer, __version__, __author__, setup_logging
from backend.twitch import TwitchBot

setup_logging()

logger = logging.getLogger("sneakyofficial.com")
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


async def run_discord_bot() -> None:
    """Run the Discord bot, restarting the gateway if it ever drops out.

    interactions.py swallows unhandled exceptions raised inside its shard task
    (``ConnectionState._ws_connect``): it logs the traceback and simply returns.
    ``astart()`` then returns normally, so the process stays alive with no
    gateway connection at all. Because the HTTP client transparently re-logs in
    when its session is closed, background tasks (Splatdle reminders and the
    like) carry on posting messages, which makes the bot look healthy while
    slash commands, buttons and member joins are silently dead until a manual
    restart. Supervise the gateway here so it comes back on its own.
    """
    backoff = 5
    while True:
        started_at = asyncio.get_event_loop().time()
        try:
            await bot.astart(global_config.discord_token)
            logger.error("Discord gateway exited unexpectedly, reconnecting in %ss", backoff)
        except Exception:  # CancelledError is a BaseException, so shutdown still propagates
            logger.exception("Discord gateway crashed, reconnecting in %ss", backoff)

        # A connection that lasted a while is a healthy one, so start over from
        # a short delay rather than punishing it for an earlier bad patch.
        if asyncio.get_event_loop().time() - started_at > 300:
            backoff = 5

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 300)


async def run_services() -> None:
    """Run the main application services."""
    webserver = WebServer(bot=bot)
    logger.info("Using client ID: %s", global_config.client_id)
    logger.info("Running the application...")

    services = [
        webserver.run(),
        run_discord_bot(),
    ]

    if global_config.twitch_bot_token and global_config.twitch_channel:
        twitch_bot = TwitchBot(discord_bot=bot)
        logger.info("Starting Twitch bot for channel: %s", global_config.twitch_channel)
        services.append(twitch_bot.start())
    else:
        logger.info("Twitch bot not configured — skipping (set TWITCH_BOT_TOKEN and TWITCH_CHANNEL to enable).")

    try:
        await asyncio.gather(*services)
    finally:
        await DBContextManager.close_pool()

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
