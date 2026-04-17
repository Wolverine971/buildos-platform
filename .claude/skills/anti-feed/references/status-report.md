# Status report — WS09 + WS10 dashboard render

Load this when the user picks menu option 5 ("show status") or asks for anti-feed progress.

## What to render

A single markdown output with four sections, in this exact order:

1. **WS09 Anti-Feed Blogs** (table)
2. **WS10 Short-Form Video** (table, keyed to WS09 blogs + standalone scripts)
3. **What's overdue** (computed from cadence rules)
4. **Suggested next action** (one clear recommendation)

## Section 1 — WS09 blog table

Pull from `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` status dashboard. Re-render as:

| Task | Title | Status | Last action (UTC date) | Publish-kit? |
| ---- | ----- | ------ | ---------------------- | ------------ |
| T34  | ...   | ✅     | 2026-04-17 (published) | {yes/no, path if yes} |
| T35  | ...   | 🟡     | 2026-04-18 (ready)     | ⚪           |
| ...

"Publish-kit?" column: check `docs/marketing/social-media/publish-kits/` for a file matching `*{slug}*-kit.md`. If found, display `✅ → {path}`. If not, `⚪`.

## Section 2 — WS10 TikTok table

Pull from `docs/marketing/distribution/workstreams/WS10-short-form-video.md` dashboard. Each row is keyed to a WS09 blog (for T48 pairs) or to a standalone script (under T48-STANDALONE).

| Task     | For blog  | Script 1 (30–45s) | Script 2 (60–90s) | Recorded | Posted |
| -------- | --------- | ----------------- | ----------------- | -------- | ------ |
| T48-T34  | T34       | ⚪                | ⚪                | ⚪       | ⚪     |
| T48-T35  | T35       | ...               | ...               | ...      | ...    |

Also list standalone scripts from `docs/marketing/social-media/tiktok/scripts/` if the folder exists.

## Section 3 — What's overdue

Compute and display:

- **Blog cadence (T44).** Last published cluster post date vs. today. If >10 days, flag AT-RISK. If >14 days, flag OVERDUE.
- **TikTok cadence (T49).** For every ✅ blog, check whether 2 scripts exist within 7 days of blog publish date. If not, flag OVERDUE-TIKTOK.
- **Receipts (T45).** If the receipts library exists and has had zero additions in 14+ days, flag STALE-RECEIPTS.

Format:

```
⚠ OVERDUE — T44 blog cadence. Last cluster post: {date}, {N} days ago.
⚠ OVERDUE — T49 TikTok. T34 published {date}, scripts missing {N} days later.
```

If no items overdue: `✅ All cadence checks clean.`

## Section 4 — Suggested next action

Apply this decision tree, pick the first matching line:

1. If WS09 blog cadence is OVERDUE → "Draft **T##** — {title}. It's the next 🟡 and cadence is {N} days overdue."
2. If any ✅ blog has no publish kit → "Build publish kit for **{last unkitted blog}**. Will generate 2 TikTok scripts as part of the kit."
3. If any ✅ blog has a kit but fewer than 2 recorded TikToks → "Record TikTok script {1 or 2} for **{blog}**. Script is drafted at {path}."
4. If T45 receipts library is STALE → "Capture a receipt. Cluster writes faster when the library is warm."
5. If everything is green → "Up next is **T##** on the cadence clock (due {date}). Good to draft when ready."

## How to present

Output the full report inline in the conversation. Do not write it to a file unless the user asks for an exported version.

When asked to export, write to `docs/marketing/measurement/anti-feed-status-{YYYY-MM-DD}.md` with full frontmatter pointing at WS09 / WS10.

## Common failure modes

- **Stale dashboard lookup.** Always re-read WS09 / WS10 at render time — don't cache.
- **False "OVERDUE" flags.** If a blog is ✅ but the publish kit is intentionally deferred (user told you so), note it in the "what's overdue" section as `ℹ DEFERRED` not `⚠ OVERDUE`.
- **Over-padding.** Keep the whole report under ~500 words visible in the terminal. If dashboards are dense, truncate to top 5 rows and link to the full file.
