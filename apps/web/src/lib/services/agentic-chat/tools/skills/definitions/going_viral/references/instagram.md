<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/going_viral/references/instagram.md -->

# Instagram — Going Viral Reference

Use this reference when working on Instagram specifically. The skill body covers the universal layer; `references/tiktok.md` covers most short-form vertical mechanics that apply to Reels too. **This file covers what's _different_ on Instagram** — the interaction-RATE-over-views currency, the audition/graduation reach loop, the trial-reels feature, the shareworthy-content framework, and the Reels-vs-carousel format trade-off that has no equivalent on TikTok.

> **Sourcing note (read this).** The Instagram-mechanics claims below are now anchored to a **PRIMARY** source: **Adam Mosseri (Head of Instagram)** on the Good Guys podcast (recorded Nov 2025) — analysis: `2026-06-11_adam-mosseri_instagram-algorithm_analysis.md`. Claims Mosseri states himself are marked **(Mosseri, PRIMARY)**. Practitioner tactics from **Brock Johnson** (two interviews) are marked **(Brock, practitioner)** and are not platform-confirmed. Vendor/analytics-report numbers are marked **(internal default)** when no primary source exists. We do **not** attribute any claim to a source that doesn't support it.
>
> Two prior claims have been **removed** as unsourced/contradicted by the primary: (1) a "three top ranking signals — watch time / likes-per-reach / DM shares, Mosseri Jan 2025" enumeration (Mosseri does not rank a top-3 and gives no watch-time figure); (2) a "December 2025 raw-human / anti-AI suppression memo" (not in any primary source — Mosseri is in fact pro-AI-features in the Nov-2025 interview). See notes inline.

## Read me first

The single most important Instagram mechanic is **interaction RATE, not view count**. Mosseri: _"What matters is not really the number of views. It's the interaction rates."_ — likes-per-impression and **sends to a friend (DM shares)** are the named signals; comment rate is his worked example. A post whose interaction rate beats the field gets promoted, even from a tiny account. **(Mosseri, PRIMARY.)**

Reach has **two sides**: a **connected side** (your followers) with **no minimum gate or early-engagement threshold to cross**, and an **unconnected side** (non-followers) that works like an **audition / graduation system** — every public post gets a small reserved batch of impressions, and content that beats the field on interaction rate graduates to progressively larger unconnected audiences. This is how small accounts go viral. **(Mosseri, PRIMARY.)**

Counterintuitive: **Reels are not always the right format.** Mosseri explicitly declines to rank Reels > carousels > photos — _"it depends on the person and the content"_; many creators see carousels, photos, or stories beat video. The right format is per-account, not a platform default. **(Mosseri, PRIMARY.)**

## Algorithm reality

**Multiple ranking systems (not one algorithm):**

There is no single "algorithm." Instagram runs many ranking/relevance systems — _"lots of copies of the same code"_ — and "the algorithm" is the colloquial sum. **(Mosseri, PRIMARY.)** Big reach swings are **almost never** a "major change": _"We almost never make major changes to it. We constantly make small changes to try to improve it over time."_ When reach drops, the default explanation should be **content-side** (lower interaction rate, off-niche subject) or a **recommendation-guideline limit visible in Account Status** — not "they changed the algorithm." **(Mosseri, PRIMARY.)**

**Ranking is consumer-side and happens AFTER you post.** _"Nothing happens when you post right away… it's almost like a DVD added to a DVD collection, and the next person who comes into the store, it's an option."_ The system asks, per viewer, "who might be interested in this?" — there is no "post and the clock starts" broadcast event. **(Mosseri, PRIMARY.)**

**Interaction RATE is the currency (Mosseri, PRIMARY):**

- The named signals are **likes-per-impression** and **sends to a friend (DM shares)**; comment rate is the worked example.
- **Worked delta (illustrative, not a published threshold):** an average post runs ≈ **5–6% like rate** and ≈ **1% comment rate**; a winner at **1.1%** comment rate vs 1.0% _"is actually a big delta"_ and gets picked up by the ranking system.
- **Do not over-read the first hour.** _"It's best not to overreact to the first hour."_ Early signal is real but noisy. There is **no** "X views in 10 minutes unlocks reach" rule from Mosseri — that is a myth.

