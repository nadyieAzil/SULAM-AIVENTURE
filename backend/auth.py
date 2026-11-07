"""Authentication and rate limiting module for AI MathMentor.

Stub implementation for Step 1 skeleton refactor.
To be implemented fully by M1 with Supabase JWT verification.
"""
from dataclasses import dataclass
from fastapi import Request


@dataclass
class User:
    id: str  # Supabase user uuid, or "anonymous" when AUTH_REQUIRED=false
    email: str | None = None


async def rate_limited_user(request: Request) -> User:
    """FastAPI dependency.

    Verifies the Bearer token (401 if invalid), applies per-user
    rate limit (429 if exceeded), returns User. If AUTH_REQUIRED=false returns User("anonymous")
    and still applies the limit keyed by client IP.
    """
    return User(id="anonymous", email=None)

