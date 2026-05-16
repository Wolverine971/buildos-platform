---
doc_type: source-materials-manifest
skill: cold-email-engagement-first-outreach
created: 2026-05-15
visibility: internal
publish: false
purpose: Manifest of source materials acquired for the private cold email outreach architecture source buildout.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/manifest.md
---

# Cold Email Source Materials Manifest

Status: cleaned internal source corpus. Do not publish source cards externally without review.

This archive captures the source acquisition pass for the master cold email outreach system. It is meant to feed source analysis, child-skill deepening, and private BuildOS skill refinement.

Cleaned on 2026-05-15:

- 53 web-source Markdown cards in `source-materials/cleaned/web/`.
- 13 PDF-source Markdown cards in `source-materials/cleaned/pdf/`.
- Distilled source synthesis in `source-materials/cleaned/SYNTHESIS.md`.
- Source URL metadata in `source-materials/metadata/sources.json`.
- A cleaned corpus index in `source-materials/cleaned/INDEX.md`.
- Raw HTML snapshots and raw PDF binaries were removed after conversion; reacquire from source URLs if exact raw artifacts are needed later.
- 3 additional YouTube transcripts in `docs/marketing/growth/research/youtube-transcripts/`; the broader resource inventory tracks 7 total 2026-05-15 transcript pulls for this buildout.
- Prior local transcripts, source analyses, and reference modules remain in their existing repo locations.

Use this manifest with:

- `../references/internal-source-acquisition-queue.md` for the original acquisition plan.
- `../resource-inventory.md` for the broader resource map from `next-sources.md`.
- `../references/source-map.md` for current governing source lineage.
- `../references/internal-child-skill-source-development-plan.md` for child-skill research assignments.

## Directory Layout

| Path                                                  | Contents                                                                              | Notes                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `source-materials/cleaned/INDEX.md`                   | Cleaned corpus index and source-level synthesis.                                      | Start here for source analysis and child-skill assignments.                                                        |
| `source-materials/cleaned/SYNTHESIS.md`               | Distilled source synthesis.                                                           | Use before reading individual source cards.                                                                        |
| `source-materials/cleaned/web/`                       | Cleaned Markdown source cards converted from web snapshots.                           | Treat official deliverability/compliance sources as current only as of 2026-05-15; recheck before operational use. |
| `source-materials/cleaned/pdf/`                       | Cleaned Markdown source cards converted from PDF assets.                              | Raw PDF binaries were removed to keep the repo lean; use source URLs to reacquire exact PDFs if needed.            |
| `source-materials/metadata/sources.json`              | Machine-readable source URL, status, use, cleaned path, and removed artifact details. | Use for automation and future source refresh jobs.                                                                 |
| `docs/marketing/growth/research/youtube-transcripts/` | Newly pulled transcripts plus previous transcript library.                            | New transcripts are listed below.                                                                                  |

## Batch 1: Deliverability And Compliance

These sources govern the deliverability control plane, technical sending floor, and legal/compliance guardrails.

