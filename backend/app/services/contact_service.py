"""
app/services/contact_service.py
================================
Find-or-create a Contact record scoped to a specific user.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Contact

logger = logging.getLogger(__name__)


async def find_or_create_contact(
    db: AsyncSession,
    *,
    user_id: str,
    linkedin_profile_id: str,
    name: str,
    headline: str | None = None,
) -> Contact:
    """Return an existing Contact or create one if not found.

    The contact is scoped to (user_id, linkedin_profile_id) — different users
    can have contacts with the same LinkedIn profile ID, and their memories
    remain isolated.

    Args:
        db: Active async database session.
        user_id: Internal User.id of the replying user.
        linkedin_profile_id: LinkedIn profile slug/identifier of the contact.
        name: Display name of the contact.
        headline: LinkedIn headline (e.g. "Software Engineer at Google").

    Returns:
        The Contact ORM object.
    """
    result = await db.execute(
        select(Contact).where(
            Contact.user_id == user_id,
            Contact.linkedin_profile_id == linkedin_profile_id,
        )
    )
    contact = result.scalar_one_or_none()

    if contact is not None:
        # Update mutable fields if they changed
        updated = False
        if contact.name != name:
            contact.name = name
            updated = True
        if headline and contact.headline != headline:
            contact.headline = headline
            updated = True
        if updated:
            logger.debug("Updated contact: id=%s name=%s", contact.id, name)
        return contact

    contact = Contact(
        user_id=user_id,
        linkedin_profile_id=linkedin_profile_id,
        name=name,
        headline=headline,
    )
    db.add(contact)
    await db.flush()
    logger.info(
        "Created new contact: user_id=%s linkedin_profile_id=%s name=%s",
        user_id,
        linkedin_profile_id,
        name,
    )
    return contact
