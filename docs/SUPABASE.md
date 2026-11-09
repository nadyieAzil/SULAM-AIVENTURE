# M1: Supabase setup and verification

## Current project and status

Project URL: `https://npwqlocosrmafjwyyqbs.supabase.co`.
This replaces the earlier project. Keys must come from this project too.
The owner reports: schema installed, RLS enabled, three policies present,
email enabled with confirmation off for development, local URLs saved, and
dashboard creation of `testuser@mathmentor.student` produced a profile row.
The owner reports HS256 signing and saving the legacy JWT secret locally.
Normal public signup, real-token backend access, and two-user isolation still
need live verification. Dashboard user creation alone does not prove public signup.

## Recreate the project

1. Create a Free Supabase project named `ai-mathmentor` in Singapore. Save the
   database password privately.
2. Paste [schema.sql](../supabase/schema.sql) into SQL Editor and run it.
   Check `public.profiles`, RLS, and the `read own`, `insert own`, `update own`
   policies. The signup trigger applies to users created after installation.
3. Enable the Email provider under Authentication. For development, disable
   Confirm email. Production with real emails needs a team decision about
   confirmation; pseudo-emails cannot receive verification or reset emails.
4. Set Site URL to `http://127.0.0.1:8000` and add
   `http://127.0.0.1:8000/**` to redirect URLs. Add M4's HTTPS Render URL later.
5. Create a test user in Authentication > Users and verify that its UID matches
   the new profile row. Also test public signup with the pseudo-email domain.
6. Collect the Project URL, publishable/anon key, and current signing algorithm.
   Never use a service-role or secret API key in this application.

## Configuration and ownership

Save real values only in the ignored local `.env` and hosting environment settings.
Do not overwrite any existing LLM configuration when adding these values.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
SUPABASE_JWKS_URL=
SUPABASE_JWT_SECRET=YOUR_LEGACY_HS256_SECRET
AUTH_REQUIRED=true
RATE_LIMIT_PER_MIN=8
RATE_LIMIT_PER_DAY=120
```

For the current HS256 project, leave `SUPABASE_JWKS_URL` empty and use the
legacy JWT secret. The publishable/anon key is not the JWT secret.
For a future asymmetric project, set `SUPABASE_JWKS_URL` to
`https://YOUR_PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json` and clear
`SUPABASE_JWT_SECRET`. JWKS configuration takes precedence; there is no
automatic fallback to HS256. Restart the app after configuration changes.
This matches the [Supabase signing-key model](https://supabase.com/docs/guides/auth/signing-keys).

M3 receives only the URL and publishable/anon key. M4 receives those public
values plus the signing method and host configuration instructions. For HS256,
the owner must enter the secret in hosting settings or transfer it through an
approved private secret channel; never put it in a PR, message, or screenshot.
The JWKS URL can be shared as public information even for HS256, but must stay
unset in the backend until the project uses asymmetric signing.

## Backend behavior

[auth.py](../backend/auth.py) uses `backend.config.settings`. A supplied token
must have a valid signature, `authenticated` audience, unexpired required `exp`,
and UUID `sub`. When a project URL is configured, its Auth issuer must match.
HS256 and RS256/ES256 verification modes remain separate. Network key retrieval
runs in a worker thread. Tokens are never logged.

- Missing or invalid login: HTTP 401, `Sila log masuk semula.`
- Rate limit exceeded: HTTP 429, `Terlalu banyak soalan. Cuba lagi sebentar ya.`
- Defaults: 8 accepted requests per rolling minute, 120 per rolling 24 hours.
- `AUTH_REQUIRED=false`: missing credentials use anonymous mode, limited by
  client IP. Supplied invalid credentials still return 401.
- Limits are held in process memory, reset on restart, and are independent
  across workers/instances. M4 should use one worker for the planned deployment.
  Guest IP behavior depends on the server's trusted proxy configuration.

## Automated tests

From the project root with the project environment activated:

```powershell
python -m pytest tests/test_auth.py -q
```

Tests use fake keys and mocked JWKS retrieval, never the saved production secret.
Verified locally: `python -m pytest tests/test_auth.py -q` passed 19 tests.
`python -m pytest tests/test_auth.py tests/test_api.py -q` passed 23 tests,
with one upstream Starlette/httpx deprecation warning. The API regression tests
were run with the current local `AUTH_REQUIRED=false` setting.
M1 adds this test file under the explicit task 1.6 exception; M4 owns the test
directory and should review it during integration. `PyJWT[crypto]` is already
declared in the existing requirements.

## Live login with curl (PowerShell 7)

Run locally in your terminal; do not paste passwords or access tokens into chat.
First set `$base` to the local running app URL and `$sb` to the project URL.
Enter the public key at the prompt. Keep the test password private.

```powershell
$base = 'http://127.0.0.1:8000'
$sb = 'https://npwqlocosrmafjwyyqbs.supabase.co'
$publicKey = Read-Host 'Publishable or anon key'
$email = Read-Host 'Test user email'
$password = Read-Host 'Test user password' -MaskInput
$loginJson = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$session = ($loginJson | curl.exe --silent --show-error --fail-with-body `
  "$sb/auth/v1/token?grant_type=password" `
  -H "apikey: $publicKey" -H 'Content-Type: application/json' `
  --data-binary '@-') | ConvertFrom-Json
