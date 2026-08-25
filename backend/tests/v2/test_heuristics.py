"""
tests/v2/test_heuristics.py
===========================
Unit tests for the deterministic noise filter.
Verifies that trivial messages are identified without any LLM calls.
"""

from app.core.heuristics import (
    all_messages_trivial,
    filter_substantive,
    is_trivial_message,
)


def test_is_trivial_acknowledgements():
    trivial_samples = [
        "ok",
        "OK",
        "okay",
        "sure",
        "thanks",
        "Thank you so much!",
        "sounds good",
        "sounds great!",
        "noted.",
        "got it",
        "cool",
        "perfect!",
        "yes",
        "yeah",
        "haha",
        "lol",
        "👍",
        "👏",
        "😊",
        "👍 👏",
    ]
    for sample in trivial_samples:
        assert is_trivial_message(sample) is True, f"Expected '{sample}' to be trivial"


def test_is_substantive_messages():
    substantive_samples = [
        "We are launching Project Nebula next Monday with our React frontend.",
        "I recently joined Microsoft as a Senior Staff Engineer.",
        "Can we schedule a call for Tuesday at 3pm to review the API specs?",
        "Our team prefers using FastAPI over Flask for async workloads.",
        "Let me introduce you to Alex from the design team.",
    ]
    for sample in substantive_samples:
        assert is_trivial_message(sample) is False, f"Expected '{sample}' to be substantive"


def test_all_messages_trivial_detection():
    trivial_batch = ["ok", "thanks!", "sounds good", "👍"]
    assert all_messages_trivial(trivial_batch) is True

    mixed_batch = ["ok", "I switched to Microsoft last week", "sounds good"]
    assert all_messages_trivial(mixed_batch) is False


def test_filter_substantive():
    mixed = ["ok", "Working on Project Nebula with FastAPI", "thanks", "👍"]
    substantive = filter_substantive(mixed)
    assert len(substantive) == 1
    assert substantive[0] == "Working on Project Nebula with FastAPI"
