"""AI MathMentor - local backend (FastAPI + Ollama + simple RAG)."""
import json
import math
import re
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).parent
OLLAMA = "http://localhost:11434"
CHAT_MODEL = "qwen2.5:7b"
EMBED_MODEL = "nomic-embed-text"

app = FastAPI(title="AI MathMentor")

# ---------------- RAG ----------------
NOTES = json.loads((BASE / "data" / "notes.json").read_text(encoding="utf-8"))
_vectors: list[list[float]] | None = None


def note_text(n: dict) -> str:
    return f"{n['topic']}. {n['content']} Kesilapan lazim: {' '.join(n['mistakes'])}"


async def embed(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{OLLAMA}/api/embed", json={"model": EMBED_MODEL, "input": texts})
        r.raise_for_status()
        return r.json()["embeddings"]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(y * y for y in b))
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


# ---------------- Prompts ----------------
BASE_RULES = """Anda ialah "Cikgu Owl", tutor Matematik yang mesra untuk pelajar Tingkatan {form} di Malaysia (silibus KSSM).
Peraturan:
- Balas dalam bahasa yang sama dengan pelajar (Bahasa Melayu, English, atau campuran). Gunakan istilah BM dengan istilah English dalam kurungan jika membantu.
- Ayat ringkas, mesra dan memberi semangat. Sesuai untuk umur 13-15 tahun.
- Tulis matematik dalam LaTeX dengan $...$ (inline) atau $$...$$ (blok).
- Jangan reka fakta. Gunakan nota rujukan di bawah jika berkaitan.
"""

MODE_RULES = {
    "tutor": """MOD TUTOR (Sokratik):
- JANGAN beri jawapan akhir terus. Beri SATU petunjuk/langkah kecil sahaja, kemudian tanya soalan untuk pelajar cuba. Jangan tunjukkan hasil langkah itu.
- Pastikan perkataan sepadan dengan matematik (contoh: jika menambah 4, sebut "tambah 4", bukan "tolak 4"). Semak pengiraan anda.
- Jika pelajar meminta "petunjuk seterusnya", beri langkah seterusnya sahaja.
- Hanya beri penyelesaian penuh langkah demi langkah jika pelajar minta "tunjuk jawapan" / "show answer".""",
    "check": """MOD SEMAK JAWAPAN (Pengesan Kesilapan):
- Pelajar memberi jalan kerja. Semak setiap langkah.
- Jika betul: puji dan sahkan.
- Jika salah: nyatakan langkah mana yang salah, namakan kesilapan lazim itu (rujuk senarai kesilapan lazim), terangkan kenapa, dan beri petunjuk untuk membetulkan. Format: **Langkah salah:** ... **Kenapa:** ... **Cuba ini:** ...""",
    "explain": """MOD TERANGKAN KONSEP:
- Terangkan konsep secara ringkas dengan analogi kehidupan seharian, satu contoh mudah langkah demi langkah, dan satu soalan latihan kecil di akhir.""",
}


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: list[Msg]
    mode: str = "tutor"
    form: int = 1


@app.post("/api/chat")
async def chat(req: ChatReq):
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    notes = await retrieve(last_user)
    ref = "\n\n".join(
        f"[{n['topic']}]\n{n['content']}\nKesilapan lazim: " + "; ".join(n["mistakes"]) for n in notes
    )
    system = (
        BASE_RULES.format(form=req.form)
        + "\n" + MODE_RULES.get(req.mode, MODE_RULES["tutor"])
        + "\n\nNOTA RUJUKAN:\n" + ref
    )
    payload = {
        "model": CHAT_MODEL,
        "stream": True,
        "options": {"temperature": 0.3},
        "messages": [{"role": "system", "content": system}]
        + [m.model_dump() for m in req.messages[-12:]],
    }

    async def gen():
        yield json.dumps({"sources": [n["topic"] for n in notes]}) + "\n"
        try:
            async with httpx.AsyncClient(timeout=None) as c:
                async with c.stream("POST", f"{OLLAMA}/api/chat", json=payload) as r:
                    async for line in r.aiter_lines():
                        if line:
                            d = json.loads(line)
                            if "error" in d:
                                yield json.dumps({"error": d["error"]}) + "\n"
                            tok = d.get("message", {}).get("content", "")
                            if tok:
                                yield json.dumps({"token": tok}) + "\n"
        except httpx.ConnectError:
            yield json.dumps({"error": "Ollama tidak berjalan. Sila buka aplikasi Ollama."}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.get("/api/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            tags = (await c.get(f"{OLLAMA}/api/tags")).json()
        names = [m["name"] for m in tags.get("models", [])]
        return {"ollama": True, "model_ready": any(n.startswith(CHAT_MODEL) for n in names)}
    except Exception:
        return {"ollama": False, "model_ready": False}


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(BASE / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
