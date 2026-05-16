---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: internal-source-acquisition-queue
visibility: internal
publish: false
created: 2026-05-15
verified_external_sources: 2026-05-15
purpose: Private acquisition queue of source materials, experts, books, sites, videos, and official references needed to fully build the cold email architecture.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-source-acquisition-queue.md
---

# Internal Source Acquisition Queue

Status: private internal source plan. Do not publish publicly without review.

Acquisition pass completed 2026-05-15. The source archive now lives at:

```text
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/manifest.md
```

Archive summary: the source corpus was pruned to 31 active web-source Markdown cards and 7 active PDF-source Markdown cards. 28 low-value source cards were removed from the active corpus; their URLs and pruning reasons remain in `source-materials/metadata/sources.json`. Raw HTML snapshots and raw PDF binaries were removed after conversion. The broader resource inventory tracks 7 total 2026-05-15 transcript pulls for the v2 buildout. Remaining gaps are mostly legitimate book/manual extractions, a current journalist/producer perspective for PR/podcast outreach, one moved Lavender article, one moved Joel Klettke PDF, and optional unresolved transcript targets.

Cleaned corpus entry points:

- `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/INDEX.md`
- `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/SYNTHESIS.md`
- `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/metadata/sources.json`

This document is the source-acquisition layer for fully building the cold email architecture. It complements:

- `resource-inventory.md`: earlier concrete resource inventory.
- `references/source-map.md`: current governing source map.
- `references/internal-child-skill-source-development-plan.md`: how to deepen each child skill.

Use this queue to assign agents to grab source material, write source analyses, and update child skills. The goal is not to collect every popular cold email source. The goal is to create a source-backed architecture where each child skill has governing sources, examples, rubrics, and guardrails.

## Status Legend

- `local-existing`: already present in the repo.
- `local-analyzed`: already has a local source analysis.
- `verified-2026-05-15`: URL or source page verified during this sourcing pass.
- `official-current`: official source that should be rechecked when used because requirements can change.
- `to-pull-transcript`: pull a transcript or transcript substitute before synthesis.
- `manual-book-extract`: use a legitimate copy, official page, or notes; do not use pirated PDFs.
- `directional-vendor`: useful, but do not treat claims or benchmarks as governing without triangulation.
- `optional-specialty`: use when the related outreach mode is active.

## Acquisition Priorities

1. Deliverability and compliance official sources.
2. Cold email copy, taste, subject, preview, and compiler sources.
3. ICP, signal, buying committee, and offer sources.
4. Reply handling, objection handling, and learning review sources.
5. Specialty mode sources: investor, recruiting, PR/podcast, founder-to-founder, partnership.

Reasoning: deliverability and compliance can block sending. Copy/taste protects reputation. ICP and offer determine whether the campaign should exist. Reply and learning convert outreach into an operating system. Specialty modes should deepen after the core system is source-backed.

## Expert And SME Roster

