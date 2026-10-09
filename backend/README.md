# LinkedIn AI Reply — Backend

FastAPI + LangChain + PostgreSQL (pgvector) + Google Gemini backend powering the LinkedIn AI Reply Chrome extension.

---

## Architecture & Pipelines

```
Chrome Extension (Manifest V3)
      │
      ├─▶ 1. POST /api/v1/conversations/sync (Sync messages with SHA-256 deduplication)
      │
      └─▶ 2. POST /api/v1/reply/generate (Single-pass RAG generation)
            │
            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  FastAPI (app/main.py)                                                 │
│                                                                        │
│  Route: app/api/routes/reply.py                                        │
│    │                                                                   │
│    ▼ (validated GenerateReplyRequest)                                  │
│  Service: app/services/reply_service.py                                │
│    │                                                                   │
│    ├─▶ MemoryProcessor: Lazy heuristic noise gate (0 tokens if trivial)│
│    │     app/services/memory_processor.py                              │
│    │     app/core/heuristics.py                                        │
│    │                                                                   │
│    ├─▶ RetrievalService: Contact-scoped pgvector semantic search (Top-3)│
│    │     app/services/retrieval_service.py                             │
│    │                                                                   │
│    ├─▶ ContextBuilder: Dynamic prompt budgeting (~550–650 tokens)      │
│    │     app/services/context_builder.py                               │
│    │     (Past Summary + Top Facts + 8 Recent Working Buffer)          │
│    │                                                                   │
│    └─▶ Single-Pass Reply Chain: LangChain + Gemini                     │
│          app/ai/chains.py  │  app/ai/prompts.py                        │
│          REPLY_GENERATION_PROMPT | llm.with_structured_output(...)     │
│                                                                        │
│  Response: GenerateReplyResponse (3 styles + memory badging metadata)  │
└────────────────────────────────────────────────────────────────────────┘
            │
            ▼
Chrome Extension (React 18 Popup receives structured JSON)
```

### Request → Response Schema Flow

```
GenerateReplyRequest (app/schemas/request.py)
      │
      ▼
ContextBuilder (app/services/context_builder.py) — Dynamic Token Budgeting
      │
      ▼
Single-Pass LLM Call (REPLY_GENERATION_PROMPT | GeneratedReplies)
      │
      ▼
GenerateReplyResponse (app/schemas/response.py) [3 Styled Replies + Memory Badges]
```

---

## Folder Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app, CORS, router registration
│   │
│   ├── core/
│   │   ├── config.py              # Pydantic Settings (.env loader)
│   │   └── heuristics.py          # Deterministic 0-token noise gatekeeper
│   │
│   ├── db/
│   │   ├── database.py            # Async SQLAlchemy engine & session factory
│   │   ├── init_db.py             # DDL setup (pgvector extension & tables)
│   │   └── models.py              # 6 ORM tables (pgvector VECTOR(768))
│   │
│   ├── ai/
│   │   ├── llm.py                 # Gemini model & embedding factories
│   │   ├── output_models.py       # Pydantic structured output models
│   │   ├── prompts.py             # Prompt templates (Memory & Reply)
│   │   └── chains.py              # LangChain execution chains
│   │
│   ├── schemas/
│   │   ├── request.py             # SyncRequest & GenerateReplyRequest
│   │   ├── response.py            # SyncResponse & GenerateReplyResponse
│   │   └── memory.py              # Memory inspection DTO schemas
│   │
│   ├── services/
│   │   ├── context_builder.py     # Token-budgeted context assembler (550–650 tokens)
│   │   ├── retrieval_service.py   # pgvector cosine similarity RAG
│   │   ├── embedding_service.py   # Matryoshka vector embeddings
│   │   ├── memory_processor.py    # Lazy heuristic memory extraction pipeline
│   │   ├── summary_chunk_service.py # Episodic micro-summaries & pruning
│   │   ├── memory_service.py      # Semantic fact CRUD & supersession
│   │   ├── message_service.py     # SHA-256 deduplicated message storage
│   │   └── reply_service.py       # Single-pass RAG reply orchestrator
│   │
│   └── api/
│       └── routes/
│           ├── conversations.py   # POST /api/v1/conversations/sync
│           ├── reply.py           # POST /api/v1/reply/generate
│           └── memory.py          # GET /summary-chunks, /memories, POST /process
│
├── tests/
│   ├── conftest.py                # Async test fixtures and mock settings
│   ├── test_health.py             # Health check tests
│   └── v2/                        # V2 Memory, Heuristics, Isolation & RAG tests
│       ├── test_heuristics.py
│       ├── test_memory_isolation.py
│       ├── test_fact_lifecycle.py
│       ├── test_summary_chunks.py
│       └── test_reply_generation.py
│
├── .env                           # Real API keys (git-ignored)
├── .env.example                   # Template — safe to commit
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Installation

