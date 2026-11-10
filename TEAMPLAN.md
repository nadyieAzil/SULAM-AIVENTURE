# TEAMPLAN: Take AI MathMentor online (free), split across 4 people

> **How to use this file.** Each team member opens their AI assistant (Claude Code, etc.) in this project folder and says:
> *"Read TEAMPLAN.md. I am M1 (or M2, M3, M4). Read Part 0 and my own part, then execute it step by step. Stop and ask me whenever a step is marked HUMAN."*
>
> Everyone reads **Part 0** (shared rules and contracts). Then each person reads **only their own part** (Part 1 to 4). Part 5 is the merge order and the final integration test.

---

# PART 0: SHARED RULES AND CONTRACTS (everyone reads this)

## 0.1 Instructions to the AI assistant (mandatory)
1. Do only the tasks in the part belonging to the person you are helping. Do not do other members' tasks.
2. **Only edit files your part owns** (see the ownership table). If you need a change in another member's file, write it in your handoff note. Do not edit the file yourself.
3. Tasks are tagged **[AI]** (you do them) or **[HUMAN]** (needs a browser, an account, a dashboard or a secret, so ask the person to do it and wait for the result).
4. **Never commit or print secrets** (API keys, DB password, service_role key, JWT secret). Real values go only in a local `.env` (git-ignored) and in the hosting provider's environment settings. Only `.env.example` with fake placeholders is committed.
5. Work on your own branch (`m1/auth`, `m2/llm`, `m3/frontend`, `m4/deploy`). Never push straight to `main`. Open a PR when your acceptance checklist passes.
6. Run your acceptance tests before saying you are done. Report real results. If something fails, say so.
7. Do not change a contract in Part 0 on your own. If one is wrong, tell the human so the team can update this file.
8. Finish with a **Handoff Note** (template in 0.8).

## 0.2 What the project is
- **Stack today:** FastAPI backend (`app.py`) + static frontend (`static/`). The tutor chat calls a local Ollama model (`qwen2.5:7b`) and a simple RAG over `data/notes.json`. Progress is stored in the browser (`localStorage` key `mathmentor`).
- **Goal:** make it fully online and free:
  - LLM: a free hosted LLM API (OpenAI-compatible) instead of local Ollama.
  - Database and login: Supabase (free tier).
  - Hosting: Render free web service (FastAPI serves the static files too).
- Users are Malaysian students aged 13 to 15 (Form 1 to 3, KSSM). The interface and answers are in Bahasa Melayu and English.

## 0.3 Target architecture
```
Browser (static/ + supabase-js)
   |  1. login/signup  ───────────────►  Supabase Auth
   |  2. load/save progress (profiles) ─►  Supabase Postgres (RLS: own row only)
   |  3. POST /api/chat  + Bearer token
   ▼
FastAPI on Render (app.py)
   ├─ backend/auth.py    verify Supabase JWT, per-user rate limit
   ├─ backend/rag.py     pick relevant notes
   ├─ backend/prompts.py build system prompt
   └─ backend/llm.py     stream from hosted LLM (OpenAI-compatible API)
```

## 0.4 File ownership (the main rule that avoids merge conflicts)

| Owner | Files they create or edit | Nobody else touches |
|---|---|---|
| **M1** (DB and Auth) | `backend/auth.py`, `supabase/schema.sql`, `docs/SUPABASE.md`, `scripts/keepalive.md` | yes |
| **M2** (LLM and RAG) | `backend/llm.py`, `backend/rag.py`, `backend/prompts.py`, `data/notes.json`, `data/notes_embeddings.json`, `scripts/build_embeddings.py`, `docs/LLM.md` | yes |
| **M3** (Frontend) | everything in `static/` (except `static/vendor/katex`), including new `static/js/auth.js`, `static/js/sync.js`, `static/vendor/supabase/` | yes |
| **M4** (DevOps and QA) | `app.py`, `backend/config.py`, `backend/__init__.py`, `requirements.txt`, `.env.example`, `.gitignore`, `render.yaml`, `Dockerfile`, `README.md`, `start.bat`, `tests/`, `scripts/smoke.py`, `docs/DEPLOY.md`, `docs/PRIVACY.md` | yes |

## 0.5 Contracts (do not change without team agreement)

