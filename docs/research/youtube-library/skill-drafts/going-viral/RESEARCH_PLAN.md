<!-- docs/research/youtube-library/skill-drafts/going-viral/RESEARCH_PLAN.md -->

# Going Viral — Research Plan

Research scaffold for the `going-viral` skill (and parallel public blog series). The skill's
substance is **how ideas travel** — hook architecture, retention design, payoff, identity,
and platform-native distribution mechanics — but the public-facing name is "How to Go Viral"
because that's the search term humans actually use.

## How this fits into existing work

This skill is a **synthesis umbrella**, not a green-field combo. Most of the cross-platform mechanics layer is already in the library as **Kallaway transcripts** (12 videos, downloaded 2026-04-29). Those transcripts are queued under four `needs-analysis` combos in `MARKETING_AND_CONTENT.md`:

- _Hook craft for short-form video_ (4 Kallaway transcripts)
- _Story-driven content craft_ (3 Kallaway transcripts + Writing With Andrew)
- _Viral video script structure_ (Kallaway killer-script + viral-TikTok-script-walkthrough + storyteller + hooks)
- _Algorithm-aware publishing_ (Kallaway social-algorithms + 18-psychology-tricks + social-media-misunderstood + BuildOS interest-media essay)

The going-viral skill should **ride on top of those**, not duplicate them. Its job is the **integration layer** — pulling Kallaway's short-form mastery + Devin Nash's contrarian voice + new platform-specific deep dives (IG, X, LinkedIn) + theoretical psychology spine into one coherent skill, with per-platform `references/` for depth.

## Skill shape

- **Pattern A** combo skill: `SKILL.md` (cross-platform principles, the seven tensions below, when to read each reference) + `references/{tiktok,instagram,twitter,linkedin}.md` (platform deep dives).
- Mirrored as a public blog series under `apps/web/src/content/blogs/` once the skill stabilizes.
- Combo index entry will live in `skill-combo-indexes/MARKETING_AND_CONTENT.md`.

## Tensions to surface (the editorial spine)

The skill is interesting only if it holds these tensions, not if it picks a side:

1. **Manufactured virality vs. ideas that compound.** Devin Nash exposes the rage-bait economy; Kallaway / Brendan Kane / Hormozi teach the same hooks for different ends. Where is the line?
2. **Algorithm-native craft vs. timeless story structure.** Kallaway and Jenny Hoyos solve the algorithm with story (shock → intrigue → satisfy); Naval ignores it entirely with aphorism architecture and still goes viral. Both work.
3. **First 3 seconds vs. payoff vs. identity.** Hook bias is now so strong (Mosseri, TikTok creator portal, Kallaway) that the field over-rotates on hooks at the cost of payoff. MrBeast's retention obsession is the corrective.
4. **Volume / consistency vs. distinctive POV.** Sahil Bloom (225 threads), Brock Johnson (post daily) vs. Caleb Ulku ("don't just publish more blogs"). Reconcile.
5. **Platform-native format vs. cross-posting.** Adam Mosseri penalizes TikTok watermarks; Justin Welsh atomizes one idea across LI/X/email. Both right at different scales.
6. **Founder voice vs. creator voice.** Pieter Levels' build-in-public reach vs. Dan Koe's mid-form mastery. Different audiences, different moats.
7. **2025/2026 algorithmic reality vs. 2019-era playbooks.** X following-feed Grok rerank, LinkedIn 360Brew foundation model, Mosseri's January 2025 ranking-signal disclosure, TikTok US-data retraining — most "viral playbooks" online predate all of this.

## Sources already in the library (no re-download needed)

### Kallaway (short-form mechanics — 12 transcripts, all dated 2026-04-29)

Hook craft:

- `2026-04-29_kallaway_irresistible-hooks.md`
- `2026-04-29_kallaway_hooks-impossible-to-skip.md`
- `2026-04-29_kallaway_100-viral-hooks.md`
- `2026-04-29_kallaway_6-words-hook.md`

Storytelling:

- `2026-04-29_kallaway_master-storyteller.md`
- `2026-04-29_kallaway_storytelling-genius-dopamine-ladders.md`
- `2026-04-29_kallaway_7-storytelling-mistakes.md`

Script structure:

- `2026-04-29_kallaway_killer-script.md`
- `2026-04-29_kallaway_viral-tiktok-script-walkthrough.md`

Algorithm + psychology:

