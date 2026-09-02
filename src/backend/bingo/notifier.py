"""Pushing bingo review decisions back out to Discord.

The admin dashboard is where suggestions get approved or rejected, but the
people who submitted them only ever see Discord. This module is the bridge: it
keeps the reactions on a submission message in step with its review state and
opens a feedback thread when something did not make the cut.

Reactions on an accepted submission mean:

* ✅ 👁️ — the bot took it, an admin still has to look at it
* ✅      — everything in that message was approved
* ❌      — everything in that message was rejected

Only those three emoji are managed here, so a human reacting to a message with
anything else is left alone.
"""
import logging
from typing import Any, Optional

import interactions

from .manager import BingoManager

logger = logging.getLogger("BingoNotifier")

ACCEPTED_EMOJI = "✅"
REVIEW_EMOJI = "👁️"
REJECTED_EMOJI = "❌"

# The bot only ever adds or removes these, never anything a member added.
MANAGED_EMOJI = (ACCEPTED_EMOJI, REVIEW_EMOJI, REJECTED_EMOJI)

_THREAD_NAME_LIMIT = 100


def wanted_reactions(state: dict[str, Any]) -> set[str]:
    """Work out which managed reactions a submission should be showing."""
    if state["pending"]:
        return {ACCEPTED_EMOJI, REVIEW_EMOJI}
    if state["rejected"] and not state["approved"]:
        return {REJECTED_EMOJI}
    return {ACCEPTED_EMOJI}


def _feedback_text(state: dict[str, Any]) -> str:
    """Write the thread message explaining what did not make it, and why.

    Only rejections the submitter has not already been told about are listed,
    so a second review pass adds a follow-up rather than repeating itself.
    """
    rejected = state["unreported"]
    approved = state["approved"]
    total = state["total"]

    if approved:
        opening = (
            f"Thanks for the suggestions! {len(approved)} of your {total} made it "
            "into the bingo pool. "
            f"{'This one' if len(rejected) == 1 else 'These'} didn't:"
        )
    else:
        opening = (
            f"Thanks for submitting! Unfortunately "
            f"{'your suggestion' if total == 1 else 'none of your suggestions'} "
            "made it into the pool this time:"
        )

    lines = [f"<@{state['discord_id']}> {opening}", ""]
    for row in rejected:
        reason = row["reject_reason"] or "No reason given."
        lines.append(f"**{row['position']}. {row['suggestion']}**")
        lines.append(f"> {reason}")
        lines.append("")

    lines.append(
        "There'll be more Bingo videos, so feel free to keep the ideas coming "
        "next time round!"
    )
    return "\n".join(lines)[:1900]


async def _sync_reactions(message: interactions.Message, wanted: set[str]) -> None:
    """Add the reactions a message should have and drop the ones it shouldn't."""
    for emoji in MANAGED_EMOJI:
        try:
            if emoji in wanted:
                await message.add_reaction(emoji)
            else:
                await message.remove_reaction(emoji)
        except Exception:
            # A reaction that was never there cannot be removed, and a missing
            # permission should not stop the rest of the sync.
            logger.debug("Reaction %s on %s could not be updated", emoji, message.id)


async def _post_feedback(bot: interactions.Client, message: interactions.Message,
                         state: dict[str, Any]) -> None:
    """Open (or reuse) the feedback thread and post the outstanding reasons."""
    thread = None
    if state["thread_id"]:
        try:
            thread = await bot.fetch_channel(state["thread_id"])
        except Exception:
            logger.debug("Feedback thread %s has gone, making a new one", state["thread_id"])

    if thread is None:
        name = f"Bingo feedback for {state['display_name']}"[:_THREAD_NAME_LIMIT]
        thread = await message.create_thread(name=name)

    await thread.send(_feedback_text(state))
    await BingoManager.record_feedback(
        state["message_id"], int(thread.id), [r["id"] for r in state["unreported"]]
    )


async def sync_message(bot: interactions.Client, message_id: int,
                       channel_id: Optional[int] = None,
                       post_feedback: bool = True) -> bool:
    """Bring one submission message in Discord back in line with its review state.

    Args:
        bot: The Discord client.
        message_id: The submission message to update.
        channel_id: Its channel, looked up from the database when omitted.
        post_feedback: Whether a newly finished review may open a feedback
            thread. Turned off during catch-up so a backlog of old decisions
            does not spray threads across the channel.

    Returns:
        Whether the message was found and updated.
    """
    state = await BingoManager.message_review_state(message_id)
    if state is None:
        return False

    try:
        channel = await bot.fetch_channel(channel_id or state["channel_id"])
        message = await channel.fetch_message(message_id)
    except Exception:
        logger.warning("Could not fetch bingo message %s for syncing", message_id)
        return False
    if message is None:
        return False

    await _sync_reactions(message, wanted_reactions(state))

    # The thread is the explanation for a partly or wholly rejected submission,
    # and only makes sense once there is nothing left to review.
    if post_feedback and not state["pending"] and state["unreported"]:
        try:
            await _post_feedback(bot, message, state)
        except Exception:
            logger.exception("Could not post feedback thread for message %s", message_id)

    return True


async def sync_messages(bot: interactions.Client, message_ids: list[int],
                        post_feedback: bool = True) -> int:
    """Sync several submission messages, returning how many were updated."""
    synced = 0
    for message_id in message_ids:
        try:
            if await sync_message(bot, message_id, post_feedback=post_feedback):
                synced += 1
        except Exception:
            logger.exception("Failed syncing bingo message %s", message_id)
    return synced