### A. Environment variables (names are fixed)
| Name | Used by | Meaning |
|---|---|---|
| `LLM_BASE_URL` | M2 | OpenAI-compatible base URL, e.g. `https://generativelanguage.googleapis.com/v1beta/openai` (Gemini), `https://api.groq.com/openai/v1` (Groq), `https://openrouter.ai/api/v1` (OpenRouter) |
| `LLM_API_KEY` | M2 | secret key for that provider |
| `LLM_MODEL` | M2 | chat model name (check the provider's current model list) |
| `EMBED_MODEL` | M2 | embedding model name; leave empty to use keyword search only |
| `SUPABASE_URL` | M1, M3, M4 | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | M3, M4 | public anon/publishable key (safe for the browser) |
| `SUPABASE_JWKS_URL` | M1 | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` (new projects: asymmetric keys) |
| `SUPABASE_JWT_SECRET` | M1 | only if the project still uses the legacy HS256 secret; optional |
| `AUTH_REQUIRED` | M1, M4 | `true` or `false`. When `false`, the backend accepts requests with no token (dev mode) |
| `RATE_LIMIT_PER_MIN` | M1 | default `8` |
| `RATE_LIMIT_PER_DAY` | M1 | default `120` |
| `ALLOWED_ORIGINS` | M4 | comma-separated list, e.g. `http://127.0.0.1:8000,https://<app>.onrender.com` |

### B. HTTP API
- `POST /api/chat`
  - Header: `Authorization: Bearer <supabase access_token>` (not needed when `AUTH_REQUIRED=false`)
  - Body (unchanged): `{ "messages":[{"role":"user|assistant","content":"..."}], "mode":"tutor|check|explain", "form":1 }`
  - Response: `application/x-ndjson`, one JSON per line, in this order:
    1. `{"sources":["Topic A","Topic B"]}`
    2. many `{"token":"..."}`
    3. on failure: `{"error":"<message safe to show a student>"}`
  - Errors before streaming: `401` (bad or missing token), `429` (rate limit). Body: `{"detail":"<message>"}`.
- `GET /api/health` returns `{"ok": true}`. It must not call the LLM or the database.
- `GET /api/config` returns `{"supabaseUrl":"...","supabaseAnonKey":"...","authRequired":true|false}`. Public values only.

### C. Python module contracts (so M1, M2 and M4 can code independently)
```python
# backend/auth.py   (owner M1)
from dataclasses import dataclass
@dataclass
class User:
    id: str                 # Supabase user uuid, or "anonymous" when AUTH_REQUIRED=false
    email: str | None = None
async def rate_limited_user(request) -> User:
    """FastAPI dependency. Verifies the Bearer token (401 if invalid), applies per-user
    rate limit (429 if exceeded), returns User. If AUTH_REQUIRED=false returns User("anonymous")
    and still applies the limit keyed by client IP."""

# backend/llm.py    (owner M2)
class LLMError(Exception):
    def __init__(self, user_message: str): ...    # user_message is safe to show students (BM)
async def stream_chat(system: str, messages: list[dict]):
    """Async generator yielding text tokens (str). Raises LLMError on any provider failure."""

# backend/rag.py    (owner M2)
async def retrieve(query: str, k: int = 2) -> list[dict]:
    """Return up to k note dicts from data/notes.json (keys: topic, content, mistakes ...)."""

# backend/prompts.py (owner M2)
def build_system(form: int, mode: str, notes: list[dict]) -> str: ...

# backend/config.py (owner M4)
from dataclasses import dataclass
@dataclass(frozen=True)
class Settings:   # every env var in table A, read once from os.environ (+ .env via python-dotenv)
    ...
settings: Settings
```

### D. Database contract (owner M1; consumed by M3)
```
table public.profiles
  id          uuid  primary key  -> references auth.users(id)
  state       jsonb not null default '{}'
  updated_at  timestamptz not null default now()
RLS: a signed-in user can select/insert/update only the row where id = auth.uid().
A trigger creates an empty row when a user signs up.
```
`state` is the browser's `S` object from `static/js/app.js`:
`{ v:1, name, form, lang, theme, xp, correct, streak, lastDay, topics:{<topicId>:{level,streak,wrong,correct,total,mastered}}, badges:[] }`

### E. Login method (decision, do not change)
- Students sign in with **email + password**. Optionally the UI also offers **username + password**. In that case M3 turns the username into the pseudo-email `<username>@mathmentor.student` before calling Supabase.
- **M1 must verify on Day 1** that Supabase accepts that pseudo-email domain (with "Confirm email" off). If it doesn't, M1 tells the team and the team picks another domain, then updates this section.
- **Login is mandatory** (team decision, 2026-11-09; replaces the earlier guest rule). There is no guest access: the app shows a landing/login page until the student is signed in, and Home, Chat, Practice, Progress and Settings all require login. Logging out, an expired session (`401`) or Supabase being unavailable return the student to the landing page.
- The frontend gate is for usability only, not security. The server must still enforce login for chat with `AUTH_REQUIRED=true` in production.

## 0.6 Git workflow
- M4 does `git init`, creates the GitHub repo and pushes the baseline (see Part 4, task 1).
- Everyone else clones and branches from `main`. Open small PRs, with one review from a different member. Rebase on `main` before opening.
- Commit messages: `m2: switch chat to hosted LLM`, `m1: add JWT verification`, etc.

## 0.7 Dependency map (why the merge order matters)
```
M4 skeleton (Step 1) ──► M2 LLM (Step 2) ──► M1 auth (Step 3) ──► M3 frontend (Step 4) ──► M4 deploy+E2E (Step 5)
```
Coding can happen in parallel once the skeleton exists. Only the **merge** order is sequential. Details in Part 5.

## 0.8 Handoff Note template (put it in the PR description)
```
Member: Mx    Branch: mx/...
Done:  - <task> ...
Not done / known issues: ...
Files changed: ...
New env vars or secrets the team must set: ...
How to test (exact commands): ...
What the next person needs from me: ...
```

---

# PART 1: M1, DATABASE AND AUTH (Supabase)

**Goal:** a live Supabase project with login and a secured `profiles` table, a backend that accepts only valid logins and limits abuse, and a project that doesn't go to sleep.
**You deliver to others:** Project URL and anon key (to M3 and M4 by **Day 2**), `backend/auth.py` (to the backend), and `supabase/schema.sql`.

## Tasks

### 1.1 Create the project [HUMAN]
1. supabase.com → sign in (GitHub/email) → **New project**.
2. Name `ai-mathmentor`, **region Southeast Asia (Singapore)**, plan **Free**, generate and save the DB password in a password manager (never in the repo).
3. Wait until the project is ready.

### 1.2 Write and run the schema [AI writes, HUMAN runs]
[AI] Create `supabase/schema.sql` with exactly this:
```sql
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own"   on public.profiles;
drop policy if exists "insert own" on public.profiles;
drop policy if exists "update own" on public.profiles;
create policy "read own"   on public.profiles for select using (auth.uid() = id);
create policy "insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```
[HUMAN] Supabase dashboard → **SQL Editor → New query** → paste → **Run**. Confirm `profiles` shows "RLS enabled" in Table Editor.

### 1.3 Configure Auth [HUMAN]
- **Authentication → Providers → Email**: enabled. For development turn **Confirm email OFF** (turn it ON before the real launch if students have real emails).
- **Authentication → URL Configuration**: Site URL `http://127.0.0.1:8000` for now. Add redirect URLs for local and later the Render URL (M4 gives it to you).
- **Test the pseudo-email** (contract E): create a user `testuser@mathmentor.student` with a password. If Supabase rejects the domain, report it to the team on Day 1.

### 1.4 Collect keys and share safely [HUMAN]
Project Settings → API. Record: Project URL, anon/publishable key, and the JWT settings (JWKS URL `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`; if the project shows a legacy JWT secret, note it). Send **URL + anon key** to M3 and M4 (these are public-safe). Give the JWKS URL to M4 for the host's env settings. **Never** share or use the `service_role` key.

### 1.5 Implement `backend/auth.py` [AI]
Requirements:
- Dependencies to add to `requirements.txt` (tell M4, who owns that file): `PyJWT[crypto]`.
- Read settings from `backend.config.settings` (M4's file). Until M4 merges the skeleton, read `os.environ` directly behind a tiny helper, then switch to `settings` after the skeleton lands.
- `rate_limited_user(request)` implements contract C:
  1. If `AUTH_REQUIRED` is false and there is no `Authorization` header → `User("anonymous")`, rate-limit key = client IP.
  2. Otherwise read `Authorization: Bearer <jwt>`. Missing/invalid → `HTTPException(401, "Sila log masuk semula.")`.
  3. Verify with `jwt.PyJWKClient(SUPABASE_JWKS_URL)` (cache the client at module level) for RS256/ES256 tokens; if only `SUPABASE_JWT_SECRET` is set, verify HS256 with that secret. Require `audience="authenticated"` and check `exp`.
  4. `User(id=payload["sub"], email=payload.get("email"))`.
  5. Rate limit in memory (dict of deques of timestamps, per user id): `RATE_LIMIT_PER_MIN` and `RATE_LIMIT_PER_DAY`. Exceeded → `HTTPException(429, "Terlalu banyak soalan. Cuba lagi sebentar ya.")`. Include a lock or keep it single-threaded async-safe, and prune old entries.
- Never log tokens.

### 1.6 Unit tests [AI]
Create `tests/test_auth.py` (M4 owns `tests/`, so tell M4 or put the file there and note it in the handoff). Cover: no header with `AUTH_REQUIRED=true` → 401; garbage token → 401; expired token → 401; valid token (generate a test HS256 token with a test secret) → user id returned; 9th request in a minute → 429.

### 1.7 Keep-alive [HUMAN + AI]
Free projects pause after about 7 days of inactivity. [AI] write `scripts/keepalive.md` explaining the options. [HUMAN] set up one:
- UptimeRobot (free) HTTP monitor on the deployed site's `/api/health` every 5 minutes. This keeps Render awake but not necessarily Supabase, so **also** add a monitor on `https://<ref>.supabase.co/auth/v1/health` (needs the `apikey` header; if UptimeRobot can't send it, use a free GitHub Actions cron that calls the Supabase REST endpoint daily).
- Put a reminder in the team calendar to open the dashboard the day before the demo.

### 1.8 Write `docs/SUPABASE.md` [AI]
Plain steps for recreating the project from scratch, where each key goes, how to test with curl, and what to do if the project is paused.

## Acceptance checklist (M1 is done when all true)
- [ ] `profiles` exists with RLS on, and the 3 policies exist.
- [ ] Creating a user in the dashboard auto-creates a `profiles` row.
- [ ] With two test users, user A cannot read or write user B's row (test in SQL editor using `set request.jwt.claims`, or via REST with each user's token).
- [ ] `pytest tests/test_auth.py` passes.
- [ ] Manual test: get a real access token (sign in via the Supabase REST `/auth/v1/token?grant_type=password`) and call `POST /api/chat` with it → not 401. Without it and `AUTH_REQUIRED=true` → 401.
- [ ] URL + anon key delivered to M3 and M4. JWKS URL delivered to M4.
- [ ] Keep-alive configured.

