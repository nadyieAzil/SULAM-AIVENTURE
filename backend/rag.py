"""RAG (Retrieval-Augmented Generation) module for AI MathMentor."""
import json
import math
import re
from pathlib import Path

import httpx

BASE = Path(__file__).resolve().parent.parent
OLLAMA = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"

NOTES = json.loads((BASE / "data" / "notes.json").read_text(encoding="utf-8"))
_vectors: list[list[float]] | None = None


def note_text(n: dict) -> str:
    return f"{n['topic']}. {n['content']} Kesilapan lazim: {' '.join(n.get('mistakes', []))}"


async def embed(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{OLLAMA}/api/embed", json={"model": EMBED_MODEL, "input": texts})
        r.raise_for_status()
        return r.json()["embeddings"]


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
    """Embedding search; falls back to keyword search if embed model is missing."""
    global _vectors
    try:
        if _vectors is None:
            _vectors = await embed([note_text(n) for n in NOTES])
        q = (await embed([query]))[0]
        scored = [(cosine(q, v), n) for v, n in zip(_vectors, NOTES)]
    except Exception:
        scored = [(keyword_score(query, n), n) for n in NOTES]
    scored.sort(key=lambda s: s[0], reverse=True)
    return [n for _, n in scored[:k]]

