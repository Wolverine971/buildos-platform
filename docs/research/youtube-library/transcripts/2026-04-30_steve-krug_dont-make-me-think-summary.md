---
title: "Steve Krug — Don't Make Me Think (Usability Canon Summary)"
source_type: article_reference
url: 'https://sensible.com/dont-make-me-think/'
author: Steve Krug
publication: Sensible.com / New Riders Press
upload_date: 2014-01-01
library_category: product-and-design
library_status: 'transcript'
transcript_status: available
analysis_status: missing
processing_status: needs_analysis
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ''
public_article: ''
indexed_date: '2026-04-30'
last_reviewed: '2026-04-30'
transcribed_date: '2026-04-30'
path: docs/research/youtube-library/transcripts/2026-04-30_steve-krug_dont-make-me-think-summary.md
---

# Steve Krug — Don't Make Me Think (Canonical Summary)

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Usability evaluation and quick research (proposed); UI/UX quality review

## Source Note

> **Source coverage is summary-level.** _Don't Make Me Think_ (Krug, 2000 / 2nd ed. 2006 / 3rd ed. _Revisited_ 2014) is the canonical text in this space. WebFetch returned only the marketing page and Wikipedia summary; the book itself is copyrighted. This document captures the canonical principles widely cited across the usability-engineering and UX research communities, attributed where summary text was directly returned. Read alongside the original book.

## Source Index

| Source                                  | URL                                                 | Notes                          |
| --------------------------------------- | --------------------------------------------------- | ------------------------------ |
| _Don't Make Me Think_ (Sensible)        | https://sensible.com/dont-make-me-think/            | Marketing page; book is paid   |
| _Rocket Surgery Made Easy_ (Krug, 2010) | https://sensible.com/rocket-surgery-made-easy/      | Sequel — DIY usability testing |
| Wikipedia summary                       | https://en.wikipedia.org/wiki/Don%27t_Make_Me_Think | High-level only                |
| Voices That Matter 2010 talk            | https://www.youtube.com/watch?v=35gq5GjIAvU         | yt-dlp rate-limited 2026-04-30 |

## Core Premise (Source-Attributed)

> "A good software program or web site should let users accomplish their intended tasks as easily and directly as possible." — Krug, _Don't Make Me Think_

The book's title _is_ the principle: any time a user has to stop and think, the design has failed. Cognitive load on the user is friction; minimize it.

## Krug's Three Laws of Usability (canon)

1. **Don't make me think.** The first law. Pages should be self-evident, obvious, self-explanatory. If you can't make a page self-evident, at least make it self-explanatory.
2. **It doesn't matter how many times I have to click, as long as each click is a mindless, unambiguous choice.** The number of clicks is irrelevant to friction; what matters is the cognitive cost of each click.
3. **Get rid of half the words on each page, then get rid of half of what's left.** Most web copy is filler. Halve, halve again, then ship.

## Krug's "Usability Truths" (canonical from the book)

- **Users don't read pages, they scan them.** Format for scannability: headlines, bullets, bolded keywords, short paragraphs, descriptive link text.
- **Users satisfice.** They pick the first reasonable option, not the best option. Krug's _satisficing principle_ underpins his rejection of "user can find the right thing eventually" as a design goal.
- **Users muddle through.** They don't read manuals or tooltips; they make assumptions and recover when wrong. Designers must support recovery, not assume comprehension.
- **Conventions are your friend.** Reinventing standard interaction patterns adds cognitive cost without benefit. Use what users already know — search bars at the top, blue underlined links, primary action on the right.
- **Eliminate "happy talk".** Marketing prose, welcome blocks, and self-congratulatory text are noise. Lead with the task.

## Krug's "Trunk Test" (canonical from the book)

Imagine a user is dropped into your page from the trunk of a car, blindfolded, and the blindfold is removed. They should immediately be able to answer:

1. What site is this? (site ID)
2. What page am I on? (page name)
3. What are the major sections? (sections)
4. What are my options at this level? (local navigation)
5. Where am I in the scheme of things? (you-are-here indicator)
6. How can I search? (search)

If any of these isn't immediately obvious, the page fails the trunk test.

## Rocket Surgery Made Easy — DIY Usability Testing (2010 sequel, canon)

Krug's contribution to making usability testing accessible to small teams:

- **Three users per round is enough.** "Testing one user is 100% better than testing none." Testing 3 users in the morning gets you 80% of the insight; you can fix and retest in the afternoon.
- **Test once a month, not once at launch.** Continuous testing beats heroic late testing.
- **The hour-long, one-on-one, think-aloud protocol works.** Ask the user to narrate what they're thinking as they try to accomplish a task. The narration is the data.
- **The tester is not a moderator; they're a guide.** Don't help unless they're truly stuck (and then only after a long pause).
- **Recordings + an observation room turn 1-hour tests into team-wide insight.** Even if only one person ran the test, everyone watches the recording or live feed.

## What Krug Skips (and what to add)

- **Quantitative usability metrics.** Krug is qualitative-first. For SUS, SEQ, task-success-rate scoring, supplement with Sauro & Lewis _Quantifying the User Experience_.
- **Discovery research vs evaluative research.** Krug is mostly evaluative (test the design). For exploratory / generative research, supplement with Erika Hall _Just Enough Research_.
- **Heuristic evaluation.** Krug doesn't use Nielsen's 10 heuristics explicitly; his book is meant for the developer/designer who isn't a usability specialist. For heuristic evaluation, supplement with NN/g.

## Application to BuildOS

- The 3-laws and the trunk test directly apply to BuildOS daily-brief, brain-dump, and project-list screens. A BuildOS user dropped into `/dashboard` should immediately know: where am I? what can I do? where do I go next?
- Krug's "halve the words" rule is the corrective for BuildOS marketing copy and microcopy alike. Apply it before publication and to existing settings/onboarding text.
- Rocket Surgery's 3-users-once-a-month cadence is the sustainable usability rhythm for a solo founder. Schedule a recurring test slot; recruit from existing users (Slack-channel ask + $50 gift card).
- Krug's satisficing principle is why BuildOS's brain-dump CTA must be the most obvious thing on the page. Users won't compare; they'll pick the first plausible action.
