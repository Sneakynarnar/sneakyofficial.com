"""Pushing bingo review decisions back out to Discord.

The admin dashboard is where suggestions get approved or turned down, but the
people who submitted them only ever see Discord. This module is the bridge: it
keeps the reactions on a submission message in step with its review state and
tells the submitter, by DM, about anything that did not make the cut.

Reactions on an accepted submission mean:

* ✅ — the bot read this as a suggestion
* 👁️ — an admin still has to review it
* ☑️ — reviewed, and at least one suggestion from it is in the pool
* ❌ — the bot could not read the message, or nothing in it was approved

So a fresh submission shows ✅ 👁️ and settles into ✅ ☑️ or ✅ ❌. Only those four
emoji are managed here, and a human reacting with anything else is left alone.
"""
import logging
from typing import Any, Optional

import interactions

from .manager import BingoManager, MAX_PER_PERSON, REJECT_CATEGORIES

logger = logging.getLogger("BingoNotifier")

# ✅ this is a suggestion; ☑️ it is approved into the pool.
ACCEPTED_EMOJI = "✅"
REVIEW_EMOJI = "👁️"
APPROVED_EMOJI = "☑️"
REJECTED_EMOJI = "❌"

# The bot only ever adds or removes these, never anything a member added.
MANAGED_EMOJI = (ACCEPTED_EMOJI, REVIEW_EMOJI, APPROVED_EMOJI, REJECTED_EMOJI)

# How long the in-channel fallback stays up when a member's DMs are closed.
FALLBACK_REPLY_TTL = 120


def wanted_reactions(state: dict[str, Any]) -> set[str]:
    """Work out which managed reactions a submission should be showing."""
    # Green stays on for the life of the message: it means the bot understood
    # the post, which does not stop being true once an admin has an opinion.
    wanted = {ACCEPTED_EMOJI}
    if state["pending"]:
        wanted.add(REVIEW_EMOJI)
    elif state["approved"]:
        wanted.add(APPROVED_EMOJI)
    else:
        wanted.add(REJECTED_EMOJI)
    return wanted


def _describe(row: dict[str, Any]) -> str:
    """Write one declined suggestion up for the submitter."""
    category = REJECT_CATEGORIES.get(row.get("reject_category") or "", {})
    label = category.get("label", "Not this time")
    explanation = row.get("reject_reason") or category.get("explanation", "")

    lines = [f"**{row['suggestion']}**", f"*{label}*"]
    if explanation:
        lines.append(f"> {explanation}")
    return "\n".join(lines)


def feedback_text(state: dict[str, Any], remaining: int) -> str:
    """Write the message explaining what did not make it, and why.

    Only rejections the submitter has not already been told about are listed, so
    a second review pass adds a follow-up rather than repeating itself.
    """
    rejected = state["unreported"]
    approved = state["approved"]

    if approved:
        opening = (
            f"Thanks for the suggestions! {len(approved)} of them made it into "
            f"the Splatoon Bingo pool. "
            f"{'This one' if len(rejected) == 1 else 'These'} didn't:"
        )
    else:
        opening = (
            "Thanks for submitting to Splatoon Bingo! "
            f"{'This suggestion' if len(rejected) == 1 else 'These suggestions'} "
            "didn't make it into the pool:"
        )

    blocks = [opening, ""]
    for row in rejected:
        blocks.append(_describe(row))
        blocks.append("")

    if remaining > 0:
        blocks.append(
            f"Declined suggestions don't count towards your {MAX_PER_PERSON}, so "
            f"you've got **{remaining}** left if you'd like to send more."
        )
    else:
        blocks.append(
            f"You've still got all {MAX_PER_PERSON} of your suggestions accounted "
            "for. There'll be more Bingo videos, so keep the ideas coming!"
        )
    return "\n".join(blocks)[:1900]


def _bare(emoji: Any) -> str:
    """An emoji without its variation selector, for comparing like with like.

    Discord is inconsistent about whether it stores the U+FE0F on emoji such as
    👁️ and ☑️, so comparing the raw strings finds differences that are not real.
    """
    return str(emoji).replace("\ufe0f", "")


def _bot_reactions(message: interactions.Message) -> Optional[set[str]]:
    """Which managed reactions the bot already has on a message.

    Returns None when the message carries no reaction data to read, in which
    case the caller has to fall back to writing every reaction blind.
    """
    reactions = getattr(message, "reactions", None)
    if reactions is None:
        return None
    return {_bare(r.emoji) for r in reactions if getattr(r, "me", False)}


async def _sync_reactions(message: interactions.Message, wanted: set[str]) -> None:
    """Add the reactions a message should have and drop the ones it shouldn't.

    Only differences are written. Correcting a whole channel's worth of history
    otherwise means three or four pointless API calls per message, which is slow
    enough to hit rate limits on a backlog of any size.
    """
    current = _bot_reactions(message)
    wanted_bare = {_bare(e) for e in wanted}

    for emoji in MANAGED_EMOJI:
        bare = _bare(emoji)
        should_have = bare in wanted_bare
        if current is not None and should_have == (bare in current):
            continue
        try:
            if should_have:
                await message.add_reaction(emoji)
            else:
                await message.remove_reaction(emoji)
        except Exception:
            # A reaction that was never there cannot be removed, and a missing
            # permission should not stop the rest of the sync.
            logger.debug("Reaction %s on %s could not be updated", emoji, message.id)


async def _deliver(bot: interactions.Client, message: interactions.Message,
                   discord_id: int, text: str) -> bool:
    """DM the submitter, falling back to a self-deleting reply in the channel.

    Returns whether the explanation reached them one way or the other.
    """
    try:
        user = await bot.fetch_user(discord_id)
        if user is not None:
            await user.send(text)
            return True
    except Exception:
        logger.debug("Could not DM %s about their bingo suggestions", discord_id)

    # Closed DMs are common, and a decision nobody hears about is no better than
    # no decision, so say it in the channel and tidy up after.
    try:
        await message.reply(
            f"<@{discord_id}> your DMs are closed, so here's your Splatoon Bingo "
            f"feedback. This message disappears in a couple of minutes.\n\n{text}",
            delete_after=FALLBACK_REPLY_TTL,
        )
        return True
    except Exception:
        logger.warning("Could not tell %s about their bingo feedback", discord_id)
        return False


async def sync_message(bot: interactions.Client, message_id: int,
                       channel_id: Optional[int] = None,
                       post_feedback: bool = True) -> bool:
    """Bring one submission message in Discord back in line with its review state.

    Args:
        bot: The Discord client.
        message_id: The submission message to update.
        channel_id: Its channel, looked up from the database when omitted.
        post_feedback: Whether a newly finished review may tell the submitter.
            Turned off during catch-up so a backlog of old decisions does not
            arrive as a pile of DMs.

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

    # Feedback only makes sense once there is nothing left to review, and only
    # for decisions the submitter has not already been told about.
    if post_feedback and not state["pending"] and state["unreported"]:
        try:
            _, remaining = await BingoManager.allowance(state["guild_id"], state["discord_id"])
            sent = await _deliver(bot, message, state["discord_id"],
                                  feedback_text(state, remaining))
            if sent:
                await BingoManager.record_feedback(
                    state["message_id"], [r["id"] for r in state["unreported"]]
                )
        except Exception:
            logger.exception("Could not send bingo feedback for message %s", message_id)

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