| Expert / Institution                | Primary Domain                      | Best Source Type To Grab                                       | Use For                                                             | Status                                    |
| ----------------------------------- | ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Connor Murray / Higher Levels       | Strategic cold email                | Existing YouTube transcript and analysis                       | Three-part strategic body, cadence, assumptive language             | local-analyzed                            |
| Aaron Shepherd / GrowthFlare        | High-volume cold email              | Existing YouTube transcript and analysis                       | Volume testing, infrastructure arithmetic, front-end offers         | local-analyzed                            |
| Austin Schneider / Instantly        | Engagement-first sending            | Existing YouTube transcript and analysis                       | Microsegments, deliverability floor, 2-touch recycle                | local-analyzed                            |
| Sam McKenna                         | Research-led outreach               | Existing Apollo and Closing Time transcripts                   | SMYKM, executive research, authenticity bridges                     | local-analyzed                            |
| Florin Tatulea                      | Cold email and sequencing           | Existing 30MPC transcript; pclub course page                   | Buyer-relevant copy, sequencing, proof, objection neutralization    | local-analyzed / verified-2026-05-15      |
| Jason Bay / Outbound Squad          | Executive outbound                  | Existing webinar and subject-line transcripts; resolve full transcripts only | Strategic account outreach, exec-level asks, above/below power line | local-analyzed / to-resolve               |
| Will Allred / Lavender              | Email quality and inbox psychology  | Lavender benchmark, teardowns, subject material                | Subject/preview, taste review, internal-looking email               | verified-2026-05-15                       |
| Steli Efti / Close                  | Follow-up and reply conversion      | Existing 1-2-3 transcript plus active Close articles           | Reply OS, numbered forks, dead-lead revival                         | local-analyzed / verified-2026-05-15      |
| Gong Labs                           | Objection handling                  | Gong objection article                                         | Reply routing, objection reframes, post-reply judgment              | verified-2026-05-15                       |
| Becc Holland / Flip the Script      | Relevance and triggers              | Existing local analysis; resolve extra public source if needed | Relevance taxonomy, send-to-two test, triggers                      | local-analyzed                            |
| Craig Elias / SHiFT Selling         | Trigger-event selling               | Existing local transcript and analysis                         | Trigger taxonomy, timing thesis                                     | local-analyzed                            |
| Mark Roberge                        | Segment scaling                     | Existing local transcript and analysis                         | Segment tiering, leading indicators, PMF discipline                 | local-analyzed                            |
| Lincoln Murphy                      | ICP fit                             | Existing local analysis                                        | Seven-dimension ICP, success potential                              | local-analyzed                            |
| Michael Skok / Underscore VC        | Minimum Viable Segment              | Existing local analysis                                        | MVS gates, dominability, channel reachability                       | local-analyzed                            |
| Brent Adamson / Challenger Customer | Buying committee                    | Book/manual extract plus existing local committee analysis     | Mobilizers, blockers, complex buying groups                         | manual-book-extract / local-analyzed      |
| April Dunford                       | Positioning and sales pitch         | Existing local analysis plus books                             | Offer framing, differentiated story, sales pitch structure          | local-analyzed / manual-book-extract      |
| Bob Moesta                          | Jobs-to-be-Done / demand-side sales | `Demand-Side Sales 101` book/site                              | Buyer progress, switching moments, offer/ICP language               | verified-2026-05-15 / manual-book-extract |
| Rob Fitzpatrick                     | Customer discovery                  | `The Mom Test` book/site                                       | Customer interview quality, buyer-language mining                   | verified-2026-05-15 / manual-book-extract |
| Joel Klettke                        | Voice-of-customer and proof         | Case-study interviews, proof assets                            | Proof asset selection, case-study language                          | verified-prior                            |
| Michael Seibel / YC                 | Investor cold email                 | Existing transcript and YC page                                | Short factual investor payload, no meeting-first ask                | local-analyzed                            |
| Aaron Harris / YC                   | Fundraising email                   | YC transcript page                                             | Investor-fit research, direct ask, no deck dump                     | verified-prior                            |
| Muck Rack / Michael Smart           | PR pitching                         | Muck Rack guide, pitch examples, State of Journalism           | PR/podcast mode, journalist audience protection                     | verified-2026-05-15                       |
| Gem                                 | Recruiting outreach                 | Passive talent cold email guide                                | Candidate-centered outreach                                         | verified-2026-05-15                       |
| Greenhouse                          | Recruiting sequencing               | Sourcing automation best practices                             | Recruiting sequence length, CTA clarity, templates                  | verified-2026-05-15                       |
| Google Workspace / Gmail            | Sender requirements                 | Official sender guidelines and FAQ                             | Deliverability hard requirements                                    | official-current                          |
| Yahoo Sender Hub                    | Sender requirements                 | Sender best practices and FAQ                                  | Deliverability hard requirements and complaint boundaries           | official-current                          |
| Microsoft Outlook Postmaster        | Sender requirements                 | Postmaster sender support docs                                 | Outlook deliverability and sender reputation overview               | official-current                          |
| Postmark                             | Practical deliverability            | Deliverability guide hub                                        | Plain-language SPF/DKIM/DMARC, bounce, and sender reputation support | verified-2026-05-15                       |

## Child Skill Source Queues

### `cold_email_icp_signal_design`

Purpose: make "right person" and "right moment" source-backed.