| Source                            | Local file                                                     | Status                     | Use                                                        |
| --------------------------------- | -------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Google email sender guidelines    | `cleaned/web/google-email-sender-guidelines.md`                | acquired; official-current | Gmail and Google Workspace sender requirements.            |
| Google sender guidelines FAQ      | `cleaned/web/google-email-sender-guidelines-faq.md`            | acquired; official-current | Clarifications for bulk sender requirements.               |
| Yahoo Sender Hub best practices   | `cleaned/web/yahoo-sender-best-practices.md`                   | acquired; official-current | Yahoo deliverability requirements and best practices.      |
| Yahoo sender FAQ                  | `cleaned/web/yahoo-sender-faq.md`                              | acquired; official-current | Sender requirement clarifications.                         |
| Yahoo complaint feedback loop     | `cleaned/web/yahoo-complaint-feedback-loop.md`                 | acquired; official-current | Complaint monitoring and feedback loop setup.              |
| Yahoo SMTP error codes            | `cleaned/web/yahoo-smtp-error-codes.md`                        | acquired; official-current | Bounce/error diagnosis.                                    |
| Microsoft Outlook postmaster      | `cleaned/web/microsoft-outlook-postmaster.md`                  | acquired; official-current | Outlook.com deliverability program overview.               |
| Microsoft SNDS page               | `cleaned/web/outlook-postmaster-snds.md`                       | acquired; official-current | SNDS entry point.                                          |
| Microsoft SNDS FAQ                | `cleaned/web/microsoft-snds-faq.md`                            | acquired; official-current | SNDS FAQ captured after the original uppercase URL failed. |
| M3AAWG sender documents           | `cleaned/web/m3aawg-sender-documents.md`                       | acquired; official-current | Anti-abuse and sender best-practice references.            |
| DMARC resources                   | `cleaned/web/dmarc-resources.md`                               | acquired; official-current | Authentication standard reference hub.                     |
| DMARC specifications              | `cleaned/web/dmarc-specifications.md`                          | acquired; official-current | DMARC standards reference.                                 |
| Postmark deliverability guides    | `cleaned/web/postmark-deliverability-guides.md`                | acquired                   | Practical deliverability guide hub.                        |
| Postmark troubleshooting          | `cleaned/web/postmark-delivery-troubleshooting.md`             | acquired                   | Delivery diagnosis.                                        |
| Postmark domain warmup            | `cleaned/web/postmark-domain-warmup.md`                        | acquired                   | Warmup and ramping considerations.                         |
| Postmark SPF importance           | `cleaned/web/postmark-spf-importance.md`                       | acquired                   | SPF and authentication explanation.                        |
| GlockApps deliverability guide    | `cleaned/pdf/glockapps-email-deliverability-ultimate-guide.md` | acquired                   | Inbox placement and deliverability testing primer.         |
| FTC CAN-SPAM guide                | `cleaned/web/ftc-can-spam-guide.md`                            | acquired; official-current | United States commercial email compliance.                 |
| ICO PECR electronic mail guidance | `cleaned/web/ico-pecr-electronic-mail-marketing.md`            | acquired; official-current | UK electronic mail marketing rules.                        |
| ICO direct marketing plan         | `cleaned/web/ico-plan-direct-marketing.md`                     | acquired; official-current | UK direct marketing planning guidance.                     |
| CRTC CASL FAQ                     | `cleaned/web/crtc-casl-faq.md`                                 | acquired; official-current | Canadian anti-spam compliance basics.                      |
| CRTC CASL regulations             | `cleaned/web/crtc-casl-act-regulations.md`                     | acquired; official-current | Canadian act and regulations reference.                    |

Suggested source-analysis outputs:

- Provider requirement matrix.
- DNS/authentication checklist.
- Sending-volume and warmup guardrails.
- Compliance pass/block/manual-review decision tree.
- "Do not send" boundary list for agents.

## Batch 2: Compiler, Copy, Taste, And Sequence

These sources feed the outreach compiler, subject/preview rules, taste layer, sequencing, and follow-up behavior.