## Handoff
To **M3**: URL, anon key, pseudo-email result, and exact auth error messages. To **M4**: env var values for the host, `PyJWT[crypto]` for `requirements.txt`.

---

# PART 2: M2, LLM AND RAG (hosted model)

**Goal:** chat works with no Ollama and no local GPU, using a free hosted LLM, with the same streaming format, better error handling, and RAG that doesn't need a local embedding model.
**You deliver:** `backend/llm.py`, `backend/rag.py`, `backend/prompts.py`, `data/notes_embeddings.json`, `scripts/build_embeddings.py`.

## Tasks

### 2.1 Choose the provider [HUMAN decides, AI helps compare]
Recommended: **Google Gemini API** (free tier, good Malay, free embeddings). Alternatives: Groq, OpenRouter (free models). All three speak the OpenAI-compatible protocol, so the code is identical; only the three env vars change.
[HUMAN] Create an API key in the provider's console. Put it in a local `.env` as `LLM_API_KEY` (git-ignored). Check the provider's current free-tier limits and model names, and set `LLM_MODEL` accordingly.

### 2.2 Wait for or pull the skeleton
Pull M4's skeleton (Part 4, task 2). Until then you can start by developing `backend/llm.py` standalone with a tiny test script.

### 2.3 Implement `backend/llm.py` [AI]
- Use `httpx` (already in requirements). Don't add the `openai` SDK.
- `stream_chat(system, messages)`:
  - `POST {LLM_BASE_URL}/chat/completions` with headers `Authorization: Bearer {LLM_API_KEY}` and JSON `{"model": LLM_MODEL, "stream": true, "temperature": 0.3, "messages": [{"role":"system","content":system}, *messages]}`.
  - Parse Server-Sent Events: lines starting with `data: `; stop at `data: [DONE]`; yield `choices[0].delta.content` when non-empty.
  - Timeouts: connect 10 s, read 60 s.
  - Map failures to `LLMError` with student-safe Malay messages:
    - HTTP 429 → "Cikgu Owl sedang sibuk. Cuba lagi sebentar ya."
    - 401/403 → "Konfigurasi AI tidak betul. Sila hubungi guru." (and log details server-side, without the key)
    - 5xx / timeout / connection error → "Cikgu Owl tidak dapat dihubungi sekarang. Cuba lagi nanti."
  - If a stream breaks midway, raise `LLMError` after the partial tokens (the caller already sent them).
  - Never log the API key or the full prompt.
