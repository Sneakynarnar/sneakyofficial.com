"""Welcome flow: join role, welcome message, intro DM and self-assignable ping roles.

Joining members are given the base member role (with retries, because a single
failed API call used to mean the member silently never got one), greeted in the
welcome channel and sent a DM explaining the server and offering the ping roles.

The ping roles are picked from a multi-select menu. Discord modals only accept
text inputs, so a select menu with ``min_values=0`` is the closest thing to a
checkbox list: every option can be ticked or unticked independently and the
selection is applied when the menu is submitted.
"""
import asyncio
import logging
from typing import Optional

import interactions
from interactions import (
    slash_command, slash_default_member_permission, Permissions,
    Embed, Button, ButtonStyle, StringSelectMenu, StringSelectOption,
)
from interactions.api.events import MemberAdd, Startup

logger = logging.getLogger("WelcomeExt")

GUILD_ID = 1019293451579293747
WELCOME_CHANNEL_ID = 1019293452451725384
MEMBER_ROLE_ID = 1019293451600273538

# Channels referenced in the welcome DM
INTRO_CHANNEL_ID = 1535809522734600312
ROLES_CHANNEL_ID = 1019293452451725386
LFG_CHANNEL_ID = 1507063329418379346

# custom_id -> (role id, label, emoji, description)
PING_ROLES: dict[str, tuple[int, str, str, str]] = {
    "open": (
        1535814313921609768, "Open Ping", "🦑",
        "Pinged when someone is looking for an open room.",
    ),
    "private": (
        1535814428564652042, "Private Battle Ping", "🎮",
        "Pinged when someone is looking for a private 4v4 or custom lobby.",
    ),
    "salmon": (
        1535819516817313853, "Salmon Ping", "🐟",
        "Pinged when someone is looking for people to play Salmon Run with.",
    ),
    "raiders": (
        1535819580981641236, "Raiders Ping", "⚔️",
        "Pinged when someone is looking for people to play Raiders with.",
    ),
    "tournament": (
        1535819674594320425, "Tournament Team Ping", "🏆",
        "Pinged when looking for a pick-up or recruitment for a tournament team.",
    ),
}

PANEL_BUTTON_ID = "welcome_pings_open"
PANEL_SELECT_ID = "welcome_pings_select"

_ROLE_RETRIES = 3
_ROLE_RETRY_DELAY = 2.0


def _ping_embed() -> Embed:
    """Build the embed describing the self-assignable ping roles.

    Role mentions are written as plain names rather than <@&id>: this embed is
    also sent in DMs, where Discord has no guild to resolve the mention against
    and renders it as @unknown-role.
    """
    embed = Embed(
        title="Ping Roles",
        description=(
            f"These roles live in <#{ROLES_CHANNEL_ID}> and **anyone can ping them**, so if you "
            "want to play something just say so in "
            f"<#{LFG_CHANNEL_ID}>, like:\n\n"
            f"> @{PING_ROLES['open'][1]} Looking for +2 to join us for open!\n\n"
            "Tick the ones you want below. Unticking a role removes it."
        ),
        color=0x5F0DD9,
    )
    for _role_id, label, emoji, description in PING_ROLES.values():
        embed.add_field(name=f"{emoji} {label}", value=description, inline=False)
    return embed


def _ping_select(selected: Optional[set[int]] = None) -> StringSelectMenu:
    """Build the ping-role select menu, pre-ticking roles the member already has."""
    selected = selected or set()
    options = [
        StringSelectOption(
            label=label,
            value=key,
            description=description[:100],
            emoji=emoji,
            default=role_id in selected,
        )
        for key, (role_id, label, emoji, description) in PING_ROLES.items()
    ]
    return StringSelectMenu(
        *options,
        custom_id=PANEL_SELECT_ID,
        placeholder="Select the pings you want (or none to clear them)",
        min_values=0,
        max_values=len(options),
    )