Already local:

- Craig Elias / SHiFT Selling trigger-event source.
- Becc Holland relevance taxonomy.
- Lincoln Murphy ICP framework.
- Mark Roberge segment tiering.
- Michael Skok Minimum Viable Segment.
- 30MPC / Brent Adamson / John McMahon / Gartner buying committee map.
- Ash Maurya job-based ICP and switching-trigger analyses.

Grab next:

| Priority | Source                                          | URL / Location                            | Status                                    | Extract                                                                         |
| -------- | ----------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| P0       | Brent Adamson et al., `The Challenger Customer` | Book / official publisher page            | manual-book-extract                       | Mobilizer vs talker vs blocker, buying committee dynamics, consensus risk.      |
| P0       | Bob Moesta, `Demand-Side Sales 101`             | https://www.demandsidesales.com/          | verified-2026-05-15 / manual-book-extract | Buyer progress, switching forces, demand-side language.                         |
| P1       | Gartner buying group research                   | Gartner public resources where accessible | to-resolve                                | Buying committee size, consensus, complex B2B buying behavior.                  |
| P1       | 6sense / Demandbase / Cognism intent-data docs  | vendor docs                               | directional-vendor                        | Signal categories and account scoring patterns; do not use benchmarks as truth. |

Artifacts to build:

- Signal scoring rubric.
- Segment disqualifier checklist.
- Buying committee role map.
- `persona x signal x reason-now` schema.

### `cold_email_offer_lab`

Purpose: make "right offer" and "smallest useful yes" source-backed.

Already local:

- Aaron Shepherd front-end offer pattern.
- Austin Schneider value-as-deliverable rule.
- Florin/30MPC artifact CTA.
- April Dunford sales pitch framework.
- Ash Maurya Mafia Offer analysis.

Grab next:

| Priority | Source                                               | URL / Location                           | Status                                    | Extract                                                            |
| -------- | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| P0       | April Dunford, `Sales Pitch` and `Obviously Awesome` | Official books / existing local analysis | manual-book-extract / local-analyzed      | Category, alternatives, differentiated value, buyer-context story. |
| P0       | Bob Moesta, `Demand-Side Sales 101`                  | https://www.demandsidesales.com/         | verified-2026-05-15 / manual-book-extract | Offer as help making progress, not seller-centered pitch.          |
| P0       | Rob Fitzpatrick, `The Mom Test`                      | https://www.momtestbook.com/             | verified-2026-05-15 / manual-book-extract | Asking for reality, avoiding compliments, buyer-language inputs.   |
| P1       | Joel Klettke case-study and VOC materials            | Existing resource inventory links        | verified-prior                            | Proof creation, approved claim language, customer quotes.          |
| P2       | Donald Miller / StoryBrand                           | Existing resource inventory links        | verified-prior                            | Recipient as hero; use lightly, not as full funnel doctrine.       |

Artifacts to build:

- Artifact offer library by mode.
- Production-cost rubric.
- Trust/ask ratio rubric.
- Proof-safe offer checklist.
- Meeting-first-to-artifact rewrite examples.

### `cold_email_research_anchors`

Purpose: make "right reason" and bridge quality source-backed.

Already local:

- Sam McKenna Apollo SMYKM analysis.
- Sam McKenna Closing Time transcript and source analysis.
- Florin/30MPC live drafting analysis.
- Existing strategic-and-single-target reference.

Grab next:

| Priority | Source                                                  | URL / Location                                                                                                       | Status                    | Extract                                                                     |
| -------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| P0       | Jason Bay / Outbound Squad executive cold email episode | https://www.outboundsquad.com/podcast/jason-bay-364                                                                  | verified-2026-05-15       | Executive outreach standards, meeting ask threshold, account research.      |
| P0       | Lavender teardown series                                | https://www.lavender.ai/blog/email-teardown-1                                                                        | verified-2026-05-15       | Before/after examples, internal-looking subject, anchor-to-problem rewrite. |
| P1       | Muck Rack media pitching guide                          | https://muckrack.com/guides/media-pitching                                                                           | PDF acquired; web blocked | Journalist beat research, respectful follow-up, audience protection.        |
| P1       | Greenhouse sourcing best practices                      | https://support.greenhouse.io/hc/en-us/articles/4984925187611-Sourcing-Automation-email-best-practices-and-templates | verified-2026-05-15       | Candidate source context, role relevance, recruiting copy limits.           |
| P2       | Justin Jackson cold email / DM guidance                 | Existing resource inventory                                                                                          | verified-prior            | Creator-recipient perspective, avoid hidden sales motives.                  |

