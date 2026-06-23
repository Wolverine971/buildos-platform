<!-- docs/archive/marketing/social-media/daily-engagement/2026-05-29_instagram-warmup.md -->

# Instagram Warmup - May 29, 2026

**Date:** 2026-05-29
**Account:** ⚠️ **UNVERIFIED** — no live session this run (see blocker). Intended handle is **@djwayne3**; `/instagram-reply` MUST verify the active handle before any action.
**Scan Time:** Friday 2026-05-29 (no live scan performed)
**Status:** ⚠️ **BLIND — NOT A LIVE STAGE 1.** No new queue produced. See blocker + carry-forward pointer below.

---

## ⚠️ BLOCKER — NO LIVE SCAN THIS RUN

**`browser_limitation: chrome_extension_not_connected`** (2nd consecutive day)

- `tabs_context_mcp` returned: "Browser extension is not connected."
- `list_connected_browsers` returned an empty list (`[]`) — no Chrome extension instance reachable on this account at all.
- Same variant as 2026-05-28. Distinct from `instagram_session_logged_out` (where the picker redirects to `/accounts/login/`). Here there is **no browser to drive**.

**Consequence:** No account verification, no Phase 2 (notifications/stories/feed), no Phase 3 (fresh-post scan), no Stage 0 triage, no profile refreshes. Nothing today was live-verified.

**This doc does NOT reproduce the 7-slot standing queue.** That queue is already captured in full in **`2026-05-28_instagram-warmup.md`** and the per-slot detail lives in **`2026-05-27_instagram-warmup.md`**. Duplicating it here with +1 day of staleness would add noise without adding signal — the 5/28 doc itself instructs that it be _superseded by a live scan, not copied forward again_.

---

## To get a real Stage 1

1. Reconnect the Claude Chrome extension (claude.ai/chrome; open/restart Chrome; ensure it's logged into claude.ai on this account).
2. Confirm `list_connected_browsers` is non-empty.
3. Re-run `/instagram-warmup` — it will produce a live scan that supersedes this blind doc and the 5/28 carry-forward.

If you instead go straight to `/instagram-reply`, it MUST: (a) verify the active handle is @djwayne3 (Path C: top-right Switch button → `djwayne3` row), and (b) live-re-read every queued post's age + comment count before posting off the 5/28 numbers. **Most perishable slot:** @thejustinwelsh `DY1y06ooHeM` — was 1h ultra-fresh + velocity-flagged (7 cmts/1h) on 5/27, almost certainly crowded now; fall back to `DYo62buoFAh` if >40 cmts.

---

## Stage 0 Discovery Queue

Active queue = **0** (no live triage possible). `/instagram-discover` is the bottleneck for the **11th consecutive run** (skip 5/26 + blind 5/28 + blind 5/29). PKM lane still deprioritized; Stage 0 empty since 5/20.

---

## Standing maintenance backlog (browser-independent — still unapplied)

These downgrades in `instagram-engagement-targets.md` were triggered by prior **live** observations and have been carried unapplied for 6+ warmups. They do not require a browser to apply, but they encode live-observed CTA-bait patterns, so confirm before editing the targets doc:

- **@gregisenberg → watering-hole-monitor-only** (5/26 CTA-bait trigger met: 4 of 5 grid items CTA-bait).
- **@hamptonfounders → monitor-only** (CTA-bait pattern confirmed 5/20–5/21; overdue 6+ warmups).
- **@notionhq → watering-hole-mining-only** (PKM lane officially deprioritized 5/15; overdue 12+ days).

---

## New Accounts Discovered

_None — no live scan possible._

---

## Relationship Memory Updates

_None — no live data. Profiles last refreshed 2026-05-27. Do not log new relationship-history rows from this blind run._

---

## Cadence note

5/26 skipped · 5/27 live · 5/28 blind (no browser) · 5/29 blind (no browser). The 5/27 queue has now carried forward unexecuted for 3 consecutive non-live days.
