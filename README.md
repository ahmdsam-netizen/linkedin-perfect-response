# LinkedIn AI Reply

A production-grade, persistent memory AI assistant for LinkedIn messaging. The system consists of a **Manifest V3 Chrome Extension** (Vite + React + TypeScript) that automatically scrapes active LinkedIn conversation context and a **FastAPI + LangChain + PostgreSQL (pgvector) + Google Gemini Backend** that maintains contact-scoped long-term memory, episodic micro-summary chunks, semantic fact retrieval (RAG), and generates three tailored reply alternatives (Professional, Conversational, and Concise).

## Version - 1

1. **Stateless Two-Pass AI Pipeline**: Relied on a sequential 2-step LLM pipeline per request — Pass 1 analyzed conversation intent, stage, and tone, while Pass 2 generated reply variations.
2. **DOM-Only Context Extraction**: Scraped active chat messages, recipient name, and headline directly from the LinkedIn DOM on-the-fly with no database or persistence layer.
3. **Multi-Style Reply Alternatives**: Produced 3 tailored reply options (Professional, Conversational, and Concise) selectable via tabbed preview in the extension popup.
4. **Synthetic DOM Composer Insertion**: Automatically injected chosen replies into LinkedIn's contenteditable rich-text editor and fired synthetic input events to enable the native "Send" button.
5. **FastAPI & LangChain Backend**: Powered by FastAPI, Pydantic validation, and LangChain structured output chains communicating with Google Gemini.

---

## Version - 2

- **Persistent Contact Memory & pgvector RAG**: Uses PostgreSQL with `pgvector` (768-dim embeddings via `gemini-embedding-001` with Matryoshka truncation) for semantic recall of past facts, preferences, and commitments.
- **Deterministic Heuristic Noise Filter**: Zero-token gatekeeper that filters out trivial acknowledgments, emojis, and filler phrases without invoking the LLM.
- **Episodic Micro-Summary Chunks**: Bounded 1–3 sentence chronological summaries (max 70 words) instead of costly full-conversation re-summarization.
- **Automated Fact Lifecycle & Supersession**: Detects and marks outdated or contradicted facts (`ACTIVE` -> `SUPERSEDED`) automatically during memory extraction.
- **Hybrid Working-Buffer & Dynamic Prompt Budgeting**: Partitions context into past summaries, recalled facts, and the immediate ongoing message buffer, keeping total LLM context strictly within ~550–650 tokens.
- **Single-Pass RAG Reply Generation**: Streamlined from a 2-pass pipeline to a fast, single-pass generation yielding 3 distinct communication styles.
- **Real-Time Memory Context Badging**: Chrome extension popup displays live indicators of memories retrieved, summaries used, and buffer sizes.

---

## Architecture & Data Flow

