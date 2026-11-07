"""LLM interface module for AI MathMentor (baseline local Ollama)."""
import json
from collections.abc import AsyncGenerator

import httpx

OLLAMA = "http://localhost:11434"
CHAT_MODEL = "qwen2.5:7b"


class LLMError(Exception):
    """Exception for LLM errors with user-safe message in Bahasa Melayu."""
    def __init__(self, user_message: str):
        super().__init__(user_message)
        self.user_message = user_message


async def stream_chat(system: str, messages: list[dict]) -> AsyncGenerator[str, None]:
    """Async generator yielding text tokens (str). Raises LLMError on any provider failure."""
    payload = {
        "model": CHAT_MODEL,
        "stream": True,
        "options": {"temperature": 0.3},
        "messages": [{"role": "system", "content": system}] + messages[-12:],
    }
    try:
        async with httpx.AsyncClient(timeout=None) as c:
            async with c.stream("POST", f"{OLLAMA}/api/chat", json=payload) as r:
                if r.status_code != 200:
                    raise LLMError(f"Ralat Ollama (status {r.status_code}).")
                async for line in r.aiter_lines():
                    if line:
                        d = json.loads(line)
                        if "error" in d:
                            raise LLMError(d["error"])
                        tok = d.get("message", {}).get("content", "")
                        if tok:
                            yield tok
    except httpx.ConnectError:
        raise LLMError("Ollama tidak berjalan. Sila buka aplikasi Ollama.")
    except LLMError:
        raise
    except Exception as e:
        raise LLMError(str(e))

