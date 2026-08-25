"""
app/db/models.py
================
SQLAlchemy 2.0 async ORM models for LinkedIn AI Reply V2.

Six lean tables — every column has a direct purpose in the application.
Redundant fields from the original spec have been deliberately omitted.

Tables:
  1. users           — Identity scoping (linkedin_id + name only)
  2. contacts        — Who the user talks to (name + headline only)
  3. conversations   — Tracks conversation state and processing pointer
  4. messages        — Raw message history with SHA-256 hash deduplication
  5. summary_chunks  — Episodic micro-summaries (1–3 sentences per chunk)
  6. memories        — Contact-scoped vector facts (pgvector VECTOR(768))
"""

import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── 1. Users ──────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    linkedin_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    contacts: Mapped[list["Contact"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    memories: Mapped[list["Memory"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!r} linkedin_id={self.linkedin_id!r} name={self.name!r}>"


# ── 2. Contacts ───────────────────────────────────────────────────────────────


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("user_id", "linkedin_profile_id", name="uq_contact_user_profile"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    linkedin_profile_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="contacts")
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )
    memories: Mapped[list["Memory"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Contact id={self.id!r} name={self.name!r}>"


# ── 3. Conversations ──────────────────────────────────────────────────────────


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "linkedin_conversation_id", name="uq_conversation_user_linkedin"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    contact_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False
    )
    linkedin_conversation_id: Mapped[str] = mapped_column(String(255), nullable=False)
    last_processed_message_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="conversations")
    contact: Mapped["Contact"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    summary_chunks: Mapped[list["SummaryChunk"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="SummaryChunk.chunk_index",
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id!r} linkedin_id={self.linkedin_conversation_id!r}>"


# ── 4. Messages ───────────────────────────────────────────────────────────────


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "content_hash", name="uq_message_hash"),
        Index("idx_messages_convo_order", "conversation_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_type: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message id={self.id!r} sender={self.sender_type!r}>"


# ── 5. Summary Chunks ─────────────────────────────────────────────────────────


class SummaryChunk(Base):
    __tablename__ = "summary_chunks"
    __table_args__ = (
        Index("idx_summary_chunks_latest", "conversation_id", "chunk_index"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    summary_chunk: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    conversation: Mapped["Conversation"] = relationship(back_populates="summary_chunks")

    def __repr__(self) -> str:
        return f"<SummaryChunk id={self.id!r} chunk_index={self.chunk_index!r}>"


# ── 6. Memories ───────────────────────────────────────────────────────────────


class Memory(Base):
    __tablename__ = "memories"
    __table_args__ = (
        Index(
            "idx_memories_contact_active",
            "user_id",
            "contact_id",
            postgresql_where="status = 'ACTIVE'",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    contact_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    memory_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="memories")
    contact: Mapped["Contact"] = relationship(back_populates="memories")

    def __repr__(self) -> str:
        return f"<Memory id={self.id!r} type={self.memory_type!r} status={self.status!r}>"