```mermaid
flowchart TD
    %% ─── 1. EXTENSION LAYER ───
    subgraph EXT["Chrome Extension (Manifest V3)"]
        direction TB
        DOM["LinkedIn Web App<br/>(DOM Messages & Composer)"]
        CS["Content Script<br/>(Scraper & Composer Injector)"]
        POPUP["Popup UI (React 18)<br/>(Style Tabs, Prompts & Badges)"]
        BG["Background Service Worker<br/>(API & State Gateway)"]

        DOM <-->|Scrape Context / Insert Reply| CS
        CS <-->|Chrome Messaging| BG
        POPUP <-->|Trigger Actions & Display Results| BG
    end

    %% ─── 2. FASTAPI BACKEND ───
    subgraph BACKEND["FastAPI Backend (Python 3.12)"]
        direction TB
        
        subgraph SYNC_FLOW["1. Conversation Sync Pipeline"]
            SYNC_API["POST /api/v1/conversations/sync"]
            INGEST["Sync & Message Service<br/>(SHA-256 Hash Deduplication)"]
            SYNC_API --> INGEST
        end

        subgraph RAG_FLOW["2. RAG Reply Generation Pipeline"]
            REPLY_API["POST /api/v1/reply/generate"]
            ORCHESTRATOR["Reply Service Orchestrator"]
            
            subgraph MEM_PIPELINE["Memory Processing (Lazy Trigger)"]
                FILTER["Deterministic Heuristics Filter<br/>(0 Tokens for Noise/Emojis)"]
                MEM_EXTRACT["Memory & Fact Extraction<br/>(Micro-Summary + Fact Supersession)"]
                FILTER -->|Substantive Messages| MEM_EXTRACT
            end

            subgraph CTX_PIPELINE["Context Engineering & RAG"]
                RETRIEVAL["pgvector Semantic Search<br/>(Top-K Contact Facts)"]
                CHUNKS["Summary Chunk Service<br/>(Episodic Micro-Summaries)"]
                CTX["Dynamic Context Builder<br/>(Bounded ~550–650 Tokens)"]
                RETRIEVAL --> CTX
                CHUNKS --> CTX
            end

            GEN_CHAIN["Single-Pass Reply Generation<br/>(3 Styles: Professional, Casual, Concise)"]

            REPLY_API --> ORCHESTRATOR
            ORCHESTRATOR --> MEM_PIPELINE
            ORCHESTRATOR --> CTX_PIPELINE
            CTX --> GEN_CHAIN
        end
    end

    %% ─── 3. DATABASE & AI ───
    subgraph DB["PostgreSQL 16 + pgvector"]
        PG_DATA[("Relational Data<br/>• users<br/>• contacts<br/>• conversations<br/>• messages")]
        PG_VECTOR[("Memory & Vector Data<br/>• summary_chunks<br/>• memories (VECTOR 768)")]
    end

    subgraph AI["Google Gemini AI"]
        GEMINI_LLM["Gemini 2.5 / 3.6 Flash<br/>(Generation & Extraction)"]
        GEMINI_EMBED["gemini-embedding-001<br/>(768-dim Embeddings)"]
    end

    %% ─── CONNECTIONS BETWEEN MAJOR BLOCKS ───
    BG -->|1. Sync Payload| SYNC_API
    BG -->|2. Generate Request| REPLY_API
    GEN_CHAIN -->|3 Alternatives + Badges| BG

    INGEST -->|Upsert & Store| PG_DATA
    MEM_EXTRACT <-->|Extract Facts & Chunks| GEMINI_LLM
    MEM_EXTRACT <-->|Generate Embeddings| GEMINI_EMBED
    MEM_EXTRACT -->|Store Chunks & Embeddings| PG_VECTOR

    PG_VECTOR -->|Read Chunks & Cosine Search| CTX_PIPELINE
    PG_DATA -->|Read Recent Message Buffer| CTX_PIPELINE
    GEN_CHAIN <-->|Generate 3 Variations| GEMINI_LLM
```

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       CHROME EXTENSION (MANIFEST V3)                            │
│                                                                                 │
│   LinkedIn DOM Chat           Popup UI (React 18)       Background Worker       │
│  ┌──────────────────┐        ┌───────────────────┐     ┌──────────────────┐     │
│  │ Context & Convo  │───────►│Style Tabs, Prompts│────►│ Sync & Generate  │     │
│  │ ID Extractor     │        │ & Memory Badges   │     │ Orchestrator     │     │
│  └──────────────────┘        └───────────────────┘     └─────────┬────────┘     │
└──────────────────────────────────────────────────────────────────┼──────────────┘
                                                                   │
                                                1. POST /api/v1/conversations/sync
                                                2. POST /api/v1/reply/generate
                                                                   │
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            FASTAPI BACKEND (PYTHON 3.12)                        │
│                                                                                 │
│   FastAPI Routes             Services & Heuristics        LangChain Pipelines   │
│  ┌──────────────────┐       ┌──────────────────────┐     ┌───────────────────┐  │
│  │ /conversations   │──────►│ Memory Processor     │────►│ Memory Extraction │  │
│  │ /reply/generate  │       │ Context Builder      │     │ Single-Pass RAG   │  │
│  │ /memory          │       │ Retrieval Service    │     │ Reply Generation  │  │
│  └──────────────────┘       └──────────┬───────────┘     └─────────┬─────────┘  │
└────────────────────────────────────────┼───────────────────────────┼────────────┘
                                         │                           │
                                         ▼                           ▼
                        ┌─────────────────────────────┐   ┌───────────────────────┐
                        │   PostgreSQL 16 + pgvector  │   │   Google Gemini API   │
                        │   - users       - messages  │   │   - gemini-2.5-flash  │
                        │   - contacts    - summaries │   │   - gemini-embedding  │
                        │   - convos      - memories  │   │     (768 dimensions)  │
                        └─────────────────────────────┘   └───────────────────────┘
