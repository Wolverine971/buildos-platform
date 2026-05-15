---
doc_type: source-shopping-list
skill: cold-email-engagement-first-outreach
created: 2026-05-14
purpose: Backlog of high-signal sources to pull and analyze for the next iteration (v2) of the cold-email skill. Organized by sub-topic gap.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/next-sources.md
---

# Cold Email Skill — Next Sources To Pull

The v1 skill is built from three 2026 cold-outreach videos (Connor Murray, Aaron Shepherd, Austin Schneider). That covers the **system layer** — infrastructure, segmentation, offer, cadence — but several sub-topics are thin or skipped entirely. This doc is the shopping list for the next research pass.

## How to use this doc

1. Pick the sub-topic gap that matters most for the next iteration.
2. Verify the URL exists and the source still represents the creator's current thinking.
3. Pull the transcript with `python3 scripts/youtube-transcript.py "<URL_OR_ID>" -o docs/marketing/growth/research/youtube-transcripts/<YYYY-MM-DD>-<slug>.md` (one at a time, 3–5s pause between).
4. Write the source-analysis at `apps/web/src/content/blogs/source-analyses/<slug>.md` following the existing template.
5. Fold the highest-signal claims into `SKILL.md` and `lineage.yaml`.
6. Check the box here.

Verification matters — URLs change, channels rename, videos get unlisted. I'm naming creators and landmark titles I'm confident exist; the exact URLs need a 30-second confirm before pulling.

## Sub-topic gaps in the v1 skill

| Sub-topic                         | v1 coverage                  | Why it deserves its own layer                                                                                             |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Subject line craft                | Light — pattern list only    | Subject line is the highest-leverage variable in the entire email; deserves a dedicated source layer with reply-rate data |
| Research workflow per persona     | Medium — dig table           | Needs deeper per-persona digs from practitioners who do this for a living                                                 |
| Psychology of cold outreach       | Light — six principles named | Implicit Cialdini + Voss; deserves explicit treatment                                                                     |
| Reply handling + same-day routing | Skipped                      | Steli Efti (Close.com) has 10+ years of this; missing entirely                                                            |
| Multi-channel sequencing          | Skipped                      | Cold email is one channel; the data on email × phone × LinkedIn × voicemail cadences is its own playbook                  |
| Founder-to-founder outreach       | Implicit                     | Different physics than SDR outreach; needs its own source layer                                                           |
| Investor / fundraising outreach   | Skipped                      | Warm-vs-cold intro dynamics, deck-as-attachment, VC frame                                                                 |
| Hiring / recruiting cold outreach | Skipped                      | Sourcing has different language norms                                                                                     |
| PR / podcast pitch outreach       | Skipped                      | Same craft, different recipient model                                                                                     |
| Deliverability deep-dive          | Medium — floor named         | Engineering-grade deliverability content is its own discipline                                                            |
| Foundational frame work           | Skipped                      | Aaron Ross _Predictable Revenue_ + Donald Miller _StoryBrand_ are foundational                                            |

## Tier 1 — Highest priority pulls (do these first)

These cover the biggest gaps and have the most signal-per-minute.

### Subject line craft

- [ ] **Will Allred (Lavender) — any recent subject line research video.** Lavender publishes reply-rate data on subject lines. Channel: `@trylavender` on YouTube. Look for "subject line" or "cold email tear-down" videos.
- [ ] **Eddie Shleyner — VeryGoodCopy archive.** `verygoodcopy.com`. Micro-essays on copywriting craft. Search for "subject line," "open rate," "preview text." Not cold-email-specific but every essay transfers.
- [ ] **Lavender blog — subject line research posts.** `lavender.ai/blog`. They've published multiple data-driven posts on subject patterns.

### Reply handling + objection conversion

- [ ] **Steli Efti — Close.com blog archive.** `blog.close.com`. The deepest single archive on objection handling and follow-up I know. Look for: objection handling, follow-up cadences, "no" reframes, reply handling.
- [ ] **Steli Efti — YouTube channel.** Talks on the same topics in video form.
- [ ] **Sam McKenna — "Show Me You Know Me" deep dive (talks / podcasts).** She has long-form treatments of her frame beyond the Apollo video we already cited. Search her name on YouTube + LinkedIn for full-length talks.

### Multi-channel sequencing

- [ ] **Florin Tatulea (Barley) — multi-channel outreach videos.** Practical data on email + phone + LinkedIn cadences.
- [ ] **Trent Dressel — SDR daily content.** Practitioner-level cold call + cold email examples.
- [ ] **Cognism — multi-channel B2B sales content.** UK channel with multi-channel data.

