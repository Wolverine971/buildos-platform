<!-- docs/marketing/social-media/daily-engagement/2026-07-06_instagram-warmup.md -->

# Instagram Warmup - July 6, 2026

**Date:** 2026-07-06
**Account:** @djwayne3 (verified — browser opened **already on @djwayne3**, no switch needed. Two-signal verify: first avatar alt "djwayne3's profile picture" + sidebar profile link `/djwayne3/`. Session live and stable — fourth+ consecutive run without the 7/01 logged-out blocker.)
**Scan Time:** ~midday ET (freshness via authenticated `web_profile_info` for IDs/follower counts + `/api/v1/feed/user/<id>/?count=6` with `x-ig-app-id: 936619743392459`, pinned-post filtered; comment mining via `/api/v1/media/<pk>/comments/`; relationship signals via `direct_v2/inbox`)
**Status:** STAGE 1 COMPLETE - Ready for /instagram-reply

---

## Notifications & Stories Activity

**Notifications Checked:** Partial — `news/inbox` API returned **500 again** (persistent this stretch: same on 7/03, 7/04). DM inbox walked instead (highest-signal channel that works).
**Stories Viewed:** `reels_tray` API returned 403 this run (needs CSRF token on POST). Prior runs confirm the tray is 100% personal/Marines network — **no strategic accounts** — and nothing suggests that changed.
**Feed Highlights:** Not the freshness source this run; all timeline freshness pulled via authenticated feed API.
**Relationship Signals:** **None from a BuildOS-lane account.** DM inbox walked (API): all personal/Marines-network (@kylemellinger14 [9.7h], @glittrgraveyard [13h], @9takesdotcom [DJ's own], @j_macka, @delanelane94, @williampevytoe "Which one we doing, I'll let you choose", @terrylpruitt…). No pending-request signal surfaced. **Standing open loop carried:** unopened @build.os attachment DM from @leaturnerholt (~2026-03-30) — lives on the @build.os side, not checkable from @djwayne3. Zero strategic inbound remains consistent across the entire series.

---

## Priority Summary

| #   | Account         | Lane         | Topic                                                   | Age    | Comments | Opp Type                               | Mention Fit | Score | Profile                              | Queue    |
| --- | --------------- | ------------ | ------------------------------------------------------- | ------ | -------- | -------------------------------------- | ----------- | ----- | ------------------------------------ | -------- |
| 1   | @thejustinwelsh | Solo         | "Action beats intelligence / be the dumb action person" | 1.1h   | 7        | Ultra-fresh substantive essay          | 1           | 91    | instagram-profiles/thejustinwelsh.md | Queued   |
| 2   | @dickiebush     | Solo         | "Copywriting 101" (find the problem you solve)          | 3.3h   | 0        | Ultra-fresh 0c FCW peer (follows DJ)   | 0           | 85    | instagram-profiles/dickiebush.md     | Queued   |
| 3   | @davidperell    | Author       | "Two Kinds of People" — David Sedaris                   | 20.1h  | 8        | Fresh low-comp craft clip, high reach  | 1           | 82    | instagram-profiles/davidperell.md    | Queued   |
| 4   | @nathanbarry    | Solo         | Rapid-fire "best book you've read this year"            | 19.2h  | 0        | Fresh 0c FCW Solo peer                 | 0           | 77    | instagram-profiles/nathanbarry.md    | Queued   |
| 5   | @jayclouse      | Course       | "why I don't like the word 'marketing'"                 | 90.2h  | 1        | Aging non-CTA 1c — only Course lever   | 1           | 76    | instagram-profiles/jayclouse.md      | Queued   |
| 6   | @leaturnerholt  | Solo         | "Being bold about our values online"                    | 95.9h  | 33       | Relationship-debt carry (no new post)  | 0           | 75    | instagram-profiles/leaturnerholt.md  | Queued   |
| 7   | @gregisenberg   | WateringHole | "How I'd build an AI business" (mining)                 | 144.4h | 38       | STALE mining — relationship-start only | 0           | 66    | (no profile — mine commenters)       | Optional |

**Lane balance:** Solo 4 (Justin, Dickie, Nathan, Lea) / PKM 0 / AI 0 / Course 1 (Jay) / Author 1 (Perell) / Freelance 0 (target @awellsish counted under Greg mining) / WateringHole 1 (Greg) / ADHD 0 → **PASS**

> PASS requires: ≥4 of 5–7 items non-ADHD AND ≤1 ADHD item. This run is 7/7 non-ADHD, 0 ADHD. **PKM and AI lanes are both empty (honest):** all peer candidates rechecked this run are dormant (Marie Poulin freshest ~65d, Productivity Pixie ~53d) and @vasilioskambouras's on-thesis AI surface stayed decayed (last 3 posts are personal NYC reels — recommend demote to `monitor`). Solo-heavy is the honest read when the only non-Solo lanes with live surfaces are Author (Perell) and Course (Jay).

---

## Reply Queue

| #   | Account         | Lane         | Topic                     | Post Link                                   | Opp Type                        | Strategic Role                        | Mention Fit | Profile                              | Reply Angle                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------- | ------------ | ------------------------- | ------------------------------------------- | ------------------------------- | ------------------------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @thejustinwelsh | Solo         | action beats intelligence | https://www.instagram.com/p/Dacyn5-DIg-/    | Ultra-fresh essay (7c, 1.1h)    | Peer / aspirational (92.2K)           | 1           | instagram-profiles/thejustinwelsh.md | Lived agreement w/ one concrete line — the whole BuildOS pivot was "ship the messy version and fix it live" vs. thinking it perfect first. Brain-dump-as-just-start is a natural soft hook (fit 1, don't force). No pitch. **Move FAST while ultra-fresh (1.1h).**                                                                                      |
| 2   | @dickiebush     | Solo         | copywriting 101           | https://www.instagram.com/p/DacjTNOqASM/    | Ultra-fresh 0c FCW (3.3h)       | Peer (27.4K, follows @djwayne3)       | 0           | instagram-profiles/dickiebush.md     | One flat declarative lived line — "find the problem you solve, find 7 reasons it's a problem" is the exact work DJ does before writing anything about BuildOS; the reasons-it's-a-problem list is where most people quit. First-person. NO product name (recent grid mention — don't double-dip). Watch `cognivalai` bot.                               |
| 3   | @davidperell    | Author       | Sedaris — two kinds       | https://www.instagram.com/reel/DaawA8hG9uG/ | Fresh low-comp clip (8c, 20.1h) | Watering hole / author peer (74.9K)   | 1           | instagram-profiles/davidperell.md    | Quiet lived register — react to ONE specific idea from the Sedaris clip. Not a recap, not coach voice. No plug unless it truly slots. Freshest + least-crowded of his current batch; supersedes 7/04 Pinker `DaWTV6kAfQG` (now 61.6h/1c).                                                                                                               |
| 4   | @nathanbarry    | Solo         | best book this year       | https://www.instagram.com/reel/Daa26CFhrgR/ | Fresh 0c FCW (19.2h)            | Peer (12.7K)                          | 0           | instagram-profiles/nathanbarry.md    | Cheerleader/curious — just genuinely answer the rapid-fire question with one real book + one line why. Warm, short, human. NO product name. **Substantive alt if you'd rather:** `DaYHzLHAby4` (44.7h/3c, "founders who scale too fast") is a stronger DJ-voice surface. Watch `cognivalai` bot.                                                        |
| 5   | @jayclouse      | Course       | dislike "marketing"       | https://www.instagram.com/reel/DaTPCO9FUcE/ | Aging non-CTA 1c (90.2h)        | Peer-educator (12.3K)                 | 1           | instagram-profiles/jayclouse.md      | Lived agreement — "marketing" collapses into slop the second it stops being a real person saying a real thing. One builder line. NEVER a funnel keyword ("COHORT"), no product name. Still 1c at 90h; guaranteed-visible but aging — touch before the next CTA launch post.                                                                             |
| 6   | @leaturnerholt  | Solo         | bold about your values    | https://www.instagram.com/p/DaSnrJcjPKQ/    | Relationship debt (33c, 95.9h)  | Peer / **highest relationship value** | 0           | instagram-profiles/leaturnerholt.md  | Warm, specific support — being loud about values online IS the scary/right thing; name what she actually stands for. She DM'd DJ first + liked his comment — overdue. Short, UK-casual. Decide the @build.os DM-open alongside. Age-insensitive (relationship, not reach). No pitch.                                                                    |
| 7   | @gregisenberg   | WateringHole | AI business mining        | https://www.instagram.com/reel/DaNa3AtRksf/ | STALE mining (38c, 144.4h)      | Watering hole (130.4K)                | 0           | (mine commenters)                    | **@awellsish** (1.6K, founder @imprintmarketing, verified) still in-thread (his API-key/tool-sprawl comment, now 117h). Reply is relationship-start only — the 144h thread has near-zero reach. NEVER reply to Greg directly. **This is the last carry — if not touched, formally drop and re-source a fresher Greg thread via `/instagram-discover`.** |

**Execution priority if time-constrained:** **#1 Justin (1.1h, decays fastest)** → #2 Dickie (3.3h/0c FCW) → #3 Perell (fresh + reach) → #4 Nathan (0c FCW) → #5 Jay (non-CTA 1c, aging) → #6 Lea (relationship debt, age-insensitive) → #7 Greg→@awellsish (last carry, drop-eligible).

---

## Post Opportunities

### 1. @thejustinwelsh — "Action beats intelligence / be the dumb action person" ⭐ ULTRA-FRESH

**Post Link:** https://www.instagram.com/p/Dacyn5-DIg-/
**Content Type:** Feed Post (text essay)
**Stats:** 236 likes / **7 comments** (1.1h — ultra-fresh)
**Opportunity Type:** Ultra-fresh substantive solo-builder essay
**Connected BuildOS Angle:** Soft — "start messy, ship the imperfect version" is the brain-dump / just-start ethos. Mention fit 1 (optional; don't force).
**Profile File:** instagram-profiles/thejustinwelsh.md — **Profile Status:** Existing
**Strategic Role:** Peer / aspirational (**92,204 followers — still climbing:** 91,920 → 92,204)

**Caption Summary:**

> "Action beats intelligence. So be the 'dumb' action person. The person who starts the messy and ships the imp[erfect]…"

**Why This Post:** Justin's newest at 1.1h/7c — supersedes the 7/04 "24 hours" (`DaVEPPHlgUe`, now 73.1h/71c). "Ship the messy version" is one of the cleanest lived surfaces for DJ in the whole rotation (the entire agentic pivot was shipping through "this isn't ready"). 7 comments only — visibility decays fast on 92.2K; execute first.

**Why This Account Matters Now:** Largest aspirational Solo peer in the rotation; durably re-qualified (9+ consecutive substantive non-CTA essays).
**Relationship Intel:** No inbound yet; visibility/relationship-build play. ~22 consecutive queues with no executed touch.
**Past Touchpoints:** Queued repeatedly May–July; none executed since 5/21.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** Lived agreement — one concrete moment DJ shipped the messy version and fixed it live. Avoid: mirroring the caption, "so true," any pitch.
**Queue Status:** Queued — **EXECUTE FIRST.**

---

### 2. @dickiebush — "Copywriting 101" (find the problem you solve) ⭐ ULTRA-FRESH 0c FCW

**Post Link:** https://www.instagram.com/p/DacjTNOqASM/
**Content Type:** Feed Post
**Stats:** 9 likes / **0 comments** (3.3h — wide-open first-commenter window)
**Opportunity Type:** Ultra-fresh 0c FCW on a Solo peer who follows DJ
**Connected BuildOS Angle:** None direct. Mention fit 0.
**Profile File:** instagram-profiles/dickiebush.md — **Profile Status:** Existing
**Strategic Role:** Peer (27,364 followers, follows @djwayne3)

**Caption Summary:**

> "Copywriting, 101. 1. Find the problem you solve 2. Find 7 reasons it's a problem 3. Find 7…"

**Why This Post:** Cleanest window in the run — 0 comments at 3.3h on a peer who follows DJ, freshest of his grid (first 3 items are pinned; supersedes 7/04 Munger `DaV-bWuiHOA`, now 64.7h/1c). "Find the problem you solve / 7 reasons it's a problem" is the exact pre-writing work DJ does — a natural flat-declarative surface.

**Relationship Intel:** Follows @djwayne3. `cognivalai` bot recurs as false first commenter.
**Past Touchpoints:** ~20 consecutive non-executing queues.
**BuildOS Mention Fit:** 0
**Reply Angle for `/instagram-reply`:** One flat declarative lived line — the "7 reasons it's a problem" step is where most people quit; that list is the whole thing. First-person. Avoid: listicle response, product name (recent grid mention — don't double-dip).
**Queue Status:** Queued.

---

### 3. @davidperell — "Two Kinds of People" — David Sedaris (fresh craft clip)

**Post Link:** https://www.instagram.com/reel/DaawA8hG9uG/
**Content Type:** Reel (How I Write clip)
**Stats:** 416 likes / **8 comments** (20.1h — low-mid competition)
**Opportunity Type:** Fresh, high-reach author/craft clip with a low-comp comment section
**Connected BuildOS Angle:** Soft. Mention fit 1 (optional).
**Profile File:** instagram-profiles/davidperell.md — **Profile Status:** Existing
**Strategic Role:** Watering hole / author peer (**74,879 followers — climbing fast:** 73,350 → 74,879, +1.5K in ~2 days)

**Caption Summary:**

> "There Are Two Kinds of People - David Sedaris. Full episode available on YouTube"

**Why This Post:** Perell's freshest new clip (20.1h/8c) supersedes the 7/04 Pinker (`DaWTV6kAfQG`, now 61.6h/1c). He's mid-run on a fresh Sedaris/Stanton batch (`DaYJmD4gBgg` "Just Write The Bad Sentence" 44.4h/19c is the substantive alt). One of the two highest-reach direct surfaces in the rotation.

**Why This Account Matters Now:** Reach + freshness engine (+1.5K in ~2 days). How-I-Write clips are consistently the highest DJ-voice-fit surface in the author lane.
**Relationship Intel:** No inbound; visibility/relationship-build play.
**Past Touchpoints:** Queued near-daily since May; none executed.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** React to ONE specific idea from the clip. Avoid: recap, mindset-coach voice, forced plug.
**Queue Status:** Queued.

---

### 4. @nathanbarry — Rapid-fire "best book you've read this year" (0c FCW)

**Post Link:** https://www.instagram.com/reel/Daa26CFhrgR/
**Content Type:** Reel
**Stats:** 17 likes / **0 comments** (19.2h — first-commenter window)
**Opportunity Type:** Fresh 0c FCW Solo peer
**Connected BuildOS Angle:** None. Mention fit 0.
**Profile File:** instagram-profiles/nathanbarry.md — **Profile Status:** Existing
**Strategic Role:** Peer (12,695 followers)

**Caption Summary:**

> "Rapid fire questions 🔥 What's the best book you've read in the last year?"

**Why This Post:** Nathan's freshest (19.2h/0c) — a low-friction relationship touch (just genuinely answer). **Substantive alternate:** `DaYHzLHAby4` (44.7h/3c, "founders who scale too fast end up with…") is a stronger DJ-voice surface if you'd rather anchor in lived building; pick ONE Nathan post.

**Relationship Intel:** No inbound; `cognivalai` bot recurs as false first commenter.
**Past Touchpoints:** Queued repeatedly; none executed.
**BuildOS Mention Fit:** 0
**Reply Angle for `/instagram-reply`:** Cheerleader/curious — one real book + one line why. Warm, short, human. Avoid: performing a reading list, product name.
**Queue Status:** Queued.

---

### 5. @jayclouse — "why I don't like the word 'marketing'" (aging non-CTA 1c)

**Post Link:** https://www.instagram.com/reel/DaTPCO9FUcE/
**Content Type:** Reel
**Stats:** 17 likes / **1 comment** (90.2h — still 1c)
**Opportunity Type:** The one substantive non-CTA Jay post in the current cohort-launch cycle — still 1c after 90h
**Connected BuildOS Angle:** Soft — authenticity vs. slop maps to the anti-AI "lead with relief" stance. Mention fit 1.
**Profile File:** instagram-profiles/jayclouse.md — **Profile Status:** Existing
**Strategic Role:** Peer-educator (12,281 followers)

**Caption Summary:**

> "Marketing this video about why I don't like the word 'marketing' feels a little ironic. I thin[k]…"

**Why This Post:** Carried from 7/03/7/04 and STILL only 1 comment at 90.2h — no new Jay post. His surrounding posts (`DaQsbiMvXPH`, `DaQSr94Es2T`) are "Comment COHORT" membership-launch CTA-bait — the pattern that drops the course lane. This is the only live Course-lane window; it's aging but still guaranteed-visible.

**Why This Account Matters Now:** Only active Course-lane peer; comment section = creator-educators running courses + newsletters.
**Relationship Intel:** No inbound. Cohort launch cycle still running around this post.
**Past Touchpoints:** Queued 6/30, 7/03, 7/04; not executed.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** Lived agreement — "marketing" turns to slop the second it stops being a real person saying a real thing. One builder line. Avoid: funnel keywords, product name, guru voice.
**Queue Status:** Queued.

---

### 6. @leaturnerholt — "Being bold about our values online" (relationship debt)

**Post Link:** https://www.instagram.com/p/DaSnrJcjPKQ/
**Content Type:** Carousel
**Stats:** likes hidden / 33 comments (95.9h)
**Opportunity Type:** Warm-support surface on the highest-relationship-value account (FCW gone; relationship debt is the point)
**Connected BuildOS Angle:** None. Mention fit 0.
**Profile File:** instagram-profiles/leaturnerholt.md — **Profile Status:** Existing
**Strategic Role:** Peer / **highest relationship value** (24,223; she DM'd DJ first)

**Caption Summary:**

> "Being bold about our values online can feel scary, but it's how the right people find you. The ones…"

**Why This Post:** No new Lea post since 7/03 — `DaSnrJcjPKQ` is still her freshest non-pinned (now 95.9h/33c). The reason to touch is the standing relationship debt (unopened @build.os DM + her comment-like), not reach. Values-forward content is an ideal warm-support surface.

**Relationship Intel:** Standing open loop — unopened @build.os attachment DM (~2026-03-30); she liked DJ's comment 5/7. UK-casual register.
**Past Touchpoints:** DM'd first (never opened); liked his comment; queued 6/21–7/04, never executed.
**BuildOS Mention Fit:** 0
**Reply Angle for `/instagram-reply`:** Warm, specific support — name what she actually stands for; being loud about values online IS the scary/right thing. Short, UK-casual. Decide the @build.os DM-open alongside. Avoid: pitch, length, performative energy.
**Queue Status:** Queued.

---

### 7. @gregisenberg — "How I'd build an AI business" mining slot ⭐ STALE (LAST CARRY)

**Post Link:** https://www.instagram.com/reel/DaNa3AtRksf/
**Content Type:** Reel
**Stats:** 1,294 likes / 38 comments (144.4h)
**Opportunity Type:** Watering-hole commenter mining — comment section re-walked via API this run
**Connected BuildOS Angle:** None. Mention fit 0.
**Profile File:** (no profile — mine commenters)
**Strategic Role:** Watering hole (130,408 followers)

**Why This Post:** Greg's freshest is STILL this reel (no newer post; `DZ8Pin_R-1p` "Agentic AI for boring businesses" is 304.5h old). Comment section re-walked — @awellsish's comment is still live in-thread (117h), @andyghooper too (138h). But the thread is now **144h old — reach is effectively zero**; value is relationship-start only (guaranteed-visible to a 1.6K founder).

- **@awellsish** — 1,622f, verified, founder & CEO @imprintmarketing. "the manually managing api keys bit is painfully real. ours live in a password manager, two .env files and one guy's memory" — lived operator pain, perfect reply surface (DJ has real API-key-sprawl experience). Freelance-lane. Also the Stage-0 `new` candidate → this slot satisfies the Stage-0 requirement.
- **@andyghooper** — 1,741f, verified, "The toolkit shifts. The structural problems don't." Operator-grade; funnel-link bio flag.
- New this walk: @andsuwara (19.9h, "any video editor that can edit reels like Greg's?") — tool-shopping question, not an operator-pain surface, low fit → skip.

**Reply Angle for `/instagram-reply`:** Reply to @awellsish's API-key/tool-sprawl comment with lived agreement — one concrete line, no product name. NEVER reply to Greg directly.
**Queue Status:** Optional — **144h thread, reach dead. Execute as relationship-start OR formally drop and re-source a fresher Greg thread via `/instagram-discover`. This is the final carry.**

---

## New Accounts Discovered

| Account | Followers | Theme | Suggested Tier | Strategic Role | Why                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------- | ----- | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —       | —         | —     | —              | —              | No net-new floor-passing lane-fit discovery this run. Greg comment re-walk surfaced only known accounts (@awellsish, @andyghooper pre-qualified) + @andsuwara (tool-shopping question, low fit). PKM peers (Marie Poulin, Productivity Pixie) dormant; #amwriting/#writingcommunity APIs still return 0 recent media. `/instagram-discover` remains the queue-depth unblocker. |

---

## Competitor Intelligence

Not re-scanned this run (last recheck 7/02: @theadhdtools at 81.6K, content drought, funnel bio, threat declining — next recheck ~7/16). @danidonovan / @theadhdtools remain Competitor-Intel / Monitor only.

---

## Strategy Observations

- **Execution debt remains THE binding constraint — now the dominant finding of the series.** Last executed replies doc is still **2026-05-21** (~22 consecutive high-confidence queues, zero touches). This run again surfaces genuine fresh windows — TWO ultra-fresh (Justin 1.1h/7c, Dickie 3.3h/0c) plus a fresh author clip (Perell 20.1h) and a 0c FCW (Nathan 19.2h). Sourcing quality is not the problem; **running `/instagram-reply 2026-07-06` is worth more than any further scanning.** Recommend flagging this to DJ directly — the warmup engine is healthy but the reply engine has been dark for ~6 weeks.
- **Solo lane is carrying the run; PKM + AI are both dead.** Marie Poulin (freshest ~65d, personal), Productivity Pixie (~53d) confirm PKM peers dormant again. @vasilioskambouras's on-thesis AI surface never refreshed — his last 3 posts are personal NYC reels (July 4th walk 19.2h/0c, heat-wave 59.8h/1c). **Recommend demoting @vasilioskambouras to `monitor` in candidates.md** (the 7/04 doc already flagged this; it's now confirmed a second run). AI lane on IG is structurally supplied only by Greg mining, which is stale.
- **Greg mining has fully aged out.** `DaNa3AtRksf` is now 144h with no fresher Greg post since 6/30. The pre-qualified targets held (@awellsish, @andyghooper) but reach is dead. Per the 7/04 "execute or drop" flag, this is the final carry — `/instagram-discover` needs to re-source a fresher AI-builder watering hole (Greg's next reel, or @hamptonfounders / @nathanbarry comment sections).
- **Perell + Justin are the reach + freshness engines.** Perell +1.5K in ~2 days (73.4K → 74.9K); Justin +0.3K to 92.2K. Both post multiple substantive daily surfaces with comment sections that stay low-comp relative to reach — the two highest-visibility direct surfaces in the rotation. Author lane is fully suppliable via Perell direct without hashtag mining.
- **Notifications + stories APIs remain degraded** (`news/inbox` 500, `reels_tray` 403). DM inbox is the only working relationship channel and shows zero strategic inbound — consistent across the series. Not blocking, but flag that relationship-signal detection is currently DM-only.

---

## Relationship Memory Updates

| Account            | Profile                                 | Update                                                                                           |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| @thejustinwelsh    | instagram-profiles/thejustinwelsh.md    | Logged 7/06 queue row (ultra-fresh `Dacyn5-DIg-` 1.1h/7c); follower 92.2K (climbing)             |
| @dickiebush        | instagram-profiles/dickiebush.md        | Logged 7/06 queue row (ultra-fresh `DacjTNOqASM` 3.3h/0c FCW)                                    |
| @davidperell       | instagram-profiles/davidperell.md       | Logged 7/06 queue row (fresh Sedaris `DaawA8hG9uG` 20.1h/8c); follower velocity 74.9K (+1.5K/2d) |
| @nathanbarry       | instagram-profiles/nathanbarry.md       | Logged 7/06 queue row (fresh `Daa26CFhrgR` 19.2h/0c; alt `DaYHzLHAby4` 44.7h/3c)                 |
| @jayclouse         | instagram-profiles/jayclouse.md         | Logged 7/06 carry row (`DaTPCO9FUcE` still 1c at 90.2h — non-CTA window holding but aging)       |
| @leaturnerholt     | instagram-profiles/leaturnerholt.md     | Logged 7/06 carry row (`DaSnrJcjPKQ` 95.9h/33c, no new post — relationship debt persists)        |
| @vasilioskambouras | instagram-profiles/vasilioskambouras.md | Logged 7/06 — on-thesis surface still decayed (personal NYC reels only); **demote to `monitor`** |
| candidates.md      | discovery/instagram/candidates.md       | @awellsish carried (mining, unexecuted, FINAL carry); @vasilioskambouras → `monitor`             |

---

_Next command: `/instagram-reply 2026-07-06` — session is live (on @djwayne3), queue is verified-fresh as of this scan. Execution priority: Justin (1.1h) → Dickie (3.3h/0c) → Perell (fresh + reach) → Nathan (0c FCW) → Jay (non-CTA 1c) → Lea (relationship debt) → Greg→@awellsish (final carry, drop-eligible)._
