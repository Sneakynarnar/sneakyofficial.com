"""Splatoon Bingo suggestion channel.

Members post challenge ideas in one dedicated channel. Every message there is
checked against the posted rules: ten suggestions per person in total, over as
many messages as they like, nothing offensive and nothing empty. Accepted
messages get their suggestions put into the pool the admin dashboard draws
bingo cards from; ones the bot cannot read get a ❌ and an explanation by DM.

A message that would take somebody past ten is refused whole and deleted, with
a DM saying how many they have left. Counting part of it would leave them
guessing which of their ideas survived, and deleting keeps the channel to
submissions that actually landed.

Reactions track how far along a submission is:

* ✅ 👁️ — the bot accepted it, an admin still has to review the suggestions
* ✅      — every suggestion in that message was approved
* ❌      — the bot turned the message away, or every suggestion was rejected

On startup the bot reads back through the channel from the rules message and
processes anything it missed while it was down, then repairs the reactions on
everything it already knows about.
"""
import asyncio
import logging

import interactions
from interactions import (
    Embed, OptionType, Permissions, slash_command, slash_default_member_permission,
    slash_option,
)
from interactions.api.events import MessageCreate, Startup

from backend.bingo import BingoManager, MAX_PER_PERSON, parse_submission
from backend.bingo import notifier
from backend.util.config import global_config

logger = logging.getLogger("BingoExt")

BINGO_CHANNEL_ID = 1544677631440592916
BINGO_GUILD_ID = 1019293451579293747

REJECTED_EMOJI = notifier.REJECTED_EMOJI