### Psychology of cold outreach (foundational)

- [ ] **Cialdini — _Influence_ (book).** Distill the six principles (reciprocity, scarcity, authority, social proof, commitment & consistency, liking) into cold-email-specific application. The "psychology audit" section of the skill is implicitly Cialdini; deserves explicit citation.
- [ ] **Chris Voss — _Never Split the Difference_ (book) + interview/talk content.** Mirroring, labeling, calibrated questions. Massive overlap with objection handling.
- [ ] **Daniel Pink — _To Sell Is Human_** — frame psychology, the "attunement" concept.

## Tier 2 — Medium priority (second pass)

Useful for breadth but less acute gaps.

### Founder-to-founder outreach

- [ ] **Sam Parr — "I sent 100 cold emails" content (My First Million / Hampton).** Practitioner-level founder outreach.
- [ ] **Justin Welsh — Saturday Solopreneur archive.** LinkedIn-heavy but his "warm-via-content" thesis is the inverse of Murray's "warm-via-coiled-spring." Worth a source analysis to triangulate.
- [ ] **Sahil Bloom — founder outreach posts.** Twitter/Substack archive.

### Foundational frame work

- [ ] **Aaron Ross — _Predictable Revenue_** (book + summary talks). The Cold Calling 2.0 frame and persona-based outbound team structure. Foundational.
- [ ] **Donald Miller — _Building a StoryBrand_** (book + StoryBrand podcast). The "make the recipient the hero" frame — philosophical underpinning of the bridge sentence.

### Deliverability deep-dive

- [ ] **Postmark blog — engineering-grade deliverability content.** `postmarkapp.com/blog`. The technical floor at a more rigorous level than Schneider's video.
- [ ] **Maildoso blog — deliverability for cold senders specifically.**
- [ ] **Glock Apps blog — inbox placement testing.**

### Investor / fundraising outreach

- [ ] **Mark Suster — Both Sides of the Table.** `bothsidesofthetable.com`. Search "cold email," "warm intro," "fundraising email." Investor's view of cold outreach received.
- [ ] **Aaron Harris — old Y Combinator essays on cold-emailing-investors.**

## Tier 3 — Specialty layers (later iterations)

Worth pulling if/when the skill expands into adjacent use cases.

### Hiring / recruiting cold outreach

- [ ] Recruiter ops content — different language norms, sourcing-specific. Defer until a recruiting use case is active.

### PR / podcast pitch outreach

- [ ] **Justin Jackson — MegaMaker archive.** Founder-to-press outreach.
- [ ] Podcast guest pitch content — short, specific craft for a different recipient psychology.

### Voice & register craft (cross-cutting)

- [ ] **Eddie Shleyner — VeryGoodCopy archive** (already in Tier 1) — generally applicable.
- [ ] **Joel Klettke — B2B copywriting content.** Case-study language specifically.

## Strategy for finding more sources

Beyond this list, the meta-moves:

1. **Mine the cited sources for tier-2 references.** Every source-analysis already written names other people the speaker references. Those tier-2 names are usually higher-signal than YouTube search results.
2. **Search for "[topic] interview" not "[topic] tutorial."** Tutorials sell courses. Interviews extract insight. The Connor Murray video was an interview — note how much richer it was than a tutorial of the same length.
3. **Search by year for different layers.** "Cold email 2026" → platform-current. "Cold email 2018" → frame-foundational. Both useful, for different layers.
4. **Read the comment sections.** Practitioners drop their own examples and disagreements. The Murray 4-touch vs Schneider 2-touch disagreement is the kind of insight that surfaces in comments.
5. **Run `/skill-gap-audit cold-email-engagement-first-outreach`.** The built-in skill audits for blind spots, missing source coverage, expert gaps, and recommends next research queries before drafting or publishing.

## After grabbing sources — the integration checklist

For each new source pulled:

- [ ] Transcript saved to `docs/marketing/growth/research/youtube-transcripts/`
- [ ] Source-analysis written at `apps/web/src/content/blogs/source-analyses/<slug>.md` following the existing 13-section template
- [ ] Source added to `lineage.yaml` under `sources:` with `used_for:` claims listed
- [ ] Any new primitives added to `lineage.yaml` under `nodes:`
- [ ] New `source_claims:` and `edges:` added to connect the source to existing primitives or guardrails
- [ ] Published agent-skill post at `apps/web/src/content/blogs/agent-skills/cold-email-engagement-first-outreach.md` updated with deep-read link and any new pillar/primitive
- [ ] Stats in frontmatter (`lineageStats`) bumped
- [ ] Box checked in this file
