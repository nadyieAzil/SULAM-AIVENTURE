"""AI MathMentor - Modular FastAPI Backend."""
import json
import logging
import mimetypes
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from backend.auth import User, authenticated_user, rate_limited_user
from backend.config import settings
from backend.llm import LLMError, stream_chat
from backend.prompts import build_system
from backend.rag import retrieve

BASE = Path(__file__).resolve().parent
logger = logging.getLogger(__name__)
FEEDBACK_RECIPIENT = "sulamaiventure@gmail.com"
MAX_FEEDBACK_LENGTH = 5000
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
FEEDBACK_ISSUE_TYPES = {
    "account": "Account",
    "content": "Content",
    "bug_report": "Bug Report",
    "others": "Others",
}

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


def _send_feedback_email(message: EmailMessage) -> None:
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        raise HTTPException(503, "Feedback email is not configured.")

    sender = settings.smtp_from_email or settings.smtp_username
    message["From"] = sender
    message["To"] = FEEDBACK_RECIPIENT

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, context=ssl.create_default_context()
        ) as server:
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)


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


@app.post("/api/feedback")
async def submit_feedback(
    account: str = Form(..., min_length=1, max_length=254),
    description: str = Form(..., min_length=1, max_length=MAX_FEEDBACK_LENGTH),
    issue_type: str = Form(..., min_length=1, max_length=20),
    attachment: UploadFile | None = File(default=None),
    user: User = Depends(authenticated_user),
):
    """Email authenticated user feedback and an optional attachment to the project team."""
    account = account.strip()
    if not account:
        raise HTTPException(422, "Please provide a username or email.")
    description = description.strip()
    if not description:
        raise HTTPException(422, "Please describe the problem.")
    if issue_type not in FEEDBACK_ISSUE_TYPES:
        raise HTTPException(422, "Please select a valid issue type.")

    message = EmailMessage()
    message["Subject"] = "AI MathMentor feedback"
    message.set_content(
        f"Username or email provided: {account}\n"
        f"Signed-in account email: {user.email or 'Not provided'}\n"
        f"Issue type: {FEEDBACK_ISSUE_TYPES.get(issue_type, 'Not specified')}\n"
        f"User ID: {user.id}\n\n"
        f"Problem description:\n{description}"
    )

    if attachment is not None and attachment.filename:
        content = await attachment.read(MAX_ATTACHMENT_BYTES + 1)
        await attachment.close()
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(413, "Attachment must be 5 MB or smaller.")
        filename = Path(attachment.filename.replace("\\", "/")).name
        filename = "".join(char for char in filename if char.isprintable()).strip()
        if not filename:
            filename = "attachment"
        content_type, _ = mimetypes.guess_type(filename)
        maintype, subtype = (content_type or "application/octet-stream").split("/", 1)
        message.add_attachment(
            content, maintype=maintype, subtype=subtype, filename=filename
        )

    try:
        await run_in_threadpool(_send_feedback_email, message)
    except HTTPException:
        raise
    except (OSError, smtplib.SMTPException, ValueError) as error:
        logger.exception("Could not send feedback email")
        raise HTTPException(503, "Feedback could not be sent. Please try again later.") from error
    return {"ok": True}


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
