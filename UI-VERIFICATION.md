# Terminal layout verification — 26 October 2026

## Preserved behavior

Compared the redesign against the saved pre-edit source: the complete inline functional JavaScript is byte-for-byte unchanged, and the complete HTML ID inventory is identical. Only CSS, main-section wrappers/placement, theme metadata and accessibility labels changed. The inventory is documented in UI-INVENTORY.md.

All 32 existing tests passed, including live-dashboard rendering with supplied data, chart hover/refresh, source extraction, news date filtering, scheduler persistence and Telegram behavior. Node syntax validation passed for all project JavaScript modules and the dashboard script.

## Desktop targets

- At 1366×768, the shell reserves 46px header, 22px footer and 20px main padding. Grid content height is 680px. Minimum row allocation is 96px indicators + 380px monitoring + 170px analysis + 16px gaps = 662px.
- At 1920×1080, content height is 980px. Minimum row allocation is 112px indicators + 354px monitoring + 230px analysis + 20px gaps = 716px; flexible tracks take the remaining height.
- Six indicators span the full width; current five fetched jeweller cards use four columns/two rows. Operations are alongside them. Gold, silver and news occupy the third zone simultaneously.
- Text/metadata truncation and line clamps were removed. Source notes wrap. No section was newly hidden, collapsed, paginated, or moved into the existing news dialog.
- Below 900px width or 620px height, the page permits scrolling to preserve readability. Mobile retains all functions on the same route.

These are CSS track-sizing checks, **not browser-rendered layout measurements**. Native/browser QA could not run: the available computer-use tool returned no browsers/apps and a missing native-pipe error. Pixel-level fit, text wrapping, and pointer interaction at both requested viewport sizes remain visually unverified. In particular, future availability of all nine retailers or unusually long source/Telegram error messages could require further sizing adjustments at the smaller desktop target; current five-source data is the intended fit.

## Build tools

This project uses plain HTML/CSS and JavaScript, not Next.js/TypeScript. There is no typecheck or lint script/configuration. No heavy dependency or framework migration was introduced for styling. The configured Vercel production build command is `npm test`; the same full suite passed locally. Production verification should also confirm the deployed HTML contains the `monitor-zone` and `analysis-zone` layout markers.
