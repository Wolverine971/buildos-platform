<!-- docs/marketing/social-media/daily-engagement/2026-07-01_instagram-warmup.md -->

# Instagram Warmup - July 1, 2026

**Date:** 2026-07-01
**Account:** @djwayne3 — **NOT ACTIVE / NOT SCANNED** (see blocker below)
**Scan Time:** ~midday ET
**Status:** STAGE 1 BLOCKED — `browser_limitation: instagram_session_logged_out` (djwayne3). Provisional memory-derived queue below; **all items require live verification at reply-time.**

---

## ⛔ Account Blocker (Phase 0.5)

**Live scanning did not run.** Browser opened logged into **@9takesdotcom** (avatar alt `9takesdotcom's profile picture` + sidebar profile link `/9takesdotcom/` + top-right widget "9takesdotcom / 9takes · Enneagram & Personality"). Attempted to switch to @djwayne3:

- **Path C (top-right "Switch" button):** opened a blank **login form** (username + password), not an account picker.
- **Path A (Settings → Switch accounts):** same result — routed straight to the login form.

There is **no one-click `djwayne3` row** in either flow; Instagram is demanding a full password re-login for the account. Per the skill's stop rule and Phase 0.5 step 6, this is `instagram_session_logged_out` for @djwayne3 — the account is known to the device (the "Suggested for you" rail even shows "Followed by djwayne3"), but its session cookie is no longer valid for a one-click switch. **DJ must refresh the @djwayne3 login manually.** Credentials were not entered (prohibited).

**Consequence:** notifications, stories, feed, freshness (`/api/v1/feed/user/<id>/`), and comment-section states could NOT be checked this run. The queue below is **derived from prior-run relationship memory (6/29 + 6/30 warmups + candidates.md)**, not from a live scan. It is a warm-start for `/instagram-reply`, valid ONLY after the session is restored and each post is re-pulled for current freshness/comment count.

**Action for DJ:** re-log into @djwayne3 in Chrome, then run `/instagram-reply 2026-07-01` (or re-run `/instagram-warmup` for a true live scan). If re-login isn't happening today, the queue can carry to the next session with a freshness re-check.

---

## Notifications & Stories Activity

**Notifications Checked:** No — account logged out (see blocker). Last-known (6/30): all inbound personal/Marines-network; **zero strategic/BuildOS-lane inbound** — consistent across every prior run.
**Stories Viewed:** No — logged out. Last-known: story tray is the personal/Marines network; no strategic accounts.
**Feed Highlights:** N/A — logged out.
**Relationship Signals:** Unverifiable this run. **Standing open loop carried forward:** unopened @build.os attachment DM from @leaturnerholt (~2026-03-30) — still the single highest inbound signal in the series; her `DaK1cwhgHtu` HoLT post held a 0-comment FCW through 6/30 (24.5h, unexecuted).

---

## Priority Summary (PROVISIONAL — memory-derived, live-verify required)

| #   | Account            | Lane         | Topic (last-known)                        | Age (last-known) | Comments | Opp Type                                 | Mention Fit | Score | Profile                                 | Queue       |
| --- | ------------------ | ------------ | ----------------------------------------- | ---------------- | -------- | ---------------------------------------- | ----------- | ----- | --------------------------------------- | ----------- |
| 1   | @leaturnerholt     | Solo         | HoLT community (`DaK1cwhgHtu`)            | 24.5h @ 6/30     | 0        | Carried 0c FCW + highest rel. value      | 0           | 90    | instagram-profiles/leaturnerholt.md     | Provisional |
| 2   | @thejustinwelsh    | Solo         | "Talent is overrated" (`DaNV2h2FunP`)     | 1.1h @ 6/30      | 2        | Recurring aspirational Solo peer         | 1           | 86    | instagram-profiles/thejustinwelsh.md    | Provisional |
| 3   | @vasilioskambouras | AI           | context-across-chats (`DaMdh7uK6oB`)      | 9.3h @ 6/30      | 0        | Stage-0 discovery (near-verbatim thesis) | 2           | 84    | instagram-profiles/vasilioskambouras.md | Provisional |
| 4   | @davidperell       | Author       | Harry Dry offer clip (`DaL1kUrkZ4e`)      | 15.1h @ 6/30     | 0        | Author-lane direct-engage surface        | 1           | 80    | instagram-profiles/davidperell.md       | Provisional |
| 5   | @dickiebush        | Solo         | Steve Jobs / one decision (`DaL3QorCAVM`) | 14.9h @ 6/30     | 0        | Solo peer (follows @djwayne3)            | 0           | 78    | instagram-profiles/dickiebush.md        | Provisional |
| 6   | @jayclouse         | Course       | info vs connection (`DaK7XrajcEP`)        | 23.6h @ 6/30     | 2        | Course-lane peer-educator                | 1           | 76    | instagram-profiles/jayclouse.md         | Provisional |
| 7   | @gregisenberg      | WateringHole | AI-business reel (`DaNa3AtRksf`)          | 0.4h @ 6/30      | 1        | Drought-break mining surface (re-walk)   | 1           | 72    | (no profile — mine commenters)          | Provisional |

