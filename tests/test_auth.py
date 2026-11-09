"""M1 contract tests with fake keys and no network access."""
from dataclasses import replace
from time import time
from unittest.mock import Mock
from uuid import uuid4

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend import auth

SECRET = "test-only-secret-at-least-32-bytes-long"
URL = "https://auth-test.supabase.co"
USER_ID = str(uuid4())


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "settings", replace(
        auth.settings, auth_required=True, supabase_url=URL,
        supabase_jwks_url="", supabase_jwt_secret=SECRET,
        rate_limit_per_min=8, rate_limit_per_day=120,
    ))
    monkeypatch.setattr(auth, "_requests", {})
    monkeypatch.setattr(auth, "_next_cleanup", 0.0)
    app = FastAPI()

    @app.get("/user")
    async def user_endpoint(user: auth.User = Depends(auth.rate_limited_user)):
        return {"id": user.id, "email": user.email}

    with TestClient(app) as test_client:
        yield test_client


def token(**claims):
    payload = {"sub": USER_ID, "email": "student@example.test",
               "aud": "authenticated", "iss": URL + "/auth/v1",
               "exp": int(time()) + 300}
    payload.update(claims)
    return jwt.encode(payload, SECRET, algorithm="HS256")


def call(client, value=None):
    headers = {"Authorization": "Bearer " + value} if value is not None else {}
    return client.get("/user", headers=headers)


def test_missing_token(client):
    response = call(client)
    assert response.status_code == 401
    assert response.json() == {"detail": "Sila log masuk semula."}


@pytest.mark.parametrize("value", ["garbage", "", "a.b.c"])
def test_bad_token(client, value):
    assert call(client, value).status_code == 401


def test_expired_token(client):
    assert call(client, token(exp=int(time()) - 10)).status_code == 401


def test_valid_token(client):
    response = call(client, token())
    assert response.status_code == 200
    assert response.json() == {"id": USER_ID, "email": "student@example.test"}


@pytest.mark.parametrize("claims", [
    {"aud": "anon"}, {"iss": "https://other.supabase.co/auth/v1"},
    {"sub": "invalid-uuid"}, {"sub": ""},
])
def test_invalid_claims(client, claims):
    assert call(client, token(**claims)).status_code == 401


def test_missing_expiry(client):
    value = jwt.encode({"sub": USER_ID, "aud": "authenticated"}, SECRET, algorithm="HS256")
    assert call(client, value).status_code == 401


def test_wrong_signature(client):
    claims = jwt.decode(token(), SECRET, algorithms=["HS256"], audience="authenticated")
    value = jwt.encode(claims, "different-test-secret-at-least-32-bytes", algorithm="HS256")
    assert call(client, value).status_code == 401


def test_ninth_request_rejected(client):
    value = token()
    for _ in range(8):
        assert call(client, value).status_code == 200
    response = call(client, value)
    assert response.status_code == 429
    assert response.json()["detail"] == auth._LIMIT_ERROR


def test_user_limits_are_separate(client):
    for _ in range(8):
        assert call(client, token()).status_code == 200
    assert call(client, token(sub=str(uuid4()))).status_code == 200


def test_guest_mode_still_rejects_bad_token(client, monkeypatch):
    monkeypatch.setattr(auth, "settings", replace(auth.settings, auth_required=False))
    assert call(client).json()["id"] == "anonymous"
    assert call(client, "garbage").status_code == 401
    for _ in range(7):
        assert call(client).status_code == 200
    assert call(client).status_code == 429


def test_daily_limit_and_cleanup(client, monkeypatch):
    clock = [100000.0]
    monkeypatch.setattr(auth, "monotonic", lambda: clock[0])
    monkeypatch.setattr(auth, "settings", replace(auth.settings, rate_limit_per_day=2))
    value = token()
    assert call(client, value).status_code == 200
    clock[0] += 61
    assert call(client, value).status_code == 200
    clock[0] += 61
    assert call(client, value).status_code == 429
    auth._requests["user:inactive"] = auth.deque([clock[0]])
    clock[0] += 86400
    assert call(client, value).status_code == 200
    assert "user:inactive" not in auth._requests


@pytest.mark.parametrize("algorithm", ["RS256", "ES256"])
def test_jwks_signature_verification(client, monkeypatch, algorithm):
    from cryptography.hazmat.primitives.asymmetric import ec, rsa
    private = (rsa.generate_private_key(public_exponent=65537, key_size=2048)
               if algorithm == "RS256" else ec.generate_private_key(ec.SECP256R1()))
    claims = {"sub": USER_ID, "aud": "authenticated", "exp": int(time()) + 300,
              "iss": URL + "/auth/v1"}
    value = jwt.encode(claims, private, algorithm=algorithm, headers={"kid": "test"})
    jwks = Mock()
    jwks.get_signing_key_from_jwt.return_value.key = private.public_key()
    monkeypatch.setattr(auth, "_jwks_client", jwks)
    monkeypatch.setattr(auth, "settings", replace(
        auth.settings, supabase_jwks_url=URL + "/auth/v1/.well-known/jwks.json"))
    assert call(client, value).status_code == 200
    assert call(client, token()).status_code == 401


def test_jwks_failure_is_safe(client, monkeypatch):
    import base64
    jwks = Mock()
    jwks.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientError("offline")
    monkeypatch.setattr(auth, "_jwks_client", jwks)
    monkeypatch.setattr(auth, "settings", replace(
        auth.settings, supabase_jwks_url=URL + "/auth/v1/.well-known/jwks.json"))
    header = base64.urlsafe_b64encode(b'{"alg":"RS256","kid":"test"}').rstrip(b"=").decode()
    assert call(client, header + ".e30.signature").status_code == 401
