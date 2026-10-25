# Metals Watch

**Current implementation:** Indian jeweller cards only, with a date-filtered important-news dialog. See [SOURCES.md](SOURCES.md) for verified source coverage and limitations. Four sources currently return extractable rates; five need additional integration. The older free spot/city API notes below describe the previous implementation and are superseded by SOURCES.md.

**Free feed defaults:** international gold/silver spot in INR every minute (no key), Federal Reserve monetary-policy RSS every 15 minutes (no key), plus optional NewsData headlines (credentials needed; NewsData free news has a 12-hour delay). City retail rates remain an optional separate provider. See [DEPLOYMENT.md](DEPLOYMENT.md) for current intervals and setup; the legacy local/Docker details below refer to the original city-feed configuration.

**Vercel + Supabase support:** see [DEPLOYMENT.md](DEPLOYMENT.md) for cloud setup and local startup. Vercel serves the authenticated dashboard/API; Supabase persists state and schedules background monitoring. The Docker/local-file mode below remains available as an alternative.

Dependency-free Node 22 app: indicative 24K/22K gold and silver rates for Nellore, Bengaluru and Hyderabad; relevant news; Telegram summaries. No credentials are included. The private Sites deployment is a **static preview**, not the background monitor. Deploy the complete Node app on an always-on host to activate monitoring.

## Start

Install Node 22+. Copy `.env.example` to `.env`, then `npm start`. Open http://127.0.0.1:3000. No npm install is needed. The empty state is accurate; “View sample” explicitly shows fictional prices and sends no messages.

## Accounts and secrets

1. City rates: obtain `NEBULA_API_KEY` from https://metals.nebulaapi.com/. Confirm supported cities (`Nellore`, `Bangalore`, `Hyderabad`), cost and licensing first. The adapter calls `/gold_price` and `/silver_price`. These are indicative retail rates and can include estimates, not guaranteed jeweller quotes. Source/confidence/GST metadata is preserved. Unknown metadata stays unknown. Missing city data is never replaced with a national rate. Live response and city coverage still need verification with your key.
2. News: set `NEWS_API_KEY` from https://newsapi.org/ with a plan licensed for deployed use. Headlines refresh every 30 minutes and link to original articles. No prediction of market impact is made.
3. Telegram: open the verified https://t.me/BotFather, run `/newbot`, then open your new bot and press Start. Set `TELEGRAM_BOT_TOKEN` privately. After sending the bot a message, use Telegram's `getUpdates` method privately to find `message.chat.id` and set `TELEGRAM_CHAT_ID`. Do not share token-bearing URLs/screenshots. See https://core.telegram.org/bots/api#getupdates. Restart the server after changing secrets. No Telegram messages have been sent during development.

Never put secrets in the frontend, source control, hosting manifest or public chat. The app exposes only cached status; `.env` and state files are not served.

## Hosting

Use an always-on Node/Docker host with persistent disk, not a sleeping free web service. Set a random `APP_PASSWORD` of at least 20 characters. Run `docker compose up -d --build`, then put an HTTPS reverse proxy in front of localhost:3000. Username: `metals`; password: `APP_PASSWORD`. HTTP Basic needs HTTPS before remote use. The named volume preserves history and delivery state, and Docker restarts the service automatically. Run one replica only; back up its volume.

The private Sites preview serves layout and disconnected/sample states only. It does not connect to your localhost or run Node. The complete Node server serves the dashboard and API together, requiring no CORS setup.

## Timing, cost and reliability

- Telegram summaries: daily 08:00, 10:00, 14:00, 16:00, 18:00 **Asia/Kolkata**. Each includes all cities and two news links. A fresh price poll runs before composing. Timing is checked every 15 seconds; fetch and delivery latency may delay messages.
- Default city polling: five minutes (`POLL_SECONDS=300`, minimum 60). Six city/metal requests per poll is approximately 51,840 requests per 30 days, plus extra polls for summaries. Credit costs differ by endpoint; the provider's silver credit documentation is inconsistent, so confirm before paying. This is not an unlimited free feed.
- Browser refresh reads cached state every 30 seconds without spending a price-provider request for each visitor. Sources older than 30 minutes are flagged stale. Fetch failures retain last known data and show errors.
- Optional movement alerts: set a positive `ALERT_PERCENT`; `0` disables them. Both rises and drops from the last alerted price qualify. Only non-stale city quotes without failed validation qualify. Baselines persist.
- The persistent outbox retries failed sends with exponential backoff, respecting Telegram retry-after. Sent schedule slots are normally deduplicated. A crash or timeout after Telegram accepts a message but before local acknowledgement can cause a duplicate; Telegram provides no idempotency key.
- Same-day slots missed during a temporary pause are caught up while the process remains running. Restart does not generate retroactive summaries for time when the server was off. Pending summaries from previous days expire. Every market tick and outage cannot be guaranteed; a licensed streaming feed is needed to capture ticks between polls.
- No independent outage monitor is configured. An offline host cannot report its own outage.

## Verification

Run `npm test`: timezone/schedule, city/currency validation, movement thresholds and stale-summary tests. Live provider integration and Telegram delivery remain unverified until credentials are configured. The app uses only Node built-ins, no external fonts, analytics or frontend framework.

Provider references: https://metals.nebulaapi.com/docs/guides/gold-prices · https://metals.nebulaapi.com/docs/guides/silver-and-platinum · https://metals.nebulaapi.com/docs/guides/data-freshness · https://newsapi.org/docs/endpoints/everything · https://core.telegram.org/bots/api#sendmessage