**Lane balance:** Solo 3 (Lea, Justin, Dickie) / PKM 0 / AI 1 (Vasilios) / Course 1 (Jay) / Author 1 (Perell) / Freelance 0 / WateringHole 1 (Greg) / ADHD 0 → **PASS** (7/7 non-ADHD, 0 ADHD).

> Balance is inherited from the 6/30 shape (the most lane-diverse queue in weeks). It only holds if the posts are still the freshest surfaces at reply-time — **re-pull each account's `/api/v1/feed/user/<id>/?count=6` and prefer any newer post before commenting.**

---

## Reply Queue (PROVISIONAL — do not post without live freshness re-check)

| #   | Account            | Lane         | Last-Known Post Link                        | Opp Type                    | Strategic Role                        | Mention Fit | Profile                                 | Reply Angle (carry-forward)                                                                                                                                                                                                           |
| --- | ------------------ | ------------ | ------------------------------------------- | --------------------------- | ------------------------------------- | ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @leaturnerholt     | Solo         | https://www.instagram.com/p/DaK1cwhgHtu/    | Carried 0c FCW              | Peer / **highest relationship value** | 0           | instagram-profiles/leaturnerholt.md     | Genuine warm support for the community she built ("we truly care / we evolve"). She DM'd DJ first + liked his post — overdue. Consider opening the @build.os DM alongside. Short, UK-casual. No pitch.                                |
| 2   | @thejustinwelsh    | Solo         | https://www.instagram.com/p/DaNV2h2FunP/    | Aspirational Solo peer      | Peer / aspirational (91.4K)           | 1           | instagram-profiles/thejustinwelsh.md    | Lived agreement — the edge was never talent, it was not quitting during the long unglamorous stretch. One concrete line. No pitch. **Prefer a fresher Justin post if one exists.**                                                    |
| 3   | @vasilioskambouras | AI           | https://www.instagram.com/reel/DaMdh7uK6oB/ | Stage-0 discovery FCW       | Adjacent builder (AI×author, 1.9K)    | 2           | instagram-profiles/vasilioskambouras.md | Genuine peer-builder curiosity about HIS system for holding context across separate chats — DJ builds in this space. Relationship-start, soft, NO product name. Promote to `engaged` if it lands a reaction.                          |
| 4   | @davidperell       | Author       | https://www.instagram.com/reel/DaL1kUrkZ4e/ | Author-lane craft clip      | Watering hole / author peer (69K)     | 1           | instagram-profiles/davidperell.md       | React to ONE specific idea from the Harry Dry "impossible offer" clip. Soft "clarity is the work, not the formatting" only if natural. No recap, no plug. **Prefer his freshest craft clip.**                                         |
| 5   | @dickiebush        | Solo         | https://www.instagram.com/p/DaL3QorCAVM/    | Solo peer FCW               | Peer (27.3K, follows @djwayne3)       | 0           | instagram-profiles/dickiebush.md        | Light builder note on the one focusing decision that compounds (discipline is in what you cut). Flat declarative, first-person. NO product name (recent grid mention — don't double-dip).                                             |
| 6   | @jayclouse         | Course       | https://www.instagram.com/reel/DaK7XrajcEP/ | Course-lane essay           | Peer-educator (12.3K)                 | 1           | instagram-profiles/jayclouse.md         | Lived agreement — info is cheap now, the connection/judgment compounds. One concrete builder line. NEVER a funnel keyword, no product name.                                                                                           |
| 7   | @gregisenberg      | WateringHole | https://www.instagram.com/reel/DaNa3AtRksf/ | Mining (re-walk commenters) | Watering hole (105K) — drought break  | 1           | (mine commenters — no account profile)  | **Mining-first:** re-walk commenters, capture any sub-15K AI builder with a real grid, drop dead-floor (<1K) / funnel pages. **Direct fallback:** one early non-pitch builder comment if the section stays faceless. No product name. |