# Catch-up starts just after the rules message, so the rules post itself and
# anything said before it are never treated as submissions.
CATCHUP_AFTER_MESSAGE_ID = 1544679218305310781
CATCHUP_LIMIT = 2000

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
    f"• You can submit up to **{MAX_PER_PERSON} suggestions in total**\n"
    "• Spread them over as many messages as you like\n"
    f"• A message that would take you past {MAX_PER_PERSON} is deleted and none "
    "of it counts, so I'll DM you how many you have left\n"
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
    embed.add_field(
        "Numbering",
        "Just number them from 1 in each message. It's the running total across "
        f"all your messages that has to stay under {MAX_PER_PERSON}.",
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
        await self._process_message(message, notify=True)

    def _is_submission(self, message: interactions.Message) -> bool:
        """Whether a message in the channel should be read as a submission.

        Admins run the channel, so let them post rules and answer questions
        without every message being treated as an entry.
        """
        author = message.author
        if author is None or author.bot:
            return False
        return int(author.id) not in global_config.tournament_admin_ids

    async def _process_message(self, message: interactions.Message,
                               notify: bool = True,
                               delete_over_limit: bool = True) -> str:
        """Run one channel message through the submission rules.

        Args:
            message: The message to judge.
            notify: Whether to DM the author about the outcome. Catch-up turns
                this down so a backlog cannot become a wall of DMs.
            delete_over_limit: Whether a message that busts the member's
                allowance is deleted. Off during catch-up, which would
                otherwise quietly delete a pile of old messages nobody is
                watching.

        Returns:
            One of skipped, accepted, over_limit or invalid.
        """
        if not self._is_submission(message):
            return "skipped"

        author = message.author
        author_id = int(author.id)
        guild_id = int(message.guild.id) if message.guild else BINGO_GUILD_ID

        try:
            ok, error, suggestions = parse_submission(message.content or "")
            if not ok:
                await self._reject(message, error or "That submission couldn't be read.",
                                   notify=notify)
                return "invalid"

            display_name = getattr(author, "display_name", None) or author.username
            saved, msg, remaining = await BingoManager.record_submission(
                guild_id=guild_id,
                channel_id=BINGO_CHANNEL_ID,
                message_id=int(message.id),
                discord_id=author_id,
                display_name=display_name,
                suggestions=suggestions,
            )
            if not saved:
                await self._over_limit(message, msg, notify=notify,
                                       delete=delete_over_limit)
                return "over_limit"

            await self._accept(message, suggestions, remaining, notify=notify)
            return "accepted"
        except Exception:
            logger.exception("Failed to process bingo submission from %s", author_id)
            return "skipped"

    async def _accept(self, message: interactions.Message, suggestions: list[str],
                      remaining: int, notify: bool = True) -> None:
        """React to and confirm an accepted submission."""
        # The notifier owns the reactions, so an accepted message picks up the
        # ✅ and the 👁️ that says an admin still has to look at it.
        await notifier.sync_message(self.bot, int(message.id), BINGO_CHANNEL_ID)
        if not notify:
            return
        listed = "\n".join(f"{i}. {s}" for i, s in enumerate(suggestions, start=1))
        count = len(suggestions)
        tail = (
            f"You can still submit {remaining} more."
            if remaining else
            f"That's all {MAX_PER_PERSON} of your suggestions used."
        )
        await self._notify(
            message,
            f"✅ Thanks! Your {count} Splatoon Bingo suggestion"
            f"{'s are' if count != 1 else ' is'} in:\n\n{listed}\n\n"
            f"{tail} They'll be reviewed before they go on a card, and I'll let "
            "you know here if any of them don't make it.",
        )

    async def _over_limit(self, message: interactions.Message, reason: str,
                          notify: bool = True, delete: bool = True) -> None:
        """Turn away a message that busts the member's allowance.

        The message is deleted rather than left with a ❌, so the channel only
        ever holds submissions that actually counted.
        """
        # DM first: once the message is gone there is no author to reply to.
        if notify:
            await self._notify(message, f"❌ {reason}", fallback=not delete)

        if not delete:
            await self._react(message, REJECTED_EMOJI)
            return

        try:
            await message.delete()
        except Exception:
            logger.warning("Could not delete over-limit bingo message %s", message.id)
            await self._react(message, REJECTED_EMOJI)

    async def _reject(self, message: interactions.Message, reason: str,
                      notify: bool = True) -> None:
        """React to and explain a submission the bot could not read."""
        await self._react(message, REJECTED_EMOJI)
        if notify:
            await self._notify(message, f"❌ {reason}")

    async def _react(self, message: interactions.Message, emoji: str) -> None:
        """Add a verdict reaction, tolerating missing permissions."""
        try:
            await message.add_reaction(emoji)
        except Exception:
            logger.warning("Could not react %s to message %s", emoji, message.id)

    async def _notify(self, message: interactions.Message, text: str,
                      fallback: bool = True) -> None:
        """DM the submitter, falling back to a self-deleting channel reply.

        The fallback is turned off when the message itself is about to be
        deleted, since a reply pointing at a message that no longer exists
        explains nothing.
        """
        try:
            await message.author.send(text)
            return
        except Exception:
            logger.debug("DM to %s failed", message.author.id)

        if not fallback:
            logger.warning("Could not tell %s why their message was removed", message.author.id)
            return

        try:
            reply = await message.reply(text)
            await asyncio.sleep(_FALLBACK_REPLY_TTL)
            await reply.delete()
        except Exception:
            logger.warning("Could not notify %s about their submission", message.author.id)

    # ------------------------------------------------------------------ #
    #  Startup catch-up                                                   #
    # ------------------------------------------------------------------ #

    @interactions.listen(Startup)
    async def on_startup(self) -> None:
        """Pick up anything posted while the bot was down."""
        try:
            summary = await self.catch_up()
            logger.info("Bingo catch-up: %s", summary)
        except Exception:
            logger.exception("Bingo catch-up failed")

    async def catch_up(self, notify: bool = True) -> dict[str, int]:
        """Read the channel forward from the rules message and process the gap.

        Messages the bot has already ruled on are skipped, so this is safe to
        run as often as you like. Everything it does know about is re-synced
        afterwards, which repairs reactions that were cleared or missed.

        Over-limit messages found here are marked with a ❌ rather than deleted,
        unlike the live path, so a backfill cannot quietly clear out history.

        Args:
            notify: Whether to DM authors about newly processed messages. Even
                when on, each person is only DMed once per run, so a backlog
                cannot turn into a wall of DMs.

        Returns:
            Counts of what happened, for logging and the slash command.
        """
        counts = {"scanned": 0, "accepted": 0, "over_limit": 0, "invalid": 0,
                  "skipped": 0, "resynced": 0}

        channel = await self.bot.fetch_channel(BINGO_CHANNEL_ID)
        if channel is None:
            logger.warning("Bingo channel %s is not reachable", BINGO_CHANNEL_ID)
            return counts

        known = await BingoManager.known_message_ids(BINGO_GUILD_ID)
        dmed: set[int] = set()

        # history(after=...) walks forward in time, which matters: the one
        # message per person rule has to be applied in the order people posted.
        async for message in channel.history(limit=CATCHUP_LIMIT,
                                             after=CATCHUP_AFTER_MESSAGE_ID):
            counts["scanned"] += 1
            if int(message.id) in known or not self._is_submission(message):
                continue

            author_id = int(message.author.id)
            should_dm = notify and author_id not in dmed
            # Catch-up never deletes: a backlog nobody is watching is the wrong
            # place to start removing people's messages.
            outcome = await self._process_message(message, notify=should_dm,
                                                  delete_over_limit=False)
            counts[outcome] = counts.get(outcome, 0) + 1
            if should_dm and outcome != "skipped":
                dmed.add(author_id)

        # Reactions drift when the bot is offline or a member clears them, so
        # bring every stored submission back to what its review state says.
        counts["resynced"] = await notifier.sync_messages(
            self.bot, await BingoManager.all_message_ids(BINGO_GUILD_ID)
        )
        return counts

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
        embed.add_field("Awaiting review", str(stats["pending"]), inline=True)
        embed.add_field("Approved", str(stats["approved"]), inline=True)
        embed.add_field("Rejected", str(stats["rejected"]), inline=True)
        embed.add_field("Ready for a card", str(stats["available"]), inline=True)
        embed.add_field("Used on cards", str(stats["used"]), inline=True)
        embed.add_field("Excluded", str(stats["excluded"]), inline=True)
        embed.add_field("Total suggestions", str(stats["total"]), inline=True)
        embed.add_field("Submitters", str(stats["submitters"]), inline=True)
        embed.add_field("Cards made", str(stats["cards"]), inline=True)
        embed.set_footer(text="Manage the pool and build cards at /admin")
        await ctx.send(embed=embed, ephemeral=True)

    @bingo.subcommand(sub_cmd_name="catchup", sub_cmd_description="Process any messages the bot missed")
    @slash_default_member_permission(Permissions.MANAGE_GUILD)
    @slash_option(
        name="notify",
        description="DM authors about newly processed messages (default: no)",
        required=False,
        opt_type=OptionType.BOOLEAN,
    )
    async def bingo_catchup(self, ctx: interactions.SlashContext, notify: bool = False) -> None:
        await ctx.defer(ephemeral=True)
        counts = await self.catch_up(notify=notify)
        embed = Embed(title="🎲 Bingo catch-up", color=global_config.theme_colour)
        embed.add_field("Scanned", str(counts["scanned"]), inline=True)
        embed.add_field("Newly accepted", str(counts["accepted"]), inline=True)
        embed.add_field("Over allowance", str(counts["over_limit"]), inline=True)
        embed.add_field("Badly formatted", str(counts["invalid"]), inline=True)
        embed.add_field("Reactions resynced", str(counts["resynced"]), inline=True)
        await ctx.send(embed=embed, ephemeral=True)


def setup(bot: interactions.Client) -> None:
    """Set up the bingo extension for the bot."""
    BingoExt(bot)
