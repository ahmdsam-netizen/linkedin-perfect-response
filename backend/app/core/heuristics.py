"""
app/core/heuristics.py
======================
Deterministic noise filter for LinkedIn messages.

Identifies trivial messages (acknowledgements, emojis, filler words) without
any LLM call. If ALL unprocessed messages are trivial, the memory processor
skips LLM invocation entirely — 0 tokens consumed.

This is the first and cheapest gate in the memory processing pipeline.
"""

import re

# ── Trivial phrase set ────────────────────────────────────────────────────────
# All lowercase. Checked after stripping punctuation and whitespace.

_TRIVIAL_PHRASES: frozenset[str] = frozenset({
    # Acknowledgements
    "ok", "okay", "k", "kk", "okk",
    "yes", "yep", "yup", "yeah", "ya", "yea",
    "no", "nope", "nah",
    "sure", "sure thing", "of course",
    "noted", "got it", "got that", "understood",
    "will do", "on it", "on my way",
    "sounds good", "sounds great", "looks good", "looks great",
    # Gratitude
    "thanks", "thank you", "thx", "ty", "thank u",
    "thanks a lot", "thanks so much", "many thanks",
    "thank you so much", "thank you very much",
    "appreciate it", "appreciated",
    # Filler positives
    "great", "nice", "cool", "awesome", "perfect", "excellent",
    "wonderful", "fantastic", "amazing", "brilliant", "superb",
    "alright", "all right", "fair enough",
    # Laughter
    "haha", "hehe", "lol", "lmao", "lol!", "haha!",
    # Greetings (without context)
    "hi", "hey", "hello", "sup", "yo",
    # Simple confirmations with punctuation stripped
    "ok!", "okay!", "great!", "perfect!", "sure!", "noted!",
    "yes!", "no!", "cool!", "awesome!",
    # Short responses
    "hmm", "hm", "ah", "oh", "ah ok", "oh ok", "i see",
})

# ── Emoji-only pattern ────────────────────────────────────────────────────────
_EMOJI_PATTERN: re.Pattern = re.compile(
    r"^[\s"
    r"\U0001F300-\U0001F9FF"   # Misc symbols & pictographs, emoticons, transport
    r"\U00002600-\U000027BF"   # Misc symbols, dingbats
    r"\U0001FA00-\U0001FA6F"   # Chess symbols, etc.
    r"\U0001FA70-\U0001FAFF"   # Symbols and pictographs extended-A
    r"\u2600-\u26FF"           # Misc symbols (BMP)
    r"\u2700-\u27BF"           # Dingbats (BMP)
    r"\uFE00-\uFE0F"           # Variation selectors
    r"\u200d"                  # Zero-width joiner
    r"]+$",
    re.UNICODE,
)

# ── Strip punctuation for comparison ─────────────────────────────────────────
_PUNCTUATION_STRIP: re.Pattern = re.compile(r"[!?.,'\"]+$")


def is_trivial_message(content: str) -> bool:
    """Return True if a message contains no substantive information.

    A message is trivial if it:
    - Is empty or ≤ 3 non-whitespace characters
    - Consists entirely of emojis/whitespace
    - Matches a known trivial phrase (after stripping trailing punctuation)
    """
    stripped = content.strip()

    # Empty or very short
    if len(stripped) <= 3:
        return True

    # Emoji-only
    if _EMOJI_PATTERN.match(stripped):
        return True

    # Normalize: lowercase, strip trailing punctuation
    normalized = _PUNCTUATION_STRIP.sub("", stripped.lower()).strip()

    return normalized in _TRIVIAL_PHRASES


def all_messages_trivial(contents: list[str]) -> bool:
    """Return True if every message in the list is trivial.

    Used by the memory processor to skip LLM calls entirely when no
    substantive content is present in the unprocessed message batch.
    """
    if not contents:
        return True
    return all(is_trivial_message(c) for c in contents)


def filter_substantive(contents: list[str]) -> list[str]:
    """Return only the non-trivial messages from a list.

    Used to trim the batch before sending to the LLM, reducing token usage
    even when at least one substantive message is present.
    """
    return [c for c in contents if not is_trivial_message(c)]
