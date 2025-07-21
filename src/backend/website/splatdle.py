import json
import os
import random
from urllib.parse import urljoin, quote
from datetime import datetime, timezone
import datetime
from typing import Optional, Dict, Any, List
from ..util.database_context_manager import DBContextManager
from ..util.config import global_config
import asyncio
import interactions


class Splatdle:
    """Splatdle daily weapon guessing game manager.

    Handles daily weapon selection, player statistics, database interactions,
    and Discord announcements for the Splatdle game.

    Attributes:
        current_weapon: Currently selected weapon for today's game.
        weapon_file: Path to the current weapon storage file.
        bot: Discord bot instance for sending announcements.
        weapons: List of all available weapons loaded from JSON.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the Splatdle game manager.

        Args:
            bot: Discord bot client for sending announcements.
        """
        self.current_weapon: Optional[Dict[str, Any]] = None
        self.weapon_file: str = os.path.join(os.getcwd(), "src", "backend", "resources", "weapon.txt")
        self.bot: interactions.Client = bot
        with open(os.path.join(os.getcwd(), "src", "backend", "resources", "weapons.json"), "r", encoding="utf-8") as F:
            self.weapons: List[Dict[str, Any]] = json.loads(F.read())["weapons"]

    async def _load_or_pick_weapon(self) -> None:
        """Load today's weapon from file or pick a new random weapon.

        Checks if a weapon for today exists in the storage file, validates it
        against the weapons list, or picks a new random weapon if needed.
        Sends announcement if a new weapon is selected.
        """
        today = datetime.datetime.now(timezone.utc).date()
        old_weapon = self.current_weapon  # Store the old weapon before picking new one
        try:
            with open(self.weapon_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                weapon_data = data.get("weapon")
                date_str = data.get("date")
                if date_str == today.isoformat() and weapon_data:
                    # Check if this exact weapon (name + game) exists
                    for weapon in self.weapons:
                        if weapon["name"] == weapon_data["name"] and weapon["game"] == weapon_data["game"]:
                            self.current_weapon = weapon
                            return
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        self.pick_random_weapon(save=True)
        # Only send announcement if we have a valid weapon
        if self.current_weapon and isinstance(self.current_weapon, dict):
            await self._send_splatdle_announcement(old_weapon)

    async def _send_splatdle_announcement(self, old_weapon: Optional[Dict[str, Any]] = None) -> None:
        """Send Splatdle reset announcement to configured channels.

        Sends an embed message to all configured guild channels announcing
        the daily weapon reset and showing the previous weapon if available.

        Args:
            old_weapon: The previous weapon to display in the announcement.
        """
        import logging
        logger = logging.getLogger("Splatdle")

        if not self.bot:
            logger.warning("Bot not available, skipping Discord announcement")
            return

        try:
            async with DBContextManager(use_dict=True) as cur:
                await cur.execute("SELECT * FROM SplatdleChannels")
                records = await cur.fetchall()

            if not records:
                logger.info("No Discord channels configured for splatdle announcements")
                return

            # Use old weapon for announcement if available, otherwise show that it's a new game
            if old_weapon and isinstance(old_weapon, dict):
                weapon_name = f"{old_weapon['name']} ({old_weapon['game']})"
                embed = interactions.Embed(
                    title="Splatdle weapon reset!",
                    description=f"The previous weapon was {weapon_name}"
                )
                embed.color = global_config.theme_colour
                embed.set_image(urljoin("https://sneakyofficial.com/images/", quote(old_weapon["image"])))
            else:
                embed = interactions.Embed(
                    title="Splatdle weapon reset!",
                    description="A new Splatdle challenge is available!"
                )

            successful_sends = 0
            for record in records:
                channel_id = record["channel_id"] if isinstance(record, dict) else record[1]
                guild_id = record["guild_id"] if isinstance(record, dict) else record[0]

                try:
                    channel = await self.bot.fetch_channel(channel_id)
                    if channel:
                        await channel.send(embeds=embed)
                        successful_sends += 1
                        logger.info(f"Successfully sent splatdle announcement to channel {channel_id} in guild {guild_id}")
                    else:
                        logger.warning(f"Could not fetch channel {channel_id} in guild {guild_id}")
                except Exception as e:
                    logger.error(f"Failed to send splatdle announcement to channel {channel_id} in guild {guild_id}: {e}")
                    continue

            logger.info(f"Splatdle announcement sent to {successful_sends}/{len(records)} channels")

        except Exception as e:
            logger.error(f"Failed to send splatdle announcements: {e}")
            import traceback
            logger.error(traceback.format_exc())

    def pick_random_weapon(self, save: bool = False) -> None:
        """Pick a random weapon from the weapons list.

        Selects a random weapon that's different from the current weapon
        and optionally saves it to the storage file.

        Args:
            save: Whether to save the selected weapon to file (default: False).
        """
        today = datetime.datetime.now(timezone.utc).date()
        weapon_candidate = random.choice(self.weapons)
        while (self.current_weapon and
               isinstance(self.current_weapon, dict) and
               self.current_weapon["name"] == weapon_candidate["name"] and
               self.current_weapon["game"] == weapon_candidate["game"]):
            weapon_candidate = random.choice(self.weapons)
        self.current_weapon = weapon_candidate
        if save:
            with open(self.weapon_file, "w", encoding="utf-8") as f:
                json.dump({"weapon": {"name": self.current_weapon["name"], "game": self.current_weapon["game"]},
                          "date": today.isoformat()}, f)

    def get_current_weapon(self) -> Optional[Dict[str, Any]]:
        """Get the current weapon for today.

        Loads the weapon from file if it exists for today, otherwise
        picks a new random weapon and saves it.

        Returns:
            Dictionary containing weapon data or None if unavailable.
        """
        today = datetime.datetime.now(timezone.utc).date()
        try:
            with open(self.weapon_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                weapon_data = data.get("weapon")
                date_str = data.get("date")
                if date_str == today.isoformat() and weapon_data:
                    # Find the exact weapon (name + game)
                    for weapon in self.weapons:
                        if weapon["name"] == weapon_data["name"] and weapon["game"] == weapon_data["game"]:
                            self.current_weapon = weapon
                            return self.current_weapon
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        self.pick_random_weapon(save=True)
        return self.current_weapon

    async def reset_played_today_and_streaks(self) -> None:
        """Reset daily player statistics.

        Resets streaks for players who didn't play today, clears the
        played_today flags for all players, and empties the daily leaderboard.
        """
        async with DBContextManager() as cur:
            # Reset streaks for users who didn't play
            await cur.execute("""
                UPDATE UserStats
                SET streak = 0
                WHERE played_today = FALSE
            """)

            # Reset everyone’s played_today for next day
            await cur.execute("""
                UPDATE UserStats
                SET played_today = FALSE
            """)
            await cur.execute("""
                DELETE FROM TodaysLeaderboard;
            """)

    async def run(self) -> None:
        """Run the daily Splatdle game loop.

        Continuously checks for date changes and triggers weapon resets,
        database cleanup, and announcements when a new day begins.
        """
        """Run forever, picking a new weapon each day."""
        last_date = None

        if os.path.exists(self.weapon_file):
            with open(self.weapon_file, "r") as f:
                try:
                    data = json.load(f)
                    last_date = datetime.datetime.strptime(data["date"], "%Y-%m-%d").date()
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    print(f"Failed to load last_date from weapons.txt: {e}")
                    last_date = None

        while True:
            today = datetime.datetime.now(timezone.utc).date()
            if last_date != today:
                await self.reset_played_today_and_streaks()
                try:
                    await self._load_or_pick_weapon()
                except Exception as e:
                    import logging
                    logger = logging.getLogger("Splatdle")
                    logger.error(f"Error during weapon selection/announcement: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                print("Reset splatdle!")

                last_date = today

            now = datetime.datetime.now(timezone.utc)
            next_day = datetime.datetime.combine(
                today + datetime.timedelta(days=1),
                datetime.time.min,
                tzinfo=timezone.utc
            )
            seconds_until_next_day = (next_day - now).total_seconds()
            if seconds_until_next_day > 0:
                print(f"waiting {seconds_until_next_day} seconds")
                await asyncio.sleep(seconds_until_next_day)

