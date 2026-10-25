# Vercel + Supabase

**Current source configuration:** see [SOURCES.md](SOURCES.md). The app now uses `JEWELLER_FEEDS=true` and `JEWELLER_POLL_SECONDS=900` for Indian jeweller website rates. International spot and the previous city API adapter are no longer active. The Supabase/Vercel deployment and authentication steps below still apply; previous spot-feed descriptions are superseded by SOURCES.md. Use `FREE_FEEDS=true` only for the free Fed news feed; optional `NEWSDATA_API_KEY` or `NEWS_API_KEY` adds broader news coverage.

## Local development

Install Node.js 22 or newer. From PowerShell:

```powershell
cd D:\tmp\Learning\metals-watch
Copy-Item .env.example .env
npm start
```

If `.env` already exists, keep it instead of overwriting it. Open http://127.0.0.1:3000. Without credentials, use **View sample** for fictional demonstration data. Local `npm start` uses a local JSON file; the Vercel functions use Supabase. Do not open `index.html` directly for live data.

## Supabase database

1. Create a Supabase project.
2. In its SQL editor, run `supabase/migrations/202610250001_monitor.sql`.
3. Copy the project URL and the server-side **service_role** key privately. This adapter uses the legacy service_role JWT key, not the public anon/publishable key.

The migration creates one private state row plus RPC functions for reads, lease acquisition, saves and release. RLS is enabled; anon/authenticated roles have no access. Only backend service_role requests may use the RPCs. The row stores seven days of bounded history, latest quotes, news, pending deliveries and deduplication records. This is a single-owner dashboard, not a multi-user system.

## Vercel

Import the Git repository and set **Root Directory** to `metals-watch` if it is nested in the repository. Use the **Other** framework preset and Node 22. The included `vercel.json` configures the output and API functions. The build runs the test suite; no frontend compilation is required.

Set these production environment variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server-side service_role JWT key |
| `APP_PASSWORD` | Random password, minimum 20 characters |
| `CRON_SECRET` | Different random secret, minimum 20 characters |
| `JEWELLER_FEEDS` | true by default; Indian jeweller website checks |
| `NEWS_API_KEY` | News data |
| `TELEGRAM_BOT_TOKEN` | Your bot token |
| `TELEGRAM_CHAT_ID` | Your own destination chat ID |
| `POLL_SECONDS` | Optional, defaults to 60 |
| `JEWELLER_POLL_SECONDS` | Website interval, defaults to 900; minimum 300 |
| `FREE_FEEDS` | Defaults to true; free Fed news only |
| `NEWSDATA_API_KEY` | Optional broader free news, 12-hour delay |
| `ALERT_PERCENT` | Optional, defaults to 0 (disabled) |

Keep all values server-side; do not prefix them with `NEXT_PUBLIC_` or put them into HTML. Jeweller HTML sources need no keys. News keys are optional. Supabase and the two authentication secrets are required for the cloud version. Sign in with username **metals** and `APP_PASSWORD`. Source HTML is served behind authentication rather than exposed as a static public index.

## Schedule background monitoring

Enable **Supabase Cron**, **pg_net**, and **Vault** in your project. Create these secrets privately through the Vault dashboard:

- `metals_app_url`: the stable production origin, e.g. `https://your-project.vercel.app` (no trailing path).
- `metals_cron_secret`: exactly the same value as Vercel's `CRON_SECRET`.
- If Vercel Deployment Protection is enabled, `metals_vercel_bypass`: its automation bypass secret. This is separate from the endpoint's own authentication.

Run `supabase/schedule.sql` in the Supabase SQL editor. It schedules an authenticated POST to Vercel `/api/cron` every minute. The app checks Indian jeweller websites every 15 minutes by default, and free Fed news every 15 minutes. The minute ticks also check Telegram slots and pending retries. No Vercel Cron configuration or persistent process is required. Monitor usage on both platforms; this schedule alone produces roughly 43,200 function calls per 30 days.

Your summaries use Asia/Kolkata time: **08:00, 10:00, 14:00, 16:00, 18:00**. Scheduler, fetch and delivery latency can delay messages. The first successful run initializes the schedule start; activate it before the first summary you want. Subsequent cold starts retain the start time, queue and sent-slot records. Missed same-day summaries can catch up; prior-day pending summaries expire.

An atomic database lease prevents overlapping monitor invocations. It expires after 180 seconds if an invocation is killed. Vercel's monitor function has a 120-second duration setting. Pending sends are persisted before Telegram calls and retried. A timeout/crash after Telegram accepted a send can still produce a duplicate; exactly-once delivery is not guaranteed.

## Verify after deployment

1. Open the production URL and log in. Confirm `/api/status` returns state, without Supabase or Telegram secrets.
2. Check Supabase `cron.job_run_details` **and** `net._http_response`: a successful SQL dispatch is not proof the HTTP monitor succeeded. The schedule file includes inspection queries.
3. Confirm `lastRunAt` advances in `/api/status`, jeweller published dates and fetch times are current and feed errors are empty after credentials are configured.
4. Verify a real scheduled Telegram summary in your own chat. No real delivery has been tested during development.

Keep the Supabase project active and check your plan's pausing, quotas and Vercel duration limits. A paused database cannot schedule or persist updates. This implementation has unit/integration tests with mock services, but has not been deployed to your Vercel or Supabase accounts.

References: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