$password = $null
$loginJson = $null
if (-not $session.access_token) { throw 'Login failed; inspect the error locally.' }

$chatJson = @{ messages = @(@{role='user';content='Help me with 2x + 1 = 5'}); mode='tutor'; form=1 } | ConvertTo-Json -Depth 5 -Compress
$chatJson | curl.exe --silent --show-error -i "$base/api/chat" `
  -H "Authorization: Bearer $($session.access_token)" `
  -H 'Content-Type: application/json' --data-binary '@-'

$chatJson | curl.exe --silent --show-error -i "$base/api/chat" `
  -H 'Content-Type: application/json' --data-binary '@-'
```

With `AUTH_REQUIRED=true` and the app restarted, the valid token should pass
authentication; the request without a token must return 401. LLM configuration
is a separate concern: a later provider error is not an authentication failure.
Do not print `$session`; clear it after testing. A public signup test can use
the same JSON shape at `$sb/auth/v1/signup` with a new pseudo-email, capturing
the response into a variable rather than displaying tokens. Confirm that signup
and subsequent password login work, and a profile appears.

## Prove two-user isolation

Create a second test user. Use fresh tokens for A and B. With A's access token
and the public key, call:

```powershell
$userBId = Read-Host 'User B UUID'
curl.exe --silent --show-error --fail-with-body `
  "$sb/rest/v1/profiles?select=id,state&id=eq.$userBId" `
  -H "apikey: $publicKey" -H "Authorization: Bearer $($session.access_token)"

'{"state":{"rlsProbe":true}}' | curl.exe --silent --show-error -i `
  -X PATCH "$sb/rest/v1/profiles?id=eq.$userBId" `
  -H "apikey: $publicKey" -H "Authorization: Bearer $($session.access_token)" `
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' `
  --data-binary '@-'
```

Both responses must contain no B rows (`[]`). A PATCH can return success with
zero affected rows, so status alone does not prove isolation. Sign in as B and
verify B's state is unchanged. Try inserting B's UUID as A: it must fail rather
than change B's record. Confirm A can read and update its own row, then repeat
the cross-user checks in the other direction. Never use an administrative key
or an SQL Editor administrator session to claim RLS isolation passed.

## Paused projects and demo preparation

See [keepalive.md](../scripts/keepalive.md). If paused, open the project dashboard
and choose Restore/Resume, wait until healthy, then repeat login and profile
checks. Review Supabase warning emails. Free-plan pause behavior is described
in the [official guide](https://supabase.com/docs/guides/platform/free-project-pausing).

## Handoff Note (update live results before opening a PR)

Member: M1. Branch: `m1/auth`.

- Done: exact schema; backend verification and rolling rate limits; isolated
  auth tests; setup and keep-alive documentation.
- Human-reported: schema/RLS/policies and dashboard signup trigger in the new
  project; development Auth URLs; HS256 secret saved locally.
- Not done: public signup/login, two-user REST isolation, real-token chat check,
  confirmation that M3/M4 received public values, keep-alive configuration.
- Files: `backend/auth.py`, `supabase/schema.sql`, `tests/test_auth.py`,
  `docs/SUPABASE.md`, `scripts/keepalive.md`.
- Environment: the existing contract variables above; no new names.
- Test: `python -m pytest tests/test_auth.py -q` passed 19 tests; together with
  `tests/test_api.py`, 23 passed. One dependency deprecation warning; no failures.
- M4: review the task 1.6 test addition; keep one worker for process-local limits;
  enter HS256 secret privately and leave JWKS unset for this project.
- M3: public URL/key, pseudo-email public signup result once verified, 401/429
  messages above. Email confirmation cannot be used with pseudo-email addresses.

Merge only at Step 3, after M2's Step 2, once the complete M1 acceptance checklist
passes. Pushing the work branch does not complete the live acceptance checks;
deployment and merging into main remain pending.
