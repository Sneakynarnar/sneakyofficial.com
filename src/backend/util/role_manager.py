import logging
from typing import Optional

logger = logging.getLogger("RoleManager")

RANK_ROLES: dict[int, int] = {
    1: 1507063961462509752,  # Starter Squid
    2: 1507063962464686143,  # Amateur Squid
    3: 1507063964373356725,  # Cool Squid
    4: 1507063965241311364,  # Pro Squid
    5: 1507063966134702265,  # Legendary Squid
    6: 1507063967288131654,  # God Squid
}
_RANK_GUILD = 1019293451579293747


class RoleManager:
    _instance: "RoleManager | None" = None

    def __init__(self) -> None:
        self._bot = None

    @classmethod
    def get(cls) -> "RoleManager":
        if cls._instance is None:
            cls._instance = RoleManager()
        return cls._instance

    def set_bot(self, bot) -> None:
        self._bot = bot

    async def apply_rank_roles(self, discord_id: Optional[int], rank: Optional[int]) -> None:
        """Swap rank roles for a member: remove all rank roles then add the correct one."""
        if self._bot is None or not discord_id:
            return
        try:
            guild = self._bot.get_guild(_RANK_GUILD)
            if guild is None:
                return
            member = await guild.fetch_member(discord_id)
            if member is None:
                return
            for role_id in RANK_ROLES.values():
                try:
                    await member.remove_role(role_id, reason="Rank role sync")
                except Exception:
                    pass
            if rank is not None and rank in RANK_ROLES:
                await member.add_role(RANK_ROLES[rank], reason="Rank role sync")
        except Exception:
            logger.warning("Failed to apply rank roles for discord_id=%s rank=%s", discord_id, rank)
