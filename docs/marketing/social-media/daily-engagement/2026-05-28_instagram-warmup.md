<!-- docs/marketing/social-media/daily-engagement/2026-05-28_instagram-warmup.md -->

# Instagram Warmup - May 28, 2026

**Date:** 2026-05-28
**Account:** ⚠️ **UNVERIFIED** — no live session this run (see blocker below). Intended handle is **@djwayne3**; `/instagram-reply` MUST verify the active handle before any action.
**Scan Time:** Thursday 2026-05-28 (no live scan performed)
**Status:** ⚠️ **BLIND CARRY-FORWARD — NOT A LIVE STAGE 1.** Ready for `/instagram-reply` ONLY after live re-verification of every slot.

---

## ⚠️ BLOCKER — NO LIVE SCAN THIS RUN

**`browser_limitation: chrome_extension_not_connected`**

- `tabs_context_mcp` returned: "Browser extension is not connected."
- `list_connected_browsers` returned an empty list (`[]`) — no Chrome extension instance reachable on this account at all.
- This is **distinct** from the previously-documented `instagram_session_logged_out` (where the account picker redirects to `/accounts/login/`). Here there is **no browser to drive** — the Claude Chrome extension itself is not connected.

**What this means for today's doc:**

- **NOTHING below was live-verified.** No account verification, no notifications/stories/feed walk (Phase 2 skipped), no fresh-post scan (Phase 3 skipped), no Stage 0 triage walk, no profile refreshes.
- Every stat (age, likes, comment count, follower count, first-commenter status) is **carried forward from the last live read on 2026-05-27** and is **stale by at least 1 day**. Treat all numbers as "≥ this, last seen 5/27."
- The queue below is the **standing held-window queue** that has been stable for 6+ warmups. It is reproduced so cadence and the reply-side backlog tracking are preserved — **not** because anything was confirmed fresh today.

**Required before `/instagram-reply` posts anything today:**

1. Connect the Chrome extension and verify the active handle is **@djwayne3** (Path C: top-right Switch button → modal → `djwayne3` row is the dominant path; see `references/workflows.md`).
2. **Live-re-read every queued post** for current age + comment count, then apply each slot's drop-slot condition. Several windows are multi-day-held and could collapse at any time; the Justin DY1y06ooHeM slot was already velocity-flagged on 5/27 (7 cmts in 1h) and is the most likely to have closed.
3. Only then draft/post.

**To get a real Stage 1 today:** reconnect Chrome (claude.ai/chrome), confirm `list_connected_browsers` is non-empty, and re-run `/instagram-warmup` — it will overwrite/supersede this blind doc with a live scan.

---

## Phase 0.5 — Handle Verification

**SKIPPED — no browser.** Active handle UNVERIFIED. Intended: @djwayne3. `/instagram-reply` must verify via two signals before acting.

---

## Phase 1.5 — Stage 0 Discovery Queue Pull

Active queue confirmed empty as of last live triage (5/20). No live triage possible today.

Net Stage 0 change today: **0** (no live data). Active queue = 0 — `/instagram-discover` is the bottleneck for the **10th consecutive run** (counting skip-day 5/26 + blind-day 5/28). **PKM lane still deprioritized; Stage 0 empty since 5/20.**

---

## Notifications & Stories Activity

**SKIPPED — no browser.** No notifications, stories, feed, or relationship-signal data captured this run. (Note: on @djwayne3, Phase 2 has been personal-signal-only for the 7 prior warmups; BuildOS-side relationship signal routes through @build.os, a `/instagram-reply` concern.)

---

## Priority Summary (CARRY-FORWARD FROM 5/27 — UNVERIFIED)

> Ages shown are "as of 5/27 + 1 day" estimates. **Re-read live before trusting.**

