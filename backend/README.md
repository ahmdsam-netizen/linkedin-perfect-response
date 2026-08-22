# LinkedIn AI Reply — Backend

FastAPI + LangChain + Gemini backend that powers the LinkedIn AI Reply Chrome extension.

---

## Architecture

```
Chrome Extension
      │
      │  POST /api/v1/reply/generate
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI  (app/main.py)                                         │
│                                                                 │
│  Route: app/api/routes/reply.py                                 │
│    │                                                            │
│    ▼ (validated GenerateReplyRequest)                           │
│  Service: app/services/reply_service.py   ← orchestration       │
│    │                                                            │
│    ├─▶ ConversationService  ─▶  LangChain Analysis Chain        │
│    │       app/services/conversation_service.py                 │
│    │       app/ai/chains.py  │  app/ai/prompts.py               │
│    │                         ▼                                  │
│    │                      Gemini API  (Call #1)                 │
│    │                         │                                  │
│    │                         ▼  ConversationAnalysis            │
│    │                                                            │
│    ├─▶ ContextService  ─▶  Build generation context dict        │
│    │       app/services/context_service.py                      │
│    │                                                            │
│    └─▶ LangChain Reply Chain                                    │
│            app/ai/chains.py  │  app/ai/prompts.py               │
│                              ▼                                  │
│                           Gemini API  (Call #2)                 │
│                              │                                  │
│                              ▼  GeneratedReplies                │
│                                                                 │
│  Response: GenerateReplyResponse  (app/schemas/response.py)     │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
Chrome Extension  ← receives structured JSON
```

### Request → Response Schema Flow

```
GenerateReplyRequest  (app/schemas/request.py)
      │
      ▼
ConversationAnalysis  (app/ai/output_models.py)  — LLM structured output
      │
      ▼
Context dict          (app/services/context_service.py)
      │
      ▼
GeneratedReplies      (app/ai/output_models.py)  — LLM structured output
      │
      ▼
GenerateReplyResponse (app/schemas/response.py)
```

---

## Folder Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app, CORS, router registration
│   │
│   ├── core/
│   │   └── config.py              # Pydantic Settings (env vars)
│   │
│   ├── ai/
│   │   ├── llm.py                 # Gemini LLM initialisation (single place)
│   │   ├── output_models.py       # Pydantic models for LLM structured output
│   │   ├── prompts.py             # All LangChain prompt templates
│   │   └── chains.py              # LangChain chain definitions
│   │
│   ├── schemas/
│   │   ├── request.py             # HTTP request models (mirrors extension types)
│   │   ├── conversation.py        # Domain conversation models
│   │   └── response.py            # HTTP response models
│   │
│   ├── services/
│   │   ├── conversation_service.py # Conversation analysis logic
│   │   ├── context_service.py      # Context engineering for prompt
│   │   └── reply_service.py        # Main orchestration service
│   │
│   └── api/
│       └── routes/
│           └── reply.py            # POST /api/v1/reply/generate
│
├── tests/
│   ├── conftest.py               # Shared fixtures (mock settings, mock LLM)
│   ├── test_health.py            # Health endpoint tests
│   ├── test_schemas.py           # Request validation tests
│   └── test_reply.py             # Reply generation end-to-end & unit tests
│
├── .env                          # Real API keys (git-ignored)
├── .env.example                  # Template — safe to commit
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

## How the LangChain Pipeline Works

### Pass 1 — Conversation Analysis

1. `ConversationService.analyze_conversation()` formats the message list into a readable transcript.
2. It calls `chains.run_conversation_analysis()` with prompt variables.
3. `chains.py` builds: `CONVERSATION_ANALYSIS_PROMPT | llm.with_structured_output(ConversationAnalysis)`.
4. Gemini receives the prompt and returns JSON matching the `ConversationAnalysis` Pydantic model.
5. LangChain validates and parses the JSON automatically.

### Pass 2 — Reply Generation

1. `ContextService.build_reply_generation_context()` combines the request + analysis into a flat dict.
2. `chains.run_reply_generation()` invokes `REPLY_GENERATION_PROMPT | llm.with_structured_output(GeneratedReplies)`.
3. Gemini generates exactly 3 replies (professional, conversational, concise).
4. LangChain validates the output matches `GeneratedReplies`.
5. `ReplyService` assembles the final HTTP response.

---

## Where Gemini Is Used

| Location | Purpose |
|---|---|
| `app/ai/llm.py` | Gemini LLM is initialised **once** here |
| `app/ai/chains.py` — `run_conversation_analysis()` | Gemini call #1: analyse the conversation |
| `app/ai/chains.py` — `run_reply_generation()` | Gemini call #2: generate 3 reply suggestions |

---

## Where Prompts Are Defined

All prompts live exclusively in [`app/ai/prompts.py`](app/ai/prompts.py):

| Prompt | Purpose |
|---|---|
| `CONVERSATION_ANALYSIS_PROMPT` | Analysis only — no reply generation |
| `REPLY_GENERATION_PROMPT` | Generate 3 reply alternatives |

---

## Where Structured Output Is Defined

All LLM output models live in [`app/ai/output_models.py`](app/ai/output_models.py):

| Model | Used for |
|---|---|
| `ConversationAnalysis` | Structured output from analysis chain |
| `ReplySuggestion` | A single reply (style + text) |
| `GeneratedReplies` | Container for exactly 3 `ReplySuggestion` objects |

LangChain's `llm.with_structured_output(Model)` instructs Gemini to return JSON
that matches the schema and validates it automatically via Pydantic.

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