```

---

## Database Schema (PostgreSQL + pgvector)

Version 2 features 6 relational tables designed for strict contact-scoped memory isolation:

1. **`users`**: Replying user identity (`id`, `linkedin_id`, `name`, `created_at`).
2. **`contacts`**: People the user communicates with (`id`, `user_id`, `linkedin_profile_id`, `name`, `headline`, `created_at`).
3. **`conversations`**: Thread state and processing pointers (`id`, `user_id`, `contact_id`, `linkedin_conversation_id`, `last_processed_message_id`, `timestamps`).
4. **`messages`**: Raw chat transcript with SHA-256 deduplication (`id`, `conversation_id`, `sender_type`, `content`, `content_hash`, `created_at`).
5. **`summary_chunks`**: Bounded 1–3 sentence episodic summaries (`id`, `conversation_id`, `chunk_index`, `summary_chunk`, `created_at`).
6. **`memories`**: Contact-scoped long-term semantic facts (`id`, `user_id`, `contact_id`, `content`, `memory_type`, `status` [ACTIVE/SUPERSEDED], `embedding` [VECTOR(768)], `created_at`).

---

## Tech Stack

### Frontend (Chrome Extension)
- **Framework**: React 18, TypeScript, Vite
- **Manifest Version**: Chrome Extension Manifest V3
- **Styling**: CSS Modules / Dark Modern Extension UI
- **Messaging**: `chrome.runtime` and `chrome.tabs` async messaging pipeline
- **Storage**: `chrome.storage.local` for user profiles and cache

### Backend (Python Service)
- **Language**: Python 3.12+
- **Web Framework**: FastAPI, Uvicorn
- **Database ORM**: SQLAlchemy 2.0 (Async), `asyncpg`, `pgvector-python`
- **AI Framework**: LangChain, `langchain-google-genai`
- **LLM & Embeddings**: Google Gemini (`gemini-2.5-flash` / `gemini-3.6-flash`, `gemini-embedding-001`)
- **Settings & Validation**: Pydantic v2, Pydantic Settings
- **Testing**: Pytest, Pytest-Asyncio, greenlet, HTTPX

### Infrastructure & Vector Storage
- **Database**: PostgreSQL 16 with `pgvector` extension enabled
- **Containerization**: Docker Compose (`pgvector/pgvector:pg16`)

---

## Repository Structure

```
linkedin-reply-extension/
├── README.md                      # Root documentation (this file)
├── docker-compose.yml             # PostgreSQL 16 + pgvector container configuration
│
├── backend/                       # FastAPI AI & Persistent Memory Service
│   ├── app/
│   │   ├── main.py                # FastAPI app initialization, DB lifespan & routers
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── conversations.py # POST /api/v1/conversations/sync
│   │   │       ├── memory.py        # GET /summary-chunks, /memories, POST /memory/process
│   │   │       └── reply.py         # POST /api/v1/reply/generate
│   │   ├── ai/
│   │   │   ├── llm.py             # Gemini model & embedding factories
│   │   │   ├── output_models.py   # Structured output schemas (Pydantic)
│   │   │   ├── prompts.py         # Instruction-tuned LangChain ChatPromptTemplates
│   │   │   └── chains.py          # Memory extraction & reply generation chains
│   │   ├── db/
│   │   │   ├── database.py        # Async SQLAlchemy engine & session factory
│   │   │   ├── init_db.py         # DDL initialization (pgvector extension & tables)
│   │   │   └── models.py          # SQLAlchemy 2.0 async ORM models (6 tables)
│   │   ├── schemas/
│   │   │   ├── request.py         # SyncRequest & GenerateReplyRequest (camelCase aliases)
│   │   │   ├── response.py        # SyncResponse & GenerateReplyResponse
│   │   │   └── memory.py          # Memory inspection DTO schemas
│   │   ├── services/
│   │   │   ├── user_service.py         # User identity upsert logic
│   │   │   ├── contact_service.py      # Contact profile upsert logic
│   │   │   ├── conversation_service.py # Conversation thread upsert logic
│   │   │   ├── message_service.py      # SHA-256 deduplicated message batching
│   │   │   ├── memory_service.py       # Memory fact CRUD & supersession
│   │   │   ├── memory_processor.py     # Lazy background memory processing orchestrator
│   │   │   ├── summary_chunk_service.py# Episodic micro-summary management
│   │   │   ├── embedding_service.py    # 768-dim Gemini Matryoshka embeddings
│   │   │   ├── retrieval_service.py    # Contact-scoped pgvector cosine similarity RAG
│   │   │   ├── context_builder.py      # Token-budgeted partitioned context assembler
│   │   │   └── reply_service.py        # RAG pipeline orchestration
│   │   └── core/
│   │       ├── config.py          # Pydantic BaseSettings (.env loader)
│   │       └── heuristics.py      # 0-token deterministic noise filter
│   ├── tests/
│   │   ├── conftest.py            # Async test fixtures and mock settings
│   │   ├── test_health.py         # Server liveness tests
│   │   └── v2/                    # V2 Memory, Heuristics, Isolation & RAG tests
│   │       ├── test_heuristics.py
│   │       ├── test_memory_isolation.py
│   │       ├── test_fact_lifecycle.py
│   │       ├── test_summary_chunks.py
│   │       └── test_reply_generation.py
│   ├── .env.example               # Environment variables template
│   ├── requirements.txt           # Python dependencies
│   └── README.md                  # Backend-specific documentation
│
└── extension/                     # Manifest V3 Chrome Extension
    ├── src/
    │   ├── background/
    │   │   └── service_worker.ts  # Two-step sync & generate API orchestration
    │   ├── content/
    │   │   ├── content.ts         # Content script orchestrator
    │   │   ├── linkedin/
    │   │   │   ├── conversation.ts     # DOM scraper for active messages & profiles
    │   │   │   ├── conversationId.ts   # 3-level fallback thread ID extractor
    │   │   │   ├── composer.ts         # LinkedIn RichText editor autotyper
    │   │   │   └── selectors.ts        # Resilient LinkedIn DOM selectors
    │   │   └── ui/
    │   │       └── replyButton.ts      # Injected ' Generate Reply' button
    │   ├── popup/
    │   │   ├── App.tsx            # Popup container & navigation
    │   │   └── components/
    │   │       ├── ReplyGenerator.tsx  # Reply UI with style tabs & memory badges
    │   │       └── ProfileSettings.tsx # User persona & style configuration
    │   └── shared/                # Shared TypeScript message contracts & DTOs
    ├── manifest.json              # Chrome Manifest V3 configuration
    ├── vite.config.ts             # Vite build configuration
    └── package.json               # Frontend dependencies
