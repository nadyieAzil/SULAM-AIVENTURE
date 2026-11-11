# AI MathMentor – Pembantu Matematik Pintar 🦉

[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Postgres-3ECF8E.svg)](https://supabase.com/)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPL--2.0-yellow.svg)](LICENSE)

An online, free, AI-powered mathematics tutoring platform designed for Malaysian Form 1–3 secondary students under the **KSSM syllabus**. Built as a University Service Learning Community Engagement (**SULAM**) project.

---

## 🌟 Key Features

| Feature | How It Works |
| :--- | :--- |
| **🦉 Cikgu Owl (Tutor Chat)** | Socratic AI tutor that gives step-by-step hints and questions instead of directly handing out answers. |
| **🔍 Pengesan Kesilapan** | Analyzes student working, flags common KSSM calculation errors, explains the underlying rule, and suggests corrections. |
| **🎯 Latihan Adaptif** | 10 Form 1–3 KSSM topics with dynamic question generation and automatic 3-level mastery tracking. |
| **☁️ Cloud Sync & Auth** | Student authentication and cross-device learning state synchronization via Supabase PostgreSQL. |
| **🇲🇾 Bilingual Interface** | Native toggle between Bahasa Melayu and English, complete with LaTeX mathematical rendering via KaTeX. |

---

## 🏗️ Architecture

```
Browser (Mobile & Desktop Web UI + KaTeX + Supabase SDK)
   │
   ├─ 1. Sign up / Login ───────────────► Supabase Auth (ES256 JWKS)
   ├─ 2. Cross-Device Sync ─────────────► Supabase Postgres (RLS: own profile)
   └─ 3. POST /api/chat + Bearer token
         ▼
FastAPI Cloud Web Service (Render / Uvicorn)
   ├─ backend/auth.py     -> Validates Supabase JWT & applies per-user rate limiting
   ├─ backend/rag.py      -> Semantic search over data/notes.json syllabus notes
   ├─ backend/prompts.py  -> Dynamic Socratic pedagogical prompts
   └─ backend/llm.py      -> Streams tokens from hosted OpenAI-compatible LLM
```

---

## 👥 Team Roles & Ownership

This project was built following the modular architecture in `TEAMPLAN.md`:

| Role | Name | Responsibilities | Files Owned |
| :--- | :--- | :--- | :--- |
| **M1** | Database & Auth | Supabase Postgres, RLS policies, JWT verification, Rate limiting | `backend/auth.py`, `supabase/schema.sql`, `docs/SUPABASE.md` |
| **M2** | LLM & RAG | Hosted OpenAI-compatible API, syllabus note embeddings, prompt engineering | `backend/llm.py`, `backend/rag.py`, `backend/prompts.py`, `data/notes_embeddings.json` |
| **M3** | Frontend & UX | Landing page, mandatory login flow, cloud progress sync, mobile responsiveness | `static/` (HTML, CSS, `auth.js`, `sync.js`, `app.js`, `i18n.js`) |
| **M4** | DevOps & QA | Architecture skeleton, deployment (`render.yaml`, `Dockerfile`), smoke tests, docs | `app.py`, `backend/config.py`, `render.yaml`, `Dockerfile`, `scripts/smoke.py`, `docs/` |

---

## 🚀 How to Run Locally

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/nadyieAzil/SULAM-AIVENTURE.git
cd SULAM-AIVENTURE

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and insert your credentials:
```bash
cp .env.example .env
```

| Variable | Description |
| :--- | :--- |
| `LLM_BASE_URL` | OpenAI-compatible endpoint (e.g. OpenRouter / Google Gemini API) |
| `LLM_API_KEY` | Secret API key for the AI model |
| `LLM_MODEL` | Target chat model (e.g. `liquid/lfm-2.5-2.6b:free` or `gemini-1.5-flash`) |
| `SUPABASE_URL` | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public client publishable/anon key |
| `SUPABASE_JWKS_URL` | JWKS endpoint (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`) |
| `AUTH_REQUIRED` | Set `true` in production; `false` allows guest requests in local dev |

### 3. Start the Server
```bash
python app.py
```
Or with auto-reload:
```bash
uvicorn app:app --reload --port 8000
```
Open **http://127.0.0.1:8000** in your browser.

---

## 🧪 Automated Testing & Verification

Run the full pytest suite:
```bash
pytest -v tests/
```

Run the smoke test CLI against any running instance:
```bash
# Local:
python scripts/smoke.py http://127.0.0.1:8000

# Live Cloud Deployment:
python scripts/smoke.py https://<your-app>.onrender.com
```

---

## 🌐 Cloud Deployment (Render Free Web Service)

1. Connect your GitHub repository to [Render.com](https://render.com).
2. Create a new **Web Service** with runtime `Python` using `uvicorn app:app --host 0.0.0.0 --port $PORT`.
3. Input the environment variables from your `.env` into the Render Dashboard.
4. Detailed step-by-step instructions and rollback procedures are available in [docs/DEPLOY.md](docs/DEPLOY.md).

---

## ⚠️ Known Free-Tier Limitations

- **Render Cold Starts**: On the free tier, the web service spins down after 15 minutes of inactivity. First requests after sleeping can take 30–50 seconds. Use an UptimeRobot monitor on `/api/health` to keep it warm during active demo sessions.
- **Supabase Inactivity Pause**: Free Supabase projects pause after 7 consecutive days of zero traffic. Follow [scripts/keepalive.md](scripts/keepalive.md) to set up an automated ping.
- **AI Rate Limits**: The backend automatically enforces sliding-window limits (default: 8 requests/min, 120 requests/day per student) to protect free-tier API quotas.

---

## 📄 Privacy & Data Governance

Student and parent data privacy is handled in compliance with Malaysia's **Personal Data Protection Act (PDPA) 2010**. See [docs/PRIVACY.md](docs/PRIVACY.md) for full terms and data deletion instructions.
