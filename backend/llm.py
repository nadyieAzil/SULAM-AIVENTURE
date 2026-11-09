"""Hosted LLM interface for AI MathMentor using the OpenAI-compatible API."""
import asyncio
import json
from collections.abc import AsyncGenerator

import httpx

from backend.config import settings


class LLMError(Exception):
    """Exception for LLM errors with a user-safe message in Bahasa Melayu."""

    def __init__(self, user_message: str):
        super().__init__(user_message)
        self.user_message = user_message


def _token_cap(mode: str) -> int:
    limits = {"tutor": 220, "check": 320, "explain": 450}
    return limits.get(mode, 220)


def _provider_error(status_code: int | None = None, message: str | None = None) -> LLMError:
    if status_code == 429:
        return LLMError("Cikgu Owl sedang sibuk. Cuba lagi sebentar ya.")
    if status_code in (401, 403):
        return LLMError("Konfigurasi AI tidak betul. Sila hubungi guru.")
    if message:
        return LLMError(message)
    return LLMError("Cikgu Owl tidak dapat dihubungi sekarang. Cuba lagi nanti.")


async def stream_chat(system: str, messages: list[dict], mode: str = "tutor", max_tokens: int | None = None) -> AsyncGenerator[str, None]:
    """Async generator yielding text tokens from the hosted LLM provider."""
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    recent_messages = messages[-6:]
    payload = {
        "model": settings.llm_model,
        "stream": True,
        "temperature": 0.2,
        "max_tokens": max_tokens or _token_cap(mode),
        "messages": [{"role": "system", "content": system}, *recent_messages],
    }
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code == 429:
                        raise _provider_error(429)
                    if response.status_code in (401, 403):
                        raise _provider_error(response.status_code)
                    if response.status_code >= 500:
                        if attempt == 0:
                            await asyncio.sleep(0.75)
                            continue
                        raise _provider_error(response.status_code)
                    if response.status_code != 200:
                        raise _provider_error(response.status_code)

                    saw_token = False
                    try:
                        async for raw_line in response.aiter_lines():
                            line = (raw_line or "").strip()
                            if not line or not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                event = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            if "error" in event:
                                raise LLMError(event["error"])
                            choices = event.get("choices") or []
                            if not choices:
                                continue
                            delta = choices[0].get("delta") or {}
                            token = delta.get("content")
                            if token:
                                saw_token = True
                                yield token
                    except (httpx.TimeoutException, httpx.ConnectError):
                        if attempt == 0:
                            await asyncio.sleep(0.75)
                            continue
                        raise _provider_error()

                    if not saw_token:
                        raise _provider_error()
                    return
        except LLMError:
            raise
        except (httpx.TimeoutException, httpx.ConnectError):
            if attempt == 0:
                await asyncio.sleep(0.75)
                continue
            raise _provider_error()
        except Exception:
            if attempt == 0:
                await asyncio.sleep(0.75)
                continue
            raise _provider_error()

    raise _provider_error()

