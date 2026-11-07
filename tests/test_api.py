"""Unit tests for AI MathMentor API endpoints."""
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import app
from backend.llm import LLMError

client = TestClient(app)

MOCK_NOTES = [{"topic": "Persamaan Linear", "content": "Konsep asas linear", "mistakes": ["salah tanda"]}]


def test_health_endpoint():
    """GET /api/health should return ok: True without touching DB or LLM."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_config_endpoint():
    """GET /api/config should return public config with supabaseUrl, supabaseAnonKey, and authRequired."""
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "supabaseUrl" in data
    assert "supabaseAnonKey" in data
    assert "authRequired" in data
    assert isinstance(data["authRequired"], bool)


def test_chat_stream_success():
    """POST /api/chat should stream Contract B lines: sources first, then tokens."""
    async def mock_stream_chat(system, messages):
        yield "Langkah "
        yield "pertama..."

    async def mock_retrieve(query, k=2):
        return MOCK_NOTES

    with patch("app.retrieve", side_effect=mock_retrieve), \
         patch("app.stream_chat", side_effect=mock_stream_chat):
        payload = {
            "messages": [{"role": "user", "content": "Selesaikan 2x + 1 = 5"}],
            "mode": "tutor",
            "form": 1,
        }
        response = client.post("/api/chat", json=payload)
        assert response.status_code == 200
        assert "application/x-ndjson" in response.headers.get("content-type", "")

        lines = [json.loads(line) for line in response.text.strip().split("\n") if line.strip()]
        assert len(lines) >= 3
        # First line: sources
        assert lines[0] == {"sources": ["Persamaan Linear"]}
        # Subsequent lines: tokens
        assert lines[1] == {"token": "Langkah "}
        assert lines[2] == {"token": "pertama..."}


def test_chat_stream_llm_error():
    """POST /api/chat should output {"error": ...} when LLM raises an LLMError."""
    async def mock_stream_chat(system, messages):
        raise LLMError("Cikgu Owl sedang sibuk. Cuba lagi sebentar ya.")
        yield ""  # make it an async generator

    async def mock_retrieve(query, k=2):
        return MOCK_NOTES

    with patch("app.retrieve", side_effect=mock_retrieve), \
         patch("app.stream_chat", side_effect=mock_stream_chat):
        payload = {
            "messages": [{"role": "user", "content": "Hello"}],
            "mode": "tutor",
            "form": 1,
        }
        response = client.post("/api/chat", json=payload)
        assert response.status_code == 200

        lines = [json.loads(line) for line in response.text.strip().split("\n") if line.strip()]
        assert len(lines) == 2
        # First line: sources
        assert lines[0] == {"sources": ["Persamaan Linear"]}
        # Second line: error
        assert lines[1] == {"error": "Cikgu Owl sedang sibuk. Cuba lagi sebentar ya."}
