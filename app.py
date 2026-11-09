"""AI MathMentor - Modular FastAPI Backend."""
import json
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.auth import User, rate_limited_user
from backend.config import settings
from backend.llm import LLMError, stream_chat
from backend.prompts import build_system
from backend.rag import retrieve

BASE = Path(__file__).resolve().parent

app = FastAPI(title="AI MathMentor")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: list[Msg]
    mode: str = "tutor"
    form: int = 1


@app.post("/api/chat")
async def chat(req: ChatReq, user: User = Depends(rate_limited_user)):
    """Streaming chat endpoint following Contract B."""
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    notes = await retrieve(last_user)
    system = build_system(form=req.form, mode=req.mode, notes=notes)
    messages_dicts = [m.model_dump() for m in req.messages][-6:]

    async def gen():
        # 1. Sources first
        yield json.dumps({"sources": [n["topic"] for n in notes]}) + "\n"
        # 2. Stream tokens, 3. Yield error if failure occurs
        try:
            async for tok in stream_chat(system, messages_dicts):
                if tok:
                    yield json.dumps({"token": tok}) + "\n"
        except LLMError as e:
            yield json.dumps({"error": e.user_message}) + "\n"
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.get("/api/health")
async def health():
    """Health check endpoint following Contract B (must not call LLM or DB)."""
    return {"ok": True}


@app.get("/api/config")
async def config():
    """Public client configuration endpoint following Contract B."""
    return {
        "supabaseUrl": settings.supabase_url,
        "supabaseAnonKey": settings.supabase_anon_key,
        "authRequired": settings.auth_required,
    }


# Static files mount and root route
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(BASE / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