```

---

## Quickstart Guide

### 1. Prerequisites
- **Python**: `3.12+` installed
- **Node.js**: `v18+` and `npm` installed
- **Docker**: Docker & Docker Compose installed (for PostgreSQL + `pgvector`)
- **Gemini API Key**: Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

### 2. Start PostgreSQL with pgvector

In the root directory, start the vector database using Docker Compose:

```bash
docker compose up -d
```

This starts PostgreSQL 16 on port `5432` with the `pgvector` extension pre-installed.

---

### 3. Backend Setup & Startup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a Python 3.12+ virtual environment**:
   ```bash
   python3.12 -m venv venv
   source venv/bin/activate       # On macOS/Linux
   # venv\Scripts\activate        # On Windows
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your configuration:
   ```env
   GEMINI_API_KEY=AIzaSy_your_actual_gemini_api_key
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/linkedin_reply
   GEMINI_MODEL=gemini-2.5-flash
   GEMINI_EMBEDDING_MODEL=gemini-embedding-001
   EMBEDDING_DIMENSIONS=768
   MEMORY_PROCESS_THRESHOLD=10
   RECENT_MESSAGES_COUNT=8
   RETRIEVAL_TOP_K=3
   RETRIEVAL_THRESHOLD=0.30
   ```

5. **Start the FastAPI server**:
   ```bash
   uvicorn app.main:app --reload
   ```
   - API Server: `http://localhost:8000`
   - Interactive Swagger Docs: `http://localhost:8000/docs`
   - Healthcheck: `http://localhost:8000/health`

6. **Run Backend Test Suite**:
   ```bash
   pytest tests/ -v
   ```

---

### 4. Chrome Extension Build & Installation

1. **Navigate to the extension directory**:
   ```bash
   cd extension
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension production bundle**:
   ```bash
   npm run build
   ```
   The compiled extension will be output in `extension/dist/`.

4. **Load the extension into Google Chrome**:
   1. Open Chrome and navigate to `chrome://extensions`.
   2. Enable **Developer mode** (toggle in the top-right corner).
   3. Click **Load unpacked** (top-left button).
   4. Select the `extension/dist/` directory from this project.

---

## API Endpoints Reference

### 1. `POST /api/v1/conversations/sync`
Synchronizes active LinkedIn messages and contact metadata. Upserts user, contact, and conversation, and batch-inserts new messages with SHA-256 hash deduplication.

**Request Payload**:
```json
{
  "user": {
    "linkedinId": "john-doe-123",
    "name": "John Doe"
  },
  "contact": {
    "linkedinProfileId": "sam-chen-456",
    "name": "Sam Chen",
    "headline": "Senior Staff Engineer at Acme"
  },
  "conversation": {
    "linkedinConversationId": "2-MzQ5OTAxMTI="
  },
  "messages": [
    {
      "senderType": "CONTACT",
      "content": "Are you using Redis Pub/Sub or Kafka for your event bus?"
    },
    {
      "senderType": "USER",
      "content": "We started with Redis Pub/Sub but recently migrated to Kafka for durability."
    },
    {
      "senderType": "CONTACT",
      "content": "How was the migration experience regarding partition rebalancing?"
    }
  ]
}
```