- Retry once with a short delay on a 5xx before the first token only.

### 2.4 Implement `backend/prompts.py` [AI]
Move `BASE_RULES` and `MODE_RULES` from the old `app.py` here unchanged, then add `build_system(form, mode, notes)` that returns exactly what the old `chat()` built (rules + mode rules + "NOTA RUJUKAN"). Behavior must be identical before you tune anything.

### 2.5 Implement `backend/rag.py` [AI]
- `retrieve(query, k=2)` keeps the keyword fallback from the old code.
- Embeddings: do **not** call an embedding model for every note at startup. Instead:
  1. `scripts/build_embeddings.py`: reads `data/notes.json`, calls `POST {LLM_BASE_URL}/embeddings` with `EMBED_MODEL`, writes `data/notes_embeddings.json` (list of vectors in the same order, plus a hash of each note text so stale vectors can be detected).
  2. At runtime, load the vectors from the file. Embed only the **query** (one small API call). If `EMBED_MODEL` is empty, the call fails, or vectors are stale/missing → use keyword search.
- Add a short in-memory cache (dict, max ~200 entries) for query embeddings.
- Keep `retrieve` returning note dicts.

### 2.6 Quality testing [AI + HUMAN]
Create `docs/LLM.md` with a test table of at least 15 prompts: 5 in BM, 5 in English, 5 mixed, spread across the three modes (tutor, check, explain) and the 10 topics. Record for each: correct maths? hint-only in tutor mode? language matches the student? LaTeX renders? [HUMAN] reviews the answers (ideally a maths teacher or classmate). Adjust prompts if tutor mode reveals final answers, or if the model switches language. Keep the prompt changes in `prompts.py` and list them in `docs/LLM.md`.