| #   | Account         | Lane          | Topic                                                                       | Age (est, UNVERIFIED) | Comments (last seen 5/27)  | Opp Type                                                           | Mention Fit | Score | Profile                                    | Queue                 |
| --- | --------------- | ------------- | --------------------------------------------------------------------------- | --------------------- | -------------------------- | ------------------------------------------------------------------ | ----------- | ----- | ------------------------------------------ | --------------------- |
| 1   | @jayclouse      | Solo / Course | "Beware blanket 'get comfortable with AI' — name your trial problems"       | ~7d                   | 0 (FIRST, held 6d on 5/27) | Held first-commenter window (now ~7d if intact) + warmest peer     | 1-2         | 99    | ../../instagram-profiles/jayclouse.md      | Queued                |
| 2   | @dickiebush     | Solo          | "3-part Mental Rut framework / Step #2: **Brain dump anything on my mind**" | ~3d                   | 1 (bot `cognivalai` only)  | Literal BuildOS-vocab anchor; slot wide-open if real cmts still ≤2 | 2           | 96    | ../../instagram-profiles/dickiebush.md     | Queued                |
| 3   | @nathanbarry    | Solo / AI     | Kit MCP demo                                                                | ~7d                   | 1 (emoji-only)             | Effectively wide-open; MCP/BuildOS-vocab fit unmatched             | 2           | 92    | ../../instagram-profiles/nathanbarry.md    | Queued                |
| 4   | @thejustinwelsh | Solo          | "100% of successful people are lucky / Read · Write · Build"                | ~1d ⚠️                | 7 @1h on 5/27 (likely 40+) | Was 1h ultra-fresh on 5/27 — **most likely to have closed**        | 1-2         | 78    | ../../instagram-profiles/thejustinwelsh.md | Queued (verify first) |
| 5   | @dickiebush     | Solo / Author | "10 Timeless Writing Lessons From Gary Halbert" (#8 idea capture system)    | ~4d                   | 0 (FIRST, held 3d on 5/27) | Held first-commenter; ALT to #2                                    | 0-1         | 88    | ../../instagram-profiles/dickiebush.md     | Alt                   |
| 6   | @nathanbarry    | Solo          | "What happens after you accomplish your goals?"                             | ~2d                   | 1 (emoji-only)             | Soft Solo bridge; ALT to #3                                        | 0-1         | 76    | ../../instagram-profiles/nathanbarry.md    | Alt                   |
| 7   | @thejustinwelsh | Solo          | "Most people are building someone else's life by accident"                  | ~6d                   | 35 on 5/27 (still <100)    | Carry-forward (13th+ consecutive day); ALT to #4                   | 1           | 64    | ../../instagram-profiles/thejustinwelsh.md | Alt                   |

**Lane balance:** Solo 7 (Jay / Bush x2 / Nathan x2 / Justin x2) / ADHD 0 / PKM 0 / AI 0 / Course 0 / Author 0 / WateringHole 0 → **PASS** (≥4 non-ADHD, ≤1 ADHD).

> ⚠️ Lane balance "passes" but is structurally the same all-Solo standing queue that has run for 6+ warmups. The real gap — fresh non-Solo lane sourcing — **cannot be addressed without a live scan or `/instagram-discover`.** Do not read this PASS as queue health.

**Same-account-once-per-day:**

- Bush: pick #2 (DYu-n-RiDuW, vocab fit 2) **or** #5 (DYsZzxniCGc, held first-commenter) — not both.
- Nathan: pick #3 (DYkkfBZPcki, MCP fit 2) **or** #6 (DYxCR2mi3uU) — not both.
- Justin: pick #4 (DY1y06ooHeM) **or** #7 (DYo62buoFAh) — not both. **Verify #4 is not crowded before choosing it over #7.**

---

## Reply Queue (CARRY-FORWARD — VERIFY EACH LIVE BEFORE POSTING)

| #   | Account         | Lane          | Post Link                                               | Opp Type                                  | Strategic Role             | Mention Fit | Profile                                    | Reply Angle (verify freshness first)                                                                                                                                                                                                                                                                 |
| --- | --------------- | ------------- | ------------------------------------------------------- | ----------------------------------------- | -------------------------- | ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @jayclouse      | Solo / Course | https://www.instagram.com/jayclouse/p/DYkQa6SDR_w/      | Held first-commenter (~7d if intact)      | Peer-tier (11.4K, warmest) | 1-2         | ../../instagram-profiles/jayclouse.md      | DJ's "Monday-morning amnesia" trial problem (open Cursor, no memory of Friday's ship, hour reloading context) → BuildOS as consequence of the lived problem. Flat declarative register; no exclamation; no "Simpsons character" callback. **Drop-slot if cmts >5 at execution.**                     |
| 2   | @dickiebush     | Solo          | https://www.instagram.com/dickiebush/p/DYu-n-RiDuW/     | Bot-only cmt; literal "brain dump" anchor | Peer (26.8K, followed)     | 2           | ../../instagram-profiles/dickiebush.md     | Anchor on "brain dump" (Bush Step #2); lived 3-part pattern; coffee-shop brain dump surfaced the structure-extractor concept. Don't mirror his 3-step list. No product name (recent ~4w grid mention — don't double-dip). **Drop-slot if real non-bot cmts >2.** Pick #2 OR #5.                      |
| 3   | @nathanbarry    | Solo / AI     | https://www.instagram.com/nathanbarry/reel/DYkkfBZPcki/ | Effectively wide-open; MCP fit 2          | Peer-tier (11.9K)          | 2           | ../../instagram-profiles/nathanbarry.md    | Opt 2 (BuildOS MCP parallel, fit 2): write-vs-read scope is the hard problem; how is undo on Kit being thought about. Avoid congrats-cheer / "huge!" / feature-listing. **Drop-slot if cmts >20.** Pick #3 OR #6.                                                                                    |
| 4   | @thejustinwelsh | Solo          | https://www.instagram.com/thejustinwelsh/p/DY1y06ooHeM/ | Was 1h ultra-fresh 5/27 — likely crowded  | Peer/aspirational (89.7K)  | 1-2         | ../../instagram-profiles/thejustinwelsh.md | ⚠️ **Verify cmt count FIRST — this was velocity-flagged (7 cmts in 1h).** If still <40: anchor on the "Build" verb — first-week-of-shipping BuildOS moment where building forced clarity reading+writing hadn't. Flat declarative; no "facts"/"this hits". **Drop-slot if cmts >40.** Pick #4 OR #7. |
| 5   | @dickiebush     | Solo / Author | https://www.instagram.com/dickiebush/p/DYsZzxniCGc/     | Held first-commenter; ALT to #2           | Peer (26.8K, followed)     | 0-1         | ../../instagram-profiles/dickiebush.md     | **Only if `/instagram-reply` skips #2.** One concrete lesson DJ has lived — lesson #7 "fast first draft" (brain-dump) OR #8 "idea capture system". No listicle-cheerleading, no Gary Halbert canon-citing. **Drop-slot if cmts >15.**                                                                |
| 6   | @nathanbarry    | Solo          | https://www.instagram.com/nathanbarry/reel/DYxCR2mi3uU/ | Soft Solo bridge; ALT to #3               | Peer-tier (11.9K)          | 0-1         | ../../instagram-profiles/nathanbarry.md    | **Only if `/instagram-reply` skips #3.** Lived moment: shipping a BuildOS milestone and realizing the project itself is the answer to "after the goal." No gushing about the question. **Drop-slot if cmts >10.**                                                                                    |
| 7   | @thejustinwelsh | Solo          | https://www.instagram.com/thejustinwelsh/p/DYo62buoFAh/ | Carry-forward (13th+ day); ALT to #4      | Peer/aspirational (89.7K)  | 1           | ../../instagram-profiles/thejustinwelsh.md | **Only if `/instagram-reply` skips #4.** Curri Linear "just look at my pull requests" anchor — catching himself building someone else's script. Flat-declarative; don't mirror "building someone else's life" back. **Drop-slot if cmts >100.**                                                      |

---

## Post Opportunities

> Full per-post writeups, relationship intel, and reply-angle detail are unchanged from **2026-05-27_instagram-warmup.md** (sections 1–7). They are not duplicated here because nothing was re-observed live today. Read that doc alongside this one. The only delta today is: **+1 day of staleness on every stat, and no live confirmation that any window is still open.**

Key per-slot watch-items for the live re-check:

1. **@jayclouse DYkQa6SDR_w** — was 6d/0 cmts (held first-commenter) on 5/27. If still 0 cmts at ~7d, this remains the single highest-value slot and the structural story of the week. Confirm "No comments yet" still renders.
2. **@dickiebush DYu-n-RiDuW** — was 2d / 1 bot cmt (`cognivalai`). Confirm real (non-bot) cmts still ≤2. `cognivalai` is a known false-first-commenter bot.
3. **@nathanbarry DYkkfBZPcki** (Kit MCP) — was 6d / 1 emoji cmt. Confirm still ≤ a few low-signal cmts.
4. **@thejustinwelsh DY1y06ooHeM** — ⚠️ highest collapse risk. Was 1h / 132 likes / 7 cmts and velocity-flagged on 5/27. **If now >40 cmts, drop to #7 (DYo62buoFAh).**

---

## New Accounts Discovered

| Account | Followers | Theme | Suggested Tier | Strategic Role | Why                                                                                            |
| ------- | --------- | ----- | -------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| _none_  | —         | —     | —              | —              | No live scan — no discovery possible. `/instagram-discover` remains the bottleneck (10th run). |

---

## Competitor Intelligence

Not scanned (no browser). Carry-forward only:

- **@theadhdtools** — 75.3K as of 5/11; recheck overdue ~2.5 weeks. Needs a live recheck.
- **@danidonovan** — Competitor Intel only, no engagement.

---

## Strategy Observations

1. **No live scan ran today — Chrome extension not connected.** This is the operational story of the run. The doc is a cadence-preserving carry-forward, not a Stage 1.
2. The standing all-Solo held-window queue (Jay / Nathan MCP / Bush brain-dump) has now been flagged across **7 warmups without confirmed execution**. The bottleneck remains structurally on the reply side and on `/instagram-discover` seeding — neither of which a warmup can fix.
3. **`/instagram-discover` 10 consecutive runs without seeding.** Stage 0 empty since 5/20. PKM lane blocked. Author-lane `#amwriting Recent Reels` walk still untouched.
4. **Carry-forward downgrade backlog still unapplied** in `instagram-engagement-targets.md`: @gregisenberg → monitor-only (5/26 trigger met), @hamptonfounders → monitor-only (overdue 6+ warmups), @notionhq → watering-hole-mining-only (overdue 12+ days). A maintenance pass should apply these regardless of browser state.
5. **Justin DY1y06ooHeM is the most perishable carry-forward** — verify live before choosing it over the DYo62buoFAh carry.

---

## Relationship Memory Updates

| Account | Profile | Update                                                                                                                                                                                                                             |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _none_  | —       | **No profile refreshes today** — no live data. Profiles last refreshed 2026-05-27. Do not log new relationship-history rows from this blind run; refresh on the next live warmup or in `/instagram-reply` after live verification. |

---

## Open Operational Notes

- **Reconnect Chrome and re-run `/instagram-warmup` for a real Stage 1.** This blind doc should be superseded by a live scan as soon as the extension is connected.
- **`/instagram-reply` must live-verify the active handle AND every queued post's freshness/comment-count before posting.** Do not post off this doc's stale numbers.
- **Blocker to log:** `browser_limitation: chrome_extension_not_connected` (no extension instance reachable; `list_connected_browsers` returned `[]`). New limitation variant — distinct from `instagram_session_logged_out`.
- Cadence note: 5/26 skipped, 5/27 live, 5/28 blind (no browser). 5/27's queue carried forward unexecuted.
