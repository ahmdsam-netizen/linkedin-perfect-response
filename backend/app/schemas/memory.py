"""
app/schemas/memory.py
======================
Pydantic schemas for memory-related API responses (debug/inspection endpoints).
"""

from datetime import datetime

from pydantic import BaseModel


class MemoryOut(BaseModel):
    id: str
    content: str
    memory_type: str
    status: str
    created_at: datetime


class SummaryChunkOut(BaseModel):
    id: str
    chunk_index: int
    summary_chunk: str
    created_at: datetime


class MemoryListResponse(BaseModel):
    memories: list[MemoryOut]
    total: int


class SummaryChunkListResponse(BaseModel):
    chunks: list[SummaryChunkOut]
    total: int
