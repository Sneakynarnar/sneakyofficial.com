"""Splatoon Bingo suggestions: submission rules, storage and card generation.

Members post challenge ideas in the suggestions channel. The Discord cog hands
each message here to be parsed and validated; the admin dashboard reads the
resulting pool, curates it, and draws random cards from it.

Two ideas keep the pool honest:

* A member gets exactly one accepted message. The lock is only taken once a
  submission is *accepted*, so a badly formatted first attempt does not burn
  their single go.
* A suggestion that has been drawn onto a saved card is marked used and never
  comes up again, which is what makes a second Bingo video possible without
  repeating squares.
"""
import json
import logging
import random
import re
from typing import Any, Optional

from backend.util.database_context_manager import DBContextManager
from backend.util.content_filter import check_free_text

logger = logging.getLogger("BingoManager")

MAX_SUGGESTIONS = 3
MIN_LENGTH = 5
MAX_LENGTH = 200

# "1. thing", "2) thing", "3 - thing" and friends. Anything else in the message
# is treated as prose and ignored.
_NUMBERED_LINE = re.compile(r"^\s*[*\-•]?\s*(\d{1,2})\s*[.)\]:\-]\s*(.+?)\s*$")

# Discord decorations that add nothing to a challenge once it is on a card.
_MENTION = re.compile(r"<@[!&]?\d+>|<#\d+>")
_CUSTOM_EMOJI = re.compile(r"<a?:(\w+):\d+>")


def _clean(text: str) -> str:
    """Strip Discord markup and collapse whitespace in a raw suggestion."""
    text = _MENTION.sub("", text)
    text = _CUSTOM_EMOJI.sub(r":\1:", text)
    text = text.replace("`", "").replace("*", "").replace("_", "")
    return " ".join(text.split())


def parse_submission(content: str) -> tuple[bool, Optional[str], list[str]]:
    """Pull the numbered suggestions out of a submission message.

    Args:
        content: The raw message content.

    Returns:
        (ok, error, suggestions). When ok is False, error explains what the
        member needs to change and suggestions is empty.
    """
    lines = [line for line in (content or "").splitlines() if line.strip()]
    found: list[str] = []
    for line in lines:
        match = _NUMBERED_LINE.match(line)
        if match:
            found.append(_clean(match.group(2)))

    if not found:
        return False, (
            "I couldn't find any numbered suggestions in that message. Please "
            "format them like:\n```\n1. First suggestion\n2. Second suggestion\n"
            "3. Third suggestion\n```"
        ), []

    if len(found) > MAX_SUGGESTIONS:
        return False, (
            f"That message has {len(found)} suggestions and the limit is "
            f"{MAX_SUGGESTIONS}. Nothing has been saved yet, so post again with "
            f"your best {MAX_SUGGESTIONS}."
        ), []

    seen: set[str] = set()
    for suggestion in found:
        ok, reason = check_free_text(suggestion, MIN_LENGTH, MAX_LENGTH, "Each suggestion")
        if not ok:
            return False, f"{reason} Nothing has been saved, so feel free to post again.", []
        key = suggestion.lower()
        if key in seen:
            return False, (
                "Two of those suggestions are the same. Nothing has been saved, "
                "so post again with three different ideas."
            ), []
        seen.add(key)

    return True, None, found


_TABLES = (
    """CREATE TABLE IF NOT EXISTS bingo_suggestions (
         id INT AUTO_INCREMENT PRIMARY KEY,
         guild_id BIGINT NOT NULL,
         channel_id BIGINT NOT NULL,
         message_id BIGINT NOT NULL,
         discord_id BIGINT NOT NULL,
         display_name VARCHAR(100) NOT NULL,
         position TINYINT NOT NULL,
         suggestion VARCHAR(300) NOT NULL,
         excluded TINYINT NOT NULL DEFAULT 0,
         used TINYINT NOT NULL DEFAULT 0,
         used_card_id INT DEFAULT NULL,
         status VARCHAR(10) NOT NULL DEFAULT 'pending',
         reject_reason VARCHAR(300) DEFAULT NULL,
         reviewed_at DATETIME DEFAULT NULL,
         reviewed_by BIGINT DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_message_position (message_id, position),
         INDEX idx_guild_user (guild_id, discord_id),
         INDEX idx_pool (guild_id, excluded, used)
       )""",
    """CREATE TABLE IF NOT EXISTS bingo_submitters (
         guild_id BIGINT NOT NULL,
         discord_id BIGINT NOT NULL,
         message_id BIGINT NOT NULL,
         display_name VARCHAR(100) NOT NULL,
         accepted_count TINYINT NOT NULL DEFAULT 0,
         thread_id BIGINT DEFAULT NULL,
         notified_ids VARCHAR(255) DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (guild_id, discord_id)
       )""",
    """CREATE TABLE IF NOT EXISTS bingo_cards (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name VARCHAR(120) NOT NULL,
         card_rows TINYINT NOT NULL,
         card_cols TINYINT NOT NULL,
         free_space TINYINT NOT NULL DEFAULT 0,
         cells JSON NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )""",
)

