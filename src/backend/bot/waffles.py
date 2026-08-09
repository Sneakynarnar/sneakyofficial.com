"""Waffle treat responses.

The bot only accepts waffle treats from its master: when the master posts a
waffle emoji it happily eats it, and when anyone else does it politely refuses.
"""
import logging
import random
import re

import interactions
from interactions.api.events import MessageCreate

logger = logging.getLogger("WaffleExt")

MASTER_ID = 339866237922181121

# Unicode waffle, plus any custom server emoji named something like :waffle:
_UNICODE_WAFFLE = "\N{WAFFLE}"
_CUSTOM_WAFFLE = re.compile(r"<a?:\w*waffle\w*:\d+>", re.IGNORECASE)

MASTER_RESPONSES = [
    "*excitedly grabs and chomps on the waffle treat* Thanks, Sneaky!",
    "*snatches the waffle treat and munches happily* Thank you, Sneaky!",
    "*eagerly takes the waffle treat and nibbles away* You're the best, Sneaky!",
    "*grabs the waffle treat and devours it in one bite* Thanks, Sneaky!",
    "*wiggles with delight and chomps down on the waffle treat* Thank you, Sneaky!",
    "*happily accepts the waffle treat and crunches into it* Much appreciated, Sneaky!",
    "*bounces over, grabs the waffle treat and gobbles it up* Thanks a bunch, Sneaky!",
    "*carefully takes the waffle treat, then chomps it eagerly* Thank you, Sneaky!",
]

REFUSAL_RESPONSES = [
    "I'm only allowed to accept treats from my master, sorry!",
    "As tempting as that looks, I can only take treats from my master.",
    "No thank you, my master is the only one I accept treats from.",
    "I'd love to, but only my master is allowed to feed me treats.",
    "*sniffs the waffle longingly* I can only accept treats from my master.",
    "*looks away sadly* Only my master may give me treats.",
]


def _has_waffle(content: str) -> bool:
    """Return whether a message contains a waffle emoji."""
    return _UNICODE_WAFFLE in content or bool(_CUSTOM_WAFFLE.search(content))


class WaffleExt(interactions.Extension):
    """Reacts to waffle emojis posted in chat."""

    def __init__(self, bot: interactions.Client) -> None:
        self.bot = bot

    @interactions.listen(MessageCreate)
    async def on_message(self, event: MessageCreate) -> None:
        message = event.message
        author = message.author
        if author is None or author.bot:
            return
        if not _has_waffle(message.content or ""):
            return

        if int(author.id) == MASTER_ID:
            reply = random.choice(MASTER_RESPONSES)
        else:
            reply = random.choice(REFUSAL_RESPONSES)

        try:
            await message.reply(reply)
        except Exception:
            logger.warning("Failed to reply to waffle from %s", author.id)


def setup(bot: interactions.Client) -> None:
    """Set up the waffle extension for the bot."""
    WaffleExt(bot)