- `2026-04-29_kallaway_social-algorithms.md`
- `2026-04-29_kallaway_18-psychology-tricks.md`
- `2026-04-29_kallaway_social-media-misunderstood.md`

### Adjacent / contrarian

- Devin Nash — _Exposing the Manufactured Viral Content Economy_ (rage-bait economy contrarian voice)
- Caleb Ulku — _Blogging is Dead, Do This Instead_
- Creator Support — _He Posted 1,200 Videos in 2 Years and Missed the Whole Point_
- Your Average Tech Bro — _Ultimate SaaS Social Media Guide_

These were analyzed for `content-strategy-beyond-blogging`. Reuse those analyses; do not re-transcribe.

**Action item before drafting**: analyze any unanalyzed Kallaway transcripts so this skill can rest on cleaned analyses, not raw transcripts. (Status check: only 2 analyses exist in `youtube-library/analyses/` — Elad Gil and NFX storytelling. The Kallaway 12 still need analysis passes.)

## New transcripts to download (gap-filling only)

Kallaway is short-form-centric. The new downloads fill **platform-specific** and **theoretical-psychology** gaps.

Legend:

- ✅ direct YouTube URL confirmed
- ⚠ podcast-only or YT URL TBD; resolve at download time
- 📰 article/essay fallback (no transcript needed)

### TikTok / short-form (1–2 new — primary mechanics already covered by Kallaway)

| #   | Source                                                                        | Why                                                                                               | Status                                         |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T1  | **Jenny Hoyos on Colin & Samir** — _Meet the YouTuber Who Solved Shorts_      | "1-second hook" doctrine; counterpoint / reinforcement to Kallaway from a 10M-views/video creator | ✅ https://www.youtube.com/watch?v=As7abwNhG7Y |
| T2  | **Jenny Hoyos on My First Million** — _Formula To Break 100M Views On Shorts_ | Step-by-step from a creator who lives the math; drop if T1 is enough                              | ✅ https://www.youtube.com/watch?v=ZpjGGbrcC8E |

### Instagram (3 new)

| #   | Source                                                                           | Why                                                              | Status                                         |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| I1  | **Brock Johnson on Creator Science #243** — _Solved the Instagram Algorithm_     | 2025 IG playbook: trial reels, hyper-consistency, hook-time math | ✅ https://www.youtube.com/watch?v=N1ozk6TTdwU |
| I2  | **Brock Johnson** — _BRAND NEW Instagram Algorithm \| Direct From Instagram CEO_ | Mosseri's January 2025 ranking signals synthesized for creators  | ✅ https://www.youtube.com/watch?v=-Qi9-ZT1_GE |
| I3  | **Adam Mosseri** — _Secrets of the Algorithm with the President of Instagram_    | Platform's own voice on watch time / DM shares / authenticity    | ✅ https://www.youtube.com/watch?v=96iwtsFbvpg |
| I4  | Mosseri 2026 year-end memo — "raw, real human content" prioritization            | December 2025 strategic shift away from AI content               | 📰 article only                                |

### Twitter / X (3 new)

| #   | Source                                                                                                 | Why                                                                       | Status                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| X1  | **Sahil Bloom on How I Write (Perell)** — _Twitter Threads Into 1M Followers_                          | Thread system; "writing with soul" from 225-thread iteration              | ✅ https://www.youtube.com/watch?v=f-s22uCixMw                     |
| X2  | **Naval Ravikant on Joe Rogan #1309**                                                                  | Aphorism architecture; "How to Get Rich Without Getting Lucky" tweetstorm | ⚠ candidate https://www.youtube.com/watch?v=3qHkcs3kG44 — confirm |
| X3  | **Justin Welsh on Creator Science #109** — _LinkedIn legend expanded into Twitter_                     | Atomic-post structure; cross-platform content system                      | ⚠ Creator Science YT channel; resolve at download                 |
| X4  | X (Twitter) Algorithm 2025/2026 source-code analysis — reply 150x like, premium reach gap, Grok rerank | Current ranking reality, not 2019 playbook                                | 📰 article only                                                    |

### LinkedIn (3 new)

