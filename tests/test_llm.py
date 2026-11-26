import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.llm import LLMError, stream_chat


class FakeStreamResponse:
    def __init__(self, status_code, lines=None, body=b"", headers=None):
        self.status_code = status_code
        self._lines = lines or []
        self._body = body
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def aread(self):
        return self._body

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        self.stream_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url, **kwargs):
        self.stream_calls.append((method, url, kwargs))
        return FakeStreamResponse(200, [
            'data: {"choices":[{"delta":{"content":"Hello "}}]}',
            'data: {"choices":[{"delta":{"content":"world"}}]}',
            'data: [DONE]'
        ])


@pytest.mark.asyncio
async def test_stream_chat_parses_sse_tokens():
    with patch("backend.llm.settings") as settings, \
         patch("backend.llm.httpx.AsyncClient", return_value=FakeAsyncClient()):
        settings.llm_base_url = "https://example.com/v1"
        settings.llm_api_key = "abc"
        settings.llm_model = "gemini-2.0-flash"

        tokens = []
        async for token in stream_chat("System prompt", [{"role": "user", "content": "Hi"}]):
            tokens.append(token)

        assert tokens == ["Hello ", "world"]


@pytest.mark.asyncio
async def test_stream_chat_logs_provider_details_and_maps_429(caplog):
    class RateLimitedClient(FakeAsyncClient):
        def stream(self, method, url, **kwargs):
            body = json.dumps({
                "error": {
                    "code": 429,
                    "message": "Provider rate limit reached",
                    "metadata": {"provider_name": "Test Provider"},
                },
            }).encode()
            return FakeStreamResponse(
                429, body=body, headers={"x-request-id": "request-123"},
            )

    with patch("backend.llm.settings") as settings, \
         patch("backend.llm.httpx.AsyncClient", return_value=RateLimitedClient()):
        settings.llm_base_url = "https://example.com/v1"
        settings.llm_api_key = "abc"
        settings.llm_model = "gemini-2.0-flash"

        with pytest.raises(LLMError, match="Cikgu Owl sedang sibuk"):
            async for _ in stream_chat("System", [{"role": "user", "content": "Hi"}]):
                pass

    assert "status=429" in caplog.text
    assert "request_id=request-123" in caplog.text
    assert "error_code=429" in caplog.text
    assert "provider=Test Provider" in caplog.text