class Welcome(interactions.Extension):
    """Handles new joins, the welcome DM and self-assignable ping roles."""

    def __init__(self, bot: interactions.Client) -> None:
        self.bot = bot

    # ------------------------------------------------------------------ joins

    async def _assign_member_role(self, member: interactions.Member) -> bool:
        """Give the base member role, retrying transient API failures.

        A single failed request used to leave the member with no role at all,
        which is why some joiners ended up role-less.
        """
        for attempt in range(1, _ROLE_RETRIES + 1):
            try:
                await member.add_role(MEMBER_ROLE_ID, reason="New member")
                return True
            except Exception as e:
                logger.warning(
                    "Attempt %s/%s to give the member role to %s failed: %s",
                    attempt, _ROLE_RETRIES, member.id, e,
                )
                if attempt < _ROLE_RETRIES:
                    await asyncio.sleep(_ROLE_RETRY_DELAY * attempt)
        logger.error("Gave up assigning the member role to %s", member.id)
        return False

    async def _send_welcome_dm(self, member: interactions.Member) -> None:
        """DM the new member a tour of the server plus the ping-role picker."""
        embed = Embed(
            title="Welcome to the server! 🦑",
            description=(
                f"Hey {member.mention}, glad to have you here! Here is where everything lives:\n\n"
                f"• <#{INTRO_CHANNEL_ID}>: say hi and introduce yourself.\n"
                f"• <#{LFG_CHANNEL_ID}>: looking for group. Ping a role here when you want players.\n"
                f"• <#{ROLES_CHANNEL_ID}>: the roles channel, where you can grab these ping roles "
                "any time.\n\n"
                "The ping roles below are pingable by anyone, so feel free to send a message like:\n"
                f"> @{PING_ROLES['open'][1]} Looking for +2 to join us for open!\n\n"
                "Press the button to pick which pings you want."
            ),
            color=0x5F0DD9,
        )
        button = Button(
            custom_id=PANEL_BUTTON_ID,
            style=ButtonStyle.BLUE,
            label="Choose your pings",
            emoji="🔔",
        )
        try:
            await member.send(embeds=embed, components=button)
        except Exception as e:
            logger.info("Could not DM welcome message to %s (DMs likely closed): %s", member.id, e)

    @interactions.listen(MemberAdd)
    async def on_member_join(self, event: MemberAdd) -> None:
        """Give the member role, greet them in chat and DM them the guide."""
        if int(event.guild_id) != GUILD_ID:
            return
        member = event.member
        if member.bot:
            return

        await self._assign_member_role(member)
        await self._send_welcome_dm(member)

        channel = self.bot.get_channel(WELCOME_CHANNEL_ID)
        if channel is None:
            return
        try:
            await channel.send(
                f"Welcome to the server, {member.mention}! 🦑\n"
                "Head over to the channels and introduce yourself. Hope you enjoy your stay!"
            )
        except Exception as e:
            logger.error("Failed to post welcome message for %s: %s", member.id, e)

    @interactions.listen(Startup)
    async def backfill_member_role(self) -> None:
        """Give the member role to anyone who missed it while the bot was down.

        MemberAdd events that arrive while the gateway is disconnected are lost
        for good, so joins during an outage never got a role. This catches them
        on the next start-up.
        """
        guild = self.bot.get_guild(GUILD_ID)
        if guild is None:
            return
        try:
            await guild.http_chunk()
        except Exception as e:
            logger.error("Failed to chunk guild %s for the member-role backfill: %s", GUILD_ID, e)
            return

        missing = [
            member for member in guild.members
            if not member.bot and not member.has_role(MEMBER_ROLE_ID)
        ]
        if not missing:
            logger.info("Member-role backfill: nothing to do.")
            return

        added = 0
        for member in missing:
            try:
                await member.add_role(MEMBER_ROLE_ID, reason="Member role backfill")
                added += 1
            except Exception as e:
                logger.error("Backfill failed to give the member role to %s: %s", member.id, e)
            await asyncio.sleep(0.3)
        logger.info("Member-role backfill: gave the member role to %s/%s member(s)", added, len(missing))

    # ------------------------------------------------------------- ping roles

    async def _resolve_member(self, user_id: int) -> Optional[interactions.Member]:
        """Fetch the guild member for a user, working from DMs as well."""
        guild = self.bot.get_guild(GUILD_ID)
        if guild is None:
            return None
        try:
            return await guild.fetch_member(user_id)
        except Exception as e:
            logger.warning("Could not resolve member %s in guild %s: %s", user_id, GUILD_ID, e)
            return None

    async def _send_picker(self, ctx: interactions.InteractionContext) -> None:
        """Reply with the ping-role picker, pre-ticked to the member's roles."""
        member = await self._resolve_member(int(ctx.author.id))
        if member is None:
            await ctx.send("❌ I couldn't find you in the server. Try again in a moment.", ephemeral=True)
            return
        held = {role_id for role_id, *_ in PING_ROLES.values() if member.has_role(role_id)}
        await ctx.send(embeds=_ping_embed(), components=_ping_select(held), ephemeral=True)

    @interactions.component_callback(PANEL_BUTTON_ID)
    async def on_panel_button(self, ctx: interactions.ComponentContext) -> None:
        """Open the ping-role picker from the DM or the panel message."""
        await self._send_picker(ctx)

    @interactions.component_callback(PANEL_SELECT_ID)
    async def on_panel_select(self, ctx: interactions.ComponentContext) -> None:
        """Apply the ticked ping roles and remove the unticked ones."""
        await ctx.defer(ephemeral=True)
        member = await self._resolve_member(int(ctx.author.id))
        if member is None:
            await ctx.send("❌ I couldn't find you in the server. Try again in a moment.", ephemeral=True)
            return

        chosen = set(ctx.values)
        added: list[str] = []
        removed: list[str] = []
        failed: list[str] = []

        for key, (role_id, label, _emoji, _description) in PING_ROLES.items():
            wanted = key in chosen
            has = member.has_role(role_id)
            if wanted == has:
                continue
            try:
                if wanted:
                    await member.add_role(role_id, reason="Ping role self-assign")
                    added.append(label)
                else:
                    await member.remove_role(role_id, reason="Ping role self-removal")
                    removed.append(label)
            except Exception as e:
                logger.error("Failed to toggle ping role %s for %s: %s", role_id, member.id, e)
                failed.append(label)

        lines: list[str] = []
        if added:
            lines.append(f"✅ Added: {', '.join(added)}")
        if removed:
            lines.append(f"➖ Removed: {', '.join(removed)}")
        if failed:
            lines.append(f"⚠️ Failed: {', '.join(failed)}")
        if not lines:
            lines.append("Nothing changed, your ping roles are already set that way.")

        await ctx.send("\n".join(lines), ephemeral=True)

    @slash_command(
        name="pings",
        description="Pick which ping roles you want.",
    )
    async def pings_command(self, ctx: interactions.SlashContext) -> None:
        """Open the ping-role picker for yourself."""
        await self._send_picker(ctx)

    @slash_command(
        name="pingpanel",
        description="Post the ping role picker panel in this channel.",
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def pingpanel_command(self, ctx: interactions.SlashContext) -> None:
        """Post a permanent panel members can use to grab ping roles."""
        if ctx.guild is None:
            await ctx.send("❌ This command can only be used in a server.", ephemeral=True)
            return
        button = Button(
            custom_id=PANEL_BUTTON_ID,
            style=ButtonStyle.BLUE,
            label="Choose your pings",
            emoji="🔔",
        )
        await ctx.channel.send(embeds=_ping_embed(), components=button)
        await ctx.send("✅ Panel posted.", ephemeral=True)

    @slash_command(
        name="welcomedm",
        description="Send yourself the welcome DM to preview it.",
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def welcomedm_command(self, ctx: interactions.SlashContext) -> None:
        """Preview the welcome DM that new members receive."""
        member = await self._resolve_member(int(ctx.author.id))
        if member is None:
            await ctx.send("❌ I couldn't find you in the server.", ephemeral=True)
            return
        await self._send_welcome_dm(member)
        await ctx.send("✅ Sent, check your DMs.", ephemeral=True)


def setup(bot: interactions.Client) -> None:
    """Set up the welcome extension for the bot."""
    Welcome(bot)
