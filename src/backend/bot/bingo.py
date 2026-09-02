"""Splatoon Bingo suggestion channel.

Members post challenge ideas in one dedicated channel. Every message there is
checked against the posted rules: one accepted message per person, up to three
numbered suggestions in it, nothing offensive and nothing empty. Accepted
messages get a ✅ and their suggestions land in the pool the admin dashboard
draws bingo cards from; rejected ones get a ❌ and an explanation, sent by DM so
the channel stays readable.

A member is only locked out once a message has been *accepted*. Somebody whose
first attempt was misformatted can fix it and post again, which is the rule
working as intended rather than a loophole.
"""
import asyncio
import logging

import interactions
from interactions import (
    Embed, OptionType, Permissions, slash_command, slash_default_member_permission,
    slash_option,
)
from interactions.api.events import MessageCreate

from backend.bingo import BingoManager, MAX_SUGGESTIONS, parse_submission
from backend.util.config import global_config

logger = logging.getLogger("BingoExt")

BINGO_CHANNEL_ID = 1544677631440592916
BINGO_GUILD_ID = 1019293451579293747

ACCEPTED_EMOJI = "✅"
REJECTED_EMOJI = "❌"

# How long a fallback in-channel reply stays up when a member's DMs are closed.
_FALLBACK_REPLY_TTL = 30

RULES_TEXT = (
    "As I've said, I want to do some long form content so introducing my "
    "**SPLATOON BINGO SERIES**\n\n"
    "We're going to be making a Splatoon Bingo video where a friend and I will "
    "compete to complete different challenges in-game. First person to get "
    "**BINGO** wins!\n\n"
    "If you'd like to suggest a challenge for the bingo cards, please follow "
    "these rules."
)

RULES_SUBMISSION = (
    "• **ONE message per person**\n"
    f"• You can submit up to **{MAX_SUGGESTIONS} suggestions** in your message\n"
    "• Any messages sent after your first submission will be ignored\n"
    "• Suggestions must be something that can actually be completed within a "
    "Splatoon game"
)

RULES_CONTENT = (
    "• Challenges can involve any part of the game, not just multiplayer. Story "
    "mode, Salmon Run, Side Order, gear, weapons, etc. are all fair game!\n"
    "• Please keep challenges reasonable and not ridiculously difficult\n"
    "• Avoid tasks that take a huge amount of time for relatively little "
    "payoff. For example, completing 15 floors of Side Order isn't really "
    "time-effective for a bingo square.\n"
    "• Similarly, we'd rather avoid challenges that are basically just \"get X "
    "wins in Ranked\" when a more interesting objective could be used instead.\n"
    "• Think of things that would make for a fun video, not something that "
    "requires us to spend 4 hours grinding for one square."
)

RULES_FORMAT = (
    "```\n1. First suggestion\n2. Second suggestion\n3. Third suggestion\n```"
)


def _rules_embed() -> Embed:
    """Build the pinned submission rules embed."""
    embed = Embed(
        title="🎲 SPLATOON BINGO SUGGESTIONS 🎲",
        description=RULES_TEXT,
        color=global_config.theme_colour,
    )
    embed.add_field("📌 Submission Rules", RULES_SUBMISSION, inline=False)
    embed.add_field("What makes a good square", RULES_CONTENT, inline=False)
    embed.add_field(
        "There may be more than one Bingo video",
        "Don't worry if your suggestion isn't picked for the first one! Your "
        "suggestion could still be used in a future Bingo card. 👀",
        inline=False,
    )
    embed.add_field(
        "Please format your suggestions exactly like this",
        RULES_FORMAT,
        inline=False,
    )
    embed.set_footer(text="The bot reacts ✅ when your submission is saved, or ❌ with a reason.")
    return embed


