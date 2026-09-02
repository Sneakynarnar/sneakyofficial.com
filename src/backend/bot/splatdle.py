"""
devtools.py
"""
import logging
from typing import Optional
from datetime import datetime, timedelta

import interactions
from interactions import slash_command, slash_option, OptionType, Permissions, slash_default_member_permission, Task, IntervalTrigger, listen
from backend.util.database_context_manager import DBContextManager
from backend.util.config import global_config
from interactions.ext.paginators import Paginator

logger = logging.getLogger("Splatdle")


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

    @listen()
    async def on_startup(self) -> None:
        """Start background tasks when the bot is ready."""
        self.check_and_send_reminders.start()
        logger.info("Splatdle reminder task started")

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
                        weighted_score = float(record['average_guess_count']) + 2.0 / (record['times_played'] ** 0.5)
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
                "VALUES (%s, %s) AS new "
                "ON DUPLICATE KEY UPDATE "
                "channel_id = new.channel_id",
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

    @slash_command(
        name="splatdle-reminder",
        description="Configure your Splatdle streak reminder settings"
    )
    @slash_option(
        name="enabled",
        description="Enable or disable reminders",
        opt_type=OptionType.BOOLEAN,
        required=False
    )
    @slash_option(
        name="hours_before_reset",
        description="When to send reminder (time in UTC)",
        opt_type=OptionType.INTEGER,
        required=False,
        choices=[
            interactions.SlashCommandChoice(name="0:00 UTC (24 hours before)", value=24),
            interactions.SlashCommandChoice(name="1:00 UTC (23 hours before)", value=23),
            interactions.SlashCommandChoice(name="2:00 UTC (22 hours before)", value=22),
            interactions.SlashCommandChoice(name="3:00 UTC (21 hours before)", value=21),
            interactions.SlashCommandChoice(name="4:00 UTC (20 hours before)", value=20),
            interactions.SlashCommandChoice(name="5:00 UTC (19 hours before)", value=19),
            interactions.SlashCommandChoice(name="6:00 UTC (18 hours before)", value=18),
            interactions.SlashCommandChoice(name="7:00 UTC (17 hours before)", value=17),
            interactions.SlashCommandChoice(name="8:00 UTC (16 hours before)", value=16),
            interactions.SlashCommandChoice(name="9:00 UTC (15 hours before)", value=15),
            interactions.SlashCommandChoice(name="10:00 UTC (14 hours before)", value=14),
            interactions.SlashCommandChoice(name="11:00 UTC (13 hours before)", value=13),
            interactions.SlashCommandChoice(name="12:00 UTC (12 hours before)", value=12),
            interactions.SlashCommandChoice(name="13:00 UTC (11 hours before)", value=11),
            interactions.SlashCommandChoice(name="14:00 UTC (10 hours before)", value=10),
            interactions.SlashCommandChoice(name="15:00 UTC (9 hours before)", value=9),
            interactions.SlashCommandChoice(name="16:00 UTC (8 hours before)", value=8),
            interactions.SlashCommandChoice(name="17:00 UTC (7 hours before)", value=7),
            interactions.SlashCommandChoice(name="18:00 UTC (6 hours before)", value=6),
            interactions.SlashCommandChoice(name="19:00 UTC (5 hours before)", value=5),
            interactions.SlashCommandChoice(name="20:00 UTC (4 hours before)", value=4),
            interactions.SlashCommandChoice(name="21:00 UTC (3 hours before)", value=3),
            interactions.SlashCommandChoice(name="22:00 UTC (2 hours before)", value=2),
            interactions.SlashCommandChoice(name="23:00 UTC (1 hour before)", value=1),
        ]
    )
    async def splatdle_reminder(
        self,
        ctx: interactions.SlashContext,
        enabled: Optional[bool] = None,
        hours_before_reset: Optional[int] = None
    ) -> None:
        """Configure Splatdle reminder settings.

        Allows users to enable/disable reminders and set when they want to be reminded
        before the daily weapon reset.

        Args:
            ctx: The slash command context.
            enabled: Whether to enable reminders.
            hours_before_reset: How many hours before reset to send the reminder.
        """
        user_id = ctx.author.id

        try:
            # If no options provided, show current settings
            if enabled is None and hours_before_reset is None:
                async with DBContextManager(use_dict=True) as cur:
                    await cur.execute(
                        "SELECT reminders_enabled, hours_before_reset FROM SplatdleReminders WHERE discord_id = %s",
                        (user_id,)
                    )
                    record = await cur.fetchone()

                if record:
                    status = "✅ Enabled" if record['reminders_enabled'] else "❌ Disabled"
                    embed = interactions.Embed(
                        title="🔔 Your Splatdle Reminder Settings",
                        description=(
                            f"**Status:** {status}\n"
                            f"**Reminder Time:** {record['hours_before_reset']} hour{'s' if record['hours_before_reset'] != 1 else ''} before reset"
                        ),
                        color=global_config.theme_colour
                    )
                    embed.set_footer(text="Use /splatdle-reminder to change your settings")
                else:
                    embed = interactions.Embed(
                        title="🔔 Splatdle Reminders",
                        description=(
                            "You don't have any reminder settings yet!\n\n"
                            "**Default settings:**\n"
                            "• Enabled: ✅ Yes\n"
                            "• Reminder Time: 2 hours before reset\n\n"
                            "Use `/splatdle-reminder enabled:True` to enable reminders."
                        ),
                        color=global_config.theme_colour
                    )
                await ctx.send(embed=embed)
                return

            # Update settings
            async with DBContextManager() as cur:
                # Insert or update
                if enabled is not None and hours_before_reset is not None:
                    await cur.execute(
                        """
                        INSERT INTO SplatdleReminders (discord_id, reminders_enabled, hours_before_reset)
                        VALUES (%s, %s, %s) AS new
                        ON DUPLICATE KEY UPDATE
                            reminders_enabled = new.reminders_enabled,
                            hours_before_reset = new.hours_before_reset,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (user_id, enabled, hours_before_reset)
                    )
                elif enabled is not None:
                    await cur.execute(
                        """
                        INSERT INTO SplatdleReminders (discord_id, reminders_enabled)
                        VALUES (%s, %s) AS new
                        ON DUPLICATE KEY UPDATE
                            reminders_enabled = new.reminders_enabled,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (user_id, enabled)
                    )
                elif hours_before_reset is not None:
                    await cur.execute(
                        """
                        INSERT INTO SplatdleReminders (discord_id, hours_before_reset)
                        VALUES (%s, %s) AS new
                        ON DUPLICATE KEY UPDATE
                            hours_before_reset = new.hours_before_reset,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (user_id, hours_before_reset)
                    )

            # Build response message
            response_parts = []
            if enabled is not None:
                status = "enabled" if enabled else "disabled"
                response_parts.append(f"Reminders {status}")
            if hours_before_reset is not None:
                response_parts.append(f"reminder time set to {hours_before_reset} hour{'s' if hours_before_reset != 1 else ''} before reset")

            await ctx.send(f"✅ {' and '.join(response_parts)}!")

        except Exception as e:
            logger.error(f"Error in splatdle_reminder command: {e}")
            await ctx.send("❌ An error occurred while updating your reminder settings.")

    @Task.create(IntervalTrigger(minutes=30))
    async def check_and_send_reminders(self) -> None:
        """Background task to check and send Splatdle reminders.

        Runs every 30 minutes to check if any users need to be reminded
        about their Splatdle streak.
        """
        try:
            current_time = datetime.utcnow()
            logger.info(f"Checking for Splatdle reminders to send at {current_time}")

            # Get users who have reminders enabled and haven't played today
            async with DBContextManager(use_dict=True) as cur:
                # Get users who need reminders
                # We check if they haven't played today and if it's time to remind them
                await cur.execute("""
                    SELECT
                        r.discord_id,
                        r.hours_before_reset,
                        r.last_reminder_sent,
                        s.played_today,
                        s.streak
                    FROM SplatdleReminders r
                    LEFT JOIN UserStats s ON r.discord_id = s.discord_id
                    WHERE r.reminders_enabled = TRUE
                """)
                users = await cur.fetchall()

            logger.info(f"Found {len(users)} users with reminders enabled")

            for user_data in users:
                user_id = user_data['discord_id']
                hours_before = user_data['hours_before_reset']
                last_sent = user_data['last_reminder_sent']
                played_today = user_data.get('played_today', False)
                streak = user_data.get('streak', 0)

                logger.info(f"Processing user {user_id}: played_today={played_today}, hours_before={hours_before}, last_sent={last_sent}")

                # Skip if already played today
                if played_today:
                    logger.info(f"User {user_id} already played today, skipping reminder")
                    continue

                # Calculate when we should send the reminder (hours before midnight UTC)
                # Splatdle resets at midnight UTC
                next_reset = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

                reminder_time = next_reset - timedelta(hours=hours_before)

                # Check if we're in the reminder window (within 30 minutes of reminder time)
                time_until_reminder = (reminder_time - current_time).total_seconds()

                logger.info(f"User {user_id}: reminder_time={reminder_time}, time_until_reminder={time_until_reminder}s")

                # Send if we're within 30 minutes of the reminder time and haven't sent today
                should_send = False
                if -1800 <= time_until_reminder <= 1800:  # Within 30 min window
                    if last_sent is None:
                        should_send = True
                        logger.info(f"User {user_id}: should send (never sent before)")
                    else:
                        # Check if we already sent a reminder today
                        hours_since_last = (current_time - last_sent).total_seconds() / 3600
                        if hours_since_last >= 23:  # Haven't sent in the last 23 hours
                            should_send = True
                            logger.info(f"User {user_id}: should send (last sent {hours_since_last:.1f} hours ago)")
                        else:
                            logger.info(f"User {user_id}: already sent recently ({hours_since_last:.1f} hours ago)")
                else:
                    logger.info(f"User {user_id}: not in reminder window")

                if should_send:
                    logger.info(f"Attempting to send reminder to user {user_id}")
                    await self._send_reminder(user_id, streak)

                    # Update last_reminder_sent
                    async with DBContextManager() as cur:
                        await cur.execute(
                            "UPDATE SplatdleReminders SET last_reminder_sent = %s WHERE discord_id = %s",
                            (current_time, user_id)
                        )

        except Exception as e:
            logger.error(f"Error in check_and_send_reminders task: {e}")

    async def _send_reminder(self, user_id: int, streak: int) -> None:
        """Send a reminder to a user.

        Tries to send via DM first, falls back to mentioning in the Splatdle channel.

        Args:
            user_id: The Discord user ID to remind.
            streak: The user's current streak.
        """
        try:
            user = await self.bot.fetch_user(user_id)

            streak_text = f"Your current streak is **{streak}** 🔥" if streak > 0 else "Start your streak today!"

            embed = interactions.Embed(
                title="🎯 Splatdle Reminder!",
                description=(
                    f"Don't forget to play today's Splatdle to keep your streak alive!\n\n"
                    f"{streak_text}\n\n"
                    f"🔗 Play now at: {global_config.splatdle_url}"
                ),
                color=global_config.theme_colour
            )
            embed.set_footer(text="Use /splatdle-reminder to manage your reminder settings")

            # Try to send DM first
            dm_sent = False
            try:
                await user.send(embed=embed)
                dm_sent = True
                logger.info(f"Sent Splatdle reminder to user {user_id} via DM")
            except Exception as e:
                logger.warning(f"Could not DM user {user_id}: {e}")

            # If DM failed, try to send in their guild's Splatdle channel
            if not dm_sent:
                # Find guilds the user is in and send to their Splatdle channels
                async with DBContextManager(use_dict=True) as cur:
                    await cur.execute("SELECT guild_id, channel_id FROM SplatdleChannels")
                    channels = await cur.fetchall()

                for channel_data in channels:
                    try:
                        guild = await self.bot.fetch_guild(channel_data['guild_id'])
                        member = await guild.fetch_member(user_id)

                        if member:  # User is in this guild
                            channel = await self.bot.fetch_channel(channel_data['channel_id'])
                            await channel.send(
                                f"{user.mention} Don't forget to play today's Splatdle! {streak_text}",
                                embed=embed
                            )
                            logger.info(f"Sent Splatdle reminder to user {user_id} in guild {channel_data['guild_id']}")
                            break  # Only send in one guild
                    except Exception as e:
                        logger.debug(f"User {user_id} not in guild {channel_data['guild_id']}: {e}")
                        continue

        except Exception as e:
            logger.error(f"Error sending reminder to user {user_id}: {e}")


def setup(bot: interactions.Client) -> None:
    """Set up the Splatdle extension for the bot.

    Args:
        bot: The Discord bot client instance.
    """
    SplatdleExt(bot)