| Source                                               | Local file                                                                                                       | Status                       | Use                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Lavender Cold Email Benchmark Report                 | `cleaned/web/lavender-cold-email-benchmark.md`                                                                   | acquired; directional-vendor | Benchmarks, quality scoring, inbox psychology.                       |
| Lavender subject line tips                           | `cleaned/web/lavender-subject-line-tips.md`                                                                      | acquired; directional-vendor | Subject and preview rules.                                           |
| Lavender Cold Email 101                              | `cleaned/web/lavender-cold-email-101.md`                                                                         | acquired; directional-vendor | Cold email fundamentals and relevance framing.                       |
| Lavender teardown #1                                 | `cleaned/web/lavender-email-teardown-1.md`                                                                       | acquired; directional-vendor | Before/after taste examples.                                         |
| pclub Cold Email Conversion Machine                  | `cleaned/web/pclub-cold-email-conversion-machine.md`                                                             | acquired                     | Florin Tatulea/pclub conversion-course structure.                    |
| Jason Bay / Outbound Squad executive cold email page | `cleaned/web/outbound-squad-execs-dont-take-meetings.md`                                                         | acquired                     | Strategic executive outreach standards.                              |
| 30MPC 85M cold emails transcript                     | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-30mpc-85-million-cold-emails.md`                  | pulled-2026-05-15            | Large-sample cold email patterns, reply-oriented drafting.           |
| Jason Bay cold email webinar transcript              | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-cold-email-double-reply-rates.md`       | pulled-2026-05-15            | Webinar-length source on reply-rate improvement.                     |
| Jason Bay / Belal Batrawy subject lines transcript   | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-belal-batrawy-subject-line-formulas.md` | pulled-2026-05-15            | Subject-line formulas and open-rate framing.                         |
| Close 1-2-3 email hack                               | `cleaned/web/close-123-email-hack.md`                                                                            | acquired                     | Low-friction reply fork.                                             |
| Close Hail Mary / dead leads                         | `cleaned/web/close-hail-mary-dead-leads.md`                                                                      | acquired                     | Reviving silent or dead threads.                                     |
| Close cold email follow-up plan                      | `cleaned/web/close-cold-email-follow-up-plan.md`                                                                 | acquired                     | Cold follow-up timing and structure.                                 |
| Close sales follow-up guide                          | `cleaned/web/close-follow-up.md`                                                                                 | acquired                     | Follow-up philosophy and cadence.                                    |
| Close cold email hacks PDF                           | `cleaned/pdf/close-cold-email-hacks.md`                                                                          | acquired                     | Legacy scripts and cold email examples; use selectively.             |
| Close follow-up formula PDF                          | `cleaned/pdf/close-follow-up-formula.md`                                                                         | acquired                     | Follow-up doctrine and persistence standards.                        |
| Gong objection handling                              | `cleaned/web/gong-objection-handling-techniques.md`                                                              | acquired; directional-vendor | Objection categories and response patterns.                          |
| Gong sales email follow-up                           | `cleaned/web/gong-sales-email-follow-up.md`                                                                      | acquired; directional-vendor | Follow-up behavior and reply conversion.                             |
| VeryGoodCopy home/archive                            | `cleaned/web/verygoodcopy-home.md`                                                                               | acquired                     | Voice, restraint, and copy taste; not cold email doctrine by itself. |
| Cognism State of Outbound 2026                       | `cleaned/web/cognism-state-of-outbound-2026.md`                                                                  | acquired; directional-vendor | Outbound channel mix and current market context.                     |
| Mailshake State of Cold Email 2025                   | `cleaned/pdf/mailshake-state-of-cold-email-2025.md`                                                              | acquired; directional-vendor | Cold email benchmarks; triangulate before using as governing truth.  |

Suggested source-analysis outputs:

- Mode-specific compiler templates.
- Subject plus preview-text packager.
- Mobile body lint.
- Trust/taste scorecard.
- Bad-to-good rewrite examples.
- Cadence and stop-rule matrix.

## Batch 3: ICP, Signal, Offer, And Market Learning

These sources feed the "right person -> right moment -> right reason -> right offer -> right ask" layers.

| Source                                              | Local file                                                           | Status             | Use                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| April Dunford books page                            | `cleaned/web/april-dunford-books.md`                                 | acquired           | Official book/source metadata for positioning and sales-pitch extraction.  |
| Demand-Side Sales                                   | `cleaned/web/demand-side-sales.md`                                   | acquired           | Bob Moesta demand-side sales entry point.                                  |
| The Mom Test                                        | `cleaned/web/mom-test-book.md`                                       | acquired           | Rob Fitzpatrick book/source metadata for customer-discovery rules.         |
| Lean Analytics book page                            | `cleaned/web/lean-analytics-book.md`                                 | acquired           | Book/source metadata for metric discipline.                                |
| Lean Analytics sneak peek PDF                       | `cleaned/pdf/lean-analytics-sneak-peek.md`                           | acquired excerpt   | Partial official excerpt; full book remains manual.                        |
| Trustworthy Online Controlled Experiments page      | `cleaned/web/trustworthy-online-controlled-experiments-cambridge.md` | acquired           | Experimentation book/source metadata.                                      |
| Trustworthy Online Controlled Experiments chapter 1 | `cleaned/pdf/trustworthy-online-controlled-experiments-chapter1.md`  | acquired excerpt   | Controlled experiment principles for outreach testing.                     |
| Experiment guide                                    | `cleaned/web/experiment-guide.md`                                    | acquired           | Practical experiment design support.                                       |
| Fanatical Prospecting Wiley page                    | `cleaned/web/fanatical-prospecting-wiley.md`                         | acquired           | Official book metadata for prospecting discipline.                         |
| Fanatical Prospecting book club guide               | `cleaned/pdf/fanatical-prospecting-book-club-guide.md`               | acquired companion | Discussion guide; not a substitute for the book.                           |
| Predictable Revenue methodology PDF                 | `cleaned/pdf/predictable-revenue-methodology.md`                     | acquired           | Outbound system and specialization primer.                                 |
| Sahil Bloom cold email thread PDF                   | `cleaned/pdf/sahil-bloom-cold-email-thread.md`                       | acquired           | Founder/operator cold email checklist and examples.                        |
| Joel Klettke headline formulas                      | `cleaned/pdf/joel-klettke-headline-formulas.md`                      | acquired           | Optional copy inspiration; use carefully for email subject/offer language. |

Suggested source-analysis outputs:

- Segment and signal scoring rubric.
- Offer artifact library.
- Trust/ask ratio rubric.
- Buying-committee role map.
- Learning-loop and experiment design memo.

## Batch 4: Specialty Modes

These sources deepen investor, recruiting, PR/podcast, founder-to-founder, and creator-recipient variants.

| Source                                                | Local file                                                         | Status                       | Use                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------- |
| YC: How to Cold Email Investors                       | `cleaned/web/yc-cold-email-investors.md`                           | acquired                     | Investor mode, concise factual payload.                  |
| YC: Aaron Harris on fundraising and meeting investors | `cleaned/web/yc-aaron-harris-fundraising-and-meeting-investors.md` | acquired                     | Fundraising outreach, investor-fit research, direct ask. |
| YC: How to Email Early Stage Investors                | `cleaned/web/yc-email-early-stage-investors.md`                    | acquired                     | Early-stage investor outreach basics.                    |
| Gem cold recruiting email                             | `cleaned/web/gem-cold-recruiting-email.md`                         | acquired; directional-vendor | Candidate-centered recruiting outreach.                  |
| Greenhouse sourcing email best practices              | `cleaned/web/greenhouse-sourcing-email-best-practices.md`          | acquired; directional-vendor | Recruiting sequence structure and templates.             |
| RecruitingDaily cold outreach six elements            | `cleaned/web/recruitingdaily-cold-outreach-six-elements.md`        | acquired; directional-vendor | Recruiting-specific copy and sender norms.               |
| Puzzle Inbox recruiting cold email                    | `cleaned/web/puzzle-inbox-recruiting-cold-email.md`                | acquired; directional-vendor | Recruiting outreach mechanics; triangulate.              |
| Justin Jackson cold email/DM advice                   | `cleaned/web/justin-jackson-cold-email.md`                         | acquired                     | Founder/creator recipient perspective.                   |
| Kai Davis podcast outreach email                      | `cleaned/web/kai-davis-podcast-outreach-email.md`                  | acquired                     | Podcast guest pitch craft.                               |
| CastFox podcast guest pitch                           | `cleaned/web/castfox-podcast-guest-pitch.md`                       | acquired; directional-vendor | Current podcast outreach structure; triangulate claims.  |
| Puzzle Inbox podcast guest outreach                   | `cleaned/web/puzzle-inbox-podcast-guest-outreach.md`               | acquired; directional-vendor | Podcast outreach examples; triangulate.                  |
| Muck Rack guide to pitching PDF                       | `cleaned/pdf/muckrack-guide-to-pitching.md`                        | acquired                     | Media pitching guide; use as PR/podcast-mode source.     |
| Muck Rack successful pitch checklist PDF              | `cleaned/pdf/muckrack-successful-pitch-checklist.md`               | acquired                     | Pitch checklist; use as PR/podcast-mode quality control. |
| Muck Rack AI prompts for PR pros PDF                  | `cleaned/pdf/muckrack-ai-prompts-pr-pros.md`                       | acquired                     | Optional AI-assisted PR workflow support.                |

Suggested source-analysis outputs:

- Investor mode reference.
- Recruiting mode reference.
- PR/podcast mode reference.
- Founder/creator relationship mode reference.
- Mode-specific trust standards.

## Manual And Blocked Source Gaps

These are still needed for a complete source-backed architecture, but they should not be scraped or replaced with unauthorized copies.

| Gap                                                   | Status              | Why it remains open                                                                                                   |
| ----------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| April Dunford, `Sales Pitch`                          | manual-book-extract | Need legitimate copy or user notes for the full sales-pitch structure.                                                |
| April Dunford, `Obviously Awesome`                    | manual-book-extract | Need legitimate copy or user notes for positioning extraction.                                                        |
| Bob Moesta, `Demand-Side Sales 101`                   | manual-book-extract | Official site captured, but full book extraction still needed.                                                        |
| Rob Fitzpatrick, `The Mom Test`                       | manual-book-extract | Official site captured, but full book extraction still needed.                                                        |
| Brent Adamson, `The Challenger Customer`              | manual-book-extract | Needed for Mobilizer/Talker/Blocker and buying committee depth.                                                       |
| Robert Cialdini, `Influence`                          | manual-book-extract | Needed for psychology primitives; use legitimate access or notes.                                                     |
| Chris Voss, `Never Split the Difference`              | manual-book-extract | Needed for tactical empathy and reply handling; use legitimate access or notes.                                       |
| Daniel Pink, `To Sell Is Human`                       | manual-book-extract | Needed for attunement/clarity psychology; use legitimate access or notes.                                             |
| Aaron Ross, `Predictable Revenue` full book           | manual-book-extract | Methodology PDF captured, but full book remains manual.                                                               |
| Donald Miller, `Building a StoryBrand`                | manual-book-extract | Needed only as a light "recipient as hero" support layer.                                                             |
| Chip Heath and Dan Heath, `Made to Stick`             | manual-book-extract | Optional for memory/clarity rules.                                                                                    |
| `Trustworthy Online Controlled Experiments` full book | manual-book-extract | Chapter 1 captured; full book remains manual.                                                                         |
| `Lean Analytics` full book                            | manual-book-extract | Sneak peek captured; full book remains manual.                                                                        |
| `Fanatical Prospecting` full book                     | manual-book-extract | Book club guide captured; full book remains manual.                                                                   |
| Muck Rack media pitching guide web page               | blocked             | Page returned 403 during acquisition. Use browser/manual retrieval if the web page is needed beyond the acquired PDF. |
| Muck Rack pitching best practices help page           | blocked             | Page returned 403 during acquisition. Use browser/manual retrieval if a help-center version is needed.                |
| Lavender Inbox Triage article                         | missing             | Previously listed URL returned 404 during acquisition. Find current replacement.                                      |
| Joel Klettke Case Study Blueprint PDF                 | missing             | Previously listed URL returned 404 during acquisition. Find current replacement or alternate source.                  |
| Becc Holland current public talk                      | unresolved-video    | Existing analysis exists; current public transcript still optional.                                                   |
| April Dunford podcast/video                           | unresolved-video    | Needed only if offer/positioning child skill needs a transcript-backed current source.                                |
| Bob Moesta interview/talk                             | unresolved-video    | Needed only if Jobs-to-be-Done child skill needs transcript-backed examples.                                          |
| Chris Voss interview/talk                             | unresolved-video    | Needed only if reply-handling child skill needs transcript-backed examples.                                           |
| Trent Dressel email/objection video                   | unresolved-video    | Useful if deepening SDR objection and multi-channel behavior.                                                         |
| Will Allred/Lavender YouTube source                   | unresolved-video    | Useful if a transcript-backed subject/taste source is needed beyond web articles.                                     |

## Recommended Next Analysis Order

1. Analyze Batch 1 official deliverability/compliance sources and produce the provider requirement matrix before changing any sending recommendations.
2. Analyze Batch 2 compiler/taste sources and convert them into subject, preview, body, proof, CTA, cadence, and quality rubrics.
3. Analyze Batch 3 ICP/offer/experiment sources and strengthen the source-of-truth, ICP/signal engine, OfferLab, and learning loop.
4. Analyze Batch 4 specialty sources only after the root system is stable, because those are mode-specific standards rather than the base engine.
5. Use manual book extractions to deepen child skills, not to block the root skill. The root should work from already-analyzed local sources plus the acquired web/PDF archive.

## Acquisition Notes

- Official deliverability and compliance pages were acquired as snapshots on 2026-05-15. They should be rechecked before operational send recommendations because provider and legal requirements can change.
- Vendor and benchmark reports are useful as directional inputs, not governing truth unless their methodology is clear and triangulated.
- Raw transcripts are internal research artifacts. Runtime skills should load distilled references, rubrics, and examples rather than raw source dumps.
- Raw HTML and PDF source artifacts have been replaced by cleaned Markdown cards and URL metadata.
- The north star remains: qualified conversations started per unit of market trust consumed.