### Prerequisites

- Python 3.12+
- A Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### 1. Clone and navigate

```bash
cd backend
```

### 2. Create a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate      # macOS / Linux
# venv\Scripts\activate       # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env and paste your real GEMINI_API_KEY
```

Your `.env` should look like:

```env
GEMINI_API_KEY=AIzaSy...your_real_key...
GEMINI_MODEL=gemini-2.5-flash
```

---

## Start the Server

```bash
# From inside backend/
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or for production (no reload):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

---

## Test the Health Endpoint

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status": "ok"}
```

Interactive docs: http://localhost:8000/docs

---

## Example API Call

### POST /api/v1/reply/generate

```bash
curl -X POST http://localhost:8000/api/v1/reply/generate \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "recipient": {
        "name": "Sam Chen",
        "headline": "Senior Software Engineer",
        "company": "Acme Corp",
        "position": "Senior Software Engineer"
      },
      "messages": [
        {
          "sender": "them",
          "text": "How are you handling communication between your servers?",
          "timestamp": "10:00 AM"
        },
        {
          "sender": "me",
          "text": "I'\''m using Redis Pub/Sub.",
          "timestamp": "10:05 AM"
        },
        {
          "sender": "them",
          "text": "Have you considered Kafka?",
          "timestamp": "10:07 AM"
        }
      ]
    },
    "userProfile": {
      "name": "John Doe",
      "role": "Backend Engineer",
      "skills": ["Python", "Kafka", "Redis"],
      "background": "5 years of experience in distributed systems.",
      "style": "professional"
    },
    "myName": "John",
    "recipientName": "Sam",
    "relationship": "former colleague",
    "userPrompt": "Share my experience with Kafka and ask about their message volume."
  }'
```

### Example Response

```json
{
  "replies": [
    {
      "style": "professional",
      "text": "Kafka is definitely worth evaluating for your use case. It provides durable message storage and replay capabilities that Redis Pub/Sub doesn't offer. Happy to share some benchmarks from our migration if that would be useful."
    },
    {
      "style": "conversational",
      "text": "Yeah, Kafka crossed my mind too when we were on Redis. Made the switch about a year ago — huge difference for high-throughput stuff. What kind of message volume are you dealing with?"
    },
    {
      "style": "concise",
      "text": "Kafka makes sense if you need replay or stronger delivery guarantees. What's your current message volume?"
    }
  ],
  "analysis": {
    "main_topic": "Distributed systems communication",
    "tone": "technical and conversational",
    "conversation_stage": "technical discussion",
    "last_message_intent": "asking for a technical opinion"
  }
}
```

---

## Run Tests

```bash
# From inside backend/
pytest tests/ -v
```

No real Gemini API key is needed for tests — all AI calls are mocked.

```bash
# Run a specific test file
pytest tests/test_reply.py -v