class BingoExt(interactions.Extension):
    """Collects and validates Splatoon Bingo suggestions."""

    def __init__(self, bot: interactions.Client) -> None:
        self.bot = bot

    # ------------------------------------------------------------------ #
    #  Submission handling                                                #
    # ------------------------------------------------------------------ #

    @interactions.listen(MessageCreate)
    async def on_message(self, event: MessageCreate) -> None:
        """Validate and store a suggestion posted in the bingo channel."""
        message = event.message
        if message.channel is None or int(message.channel.id) != BINGO_CHANNEL_ID:
            return

        author = message.author
        if author is None or author.bot:
            return

        author_id = int(author.id)
        # Admins run the channel, so let them post rules and answer questions
        # without every message being treated as a submission.
        if author_id in global_config.tournament_admin_ids:
            return

        guild_id = int(message.guild.id) if message.guild else BINGO_GUILD_ID

        try:
            existing = await BingoManager.get_submitter(guild_id, author_id)
            if existing:
                await self._reject(
                    message,
                    "You've already submitted for Splatoon Bingo, and only your "
                    "first message counts. Everything you sent in that message "
                    "is safely in the pool — there'll be more Bingo videos, so "
                    "keep your other ideas for next time!",
                )
                return

            ok, error, suggestions = parse_submission(message.content or "")
            if not ok:
                await self._reject(message, error or "That submission couldn't be read.")
                return

            display_name = getattr(author, "display_name", None) or author.username
            saved, msg = await BingoManager.record_submission(
                guild_id=guild_id,
                channel_id=BINGO_CHANNEL_ID,
                message_id=int(message.id),
                discord_id=author_id,
                display_name=display_name,
                suggestions=suggestions,
            )
            if not saved:
                await self._reject(message, msg)
                return

            await self._accept(message, suggestions)
        except Exception:
            logger.exception("Failed to process bingo submission from %s", author_id)

    async def _accept(self, message: interactions.Message, suggestions: list[str]) -> None:
        """React to and confirm an accepted submission."""
        await self._react(message, ACCEPTED_EMOJI)
        listed = "\n".join(f"{i}. {s}" for i, s in enumerate(suggestions, start=1))
        count = len(suggestions)
        await self._notify(
            message,
            f"✅ Thanks! Your {count} Splatoon Bingo suggestion"
            f"{'s are' if count != 1 else ' is'} in:\n\n{listed}\n\n"
            "That was your one submission, so anything you post after this "
            "won't be counted. Good luck — your idea might turn up on a card!",
        )

    async def _reject(self, message: interactions.Message, reason: str) -> None:
        """React to and explain a rejected submission."""
        await self._react(message, REJECTED_EMOJI)
        await self._notify(message, f"❌ {reason}")

    async def _react(self, message: interactions.Message, emoji: str) -> None:
        """Add a verdict reaction, tolerating missing permissions."""
        try:
            await message.add_reaction(emoji)
        except Exception:
            logger.warning("Could not react %s to message %s", emoji, message.id)

    async def _notify(self, message: interactions.Message, text: str) -> None:
        """DM the submitter, falling back to a self-deleting channel reply."""
        try:
            await message.author.send(text)
            return
        except Exception:
            logger.debug("DM to %s failed, replying in channel instead", message.author.id)

        try:
            reply = await message.reply(text)
            await asyncio.sleep(_FALLBACK_REPLY_TTL)
            await reply.delete()
        except Exception:
            logger.warning("Could not notify %s about their submission", message.author.id)

    # ------------------------------------------------------------------ #
    #  Admin commands                                                     #
    # ------------------------------------------------------------------ #

    @slash_command(
        name="bingo",
        description="Splatoon Bingo suggestions",
        scopes=[BINGO_GUILD_ID],
    )
    async def bingo(self, ctx: interactions.SlashContext) -> None:
        pass

    @bingo.subcommand(sub_cmd_name="rules", sub_cmd_description="Post the submission rules in this channel")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    async def bingo_rules(self, ctx: interactions.SlashContext) -> None:
        await ctx.send(embed=_rules_embed())

    @bingo.subcommand(sub_cmd_name="stats", sub_cmd_description="How the suggestion pool is looking")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    async def bingo_stats(self, ctx: interactions.SlashContext) -> None:
        await ctx.defer(ephemeral=True)
        stats = await BingoManager.get_stats(BINGO_GUILD_ID)
        embed = Embed(
            title="🎲 Splatoon Bingo pool",
            color=global_config.theme_colour,
        )
        embed.add_field("Available", str(stats["available"]), inline=True)
        embed.add_field("Used on cards", str(stats["used"]), inline=True)
        embed.add_field("Excluded", str(stats["excluded"]), inline=True)
        embed.add_field("Total suggestions", str(stats["total"]), inline=True)
        embed.add_field("Submitters", str(stats["submitters"]), inline=True)
        embed.add_field("Cards made", str(stats["cards"]), inline=True)
        embed.set_footer(text="Manage the pool and build cards at /admin")
        await ctx.send(embed=embed, ephemeral=True)

    @bingo.subcommand(sub_cmd_name="reset", sub_cmd_description="Let a member submit again")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(name="member", description="The member to unlock", required=True, opt_type=OptionType.USER)
    async def bingo_reset(self, ctx: interactions.SlashContext, member: interactions.Member) -> None:
        await ctx.defer(ephemeral=True)
        removed = await BingoManager.reset_submitter(BINGO_GUILD_ID, int(member.id))
        if removed:
            text = (f"{member.mention} can submit again. Their existing suggestions are "
                    "still in the pool — remove those from the admin dashboard if you "
                    "want a clean slate.")
        else:
            text = f"{member.mention} hasn't submitted yet, so there was nothing to reset."
        await ctx.send(text, ephemeral=True)


def setup(bot: interactions.Client) -> None:
    """Set up the bingo extension for the bot."""
    BingoExt(bot)
