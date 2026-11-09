import pytest

from backend import rag


@pytest.mark.asyncio
async def test_keyword_fallback_when_embeddings_missing(monkeypatch):
    monkeypatch.setattr(rag, "EMBED_MODEL", "")
    monkeypatch.setattr(rag, "_vectors", None)
    monkeypatch.setattr(rag, "NOTES", [
        {"topic": "Pecahan", "content": "Tambah pecahan dengan penyebut sama", "mistakes": []},
        {"topic": "Algebra", "content": "Kembangkan ungkapan algebra", "mistakes": []},
    ])

    results = await rag.retrieve("pecahan tambah penyebut", k=2)

    assert results
    assert results[0]["topic"] == "Pecahan"


@pytest.mark.asyncio
async def test_hit_cache_for_query_embedding(monkeypatch):
    monkeypatch.setattr(rag, "EMBED_MODEL", "text-embedding-3-small")
    monkeypatch.setattr(rag, "_vectors", [[1.0, 0.0], [0.0, 1.0]])
    monkeypatch.setattr(rag, "_embed_cache", {})
    monkeypatch.setattr(rag, "NOTES", [
        {"topic": "A", "content": "alpha beta", "mistakes": []},
        {"topic": "B", "content": "gamma delta", "mistakes": []},
    ])
    monkeypatch.setattr(rag, "_load_vectors_from_disk", lambda: [[1.0, 0.0], [0.0, 1.0]])

    async def fake_embed(texts):
        assert texts == ["alpha beta"]
        return [[1.0, 0.0]]

    monkeypatch.setattr(rag, "embed", fake_embed)

    results = await rag.retrieve("alpha beta", k=1)

    assert results[0]["topic"] == "A"
    assert rag._embed_cache["alpha beta"] == [1.0, 0.0]
