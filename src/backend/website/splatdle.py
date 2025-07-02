import json
import os
import random
from datetime import datetime, timezone
import datetime
from ..util.database_context_manager import DBContextManager
import asyncio


class Splatdle():

    def __init__(self):
        self.current_weapon = None
        self.weapon_file = os.path.join(os.getcwd(), "src", "backend", "resources", "weapon.txt")
        with open(os.path.join(os.getcwd(), "src", "backend", "resources", "weapons.json"), "r", encoding="utf-8") as F:
            self.weapons = json.loads(F.read())["weapons"]
            self._load_or_pick_weapon()

    def _load_or_pick_weapon(self):
        today = datetime.datetime.now(timezone.utc).date()
        try:
            with open(self.weapon_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                weapon_name = data.get("weapon")
                date_str = data.get("date")
                if date_str == today.isoformat() and weapon_name in [w["name"] for w in self.weapons]:
                    self.current_weapon = weapon_name
                    return
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        self.pick_random_weapon(save=True)

    def pick_random_weapon(self, save=False):
        today = datetime.datetime.now(timezone.utc).date()
        weapon_candidate = random.choice(self.weapons)
        while self.current_weapon == weapon_candidate["name"]:
            weapon_candidate = random.choice(self.weapons)
        self.current_weapon = weapon_candidate["name"]
        if save:
            with open(self.weapon_file, "w", encoding="utf-8") as f:
                json.dump({"weapon": self.current_weapon,
                          "date": today.isoformat()}, f)

    def get_current_weapon(self):
        today = datetime.datetime.now(timezone.utc).date()
        try:
            with open(self.weapon_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                weapon_name = data.get("weapon")
                date_str = data.get("date")
                if date_str == today.isoformat() and weapon_name in [w["name"] for w in self.weapons]:
                    self.current_weapon = weapon_name
                    return self.current_weapon
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        self.pick_random_weapon(save=True)
        return self.current_weapon

    async def reset_played_today_and_streaks(self):
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

    async def run(self):
        """Run forever, picking a new weapon each day."""
        last_date = None
        while True:
            today = datetime.datetime.now(timezone.utc).date()
            if last_date != today:
                await self.reset_played_today_and_streaks()
                self._load_or_pick_weapon()
                last_date = today

            now = datetime.datetime.now(timezone.utc)
            # Make next_day timezone-aware
            next_day = datetime.datetime.combine(
                today + datetime.timedelta(days=1),
                datetime.time.min,
                tzinfo=timezone.utc  # 👈 THIS IS THE IMPORTANT FIX
            )
            seconds_until_next_day = (next_day - now).total_seconds()
            if seconds_until_next_day > 0:
                print(f"waiting {seconds_until_next_day} seconds")
                await asyncio.sleep(seconds_until_next_day)
