"""Supabase JWT verification and process-local rolling request limits."""
from collections import deque
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from backend.config import settings


@dataclass
class User:
    id: str
    email: str | None = None


_jwks_client = (jwt.PyJWKClient(settings.supabase_jwks_url, timeout=10)
                if settings.supabase_jwks_url else None)
_requests: dict[str, deque[float]] = {}
_lock = Lock()
_next_cleanup = 0.0
_DAY = 86400
_AUTH_ERROR = "Sila log masuk semula."
_LIMIT_ERROR = "Terlalu banyak soalan. Cuba lagi sebentar ya."


def _verify_token(token: str) -> User:
    """Use configured keys only, never key URLs supplied by a token."""
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if settings.supabase_jwks_url:
            if algorithm not in ("RS256", "ES256") or _jwks_client is None:
                raise jwt.InvalidTokenError()
            key = _jwks_client.get_signing_key_from_jwt(token).key
            algorithms = ["RS256", "ES256"]
        elif settings.supabase_jwt_secret and algorithm == "HS256":
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            raise jwt.InvalidTokenError()
        payload = jwt.decode(
            token, key, algorithms=algorithms, audience="authenticated",
            issuer=(settings.supabase_url.rstrip("/") + "/auth/v1")
            if settings.supabase_url else None,
            options={"require": ["exp", "sub", "aud"]},
        )
        user_id = str(UUID(payload["sub"]))
        email = payload.get("email")
        if email is not None and not isinstance(email, str):
            raise jwt.InvalidTokenError()
        return User(id=user_id, email=email)
    except (jwt.PyJWTError, ValueError, TypeError, AttributeError, OSError):
        raise HTTPException(401, _AUTH_ERROR) from None


def _rate_limit(key: str) -> None:
    global _next_cleanup
    now = monotonic()
    with _lock:
        # Periodically remove inactive identities as well as old timestamps.
        if now >= _next_cleanup:
            for identity in list(_requests):
                history = _requests[identity]
                while history and history[0] <= now - _DAY:
                    history.popleft()
                if not history:
                    del _requests[identity]
            _next_cleanup = now + 60
        history = _requests.setdefault(key, deque())
        while history and history[0] <= now - _DAY:
            history.popleft()
        minute_count = 0
        for stamp in reversed(history):
            if stamp <= now - 60:
                break
            minute_count += 1
        if (minute_count >= settings.rate_limit_per_min
                or len(history) >= settings.rate_limit_per_day):
            raise HTTPException(429, _LIMIT_ERROR)
        history.append(now)


async def rate_limited_user(request: Request) -> User:
    """Validate supplied credentials, then apply a per-user or guest IP limit."""
    header = request.headers.get("authorization")
    if header is None and not settings.auth_required:
        user = User("anonymous")
        # Forwarded headers are deliberately not trusted here.
        key = "ip:" + (request.client.host if request.client else "unknown")
    else:
        parts = header.split() if header else []
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(401, _AUTH_ERROR)
        # PyJWKClient performs synchronous network I/O on a cache miss.
        user = await run_in_threadpool(_verify_token, parts[1])
        key = "user:" + user.id
    _rate_limit(key)
    return user

