"""
Team Drafting Extension for Discord Bot
"""
import logging
import random
from typing import Dict, Optional, Any

import interactions
from interactions import (
    slash_command, slash_option, OptionType, Permissions,
    slash_default_member_permission, Button, ButtonStyle,
    Embed, listen
)
from interactions.api.events import Component as ComponentEvent
from backend.util.config import global_config

logger = logging.getLogger("TeamDrafting")


class DraftingExt(interactions.Extension):
    """Team drafting extension for creating balanced teams.

    This extension provides slash commands for organizing team drafts,
    managing player participation, and automatically creating balanced teams
    with optional voice channel organization.

    Attributes:
        bot: The Discord bot client instance.
        active_drafts: Dictionary tracking active drafts by guild ID.
        adjectives: List of adjective words for generating team names.
        subjects: List of subject words for generating team names.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the drafting extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.active_drafts: Dict[int, Dict[str, Any]] = {}

        self.adjectives: list[str] = [
            "Splendid", "Booyah", "Fresh", "Radical", "Inky", "Colorful",
            "Fierce", "Elite", "Legendary", "Supreme", "Vibrant", "Dynamic",
            "Turbo", "Mega", "Ultra", "Super", "Blazing", "Stormy", "Sneaky",
            "Oceanic", "Tidal", "Flowing", "Rushing", "Sparkling", "Glowing",
            "Tentacle", "Squishy", "Sneaky", "Stealthy", "Speedy", "Slippery",
            "Deadly", "Powerful", "Mighty", "Crushing", "Explosive", "Chaotic",
            "Organized", "Tactical", "Strategic", "Coordinated", "United", "Synchronized",
            "Funky", "Grizzco", "Altarian", "Neo", "Anarchy", "Deep",
            "Cutting-Edge", "Lo-fi", "Chill", "Crusty", "Scorchin'",
            "Greasy", "Golden", "Hazardous", "Wavey", "Reefy", "Buzzing",
            "Scrappy", "Rebellious", "Ultra-Squidified", "Stinger-Slaying",
            "Big-Run-Ready", "Woomy-fied", "Tenta-fresh", "Ranked-Up",
            "Fishy", "Cracked", "Meta", "Drip-Core", "Potato", "Woomying", "Sea",
            "Jorvink", "Deep", "Laggy", "Sneaky", "Dynamic", "Zipcasted", "Fuzzy", "Anarchy",
            "Your mothers's", "Salty", "Mammalized", "Cracked", "Inkless", "Ninja",
            "Overfitted", "Rankless", "Stealthy", "Booyahless", "Disconnected",
            "Sweaty", "Smurfed", "Sloshed", "Meta", "Reefy", "Memeable",
            "Stickered", "Exploitative", "Sharked", "Crusty", "Reefslidered",
            "Squidbagging", "Crab-Walking", "Booyahless", "Grizzco-Trained", "Ink-Starved",
            "Roll-Canceled", "Missile-Happy", "Respawn-Punished", "Low-Turfing", "Sharked-Up",
            "Over-Specialed", "Booyah-Boosted", "Crusty", "Locker-Cursed", "Spawncampy",
            "Meta-Warped", "Big-Run-Hardened", "Catalog-Maxed", "Sticker-Addicted", "Alt-Mained",
            "Skill-Issued", "Gear-Broken", "Badge-Flexing", "Hazardized", "Splash-Walled",
            "Zoned-Out", "Tower-Pilled", "Clam-Cracked", "Freshometer-Capped"
        ]

        self.subjects: list[str] = [
            "Inklings", "Octolings", "Squids", "Tentacles", "Splashers",
            "Warriors", "Slingers", "Bombers", "Defenders", "Champions",
            "Legends", "Heroes", "Raiders", "Brigade", "Squad", "Movement",
            "Collective", "Crew", "Marines", "Punks", "Militia", "Cult",
            "Battalion", "Division", "Shooters", "Chargers", "Rollers",
            "Brushes", "Splatlings", "Dualies", "Blasters", "Sloshers",
            "Brellas", "Zapfish", "Krakens", "Jellies", "Salmonids",
            "Agents", "Idols", "Artists", "Turf Lords", "Ink Masters",
            "Zone Keepers", "Tower Guards", "Rainmakers", "Clam Collectors",
            "Morons", "Casuals", "Sweats", "Kids", "Deep Cutters", "Big Man Stans", "Frye Fans", "Shiver Mains",
            "Trizookers", "Tenta Missilers", "Crab Tank Drivers", "Zipcasters",
            "Splatana Slashers", "Stringer Snipers", "Wave Breakers",
            "Reefsliders", "Splatfest Veterans", "Tableturfers", "Grizzco Recruits",
            "Big Run Survivors", "Egg Collectors", "King Salmonid Hunters",
            "Anarchy Rulers", "Altarians", "Turf Fiends", "Locker Designers",
            "Catalog Grinders", "Badge Hoarders", "Sticker Collectors",
            "Splash Wall Abusers", "Sub Spammers", "Rank Demoters",
            "Lobby Dwellers", "Shoal Gamers", "Naut Couture Fans", "Squid Sisters Loyalists",
            "Marina OF Subcribers", "Big Man OF Subscribers", "Sneaky-Squids", "Ninja-Squids",
            "Portsmouth Fan", "Build", "BUT AGAIN", "Burst-bombs", "Cardinals", "Woomyers", "Slugs"
            "Sea-stags", "wawa", "Royals", "Ducklings", "Grillers", "Paladins", "Sea-Lions", "Sisters",
            "Cut", "Big-Shots", "Glowflies", "No-lifers", "Lobby Dwellers", "Booyah Bomb Tax Evaders", "Dualies",
            "Chargers", "Splashers", "Fuzzy Ooze", "Mains", "Squids", "Octolings",
            "Ninja Squids", "Squidbaggers", "Sharkers", "Tryhards",
            "Smurfs", "Missile Spammers", "Tenta Missilers", "Zipcaster Users",
            "Crab Tank Enjoyers", "Disconnect Warriors", "Anarchy Battle Mains",
            "Tableturfers", "Locker Artists", "Freshies", "Catalog Grinders",
            "Gear Simps", "Meta Abusers", "Sticker Collectors", "Altarians"
        ]

    def _generate_unique_team_name(self, used_names: set[str]) -> str:
        """Generate a unique team name using random adjective + subject combination.

        Args:
            used_names: Set of already used team names to avoid duplicates.

        Returns:
            A unique team name string, or a fallback numbered team name.
        """
        max_attempts = 100
        attempts = 0

        while attempts < max_attempts:
            adjective = random.choice(self.adjectives)
            subject = random.choice(self.subjects)
            team_name = f"{adjective} {subject}"

            if team_name not in used_names:
                return team_name

            attempts += 1

        return f"Team {len(used_names) + 1}"

    @slash_command(
        name="start-draft",
        description="Start a team drafting session"
    )
    @slash_option(
        name="team_size",
        description="Number of players per team (default: 4)",
        required=False,
        opt_type=OptionType.INTEGER
    )
    async def start_draft(self, ctx: interactions.SlashContext, team_size: int = 4) -> None:
        """Start a new team drafting session.

        Creates an interactive draft session where players can join/leave
        using buttons. Only one draft can be active per guild at a time.

        Args:
            ctx: The slash command context.
            team_size: Number of players per team (2-10, default 4).
        """
        if team_size < 2 or team_size > 10:
            await ctx.send("❌ Team size must be between 2 and 10 players.")
            return

        guild_id = ctx.guild.id

        if guild_id in self.active_drafts:
            await ctx.send("❌ There's already an active draft in this server. Use `/cancel-draft` to cancel it first.")
            return

        self.active_drafts[guild_id] = {
            "players": [],
            "team_size": team_size,
            "channel_id": ctx.channel.id,
            "organizer_id": ctx.author.id
        }
        join_button = Button(
            custom_id=f"draft_join_{guild_id}",
            style=ButtonStyle.GREEN,
            label="Join Draft",
            emoji="⚔️"
        )
        leave_button = Button(
            custom_id=f"draft_leave_{guild_id}",
            style=ButtonStyle.RED,
            label="Leave Draft",
            emoji="🚪"
        )

        embed = Embed(
            title="🎯 Team Draft Started!",
            description=(
                f"**Team Size:** {team_size} players per team\n**Players Joined:** 0"
                "\n\nClick the buttons below to join or leave the draft!"
            ),
            color=global_config.theme_colour
        )
        embed.set_footer(text=f"Organized by {ctx.author.display_name}")

        await ctx.send(embed=embed, components=[join_button, leave_button])

    @slash_command(
        name="cancel-draft",
        description="Cancel the current team drafting session"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    async def cancel_draft(self, ctx: interactions.SlashContext) -> None:
        """Cancel the current draft session.

        Removes the active draft for the current guild. Requires administrator
        permissions.

        Args:
            ctx: The slash command context.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to cancel.")
            return

        del self.active_drafts[guild_id]

        await ctx.send("✅ Draft session cancelled.")

    @slash_command(
        name="make-teams",
        description="Create teams from current draft participants"
    )
    @slash_default_member_permission(Permissions.ADMINISTRATOR)
    @slash_option(
        name="voice_category",
        description="Category to create voice channels in (optional)",
        required=False,
        opt_type=OptionType.CHANNEL
    )
    async def make_teams(self, ctx: interactions.SlashContext,
                         voice_category: Optional[interactions.GuildChannel] = None) -> None:
        """Create balanced teams from draft participants.

        Shuffles participants and creates full teams of the specified size.
        Optionally creates voice channels and moves players to their team channels.

        Args:
            ctx: The slash command context.
            voice_category: Optional category to create team voice channels in.
        """
        guild_id = ctx.guild.id

        if guild_id not in self.active_drafts:
            await ctx.send("❌ No active draft to make teams from.")
            return

        draft = self.active_drafts[guild_id]
        players = draft["players"]
        team_size = draft["team_size"]

        if len(players) < team_size * 2:
            await ctx.send(
                f"❌ Not enough players for teams. Need at least {team_size * 2}"
                " players (currently have {len(players)}).")
            return

        await ctx.defer(ephemeral=False)

        random.shuffle(players)
        teams: list[Dict[str, Any]] = []
        used_names: set[str] = set()

        for i in range(0, len(players), team_size):
            team_players = players[i:i + team_size]
            if len(team_players) == team_size:
                team_name = self._generate_unique_team_name(used_names)
                used_names.add(team_name)
                teams.append({
                    "name": team_name,
                    "players": team_players
                })

        if not teams:
            await ctx.send_followup("❌ Unable to create any full teams.")
            return

        # Create voice channels if category provided
        voice_channels: list[interactions.GuildChannel] = []
        if voice_category and voice_category.type == interactions.ChannelType.GUILD_CATEGORY:
            try:
                for team in teams:
                    voice_channel = await ctx.guild.create_voice_channel(
                        name=f"🎯 {team['name']}",
                        category=voice_category
                    )
                    voice_channels.append(voice_channel)

                    # Move players to their team voice channel
                    for player_id in team["players"]:
                        try:
                            member = await ctx.guild.fetch_member(player_id)
                            if member.voice and member.voice.channel:
                                await member.move_to(voice_channel)
                        except Exception as e:
                            logger.warning(f"Could not move player {player_id} to voice channel: {e}")
            except Exception as e:
                logger.error(f"Error creating voice channels: {e}")

        try:
            embed = Embed(
                title="🏆 Teams Created!",
                description=f"Successfully created {len(teams)} teams:",
                color=global_config.theme_colour
            )
            for i, team in enumerate(teams):
                player_mentions = []
                for player_id in team["players"]:
                    try:
                        member = await ctx.guild.fetch_member(player_id)
                        player_mentions.append(member.mention)
                    except Exception:
                        player_mentions.append(f"<@{player_id}>")
                embed.add_field(
                    name=f"⚔️ {team['name']}",
                    value="\n".join(player_mentions),
                    inline=True
                )

            leftover_players = players[len(teams) * team_size:]
            if leftover_players:
                leftover_mentions = []
                for player_id in leftover_players:
                    try:
                        member = await ctx.guild.fetch_member(player_id)
                        leftover_mentions.append(member.mention)
                    except Exception:
                        leftover_mentions.append(f"<@{player_id}>")

                embed.add_field(
                    name="🔄 The rejects",
                    value="\n".join(leftover_mentions),
                    inline=True
                )

            if voice_channels:
                embed.set_footer(text=f"Voice channels created in {voice_category.name}")

            await ctx.send_followup(embed=embed)
        except Exception as e:
            logger.error(f"Error creating or sending teams embed: {e}")
            try:
                teams_text = []
                for i, team in enumerate(teams):
                    player_mentions = []
                    for player_id in team["players"]:
                        try:
                            member = await ctx.guild.fetch_member(player_id)
                            player_mentions.append(member.mention)
                        except Exception:
                            player_mentions.append(f"<@{player_id}>")
                    teams_text.append(f"**{team['name']}:** {', '.join(player_mentions)}")

                fallback_message = f"🏆 **Teams Created!**\n\n{chr(10).join(teams_text)}"
                if voice_channels:
                    fallback_message += f"\n\n🔊 Voice channels created in {voice_category.name}"

                await ctx.send_followup(fallback_message)
            except Exception as fallback_error:
                logger.error(f"Error sending fallback message: {fallback_error}")
                await ctx.send_followup(
                    f"✅ Teams created successfully! ({len(teams)} teams,"
                    f" {len(voice_channels)} voice channels created)"
                )

        # Clear the draft
        del self.active_drafts[guild_id]

    @listen(ComponentEvent)
    async def on_component(self, event: ComponentEvent) -> None:
        """Handle button interactions for draft join/leave.

        Processes join and leave button clicks, updates the draft participant
        list, and refreshes the embed display.

        Args:
            event: The component interaction event.
        """
        ctx = event.ctx
        if not ctx.custom_id.startswith("draft_"):
            return

        parts = ctx.custom_id.split("_")
        if len(parts) != 3:
            return

        action = parts[1]  # "join" or "leave"
        guild_id = int(parts[2])

        if guild_id not in self.active_drafts:
            await ctx.send("❌ This draft is no longer active.", ephemeral=True)
            return

        draft = self.active_drafts[guild_id]
        user_id = ctx.author.id

        if action == "join":
            if user_id in draft["players"]:
                await ctx.send("❌ You're already in the draft!", ephemeral=True)
                return

            draft["players"].append(user_id)

        elif action == "leave":
            if user_id not in draft["players"]:
                await ctx.send("❌ You're not in the draft!", ephemeral=True)
                return

            draft["players"].remove(user_id)

        try:

            embed = Embed(
                title="🎯 Team Draft Started!",
                description=(
                    f"**Team Size:** {draft['team_size']} players per team\n"
                    f"**Players Joined:** {len(draft['players'])}"
                    "\n\nClick the buttons below to join or leave the draft!"
                ),
                color=global_config.theme_colour
            )

            if draft["players"]:
                player_list: list[str] = []
                for player_id in draft["players"]:
                    try:
                        member = await ctx.guild.fetch_member(player_id)
                        # Escape markdown characters in display name
                        escaped_name = member.display_name.replace("\\", "\\\\")\
                            .replace("*", "\\*")\
                            .replace("_", "\\_")\
                            .replace("`", "\\`")\
                            .replace("~", "\\~")\
                            .replace("|", "\\|")\
                            .replace("#", "\\#")\
                            .replace(">", "\\>")\
                            .replace("[", "\\[")\
                            .replace("]", "\\]")\
                            .replace("(", "\\(")\
                            .replace(")", "\\)")
                        player_list.append(f"{escaped_name} {member.mention}")
                    except Exception:
                        player_list.append(f"<@{player_id}>")

                # Split into chunks for better display if too many players
                display_text = "\n".join(player_list)
                if len(display_text) > 1024:  # Discord embed field limit

                    truncated_list = []
                    char_count = 0
                    for name in player_list:
                        if char_count + len(name) + 1 > 900:  # Leave room for truncation message
                            truncated_list.append(f"... and {len(player_list) - len(truncated_list)} more")
                            break
                        truncated_list.append(name)
                        char_count += len(name) + 1
                    display_text = "\n".join(truncated_list)

                embed.add_field(
                    name="📋 Current Players",
                    value=display_text,
                    inline=False
                )

            organizer = ctx.guild.get_member(draft['organizer_id'])
            organizer_name = organizer.display_name if organizer else 'Unknown'
            embed.set_footer(text=f"Organized by {organizer_name}")

            # Keep the same buttons
            join_button = Button(
                custom_id=f"draft_join_{guild_id}",
                style=ButtonStyle.GREEN,
                label="Join Draft",
                emoji="⚔️"
            )

            leave_button = Button(
                custom_id=f"draft_leave_{guild_id}",
                style=ButtonStyle.RED,
                label="Leave Draft",
                emoji="🚪"
            )

            await ctx.edit_origin(embed=embed, components=[join_button, leave_button])

            if action == "join":
                await ctx.send("✅ You've joined the draft!", ephemeral=True)
            elif action == "leave":
                await ctx.send("✅ You've left the draft!", ephemeral=True)

        except Exception as e:
            logger.error(f"Error updating draft message: {e}")
            try:
                await ctx.send(
                    f"⚠️ Draft updated but couldn't refresh the message. Current players: {len(draft['players'])}",
                    ephemeral=True
                )
            except Exception:
                pass


def setup(bot: interactions.Client) -> None:
    """Set up the Drafting extension for the bot.

    Args:
        bot: The Discord bot client instance.
    """
    DraftingExt(bot)