> **REMOVED (was: "three top ranking signals — watch time #1, likes-per-reach, DM shares, Mosseri Jan 2025; first 3 seconds critical").** The primary Mosseri source confirms **none** of this enumeration: he does not rank a top-3, gives **no** watch-time figure, and states **no "3-second" threshold** anywhere. What he _does_ confirm is interaction-RATE-over-views and that **sends/DM shares are a top driver**. The relabeled version is the "interaction RATE" block above.

**Connected vs. unconnected reach (Mosseri, PRIMARY):**

- **Connected (followers):** your post is ranked against everything else that follower could see. **"There's no sort of gate or minimum thing or threshold that you have to cross."** You structurally **cannot reach most followers** — ~half aren't on IG that day; of the rest, ~half don't scroll far enough.
- **Unconnected (non-followers) — the audition:** every public post gets a **minimum reserved number of impressions** ("we set aside a little bit"). Do well on **rate** → it **graduates** to more unconnected accounts. Do well again → graduates again. _"Almost like a competition."_ This is the explicit mechanism by which very small accounts go viral.

DM shares (sends) are the highest-leverage interaction because they move content person-to-person; in the Oct-2025 Mosseri clip Brock quotes, the three products driving Instagram's growth to 3B MAU are named as **messaging (DMs), Reels, and recommendations**. **(Mosseri clip, PRIMARY, via Brock.)** Optimizing for **sendability** ("send this to someone who needs it") is therefore high-leverage.

**Eligibility / "shadowban" reality (Mosseri, PRIMARY):**

- "Shadowban" is real **only** in the narrow sense of visible, appealable reach limits. Reach can be limited if you **recently had content taken down**, or you posted content that violates **recommendation guidelines** (not community guidelines) → it won't be shown to non-followers. Check **Profile → Settings → Account Status**; appeal or remove. Don't assume you're shadowbanned without checking.
- **Politics is NOT downranked as a topic.** _"We don't do that."_ Reach drops on an off-profile post because **your followers didn't follow you for that subject**, so they engage less per impression → lower reach. Generalizes to a **subject-pivot penalty**: any sharp pivot to/away from your normal topic depresses engagement-per-impression. Accounts that **always** post that topic do fine. **(Mosseri, PRIMARY, myth correction.)**

> **REMOVED (was: "no TikTok/CapCut watermarks" + "no identifiably AI-generated content, December 2025 raw-human memo" as IG eligibility rules).** The cross-platform-watermark penalty is a real practitioner-observed pattern but is **not** stated in any primary Mosseri source, so it lives in the anti-patterns section as a practitioner heuristic, not a confirmed eligibility rule. The "December 2025 raw-human / anti-AI suppression memo" is **deleted entirely**: it appears in no primary source, and Mosseri is in fact **optimistic about AI** in the Nov-2025 interview (he wants users to be able to "talk to the algorithm"). It was an unsourced fabrication.

**Format (Mosseri, PRIMARY):**

- **9:16 for Reels** is a practitioner/format default (internal default), not a Mosseri-stated reach rule.
- There is **no fixed format hierarchy.** _"It depends on the person and the content."_ Don't assert Reels > carousel > photo universally.

## Trial Reels — the highest-leverage feature

**Trial reels** is a feature unique to Instagram (no TikTok equivalent). When you post a Reel as a trial:

- It's shown ONLY to non-followers initially
- You can repost top-performing trials to your followers later
- This separates the **discovery test** from the **community signal**

**The Brock Johnson play (Brock, practitioner):**

