# Indian jeweller sources

**Mint rate highlights:** two top-row cards after global spot show India gold (24K primary, 22K secondary) and silver in INR/g from the user-provided Mint rate pages. Extraction reads the exact Today / one-gram table rows, preserving decimals and the published source timestamp. Checks run every 15 minutes. Publisher source dates can predate today's heading; cards display the published timestamp instead of claiming a fresh market quote. These are publisher India rates, separate from individual jeweller rates.

**Market-news coverage:** free publisher RSS from Economic Times Commodities and Mint Markets/Money now supplements Fed releases, every 15 minutes. Set `MARKET_NEWS_FEEDS=false` to disable these publisher feeds. Headline/source/date/link only; the today/yesterday IST and importance filters remain active. Mint RSS is offered for personal noncommercial newsreader use; wider/commercial redistribution requires publisher permission. See https://www.livemint.com/rss.

**Global INR and charts:** highlight cards include independent INR spot quotes per troy ounce and gram, alongside USD per troy ounce. USD spot samples are persisted in the existing history and plotted below the jeweller cards. Charts use actual captured timestamps, retain up to the existing seven-day/history-size limit, and wait for two samples rather than fabricating a historical series.

**International highlights:** two additional top cards now show gold and silver spot in USD per troy ounce from Gold-API.com. They refresh on the one-minute backend poll with `FREE_FEEDS=true` and `INTERNATIONAL_SPOT=true` (defaults). These values are separate from Khazana's INR-per-gram cards. Source timestamps and stale labels are shown. The earlier Indian-only description below is superseded for these two highlight cards.

**Active sources:** all nine jewellers are checked. A card is shown automatically only when it contains at least one valid positive gold or silver price. Empty sources stay hidden and appear on a later refresh if prices become available. The grid adapts to the visible-card count. Last-known prices retained after a fetch error remain visible with a source-error label.

The dashboard now displays only Indian jeweller website rates. It does not fetch or display international spot prices. Check interval: 15 minutes (`JEWELLER_POLL_SECONDS`, minimum 300 seconds). Frontend refresh remains 30 seconds. Fetch time is separate from the jeweller's published rate date; no published date means freshness cannot be verified. GST and branch scope remain unknown unless the source explicitly supplies them.

Live inspection on 25 October 2026:

| Jeweller | Result | Extraction |
| --- | --- | --- |
| Kalyan | Working: 24K and 22K gold | Server HTML purity table; Today column; explicit ten-gram values divided by ten |
| Khazana | Working: 24K, 22K gold and silver | Header metal/rate DOM rows; explicit per-gram units; no verified published date |
| Jos Alukkas | Working: 24K and 22K gold | Server HTML rate cards and published update timestamp; inspected page reported 24 October |
| Regal | Working: 22K gold, Ernakulam branch only | Supplied article links calculator; calculator declares a public JSON rate endpoint. Branch is displayed explicitly |
| Bhima | Working: online 22K and 24K gold | Reads the rendered gold-rate slider when present; otherwise uses the page's public metal-rates feed with normal website Origin/Referer headers. Preserves the returned store/location; source rate date and GST remain unspecified |
| Malabar | Unavailable in static HTML | Supplied store-list page does not expose an extractable rate table |
| Joyalukkas | Unavailable in static HTML | Supplied gold-rate page does not expose an extractable server-side rate |
| Abharan | Unavailable in static HTML | Supplied home page returns a JavaScript application shell |
| Mukunda | Candidate official URL, not confirmed by user | Homepage returns a JavaScript application shell |

Exact supplied URLs are in `jewellers.mjs`; links are also on each card. Missing metal/purity values display a dash. Product prices, purity ratios and other jewellers' rates are never substituted. HTTP/extraction errors retain a last-known rate only with an error label. A page that changes to an empty rate container is marked unavailable. All nine cards remain visible.

The extraction uses source-specific HTML container/table patterns based on inspected markup. It is not a general headless browser. Dynamic sites need a verified public feed or a rendered-page service; Vercel does not automatically render remote pages. Site changes can break extraction. No scraper credentials, proxy service or CAPTCHA bypass is included.

## News

Click **Market & policy intelligence** to open the native dialog containing all qualifying headlines and original source links. Escape, Close and clicking the backdrop close it. The dashboard otherwise remains a passive single-screen monitor.

The allowed date window is **today and yesterday in Asia/Kolkata**, recalculated from the current clock on every refresh and headline rotation. Future-dated, invalid and older headlines are excluded from the API, dialog, dashboard and newly generated Telegram summaries. The stored upstream news may contain older articles, but they are not exposed as current news.

Importance uses explicit title/category rules: metals price movements, import duty/tax changes, RBI/Fed policy decisions, interest rates, inflation, currency and geopolitical events tied to metals. Promotional offers and unrelated headlines are excluded. This is a deterministic relevance filter, not a claim that a headline will move prices. No qualifying event means the dashboard says so instead of filling the space with stale news. There is no forecast/calendar of future event dates yet.

Fed RSS is free and often has no new release in this two-day window. Broader coverage requires `NEWSDATA_API_KEY` (its free plan is delayed 12 hours) or a suitably licensed NewsAPI key. News providers cannot guarantee every important event is covered.

## Verify

`npm test` runs parser, date-window, outbox and scheduler checks. `node check-feeds.mjs` performs a read-only live website/news check without loading credentials or sending messages. It reports unavailable sources as well as working ones. For Vercel, use the existing Supabase migration and minute scheduler in `DEPLOYMENT.md`; remove old spot/price-provider environment settings if no longer needed.
