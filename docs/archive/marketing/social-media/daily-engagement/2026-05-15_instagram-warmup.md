<!-- docs/archive/marketing/social-media/daily-engagement/2026-05-15_instagram-warmup.md -->

# Instagram Warmup - May 15, 2026

**Date:** 2026-05-15
**Account:** ⚠️ **@dj_pew_pew** (browser is logged into the firearms-themed personal handle. `/instagram-reply` must switch to **@build.os** before posting — that's where all relationship history lives.)
**Scan Time:** Friday morning EDT (~2026-05-15 ~09:00 EDT)
**Status:** STAGE 1 COMPLETE — Ready for `/instagram-reply` (with account-switch caveat)

> **Critical operational context (carry-forward from prior warmups + today's account blocker):**
>
> 1. **Active engagement handle should be @build.os.** Browser opened on @dj_pew_pew (third personal handle, firearms-themed). Attempted programmatic switch via the "Switch" button next to the sidebar username — the click fires but no account-picker modal renders. AskUserQuestion was rejected twice. Proceeded with public-surface scan only.
> 2. **Phase 2 SKIPPED.** Notifications + DMs + stories rail are account-specific and not useful from @dj_pew_pew. The 3 unopened @build.os DMs (Lea / Chloé / Justyn, now ~7-8w stale) and @an.nalogy stage_4 story-rail slot are still pending. `/instagram-reply` must handle these after account switch.
> 3. **5/14 was skipped — no warmup ran.** This is the first scan since 2026-05-13. The 5/13 queue (6 items: Justin / Nathan / Bush / Greg-mining / Perell / Anna-story) did NOT execute either day. All 6 are now past freshness gate.
> 4. **Backlog ~30+ pending drafts** sits in `comment-log.md` (May 5–13 window). Today's queue is **lean (3 items)** — quality > volume given chronic non-execution. SWAP retires multi-cycle stale drafts.
> 5. **PKM lane officially deprioritized.** 5/13 set today as the trigger date: "if `/instagram-discover` doesn't seed peer-tier PKM by 5/15, officially deprioritize PKM lane and move @notionhq to watering-hole-mining-only." Confirmed @notionhq freshest is event-promo (DYSIS9-ADi0 "Make with Notion today 9PT/12ET"). **Trigger met. @notionhq now watering-hole-mining-only.**
> 6. **Same-account-once-per-day** — today's queue retires backlog drafts via SWAP: Justin ×4 (5/9 + 5/11 + 5/12 + 5/13), Nathan ×6 (5/7 + 5/8 + 5/9 + 5/11 + 5/12 + 5/13), Perell ×3 (5/7-DYAb + 5/7-DYCd + 5/8 + 5/13 + carryfwd). Greg-mining slot retired entirely (3 days stale, never executed).

---

## Phase 0.5 — Handle Verification

Browser landed on `instagram.com/dj_pew_pew/` ("DJ Wayne!" — firearms-themed personal handle; bio website `thecadretraining.com` confirms via the `/accounts/edit/` redirect). Same handle as 5/13's pre-switch state. 3 accounts signed in via prior session: `dj_pew_pew` (active), `djwayne3`, `build.os`.

**Switch attempt result:** Clicked the visible "Switch" element in the sidebar via JS `click()` and `dispatchEvent(MouseEvent)`. No account-picker `role="dialog"` opened. Sidebar Switch button has w=0/h=0 dimensions in DOM probe — likely a hidden duplicate; the visible one (per `find` ref_287/ref_289) doesn't respond to programmatic clicks.

**AskUserQuestion attempted twice — both rejected.** Proceeded with public-surface-only scan and flagged the blocker in this doc. `/instagram-reply` MUST manually switch to @build.os before posting any of today's queued items.

---

## Notifications & Stories Activity

**Notifications:** ❌ SKIPPED — would surface @dj_pew_pew notifications, not @build.os. No new BuildOS-relevant signal data captured today.

**Stories Viewed:** ❌ SKIPPED — story rail is account-specific. @an.nalogy stage_4 story-reply slot (carried 5/12 + 5/13) remains pending for `/instagram-reply` after account switch. @softgirlnocode repeat-appearance signal (3 consecutive days 5/11–5/13) cannot be confirmed today.

**Feed Highlights:** ❌ SKIPPED — feed is account-personalized; would surface firearms / military content, not BuildOS audience signal.

**Relationship Signals from today:** None captured. The pre-audit baseline rows are unchanged from 5/13. Three unopened @build.os DMs (Lea / Chloé / Justyn) still pending triage.

---

## Stage 0 Discovery Pull (Phase 1.5)

`docs/marketing/social-media/discovery/instagram/candidates.md` Active Queue carries 7 candidates. Live verification today via direct profile checks:

| Account             | Lane         | Result                                                                                                                         | Verdict                                                                                                                                                                                            |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **@deanmkoe**       | AI / Solo    | Greg DYM8GMsx57T parent post is now ~3 days old. Mining window has structurally closed.                                        | **DROP from active queue.** Slot was carried forward 5/12 + 5/13, never executed. Move to Monitor — re-promote when Dean surfaces on a fresher Greg thread or posts substantively on his own grid. |
| @georgia_la         | AI / Solo    | Carry forward to `/instagram-discover` next pass.                                                                              | No warmup-eligible surface today.                                                                                                                                                                  |
| @jadasezer          | AI / Solo    | Same.                                                                                                                          | Same.                                                                                                                                                                                              |
| @nataliesalmon      | AI / Solo    | Same.                                                                                                                          | Same.                                                                                                                                                                                              |
| @laurennextbigthing | AI / Solo    | Same.                                                                                                                          | Same.                                                                                                                                                                                              |
| @rubenq24           | AI / Builder | Same Greg DYM8GMsx57T thread now 3d stale.                                                                                     | **DROP.** Carry-forward window closed.                                                                                                                                                             |
| @softgirlnocode     | AI / no-code | Story-rail repeat-appearance signal can't be confirmed today (account-blocker on stories). Was 3-consec-day signal as of 5/13. | Hold for `/instagram-discover` profile-eligibility check. If still in rail on next @build.os warmup, that's a 5+ day repeat-appearance signal — strong elevation candidate.                        |

**Stage 0 active queue net change today:** −2 (Dean + Ruben dropped to Monitor due to stale parent post; 5 unchanged).

---

## Priority Summary

| #   | Account         | Lane   | Topic                                                                                                                                 | Age    | Likes / Comments           | Opp Type                                                                         | Mention Fit | Score | Profile                                                      | Queue                |
| --- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------- | -------------------------------------------------------------------------------- | ----------- | ----- | ------------------------------------------------------------ | -------------------- |
| 1   | @davidperell    | Author | Reel: "Why AI Can't Replace Human Art - Maria Popova"                                                                                 | 20h    | 227 / 5 visible / 24 saves | Direct comment / SWAP retires 5/7 + 5/8 + 5/13 Perell drafts                     | 1-2         | 92    | [davidperell.md](../instagram-profiles/davidperell.md)       | Queued (HIGH fit)    |
| 2   | @nathanbarry    | Solo   | Photo post: NY off-site with Kit exec team — "Running a company well means being intentional about when you do this kind of thinking" | 15h    | (not refreshed) / 1 cmt    | Direct comment / SWAP retires 5/7 + 5/8 + 5/9 + 5/11 + 5/12 + 5/13 Nathan drafts | 1-2         | 90    | [nathanbarry.md](../instagram-profiles/nathanbarry.md)       | Queued (HIGH fit)    |
| 3   | @thejustinwelsh | Solo   | Post: "There's nothing scarier than a bad financial situation… diversify your income. Try this 30-minute daily routine."              | **1h** | (not refreshed) / fresh    | Direct comment / SWAP retires 5/9 + 5/11 + 5/12 + 5/13 Justin drafts             | 0-1         | 78    | [thejustinwelsh.md](../instagram-profiles/thejustinwelsh.md) | Queued (ultra-fresh) |

**Lane balance:** Solo 2 / PKM 0 / AI 0 / Course 0 / Author 1 / Freelance 0 / WateringHole 0 / ADHD 0 → **PASS** (3 of 3 non-ADHD ✓; ≤1 ADHD rule trivially satisfied; no ADHD-exempt slot today because account-blocker prevents the @an.nalogy story-reply slot).

> **Notes on the queue:**
>
> - **3 items, not 5-7** — deliberate. Chronic non-execution (4 days of queues unexecuted: 5/10 / 5/11 / 5/12 / 5/13) means volume isn't the constraint; throughput is. Lean queue increases per-item execution probability.
> - Item 1 (Perell DYU1S0IDTPM "Why AI Can't Replace Human Art") is the **highest DJ-voice fit in the queue** — direct alignment with BuildOS "context > model" thesis. Top comment from @xmenevolved frames AI as a medium ("pencils don't have feelings"), which is the cleanest DJ extension target.
> - Item 2 (Nathan DYVVl_0m0oz NY zoom-out post) is the **second-highest DJ-voice fit** — "being intentional about when you do this kind of thinking" is the BuildOS thesis stripped of product framing. Anchor: DJ does this as a solo founder without a board/exec team.
> - Item 3 (Justin DYW5SYMIMeW) is **ultra-fresh (1h)** but lower DJ fit (side-hustle income content). Visibility ceiling makes it worth a slot; drop if time-constrained.
> - **Account-blocker prevents Phase 2 (notifications/DMs/stories).** @an.nalogy story slot, @softgirlnocode profile-elig check, and 3 unopened DMs all defer to `/instagram-reply` post-switch.
> - **PKM lane officially watering-hole-only.** Today's 5/15 trigger met — @notionhq freshest post is event-promo, no peer-tier PKM candidate surfaced.

---

## Reply Queue

| #   | Account         | Lane   | Topic                                                                                                                    | Post Link                                               | Opp Type              | Strategic Role                     | Mention Fit | Profile                                                      | Reply Angle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------- | ---------------------------------- | ----------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @davidperell    | Author | Reel: "Why AI Can't Replace Human Art - Maria Popova" (How I Write podcast clip)                                         | https://www.instagram.com/davidperell/reel/DYU1S0IDTPM/ | Direct comment / SWAP | Aspirational peer (Tier 1, Author) | 1-2         | [davidperell.md](../instagram-profiles/davidperell.md)       | **HIGHEST-fit Perell post in 30+ days for DJ voice.** 20h old, 227 likes, 5 visible comments. Maria Popova clip on AI not being able to replace human art. **Top comment @xmenevolved (6h):** "The medium of Gen Ai isn't a person. What artists engaging in the medium of Gen Ai have ever told you it has feelings? Pencils don't have feelings. Paint doesn't have feelings. Computer programs don't have feelings. These are things we use and mold as artists to make manifest the outcome of our intent." That's exactly DJ's "AI is a tool / context matters / framework over intelligence" thesis. **Reply angle:** anchor in DJ's lived context-engineering experience — one specific moment where pointing AI at the right context made the difference between hallucinated slop and useful work. NOT "context engineering" jargon; concrete example. **Avoid:** mirroring Maria's "human art" framing back, AI-thought-leader register, listicle response, product mention. **SWAP** retires 5/7 DYAb1TaH6_Q + 5/7 DYCdblnjJxC + 5/8 DYA-qWADVTS + 5/13 DYNxsbOlQ8o. Mention fit 1-2; soft "the thing I'm building" reference OK if anchoring concrete context-engineering moment. |
| 2   | @nathanbarry    | Solo   | Photo post: NY off-site / "intentional about when you do this kind of thinking"                                          | https://www.instagram.com/nathanbarry/p/DYVVl_0m0oz/    | Direct comment / SWAP | Peer (Tier 1, Solo)                | 1-2         | [nathanbarry.md](../instagram-profiles/nathanbarry.md)       | **15h old, 1 visible cmt (@jaypapasan) — wide-open window.** Caption: "New York has a way of making big ideas feel possible. I spent last week there with the Kit exec team and board for our twice-a-year off-site. We zoom out and look at the bigger picture—the future of email, where AI is taking the creator economy, and what Kit needs to become to stay ahead of it. Running a company well means being intentional about when you do this kind of thinking. It doesn't just happen on its own, so we make a point of blocking off time for it." **Reply angle:** as a solo founder DJ does this zoom-out thinking too — but without a board/exec team. The system has to hold it. Concrete: one specific BuildOS project DJ has been zoom-out-thinking about, OR the brain-dump-as-zoom-out pattern. NOT "this is so true," NOT mirroring "intentional thinking" back. Match Nathan's flat declarative register. **SWAP** retires 5/7 DYAhbE2kiG9 + 5/8 DYDJGIXSNnv + 5/9 DYH7QDfA0Dw + 5/11 DYKckWagYXB + 5/12 DYNBbjbCr9V + 5/13 DYH7RgSAHe0 (biggest SWAP yet — 6 prior drafts). Mention fit 1-2; soft BuildOS reference OK as concrete anchor.                                 |
| 3   | @thejustinwelsh | Solo   | Post: "There's nothing scarier than a bad financial situation… diversify your income. Try this 30-minute daily routine." | https://www.instagram.com/thejustinwelsh/p/DYW5SYMIMeW/ | Direct comment / SWAP | Aspirational peer (Tier 1, Solo)   | 0-1         | [thejustinwelsh.md](../instagram-profiles/thejustinwelsh.md) | **ULTRA-FRESH (1h at scan).** Justin's "diversify income through writing" — 30-min daily routine: 5 min pick a problem solved at work, 20 min write using framework (problem/solution/contrarian/your-approach/outcome/contact), 5 min publish. Lower DJ-voice fit than the prior queued Justin posts (no self-belief/bias-for-action hook), but visibility ceiling high. **Reply angle:** writing about what you've solved at work IS the brain-dump pattern — DJ's natural anchor is "I do this with voice, not text" or "the hardest part is the 'problem you solved' step — most people forget what they actually solved." Match Justin's flat declarative register; no exclamation, no emoji. **Avoid:** mirroring the 5-step routine back, "love this!" energy, humble-bragging the founder pivot, BuildOS plug. **SWAP** retires 5/9 DYE3uMBILkS + 5/11 DYMmG2ioIEf + 5/12 DYPK56-oOA1 + 5/13 DYRvsoIINhM. Mention fit 0-1; no product link. **Drop-slot condition:** if time-constrained, this is the lowest-priority slot — drop and prioritize Perell + Nathan.                                                                                                                     |

---

## Post Opportunities

### 1. @davidperell — "Why AI Can't Replace Human Art - Maria Popova"

**Post Link:** https://www.instagram.com/davidperell/reel/DYU1S0IDTPM/
**Content Type:** Reel (How I Write podcast clip, ~20h ago)
**Stats:** 227 likes / 5 visible comments / 6 reposts / 24 saves
**Opportunity Type:** Direct comment / SWAP retires 4 prior Perell drafts
**Connected BuildOS Angle:** **HIGH — direct.** Maria Popova's argument is essentially DJ's "context > intelligence" thesis in literary clothing. AI as medium, not creator. Pencils don't have feelings. The framework + context matters more than the raw intelligence.
**Profile File:** [davidperell.md](../instagram-profiles/davidperell.md)
**Profile Status:** Existing (refresh today with new touchpoint row + supersession of 4 prior drafts)
**Strategic Role:** Aspirational peer (Tier 1, Author)

**Caption Summary:**

> "Why AI Can't Replace Human Art - Maria Popova
>
> Full episode available on YouTube"

**Top Visible Comments (in order):**

- @xmenevolved (6h): "The medium of Gen Ai isn't a person. What artists engaging in the medium of Gen Ai has ever told you it has feelings? 😂 Pencils don't have feelings. Paint doesn't have feelings. Computer programs don't have feelings. These are things we use and mold as artists to make manifest the outcome of our intent."
- @nikkimartinezvoice (6h): "'Feeling and Time' ❤️"
- @anique.mautner (20h): "Wow, yes. Such a beautiful articulation of creativity."
- @eatkim (8h): "Your channel is transformation! Thank you for bringing us contents!!!"
- @paullyro (16h): "This"

**Why This Post:**

The Perell+Popova reel is the cleanest DJ-voice fit in the current Author/Solo surface. Perell's audience is craft-oriented writers and creator-founders — DJ's lived experience as a builder who's spent a year in deep AI-context work translates naturally. Top organic comment (@xmenevolved) is doing 80% of the framing already; DJ's job is to add a concrete builder-specific extension, not duplicate the abstract take.

**Why This Account Matters Now:**

Perell is the highest-leverage Author-lane peer (94K, sweet-spot-adjacent; primary audience overlap with Ship 30 writers + craft-oriented operators). DJ has 4 pending drafts in backlog with zero confirmed posted comments on his grid. Today's SWAP consolidates and finally fires.

**Relationship Intel:**

- 94K+ followers (verified, "Founder of Write of Passage" bio)
- Currently running Maria Popova podcast clip series (last 6 reels all Popova) — pattern is reflective-craft content
- Per `davidperell.md` profile, prior @build.os touchpoints: 0 confirmed posted
- No prior @build.os direct comment history; no inbound signal

**Past Touchpoints:**

- 2026-05-07 @build.os drafted DYAb1TaH6_Q — Pending → will be Skipped (superseded)
- 2026-05-07 @build.os drafted DYCdblnjJxC Forsyth — Pending → will be Skipped (superseded)
- 2026-05-08 @build.os queued DYA-qWADVTS Yann Martel/Art and Religion — Pending → will be Skipped (superseded)
- 2026-05-13 @build.os queued DYNxsbOlQ8o Yann Martel/Characters — Pending → will be Skipped (superseded)
- 2026-05-15 (today) — DYU1S0IDTPM "Why AI Can't Replace Human Art" — Queued (SWAP)

**BuildOS Mention Fit:** 1-2 (soft "the thing I'm building" reference OK; explicit "BuildOS" only if anchoring a concrete moment that requires the name to land)

**Reply Angle for `/instagram-reply`:**

- One concrete context-engineering moment from DJ's BuildOS year: the difference between AI pointed at scattered notes vs. AI pointed at a structured project surface
- @xmenevolved's "pencils don't have feelings" framing is perfect — extend it: the tool doesn't have intent; intent + context is what makes the output. DJ's lived version: "I've spent a year watching AI go from useless to extraordinary based entirely on what I feed it, not which model I pick"
- Match the quiet reflective register; no exclamation, no emoji
- Avoid: mirroring "human art" back at Perell, AI-thought-leader register, mentioning "context engineering" as jargon, listicle response

**Queue Status:** Queued for `/instagram-reply` (SWAP — retires 4 prior Perell drafts on grid)

---

### 2. @nathanbarry — NY off-site / "intentional about when you do this kind of thinking"

**Post Link:** https://www.instagram.com/nathanbarry/p/DYVVl_0m0oz/
**Content Type:** Feed post (text-only image, May 14, 2026 21:00 UTC; 15h at scan)
**Stats:** Likes not refreshed / 1 visible cmt (@jaypapasan "And winning biggest couch award is...")
**Opportunity Type:** Direct comment / **biggest SWAP yet — retires 6 prior Nathan drafts**
**Connected BuildOS Angle:** **HIGH.** "Being intentional about when you do this kind of thinking. It doesn't just happen on its own, so we make a point of blocking off time for it." That's the BuildOS thesis stripped of product framing — most operators never zoom out because the context evaporates between sessions. The project memory is what makes the zoom-out compound.
**Profile File:** [nathanbarry.md](../instagram-profiles/nathanbarry.md)
**Profile Status:** Existing (refresh today with new touchpoint row + supersession of 6 prior drafts)
**Strategic Role:** Peer (Tier 1, Solo)

**Caption (truncated):**

> "New York has a way of making big ideas feel possible.
>
> I spent last week there with the Kit exec team and board for our twice-a-year off-site. We zoom out and look at the bigger picture—the future of email, where AI is taking the creator economy, and what Kit needs to become to stay ahead of it.
>
> Running a company well means being intentional about when you do this kind of thinking. It doesn't just happen on its own, so we make a point of blocking off time for it.
>
> We mapped out our priorities for the second half of the year and got aligned on where we're headed. I also got to spend time with our NYC team, which is always a highlight.
>
> On top of that, we've been working on a huge new project for over a year now, and it's finally coming to life. I can't wait to share more soon."

**Top Visible Comment:**

- @jaypapasan (14h): "And winning biggest couch award is … 🙌 Can't wait to hear all abou..."

**Why This Post:**

15h old with effectively 0 substantive comments — wide-open first-substantive-commenter window. Nathan's post is reflective and not engagement-bait; perfect surface for a peer-builder reaction. The "twice-a-year off-site + intentional zoom-out thinking" line is the cleanest peer-side framing for what BuildOS does at the solo-founder scale.

**Why This Account Matters Now:**

Nathan is the highest-leverage Solo-lane peer on IG (~12K, sweet-spot peer-tier, founder of Kit). DJ has 6 pending Nathan drafts in backlog with zero confirmed posted comments on his grid. Today's SWAP consolidates and fires.

**Relationship Intel:**

- ~12K followers (per targets doc; **underleveraged on IG** vs his 1M+ on X)
- Posts Nathan Barry Show clips frequently — peer-builder commenter graph
- Per `nathanbarry.md`: 0 confirmed @build.os direct comments to date
- No prior @build.os direct comment history

**Past Touchpoints:**

- 2026-05-07 @build.os drafted DYAhbE2kiG9 — Pending → Skipped (superseded)
- 2026-05-08 @build.os queued DYDJGIXSNnv — Pending → Skipped (superseded)
- 2026-05-09 @build.os drafted DYH7QDfA0Dw — Pending → Skipped (superseded)
- 2026-05-11 @build.os queued DYKckWagYXB "600 days" — Pending → Skipped (superseded)
- 2026-05-12 @build.os queued DYNBbjbCr9V — Pending → Skipped (superseded)
- 2026-05-13 @build.os queued DYH7RgSAHe0 "95/5 Rule" — Pending → Skipped (superseded)
- 2026-05-15 (today) — DYVVl_0m0oz "intentional zoom-out thinking" — Queued (SWAP)

**BuildOS Mention Fit:** 1-2 (soft reference OK as anchor for "as a solo founder I have to do this zoom-out without a board")

**Reply Angle for `/instagram-reply`:**

- DJ's lived version: solo founder doing zoom-out twice a year — but without a Kit exec team. The system has to hold the context between sessions or it just evaporates by Tuesday
- One concrete BuildOS zoom-out moment: the agentic pivot decision, or the daily-brief format choice — something where stepping back from execution AND having the context in one place mattered
- Match Nathan's flat declarative register; no exclamation, no "this hits"
- Avoid: mirroring "intentional thinking" jargon back, creator-economy guru voice, generic Kit-fan reply, "scale doesn't matter" platitude

**Queue Status:** Queued for `/instagram-reply` (SWAP — retires 6 prior Nathan drafts on grid; largest SWAP in backlog window)

---

### 3. @thejustinwelsh — "Diversify your income through writing about what you've solved"

**Post Link:** https://www.instagram.com/thejustinwelsh/p/DYW5SYMIMeW/
**Content Type:** Feed post (May 15, 2026 11:32 UTC; ~1h at scan)
**Stats:** Likes / comments not yet visible (ultra-fresh)
**Opportunity Type:** Direct comment / SWAP retires 4 prior Justin drafts
**Connected BuildOS Angle:** Moderate. Justin's 30-min daily writing routine ("pick a problem, write about it") is structurally a brain-dump pattern. DJ's natural anchor is voice over text, or "the hardest part is the 'problem you solved' step — most people forget what they actually solved." Not the strongest BuildOS fit in the queue but the visibility ceiling makes the slot worth holding.
**Profile File:** [thejustinwelsh.md](../instagram-profiles/thejustinwelsh.md)
**Profile Status:** Existing (refresh today with new touchpoint row + supersession of 4 prior drafts)
**Strategic Role:** Aspirational peer (Tier 1, Solo)

**Caption (truncated):**

> "There's nothing scarier than a bad financial situation.
>
> But lots of people set themselves up that way.
>
> - One salary
> - A huge mortgage
> - A prayer that nothing goes wrong
>
> That's a recipe for disaster.
>
> And, unfortunately, there's no quick fix.
>
> But there are some things you can start doing each day to chip away at that situation.
>
> And the simplest one is to figure out how to diversify your income.
>
> Especially if you have experience, knowledge, and skills that other people (or companies) find valuable.
>
> Try this 30-minute daily routine to get started:
>
> - 5 minutes: Pick one problem you solved at work.
> - 20 minutes: Write about it using this framework:
>   a. Here's a problem many people face.
>   b. Here's how most people try to solve it.
>   c. Here's why that rarely works well.
>   d. Here's how I solved it instead.
>   e. Here's what happened.
>   f. Here's how to contact..."

**Why This Post:**

Ultra-fresh (1h). Justin's solopreneur audience reacts within hours so visibility ceiling is high for an early thoughtful reply. The post is essay-shaped, not engagement-bait. Lower DJ-voice fit than Perell/Nathan but the slot is worth holding for visibility.

**Why This Account Matters Now:**

Justin's the highest-leverage Solo-lane aspirational peer (89K+, "$10M Solopreneur"). DJ has 4 pending Justin drafts in backlog with zero confirmed posted comments. Plus there's an unopened @build.os DM from Justyn Berkovits (different person, similar handle pattern — note this is @thejustinwelsh, not @justyn.ai).

**Relationship Intel:**

- 89K+ followers (verified, "$10M Solopreneur")
- Pure broadcaster ratio
- Per `thejustinwelsh.md`: 0 confirmed @build.os direct comments
- No prior @build.os direct comment history

**Past Touchpoints:**

- 2026-05-09 @build.os drafted DYE3uMBILkS — Pending → Skipped (superseded)
- 2026-05-11 @build.os queued DYMmG2ioIEf "bold people built differently" — Pending → Skipped (superseded)
- 2026-05-12 @build.os queued DYPK56-oOA1 "decisions that look wrong" — Pending → Skipped (superseded)
- 2026-05-13 @build.os queued DYRvsoIINhM "self-belief first" — Pending → Skipped (superseded)
- 2026-05-15 (today) — DYW5SYMIMeW "diversify income / 30-min routine" — Queued (SWAP)

**BuildOS Mention Fit:** 0-1 (no product link; brain-dump reference OK only if it lands naturally as the 5-min "what did I solve" step)

**Reply Angle for `/instagram-reply`:**

- The "5 min — pick one problem you solved at work" step is the hardest one. Most operators forget what they actually solved — DJ's lived experience: he ended up brain-dumping daily into BuildOS specifically because he kept losing the "what I solved today" thread between projects
- Alternative: the voice-first version. DJ talks through what he solved before writing — the friction of typing it cold kills the routine for him
- Match Justin's flat declarative register; no exclamation, no emoji, no "this!"
- Avoid: mirroring the 5-step routine back, "love this routine," humble-bragging the founder pivot, BuildOS plug

**Queue Status:** Queued for `/instagram-reply` (SWAP — retires 4 prior Justin drafts on grid)

---

## New Accounts Discovered

None today — public-surface scan only, no commenter-mining slots executed.

---

## Competitor Intelligence

Not scanned today (account-blocker prevents @theadhdtools / @danidonovan grid walks from @build.os perspective). Carry-forward from 5/11: @theadhdtools at 75.3K, no DY-prefix posts visible, cadence dropped. Recheck on next @build.os warmup.

---

## Strategy Observations

1. **Account-switch is the blocker.** The browser opens on @dj_pew_pew by default and programmatic switch via the sidebar "Switch" button is not working through JS click() or pointer-event dispatch. The visible Switch element has w=0/h=0 in DOM measurement, suggesting the displayed button is implemented via a different mechanism (likely an SVG overlay or react-portal). **Action item:** read the `references/workflows.md` selector notes for IG, OR have DJ document the manual switch flow in the instagram skill so future warmups can avoid this trap.

2. **5/13 → 5/15 = 2-day execution gap.** The 5/13 queue (Justin / Nathan / Bush / Greg-mining / Perell / Anna-story) didn't execute on 5/13 OR 5/14. That's a pattern, not a one-off — it suggests 6-item SWAP-heavy queues exceed execution capacity. Today's 3-item queue is the experiment in the opposite direction.

3. **PKM lane officially watering-hole-only.** 5/13 trigger date met. @notionhq freshest is event-promo (DYSIS9-ADi0 "Make with Notion today"). No peer-tier PKM candidate surfaced in 5+ runs. Move @notionhq + @notion_for_productivity + similar to watering-hole-only status in `instagram-engagement-targets.md` on next pass.

4. **Greg watering-hole content is shifting toward CTA-bait.** Today's Greg grid surfaced DYSBWggx31N "Comment 'build', follow me and I'll send you a $1000 gift too ;)" as the freshest non-pinned reel. Combined with the May Hampton CTA-bait pattern (DYSKtj2OlRl + DYPxKzNuhLG both "Comment HAMPTON"), the watering-hole-mining lane is degrading. Worth a separate discovery pass to find substantive AI-builder watering holes outside the Greg/Hampton axis.

5. **Lea Turner Holt content has shifted to deeply personal (solo mom / hysterectomy / parenting).** Wrong lane for direct engagement; **the unopened @build.os DM from Lea (~7w stale) is the only correct re-engagement surface.** `/instagram-reply` priority: DM triage > new comment surface on her grid.

6. **Perell's Popova series is a 1-week author-lane opportunity window.** The current grid shows 4 consecutive Popova clips (Poetry+Science, AI vs Human Art, Memoir, Internet) over 3 days. Today's slot picks the highest-fit one but the series is a recurring author-lane surface — flag as a weekly "Perell-Popova check" until the series ends.

---

## Relationship Memory Updates

| Account         | Profile                                                      | Update                                                                                                                                          |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| @davidperell    | [davidperell.md](../instagram-profiles/davidperell.md)       | Refresh — add 2026-05-15 touchpoint row (DYU1S0IDTPM queued); supersede 4 prior drafts; flag Popova-series weekly check.                        |
| @nathanbarry    | [nathanbarry.md](../instagram-profiles/nathanbarry.md)       | Refresh — add 2026-05-15 touchpoint row (DYVVl_0m0oz queued); supersede 6 prior drafts (biggest single-account SWAP in backlog).                |
| @thejustinwelsh | [thejustinwelsh.md](../instagram-profiles/thejustinwelsh.md) | Refresh — add 2026-05-15 touchpoint row (DYW5SYMIMeW queued); supersede 4 prior drafts.                                                         |
| @deanmkoe       | [deanmkoe.md](../instagram-profiles/deanmkoe.md)             | Demote from `queued_for_warmup` → `monitor` (parent Greg post is 3 days stale; mining window closed; re-promote on next Greg/own-grid surface). |
| @rubenq24       | (no profile yet)                                             | Note: stale via same path as Dean. Hold in `new` state pending `/instagram-discover` profile-eligibility check.                                 |
| @notionhq       | [notionhq.md](../instagram-profiles/notionhq.md)             | Update strategic-role note: PKM lane officially watering-hole-mining-only per 5/13 trigger met today; deprioritize from direct-comment queue.   |