| #   | Source                                                                                | Why                                                                                 | Status                                             |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| L1  | **Hala Taha** — _4-Step Formula to Go Viral on LinkedIn (2025 Masterclass)_           | Spam check → golden 90 minutes → engagement → distribution                          | ⚠ podcast (Apple/Spotify); YT version TBD         |
| L2  | **Lara Acosta on Creator Science #241** — _LinkedIn's fastest-growing female creator_ | SLAY framework; storytelling-first LI growth                                        | ⚠ Creator Science YT channel; resolve at download |
| L3  | **Justin Welsh on Creator Science #109**                                              | LinkedIn OS; daily-since-2018 system (overlaps X3)                                  | ⚠ same as X3                                      |
| L4  | **Richard van der Blom** — _Algorithm Insights Report 2025/2026_                      | 1.8M-post analysis; 360Brew foundation model; dwell-time + meaningful-comment shift | 📰 PDF report only                                 |

### Theoretical psychology spine (3 references — articles, not transcripts)

| #   | Source                                        | Why                                                                       | Status                              |
| --- | --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| P1  | **Eugene Wei** — _Status as a Service_        | Status games as the engine of every social network                        | 📰 essay                            |
| P2  | **Eugene Wei** — _TikTok and the Sorting Hat_ | Interest-graph theory; why TikTok eats follower-graph platforms           | 📰 essay                            |
| P3  | **Jonah Berger** — STEPPS (_Contagious_)      | Social Currency / Triggers / Emotion / Public / Practical Value / Stories | 📰 Wharton interview + book summary |

### Optional foundational (consider only if scope allows)

| #   | Source                                                          | Why                                                                                 | Status                                         |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| O1  | **Brendan Kane** — Hook Point interview                         | Hook architecture as a discipline; partial overlap with Kallaway                    | ✅ https://www.youtube.com/watch?v=pGXiK8b7d-E |
| O2  | **MrBeast on Colin & Samir** — _A Brutally Honest Conversation_ | Retention obsession; long-form rather than short-form viral                         | ✅ https://www.youtube.com/watch?v=9IQ_ldV9z_A |
| O3  | **Pieter Levels on Lex Fridman #440**                           | Build-in-public viral mechanics; founder voice — but 4+ hours, expensive to analyze | ⚠ confirm URL; consider dropping              |

## Total new download count

- **Required**: ~8 transcripts (T1, I1, I2, I3, X1, X2, X3/L3, L1, L2)
- **Optional**: 3 more (T2, O1, O2) — drop O3 unless user insists
- **Articles** (no transcript): 7 references (I4, X4, L4, P1, P2, P3, plus a TikTok-creator-portal explainer)

**Vs. original 17-video plan**: cut roughly in half by leaning on Kallaway + already-analyzed Devin Nash / Caleb Ulku / Creator Support / YATB.

## Workflow

1. **Sign-off** on the trimmed list above (swap, add, drop).
2. **Resolve TBD URLs** for ⚠ rows (X2 Naval JRE; X3+L3 Welsh; L1 Hala; L2 Lara; optional O3 Pieter Levels).
3. **Analyze** the 12 existing Kallaway transcripts (currently `needs-analysis`) — likely the highest-ROI step before any new downloads.
4. **Batch-download** new transcripts via the `youtube-transcript` skill, save to `youtube-library/transcripts/` with `FRONTMATTER_SCHEMA.md`-compliant frontmatter.
5. **Per-source brief analysis** in `youtube-library/analyses/` — extract operating rules, hook architecture, retention mechanics, counterintuitive insights, anti-patterns.
6. **Per-platform synthesis** into `references/{tiktok,instagram,twitter,linkedin}.md` — each one a deep-dive playbook with 2025/2026 algorithm reality, hook templates, format winners, anti-patterns, and source attribution.
7. **Cross-platform `SKILL.md`** — principles, the seven tensions, psychology spine (STEPPS + status games), when to read each reference.
8. **Combo index entry** in `skill-combo-indexes/MARKETING_AND_CONTENT.md`.
9. **Public blog series** — one blog per platform reference + a flagship "How to Go Viral" anchor essay, published under `apps/web/src/content/blogs/`.

## Open questions for the user

1. **Order of operations** — analyze the existing 12 Kallaway transcripts first, then download new sources; or download new sources first while Kallaway analyses are pending? The first option is more disciplined (synthesis builds on cleaned analyses). The second is faster wall-clock if you want all transcripts in hand to skim.
2. **Optional rows (T2, O1, O2, O3)** — keep, drop, or batch only after the required set is analyzed?
3. **Anti-feed reconciliation** — should `SKILL.md` explicitly position against the manufactured-viral path (Devin Nash framing baked into the principles section), or stay neutral and let the reader decide? Default: explicit, since it's a public BuildOS asset.
4. **Blog series sequencing** — flagship "How to Go Viral" first, then platform deep dives? Or platform deep dives first, anchor essay last?