### 2.7 Tests [AI]
Create `tests/test_llm.py` and `tests/test_rag.py` (tell M4; M4 owns `tests/`). Mock `httpx` so tests need no network: SSE parsing, `[DONE]`, 429 → `LLMError`, keyword fallback when no embeddings.

## Acceptance checklist
- [ ] With `.env` filled and **Ollama not running**, run `uvicorn app:app` and send a chat request. Tokens stream and the first line is `{"sources":[...]}`.
- [ ] A wrong API key shows a clean `{"error": ...}` line in Malay. The app does not crash.
- [ ] `python scripts/build_embeddings.py` produces `data/notes_embeddings.json`, and retrieval works with and without it.
- [ ] `docs/LLM.md` has ≥ 15 tested prompts and notes on quality.
- [ ] No secrets in the repo (`git grep -i "api_key"` shows only variable names).
- [ ] Measured: time to first token, and notes on the provider's rate limits.

## Handoff
To **M4**: final env var values and the provider's quota limits (so M1/M4 can set sensible rate limits). To **M1**: suggested `RATE_LIMIT_PER_MIN/DAY` based on provider limits.

---

# PART 3: M3, FRONTEND (login, cloud sync, chat integration)

**Goal:** students can sign up, log in and log out; their progress follows them across devices; chat sends the login token; signed-in students can keep practising offline. No guest access (contract E).
**You deliver:** `static/js/auth.js`, `static/js/sync.js`, login UI in `static/index.html` and `static/css/style.css`, small edits in `static/js/app.js`, `i18n.js`, local copy of supabase-js.

## Tasks

### 3.1 Get the Supabase browser library [AI]
Download a pinned version of `@supabase/supabase-js` UMD build (for example `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js`, any version older than 2 weeks) into `static/vendor/supabase/supabase.js`, and load it with a `<script>` tag before your own scripts. (The project already vendors KaTeX locally; follow that convention.)

### 3.2 Public config [AI]
At startup `fetch("/api/config")` → `{supabaseUrl, supabaseAnonKey, authRequired}` and create the client: `const sb = supabase.createClient(supabaseUrl, supabaseAnonKey)`. Never hard-code keys. If `/api/config` fails or returns empty values, keep the landing page up with a clear "login unavailable" message and the form disabled. Never open the app without a session.

### 3.3 Login UI + `static/js/auth.js` [AI]
- A full landing page (BM + English, via `i18n.js`) shown until the student is signed in: a short introduction to the app and a login card with tabs **Log masuk / Daftar**, fields email (or username) and password, and clear error messages (wrong password, weak password min 6, network error). No guest button. Mobile-first, keyboard accessible, labels on inputs, visible focus.
- Username mode (contract E): if the input has no `@`, convert to `<username>@mathmentor.student` (lowercase, trimmed, allow `a-z0-9._-`).
- API: `sb.auth.signUp({email,password})`, `sb.auth.signInWithPassword(...)`, `sb.auth.signOut()`, `sb.auth.onAuthStateChange(...)`, `sb.auth.getSession()`.
- Add a logout button and show the user's name/email in Settings.
- Expose `window.Auth = { getToken(): Promise<string|null>, user(): object|null, signOut() }`.
- Add the privacy line from `docs/PRIVACY.md` (M4 writes it) to the sign-up form. Until it exists, use a placeholder string in `i18n.js` and replace it later.