# Columns added after the tables first shipped. CREATE TABLE IF NOT EXISTS will
# not touch an existing table, so each one is added separately and tolerates
# already being there.
_COLUMNS = (
    "ALTER TABLE bingo_suggestions ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'pending'",
    "ALTER TABLE bingo_suggestions ADD COLUMN reject_reason VARCHAR(300) DEFAULT NULL",
    "ALTER TABLE bingo_suggestions ADD COLUMN reviewed_at DATETIME DEFAULT NULL",
    "ALTER TABLE bingo_suggestions ADD COLUMN reviewed_by BIGINT DEFAULT NULL",
    "ALTER TABLE bingo_submitters ADD COLUMN thread_id BIGINT DEFAULT NULL",
    "ALTER TABLE bingo_submitters ADD COLUMN notified_ids VARCHAR(255) DEFAULT NULL",
)

_tables_ready = False


async def ensure_tables() -> None:
    """Create the bingo tables and columns on first use.

    schema.sql is applied by hand, so a fresh deploy would otherwise 500 on the
    first suggestion until someone remembered to run it. Creating on demand
    costs one cheap round trip per process.
    """
    global _tables_ready
    if _tables_ready:
        return
    async with DBContextManager() as cur:
        for statement in _TABLES:
            await cur.execute(statement)
        for statement in _COLUMNS:
            try:
                await cur.execute(statement)
            except Exception as e:
                if "duplicate column name" not in str(e).lower():
                    raise
    _tables_ready = True