Artifacts to build:

- Research surface map by mode.
- Specificity ladder examples.
- Bridge quality rubric.
- Privacy/invasiveness boundary list.

### `cold_email_outreach_compiler`

Purpose: make the final drafting bundle source-backed.

Already local:

- Connor Murray strategic body.
- Aaron Shepherd high-volume casual body.
- Austin Schneider engagement-first high-volume rules.
- Florin/30MPC subject, preview, body, proof, and artifact CTA.
- Michael Seibel investor cold email payload.

Grab next:

| Priority | Source                                               | URL / Location                                                                   | Status                               | Extract                                                                                  |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| P0       | Florin Tatulea / pclub Cold Email Conversion Machine | https://www.pclub.io/courses/the-cold-email-conversion-machine                   | verified-2026-05-15                  | Trigger/current state/ideal state/CTA, short choppy copy, proof, objections, sequencing. |
| P0       | Lavender benchmark and teardowns                     | https://www.lavender.ai/blog/the-cold-email-benchmark-report and teardown series | verified-prior / verified-2026-05-15 | Subject/preview, length, recipient inbox psychology, quality scoring.                    |
| P1       | Jason Bay / Outbound Squad resources                 | https://www.outboundsquad.com/                                                   | verified-2026-05-15                  | Executive outbound, above/below power line sequence structure.                           |

Artifacts to build:

- Mode-specific compiler templates.
- Subject plus preview packager.
- Mobile body lint.
- Proof slot rules.
- Final bundle schema.

### `cold_email_taste_review`

Purpose: make the taste layer objective enough for agents.

Already local:

- 30MPC/Florin live rewrite judgments.
- Lavender teardown examples.
- Sam McKenna authenticity bridge.
- Internal north star: trust consumed.

Grab next:

| Priority | Source                             | URL / Location                                                                         | Status              | Extract                                                                  |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| P0       | Lavender teardown series           | https://www.lavender.ai/blog/email-teardown-1                                          | verified-2026-05-15 | Before/after quality deltas, internal-email subject, "them > you" tests. |
| P0       | Florin Tatulea / pclub course page | https://www.pclub.io/courses/the-cold-email-conversion-machine                         | verified-2026-05-15 | Generic, over-personalized, buyer-decision, prospect-word rules.         |
| P1       | FTC CAN-SPAM guide                 | https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business | official-current    | Deceptive subject/header, opt-out and sender identity guardrails.        |

Artifacts to build:

- Taste scorecard.
- Screenshot test.
- Fake warmth detector.
- Claim/proof integrity checklist.
- Highest-risk-line rewrite protocol.

### `cold_email_deliverability_readiness`

Purpose: replace generic deliverability advice with official, current requirements plus practical diagnostics.

Grab next before any deep rewrite:

| Priority | Source                                   | URL / Location                                        | Status                                 | Extract                                                                  |
| -------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| P0       | Google email sender guidelines           | https://support.google.com/a/answer/81126             | official-current / verified-2026-05-15 | SPF/DKIM, PTR, TLS, Postmaster spam rate, 5,000/day threshold.           |
| P0       | Google sender guidelines FAQ             | https://support.google.com/a/answer/14229414          | official-current / verified-2026-05-15 | Bulk sender classification, alignment, mitigation requirements.          |
| P0       | Yahoo Sender Hub best practices          | https://senders.yahooinc.com/best-practices/          | official-current / verified-2026-05-15 | SPF/DKIM/DMARC, segregation, opt-in, reputation, CAN-SPAM references.    |
| P0       | Yahoo Sender Hub FAQ                     | https://senders.yahooinc.com/faqs/                    | official-current / verified-2026-05-15 | One-click unsubscribe and sender requirement clarifications.             |
| P0       | Microsoft Outlook Postmaster             | https://sendersupport.olc.protection.outlook.com/     | official-current / verified-2026-05-15 | Outlook sender support and sender reputation overview.                   |
| P1       | Postmark deliverability guides           | https://postmarkapp.com/guides/deliverability         | verified-2026-05-15                    | SPF/DKIM/DMARC explanations, bounces, warmup, troubleshooting.           |

