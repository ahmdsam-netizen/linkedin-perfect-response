# LinkedIn AI Reply — Chrome Extension & FastAPI Backend

A production-grade, two-pass AI assistant for LinkedIn messaging. The system consists of a **Manifest V3 Chrome Extension** (Vite + React + TypeScript) that automatically scrapes active LinkedIn conversation context and a **FastAPI + LangChain + Gemini Backend** that analyzes conversations and generates three distinct reply alternatives (Professional, Conversational, and Concise).

---

##  Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       CHROME EXTENSION (MANIFEST V3)                            │
│                                                                                 │
│   LinkedIn DOM Chat           Popup UI (React 18)       Background Worker       │
│  ┌──────────────────┐        ┌───────────────────┐     ┌──────────────────┐     │
│  │ Active Chat Box  │───────►│Style Tabs, Prompts│────►│ Message Handler  │     │
│  │ Context Extractor│        │ & Reply Preview   │     │ & Profile Fetcher│     │
│  └──────────────────┘        └───────────────────┘     └─────────┬────────┘     │
└──────────────────────────────────────────────────────────────────┼──────────────┘
                                                                   │
                                                POST /api/v1/reply/generate
                                                                   │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────-──────────────┐
│                            FASTAPI BACKEND (PYTHON 3.12)                        │
│                                                                                 │
│   FastAPI Route             Service Orchestrator          LangChain Chains      │
│  ┌──────────────────┐       ┌──────────────────────┐     ┌───────────────────┐  │
│  │ app/api/routes   │──────►│ reply_service.py     │────►│ Pass 1: Analysis  │  │
│  │  /reply/generate │       │                      │     │ Pass 2: Generation│  │
│  └──────────────────┘       └──────────────────────┘     └─────────┬─────────┘  │
└────────────────────────────────────────────────────────────────────┼────────────┘
                                                                     |
                                                                     ▼
                                                           Google Gemini API
                                                          (gemini-3.6-flash)
```

---

##  Tech Stack

### Frontend (Chrome Extension)
- **Framework**: React 18, TypeScript, Vite
- **Manifest Version**: Chrome Extension Manifest V3
- **Styling**: CSS Modules / Custom Responsive Extension Theme
- **Messaging**: `chrome.runtime` async messaging pipeline

### Backend (Python Service)
- **Language**: Python 3.12
- **Web Framework**: FastAPI, Uvicorn
- **AI Framework**: LangChain, `langchain-google-genai`
- **LLM Provider**: Google Gemini API (`gemini-3.6-flash`)
- **Settings & Validation**: Pydantic v2, Pydantic Settings
- **Testing**: Pytest, Pytest-Asyncio, HTTPX

---

##  Repository Structure

```
linkedin-reply-extension/
├── README.md                      # Root documentation (this file)
│
├── backend/                       # FastAPI AI Service
│   ├── app/
│   │   ├── main.py                # FastAPI app initialization & CORS setup
│   │   ├── api/
│   │   │   └── routes/
│   │   │       └── reply.py       # POST /api/v1/reply/generate route
│   │   ├── ai/
│   │   │   ├── llm.py             # Gemini model factory (get_llm)
│   │   │   ├── output_models.py   # Structured output Pydantic schemas
│   │   │   ├── prompts.py         # LangChain ChatPromptTemplates
│   │   │   └── chains.py          # LangChain analysis & generation chains
│   │   ├── schemas/
│   │   │   ├── request.py         # GenerateReplyRequest schema (camelCase aliases)
│   │   │   ├── conversation.py    # Conversation domain models
│   │   │   └── response.py        # GenerateReplyResponse schema
│   │   ├── services/
│   │   │   ├── conversation_service.py # Conversation analysis logic
│   │   │   ├── context_service.py      # Context engineering logic
│   │   │   └── reply_service.py        # Pipeline orchestration
│   │   └── core/
│   │       └── config.py          # Pydantic BaseSettings (.env loader)
│   ├── tests/                     # 16 unit & integration tests
│   │   ├── conftest.py            # Shared fixtures & mock LLM
│   │   ├── test_health.py         # Health check tests
│   │   ├── test_schemas.py        # Request validation tests
│   │   └── test_reply.py          # End-to-end service tests
│   ├── .env.example               # Environment template
│   ├── requirements.txt           # Python dependencies
│   └── README.md                  # Backend-specific documentation
│
└── extension/                     # Manifest V3 Chrome Extension
    ├── src/
    │   ├── background/
    │   │   └── service_worker.ts  # Background worker & API proxy
    │   ├── content/
    │   │   ├── content.ts         # Content script entry point
    │   │   ├── linkedin/          # DOM selectors, scraper, composer insertion
    │   │   └── ui/                # Injected '✨ Generate Reply' button
    │   ├── popup/                 # React Popup UI
    │   │   └── components/
    │   │       └── ReplyGenerator.tsx # Interactive reply generator with style tabs
    │   └── shared/                # Shared TypeScript types & message contracts
    ├── manifest.json              # Extension manifest
    ├── vite.config.ts             # Vite build configuration
    └── package.json               # Frontend dependencies
