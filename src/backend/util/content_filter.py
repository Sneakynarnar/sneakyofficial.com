"""
Team-name content filter.
Normalises common leet-speak substitutions, then checks against a blocked-word
list.  Also enforces basic length / character rules.
"""

import re
import unicodedata

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MIN_LEN = 2
MAX_LEN = 32

# Leet-speak normalisation map (applied before word matching)
_LEET: dict[str, str] = {
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
    "6": "g", "7": "t", "8": "b", "@": "a", "$": "s",
    "!": "i", "|": "i", "+": "t",
}

# Blocked words / substrings (lowercase, plain ASCII after normalisation).
# Add entries here — partial matches are caught, so keep roots rather than
# every variant.
_BLOCKED: frozenset[str] = frozenset({
    # General profanity
    "fuck", "fuk", "fck", "fucc",
    "shit", "sht", "shyt",
    "bitch", "btch",
    "cunt", "cnt",
    "ass", "arse",
    "cock", "dic", "dick", "dik",
    "pussy", "puss",
    "bastard",
    "whore", "slut",
    "piss", "pee",
    "cum", "jizz",
    "nigger", "nigga",
    "faggot", "fag",
    "retard", "retrd",
    "kike", "spic", "chink", "gook", "wetback", "cracker",
    "tranny",
    # Hate / extremism
    "nazi", "hitler", "heil",
    "kkk",
    "isis", "jihad",
    # Misc offensive
    "rape", "rapist",
    "pedo", "pedophile", "paedo",
    "nonce",
})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_team_name(name: str) -> tuple[bool, str | None]:
    """
    Validate a team name.

    Returns (True, None) when the name is acceptable.
    Returns (False, reason) when it should be rejected.
    """
    stripped = name.strip()

    if len(stripped) < MIN_LEN:
        return False, f"Team name must be at least {MIN_LEN} characters."

    if len(stripped) > MAX_LEN:
        return False, f"Team name must be {MAX_LEN} characters or fewer."

    # Reject purely-whitespace or invisible names
    if not stripped:
        return False, "Team name cannot be blank."

    normalised = _normalise(stripped)

    for word in _BLOCKED:
        if word in normalised:
            return False, "That name contains content that isn't allowed."

    return True, None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lower-case, strip accents, apply leet substitutions, keep only a-z0-9."""
    # Unicode normalise → strip combining characters (accents)
    nfkd = unicodedata.normalize("NFKD", text.lower())
    ascii_only = nfkd.encode("ascii", "ignore").decode()

    # Apply leet substitutions
    result = []
    for ch in ascii_only:
        result.append(_LEET.get(ch, ch))

    # Keep only alphanumeric so punctuation gaps can't hide words
    return re.sub(r"[^a-z]", "", "".join(result))


# Slurs that should be caught even when buried inside a longer word, since
# there is no innocent word that contains them.
_HARD_BLOCKED: frozenset[str] = frozenset({
    "nigger", "nigga", "faggot", "kike", "chink", "wetback", "tranny",
    "rapist", "pedophile", "paedophile",
})


def check_free_text(text: str, min_len: int = 5, max_len: int = 200,
                    label: str = "Suggestion") -> tuple[bool, str | None]:
    """Validate a free-form sentence such as a bingo challenge.

    Unlike :func:`check_team_name` this matches whole words rather than
    substrings. A sentence gets normalised word by word, so ordinary English
    ("classic", "pass the zone", "bass") no longer trips the short entries in
    the blocked list. Only the unambiguous slurs in ``_HARD_BLOCKED`` are still
    matched anywhere inside a word.

    Returns (True, None) when the text is acceptable, (False, reason) otherwise.
    """
    stripped = " ".join(text.split())

    if len(stripped) < min_len:
        return False, f"{label} must be at least {min_len} characters."

    if len(stripped) > max_len:
        return False, f"{label} must be {max_len} characters or fewer."

    if not _normalise(stripped):
        return False, f"{label} needs to contain actual words."

    squashed = _normalise(stripped)
    for word in _HARD_BLOCKED:
        if word in squashed:
            return False, f"{label} contains content that isn't allowed."

    for raw_word in re.split(r"[^\w']+", stripped):
        normalised = _normalise(raw_word)
        if normalised and normalised in _BLOCKED:
            return False, f"{label} contains content that isn't allowed."

    return True, None
