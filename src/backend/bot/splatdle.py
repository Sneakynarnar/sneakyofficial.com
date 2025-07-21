"""
devtools.py
"""
import logging
from typing import Optional

import interactions
from interactions import slash_command, slash_option, OptionType, Permissions, slash_default_member_permission
from backend.util.database_context_manager import DBContextManager
from backend.util.config import global_config
from interactions.ext.paginators import Paginator

logger = logging.getLogger("OCE-4Mans")


class SplatdleExt(interactions.Extension):
    """Splatdle game commands extension.

    Provides slash commands for displaying Splatdle leaderboards, player statistics,
    and administrative functions for managing Splatdle announcement channels.

    Attributes:
        bot: The Discord bot client instance.
        error_log_channel: Optional channel for logging errors.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the Splatdle extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.error_log_channel: Optional[interactions.GuildChannel] = None

    @slash_command(
        name="splatdle-leaderboard",
        description="Show the splatdle leaderboard",
    )
    @slash_option(
        name="today", description="whether to just show today's leaderboard", opt_type=OptionType.BOOLEAN
    )
    async def leaderboard(self, ctx: interactions.SlashContext, today: bool = False) -> None:
        """Display the Splatdle leaderboard.

        Shows either the global leaderboard (sorted by weighted score) or today's
        leaderboard (sorted by guess count). Uses pagination for large lists.

        Args:
            ctx: The slash command context.
            today: Whether to show today's leaderboard only (default: False).
        """
        pages: list[interactions.Embed] = []
        players_per_page: int = 10
        counter: int = 0
        embed: Optional[interactions.Embed] = None
        await ctx.defer()

        try:
            if not today:
                async with DBContextManager(use_dict=True) as cur:
                    await cur.execute(
                        "SELECT discord_id, average_guess_count, streak, times_played FROM UserStats "
                        "ORDER BY (average_guess_count + 4.0 / SQRT(times_played)) ASC"
                    )
                    records = await cur.fetchall()
                    title = "🏆 Global Splatdle Leaderboard (sorted by weighted score)"
                    empty_message = "No players have completed a game yet. Be the first!"
            else:
                async with DBContextManager(use_dict=True) as cur:
                    await cur.execute(
                        "SELECT discord_id, guess_count FROM TodaysLeaderboard ORDER BY guess_count ASC"
                    )
                    records = await cur.fetchall()
                    title = "📅 Today's Splatdle Leaderboard"
                    empty_message = "No one has played today yet. Be the first!"

            if not records:
                embed = interactions.Embed(
                    title=title,
                    description=empty_message,
                    color=global_config.theme_colour
                )
                await ctx.send(embed=embed)
                return
            for i, record in enumerate(records):
                try:
                    user = await self.bot.fetch_user(record["discord_id"])

                    if today:
                        line = f"**{i+1}.** {user.username} - {record['guess_count']} guesses"
                    else:
                        streak_emoji = "🔥" if record['streak'] > 0 else "💔"
                        weighted_score = record['average_guess_count'] + 2.0 / (record['times_played'] ** 0.5)
                        line = (
                            f"**{i+1}.** {user.username} - {record['average_guess_count']:.1f} avg"
                            f"(weighted: {weighted_score:.1f}) ({record['times_played']} games)"
                            f"{streak_emoji}{record['streak']}"
                        )

                    if not counter:
                        embed = interactions.Embed(
                            title=title,
                            description=line + "\n",
                            color=global_config.theme_colour
                        )
                        counter += 1
                    else:
                        embed.description += line + "\n"
                        counter += 1

                    if counter == players_per_page:
                        pages.append(embed)
                        embed = None
                        counter = 0
                except Exception as e:
                    logger.error(f"Error fetching user {record['discord_id']}: {e}")
                    continue

            if embed is not None:
                pages.append(embed)

            if pages:
                paginator = Paginator.create_from_embeds(self.bot, *pages)
                await paginator.send(ctx)
            else:
                await ctx.send("❌ Error displaying leaderboard.")

        except Exception as e:
            logger.error(f"Error in leaderboard command: {e}")
            await ctx.send("❌ An error occurred while fetching the leaderboard.")

    @slash_command(
        name="splatdle-stats",
        description="View splatdle statistics for yourself or another player",
    )
    @slash_option(
        name="user",
        description="The user to get stats for (defaults to yourself)",
        opt_type=OptionType.USER,
        required=False
    )
    async def stats(self, ctx: interactions.SlashContext, user: Optional[interactions.Member] = None) -> None:
        """Show Splatdle statistics for a specific user.

        Displays comprehensive statistics including games played, average guesses,
        current streak, and today's performance for the specified user or command author.

        Args:
            ctx: The slash command context.
            user: Optional user to get stats for (defaults to command author).
        """
        await ctx.defer()
        target_user = user if user else ctx.author

        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute(
                    "SELECT discord_id, streak, times_played, average_guess_count, "
                    "played_today FROM UserStats WHERE discord_id = %s",
                    (target_user.id,)
                )
                stats_record = await cur.fetchone()

                await cur.execute(
                    "SELECT guess_count FROM TodaysLeaderboard WHERE discord_id = %s",
                    (target_user.id,)
                )
                today_record = await cur.fetchone()

            if not stats_record:
                embed = interactions.Embed(
                    title="📊 Splatdle Stats",
                    description=(
                        f"**{target_user.display_name}** hasn't played Splatdle yet!"
                        "\n\nTry the daily Splatdle challenge to get started."
                    ),
                    color=global_config.theme_colour
                )
                embed.set_thumbnail(url=target_user.avatar.url)
                await ctx.send(embed=embed)
                return

            streak = stats_record['streak']
            times_played = stats_record['times_played']
            avg_guess = stats_record['average_guess_count']
            played_today = stats_record['played_today']

            if streak > 0:
                streak_text = f"🔥 {streak} game{'s' if streak != 1 else ''}"
            else:
                streak_text = f"💔 {abs(streak)} game{'s' if abs(streak) != 1 else ''} (broken)"

            today_text = "✅ Completed" if played_today else "❌ Not played"
            if today_record:
                today_text = f"✅ Completed in {today_record['guess_count']} guesses"

            if avg_guess <= 2.0:
                performance = "🏆 Excellent"
            elif avg_guess <= 3.0:
                performance = "🥇 Great"
            elif avg_guess <= 4.0:
                performance = "🥈 Good"
            elif avg_guess <= 5.0:
                performance = "🥉 Average"
            else:
                performance = "📈 Improving"

            embed = interactions.Embed(
                title="📊 Splatdle Stats",
                color=global_config.theme_colour
            )
            embed.set_thumbnail(url=target_user.avatar.url)

            embed.add_field(
                name="Player",
                value=f"**{target_user.display_name}**",
                inline=True
            )

            embed.add_field(
                name="Games Played",
                value=f"**{times_played}**",
                inline=True
            )

            embed.add_field(
                name="Average Guesses",
                value=f"**{avg_guess:.1f}**",
                inline=True
            )

            embed.add_field(
                name="Current Streak",
                value=streak_text,
                inline=True
            )

            embed.add_field(
                name="Today's Game",
                value=today_text,
                inline=True
            )

            embed.add_field(
                name="Performance",
                value=performance,
                inline=True
            )

            if streak > 0:
                footer_text = "Keep the streak alive! 🔥"
            elif not played_today:
                footer_text = "Ready for today's challenge? 🎯"
            else:
                footer_text = "Great job today! Come back tomorrow! 👏"

            embed.set_footer(text=footer_text)
            await ctx.send(embed=embed)
        except Exception as e:
            logger.error(f"Error in stats command: {e}")
            await ctx.send("❌ An error occurred while fetching player statistics.")

    @slash_command(
        name="set-splatdle-channel",
        description="Set splatdle channel",
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(name="splatdle_channel",
                  description="Channel to post splatdle updates to",
                  opt_type=OptionType.CHANNEL, required=False)
    async def set_splatdle_announcement_channel(self, ctx: interactions.SlashContext,
                                                splatdle_channel: Optional[interactions.GuildChannel] = None) -> None:
        """Set the Splatdle announcement channel for this guild.

        Configures which channel will receive daily Splatdle reset announcements.
        Requires administrator permissions.

        Args:
            ctx: The slash command context.
            splatdle_channel: Channel to post announcements to (defaults to current channel).
        """
        splatdle_channel = ctx.channel if splatdle_channel is None else splatdle_channel
        async with DBContextManager() as cur:
            await cur.execute(
                "INSERT INTO SplatdleChannels (guild_id, channel_id) "
                "VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE "
                "channel_id = VALUES(channel_id)",
                (ctx.guild.id, splatdle_channel.id)
            )
        await ctx.send("✅ Updated the channel")

    @slash_command(
        name="view-splatdle-channel",
        description="view splatdle channel",
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def view_splatdle_channel(self, ctx: interactions.SlashContext) -> None:
        """View the current Splatdle announcement channel.

        Shows which channel is configured for Splatdle announcements in this guild.
        Requires administrator permissions.

        Args:
            ctx: The slash command context.
        """
        async with DBContextManager() as cur:
            await cur.execute(
                "SELECT channel_id "
                "FROM SplatdleChannels "
                "WHERE guild_id = %s",
                (ctx.guild.id,)
            )
            row = await cur.fetchone()
        channel_id = row[0]
        await ctx.send(f"The splatdle announcement channel is set to <#{channel_id}>")


def setup(bot: interactions.Client) -> None:
    """Set up the Splatdle extension for the bot.

    Args:
        bot: The Discord bot client instance.
    """
    SplatdleExt(bot)