- Post your best-performing existing content as trial reels to reach new audiences without spamming followers
- Post experimental content as trials so failures don't damage your follower-feed performance
- After a trial reel hits a performance threshold (e.g., 2× average — Brock's rule of thumb, **internal default**), repost to followers as a regular Reel

**2025 trial-reel constraints (mixed PRIMARY / practitioner):**

- **Anti-duplicate enforcement (Mosseri, PRIMARY).** Posting the **same** trial reel repeatedly is a **"spam vector"** IG is cracking down on: _"Don't try to use them just to pummel the same content over and over again… that's become a bit of a spam vector that we are addressing."_ Identical trial reels get throttled.
- **Non-minimal variation required (Brock, practitioner — "spoke with IG staff").** Each trial reel must vary the **first 6–7 seconds of on-screen visual** — not just a new caption, audio swap, or minor hook-text tweak. The duplicate comparison is **indefinite** (not daily-reset): IG checks future trial reels against the first.
- **Per-day caps, account-specific (Brock-asserted, unsourced — treat as anecdote).** Caps are non-universal: some accounts uncapped, some 25/day, some 20, Brock's own account 5/day. Exceeding → a 24-hour block (some users reported a 30-day restriction). **Assume ~5/day if unsure** is Brock's general rec — carry the specific numbers as Brock's examples, not platform facts.
- **Normal feed reels are exempt (Brock, practitioner).** A normal feed reel can be re-uploaded as an exact duplicate after ~a week with no deletion/edit/disclosure needed.

**Strategic implication:** The Trial Reels feature lets you run **two parallel content cadences** — one for discovery (high-volume, high-experimentation, respecting the variation + cap rules) and one for community (curated wins). Most creators conflate these and damage their follower-feed performance with experimental content.

## 2025 feature changes (Brock, secondary — Mosseri clips marked)

From Brock Johnson's recap of Mosseri's Oct-2025 announcements (`2026-06-11_brock-johnson_brand-new-instagram-algorithm_analysis.md`):

- **Tune your algorithm (Mosseri clip, PRIMARY).** A new customizable control (US, Reels first) shows the **3 interests IG thinks you're most into recently**, plus an editable predicted-interest list you can add/remove or "show me none of X." Interests are 1–2-word categories = niches. **Strategic read (Brock):** when users add your niche category, they become more likely to see your content — reinforces niching down.
- **Story-reach fix (Mosseri clip, PRIMARY).** The old "post only one story for max reach" advantage is **largely gone**: _"no longer will posting more and more stories in the same day decrease the reach… particularly that first story."_ The one-vs-many gap is now balanced, not inverted. Brock's still-recommended **STD** story strategy (practitioner): **S**ingle (smaller edge, still real) · **T**ext-heavy · **D**M-automation. **Correct any older advice that says "post one story for max reach" — that edge was fixed.**
- **Meta Verified search boost (Brock, secondary).** Meta Verified handles now surface at the **top of IG search results** (plus impersonation protection + 1:1 support).

## Brock Johnson's growth framework (Brock, practitioner)

From the **Brian Ellwood** interview (`2026-06-11_brock-johnson_solved-instagram-algorithm_analysis.md`, 2024-09-12) and his 2025 algorithm recap. These are practitioner heuristics, not platform-confirmed mechanics.

**1. Niche down.**

The recommendation engine can only place you if you have **one clear searchable category**. _"When you confuse [the algorithm], you lose."_ Keep the feed **≥90% on-niche** (off-niche 5%, 10% at most). This is Brock's tactical restatement of Mosseri's PRIMARY **subject-pivot penalty** — an off-niche post depresses engagement-per-impression and reach.

**2. Hyper-consistency + volume-before-quality.**

> _"The biggest secret of my growth is not consistency, it's hyper-consistency — 3–4 posts/day, every day, for ~3–4 years."_ (Brock)

> _"Make 300 shitty posts before your first good one."_ (Brock) — volume is the learning loop; judge results only after **≥6 months** of consistency.

(Replaces the prior vague "daily posting / ~30–50 posts to calibrate" line, which had no source.)

**3. Trial Reels.** See above.

> **CORRECTED (was: "spends 80% of his time on the hook" + "How to grow on Instagram in 2025 (Creator Science #243)").** The "80% on the hook" figure does **not** appear in the cited Brock interview (the Brian Ellwood video) — relabeled as **asserted, unsourced** and removed as a Brock attribution. The video itself is the **Brian Ellwood** interview, **not** "Creator Science #243" — see Source attribution below for the corrected citation.

## Shareworthy content — the five categories (Brock, practitioner)

Shares are the engagement type Brock says the algorithm prioritizes most (this reinforces Mosseri's PRIMARY "sends are a top signal / rate beats raw views" — but the specific share-to-view multiplier is **Brock's own figure, not platform-confirmed**).

> **1 share ≈ 400 additional views** — **Brock-asserted heuristic, not a published figure.** Mosseri (PRIMARY) confirms sends are top-tier and rate beats raw views but gives **no** share-to-view multiplier. Use directionally only.

**The five categories of shareworthy content** (named by the phrase a viewer would say):

1. **"I needed this"** — motivational/inspirational; powerful quotes; recovery-from-failure stories.
2. **Call to Arms** — "we're all in this together / help spread this" (ALS Ice Bucket archetype; built-in tag-a-friend).
3. **"That's me"** — relatable. Worked example: a Seinfeld "every entrepreneur forced to become a content creator" post → **~100K likes but ~120K shares → 7–8M views in days** (Brock's own example).
4. **Feather-ruffling** — niche-relevant **contrarian** takes (e.g. "hashtags are overrated"); NOT generic political flame-bait.
5. **"In the know"** — timely pop-culture / breaking news / memes, related back to your niche; the speed window is short.

**Edutainment rule:** pure-education accounts underperform; weave educational value **into** the five categories. Even straight educational posts need a strong hook + story.

## Stories vs. feed — division of labor (Brock, practitioner)

- **Stories don't grow you** (only existing followers see them → zero new-follower acquisition) but are the **trust + sales engine.** Build them in the **native stories camera** — raw, fast, documentary, can be personal/off-niche. The conversion path is **reply bar → DM → sale.**
- **Feed posts grow you** and must be **niche** (≥90%). An off-niche viral post is a **liability** — it imports wrong-fit followers who depress future engagement rate.
- **DM automation (keyword → auto-DM link)** works on feed posts AND stories — a reliable lead lever that keeps users on-platform.

## Account health — the 10-point "start over" checklist (Brock, practitioner)

Brock's diagnostic: **5+ checked boxes → consider a fresh account.** (1) more fake than real followers; (2) completely changed niche; (3) 3–4+ yr-old account with dead followers; (4) **engagement rate <1%**; (5) declining engagement rate MoM; (6) consistent ≥6 months but still flat; (7) low-quality/forced content; (8) used inorganic growth (bought followers, follow/unfollow, engagement groups, giveaways); (9) multiple community-guideline violations; (10) an off-niche viral that imported wrong-fit followers.

## Reels vs. carousels — when to choose what

| Format                                 | Best for                                                    | Hook physics                                      | Engagement weight                              |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **Reels (vertical video, 15–60s)**     | Personality, storytelling, demos, humor, motion-heavy ideas | Hook fast; visual sandwich applies                | Interaction rate (likes/impression) + DM sends |
| **Carousels (1:1 multi-slide images)** | Frameworks, education, before/after, deep dives             | Slide 1 is the hook (4–6 word title-card)         | Saves + shares + dwell time per slide          |
| **Single image**                       | Aesthetics, branded statement, photo journalism             | Image as standalone composition                   | Likes + saves; lower reach ceiling             |
| **Stories**                            | Behind-the-scenes, polls, link drops, casual community      | First frame is the hook                           | Replies + DMs (highest signal); 24-hour window |

> Note: the "first 3 seconds critical" figure that was previously in this table has been removed — **no "3-second" threshold appears in the primary Mosseri source.** Hooking fast is sound craft (see `references/tiktok.md` + `hook_craft_short_form`), but the specific 3-second number was unsourced. **Format is per-account, not a fixed hierarchy** (Mosseri, PRIMARY).

**Decision rule (heuristic — Mosseri says format depends on the person and content; test your own):**

- Idea has motion, demo, or surprise visual → **Reel**
- Idea is a framework, list, before/after, or deep dive → **Carousel**
- Idea is aesthetic / branded statement → **Single image**
- Idea is real-time, conversational, or community-driven → **Story**

The same underlying idea (killer-script structure, per `viral_video_script_structure`) can be expressed in any format. The format choice is a strategic decision about which physics serve the content type — but **don't assume Reels always win**; many creators see carousels/photos/stories outperform video (Mosseri, PRIMARY).

## Carousel structure (Instagram-specific)

Cross-reference `references/linkedin.md` for the 9-slide structure — it works identically on Instagram, with one platform-specific tweak:

**Instagram carousels rely more on visual cohesion** than LinkedIn carousels. LinkedIn audiences will read text-heavy slides; Instagram audiences will swipe past unless the visuals carry the rhythm. Use:

- High-contrast typography
- Consistent color palette across all 9 slides
- 1 idea per slide; if you can't, split
- A title card on Slide 1 that works as a screenshot in isolation

Brand recognition compounds: 5 carousels with the same visual system train your audience to recognize you in 0.3 seconds.

## Hook architecture for Instagram

The six hook archetypes (sibling skill `hook_craft_short_form`) apply. Instagram-specific hook patterns:

**For Reels:**

- **Visual stun in frame 1** (Magician layer) — atypical visual, jump-cut, signature object
- **Spoken hook lands in ~1 second** (Hoyos doctrine, practitioner) — hook fast regardless of platform. (There is **no** Instagram-specific "3-second threshold" in the primary Mosseri source; treat the hook-speed bar as craft, not a platform rule.)
- **Text overlay in the first frame** matches the visual — comprehension test passes regardless of audio-on/audio-off (Reels default to muted autoplay)

**For carousels:**

- **Slide 1 = title card.** 4–6 words, large type, contrarian or specific. If screenshotted, would someone want to swipe?
- **Slides 2–3 = problem + common belief.** The 5-part intro compressed.
- **Slides 4–8 = body.** 2-1-3-4 ordering applied to the carousel framework points.
- **Slide 9 = recap + CTA.** "Save this carousel" is a high-leverage CTA on Instagram because saves are a ranking signal AND DM-shares are amplified by carousels with shareable frameworks.

## Stories — the underrated layer

Stories **don't grow you** (only existing followers see them — Brock, practitioner), BUT they're the trust + conversion engine. Reconcile with the **2025 story-reach fix**: the old "post only one story for max reach" advantage is largely gone (Mosseri clip, PRIMARY); posting more no longer tanks the first story.

**Strategic uses:**

- **DM share funnel.** A great Reel + a "send this to someone who needs it" story sticker can lift DM sends — and **sends are a top interaction-rate signal for unconnected reach** (Mosseri, PRIMARY).
- **DM automation** (reply-keyword → auto-DM link) — works on stories AND feed; the conversion path is reply bar → DM → sale (Brock, practitioner).
- **Polls + questions** as audience-research instruments — fastest free user research available.
- **"Recently published" amplification** — share your own Reel to Stories with commentary; followers who missed it surface back.
- **Link drops to owned products / newsletter** — Stories are the feed-adjacent surface where external links don't tank reach.

## Instagram-specific anti-patterns

- **TikTok / CapCut watermarks** (practitioner heuristic — not a Mosseri-stated rule). Widely observed to deprioritize as "recycled." Either re-export without watermark OR re-shoot natively.
- **External links in feed posts.** Practitioner-observed reach penalty. Use Stories for links, or "link in bio" pattern, or **DM-automation (keyword → auto-DM link)** to keep users on-platform.
- **Posting Reels in non-9:16.** Reduced distribution (format default / internal default).
- **Assuming a single algorithm.** There are many ranking systems; a post can rank differently across surfaces (Mosseri, PRIMARY).
- **Blaming "an algorithm change" for reach swings.** Almost always wrong — changes are continuous and small; default to content-side or Account-Status explanations (Mosseri, PRIMARY).
- **Subject-pivoting** off your normal niche → engagement-per-impression drops → reach drops. Stay on-niche or expect a dip (Mosseri, PRIMARY).
- **Cross-posting from TikTok identically.** Native shoot per platform.
- **Daily Reels with no carousel rhythm.** Format is per-account; many creators do better mixing carousels/photos/stories (Mosseri, PRIMARY). Don't over-index on video.
- **Assuming you're shadowbanned without checking Account Status** — real limits are visible and appealable there (Mosseri, PRIMARY).
- **Spamming identical trial reels** → throttled as a spam vector (Mosseri, PRIMARY).

> **REMOVED anti-pattern: "Identifiably AI-generated visuals (December 2025 raw-human shift suppresses these)."** No primary source supports an AI-suppression policy; Mosseri is pro-AI-features in the Nov-2025 interview. (BuildOS may still _prefer_ founder-shot footage for brand reasons — that's a positioning choice, not a platform penalty.)
>
> **REMOVED anti-pattern: "Generic engagement-bait CTAs are now actively suppressed by IG's ranking system."** No primary source confirms active suppression of "Comment 'YES'" CTAs. Such CTAs may simply convert poorly; carry as a craft preference, not a confirmed ranking penalty.

## When this is the wrong platform

- **Pure B2B enterprise sales.** LinkedIn beats Instagram by an order of magnitude for that conversion path.
- **Real-time news commentary.** X is faster.
- **Long-form ideas needing >3 minutes.** YouTube long-form is the home.
- **Highly text-heavy content with no visual.** Twitter / threads / blog.
- **Audiences over 55.** Facebook still skews older; Instagram's main audience is 18–44.

## Cross-platform note

For BuildOS founder content specifically:

- **Instagram + carousels is a strong combo.** Anti-feed framing and "thinking environment" content map cleanly to the carousel format (visual frameworks, contrast slides, framework lists). (Test it — Mosseri says format is per-account; don't assume carousels always win.)
- **Map content to the five shareworthy categories** — "That's me" (40-open-tabs relatable), Feather-ruffling (anti-AI contrarian), "I needed this" (relief-from-overwhelm), "In the know" (timely AI-tool takes) — to drive **sends**, which Mosseri (PRIMARY) confirms are a top interaction-rate signal.
- **DM-share-driving content + sendable CTAs** ("send this to the person with 40 open tabs") align with BuildOS relief positioning and the audition/graduation reach loop — every post auditions on rate; a sharply-niched small account can out-distribute large generic ones.
- **Founder-shot footage** is a BuildOS brand/positioning choice (it reads authentic), **not** a platform-reach requirement — there is no confirmed AI-suppression policy on Instagram.

## Source attribution

**PRIMARY (platform-confirmed) — Adam Mosseri, Head of Instagram:**

- Interaction-RATE-over-views, the audition/graduation reach loop, no-minimum-gate on connected reach, "shadowban" = appealable Account-Status limits, politics-is-not-downranked / subject-pivot penalty, format-is-per-person, reach-swings-are-not-a-big-change: **Mosseri on the Good Guys podcast (Nov 2025)** — `2026-06-11_adam-mosseri_instagram-algorithm_analysis.md` ([video](https://www.youtube.com/watch?v=96iwtsFbvpg))
- Three growth drivers (messaging/Reels/recommendations), the trial-reel anti-duplicate "spam vector," the tune-your-algorithm control, the story-reach fix: **Mosseri Oct-2025 clips** as quoted in Brock Johnson's recap — `2026-06-11_brock-johnson_brand-new-instagram-algorithm_analysis.md` ([video](https://www.youtube.com/watch?v=-Qi9-ZT1_GE))

**SECONDARY (practitioner — Brock Johnson, not platform-confirmed):**

- Niche-down, hyper-consistency (3–4 posts/day), "300 bad posts," 6-month floor, five shareworthy-content categories, 1-share≈400-views heuristic, stories-vs-feed division of labor, DM automation, 10-point "start over" checklist, trial-reel variation + per-day-cap specifics: **Brian Ellwood interview** ("Meet the Man Who Solved the Instagram Algorithm," 2024-09-12) — `2026-06-11_brock-johnson_solved-instagram-algorithm_analysis.md` ([video](https://www.youtube.com/watch?v=N1ozk6TTdwU)) — _**corrected:** this video was previously mis-cited as "Creator Science #243"; it is the Brian Ellwood interview._

**Removed as unsourced/fabricated:** the "January 2025 three-top-signals (watch time / likes-per-reach / DM shares) Mosseri disclosure," the "first 3 seconds critical" threshold, and the "December 2025 raw-human / anti-AI suppression memo." None are supported by any primary source; the AI-suppression memo contradicts the primary (Mosseri is pro-AI in Nov 2025).

**Craft skills (cross-skill, unchanged):**

- Hook archetype catalog + visual → audio → visual sandwich: Kallaway _100 Viral Hooks_
- Killer-script structure: Kallaway _Killer Script_
- Audience-matching discipline: Kallaway _Misunderstood_ + _Social Algorithms_
- Six-checkpoint psychology gate: Kallaway _18 Psychology Tricks_