**Response Payload**:
```json
{
  "conversationId": "b18b4e78-4395-4eb8-b998-ef2ec1b97b0a",
  "newMessagesCount": 3,
  "userId": "d7426189-7cf3-40f4-bd0b-a0cae0e29fa2",
  "contactId": "97e4ce99-f2e1-4560-bf6c-db73d528b7e2"
}
```

---

### 2. `POST /api/v1/reply/generate`
Generates 3 contextual reply suggestions using contact-scoped semantic facts, recent micro-summary chunks, and recent messages.

**Request Payload**:
```json
{
  "conversationId": "b18b4e78-4395-4eb8-b998-ef2ec1b97b0a",
  "userName": "John Doe",
  "userRole": "Lead Backend Engineer",
  "contactName": "Sam Chen",
  "contactHeadline": "Senior Staff Engineer at Acme",
  "relationship": "Colleague",
  "instruction": "Explain our consumer group configuration and offer to share rebalance listener snippets.",
  "tone": "professional"
}
```

**Response Payload**:
```json
{
  "reply": "The partition rebalancing was straightforward once we configured cooperative sticky assignors...",
  "replies": [
    {
      "style": "professional",
      "text": "The partition rebalancing was straightforward once we configured cooperative sticky assignors. It prevented the stop-the-world rebalance pauses we were worried about. Happy to share our consumer config snippets if that helps."
    },
    {
      "style": "conversational",
      "text": "We ran into some choppy rebalances early on, but switching to the CooperativeStickyAssignor smoothed everything out. Let me know if you want to see our listener config!"
    },
    {
      "style": "concise",
      "text": "Cooperative sticky assignors eliminated our rebalance spikes. Happy to send over our consumer configuration."
    }
  ],
  "memoryContext": {
    "summaryUsed": true,
    "factsRetrieved": 2,
    "recentMessagesUsed": 3
  }
}
```

---

### 3. Memory & Inspection Endpoints

- **`GET /api/v1/conversations/{conversation_id}/summary-chunks`**: Returns all episodic micro-summary chunks in chronological order.
- **`GET /api/v1/conversations/{conversation_id}/memories`**: Returns all active and superseded memory facts for the contact.
- **`POST /api/v1/memory/process`**: Manually forces memory extraction and fact supersession on unprocessed messages.
- **`GET /health`**: Server liveness and version check (`{"status": "ok", "version": "2.0.0"}`).

---

## Core V2 Engineering Innovations

### 1. Deterministic Heuristic Noise Filter (0 Tokens)
Before sending unprocessed messages to Gemini, a zero-cost heuristic gate inspects the batch. Trivial messages (e.g. *"ok"*, *"thanks!"*, *"sounds good"*, emojis, short filler) are filtered out. If an entire batch is trivial, the processing pointer advances with **0 LLM tokens consumed**.

### 2. Episodic Micro-Summary Chunks
Instead of re-summarizing growing conversations from scratch, Version 2 generates compact 1–3 sentence chunks (max 70 words) representing delta progress since the last slice. Summary chunks are sequentially indexed (`chunk_index`), allowing bounded retrieval.

### 3. Automated Fact Lifecycle & Supersession
Extracted facts are tagged with types (`PROJECT`, `ROLE`, `PREFERENCE`, `EVENT`, `COMMITMENT`). When new messages contradict or update an existing fact (e.g. *"I moved from Google to OpenAI"*), the previous fact is marked `SUPERSEDED` and excluded from subsequent semantic searches.

### 4. Dynamic Prompt Budgeting
To guarantee fast responses and prevent prompt bloat, context is strictly partitioned:
- **Past Conversation History**: 1 summary chunk (~35 tokens) when the immediate buffer is large, or 2 chunks (~70 tokens) when the buffer is small.
- **Recalled Facts**: Top-3 semantically relevant facts via pgvector cosine similarity (`<=>`).
- **Immediate Ongoing Exchange**: Up to 8 recent uncompressed messages (~200 tokens).
- **Total context**: Fixed within ~550–650 tokens.

---

## Security & Privacy

- **Contact Isolation**: All memory queries strictly filter by `user_id` and `contact_id` to prevent cross-contact data leakage.
- **Sanitized Errors**: Upstream API failures and database errors are mapped to safe HTTP 502/500 codes; internal secrets and stack traces are never exposed.
- **Safe Environment Storage**: API keys and database credentials are kept exclusively in `.env` (git-ignored) and managed via Pydantic BaseSettings.