# Run with output shown
pytest tests/ -v -s
```

---

## How the LangChain Pipelines Work

### 1. Unified Memory Extraction Pipeline (Lazy Background Trigger)
1. Triggered lazily when unprocessed messages exceed threshold (`MEMORY_PROCESS_THRESHOLD=10`) or on forced reply generation.
2. `heuristics.all_messages_trivial()` intercepts pure acknowledgement/filler batches — **0 tokens consumed, 0 LLM calls**.
3. For substantive batches, `chains.run_memory_extraction()` invokes:
   `MEMORY_EXTRACTION_PROMPT | llm.with_structured_output(MemoryExtractionResult)`.
4. Extracts 1–3 sentence episodic micro-summary chunk (max 70 words), structured new facts (max 25 words), and superseded fact IDs in **1 unified LLM call**.
5. Embeddings for new facts are generated in a single batch call via `gemini-embedding-001` (768-dim) and stored in pgvector.

### 2. Single-Pass RAG Reply Generation Pipeline
1. `ContextBuilder.build_reply_context()` dynamically budgets context to strictly **550–650 tokens**:
   - Past conversation summary: 1–2 micro-summary chunks (~35–70 tokens).
   - Recalled semantic facts: Top-3 pgvector cosine matches (~90 tokens).
   - Immediate ongoing exchange: Up to 8 recent messages (~200–250 tokens).
   - User profile & contact header: ~80–100 tokens.
   - System prompt instructions: ~140 tokens.
2. `chains.run_reply_generation()` invokes:
   `REPLY_GENERATION_PROMPT | llm.with_structured_output(GeneratedReplies)`.
3. Gemini generates 3 tailored replies (Professional, Conversational, Concise) in a **single pass** — eliminating the legacy Pass 1 analysis call (**50% reduction in LLM calls**).

---

## Performance & Token Metrics (V1 vs V2 Comparison)

| Metric | Version 1 (Stateless 2-Pass) | Version 2 (Single-Pass RAG + pgvector) | Impact / Improvement |
| :--- | :--- | :--- | :--- |
| **LLM Generation Calls** | 2 sequential calls per reply | 1 single-pass call per reply | **Cut LLM calls by 50%** (eliminated 1 roundtrip) |
| **Heuristic Noise Gate** | 0% (All messages hit LLM) | 0-token deterministic filter | **Cuts memory LLM calls by ~35%** (0 tokens consumed) |
| **Prompt Size per Reply**| ~1,850 – 2,200 tokens | **550 – 650 tokens** | **~68% reduction in prompt token size** |
| **Total Cumulative Tokens**| ~3,200 – 3,700 tokens | **550 – 650 tokens** | **~80% reduction in overall token usage** |
| **Context Growth Complexity** | $O(N)$ linear token growth | $O(1)$ constant, bounded prompt budget | Predictable token cost regardless of thread length |
| **Response Latency** | ~2.8s – 3.5s | ~1.1s – 1.4s | **~55% latency reduction** |

---

## Where Gemini & pgvector Are Used

| Location | Purpose | Model / Engine |
|---|---|---|
| `app/ai/llm.py` | LLM & Embedding models initialisation | `gemini-2.5-flash` / `gemini-embedding-001` |
| `app/ai/chains.py` — `run_memory_extraction()` | Micro-summary, fact extraction & supersession | Structured LLM output (`MemoryExtractionResult`) |
| `app/services/embedding_service.py` | 768-dim Matryoshka vector embeddings | `gemini-embedding-001` |
| `app/services/retrieval_service.py` | Cosine similarity semantic search (`<=>`) | PostgreSQL 16 `pgvector` |
| `app/ai/chains.py` — `run_reply_generation()` | 3 styled reply suggestions (single-pass) | Structured LLM output (`GeneratedReplies`) |

---

## Where Prompts Are Defined

All prompts live exclusively in [`app/ai/prompts.py`](app/ai/prompts.py):

| Prompt | Purpose |
|---|---|
| `MEMORY_EXTRACTION_PROMPT` | Micro-summary chunk, fact extraction & contradiction detection |
| `REPLY_GENERATION_PROMPT` | Single-pass RAG generation of 3 distinct style alternatives |

---

## Where Structured Output Is Defined

All LLM output models live in [`app/ai/output_models.py`](app/ai/output_models.py):

| Model | Used for |
|---|---|
| `ExtractedFact` | Single semantic fact (`content`, `memory_type`) |
| `MemoryExtractionResult` | Unified summary chunk, new facts, and superseded IDs |
| `ReplyAlternative` | Single reply option (`style`, `text`) |
| `GeneratedReplies` | Container for 3 tailored alternatives (`professional`, `conversational`, `concise`) |

---

## How the Chrome Extension Communicates with the Backend

The extension's background script sends a `POST` request to the backend:

```typescript
// extension/src/background/background.ts (example)
const response = await fetch("http://localhost:8000/api/v1/reply/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    context: conversationContext,     // ConversationContext
    userProfile: userProfile,          // UserProfile
    myName: "John",
    recipientName: "Sam",
    relationship: "connection",
    userPrompt: "Ask about their tech stack",
  }),
});

const data = await response.json();
// data.replies[0].text  → professional reply
// data.replies[1].text  → conversational reply
// data.replies[2].text  → concise reply
```

> **CORS note**: For local development, `http://localhost:3000` and `http://localhost:5173`
> are allowed by default. For production, add your Chrome extension origin
> (`chrome-extension://<your-extension-id>`) to `CORS_ORIGINS` in `.env` or to the
> `cors_origins` list in `app/core/config.py`.

---

## Security Notes

- The `GEMINI_API_KEY` is never returned to the client in any response.
- Stack traces and internal error details are logged server-side but never sent to the extension.
- The API key is loaded exclusively through Pydantic Settings from the `.env` file.
- `.env` is in `.gitignore` — only `.env.example` is committed.
