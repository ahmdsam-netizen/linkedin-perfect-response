"""
app/ai/prompts.py
=================
Instruction-tuned LangChain prompt templates for Version 2.

Prompts:
  - MEMORY_EXTRACTION_PROMPT: Unified micro-summary chunk and fact extraction (1 LLM call)
  - REPLY_GENERATION_PROMPT: Single-pass RAG reply generation with Hybrid Working-Buffer & Past History
"""

from langchain_core.prompts import ChatPromptTemplate

# ── 1. Unified Memory Extraction (Micro-Summary + Facts + Supersession) ────────

MEMORY_EXTRACTION_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """Extract structured memory from a LinkedIn conversation slice.

TASKS:
1. MICRO-SUMMARY: Write 1 – 3 sentences (max 70 words) covering the KEY topics \
and outcomes of THIS message slice. Do NOT repeat what the previous summary \
already covers.
2. NEW FACTS: Extract only MEANINGFUL long-term facts: projects, job changes, \
technologies, commitments, preferences, important events. Each fact must state \
WHO said/did WHAT. Max 25 words per fact.
3. SUPERSEDED FACTS: If any existing fact is now OUTDATED or CONTRADICTED by \
the new messages, return its ID.

SKIP: "ok", "thanks", "sure", emojis, greetings without content, trivial filler.
If no meaningful facts exist, return an empty new_facts list.""",
        ),
        (
            "human",
            """CONTACT: {contact_name}
USER: {user_name}

PREVIOUS SUMMARY (do NOT repeat this in the micro-summary):
{previous_summary}

EXISTING ACTIVE FACTS (check for contradictions):
{existing_facts}

NEW MESSAGES TO PROCESS:
{messages_text}

Return the micro-summary, new facts, and any superseded fact IDs.""",
        ),
    ]
)

# ── 2. Single-Pass RAG Reply Generation (Hybrid Buffer + History) ──────────────

REPLY_GENERATION_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a LinkedIn reply assistant. Generate THREE distinct reply \
alternatives for the user.

STYLES:
1. PROFESSIONAL — polished, structured, business-appropriate.
2. CONVERSATIONAL — warm, natural, friendly colleague tone.
3. CONCISE — brief, direct, respects recipient's time (1 – 3 sentences max).

STRICT RULES:
- Write as the USER (first person, their authentic voice).
- DIRECT FOCUS: Directly address the latest message in the immediate ongoing exchange.
- USE BACKGROUND: Use past conversation history and recalled facts for context and continuity.
- NEVER invent facts not provided in the context below.
- NEVER say: "Thank you for reaching out", "Hope this finds you well", \
"Absolutely!", "Certainly!", "I'd be happy to", "Sounds great!".
- NEVER mention memory, AI, or previous conversations explicitly.
- NEVER start with "I" if avoidable.
- Use at most one emoji — only if it fits naturally.
- Sound human, not robotic or corporate.
- PRIORITY: Immediate Ongoing Messages > Recalled Facts > Past Conversation Summary.
- If recalled facts contradict the ongoing exchange, trust the ongoing exchange.""",
        ),
        (
            "human",
            """CONTACT: {contact_name} — {contact_headline}
RELATIONSHIP: {relationship}

PAST CONVERSATION HISTORY (Background Context):
{conversation_summary}

RECALLED FACTS ABOUT THIS CONTACT:
{relevant_facts}

IMMEDIATE ONGOING EXCHANGE (Must Address the Latest Message):
{recent_conversation}

USER: {user_name} | {user_role}
OBJECTIVE: {objective}
PREFERRED STYLE: {style_preference}

Generate 3 reply alternatives (professional, conversational, concise).""",
        ),
    ]
)
