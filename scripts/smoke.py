#!/usr/bin/env python3
"""Smoke testing script for AI MathMentor.

Usage:
    python scripts/smoke.py <BASE_URL> [TOKEN]

Examples:
    python scripts/smoke.py http://127.0.0.1:8000
    python scripts/smoke.py https://ai-mathmentor.onrender.com "eyJhbGciOi..."
"""
import json
import sys
import httpx


def log_step(name: str, passed: bool, detail: str = ""):
    status = "✅ PASS" if passed else "❌ FAIL"
    msg = f"[{status}] {name}"
    if detail:
        msg += f" - {detail}"
    print(msg)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/smoke.py <BASE_URL> [TOKEN]")
        sys.exit(1)

    base_url = sys.argv[1].rstrip("/")
    token = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Running smoke test suite against: {base_url}")
    print("=" * 60)

    overall_pass = True

    with httpx.Client(timeout=30.0) as client:
        # Step 1: Health check
        try:
            r = client.get(f"{base_url}/api/health")
            if r.status_code == 200 and r.json().get("ok") is True:
                log_step("GET /api/health", True, "ok: true")
            else:
                log_step("GET /api/health", False, f"status {r.status_code}: {r.text}")
                overall_pass = False
        except Exception as e:
            log_step("GET /api/health", False, str(e))
            overall_pass = False

        # Step 2: Config check
        auth_required = False
        try:
            r = client.get(f"{base_url}/api/config")
            if r.status_code == 200:
                data = r.json()
                has_keys = all(k in data for k in ("supabaseUrl", "supabaseAnonKey", "authRequired"))
                auth_required = data.get("authRequired", False)
                if has_keys:
                    log_step("GET /api/config", True, f"authRequired={auth_required}")
                else:
                    log_step("GET /api/config", False, f"Missing required keys in: {data}")
                    overall_pass = False
            else:
                log_step("GET /api/config", False, f"status {r.status_code}: {r.text}")
                overall_pass = False
        except Exception as e:
            log_step("GET /api/config", False, str(e))
            overall_pass = False

        # Step 3: Chat streaming check
        try:
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"

            payload = {
                "messages": [{"role": "user", "content": "1 + 2"}],
                "mode": "tutor",
                "form": 1,
            }

            r = client.post(f"{base_url}/api/chat", json=payload, headers=headers)

            if auth_required and not token:
                # If auth is required and no token was passed, expecting 401 is expected security behavior
                if r.status_code == 401:
                    log_step("POST /api/chat (no token)", True, "Correctly rejected with 401 Unauthorized")
                else:
                    log_step("POST /api/chat (no token)", False, f"Expected 401 when authRequired=true, got {r.status_code}")
                    overall_pass = False
            else:
                if r.status_code == 200:
                    lines = [json.loads(line) for line in r.text.strip().split("\n") if line.strip()]
                    has_sources = len(lines) > 0 and "sources" in lines[0]
                    has_tokens = any("token" in line for line in lines)
                    has_error = any("error" in line for line in lines)

                    if has_sources and has_tokens:
                        log_step("POST /api/chat", True, f"Received {len(lines)} streaming lines with sources & tokens")
                    elif has_error:
                        log_step("POST /api/chat", False, f"Provider error returned in stream: {lines}")
                        overall_pass = False
                    else:
                        log_step("POST /api/chat", False, f"Unexpected stream output: {lines}")
                        overall_pass = False
                else:
                    log_step("POST /api/chat", False, f"status {r.status_code}: {r.text}")
                    overall_pass = False
        except Exception as e:
            log_step("POST /api/chat", False, str(e))
            overall_pass = False

    print("=" * 60)
    if overall_pass:
        print("🎉 ALL SMOKE TESTS PASSED!")
        sys.exit(0)
    else:
        print("⚠️ SMOKE TESTS FAILED. Check logs above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
