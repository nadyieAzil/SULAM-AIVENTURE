# AI MathMentor Deployment Guide (Render Free Tier)

This guide documents the exact steps for deploying AI MathMentor to **Render.com** (Free Web Service), setting up environment variables, configuring keep-alives, and preparing for demo day.

---

## 1. Prerequisites Checklist
Before deploying, make sure you have:
- [x] GitHub repository with the latest merged code on `main`.
- [x] Supabase project created in Southeast Asia (Singapore) with `schema.sql` executed.
- [x] Hosted LLM API Key (Google Gemini API / Groq / OpenRouter).
- [x] A free account on [Render.com](https://render.com).

---

## 2. Step-by-Step Render Deployment

### Step A: Connect Repository on Render
1. Sign in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Select **Build and deploy from a Git repository** → click **Next**.
4. Connect your GitHub repository: `nadyieAzil/SULAM-AIVENTURE`.
5. Fill in the service configuration:
   - **Name:** `ai-mathmentor` (or a custom name)
   - **Region:** `Singapore (Southeast Asia)`
   - **Branch:** `main`
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`

### Step B: Configure Environment Variables
Under the **Environment Variables** section on Render, add:

| Variable Name | Example / Expected Value | Purpose |
| :--- | :--- | :--- |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` *(or Gemini API URL)* | OpenAI-compatible API base URL |
| `LLM_API_KEY` | *(your secret API key)* | Secret key for the AI model |
| `LLM_MODEL` | `liquid/lfm-2.5-2.6b:free` *(or gemini-1.5-flash)* | Active chat model |
| `EMBED_MODEL` | *(leave empty for keyword fallback)* | Optional embedding model |
| `SUPABASE_URL` | `https://npwqlocosrmafjwyyqbs.supabase.co` | Supabase project URL |
| `SUPABASE_ANON_KEY` | `sb_publishable__...` | Public client anon key |
| `SUPABASE_JWKS_URL` | `https://npwqlocosrmafjwyyqbs.supabase.co/auth/v1/.well-known/jwks.json` | Public JWT signature verification keys |
| `SUPABASE_JWT_SECRET`| *(legacy secret if applicable)* | Fallback HS256 secret |
| `AUTH_REQUIRED` | `true` | Enforces mandatory student authentication |
| `RATE_LIMIT_PER_MIN`| `8` | Protects AI quota per student per minute |
| `RATE_LIMIT_PER_DAY`| `120` | Max questions per student per day |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:8000,https://<your-render-app>.onrender.com` | Allowed CORS web origins |

### Step C: Deploy
1. Click **Create Web Service**.
2. Wait 2–3 minutes for the build and container initialization.
3. Once deployed, Render will display your live HTTPS URL (e.g., `https://ai-mathmentor.onrender.com`).

---

## 3. Post-Deployment Supabase Configuration
Once you have your Render live URL:
1. Go to your **Supabase Dashboard** → **Authentication** → **URL Configuration**.
2. **Site URL:** set to `https://<your-render-app>.onrender.com`.
3. **Redirect URLs:** add:
   - `https://<your-render-app>.onrender.com/**`
   - `http://127.0.0.1:8000/**` (for local development)
4. Click **Save**.

---

## 4. Keep-Alive Configuration (Prevent Free Tier Sleep)
Render's free tier spins down after ~15 minutes of inactivity. When a student visits a sleeping instance, the first page load can take 30–50 seconds.

### Setup UptimeRobot (Free):
1. Create a free account on [uptimerobot.com](https://uptimerobot.com).
2. Click **Add New Monitor**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `AI MathMentor Health`
   - **URL (or IP):** `https://<your-render-app>.onrender.com/api/health`
   - **Monitoring Interval:** `Every 5 minutes`
3. Click **Create Monitor**. This pings `/api/health` every 5 minutes and keeps the Render instance warm.

---

## 5. Automated Verification
Run the automated smoke test script against your live deployment:

```bash
python scripts/smoke.py https://<your-render-app>.onrender.com
```

If all 3 checks report `[✅ PASS]`, the live cloud service is ready for students!

---

## 6. Rollback Procedures
If a broken commit is deployed:
1. In the Render Dashboard, navigate to **Deploys**.
2. Locate the previous successful deploy.
3. Click the three dots (`...`) → **Rollback to this deploy**.

---

## 7. Demo-Day Checklist
Run this 30 minutes before your demo or presentation:
- [ ] Open the live URL on a smartphone (e.g. Chrome / Safari) to trigger cold start if asleep.
- [ ] Log in with a test student account and ask 1 question in Tutor Chat.
- [ ] Complete 1 practice question in Latihan and verify XP changes.
- [ ] Check provider quota on your LLM dashboard to ensure sufficient free requests remain.
