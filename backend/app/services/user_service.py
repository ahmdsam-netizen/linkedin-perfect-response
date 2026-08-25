"""
app/services/user_service.py
============================
Find-or-create a User record by LinkedIn ID.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User

logger = logging.getLogger(__name__)


async def find_or_create_user(
    db: AsyncSession,
    *,
    linkedin_id: str,
    name: str,
) -> User:
    """Return an existing User or create one if not found.

    Args:
        db: Active async database session.
        linkedin_id: The LinkedIn member identifier (unique).
        name: Display name of the user.

    Returns:
        The User ORM object (either existing or newly created).
    """
    result = await db.execute(
        select(User).where(User.linkedin_id == linkedin_id)
    )
    user = result.scalar_one_or_none()

    if user is not None:
        # Update name if it changed (e.g. user updated their LinkedIn profile)
        if user.name != name:
            user.name = name
            logger.debug("Updated user name: linkedin_id=%s name=%s", linkedin_id, name)
        return user

    user = User(linkedin_id=linkedin_id, name=name)
    db.add(user)
    await db.flush()  # Flush to get the generated ID without committing
    logger.info("Created new user: linkedin_id=%s name=%s", linkedin_id, name)
    return user
