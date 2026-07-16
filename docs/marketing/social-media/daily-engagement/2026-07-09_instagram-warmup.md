<!-- docs/marketing/social-media/daily-engagement/2026-07-09_instagram-warmup.md -->

# Instagram Warmup - July 9, 2026

**Date:** 2026-07-09
**Account:** @djwayne3 (NOT browser-verified this run — see limitation below. No account-bound actions were taken; the entire scan ran via Instagram's public unauthenticated `web_profile_info` API from this machine, which requires no session and attributes nothing to any account.)
**Scan Time:** ~midday ET (freshness via public `web_profile_info` API with `x-ig-app-id: 936619743392459` — returns follower counts + last 12 posts per account with timestamps/comment counts; pinned-post filtered via `pin` flag + age inversion)
**Status:** STAGE 1 COMPLETE - Ready for /instagram-reply — **BUT reply pass requires the Chrome extension fixed first (see limitation)**

> **`browser_limitation: chrome_extension_not_connected`** — The Claude Chrome extension returned "not connected" across 4 attempts (Chrome confirmed running; `list_connected_browsers` returned empty; opening a page didn't wake it). Likely needs a Chrome restart or extension re-auth on DJ's side. Consequences this run: **no account verification, no notifications, no stories, no DM inbox, no in-app comment walks** (Greg mining comments API is auth-walled from CLI). Freshness sweep still ran in full via the public API — same data quality as prior runs for follower counts + post freshness. **`/instagram-reply` cannot run until the extension reconnects.**

---

## Notifications & Stories Activity

**Notifications Checked:** No — `news/inbox` requires the authenticated browser session (extension down). Prior runs (through 7/08) showed zero strategic inbound consistently; nothing suggests that changed, but it is unverified today.
**Stories Viewed:** No — same limitation (tray was 403 + 100% personal/Marines network for many prior runs anyway).
**Feed Highlights:** All freshness pulled via public `web_profile_info` API (14 accounts swept: Justin, Perell, Nathan, Jay, Oleg, Dickie, Lea, Greg, Hampton, NotionHQ, Marie Poulin, Sam Parr, WriteOrDie, Vasilios).
**Relationship Signals:** Unverifiable this run (no notifications/DM access). **Standing open loop carried:** unopened @build.os attachment DM from @leaturnerholt (~2026-03-30) — and note Lea posted 1.6h ago (see #2), so the relationship-debt touch finally has a fresh surface.

---

## Priority Summary

| #   | Account         | Lane         | Topic                                               | Age   | Comments | Opp Type                                 | Mention Fit | Score | Profile                              | Queue  |
| --- | --------------- | ------------ | --------------------------------------------------- | ----- | -------- | ---------------------------------------- | ----------- | ----- | ------------------------------------ | ------ |
| 1   | @davidperell    | Author       | "Publishers Don't Know Everything" (Hachette CEO)   | 0.6h  | 1        | Ultra-fresh FCW on the reach engine      | 1           | 91    | instagram-profiles/davidperell.md    | Queued |
| 2   | @leaturnerholt  | Solo         | "The host never gets to dance"                      | 1.6h  | 1        | Ultra-fresh near-FCW + relationship debt | 0           | 90    | instagram-profiles/leaturnerholt.md  | Queued |
| 3   | @thejustinwelsh | Solo         | "I'm a very lucky man" (wife appreciation)          | 1.2h  | 13       | Ultra-fresh personal post, human surface | 0           | 83    | instagram-profiles/thejustinwelsh.md | Queued |
| 4   | @oleg_poskotin  | AI           | "Day 2 of my token-maxing sprint" (building system) | 12.0h | 1        | Fresh on-thesis near-FCW (Stage 0)       | 1           | 81    | instagram-profiles/oleg_poskotin.md  | Queued |
| 5   | @nathanbarry    | Solo         | "Attention is the most valuable currency"           | 18.2h | 0        | True FCW (0 comments) on Solo peer       | 1           | 79    | instagram-profiles/nathanbarry.md    | Queued |
| 6   | @gregisenberg   | WateringHole | "3 Claude code plugins to save you tokens" (mining) | 23.5h | 40       | On-thesis commenter-mining surface       | 1           | 76    | instagram-profiles/gregisenberg.md   | Queued |
| 7   | @jayclouse      | Course       | "shortcut the content vs. do the reps" (carry)      | 45.6h | 1        | Non-CTA Course window still holding      | 1           | 72    | instagram-profiles/jayclouse.md      | Queued |

**Lane balance:** Solo 3 (Justin, Lea, Nathan) / PKM 0 / AI 1 (Oleg) / Course 1 (Jay) / Author 1 (Perell) / Freelance 0 / WateringHole 1 (Greg mining) / ADHD 0 → **PASS**

> PASS requires: ≥4 of 5–7 items non-ADHD AND ≤1 ADHD item. This run is 7/7 non-ADHD, 0 ADHD. Four non-Solo lanes filled (Author, AI, Course, WateringHole) — matches the healthiest mix of the series. **THREE sub-2h windows in one run (Perell 0.6h, Justin 1.2h, Lea 1.6h) — the freshest top-of-queue the series has produced.** PKM still dead (Marie Poulin ~68d dormant, confirmed again today), but the NotionHQ "Notion Agents iOS" post is a viable PKM mining surface next run (see optional #9).

---

## Reply Queue

| #   | Account         | Lane         | Topic                         | Post Link                                   | Opp Type                           | Strategic Role                        | Mention Fit | Profile                              | Reply Angle                                                                                                                                                                                                                                                                     |
| --- | --------------- | ------------ | ----------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @davidperell    | Author       | publishers don't know         | https://www.instagram.com/reel/DakkoQ8CdUd/ | Ultra-fresh FCW (1c, 0.6h)         | Watering hole / author peer (76.8K)   | 1           | instagram-profiles/davidperell.md    | One declarative builder line — the people closest to the work know things the gatekeepers don't; shipping teaches what no gatekeeper can. **EXECUTE FIRST — 0.6h/1c on 76.8K is the best visibility window in the scan.** No pitch.                                             |
| 2   | @leaturnerholt  | Solo         | the host never gets to dance  | https://www.instagram.com/reel/DakdqjjgNJl/ | Ultra-fresh near-FCW (1c, 1.6h)    | Peer / **highest relationship value** | 0           | instagram-profiles/leaturnerholt.md  | Warm, specific — she finally has a FRESH surface after 7 runs of stale-carry. Name the real thing: the person holding the room rarely gets to be in it. DJ knows the builder version. Short, UK-casual, human. Decide the @build.os DM-open alongside. No pitch.                |
| 3   | @thejustinwelsh | Solo         | lucky man / wife appreciation | https://www.instagram.com/p/DakhAehlr7w/    | Ultra-fresh personal (13c, 1.2h)   | Peer / aspirational (92.7K)           | 0           | instagram-profiles/thejustinwelsh.md | Human/cheerleader — DJ's wife finds his bugs; married-to-a-builder is a real shared experience. One warm line, zero business content. **Alt on-thesis:** `Dah8RYIlhje` "school trains you for a game that doesn't exist" (25.1h/40c — crowded now). Pick ONE Justin post.       |
| 4   | @oleg_poskotin  | AI           | token-maxing sprint day 2     | https://www.instagram.com/reel/DajWo8tBgQ6/ | Fresh on-thesis near-FCW (1c, 12h) | Direct_user (1.6K, Stage 0 queued)    | 1           | instagram-profiles/oleg_poskotin.md  | Relationship-START, no pitch — builder-to-builder reaction on the sprint (building a content automation system in public = exactly the operator move). Supersedes yesterday's Anthropic-access post (now 34.2h/2c). Guaranteed-visible on 1.6K. Watch for reply → `engaged`.    |
| 5   | @nathanbarry    | Solo         | attention is currency         | https://www.instagram.com/reel/DaisDaghfLm/ | True FCW (0c, 18.2h)               | Peer (12.8K)                          | 1           | instagram-profiles/nathanbarry.md    | One real reaction — creators get attention free, the question is what it gets directed INTO. Soft adjacency to owning your work vs renting reach (fit 1, don't force). **Alt:** `Daia83QFdfX` "No more zero days" (20.7h/2c) — classic builder mantra, strong DJ fit. Pick ONE. |
| 6   | @gregisenberg   | WateringHole | Claude Code plugins (mining)  | https://www.instagram.com/reel/DaiHmBJxlPP/ | Mining surface (40c, 23.5h)        | Watering hole (130.9K — NEVER direct) | 1           | instagram-profiles/gregisenberg.md   | **Commenter-mining slot — reply to a COMMENTER, never Greg.** Walk the 40-comment thread in-app (comments API is auth-walled from CLI); find sub-15K operator-voice commenters actually using Claude Code. DJ lives in Claude Code daily — lived agreement, no product name.    |
| 7   | @jayclouse      | Course       | shortcut vs. do the reps      | https://www.instagram.com/reel/Dafve0FDTkf/ | Non-CTA window holding (1c, 45.6h) | Peer-educator (12.3K)                 | 1           | instagram-profiles/jayclouse.md      | Carry from 7/08 — window still 1c at 45.6h. Lived agreement: the reps are the thinking; shortcutting the content shortcuts the work. One builder line. NEVER a funnel keyword, no product name.                                                                                 |

**Optional #8 — @vasilioskambouras (RE-PROMOTED to Stage 0):** `https://www.instagram.com/reel/DagTOBJoo1c/` — "Last night, while I was down to the final straws of what I thought was going to be the end of fable…" (40.4h/3c/3l) + follow-up clip `Dag4nB7oZWi` (35h/0c). This is the fresh AI-workflow surface his 7/06 demote note required — re-promoted `monitor` → `queued_for_warmup`. 1,977f (climbing 1,970→1,977). Relationship-START if slots allow: lived reaction to the Fable-access saga (DJ rode the same model-access rollercoaster). No pitch.

**Optional #9 — @notionhq PKM mining (next-run candidate):** `https://www.instagram.com/reel/DagJnCvIpF0/` — "Meet the Notion Agents iOS app" (41.8h/20c). Only live PKM surface found; commenters = PKM users reacting to the agent push. Also competitor intel (below). Mine commenters only — never NotionHQ directly.

**Execution priority if time-constrained:** **#1 Perell (0.6h/1c — most perishable FCW)** → #3 Justin (1.2h, decays fastest by competition on 92.7K) → #2 Lea (1.6h/1c + relationship debt) → #4 Oleg (12h on-thesis) → #5 Nathan (18.2h true FCW) → #6 Greg mining → #7 Jay (stable window).

---

## Post Opportunities

### 1. @davidperell — "Publishers Don't Know Everything" (David Shelley, Hachette CEO) ⭐ ULTRA-FRESH FCW

**Post Link:** https://www.instagram.com/reel/DakkoQ8CdUd/
**Content Type:** Reel (How I Write — new David Shelley / Hachette Book Group CEO batch)
**Stats:** 38 likes / **1 comment** (0.6h — ultra-fresh FCW)
**Opportunity Type:** Best visibility window in the scan — first-commenter territory on the 76.8K reach engine
**Connected BuildOS Angle:** Soft — gatekeepers don't have the full map; the person doing the work learns things institutions can't. Adjacent to DJ building without permission. Mention fit 1 (optional, don't force).
**Profile File:** instagram-profiles/davidperell.md — **Profile Status:** Existing
**Strategic Role:** Watering hole / author peer (**76,837 followers — velocity continues:** 76,288 → 76,837, +0.5K/day)

**Caption Summary:**

> "Publishers Don't Know Everything" - David Shelley (CEO, Hachette Book Group). Full episode on YouTube.

**Why This Post:** Perell rotated to a brand-new interview batch overnight (Hachette CEO — publishing gatekeeper talking about what publishers DON'T know). 0.6h/1c is the single freshest window the series has logged on this account. Two batch-mates if this one ages by reply time: `Dajeh_BCGkE` "Your Book Cover Has Two Seconds" (10.8h/2c) and `DaibeMID0Wh` "You Can Make Beautiful Things For Money" (20.6h/3c — maker-economics angle, also strong DJ fit). Pick ONE Perell post.

**Why This Account Matters Now:** Reach + freshness engine of the rotation; posts daily; low-comp comment sections relative to 76.8K reach.
**Relationship Intel:** No inbound; visibility/relationship-build play.
**Past Touchpoints:** Queued near-daily since May; none executed.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** One declarative line from lived experience — the gatekeepers' map is not the territory; shipping teaches what no institution can. Avoid: recap, publishing-industry punditry, any pitch.
**Queue Status:** Queued — **EXECUTE FIRST.**

---

### 2. @leaturnerholt — "The host never gets to dance" ⭐ ULTRA-FRESH + RELATIONSHIP DEBT RESOLVED

**Post Link:** https://www.instagram.com/reel/DakdqjjgNJl/
**Content Type:** Reel
**Stats:** 8 likes / **1 comment** (1.6h — ultra-fresh near-FCW)
**Opportunity Type:** The relationship-debt account FINALLY posted fresh — first new Lea post since 7/03
**Connected BuildOS Angle:** None. Mention fit 0. (Theme is human-adjacent to DJ's builder life — the person orchestrating never gets to just participate — but keep it purely warm.)
**Profile File:** instagram-profiles/leaturnerholt.md — **Profile Status:** Existing
**Strategic Role:** Peer / **highest relationship value in the system** (24,215; she DM'd @build.os first ~3/30, liked DJ's comment 5/7)

**Caption Summary:**

> "The host never gets to dance. 💭 When you're the one building the community, orchestrating the events…"

**Why This Post:** Seven consecutive runs carried Lea on the stale `DaSnrJcjPKQ` values post (168h/34c) purely for relationship debt. Today she posted a reel 1.6h ago with 1 comment — the debt touch and a genuinely fresh high-visibility window finally coincide. This is the single best relationship-per-effort item the series has produced in weeks.

**Why This Account Matters Now:** Only account in the system with confirmed two-way signal (her DM + her like on DJ's comment). Warmth compounds here.
**Relationship Intel:** Unopened @build.os attachment DM (~2026-03-30) still pending; she liked DJ's comment 5/7. UK-casual register.
**Past Touchpoints:** DM'd first (never opened); liked his comment; queued 6/21–7/08, never executed.
**BuildOS Mention Fit:** 0
**Reply Angle for `/instagram-reply`:** Warm + specific — the one holding the room rarely gets to be in it; name that she built the thing everyone else gets to dance in. Short, human, UK-casual. Decide the @build.os DM-open alongside. Avoid: pitch, essay, performative energy.
**Queue Status:** Queued.

---

### 3. @thejustinwelsh — "I'm a very lucky man" (wife appreciation) ⭐ ULTRA-FRESH

**Post Link:** https://www.instagram.com/p/DakhAehlr7w/
**Content Type:** Feed Post (personal)
**Stats:** 159 likes / **13 comments** (1.2h — ultra-fresh but filling fast)
**Opportunity Type:** Rare personal/human post on the biggest Solo account — different register from his daily essays
**Connected BuildOS Angle:** None. Mention fit 0.
**Profile File:** instagram-profiles/thejustinwelsh.md — **Profile Status:** Existing
**Strategic Role:** Peer / aspirational (**92,722 followers — climbing:** 92,583 → 92,722)

**Caption Summary:**

> "I'm a very lucky man. Not only is my wife smart, beautiful, kind, and talented, but she's also easy…"

**Why This Post:** Justin's freshest (1.2h), and it's a personal post — a rarity in his essay-a-day cadence. Human comments stand out more here than on his crowded essays (yesterday's "school game" post is now 25.1h/40c). DJ has a genuine married-to-a-builder line (his wife finds his bugs). 13 comments at 1.2h means the window is filling — execute early or skip for the alt.
**On-thesis alt:** `Dah8RYIlhje` "School spends 20+ years training you for a game that doesn't exist" (25.1h/40c — DJ's literal arc, but crowded now). Pick ONE Justin post.

**Why This Account Matters Now:** Largest aspirational Solo peer; ~25 consecutive queues unexecuted — a human-register comment is a better first touch than joining an essay pile-on.
**Relationship Intel:** No inbound yet.
**Past Touchpoints:** Queued repeatedly May–July; none executed since 5/21.
**BuildOS Mention Fit:** 0
**Reply Angle for `/instagram-reply`:** One warm human line — the married-to-a-builder experience (she finds the bugs / tolerates the 2am shipping). Zero business content. Avoid: pivoting it to work, "so true," any pitch.
**Queue Status:** Queued.

---

### 4. @oleg_poskotin — "Day 2 of my token-maxing sprint" ⭐ FRESH ON-THESIS (STAGE 0)

**Post Link:** https://www.instagram.com/reel/DajWo8tBgQ6/
**Content Type:** Reel
**Stats:** 8 likes / **1 comment** (12.0h — near-FCW)
**Opportunity Type:** Fresh on-thesis AI-operator surface — supersedes yesterday's queued post
**Connected BuildOS Angle:** Direct-soft — he's building a content optimization + automation system in public, token-economics voice ("token-maxing" = his "output per token" thesis). This IS the BuildOS user archetype. Mention fit 1 (relationship-start, no pitch).
**Profile File:** instagram-profiles/oleg_poskotin.md — **Profile Status:** Existing (Stage 0: `queued_for_warmup`, held)
**Strategic Role:** Direct_user (**1,605 followers, flat** — comment guaranteed-visible)

**Caption Summary:**

> "Day 2 of my token-maxing sprint. The goal: build a content optimization + automation system for my…"

**Why This Post:** Oleg is posting daily again and each post is on-thesis. This sprint post (12h/1c) supersedes yesterday's Anthropic-access post (`Dag9zPFhw06`, now 34.2h/2c) — fresher, and a build-in-public surface DJ can react to as a peer actually building the same class of system. The Fable-pricing post (`DagQ01IS0-M`, 40.4h/0c) remains funnel-adjacent → still skip.

**Why This Account Matters Now:** The Stage 0 slot. Re-promoted 7/08 on a fresh surface; today's even fresher surface confirms the promotion was right. A comment lands guaranteed-visible on a 1.6K operator whose voice is near-verbatim BuildOS thesis.
**Relationship Intel:** Surfaced 6/10 via Greg mining; AI-authored captions confirmed (operator real — real-estate co + Amazon brand). No executed touch yet.
**Past Touchpoints:** Queued ~9 runs across June–July, never executed; demoted 6/21; re-promoted 7/08.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** Relationship-START, no pitch — genuine builder-to-builder reaction to the sprint (day-2 energy, building the system that compounds). Blunt, short, peer register. Watch for a human reply → move to `engaged` + consider targets-doc AI-lane add. Avoid: the Fable-pricing post, product name, pitch.
**Queue Status:** Queued — Stage 0 discovery slot satisfied.

---

### 5. @nathanbarry — "Attention is the most valuable currency" ⭐ TRUE FCW (0 COMMENTS)

**Post Link:** https://www.instagram.com/reel/DaisDaghfLm/
**Content Type:** Reel
**Stats:** 6 likes / **0 comments** (18.2h — true first-commenter window)
**Opportunity Type:** Zero-comment FCW on a Solo peer
**Connected BuildOS Angle:** Soft — creators get attention free; the question is what it gets directed INTO (owned assets vs rented reach). Mention fit 1, don't force.
**Profile File:** instagram-profiles/nathanbarry.md — **Profile Status:** Existing
**Strategic Role:** Peer (12,758 followers)

**Caption Summary:**

> "Attention is the most valuable currency on earth and creators get it for free. But when they direct…"

**Why This Post:** A genuine 0-comment window at 18.2h on a sweet-spot peer — first comment owns the thread. **Alt with stronger DJ-lived fit:** `Daia83QFdfX` "No more zero days" (20.7h/2c) — the classic builder mantra, straight to DJ's ship-daily reality. Pick ONE Nathan post. (The `cognivalai` bot has faked first-comments on Nathan's posts before — 0c means it hasn't hit this one; verify at reply time.)

**Why This Account Matters Now:** Kit founder, sweet-spot peer, comments draw real founders; weekly touchpoint target that has never actually been touched.
**Relationship Intel:** No inbound; bot-watch note above.
**Past Touchpoints:** Queued repeatedly; none executed.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** One real reaction — attention is free to get and expensive to waste; what you direct it into is the whole game. Or on the alt: zero days are how projects die quietly. Avoid: framework-performing, product name.
**Queue Status:** Queued.

---

### 6. @gregisenberg — "3 Claude code plugins to save you tokens" (MINING SLOT)

**Post Link:** https://www.instagram.com/reel/DaiHmBJxlPP/
**Content Type:** Reel
**Stats:** 701 likes / **40 comments** (23.5h)
**Opportunity Type:** Commenter-mining surface — the strongest on-thesis mining thread in weeks (Claude Code users in the comments)
**Connected BuildOS Angle:** Direct-soft for the COMMENTERS — people using Claude Code daily are DJ's exact peers. Mention fit 1 on a commenter reply if organic; never on Greg.
**Profile File:** instagram-profiles/gregisenberg.md — **Profile Status:** Existing
**Strategic Role:** Watering hole (**130,885 followers** — NEVER engage Greg directly)

**Caption Summary:**

> "3 Claude code plugins to save you tokens"

**Why This Post:** Greg's freshest (23.5h/40c) and it's literally about Claude Code — the tool DJ lives in. The prior mining thread `Dac7neeRCVP` ("own your local AI") has aged out (71.8h/11c, reach dead — retire it). **The comments API is auth-walled from CLI this run, so the commenter walk MUST happen in-app at reply time:** walk the 40 comments, find sub-15K operator-voice commenters actually using Claude Code (not tool-shoppers/agency spam), reply to the best one with lived agreement.

**Why This Account Matters Now:** Primary AI-lane mining source; last two floor-passing discoveries (@oleg_poskotin, @awellsish) both came from Greg threads.
**Relationship Intel:** n/a (mining).
**Past Touchpoints:** Multiple prior mining walks; two candidates yielded.
**BuildOS Mention Fit:** 1 (commenter reply only, if organic)
**Reply Angle for `/instagram-reply`:** Reply to a COMMENTER: lived Claude Code workflow agreement, one specific line. If a commenter passes the 1K floor + operator voice, capture the handle for Stage 0. Avoid: replying to Greg, product name, tool-listicle energy.
**Queue Status:** Queued (mining slot).

---

### 7. @jayclouse — "shortcut the content vs. do the reps" (CARRY — window holding)

**Post Link:** https://www.instagram.com/reel/Dafve0FDTkf/
**Content Type:** Reel
**Stats:** 16 likes / **1 comment** (45.6h — window still open)
**Opportunity Type:** Non-CTA Course-lane window, carried from 7/08, still 1 comment
**Connected BuildOS Angle:** Soft — "do the reps, don't shortcut" maps to "the thinking is the work." Mention fit 1.
**Profile File:** instagram-profiles/jayclouse.md — **Profile Status:** Existing
**Strategic Role:** Peer-educator (12,307 followers)

**Caption Summary:**

> "In a world of people trying to shortcut the content production process with AI, there's a good argument…"

**Why This Post:** No new Jay post since; the non-CTA window is remarkably durable (1c at 45.6h). Still the only live Course-lane lever — his surrounding posts are the "Comment COHORT" launch cycle (skip). Carried once; if it's still unexecuted and >72h next run, drop and wait for his next non-CTA post.

**Why This Account Matters Now:** Only active Course-lane peer; comment section = creator-educators.
**Relationship Intel:** No inbound; cohort CTA cycle still running around this post.
**Past Touchpoints:** Queued 6/30–7/08; not executed.
**BuildOS Mention Fit:** 1
**Reply Angle for `/instagram-reply`:** Lived agreement — the reps are the thinking; shortcut the content and you shortcut the work. One builder line. Avoid: funnel keywords, product name, guru voice.
**Queue Status:** Queued (carry, last time before drop-if-stale).

---

## Dropped This Run

- **@dickiebush** — no fresh surface: `DaiBMKyIH7Z` "Eurosummermaxx" aged to 24.4h/5c (yesterday's 0.5h ultra-fresh window is gone); on-thesis alt `DacjTNOqASM` now 75.3h/3c. 27,370f (climbing). He follows DJ — re-queue on his next fresh post. ~22 consecutive unexecuted queues; skipping today costs nothing.
- **@hamptonfounders** — fresh spotlight `DajMirpupZM` (13.4h/3c, Zain $14M story) noted as a mining alt, but Greg's Claude Code thread is the stronger mining spend this run.
- **@thesamparr** — freshest `Daf2GsqHKQQ` 44.7h/29c; 117K watering hole, nothing compelling vs. the queue.
- **@writeordiemag** — grid dormant since ~January (freshest non-pinned ~4,367h). Author watering hole remains dead; Perell carries the lane.

---

## New Accounts Discovered

| Account | Followers | Theme | Suggested Tier | Strategic Role | Why                                                                                                                                                                                                                                                                                                    |
| ------- | --------- | ----- | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —       | —         | —     | —              | —              | No commenter mining possible this run (comments API auth-walled from CLI; extension down). Greg `DaiHmBJxlPP` (40c, Claude Code topic) is the highest-probability discovery surface — walk it in-app at reply time. `/instagram-discover` peer following-graph walk remains the untested depth method. |

---

## Competitor Intelligence

- **@notionhq launched the "Notion Agents" iOS app** — `DagJnCvIpF0` (41.8h/20c): "A voice note. A photo of a napkin sketch. A question at 11pm. All handled." This is Notion pushing ambient agent capture — directly adjacent to BuildOS's brain-dump → structured-work promise, now on mobile. Worth DJ's eyes on the comments (PKM users reacting to the agent push = both intel and a PKM mining surface — optional #9). 480,898 followers.
- **@theadhdtools** — not re-scanned (last recheck 7/02: 81.6K, content drought; next recheck ~7/16).
- **@danidonovan** — Competitor Intel only, no engagement (standing rule).

---

## Strategy Observations

- **Chrome extension down = the new operational blocker.** The scan survived it (public `web_profile_info` API needs no session), but **the reply pass cannot run until DJ reconnects the extension** (restart Chrome or re-auth the Claude extension). Notifications/stories/DMs also unverified today. Flag to DJ: fix the extension, then run `/instagram-reply 2026-07-09` same-day — this queue is unusually perishable (three sub-2h windows at scan time).
- **Execution debt: ~25th consecutive queue without a touch** (last executed replies doc: 5/21). Today sharpens the pain: Lea — the highest-relationship-value account in the system — finally posted fresh (1.6h/1c), and Perell opened a 0.6h/1c FCW on 76.8K. Sourcing continues to outrun execution by a widening margin.
- **The Lea carry is resolved by reality:** 7 runs of stale-carry ended because she posted. The relationship-debt touch and a fresh near-FCW now coincide — the single best relationship-per-effort item in weeks. If only one comment gets posted this week, it should probably be this one (or Perell for reach).
- **Oleg is posting daily and every post is on-thesis** — the 7/08 re-promotion is validated. If the sprint series continues, he's building exactly the system BuildOS serves; an early relationship here is cheap and high-upside.
- **Vasilios re-promoted on schedule:** his demote note required a fresh AI-workflow surface; the Fable-access saga posts (`DagTOBJoo1c` 40.4h + clip `Dag4nB7oZWi` 35h/0c) qualify. Two Stage 0 actives again (Oleg + Vasilios) — first time since June.
- **PKM lane: still no peer, but a live mining surface.** Marie Poulin re-confirmed dormant (~68d). NotionHQ's Agents-app post is the first fresh PKM-adjacent surface in weeks — queued as optional #9 mining.
- **Perell's new interview batch (Hachette CEO) is a gift to the author lane** — publishing-gatekeeper content with maker-economics angles ("You Can Make Beautiful Things For Money") is the highest DJ-fit Perell material since the Ship 30 era clips.

---

## Relationship Memory Updates

| Account            | Profile                                 | Update                                                                                                                                                 |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @davidperell       | instagram-profiles/davidperell.md       | Logged 7/09 queue row (ultra-fresh FCW `DakkoQ8CdUd` "Publishers Don't Know Everything" 0.6h/1c — new Hachette CEO batch); 76,837 (+0.5K/day)          |
| @leaturnerholt     | instagram-profiles/leaturnerholt.md     | Logged 7/09 queue row (**fresh post at last** — `DakdqjjgNJl` "host never gets to dance" 1.6h/1c; stale `DaSnrJcjPKQ` carry retired); 24,215           |
| @thejustinwelsh    | instagram-profiles/thejustinwelsh.md    | Logged 7/09 queue row (ultra-fresh personal `DakhAehlr7w` "lucky man" 1.2h/13c; alt `Dah8RYIlhje` now 25.1h/40c); 92,722 (climbing)                    |
| @oleg_poskotin     | instagram-profiles/oleg_poskotin.md     | Logged 7/09 queue row (fresh on-thesis `DajWo8tBgQ6` "token-maxing sprint day 2" 12h/1c — supersedes `Dag9zPFhw06`); 1,605 flat; Stage 0 held          |
| @nathanbarry       | instagram-profiles/nathanbarry.md       | Logged 7/09 queue row (true FCW `DaisDaghfLm` "attention currency" 18.2h/0c; alt `Daia83QFdfX` "No more zero days" 20.7h/2c); 12,758                   |
| @gregisenberg      | instagram-profiles/gregisenberg.md      | Logged 7/09 mining-surface switch (`Dac7neeRCVP` retired at 71.8h/11c → new `DaiHmBJxlPP` "3 Claude code plugins" 23.5h/40c); 130,885                  |
| @jayclouse         | instagram-profiles/jayclouse.md         | Logged 7/09 carry row (`Dafve0FDTkf` non-CTA window holding at 45.6h/1c — last carry before drop-if-stale); 12,307                                     |
| @dickiebush        | instagram-profiles/dickiebush.md        | Logged 7/09 drop row (no fresh surface; `DaiBMKyIH7Z` aged 24.4h/5c); 27,370                                                                           |
| @vasilioskambouras | instagram-profiles/vasilioskambouras.md | **RE-PROMOTED monitor → queued_for_warmup** (fresh AI-workflow surface: Fable-saga `DagTOBJoo1c` 40.4h/3c + clip `Dag4nB7oZWi` 35h/0c); 1,977 climbing |
| candidates.md      | discovery/instagram/candidates.md       | Oleg 7/09 note (new surface supersedes); Vasilios state flip + 7/09 note; 2026-07-09 weekly note added                                                 |

---

_Next command: `/instagram-reply 2026-07-09` — **REQUIRES the Chrome extension reconnected first** (restart Chrome / re-auth the Claude extension), then verify @djwayne3 per the skill's two-signal check before touching anything. Execution priority: Perell `DakkoQ8CdUd` (0.6h FCW) → Justin `DakhAehlr7w` (1.2h) → Lea `DakdqjjgNJl` (1.6h + relationship) → Oleg `DajWo8tBgQ6` (12h on-thesis) → Nathan `DaisDaghfLm` (18.2h true FCW) → Greg mining walk `DaiHmBJxlPP` → Jay `Dafve0FDTkf`. Optional: Vasilios `DagTOBJoo1c`, NotionHQ mining `DagJnCvIpF0`._