**Execution priority if time-constrained (after re-login + freshness check):** **#1 Lea** (highest relationship value, overdue, held FCW) → **#2 Justin** (aspirational, decays fast if fresh) → #3 Vasilios (discovery thesis-verbatim) → #4 Perell / #5 Dickie → #6 Jay → #7 Greg.

---

## Post Opportunities

> Full per-post detail (caption summaries, relationship intel, past touchpoints, reply-angle nuance) is carried verbatim from the **2026-06-30 warmup** `## Post Opportunities` section for all 7 accounts — none of the underlying relationship state changed (no live scan occurred). Rather than duplicate stale detail as if freshly observed, refer to `2026-06-30_instagram-warmup.md` §Post Opportunities #1–#7 for each account, and **re-verify freshness/comment-count before posting.** New per-post detail will be written on the next live scan.

Key standing notes to carry:

- **@leaturnerholt** — unopened @build.os DM (~2026-03-30) is the highest inbound signal in the series; UK-casual register; `DaK1cwhgHtu` held a 0c FCW through 6/30 (24.5h). Overdue relationship debt.
- **@vasilioskambouras** — the only Stage-0 discovery clearing the 1K floor in weeks (6/28); AI-authored captions, operator appears real; three consecutive on-thesis posts (context-across-chats / writing-with-Claude). Targets-doc AI-lane add candidate if a touch lands.
- **@gregisenberg** — mining drought BROKE 6/30 with a fresh non-CTA AI-business reel (`DaNa3AtRksf`); ~18 prior dead-walked runs; re-walk the comment section for net-new floor-passing builders.
- **@dickiebush / @nathanbarry** — watch the `cognivalai` bot as a false first-commenter (recurring on both grids).

---

## New Accounts Discovered

None — no live scan this run (account logged out). Stage-0 discovery bottleneck unchanged; @vasilioskambouras remains the sole active `queued_for_warmup` candidate (candidates.md). The peer following-graph walk (@jayclouse / @dickiebush following lists) remains the untested depth method — cannot run while logged out.

---

## Competitor Intelligence

Not scanned (logged out). @theadhdtools recheck still pending — last checked 6/08 at 80.2K, growth decelerating, funnel bio.

---

## Strategy Observations

- **NEW blocker class this run: @djwayne3 session logged out.** Unlike the recurring "opened on @dj_pew_pew / @9takesdotcom, switch via Path C" pattern (which worked 6/30 and across late May), today **both switch paths demand a full password re-login** — there is no cached one-click `djwayne3` row. This is a harder block than the prior switch-friction: it needs DJ to manually re-authenticate @djwayne3 in Chrome. Flag for `/instagram-intel`: if this recurs, the session-refresh cadence for @djwayne3 has become the top operational risk to the whole IG loop.
- **Execution debt is STILL the binding constraint, now compounded.** Last executed IG replies doc remains **2026-05-21** (~19 consecutive high-confidence queues with zero touches). A logged-out session makes even a warm queue un-actionable until re-login. Sourcing has never been the bottleneck; access + execution are.
- **The rotation is stable and warm.** Lea (relationship debt), Justin/Dickie/Nathan (Solo peers), Perell (author), Jay (course), Vasilios (AI discovery), Greg (mining) are all live surfaces as of 6/30. The moment the session is restored, `/instagram-reply` has a ready 7-item queue — no re-sourcing needed, just a freshness re-pull.
- **Multi-account hazard reconfirmed.** DJ's Chrome cycles through @9takesdotcom / @dj_pew_pew / @build.os / @djwayne3 as the landing account. Today it was @9takesdotcom AND @djwayne3's session was invalid — the first time both conditions hit together in the series.

---

## Relationship Memory Updates

| Account       | Profile                           | Update                                                                                                                                               |
| ------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| —             | —                                 | **No profile touchpoints logged this run** — no live scan (account logged out). No account was observed fresh; nothing to record beyond the blocker. |
| candidates.md | discovery/instagram/candidates.md | 7/01: no scan (djwayne3 logged out). @vasilioskambouras remains the sole `queued_for_warmup`; carry to next live session. No new discoveries.        |

---

_Provisional queue derived from 2026-06-29 + 2026-06-30 warmups and candidates.md. NOT a live scan. Re-verify every post's freshness and comment count after restoring the @djwayne3 session before executing via `/instagram-reply`._