Artifacts to build:

- Deliverability intake form.
- DNS/authentication checklist.
- Provider requirement matrix.
- Pass / blocked / manual-only decision tree.
- Troubleshooting playbook.

Important: recheck official sources on the day this child skill is rewritten.

### `cold_email_reply_os`

Purpose: make reply handling structured, fast, and trust-preserving.

Already local:

- Steli Efti 1-2-3 transcript and analysis.
- Connor Murray objection response bank.
- Mitchell Keller reply-to-call routing.

Grab next:

| Priority | Source                                   | URL / Location                                         | Status              | Extract                                                            |
| -------- | ---------------------------------------- | ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------ |
| P0       | Close 1-2-3 update article               | Existing resource inventory URL                        | verified-prior      | Current interpretation of numbered reply forks.                    |
| P0       | Close Hail Mary / dead leads             | Existing resource inventory URL                        | verified-prior      | Reviving silence and surfacing hidden objections.                  |
| P1       | Gong objection handling techniques       | https://www.gong.io/blog/objection-handling-techniques | verified-2026-05-15 | Permission, reframe, closure without leading.                      |
| P1       | Chris Voss, `Never Split the Difference` | Official book page / legitimate copy                   | manual-book-extract | Labeling, calibrated questions, tactical empathy; adapt carefully. |

Artifacts to build:

- Reply taxonomy.
- Route table.
- SLA matrix.
- Objection response bank.
- Numbered fork library.
- Opt-out and angry-reply handling.

### `cold_email_learning_review`

Purpose: turn outreach into an experimentation and market-learning engine.

Grab next:

| Priority | Source                                      | URL / Location                                         | Status                                   | Extract                                                                       |
| -------- | ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------- |
| P0       | Cognism State of Outbound 2026              | https://www.cognism.com/reports/state-of-outbound-2026 | verified-2026-05-15 / directional-vendor | Sequence data, task mix, outbound benchmarking, report caveats.               |
| P0       | Lavender benchmark report                   | Existing resource inventory URL                        | verified-prior / directional-vendor      | Reply-rate segmentation, email quality signals, subject/body data.            |
| P0       | Mailshake State of Cold Email 2025          | Existing resource inventory URL                        | verified-prior / directional-vendor      | Benchmark caveats, expert contribution, deliverability and relevance signals. |
| P1       | Evan Miller, A/B testing essays             | to-resolve                                             | to-resolve                               | Small-sample caution and false-positive warnings.                             |
| P1       | `Trustworthy Online Controlled Experiments` | Book                                                   | manual-book-extract                      | Experiment design and decision discipline.                                    |
| P1       | Lean Analytics                              | Book                                                   | manual-book-extract                      | Metrics selection and stage-appropriate learning.                             |

Artifacts to build:

- Metric diagnostic table.
- Sample-size caution.
- Stop / iterate / recycle / scale decision tree.
- Buyer-language extraction worksheet.
- Learning memo template.

## Specialty Mode Source Queues

### Investor Outreach

Already local:

- Michael Seibel / YC cold email investors transcript and analysis.
- Michael Seibel seed pitch analysis.
- NFX storytelling analysis.

Grab next:

- Aaron Harris / YC fundraising transcript page.
- YC "How to Email Early Stage Investors".
- Mark Suster / Both Sides of the Table source only if a concrete cold/warm intro article is resolved.

Use for:

- Investor mode only.
- Short factual payloads.
- Investor-fit research.
- No meeting-first ask.

### Recruiting Outreach

Grab:

- Gem passive talent outreach guide: https://www.gem.com/resource/cold-recruiting-email
- Greenhouse sourcing automation best practices: https://support.greenhouse.io/hc/en-us/articles/4984925187611-Sourcing-Automation-email-best-practices-and-templates
- RecruitingDaily cold outreach checklist from `resource-inventory.md`.

Use for:

- Candidate-centered subject/body.
- Role narrative.
- One or two CTAs max.
- Candidate dignity and compensation/role clarity.

### PR / Podcast Outreach

Grab:

- Muck Rack guide to pitching source card from `source-materials/cleaned/pdf/muckrack-guide-to-pitching.md` (acquired).
- Muck Rack successful pitch checklist source card from `source-materials/cleaned/pdf/muckrack-successful-pitch-checklist.md` (acquired).
- Muck Rack pitching best-practices web page if manual/browser retrieval is needed; the help-center URL returned 403 during acquisition.
- Muck Rack media pitching web page if manual/browser retrieval is needed; the guide URL returned 403 during acquisition, but the PDF was captured.
- Kai Davis podcast guest pitch article from `resource-inventory.md`.
- Justin Jackson cold email/DM guidance from `resource-inventory.md`.

Use for:

- Audience-first pitch.
- Journalist/host beat research.
- One follow-up, not pressure.
- No attachments unless requested.
- Protecting the recipient's audience.

### Compliance And Privacy

Grab:

- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- ICO electronic mail marketing / PECR guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- CRTC CASL FAQ: https://www.crtc.gc.ca/eng/com500/faq500.htm

Use for:

- Region-aware opt-out, sender identity, consent, corporate vs individual rules.
- Compliance review child/tangential skill.
- Conservative warnings in root skill when jurisdiction is unknown.

Important: do not turn this into legal advice. Route high-risk campaigns to legal review.

## Books To Extract

Use legitimate copies or official excerpts. Do not rely on unauthorized PDFs.

| Priority | Book                                        | Author(s)                 | Feed Skill                      | Extract                                                             |
| -------- | ------------------------------------------- | ------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| P0       | `Sales Pitch`                               | April Dunford             | OfferLab, Compiler              | Sales story, alternatives, differentiated value, buyer context.     |
| P0       | `Obviously Awesome`                         | April Dunford             | OfferLab, ICP                   | Positioning, category choice, best-fit buyers.                      |
| P0       | `Demand-Side Sales 101`                     | Bob Moesta, Greg Engle    | ICP, OfferLab, Research Anchors | Buyer progress, switching forces, demand-side questions.            |
| P0       | `The Challenger Customer`                   | Brent Adamson et al.      | ICP, Strategic Outreach         | Mobilizers, blockers, buying group consensus.                       |
| P0       | `The Mom Test`                              | Rob Fitzpatrick           | Buyer-Language Mining, OfferLab | Useful customer questions, avoiding false positives.                |
| P1       | `Influence`                                 | Robert Cialdini           | Taste Review, OfferLab          | Reciprocity, authority, social proof; apply ethically.              |
| P1       | `Never Split the Difference`                | Chris Voss                | Reply OS                        | Labels, calibrated questions, tactical empathy.                     |
| P1       | `To Sell Is Human`                          | Daniel Pink               | Taste Review                    | Attunement, buoyancy, clarity.                                      |
| P1       | `Predictable Revenue`                       | Aaron Ross, Marylou Tyler | Root, ICP                       | Outbound system design and role specialization.                     |
| P2       | `Building a StoryBrand`                     | Donald Miller             | OfferLab, Compiler              | Buyer-as-hero framing; use lightly.                                 |
| P2       | `Made to Stick`                             | Chip Heath, Dan Heath     | Compiler, Taste Review          | Concrete, credible, memorable messaging.                            |
| P2       | `Trustworthy Online Controlled Experiments` | Kohavi, Tang, Xu          | Learning Review                 | Experiment design rigor.                                            |
| P2       | `Lean Analytics`                            | Croll, Yoskovitz          | Learning Review                 | Metrics and stage-appropriate learning.                             |

## Videos / Podcasts To Pull Or Resolve

Already pulled:

