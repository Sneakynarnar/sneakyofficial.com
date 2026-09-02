"""Splatoon Bingo suggestions: submission rules, storage and card generation.

Members post challenge ideas in the suggestions channel. The Discord cog hands
each message here to be parsed and validated; the admin dashboard reads the
resulting pool, curates it, and draws random cards from it.

Two ideas keep the pool honest:

* A member may contribute up to ten suggestions in total, spread over as many
  messages as they like. A message that would take them past ten is refused
  whole rather than part-counted, so nobody has to guess which of their ideas
  survived.
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

# How many suggestions one person may have in the pool at once, across every
# message they send. Suggestions an admin rejects give the slot back.
MAX_PER_PERSON = 10
MIN_LENGTH = 5
MAX_LENGTH = 200

# Why a suggestion was turned down. The label names it, the explanation is what
# the submitter reads, so it is written to them rather than about them.
REJECT_CATEGORIES: dict[str, dict[str, str]] = {
    "clarification": {
        "label": "Needs more clarification",
        "explanation": (
            "We weren't quite sure what this one is asking for. Word it a little "
            "more precisely and it's welcome back."
        ),
    },
    "too_easy": {
        "label": "Too easy",
        "explanation": (
            "This would be over too quickly to make an interesting square."
        ),
    },
    "too_time_consuming": {
        "label": "Too time consuming",
        "explanation": (
            "This would eat a lot of time for a single square, and we'd rather "
            "not spend hours grinding one out."
        ),
    },
    "unattainable": {
        "label": "Requires potentially unattainable conditions",
        "explanation": (
            "This leans on something we might not be able to make happen, so it "
            "could end up impossible to tick off."
        ),
    },
    "other": {
        "label": "Other",
        "explanation": "",
    },
}

# The three shapes a list of suggestions turns up in. Numbered lines win when
# present because they are the most deliberate; bullets come next; failing both,
# every line is taken as its own suggestion.
_NUMBERED_LINE = re.compile(r"^\s*[*\-•]?\s*(\d{1,2})\s*[.)\]:\-]\s*(?!\d)(.+?)\s*$")
_BULLET_LINE = re.compile(r"^\s*[-*•·–—>+]+\s*(.+?)\s*$")

# A line like "Here are my suggestions:" introduces the list rather than being
# part of it, so it is dropped when nothing more explicit marks the entries.
_HEADING_LINE = re.compile(r"^.{0,60}:\s*$")

# Discord decorations that add nothing to a challenge once it is on a card.
_MENTION = re.compile(r"<@[!&]?\d+>|<#\d+>")
_CUSTOM_EMOJI = re.compile(r"<a?:(\w+):\d+>")


def _clean(text: str) -> str:
    """Strip Discord markup and collapse whitespace in a raw suggestion."""
    text = _MENTION.sub("", text)
    text = _CUSTOM_EMOJI.sub(r":\1:", text)
    text = text.replace("`", "").replace("*", "").replace("_", "")
    return " ".join(text.split())


def _extract(content: str) -> list[str]:
    """Pull the individual suggestions out of a message, however it is laid out.

    People write these lists three ways: numbered, bulleted, or one per line
    with no marker at all. Numbered entries are looked for first because they
    are unambiguous, then bullets, and only if neither appears is every line
    taken at face value.
    """
    lines = [line for line in (content or "").splitlines() if line.strip()]

    numbered = [_clean(m.group(2)) for m in
                (_NUMBERED_LINE.match(line) for line in lines) if m]
    if numbered:
        return numbered

    bulleted = [_clean(m.group(1)) for m in
                (_BULLET_LINE.match(line) for line in lines) if m]
    if bulleted:
        return bulleted

    # Bare lines. Drop a leading "my suggestions:" style heading, which is the
    # one bit of preamble common enough to be worth recognising.
    plain = [_clean(line) for line in lines]
    if len(plain) > 1 and _HEADING_LINE.match(plain[0]):
        plain = plain[1:]
    return [line for line in plain if line]


def parse_submission(content: str) -> tuple[bool, Optional[str], list[str]]:
    """Pull the suggestions out of a submission message.

    Numbered lists, bulleted lists and one-per-line all work. How many is too
    many depends on how much of their allowance the member has left, so that
    check lives in :meth:`BingoManager.record_submission` rather than here.

    Args:
        content: The raw message content.

    Returns:
        (ok, error, suggestions). When ok is False, error explains what the
        member needs to change and suggestions is empty.
    """
    found = _extract(content)

    if not found:
        return False, (
            "I couldn't find any suggestions in that message. Put each one on "
            "its own line, numbered or bulleted if you like:\n```\n"
            "1. First suggestion\n2. Second suggestion\n```"
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
                "so post again with different ideas."
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
         reject_category VARCHAR(32) DEFAULT NULL,
         reject_reason VARCHAR(300) DEFAULT NULL,
         reviewed_at DATETIME DEFAULT NULL,
         reviewed_by BIGINT DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_message_position (message_id, position),
         INDEX idx_guild_user (guild_id, discord_id),
         INDEX idx_pool (guild_id, excluded, used)
       )""",
    """CREATE TABLE IF NOT EXISTS bingo_submission_messages (
         message_id BIGINT NOT NULL,
         guild_id BIGINT NOT NULL,
         discord_id BIGINT NOT NULL,
         display_name VARCHAR(100) NOT NULL,
         accepted_count TINYINT NOT NULL DEFAULT 0,
         notified_ids VARCHAR(255) DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (message_id),
         INDEX idx_member (guild_id, discord_id)
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
    "ALTER TABLE bingo_suggestions ADD COLUMN reject_category VARCHAR(32) DEFAULT NULL",
    "ALTER TABLE bingo_suggestions ADD COLUMN reject_reason VARCHAR(300) DEFAULT NULL",
    "ALTER TABLE bingo_suggestions ADD COLUMN reviewed_at DATETIME DEFAULT NULL",
    "ALTER TABLE bingo_suggestions ADD COLUMN reviewed_by BIGINT DEFAULT NULL",
    "ALTER TABLE bingo_submission_messages ADD COLUMN notified_ids VARCHAR(255) DEFAULT NULL",
)

async def _migrate_submitters(cur: Any) -> None:
    """Move the old one-row-per-member table to one row per message.

    Members used to get a single submission, so the table was keyed by member.
    They can now send several messages, and the thread and feedback bookkeeping
    hangs off each message, so the key has to move with it.
    """
    await cur.execute("SHOW TABLES LIKE 'bingo_submitters'")
    has_old = await cur.fetchone() is not None
    await cur.execute("SHOW TABLES LIKE 'bingo_submission_messages'")
    has_new = await cur.fetchone() is not None

    if has_old and not has_new:
        await cur.execute("RENAME TABLE bingo_submitters TO bingo_submission_messages")
        has_new = True
    if not has_new:
        return

    # The old primary key was (guild_id, discord_id); a member with two messages
    # would collide on it.
    await cur.execute(
        """SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'bingo_submission_messages'
             AND CONSTRAINT_NAME = 'PRIMARY'"""
    )
    key_columns = {row[0] if isinstance(row, tuple) else row["COLUMN_NAME"]
                   for row in await cur.fetchall()}
    if key_columns == {"message_id"}:
        return

    await cur.execute("ALTER TABLE bingo_submission_messages DROP PRIMARY KEY, "
                      "ADD PRIMARY KEY (message_id)")
    try:
        await cur.execute("ALTER TABLE bingo_submission_messages "
                          "ADD INDEX idx_member (guild_id, discord_id)")
    except Exception as e:
        if "duplicate key name" not in str(e).lower():
            raise
    logger.info("Migrated bingo_submission_messages to a per-message primary key")


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
        await _migrate_submitters(cur)
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
    async def allowance(guild_id: int, discord_id: int) -> tuple[int, int]:
        """How much of their ten a member has spent, and how much is left.

        Suggestions an admin rejected do not count. They are not in the pool,
        and holding a slot against someone for an editorial call they cannot
        appeal would be unfair.

        Returns:
            (used, remaining).
        """
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                """SELECT COUNT(*) AS used FROM bingo_suggestions
                   WHERE guild_id = %s AND discord_id = %s AND status != 'rejected'""",
                (guild_id, discord_id)
            )
            row = await cur.fetchone() or {}
        used = int(row.get("used") or 0)
        return used, max(0, MAX_PER_PERSON - used)

    @staticmethod
    async def record_submission(guild_id: int, channel_id: int, message_id: int,
                                discord_id: int, display_name: str,
                                suggestions: list[str]) -> tuple[bool, str, int]:
        """Store a submission, provided it fits inside the member's allowance.

        A message that would take somebody past ten is refused whole. Saving
        part of it would leave them guessing which ideas counted, and the
        caller deletes the message so they can simply post a shorter one.

        Args:
            guild_id: Guild the message was posted in.
            channel_id: Suggestions channel ID.
            message_id: The submission message ID.
            discord_id: The submitting member.
            display_name: Their display name at time of submission.
            suggestions: The parsed suggestions, in order.

        Returns:
            (ok, message, remaining) where message is safe to show the member
            and remaining is how many more they may still submit.
        """
        await ensure_tables()
        _, remaining = await BingoManager.allowance(guild_id, discord_id)

        if len(suggestions) > remaining:
            if remaining == 0:
                return False, (
                    f"You've already used all {MAX_PER_PERSON} of your Splatoon "
                    "Bingo suggestions, so that message wasn't counted."
                ), 0
            return False, (
                f"You can only submit {remaining} more "
                f"suggestion{'s' if remaining != 1 else ''}, and that message had "
                f"{len(suggestions)}. Nothing was saved, so post again with "
                f"{remaining} or fewer."
            ), remaining

        async with DBContextManager() as cur:
            # The insert doubles as a guard against the same message being
            # processed twice, which catch-up and the live listener could race on.
            await cur.execute(
                """INSERT IGNORE INTO bingo_submission_messages
                   (message_id, guild_id, discord_id, display_name, accepted_count)
                   VALUES (%s, %s, %s, %s, %s)""",
                (message_id, guild_id, discord_id, display_name[:100], len(suggestions))
            )
            if cur.rowcount == 0:
                return False, "That message has already been counted.", remaining

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
        left = remaining - count
        return True, f"Saved {count} suggestion{'s' if count != 1 else ''}.", left

    # ------------------------------------------------------------------ #
    #  Pool management                                                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def list_suggestions(guild_id: Optional[int] = None) -> list[dict[str, Any]]:
        """Return every stored suggestion, newest submission first."""
        query = """SELECT s.id, s.guild_id, s.discord_id, s.display_name, s.position,
                          s.suggestion, s.excluded, s.used, s.used_card_id,
                          s.message_id, s.channel_id, s.created_at,
                          s.status, s.reject_category, s.reject_reason, s.reviewed_at,
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

    # ------------------------------------------------------------------ #
    #  Review                                                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def set_status(suggestion_ids: list[int], status: str,
                         category: Optional[str] = None,
                         reason: Optional[str] = None,
                         admin_id: Optional[int] = None) -> tuple[bool, str, list[int]]:
        """Approve or reject suggestions, or send them back to pending.

        Args:
            suggestion_ids: Suggestions to update.
            status: One of pending, approved or rejected.
            category: Which of REJECT_CATEGORIES applies. Required for
                rejections, since it is what the submitter is told.
            reason: Optional extra detail to go with the category, and the
                whole explanation when the category is "other".
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
        clean_category: Optional[str] = None
        if status == "rejected":
            clean_category = (category or "").strip()
            if clean_category not in REJECT_CATEGORIES:
                return False, "Pick a reason for turning this one down.", []
            clean_reason = " ".join((reason or "").split())[:300] or None
            # Every other category explains itself; "other" only says what the
            # admin writes, so it cannot be left blank.
            if clean_category == "other" and not clean_reason:
                return False, "\"Other\" needs a note explaining the decision.", []

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
                    "UPDATE bingo_suggestions SET status = 'pending', reject_category = NULL, "
                    "reject_reason = NULL, reviewed_at = NULL, reviewed_by = NULL "
                    f"WHERE id IN ({placeholders})",
                    tuple(suggestion_ids)
                )
            else:
                await cur.execute(
                    "UPDATE bingo_suggestions SET status = %s, reject_category = %s, "
                    "reject_reason = %s, reviewed_at = NOW(), reviewed_by = %s "
                    f"WHERE id IN ({placeholders})",
                    (status, clean_category, clean_reason, admin_id, *suggestion_ids)
                )
            changed = cur.rowcount

            # A suggestion that stops being rejected has nothing outstanding to
            # explain, so forget that we told them. If it is rejected again
            # later, the new reason gets sent rather than silently swallowed.
            if status != "rejected":
                dropped = {str(i) for i in suggestion_ids}
                for mid in message_ids:
                    await cur.execute(
                        "SELECT notified_ids FROM bingo_submission_messages WHERE message_id = %s",
                        (mid,)
                    )
                    row = await cur.fetchone()
                    if not row or not row["notified_ids"]:
                        continue
                    kept = [x for x in row["notified_ids"].split(",") if x.strip() and x not in dropped]
                    await cur.execute(
                        "UPDATE bingo_submission_messages SET notified_ids = %s WHERE message_id = %s",
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
                """SELECT id, position, suggestion, status, reject_category,
                          reject_reason, display_name, discord_id, channel_id, guild_id
                   FROM bingo_suggestions WHERE message_id = %s ORDER BY position""",
                (message_id,)
            )
            rows = await cur.fetchall()
            if not rows:
                return None

            await cur.execute(
                "SELECT notified_ids FROM bingo_submission_messages WHERE message_id = %s",
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
                "SELECT message_id FROM bingo_submission_messages WHERE guild_id = %s",
                (guild_id,)
            )
            known.update(int(r["message_id"]) for r in await cur.fetchall())
        return known

    @staticmethod
    async def record_feedback(message_id: int, reported_ids: list[int]) -> None:
        """Note which rejections the submitter has now been told about.

        Keeping the reported IDs means each rejection is explained exactly once,
        however many review passes it takes, and that a delivery that failed is
        retried on the next sync rather than being lost.
        """
        await ensure_tables()
        async with DBContextManager(use_dict=True) as cur:
            await cur.execute(
                "SELECT notified_ids FROM bingo_submission_messages WHERE message_id = %s",
                (message_id,)
            )
            row = await cur.fetchone()
            known = {x for x in (row["notified_ids"] or "").split(",") if x.strip()} if row else set()
            known.update(str(i) for i in reported_ids)
            await cur.execute(
                "UPDATE bingo_submission_messages SET notified_ids = %s "
                "WHERE message_id = %s",
                (",".join(sorted(known))[:255], message_id)
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
