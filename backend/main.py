from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

app = FastAPI(title="LinkedIn AI Reply — Debug Server")

# Allow requests from the Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic models (mirror shared/types.ts) ─────────────────────────────────

class LinkedInPerson(BaseModel):
    name: str
    headline: str | None = None
    company: str | None = None
    position: str | None = None
    profileUrl: str | None = None
    about: str | None = None
    skills: list[str] = []
    recentPosts: list[str] = []


class Message(BaseModel):
    sender: str          # "me" | "them"
    text: str
    timestamp: str | None = None


class ConversationContext(BaseModel):
    recipient: LinkedInPerson
    messages: list[Message]


class UserProfile(BaseModel):
    name: str
    role: str
    skills: list[str]
    background: str
    style: str           # "professional" | "casual" | "concise" | "detailed"


class GenerateReplyRequest(BaseModel):
    context: ConversationContext
    userProfile: UserProfile


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@app.post("/api/generate-reply")
async def generate_reply(body: GenerateReplyRequest):
    # Pretty-print everything received from the extension
    print("\n" + "=" * 60)
    print("📨  REQUEST RECEIVED FROM EXTENSION")
    print("=" * 60)

    print("\n👤  RECIPIENT / PERSON DETAILS:")
    print(f"    Name          : {body.context.recipient.name}")
    print(f"    Headline      : {body.context.recipient.headline}")
    print(f"    Position      : {body.context.recipient.position}")
    print(f"    Company       : {body.context.recipient.company}")
    print(f"    Profile URL   : {body.context.recipient.profileUrl}")
    if body.context.recipient.about:
        print(f"    Description   : {body.context.recipient.about[:200]}...")
    if body.context.recipient.skills:
        print(f"    Skills ({len(body.context.recipient.skills)}) : {', '.join(body.context.recipient.skills)}")
    if body.context.recipient.recentPosts:
        print(f"    Posts/Activity: {len(body.context.recipient.recentPosts)} recent post(s)")
        for p_idx, post_text in enumerate(body.context.recipient.recentPosts, 1):
            print(f"       [{p_idx}] {post_text[:100]}...")

    print(f"\n💬  CONVERSATION ({len(body.context.messages)} messages):")
    for i, msg in enumerate(body.context.messages, 1):
        arrow = "→" if msg.sender == "me" else "←"
        who   = "Me  " if msg.sender == "me" else "Them"
        print(f"    [{i}] {arrow} {who}: {msg.text[:120]}")

    print("\n🧑  USER PROFILE:")
    print(f"    Name       : {body.userProfile.name}")
    print(f"    Role       : {body.userProfile.role}")
    print(f"    Skills     : {', '.join(body.userProfile.skills)}")
    print(f"    Style      : {body.userProfile.style}")
    print(f"    Background : {body.userProfile.background[:120]}")

    print("\n📋  RAW JSON:")
    print(json.dumps(body.model_dump(), indent=2))
    print("=" * 60 + "\n")

    # Return a hardcoded placeholder reply so the extension shows something
    return {
        "reply": "[DEBUG] Backend received your request! Check the terminal for details.",
        "confidence": 1.0,
    }


@app.get("/")
async def root():
    return {"status": "ok", "message": "LinkedIn AI Reply debug server is running."}
