#!/usr/bin/env python3
"""Generate note embeddings for the hosted embedding model and save them locally."""
import asyncio
import hashlib
import json
from pathlib import Path

import httpx

from backend.config import settings
from backend.rag import DATA_DIR, NOTES, note_text


async def main() -> None:
    if not settings.llm_base_url or not settings.llm_api_key or not settings.embed_model:
        raise SystemExit("Set LLM_BASE_URL, LLM_API_KEY, and EMBED_MODEL before building embeddings.")

    texts = [note_text(n) for n in NOTES]
    url = settings.llm_base_url.rstrip("/") + "/embeddings"
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            url,
            headers=headers,
            json={"model": settings.embed_model, "input": texts},
        )
        response.raise_for_status()
        payload = response.json()
        if "data" in payload:
            vectors = [item["embedding"] for item in payload["data"]]
        else:
            vectors = payload["embeddings"]

    hashes = [hashlib.sha256(text.encode("utf-8")).hexdigest() for text in texts]
    path = DATA_DIR / "notes_embeddings.json"
    path.write_text(
        json.dumps({"vectors": vectors, "hashes": hashes}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Saved {len(vectors)} embedding vectors to {path}")


if __name__ == "__main__":
    asyncio.run(main())
