"""Unit tests for AI MathMentor API endpoints."""
import json
from dataclasses import replace
from unittest.mock import MagicMock, Mock, patch

from fastapi.testclient import TestClient

import app as app_module
from app import app
from backend.auth import User, authenticated_user
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


def test_feedback_requires_authentication():
    response = client.post(
        "/api/feedback",
        data={
            "account": "student@example.test",
            "issue_type": "account",
            "description": "A problem",
        },
    )
    assert response.status_code == 401


def test_feedback_sends_description_and_attachment(monkeypatch):
    app.dependency_overrides[authenticated_user] = lambda: User(
        id="student-123", email="student@example.test", username="student"
    )
    monkeypatch.setattr(app_module, "settings", replace(
        app_module.settings,
        smtp_host="smtp.example.test",
        smtp_username="sender@example.test",
        smtp_password="test-password",
    ))
    smtp_server = Mock()
    smtp_context = MagicMock()
    smtp_context.__enter__.return_value = smtp_server

    try:
        with patch("app.smtplib.SMTP", return_value=smtp_context):
            response = client.post(
                "/api/feedback",
                data={
                    "account": "contact@example.test",
                    "issue_type": "bug_report",
                    "description": "The practice page is blank.",
                },
                files={"attachment": ("screen.png", b"image-data", "image/png")},
            )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    smtp_server.starttls.assert_called_once()
    smtp_server.login.assert_called_once_with("sender@example.test", "test-password")
    email = smtp_server.send_message.call_args.args[0]
    assert email["To"] == "sulamaiventure@gmail.com"
    assert email["Subject"] == "AI MathMentor feedback"
    body = email.get_body(preferencelist=("plain",)).get_content()
    assert "contact@example.test" in body
    assert "student@example.test" in body
    assert "Issue type: Bug Report" in body
    assert "The practice page is blank." in body
    assert email.iter_attachments().__next__().get_filename() == "screen.png"


def test_feedback_rejects_blank_description():
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    try:
        response = client.post(
            "/api/feedback",
            data={"account": "student", "issue_type": "account", "description": "   "},
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 422


def test_feedback_rejects_oversized_attachment():
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    try:
        response = client.post(
            "/api/feedback",
            data={"account": "student", "issue_type": "account", "description": "A problem"},
            files={"attachment": ("large.txt", b"x" * (5 * 1024 * 1024 + 1), "text/plain")},
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 413


def test_feedback_reports_missing_smtp_configuration(monkeypatch):
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    monkeypatch.setattr(app_module, "settings", replace(
        app_module.settings,
        smtp_host="",
        smtp_username="",
        smtp_password="",
    ))
    try:
        response = client.post(
            "/api/feedback",
            data={"account": "student", "issue_type": "account", "description": "A problem"},
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 503
    assert response.json()["detail"] == "Feedback email is not configured."


def test_feedback_requires_account_identifier():
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    try:
        response = client.post(
            "/api/feedback",
            data={"description": "A problem", "issue_type": "account"},
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 422


def test_feedback_rejects_unknown_issue_type():
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    try:
        response = client.post(
            "/api/feedback",
            data={
                "account": "student@example.test",
                "issue_type": "unknown",
                "description": "A problem",
            },
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 422


def test_feedback_requires_issue_type():
    app.dependency_overrides[authenticated_user] = lambda: User(id="student-123")
    try:
        response = client.post(
            "/api/feedback",
            data={"account": "student@example.test", "description": "A problem"},
        )
    finally:
        app.dependency_overrides.pop(authenticated_user, None)
    assert response.status_code == 422


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