```

---

##  Quickstart Guide

### 1. Prerequisites
- **Python**: `3.12` installed (`python3.12 --version`)
- **Node.js**: `v18+` and `npm` installed
- **Gemini API Key**: Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

### 2. Backend Setup & Startup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a Python 3.12 virtual environment**:
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
   Create a `.env` file inside `backend/`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your Google Gemini API key:
   ```env
   GEMINI_API_KEY=AIzaSy_your_actual_gemini_api_key
   GEMINI_MODEL=gemini-3.6-flash
   ```

5. **Start the FastAPI server**:
   ```bash
   uvicorn app.main:app --reload
   ```
   The backend runs at: `http://localhost:8000`  
   Interactive Swagger API docs available at: `http://localhost:8000/docs`

6. **Run Backend Test Suite**:
   ```bash
   pytest tests/ -v
   ```

---

### 3. Chrome Extension Build & Installation

1. **Open a new terminal and navigate to the extension directory**:
   ```bash
   cd extension
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension production bundle**:
   ```bash
   npm run build
   ```
   This generates the compiled extension in `extension/dist/`.

4. **Load the extension into Google Chrome**:
   1. Open Google Chrome and navigate to `chrome://extensions`.
   2. Enable **Developer mode** in the top right corner.
   3. Click **Load unpacked** in the top left.
   4. Select the `extension/dist/` directory inside your project folder.

---

##  API Endpoints Reference

### 1. `POST /api/v1/reply/generate` (also aliased as `/api/generate-reply`)
Accepts scraped LinkedIn conversation context and returns three structured reply suggestions.

**Request Payload Example**:
```json
{
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
        "text": "I'm using Redis Pub/Sub.",
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
  "relationship": "Connection",
  "userPrompt": "Share my experience with Kafka and offer to chat."
}
```

**Response Payload Example**:
```json
{
  "reply": "Kafka is definitely worth evaluating for your use case. It provides durable message storage and replay capabilities that Redis Pub/Sub doesn't offer.",
  "replies": [
    {
      "style": "professional",
      "text": "Kafka is definitely worth evaluating for your use case. It provides durable message storage and replay capabilities that Redis Pub/Sub doesn't offer. Happy to share some benchmarks from our migration if useful."
    },
    {
      "style": "conversational",
      "text": "Yeah, Kafka crossed my mind too when we were on Redis. Made the switch about a year ago — huge difference for high-throughput workloads. What kind of message volume are you dealing with?"
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

### 2. `GET /health`
Health check endpoint to verify backend liveness. Returns `{"status": "ok"}`.

---

##  Features & Highlights

- **Two-Pass AI Pipeline**:
  - **Pass 1 (Analysis)**: Gemini analyzes conversation topics, tone, stage, key facts, open questions, and last message intent.
  - **Pass 2 (Generation)**: Context engineering combines user profile, recipient profile, relationship, conversation history, analysis, and custom prompt to produce 3 distinct replies.
- **Interactive Multi-Style Tabs**:
  - The Chrome extension popup displays 3 clickable tabs (` Professional`, ` Conversational`, ` Concise`). Switch options with 1 click.
- **Smart DOM Insertion**:
  - Inserts directly into LinkedIn's React Rich Text Editor (`div.msg-form__contenteditable`), preserving inner paragraph formatting and firing synthetic `beforeinput`, `input`, and `change` events so LinkedIn's **Send button** is automatically enabled.
- **Robust Error Handling & CORS**:
  - Safe 502 error mapping for Gemini API issues (never leaks secrets or stack traces to client).
  - Explicit CORS configuration for localhost origins and Chrome extension extensions.
