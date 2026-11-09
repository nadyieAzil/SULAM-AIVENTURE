# M1 keep-alive and demo checks

Supabase Free projects can pause after low activity over seven days.
Check the [current pause policy](https://supabase.com/docs/guides/platform/free-project-pausing)
and warning emails. A monitor is not a guarantee against pausing.

## Render monitor (human setup with M4)

After M4 provides the deployed URL, configure a free HTTP uptime monitor on
`https://YOUR_APP.onrender.com/api/health`, at a supported interval such as five
minutes. Confirm a successful response. This endpoint deliberately does not
query Supabase and therefore does not establish database activity.

## Supabase monitor (human setup)

An Auth health monitor can target
`https://npwqlocosrmafjwyyqbs.supabase.co/auth/v1/health` with an `apikey` header
containing the publishable/anon key. This checks Auth availability; it does not
prove database activity or prevent a pause.

For the daily REST option in TEAMPLAN, configure a GitHub Actions schedule in
the repository's default branch. M1 supplies these instructions; ask M4 to add
the workflow because workflow files are outside M1's ownership. Store only the
public URL/key as Actions configuration. No service-role key, JWT secret, user
password, or access token is needed for this monitor.

Example workflow for M4 to review and install (not installed automatically):

```yaml
name: Supabase availability
on:
  workflow_dispatch:
  schedule:
    - cron: '17 2 * * *'
permissions: {}
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Query profiles through RLS
        env:
          SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          SUPABASE_PUBLIC_KEY: ${{ secrets.SUPABASE_PUBLIC_KEY }}
        run: |
          curl --fail --silent --show-error --max-time 30 \
            --output /dev/null \
            "${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1" \
            -H "apikey: ${SUPABASE_PUBLIC_KEY}"
```

This intentionally runs without a user JWT: RLS must hide every profile row.
Validate that the request succeeds without exposing data. If table grants deny
it, do not weaken RLS or introduce an administrative key just for monitoring;
ask M4/M1 to review the setup. Daily queries are a best-effort activity check,
not an uptime promise. Scheduled workflows may be delayed or disabled; check
their run history and the current platform scheduling rules.

## Before the demo (human task)

1. Put a reminder in the team calendar for the day before the demo.
2. Open Supabase, verify the project is active, and restore it if paused.
3. Perform a real login and read/save practice progress.
4. Check monitor/workflow history and M2's provider quota.
5. With M4, open Render shortly before the demo and test authenticated chat.

Status: instructions prepared. External monitors, workflow, and calendar
reminder have not been configured or verified by the assistant.
