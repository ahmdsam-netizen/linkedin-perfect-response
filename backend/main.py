from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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
    name: str = "Recipient"
    headline: str | None = None
    company: str | None = None
    position: str | None = None
    profileUrl: str | None = None
    about: str | None = None
    skills: list[str] = Field(default_factory=list)
    recentPosts: list[str] = Field(default_factory=list)


class Message(BaseModel):
    sender: str          # "me" | "them"
    text: str = ""
    timestamp: str | None = None


class ConversationContext(BaseModel):
    recipient: LinkedInPerson = Field(default_factory=LinkedInPerson)
    messages: list[Message] = Field(default_factory=list)


class UserProfile(BaseModel):
    name: str = "LinkedIn User"
    role: str = ""
    skills: list[str] = Field(default_factory=list)
    background: str | None = ""
    style: str | None = None


class GenerateReplyRequest(BaseModel):
    context: ConversationContext = Field(default_factory=ConversationContext)
    userProfile: UserProfile = Field(default_factory=UserProfile)
    myName: str | None = None
    recipientName: str | None = None
    relationship: str | None = None
    style: str | None = None
    userPrompt: str | None = None


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@app.post("/api/generate-reply")
async def generate_reply(body: GenerateReplyRequest):
    # Pretty-print everything received from the extension
    print("\n" + "=" * 60)
    print("📨  REQUEST RECEIVED FROM EXTENSION")
    print("=" * 60)

    recip = body.context.recipient
    recip_name = body.recipientName or recip.name or "Recipient"
    print("\n👤  RECIPIENT / PERSON DETAILS:")
    print(f"    Name          : {recip_name}")
    print(f"    Headline      : {recip.headline or 'None'}")
    print(f"    Position      : {recip.position or 'None'}")
    print(f"    Company       : {recip.company or 'None'}")
    print(f"    Profile URL   : {recip.profileUrl or 'None'}")
    if recip.about:
        print(f"    Description   : {recip.about[:200]}...")
    if recip.skills:
        print(f"    Skills ({len(recip.skills)}) : {', '.join(recip.skills)}")
    if recip.recentPosts:
        print(f"    Posts/Activity: {len(recip.recentPosts)} recent post(s)")
        for p_idx, post_text in enumerate(recip.recentPosts, 1):
            print(f"       [{p_idx}] {post_text[:100]}...")

    print(f"\n💬  CONVERSATION ({len(body.context.messages)} messages):")
    for i, msg in enumerate(body.context.messages, 1):
        arrow = "→" if msg.sender == "me" else "←"
        who   = "Me  " if msg.sender == "me" else "Them"
        print(f"    [{i}] {arrow} {who}: {msg.text[:120]}")

    print("\n🧑  SENDER / USER PROFILE:")
    my_name = body.myName or body.userProfile.name or "LinkedIn User"
    print(f"    My Name    : {my_name}")
    print(f"    Role       : {body.userProfile.role or 'None'}")
    skills_list = body.userProfile.skills or []
    print(f"    Skills     : {', '.join(skills_list)}")
    bg = body.userProfile.background or ""
    print(f"    Background : {bg[:120] if bg else 'None'}")

    print("\n🎯  GENERATION PARAMETERS:")
    print(f"    Relationship  : {body.relationship or 'Default (Connection)'}")
    print(f"    Reply Style   : {body.style or body.userProfile.style or 'professional'}")
    print(f"    Custom Prompt : {body.userPrompt or '(None - Contextual auto-reply)'}")

    print("\n📋  RAW JSON:")
    print(json.dumps(body.model_dump(), indent=2))
    print("=" * 60 + "\n")

    # Return placeholder reply
    first_name = recip_name.split()[0] if recip_name and recip_name != "Recipient" else "there"
    return {
        "reply": f"Hi {first_name}, thanks for reaching out! I appreciate you connecting.",
        "confidence": 1.0,
    }


@app.get("/")
async def root():
    return {"status": "ok", "message": "LinkedIn AI Reply debug server is running."}

