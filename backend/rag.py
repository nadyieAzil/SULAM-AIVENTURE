"""RAG module for AI MathMentor using hosted embedding vectors with keyword fallback."""
import hashlib
import json
import math
import re
from pathlib import Path

import httpx

from backend.config import settings

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "data"
EMBEDDINGS_PATH = DATA_DIR / "notes_embeddings.json"
EMBED_MODEL = settings.embed_model
NOTES = json.loads((DATA_DIR / "notes.json").read_text(encoding="utf-8"))
_vectors: list[list[float]] | None = None
_embed_cache: dict[str, list[float]] = {}


def note_text(n: dict) -> str:
    return f"{n['topic']}. {n['content']} Kesilapan lazim: {' '.join(n.get('mistakes', []))}"


def _note_hashes() -> list[str]:
    return [hashlib.sha256(note_text(n).encode("utf-8")).hexdigest() for n in NOTES]


def _load_vectors_from_disk() -> list[list[float]]:
    if not EMBEDDINGS_PATH.exists():
        return []
    try:
        payload = json.loads(EMBEDDINGS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    vectors = payload.get("vectors") if isinstance(payload, dict) else payload
    hashes = payload.get("hashes") if isinstance(payload, dict) else []
    if not isinstance(vectors, list):
        return []
    if len(vectors) != len(NOTES):
        return []
    if hashes and len(hashes) == len(NOTES) and hashes != _note_hashes():
        return []
    return vectors


async def embed(texts: list[str]) -> list[list[float]]:
    if not EMBED_MODEL:
        raise ValueError("EMBED_MODEL is empty")
    url = settings.llm_base_url.rstrip("/") + "/embeddings"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json={"model": EMBED_MODEL, "input": texts},
        )
        response.raise_for_status()
        payload = response.json()
        if "data" in payload:
            return [item["embedding"] for item in payload["data"]]
        return payload["embeddings"]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb + 1e-9)


def keyword_score(query: str, n: dict) -> float:
    words = set(re.findall(r"\w+", query.lower()))
    text = note_text(n).lower()
    return sum(1 for w in words if len(w) > 2 and w in text)


async def retrieve(query: str, k: int = 2) -> list[dict]:
    """Return up to k notes using vector similarity when embeddings are available; otherwise use keyword fallback."""
    global _vectors
    query = (query or "").strip()
    if not query:
        return []

    if EMBED_MODEL:
        try:
            if _vectors is None:
                _vectors = _load_vectors_from_disk()
            if not _vectors and EMBEDDINGS_PATH.exists():
                _vectors = None

            if _vectors is None:
                _vectors = _load_vectors_from_disk()
            if not _vectors and EMBEDDINGS_PATH.exists():
                raise RuntimeError("missing embeddings")

            if _vectors is None:
                _vectors = await embed([note_text(n) for n in NOTES])

            cache_key = query.lower()
            if cache_key not in _embed_cache:
                if len(_embed_cache) >= 200:
                    _embed_cache.pop(next(iter(_embed_cache)))
                q = (await embed([query]))[0]
                _embed_cache[cache_key] = q
            q = _embed_cache[cache_key]
            scored = [(cosine(q, v), n) for v, n in zip(_vectors, NOTES)]
            scored.sort(key=lambda s: s[0], reverse=True)
            return [n for _, n in scored[:k]]
        except Exception:
            pass

    scored = [(keyword_score(query, n), n) for n in NOTES]
    scored.sort(key=lambda s: s[0], reverse=True)
    return [n for _, n in scored[:k]]

