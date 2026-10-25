# Terminal redesign inventory

Layout-only redesign requested 26 October 2026. Existing HTML/JavaScript retained; no Next.js migration or new dependencies.

- Header: brand, monitoring subtitle, available-source counter, current IST clock.
- Six market indicators: Khazana 22K gold, Khazana silver, global gold USD + INR/ounce + INR/gram, global silver with the same units, Mint India 24K/22K gold, Mint silver. Preserve all source/fetch timestamps, error text, source links and attribution.
- Retailer cards: existing availability rule; currently Bhima, Regal, Kalyan, Khazana, Jos Alukkas. Each retains website link, status, 24K/22K/silver values, checked time, published source date or unknown/GST note, location/scope/error note and title details. Other configured sources still appear automatically when rates are available.
- Telegram: all five IST schedule chips, next-slot highlight, queue count, last-delivery timestamp/configuration note, test action, sending/busy/error/success results.
- Source health: available/hidden counts, website check interval, news date window, Telegram configuration state, all existing health notes and overdue/network errors.
- Gold and silver graphs: latest USD price, movement indicator, individual refresh controls/results, captured history, USD price axis, time range, hover/crosshair tooltip, keyboard/touch inspection and collecting-history state.
- News: current rotating headline, publisher/date/delay metadata, original article link, qualifying-news count/window, click-to-open full existing dialog, close/backdrop/Escape behavior, empty state.
- Footer: backend check timestamp and measurement units.

Preserved mechanics: /api/status polling at 30 seconds; clock at one second; news rotation at 18 seconds; source/backend refresh schedules; Telegram endpoint and retry flow; prices/calculations; existing news eligibility rules. No new network request is introduced by this redesign.

Layout: A = six full-width indicators; B = retailer grid at ~69%, operations at ~31%; C = gold graph, silver graph, news. Mobile remains one route and may scroll. Existing dialog remains available; no existing section is moved into it.
