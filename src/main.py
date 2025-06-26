# pylint: skip-file
# flake8: noqa
import argparse
import asyncio
import traceback
import os
import logging
import pkgutil
# import nest_asyncio
from dotenv import load_dotenv
import interactions
from interactions.ext import prefixed_commands
from interactions import Intents
from interactions.ext.prefixed_commands.help import PrefixedHelpCommand

from backend.website import WebServer, __version__, __author__, setup_logging

setup_logging()

logger = logging.getLogger("sneakyoffical.com")
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

logger.info(ASCII_BANNER)

# Argument parser setup
parser = argparse.ArgumentParser(description="Sneaky's application")
parser.add_argument('--override-env', action='store_true',
                    help='Override environment variables')
args = parser.parse_args()

load_dotenv(override=args.override_env)
# nest_asyncio.apply()
# INTENTS = Intents.PRIVILEGED | Intents.GUILD_MESSAGES | Intents.GUILDS | Intents.GUILD_VOICE_STATES | \
#     Intents.DIRECT_MESSAGES | Intents.REACTIONS
# CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# BOT_DIR = os.path.join(CURRENT_DIR, 'bot')

# bot = interactions.Client(intents=INTENTS)
# if config.TEST:
#     prefixed_commands.setup(client=bot, default_prefix=[
#                             "?", f"<@{config.DISCORD_CLIENT_ID}> "])
# else:
#     prefixed_commands.setup(client=bot, default_prefix=[
#                             "!", f"<@{config.DISCORD_CLIENT_ID}> "])
# ext_names = [m.name for m in pkgutil.iter_modules([BOT_DIR], prefix='bot.')]
# for ext in ext_names:
#     try:
#         bot.load_extension(ext)
#         logger.info("Loaded %s", ext + ".")
#     except Exception as e:
#         logger.error("Error loading %s: %s", ext + "extention.", e)
#         traceback.print_exc()

# help_cmd = PrefixedHelpCommand(
#     client=bot, embed_color=config.THEME_COLOUR, show_aliases=True, show_prefix=True)
# help_cmd.register()


async def main():
    webserver = WebServer()
    try:
        await webserver.run()
        while True:
            await asyncio.sleep(3600)  # keep alive
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        await webserver.close()

if __name__ == "__main__":
    asyncio.run(main())