### 3.4 Cloud sync + `static/js/sync.js` [AI]
- **Load on login:** `sb.from("profiles").select("state, updated_at").eq("id", user.id).single()`.
- **Merge rules** (implement exactly):
  1. Cloud `state` empty `{}` and local has progress (`xp>0`) → upload local (progress saved on the device before the first login becomes the account's).
  2. Cloud has data and local is default/empty → take cloud.
  3. Both have data → keep the one with higher `xp`; ask via `confirm()` with a clear BM/English message showing both XP values.
- **Save:** wrap the existing `save()` in `app.js`. After writing `localStorage`, schedule a debounced (2 s) `sb.from("profiles").upsert({ id: user.id, state: S, updated_at: new Date().toISOString() })`. Also flush on `visibilitychange` (hidden) and `beforeunload` where possible.
- Add `v: 1` to `DEFAULT` in `app.js`.
- Offline/failed save: keep `localStorage` as the source of truth, set a "needs sync" flag, retry on the next save and on the `online` event. Never lose local data.
- "Reset progress": also overwrites the cloud state, with the existing confirm dialog.
- Show a small sync status indicator (saved / syncing / offline).

### 3.5 Chat integration [AI]
In `app.js` where `fetch("/api/chat", ...)` is called: add `headers: {"Content-Type":"application/json", ...(token ? {Authorization:"Bearer "+token} : {})}` with `token = await Auth.getToken()`. Handle:
- `401` → show "Sila log masuk untuk bertanya kepada Cikgu Owl" and open the login card; do not show a raw error.
- `429` → show the `detail` message from the response.
- Stream `{"error": ...}` lines → show in the chat bubble (already supported; keep it).
- Remove or replace the Ollama-specific wording ("buka aplikasi Ollama") in `i18n.js` / `app.js` if present. Search for "Ollama" in `static/`.

### 3.6 Mandatory login [AI]
Follow contract E: no guest access. Until a session exists, only the landing page is visible. Logout, an expired session (`401` from `/api/chat`) and an unavailable Supabase all return to the landing page. On logout, clear the previous student's progress from the device (keep unsynced progress stored for that student) so a shared school computer does not leak one student's data to the next.

### 3.7 Testing [AI + HUMAN]
Work against M1's real Supabase project (with `AUTH_REQUIRED=false` locally first, then `true`). [HUMAN] test on a real phone (Chrome Android / Safari iOS) and one desktop browser. Check: landing page blocks access when logged out, sign-up, log-in, log-out, refresh keeps session, progress appears on a second device, offline mode, existing device progress merges on first login.

## Acceptance checklist
- [ ] Sign up → a new row appears in `profiles` (check in the Supabase Table Editor).
- [ ] Do 3 practice questions → `state.xp` and `state.topics` update in the table within ~3 s.
- [ ] Log in on another browser → same progress.
- [ ] Logged out, only the landing page is reachable (no guest access).
- [ ] Progress already on the device merges on first login as per 3.4 rules, with no data loss.
- [ ] Log out, then log in as a different student on the same browser: the second student does not see the first student's progress.
- [ ] Turn off the network → app still works; after turning on, data syncs.
- [ ] Chat works logged in; an expired or invalid session (`401`) returns the student to the landing page.
- [ ] No secrets or hard-coded keys in `static/`. The anon key arrives only via `/api/config`.
- [ ] Works at 360 px width; BM and English both complete; light and dark theme OK; no console errors.

## Handoff
To **M4**: list of manual test steps for the E2E checklist and a note about any new files in `static/`. To **M1**: any auth error cases you saw that need better messages.

---

# PART 4: M4, DEVOPS, INTEGRATION AND QA

**Goal:** a clean repo and refactored skeleton on Day 1, then a free live deployment, tests, documentation and the final release.
**You deliver:** repo + skeleton (Step 1), deployment config, tests, docs, final E2E (Step 5).

## Tasks

### 4.1 Repo baseline [AI + HUMAN] (first, same day)
1. [AI] Create `.gitignore` (at least: `.env`, `__pycache__/`, `*.pyc`, `.venv/`, `.pytest_cache/`, `node_modules/`) and `.env.example` with every variable from contract A and **fake placeholder values** (for example `LLM_API_KEY=put-your-key-here`).
2. [AI] `git init`, commit the current working project as the baseline (before any refactor), on branch `main`.
3. [HUMAN] Create a **private** GitHub repo, add the other 3 as collaborators, push `main`. (Make it public only if the team agrees and there are no secrets in history.)
4. [HUMAN] Protect `main` (Settings → Branches): require a PR before merging.
5. [AI] Tell the team to clone and branch (Part 0.6).

### 4.2 Skeleton refactor, **Step 1** (pure refactor, behavior unchanged) [AI]
Goal: split `app.py` into the modules in contract C **without changing behavior**, so the others can replace internals independently.
1. Create `backend/__init__.py` (empty).
2. `backend/config.py`: `Settings` dataclass reading all variables in contract A (with defaults: `AUTH_REQUIRED=false`, `RATE_LIMIT_PER_MIN=8`, `RATE_LIMIT_PER_DAY=120`, `ALLOWED_ORIGINS=http://127.0.0.1:8000`). Load `.env` with `python-dotenv` if installed.
3. `backend/prompts.py`: move `BASE_RULES`, `MODE_RULES`; add `build_system(form, mode, notes)` returning the exact string the old `chat()` built.
4. `backend/rag.py`: move `NOTES`, `note_text`, `embed`, `cosine`, `keyword_score`, `retrieve` as they are now (still Ollama-based; M2 replaces them).
5. `backend/llm.py`: define `LLMError` and `stream_chat(system, messages)` containing the current Ollama streaming code (yield tokens; on `httpx.ConnectError` raise `LLMError("Ollama tidak berjalan. Sila buka aplikasi Ollama.")`).
6. `backend/auth.py`: stub: `User` dataclass and `async def rate_limited_user(request)` that simply returns `User("anonymous")`. (M1 replaces it.)
7. `app.py` becomes the thin router:
   - `POST /api/chat` with `user: User = Depends(rate_limited_user)`; it calls `retrieve` → `build_system` → `stream_chat`, writes the NDJSON lines in the contract B order, and converts `LLMError` into `{"error": e.user_message}`.
   - `GET /api/health` → `{"ok": true}` (no Ollama check).
   - `GET /api/config` → public values from `settings`.
   - Keep static mount and `/` route.
   - Add `CORSMiddleware` using `ALLOWED_ORIGINS`.
   - Keep the `if __name__ == "__main__"` runner (host `127.0.0.1`, port 8000) for local use.
8. `requirements.txt`: pin versions of `fastapi`, `uvicorn[standard]`, `httpx`, `python-dotenv`, `PyJWT[crypto]`, plus `pytest` in a `requirements-dev.txt`.
9. Update `start.bat` for dev (create venv, install, run). Keep Ollama steps only as an optional note.
10. **Verify**: with Ollama running, the app behaves exactly as before (chat streams, sources show). Run `GET /api/health` and `GET /api/config`.
11. Commit, PR, merge to `main` quickly (**Step 1**). Tell everyone to rebase.

### 4.3 Deployment config [AI + HUMAN]
Primary target: **Render free web service**.
- [AI] `render.yaml` (or document manual settings in `docs/DEPLOY.md`):
  - Runtime Python, build `pip install -r requirements.txt`, start `uvicorn app:app --host 0.0.0.0 --port $PORT`, health check path `/api/health`.
  - List every env var as `sync: false` (secrets entered in the dashboard).
- [AI] Optional `Dockerfile` (python slim, port from `$PORT`, 7860 default for Hugging Face Spaces) as a backup host.
- [HUMAN] Render: New → Web Service → connect the GitHub repo → fill env vars (values from M1: Supabase URL/anon key/JWKS; from M2: LLM vars; `AUTH_REQUIRED=false` at first) → deploy. Note the URL `https://<name>.onrender.com`.
- [HUMAN] Give that URL to M1 (Supabase Site URL + redirect URLs). Add it to `ALLOWED_ORIGINS`.
- [HUMAN] UptimeRobot monitor on `/api/health` every 5 minutes (Render's free instance sleeps after ~15 minutes idle; first load after sleep can take 30 to 60 s, so mention this in the README).

### 4.4 Tests and smoke script [AI]
- `tests/test_api.py`: health returns ok; config has the 3 keys; chat with a mocked `stream_chat` streams the contract B lines in the right order; `LLMError` becomes an error line.
- `scripts/smoke.py <BASE_URL> [TOKEN]`: calls `/api/health`, `/api/config`, and `/api/chat` (with token if given) and prints PASS/FAIL per step, exiting non-zero on any failure.
- Collect the tests from M1 and M2 into `tests/` and make `pytest` pass on `main`.

### 4.5 Privacy and docs [AI + HUMAN]
- `docs/PRIVACY.md`: a short plain-language notice (BM + English) for students and parents: what is stored (name, progress, email), why, who can see it, that chat messages are sent to an external AI provider, how to delete the account/data, and that the app is for educational use. Note Malaysia's PDPA. [HUMAN] has the supervisor/lecturer review it. (Not legal advice.)
- `README.md` rewrite: what it is, live URL, how to run locally (venv, `.env`, `uvicorn`), env var table, architecture diagram, team and who owns what, known free-tier limitations (cold start, Supabase pause, LLM quota), how to deploy.
- `docs/DEPLOY.md`: exact deployment steps, rollback steps, and a "demo-day checklist".

### 4.6 Final integration, **Step 5** (after Steps 2 to 4 merge)
1. Pull `main` and run the full test suite and `scripts/smoke.py` locally with `AUTH_REQUIRED=true`.
2. Deploy to Render staging and run `scripts/smoke.py https://<app>.onrender.com <token>`.
3. Run the **E2E checklist** in Part 5.3 with the team (include a real phone).
4. Set `AUTH_REQUIRED=true` in Render. Retest.
5. Tag the release `v1.0`. Update the README with the live link.
6. Do a load check inside the free limits: 5 users chatting at once. Watch for 429s and tune `RATE_LIMIT_*`.

## Acceptance checklist
- [ ] **Step 1** merged by the end of Day 1 and the app behaves exactly as before.
- [ ] `.env` is not in git history (`git log --all -- .env` is empty).
- [ ] `pytest` passes on `main`. `scripts/smoke.py` passes against the live URL.
- [ ] Live URL loads over HTTPS. Chat works end to end.
- [ ] Docs exist: README, DEPLOY, PRIVACY. The privacy line is available for M3's sign-up form.
- [ ] UptimeRobot configured.

---

# PART 5: MERGE ORDER, SCHEDULE AND FINAL TEST

## 5.1 Merge order (strict)
| Step | Who | What | Merge only when | Then everyone does |
|---|---|---|---|---|
| **1** | M4 | Repo + skeleton refactor (4.1, 4.2) | App behaves exactly as before | `git pull --rebase origin main` |
| **2** | M2 | Hosted LLM + RAG + prompts | Chat works with Ollama off; M2 checklist passes | rebase |
| **3** | M1 | `auth.py` + live Supabase | M1 checklist passes; `AUTH_REQUIRED=false` still works | rebase |
| **4** | M3 | Login UI + sync + token in chat | M3 checklist passes against real Supabase | rebase |
| **5** | M4 | Deploy, `AUTH_REQUIRED=true`, E2E, release | E2E checklist in 5.3 passes | celebrate |

Rules: one PR per step; a different member reviews; if `main` moved, rebase before merging; never merge with failing tests. Steps 2 to 4 can be **coded** in parallel right after Step 1, and **merged** in this order. Because file ownership is separate (Part 0.4), conflicts should be rare. If one appears, the file's owner resolves it.

## 5.2 Suggested schedule (about 10 working days; shift to your deadline)
| Day | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| 0 | Read Part 0, agree contracts | same | same | same, create repo |
| 1 | Create Supabase, run schema, test pseudo-email | Pick provider, get key | Download supabase-js, draft login UI | **Step 1 merged** |
| 2 | **Share URL + anon key** | `llm.py` streaming | Login/sign-up working | Render service created |
| 3 to 4 | `auth.py` + tests | `rag.py` + embeddings | Cloud sync | smoke script, CORS |
| 5 | | **Step 2 merged** | Chat token + 401/429 UX | deploy staging |
| 6 | **Step 3 merged**; keep-alive | prompt quality tests | Login gate + merge + offline | privacy doc |
| 7 | | | **Step 4 merged** | docs |
| 8 | all: full-team test on staging, log bugs | | | |
| 9 | fix bugs | fix bugs | fix bugs | **Step 5**, release |
| 10 | buffer | buffer | buffer | buffer / demo rehearsal |

Daily: a 15-minute stand-up (done / next / blocked). Whoever finishes early helps with testing.

## 5.3 E2E checklist (run by M4 with everyone; record PASS/FAIL)
1. [ ] Open the live URL on a phone; the landing page loads (allow 60 s after sleep) and the app cannot be used without logging in.
2. [ ] Sign up a new student; a `profiles` row appears in Supabase.
3. [ ] Log out and log in again; the session works.
4. [ ] Do 5 practice questions; XP and level change; after refresh they persist.
5. [ ] Log in on a second device; the same progress shows.
6. [ ] Chat in BM, tutor mode: gets a hint, not the final answer, and sources show.
7. [ ] Chat in English, check-answer mode: finds the wrong step.
8. [ ] Explain mode gives a short explanation with a practice question and LaTeX renders.
9. [ ] Send 10 chat messages quickly: the 429 message appears, no crash.
10. [ ] Call `/api/chat` with no token: 401. With a tampered token: 401.
11. [ ] Turn off the network: practice still works; reconnect and it syncs.
12. [ ] Student A cannot see Student B's data (verify in Supabase with two accounts).
13. [ ] Wrong LLM key (temporary, on staging only): a friendly error is shown, no key leaked.
14. [ ] No secrets in the repo, the browser's network tab, or `/api/config`.
15. [ ] Demo-day: Supabase not paused, UptimeRobot green, quota remaining.

## 5.4 Risks and mitigations
| Risk | Mitigation | Owner |
|---|---|---|
| LLM free quota exhausted by many testers | per-user rate limit, friendly 429 message, a second provider key as backup (env-var swap only) | M1, M2 |
| Supabase project pauses | keep-alive monitor, check the day before the demo | M1 |
| Render cold start (30 to 60 s) | UptimeRobot ping, warn the audience, open the page 2 minutes before demo | M4 |
| Merge conflicts in `app.js` | only M3 edits `static/`; small commits; rebase often | M3 |
| Pseudo-email rejected by Supabase | M1 tests on Day 1; change domain in contract E if needed | M1 |
| Secrets leaked in git | `.gitignore`, `.env.example`, check history before making the repo public | M4 |
| Model gives final answers in tutor mode | prompt tuning and test table in `docs/LLM.md` | M2 |

## 5.5 Definition of Done for the whole project
All five steps merged, `pytest` and `scripts/smoke.py` green, the E2E checklist all PASS on the live URL with `AUTH_REQUIRED=true`, docs (README, DEPLOY, PRIVACY, SUPABASE, LLM) complete, and a tagged release `v1.0`.
