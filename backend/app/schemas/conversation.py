"""
app/schemas/conversation.py
============================
Domain-level conversation models used across the service layer.

These are NOT HTTP schemas — they represent the internal conversation
abstraction the application works with after request validation.
ConversationAnalysis is re-exported from ai/output_models so the rest of the
application imports from a single, stable location.
"""

from app.ai.output_models import ConversationAnalysis  # re-export

__all__ = ["ConversationAnalysis"]
