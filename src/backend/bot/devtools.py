"""Developer tools and utility commands for the Discord bot.

Provides debugging, monitoring, and administrative functionality
for bot maintenance and error handling.
"""
import asyncio
import logging
import traceback
import uuid
from typing import Optional

import interactions
from interactions import slash_command, slash_option, slash_default_member_permission, OptionType, Permissions
from interactions.api.events import CommandError, CommandCompletion, Startup, Disconnect
from backend.util import global_config
from version import __version__

logger = logging.getLogger("DevTools")


class DevTools(interactions.Extension):
    """Developer tools extension.

    Provides administrative and debugging commands for bot maintenance,
    error logging, and system monitoring.

    Attributes:
        bot: The Discord bot client instance.
        error_log_channel: Channel for logging errors and exceptions.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the developer tools extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.error_log_channel: Optional[interactions.GuildChannel] = None

    @slash_command(
        name="ping",
        description="Checks the ping.",
    )
    async def ping_command(self, ctx: interactions.SlashContext) -> None:
        """
        check the ping

        Parameters:
        - ctx: The context object representing the invocation of the command.

        Returns:
        - None
        """
        await ctx.send(f"Pong! :ping_pong: ({self.bot.latency}ms)")

    @slash_command(
        name="dev",
        description="Shows developer info",
    )
    async def dev_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /dev
        """
        sneaky = await self.bot.fetch_user(339866237922181121)
        embed = interactions.Embed(
            title="Bot Developer",
            description=f"**Sneakynarnar** ({sneaky.mention})",
            thumbnail=sneaky.avatar_url, color=0x5f0dd9
        )
        embed.add_field(
            name="Contact info",
            value=(
                "**Email**: sneakynarnar@gmail.com"
                "\nCheck out my [GitHub](https://github.com/Sneakynarnar)"
            )
        )
        await ctx.send(embeds=embed)

    @slash_command(
        name="website",
        description="Send a link to the website",
    )
    async def website_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /dev
        """
        await ctx.send(global_config.splatdle_url)

    @slash_command(
        name="splatdle-link",
        description="Send a link to splatdle",
    )
    async def splatdle_website_command(self, ctx: interactions.SlashContext) -> None:
        """
        Website command
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the bot developer and
        sends it as an embedded message.

        Example usage:
        /splatdle-link
        """
        await ctx.send(global_config.splatdle_url)

    @slash_command(
        name="version",
        description="The version of the bot"
    )
    async def version_command(self, ctx: interactions.SlashContext) -> None:
        """
        Developer info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        Version of the bot

        Example usage:
        /version
        """
        embed = interactions.Embed(
            title="Sneaky bot",
            description=f"Version: **{__version__}**",
            thumbnail=self.bot.user.avatar_url,
            color=0x5f0dd9
        )
        await ctx.send(embeds=embed)

    @interactions.listen(CommandError, disable_default_listeners=True)
    async def on_command_error(self, event: CommandError) -> None:
        """
        Handle errors that occur during command execution.

        Parameters:
        - event (CommandError): The error event object.

        Returns:
        - None

        Raises:
        - None
        """
        command = event.ctx.command

        error_traceback = ''.join(traceback.format_exception(
            type(event.error), event.error, event.error.__traceback__))
        logger.error("Error during command %s: %s", command.name, event.error)
        guid = str(uuid.uuid4())
        logger.error("Assigned error guid: %s", guid)
        logger.debug("Traceback: %s", error_traceback)
        try:
            error_embed = interactions.Embed(
                title="Command Error",
                description=(
                    "Unknown error occurred while executing this command. "
                    "Are you sure you typed it correctly? Contact an admin if the issue persists!"
                    f"\n\nError Code: **{guid}**"
                ),
                color=0xFF0000,
            )
            await event.ctx.reply(embeds=error_embed)
        except AttributeError:
            await event.ctx.send(
                "Unknown error doing this command. "
                "Are you sure you typed it right? Contact an admin if issue persists!"
            )
        error_embed = interactions.Embed(
            title="New error: (" + guid + ")",
            description=f"{event.error}\n```{error_traceback}```",
            color=0xFF0000,
        )
        await self.error_log_channel.send(embeds=error_embed)

    @interactions.listen(CommandCompletion)
    async def on_command_completion(self, event: CommandCompletion) -> None:
        """
        Log commands executed by members.

        Parameters:
        - event (CommandCompletion): The command completion event object.

        Returns:
        - None

        Raises:
        - None
        """
        logger.info("Command '%s' executed by %s (ID: %s)",
                    event.ctx.command.name, event.ctx.author.username, event.ctx.author_id)

    @slash_command(
        name="clear-category",
        description="Clear all channels from a category"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="category",
        description="The category to clear channels from",
        required=True,
        opt_type=OptionType.CHANNEL
    )
    async def clear_category(self, ctx: interactions.SlashContext, category: interactions.GuildChannel) -> None:
        """
        Clear all channels from a category

        Parameters:
        - ctx: The context of the command.
        - category: The category to clear channels from.

        Returns:
        - None

        Description:
        This command deletes all channels within a specified category.
        Requires administrator permissions.

        Example usage:
        /clear-category category:<category_name>
        """
        if category.type != interactions.ChannelType.GUILD_CATEGORY:
            await ctx.send("❌ Please select a valid category channel.", ephemeral=True)
            return

        await ctx.defer(ephemeral=False)

        # Get all channels in the category
        channels_to_delete = [
            channel for channel in ctx.guild.channels
            if hasattr(channel, 'parent_id') and channel.parent_id == category.id
        ]

        if not channels_to_delete:
            await ctx.send(f"❌ No channels found in category **{category.name}**.")
            return

        # Delete all channels
        deleted_count = 0
        failed_count = 0

        for channel in channels_to_delete:
            try:
                await channel.delete()
                deleted_count += 1
                logger.info(f"Deleted channel {channel.name} (ID: {channel.id}) from category {category.name}")
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to delete channel {channel.name}: {e}")

        # Send summary
        result_message = f"✅ Deleted **{deleted_count}** channel(s) from category **{category.name}**"
        if failed_count > 0:
            result_message += f"\n⚠️ Failed to delete **{failed_count}** channel(s)"

        await ctx.send(result_message)

    @slash_command(
        name="giveall",
        description="Give a role to every non-bot member in the server"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="role",
        description="The role to give to everyone",
        required=True,
        opt_type=OptionType.ROLE
    )
    async def giveall(self, ctx: interactions.SlashContext, role: interactions.Role) -> None:
        """
        Give a role to every non-bot member in the server.

        Parameters:
        - ctx: The context of the command.
        - role: The role to assign to all human members.

        Returns:
        - None

        Description:
        Fetches the full member list from the API, then assigns the role to every
        member that is not a bot and does not already have it. Requires
        administrator permissions.

        Example usage:
        /giveall role:<role_name>
        """
        if ctx.guild is None:
            await ctx.send("❌ This command can only be used in a server.", ephemeral=True)
            return

        if role.managed:
            await ctx.send(
                f"❌ **{role.name}** is managed by an integration or bot and cannot be assigned manually.",
                ephemeral=True
            )
            return

        if not role.is_assignable:
            await ctx.send(
                f"❌ I can't assign **{role.name}**: it sits above my highest role. "
                "Move my role above it and try again.",
                ephemeral=True
            )
            return

        await ctx.defer()

        # Make sure the member cache is complete, otherwise we only touch cached members
        try:
            await ctx.guild.http_chunk()
        except Exception as e:
            logger.error("Failed to chunk guild %s for /giveall: %s", ctx.guild.id, e)
            await ctx.send("❌ Failed to fetch the member list. Try again in a moment.")
            return

        targets = [
            member for member in ctx.guild.members
            if not member.bot and not member.has_role(role)
        ]
        already_had = sum(
            1 for member in ctx.guild.members
            if not member.bot and member.has_role(role)
        )

        if not targets:
            await ctx.send(
                f"✅ Nothing to do, all **{already_had}** non-bot member(s) already have **{role.name}**."
            )
            return

        progress = await ctx.send(
            f"⏳ Giving **{role.name}** to **{len(targets)}** member(s)... this may take a while."
        )

        added = 0
        failed = 0
        reason = f"/giveall by {ctx.author.username} ({ctx.author_id})"

        for index, member in enumerate(targets, start=1):
            try:
                await member.add_role(role, reason=reason)
                added += 1
            except Exception as e:
                failed += 1
                logger.error("Failed to give role %s to %s: %s", role.id, member.id, e)

            # Stay polite to the role-assignment rate limit
            await asyncio.sleep(0.3)

            if index % 25 == 0:
                try:
                    await progress.edit(
                        content=f"⏳ Giving **{role.name}**... {index}/{len(targets)} processed."
                    )
                except Exception:
                    pass

        result_message = f"✅ Gave **{role.name}** to **{added}** member(s)"
        if already_had:
            result_message += f"\nℹ️ **{already_had}** member(s) already had it"
        if failed:
            result_message += f"\n⚠️ Failed for **{failed}** member(s)"

        try:
            await progress.edit(content=result_message)
        except Exception:
            await ctx.send(result_message)

        logger.info(
            "/giveall: role %s in guild %s: added=%s already_had=%s failed=%s",
            role.id, ctx.guild.id, added, already_had, failed
        )

    # The member-join flow (role assignment, welcome message, welcome DM) lives
    # in backend.bot.welcome.

    @interactions.listen(Disconnect)
    async def on_disconnect(self) -> None:
        """Log gateway disconnects.

        Background tasks keep running (and the HTTP client re-logs in on demand)
        when the gateway drops, so without this the bot looks alive while it is
        no longer receiving commands. main.py supervises and reconnects.
        """
        logger.warning("Discord gateway disconnected, commands will not be received until it reconnects")

    @interactions.listen(Startup)
    async def assign_channel(self) -> None:
        self.error_log_channel = self.bot.get_channel(
            global_config.error_log_channel)
        from backend.util.role_manager import RoleManager
        RoleManager.get().set_bot(self.bot)


def setup(bot: interactions.Client) -> None:
    """
    Set up the DevTools for the bot.

    Parameters:
    - bot: The bot instance.

    Returns:
    - None
    """
    DevTools(bot)