- Connor Murray / Higher Levels: `10 Years of Expert Cold Email Advice in 36 Minutes`.
- Aaron Shepherd / GrowthFlare: `I Sent 1,500,000 Cold Emails Last Month`.
- Austin Schneider / Instantly: `The New Way of Cold Emailing in 2026`.
- Sam McKenna / Closing Time: `The End of the Line for Cold Calling`.
- Florin Tatulea / 30MPC: `Cold Email Showdown`.
- Steli Efti / Close: `1, 2, 3 hack`.
- Michael Seibel / YC: `How To Cold Email Investors`.
- Jason Bay: `Cold Email: Ignore this webinar if you don't want to double your reply rates`.
- Jason Bay / Belal Batrawy: `Steal these 3 subject line formulas`.
- 30MPC: `We Analyzed 85 MILLION Cold Emails`.

Resolve / pull next:

| Priority | Source                     | Target                                                                              | Status                                             | Use                                                                            |
| -------- | -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| P0       | Lavender / Will Allred     | Pick one current subject-line or teardown video; fallback to Lavender teardown blog | to-resolve                                         | Subject/preview and taste.                                                     |
| P1       | Becc Holland               | Current public relevance / trigger talk                                             | to-resolve                                         | ICP signal and personalization-to-relevance.                                   |
| P1       | April Dunford              | Lenny or ProductLed sales-pitch episode                                             | to-resolve / local-adjacent                        | OfferLab and compiler.                                                         |
| P1       | Bob Moesta                 | Demand-Side Sales interview/talk                                                    | to-resolve                                         | OfferLab, ICP, buyer progress.                                                 |
| P1       | Chris Voss                 | Objection / negotiation interview                                                   | to-resolve                                         | Reply OS.                                                                      |
| P2       | Trent Dressel              | Specific cold email / objection video                                               | unresolved-target                                  | Prospecting practice, mostly adjacent.                                         |

## Source Analysis Template

For each acquired source, produce:

- `source_id`
- `title`
- `creator`
- `url`
- `source_type`
- `status`
- `local_path`
- `analysis_path`
- `trust_level`
- `child_skills_supported`
- `governing_claims`
- `use_with_caveats`
- `conflicts_with_existing_sources`
- `what_should_enter_skill`
- `what_should_not_enter_skill`

## Batch Plan

### Batch 1: Deliverability And Compliance

Grab and analyze active Google, Yahoo, Microsoft Outlook Postmaster, Postmark, FTC, ICO, and CRTC source cards. This should produce the deliverability readiness and compliance boundary references.

### Batch 2: Compiler And Taste

Analyze Lavender benchmark/teardowns, Florin/pclub page, existing Jason Bay transcripts, and active Close articles/transcripts. This should produce draft templates, taste scorecard, subject/preview rules, and bad-to-good examples.

### Batch 3: ICP And Offer

Extract April Dunford, Bob Moesta, Rob Fitzpatrick, Challenger Customer, and existing Ash Maurya/Mark Roberge/Lincoln Murphy sources. This should produce signal scoring, offer library, and buyer-language prompts.

### Batch 4: Reply OS And Learning Review

Analyze active Close follow-up/reply materials, Gong objection handling, Cognism, Lavender benchmark, Mailshake report, and experiment-design sources. This should produce reply taxonomy, SLA matrix, decision thresholds, and learning memo.

### Batch 5: Specialty Modes

Analyze YC/Aaron Harris, Gem, Greenhouse, Muck Rack, Kai Davis, Justin Jackson, and podcast-specific sources. This should produce investor, recruiting, PR/podcast, and founder/creator mode references.

## Do Not Use As Governing Sources

- Unauthorized book PDFs.
- Generic "100 cold email templates" posts.
- Vendor benchmarks without methodology.
- Opted-in newsletter/list-email advice unless clearly separated from cold outreach.
- Reddit anecdotes as governing evidence. Reddit can supply edge cases and failure modes only.
- Sources that optimize for "emails sent" rather than trust-preserving qualified conversations.

## Immediate Next Step

Assign one agent per batch. Each agent should return source analyses and proposed child-skill updates, not raw notes. The first agent should start with Batch 1 because deliverability and compliance requirements change and are the most dangerous to get wrong.
