"""
devtools.py
"""
import logging
import traceback
import uuid

import interactions
from interactions import slash_command, Permissions, slash_default_member_permission, SlashCommandOption
from interactions import Modal, ModalContext, ShortText
from interactions.api.events import CommandError, CommandCompletion, Startup
import mysql.connector
from version import __version__

from four_mans import DBHandler, global_config


GUILD_ID = global_config.GUILD_ID

logger = logging.getLogger("OCE-4Mans")


class DevTools(interactions.Extension):
    """
    Developer commands.
    """

    def __init__(self, bot):
        self.bot = bot
        self.error_log_channel = None

    @slash_command(
        name="resetdb",
        description="Will delete all data in the database.",
        scopes=[GUILD_ID]
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def reset_db_command(self, ctx):
        """
        Resets the database.
        Parameters:
        - ctx: The context object representing the invocation of the command.
        Returns:
        None
        Raises:
        None
        """
        confirm_modal = Modal(
            ShortText(label="Type confirm to reset",
                      custom_id="confirm_text", required=True),
            title="Are you sure you want to reset the database?",
            custom_id="my_modal",
        )
        await ctx.send_modal(modal=confirm_modal)
        modal_ctx: ModalContext = await ctx.bot.wait_for_modal(confirm_modal)
        confirm_text = modal_ctx.responses["confirm_text"]

        if confirm_text.lower() == "confirm":
            db = DBHandler()
            try:
                await db.reset_database()
                await modal_ctx.send("Database reset!")
            except mysql.connector.Error:
                await modal_ctx.send("Something went wrong when resetting database!")
        else:
            await modal_ctx.send("Cancelled database reset.")

    @slash_command(
        name="backupdb",
        description="Backs up the database manually.",
        scopes=[GUILD_ID]
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def backup_db_command(self, ctx):
        """
        Resets the database.
        Parameters:
        - ctx: The context object representing the invocation of the command.
        Returns:
        None
        Raises:
        None
        """

        db = DBHandler()
        try:
            status = await db.backup_database()
            if status:
                await ctx.send("Backed up database.")
                return
            else:
                await ctx.send("Error while backing up database")
        except mysql.connector.Error:
            await ctx.send("Something went wrong when backing up the database!")

    @slash_command(
        name="ping",
        description="Checks the ping.",
        scopes=[GUILD_ID]
    )
    async def ping_command(self, ctx):
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
        scopes=[GUILD_ID]
    )
    async def dev_command(self, ctx):
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
        scopes=[GUILD_ID]
    )
    async def website_command(self, ctx):
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
        await ctx.send(global_config.WEBSERVER_URL)

    @slash_command(name="owner", description="Owner info",  scopes=[GUILD_ID])
    async def owner_command(self, ctx):
        """
        Owner info
        Parameters:
        - ctx: The context of the command.
        Returns:
        - None
        Description:
        This command retrieves information about the owner and 
        sends it as an embedded message.

        Example usage:
        /dev
        """
        owner = await self.bot.fetch_user(914753310542688326)
        embed = interactions.Embed(
            title="Server Owner",
            description=f"**Vahnala** ({owner.mention})",
            thumbnail=owner.avatar_url, color=0x5f0dd9
        )
        # embed.add_field(
        #     name="Contact info",
        #     value=(
        #         "**Email**: sneakynarnar@gmail.com"
        #         "\nCheck out my [GitHub](https://github.com/Sneakynarnar)"
        #     )
        # )
        await ctx.send(embeds=embed)

    @slash_command(
        name="version",
        description="Shows the version of the bot.",
        scopes=[GUILD_ID]
    )
    async def version_command(self, ctx):
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
        embed = interactions.Embed(
            title="OCE 4 Mans",
            description=f"Version: **{__version__}**",
            thumbnail=self.bot.user.avatar_url,
            color=0x5f0dd9
        )
        await ctx.send(embeds=embed)

    @slash_command(
        name="delete_voice_channels",
        description="Deletes all voice channels in a specified category.",
        scopes=[GUILD_ID],
        options=[SlashCommandOption(
            name="target_category",
            description="The category channel to delete the vcs from",
            required=True,
            type=interactions.OptionType.CHANNEL
        )
        ]
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def delete_voice_channels_command(self, ctx, target_category: interactions.GuildCategory):
        """
        Deletes all voice channels in a specified category.

        Parameters:
        - ctx: The context of the command.
        - category_id: The ID of the category to delete voice channels from.

        Returns:
        - None
        """
        if not target_category or target_category.type != interactions.ChannelType.GUILD_CATEGORY:
            await ctx.send("Invalid target_category ID.")
            return
        await ctx.defer()
        deleted_channels = []
        for channel in target_category.channels:
            if channel.type == interactions.ChannelType.GUILD_VOICE:
                await channel.delete()
                deleted_channels.append(channel.name)

        if deleted_channels:
            await ctx.send(f"Deleted voice channels: {', '.join(deleted_channels)}")
        else:
            await ctx.send("No voice channels found in the specified category.")

    @interactions.listen(CommandError, disable_default_listeners=True)
    async def on_command_error(self, event: CommandError):
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
        error_msg = str(event.error).lower()
        indicators = ["not found", "that is missing"]
        if any(indicator in error_msg for indicator in indicators):
            await event.ctx.reply(f"`!{command.name} {command.usage}`")
        else:
            error_traceback = ''.join(traceback.format_exception(
                type(event.error), event.error, event.error.__traceback__))
            logger.error("Error during command %s: %s",
                         command.name, event.error)
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
    async def on_command_completion(self, event: CommandCompletion):
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

    @interactions.listen(Startup)
    async def assign_channel(self):
        self.error_log_channel = self.bot.get_channel(
            global_config.ERROR_LOG_CHANNEL)


def setup(bot):
    """
    Set up the DevTools for the bot.

    Parameters:
    - bot: The bot instance.

    Returns:
    - None
    """
    DevTools(bot)