class BingoManager:
    """Storage and card generation for Splatoon Bingo suggestions."""

    # ------------------------------------------------------------------ #
    #  Submissions                                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_submitter(guild_id: int, discord_id: int) -> Optional[dict[str, Any]]:
        """Return a member's existing submission record, if they have one."""
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT * FROM bingo_submitters WHERE guild_id = %s AND discord_id = %s",
                (guild_id, discord_id)
            )
            return await cur.fetchone()

    @staticmethod
    async def record_submission(guild_id: int, channel_id: int, message_id: int,
                                discord_id: int, display_name: str,
                                suggestions: list[str]) -> tuple[bool, str]:
        """Store an accepted submission and take the member's one-message lock.

        Args:
            guild_id: Guild the message was posted in.
            channel_id: Suggestions channel ID.
            message_id: The submission message ID.
            discord_id: The submitting member.
            display_name: Their display name at time of submission.
            suggestions: The parsed suggestions, in order.

        Returns:
            (ok, message) where message is safe to show the member.
        """
        await ensure_tables()
        async with DBContextManager() as cur:
            # The insert doubles as the lock: a second message racing the first
            # loses here rather than half-writing a second set of suggestions.
            await cur.execute(
                """INSERT IGNORE INTO bingo_submitters
                   (guild_id, discord_id, message_id, display_name, accepted_count)
                   VALUES (%s, %s, %s, %s, %s)""",
                (guild_id, discord_id, message_id, display_name[:100], len(suggestions))
            )
            if cur.rowcount == 0:
                return False, "You've already submitted; only your first message counts."

            for position, suggestion in enumerate(suggestions, start=1):
                await cur.execute(
                    """INSERT INTO bingo_suggestions
                       (guild_id, channel_id, message_id, discord_id, display_name,
                        position, suggestion)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (guild_id, channel_id, message_id, discord_id,
                     display_name[:100], position, suggestion)
                )

        count = len(suggestions)
        return True, f"Saved {count} suggestion{'s' if count != 1 else ''}."

    # ------------------------------------------------------------------ #
    #  Pool management                                                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def list_suggestions(guild_id: Optional[int] = None) -> list[dict[str, Any]]:
        """Return every stored suggestion, newest submission first."""
        query = """SELECT s.id, s.guild_id, s.discord_id, s.display_name, s.position,
                          s.suggestion, s.excluded, s.used, s.used_card_id,
                          s.message_id, s.channel_id, s.created_at,
                          s.status, s.reject_reason, s.reviewed_at,
                          c.name AS used_card_name
                   FROM bingo_suggestions s
                   LEFT JOIN bingo_cards c ON c.id = s.used_card_id"""
        params: tuple[Any, ...] = ()
        if guild_id:
            query += " WHERE s.guild_id = %s"
            params = (guild_id,)
        query += " ORDER BY s.created_at DESC, s.discord_id, s.position"

        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(query, params)
            rows = await cur.fetchall()

        for row in rows:
            row["excluded"] = bool(row["excluded"])
            row["used"] = bool(row["used"])
            row["created_at"] = row["created_at"].isoformat() if row["created_at"] else None
            row["reviewed_at"] = row["reviewed_at"].isoformat() if row["reviewed_at"] else None
            # Message and Discord IDs exceed what JavaScript can hold exactly.
            for key in ("message_id", "channel_id", "discord_id", "guild_id"):
                row[key] = str(row[key]) if row[key] is not None else None
        return rows

    @staticmethod
    async def set_excluded(suggestion_ids: list[int], excluded: bool) -> int:
        """Exclude or restore suggestions, keeping them out of future draws."""
        if not suggestion_ids:
            return 0
        placeholders = ", ".join(["%s"] * len(suggestion_ids))
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                f"UPDATE bingo_suggestions SET excluded = %s WHERE id IN ({placeholders})",
                (1 if excluded else 0, *suggestion_ids)
            )
            return cur.rowcount

    @staticmethod
    async def set_used(suggestion_ids: list[int], used: bool) -> int:
        """Mark suggestions as used or hand them back to the pool."""
        if not suggestion_ids:
            return 0
        placeholders = ", ".join(["%s"] * len(suggestion_ids))
        await ensure_tables()
        async with DBContextManager() as cur:
            if used:
                await cur.execute(
                    f"UPDATE bingo_suggestions SET used = 1 WHERE id IN ({placeholders})",
                    tuple(suggestion_ids)
                )
            else:
                await cur.execute(
                    "UPDATE bingo_suggestions SET used = 0, used_card_id = NULL "
                    f"WHERE id IN ({placeholders})",
                    tuple(suggestion_ids)
                )
            return cur.rowcount

    @staticmethod
    async def edit_suggestion(suggestion_id: int, text: str) -> tuple[bool, str]:
        """Reword a suggestion, for example to tighten it up before a card."""
        cleaned = _clean(text)
        ok, reason = check_free_text(cleaned, MIN_LENGTH, MAX_LENGTH, "Suggestion")
        if not ok:
            return False, reason or "Invalid suggestion."
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                "UPDATE bingo_suggestions SET suggestion = %s WHERE id = %s",
                (cleaned, suggestion_id)
            )
        return True, "Suggestion updated."

    @staticmethod
    async def delete_suggestions(suggestion_ids: list[int]) -> int:
        """Delete suggestions outright.

        The submitter keeps their one-message lock, so deleting is for content
        that should not exist rather than for giving somebody another go.
        """
        if not suggestion_ids:
            return 0
        placeholders = ", ".join(["%s"] * len(suggestion_ids))
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                f"DELETE FROM bingo_suggestions WHERE id IN ({placeholders})",
                tuple(suggestion_ids)
            )
            return cur.rowcount

    @staticmethod
    async def reset_submitter(guild_id: int, discord_id: int) -> int:
        """Let a member submit again by dropping their one-message lock."""
        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                "DELETE FROM bingo_submitters WHERE guild_id = %s AND discord_id = %s",
                (guild_id, discord_id)
            )
            return cur.rowcount

    # ------------------------------------------------------------------ #
    #  Review                                                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def set_status(suggestion_ids: list[int], status: str,
                         reason: Optional[str] = None,
                         admin_id: Optional[int] = None) -> tuple[bool, str, list[int]]:
        """Approve or reject suggestions, or send them back to pending.

        Args:
            suggestion_ids: Suggestions to update.
            status: One of pending, approved or rejected.
            reason: Why it was rejected. Required for rejections, since this is
                what gets posted back to the submitter in a thread.
            admin_id: Who made the call, kept for the audit trail.

        Returns:
            (ok, message, message_ids) where message_ids are the Discord
            messages whose review state changed and therefore need re-syncing.
        """
        if status not in ("pending", "approved", "rejected"):
            return False, "Unknown review status.", []
        if not suggestion_ids:
            return False, "Nothing selected.", []

        clean_reason: Optional[str] = None
        if status == "rejected":
            clean_reason = " ".join((reason or "").split())[:300]
            if len(clean_reason) < 3:
                return False, "Rejecting a suggestion needs a reason to send back.", []

        await ensure_tables()
        placeholders = ", ".join(["%s"] * len(suggestion_ids))
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                f"SELECT DISTINCT message_id FROM bingo_suggestions WHERE id IN ({placeholders})",
                tuple(suggestion_ids)
            )
            message_ids = [int(r["message_id"]) for r in await cur.fetchall()]

            if status == "pending":
                await cur.execute(
                    "UPDATE bingo_suggestions SET status = 'pending', reject_reason = NULL, "
                    f"reviewed_at = NULL, reviewed_by = NULL WHERE id IN ({placeholders})",
                    tuple(suggestion_ids)
                )
            else:
                await cur.execute(
                    "UPDATE bingo_suggestions SET status = %s, reject_reason = %s, "
                    f"reviewed_at = NOW(), reviewed_by = %s WHERE id IN ({placeholders})",
                    (status, clean_reason, admin_id, *suggestion_ids)
                )
            changed = cur.rowcount

            # A suggestion that stops being rejected has nothing outstanding to
            # explain, so forget that we told them. If it is rejected again
            # later, the new reason gets sent rather than silently swallowed.
            if status != "rejected":
                dropped = {str(i) for i in suggestion_ids}
                for mid in message_ids:
                    await cur.execute(
                        "SELECT notified_ids FROM bingo_submitters WHERE message_id = %s",
                        (mid,)
                    )
                    row = await cur.fetchone()
                    if not row or not row["notified_ids"]:
                        continue
                    kept = [x for x in row["notified_ids"].split(",") if x.strip() and x not in dropped]
                    await cur.execute(
                        "UPDATE bingo_submitters SET notified_ids = %s WHERE message_id = %s",
                        (",".join(kept) or None, mid)
                    )

        verb = {"approved": "Approved", "rejected": "Rejected", "pending": "Reset"}[status]
        return True, f"{verb} {changed} suggestion{'s' if changed != 1 else ''}.", message_ids

    @staticmethod
    async def message_review_state(message_id: int) -> Optional[dict[str, Any]]:
        """Summarise where one submission message has got to in review.

        Returns None when the message has no stored suggestions, which is the
        case for anything the bot turned away at the door.
        """
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT id, position, suggestion, status, reject_reason,
                          display_name, discord_id, channel_id, guild_id
                   FROM bingo_suggestions WHERE message_id = %s ORDER BY position""",
                (message_id,)
            )
            rows = await cur.fetchall()
            if not rows:
                return None

            await cur.execute(
                "SELECT thread_id, notified_ids FROM bingo_submitters WHERE message_id = %s",
                (message_id,)
            )
            submitter = await cur.fetchone()

        notified: set[int] = set()
        if submitter and submitter["notified_ids"]:
            notified = {int(x) for x in submitter["notified_ids"].split(",") if x.strip()}

        return {
            "message_id": message_id,
            "channel_id": int(rows[0]["channel_id"]),
            "guild_id": int(rows[0]["guild_id"]),
            "discord_id": int(rows[0]["discord_id"]),
            "display_name": rows[0]["display_name"],
            "thread_id": int(submitter["thread_id"]) if submitter and submitter["thread_id"] else None,
            "total": len(rows),
            "pending": [r for r in rows if r["status"] == "pending"],
            "approved": [r for r in rows if r["status"] == "approved"],
            "rejected": [r for r in rows if r["status"] == "rejected"],
            # Rejections the submitter has not been told about yet, so changing
            # your mind about another suggestion later still gets explained.
            "unreported": [r for r in rows
                           if r["status"] == "rejected" and r["id"] not in notified],
        }

    @staticmethod
    async def all_message_ids(guild_id: Optional[int] = None) -> list[int]:
        """Every submission message the bot has stored suggestions for."""
        await ensure_tables()
        query = "SELECT DISTINCT message_id FROM bingo_suggestions"
        params: tuple[Any, ...] = ()
        if guild_id:
            query += " WHERE guild_id = %s"
            params = (guild_id,)
        query += " ORDER BY message_id"
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(query, params)
            return [int(r["message_id"]) for r in await cur.fetchall()]

    @staticmethod
    async def known_message_ids(guild_id: int) -> set[int]:
        """Message IDs the bot has already made a decision about.

        Covers both stored suggestions and the message that took each member's
        one-message lock, so catch-up never reprocesses a message.
        """
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT DISTINCT message_id FROM bingo_suggestions WHERE guild_id = %s",
                (guild_id,)
            )
            known = {int(r["message_id"]) for r in await cur.fetchall()}
            await cur.execute(
                "SELECT message_id FROM bingo_submitters WHERE guild_id = %s",
                (guild_id,)
            )
            known.update(int(r["message_id"]) for r in await cur.fetchall())
        return known

    @staticmethod
    async def record_feedback(message_id: int, thread_id: int,
                              reported_ids: list[int]) -> None:
        """Note the feedback thread and which rejections it has explained.

        Keeping the reported IDs means only one thread is ever created and each
        rejection is explained exactly once, however many review passes it takes.
        """
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT notified_ids FROM bingo_submitters WHERE message_id = %s",
                (message_id,)
            )
            row = await cur.fetchone()
            known = {x for x in (row["notified_ids"] or "").split(",") if x.strip()} if row else set()
            known.update(str(i) for i in reported_ids)
            await cur.execute(
                "UPDATE bingo_submitters SET thread_id = %s, notified_ids = %s "
                "WHERE message_id = %s",
                (thread_id, ",".join(sorted(known))[:255], message_id)
            )

    # ------------------------------------------------------------------ #
    #  Cards                                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def draw_card(rows: int, cols: int, free_space: bool = False,
                        exclude_ids: Optional[list[int]] = None,
                        guild_id: Optional[int] = None) -> tuple[bool, str, list[dict[str, Any]]]:
        """Draw a random card from the available pool without saving it.

        Args:
            rows: Card height in squares.
            cols: Card width in squares.
            free_space: Whether the centre square is a free space. Only allowed
                when both dimensions are odd, since otherwise there is no centre.
            exclude_ids: Suggestion IDs to leave out of this draw only.
            guild_id: Restrict the pool to one guild.

        Returns:
            (ok, message, cells). Cells are in reading order, one per square.
        """
        if not 2 <= rows <= 8 or not 2 <= cols <= 8:
            return False, "Card dimensions must be between 2 and 8.", []
        if free_space and (rows % 2 == 0 or cols % 2 == 0):
            return False, "A free space needs both dimensions to be odd.", []

        needed = rows * cols - (1 if free_space else 0)

        where = ["status = 'approved'", "excluded = 0", "used = 0"]
        params: list[Any] = []
        if guild_id:
            where.append("guild_id = %s")
            params.append(guild_id)
        if exclude_ids:
            where.append(f"id NOT IN ({', '.join(['%s'] * len(exclude_ids))})")
            params.extend(exclude_ids)

        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT id, suggestion, display_name, discord_id FROM bingo_suggestions "
                f"WHERE {' AND '.join(where)}",
                tuple(params)
            )
            pool = await cur.fetchall()

        if len(pool) < needed:
            return False, (
                f"Not enough approved suggestions: a {rows}x{cols} card needs "
                f"{needed} and only {len(pool)} are available."
            ), []

        picked = random.sample(pool, needed)
        cells: list[dict[str, Any]] = []
        centre = (rows * cols) // 2 if free_space else -1
        for index in range(rows * cols):
            if index == centre:
                cells.append({"id": None, "text": "FREE", "display_name": None, "free": True})
            else:
                row = picked.pop()
                cells.append({
                    "id": row["id"],
                    "text": row["suggestion"],
                    "display_name": row["display_name"],
                    "free": False,
                })
        return True, f"Drew {needed} squares from a pool of {len(pool)}.", cells

    @staticmethod
    async def save_card(name: str, rows: int, cols: int, free_space: bool,
                        cells: list[dict[str, Any]]) -> tuple[bool, str, Optional[int]]:
        """Save a drawn card and mark every suggestion on it as used."""
        clean_name = " ".join((name or "").split())[:120] or "Untitled card"
        used_ids = [c["id"] for c in cells if c.get("id")]
        if not used_ids:
            return False, "That card has no suggestions on it.", None

        await ensure_tables()
        async with DBContextManager() as cur:
            await cur.execute(
                """INSERT INTO bingo_cards (name, card_rows, card_cols, free_space, cells)
                   VALUES (%s, %s, %s, %s, %s)""",
                (clean_name, rows, cols, 1 if free_space else 0, json.dumps(cells))
            )
            card_id = cur.lastrowid
            placeholders = ", ".join(["%s"] * len(used_ids))
            await cur.execute(
                "UPDATE bingo_suggestions SET used = 1, used_card_id = %s "
                f"WHERE id IN ({placeholders})",
                (card_id, *used_ids)
            )

        return True, f"Saved '{clean_name}' and marked {len(used_ids)} suggestions as used.", card_id

    @staticmethod
    async def list_cards() -> list[dict[str, Any]]:
        """Return every saved card, newest first."""
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT id, name, card_rows, card_cols, free_space, cells, created_at
                   FROM bingo_cards ORDER BY created_at DESC"""
            )
            rows = await cur.fetchall()

        for row in rows:
            row["free_space"] = bool(row["free_space"])
            row["created_at"] = row["created_at"].isoformat() if row["created_at"] else None
            if isinstance(row["cells"], (str, bytes, bytearray)):
                row["cells"] = json.loads(row["cells"])
        return rows

    @staticmethod
    async def delete_card(card_id: int, release: bool = True) -> tuple[bool, str]:
        """Delete a saved card, optionally returning its squares to the pool."""
        await ensure_tables()
        async with DBContextManager() as cur:
            if release:
                await cur.execute(
                    "UPDATE bingo_suggestions SET used = 0, used_card_id = NULL "
                    "WHERE used_card_id = %s",
                    (card_id,)
                )
            else:
                await cur.execute(
                    "UPDATE bingo_suggestions SET used_card_id = NULL WHERE used_card_id = %s",
                    (card_id,)
                )
            await cur.execute("DELETE FROM bingo_cards WHERE id = %s", (card_id,))
            if cur.rowcount == 0:
                return False, "That card no longer exists."
        return True, "Card deleted." + (" Its squares are back in the pool." if release else "")

    @staticmethod
    async def get_stats(guild_id: Optional[int] = None) -> dict[str, int]:
        """Return pool counts for the dashboard header."""
        where = "WHERE guild_id = %s" if guild_id else ""
        params: tuple[Any, ...] = (guild_id,) if guild_id else ()
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                f"""SELECT COUNT(*) AS total,
                           SUM(used = 1) AS used,
                           SUM(excluded = 1) AS excluded,
                           SUM(status = 'pending') AS pending,
                           SUM(status = 'approved') AS approved,
                           SUM(status = 'rejected') AS rejected,
                           SUM(status = 'approved' AND used = 0 AND excluded = 0) AS available,
                           COUNT(DISTINCT discord_id) AS submitters
                    FROM bingo_suggestions {where}""",
                params
            )
            row = await cur.fetchone() or {}
            await cur.execute("SELECT COUNT(*) AS cards FROM bingo_cards")
            cards = await cur.fetchone() or {}

        return {
            "total": int(row.get("total") or 0),
            "used": int(row.get("used") or 0),
            "excluded": int(row.get("excluded") or 0),
            "pending": int(row.get("pending") or 0),
            "approved": int(row.get("approved") or 0),
            "rejected": int(row.get("rejected") or 0),
            "available": int(row.get("available") or 0),
            "submitters": int(row.get("submitters") or 0),
            "cards": int(cards.get("cards") or 0),
        }
