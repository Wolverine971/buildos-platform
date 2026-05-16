---
doc_type: source-materials-manifest
skill: cold-email-engagement-first-outreach
created: 2026-05-15
updated: 2026-05-15
visibility: internal
publish: false
purpose: Manifest for the pruned, cleaned cold email outreach source corpus.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/manifest.md
---

# Cold Email Source Materials Manifest

Status: pruned internal source corpus. Do not publish source cards externally without review.

Cleaned/pruned on 2026-05-15:

- 36 active web-source Markdown cards in `source-materials/cleaned/web/`.
- 9 active PDF-source Markdown cards in `source-materials/cleaned/pdf/`.
- 28 low-value source cards removed from the active corpus; URLs and reasons remain in `source-materials/metadata/sources.json`.
- Raw HTML snapshots and raw PDF binaries were removed.
- Distilled synthesis: `source-materials/cleaned/SYNTHESIS.md`.
- Cleaned index: `source-materials/cleaned/INDEX.md`.
- Source URL metadata: `source-materials/metadata/sources.json`.
- The broader resource inventory tracks 7 total 2026-05-15 transcript pulls for this buildout.

## Directory Layout

| Path                                     | Contents                               | Notes                                       |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------- |
| `source-materials/cleaned/SYNTHESIS.md`  | Distilled source synthesis.            | Read this before individual source cards.   |
| `source-materials/cleaned/INDEX.md`      | Active source catalog and pruning log. | Start here for assignments.                 |
| `source-materials/cleaned/web/`          | Active web-source Markdown cards.      | No raw HTML remains.                        |
| `source-materials/cleaned/pdf/`          | Active PDF-source Markdown cards.      | No raw PDF binaries remain.                 |
| `source-materials/metadata/sources.json` | Active and pruned source URL metadata. | Use for automation and future refresh jobs. |

## Pruning Standard

Keep only sources that directly support the cold email architecture, a child skill, a compliance gate, or a specialty mode. Remove low-level deliverability/admin pages, shallow book marketing pages, duplicate vendor posts, generic templates, and dated material that would make the skill worse.

## Deliverability And Compliance

- Provider and legal launch gates.
- No low-level sender-admin pages in the active corpus.

| Source                                                                 | Cleaned file                                        | Status                     | Use                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| Email sender guidelines - Google Workspace Admin Help                  | `cleaned/web/google-email-sender-guidelines.md`     | acquired; official-current | Gmail and Google Workspace sender requirements.       |
| Email sender guidelines FAQ - Google Workspace Admin Help              | `cleaned/web/google-email-sender-guidelines-faq.md` | acquired; official-current | Clarifications for bulk sender requirements.          |
| Yahoo Sender Hub                                                       | `cleaned/web/yahoo-sender-best-practices.md`        | acquired; official-current | Yahoo deliverability requirements and best practices. |
| Yahoo Sender Hub                                                       | `cleaned/web/yahoo-sender-faq.md`                   | acquired; official-current | Sender requirement clarifications.                    |
| Outlook.com Postmaster                                                 | `cleaned/web/microsoft-outlook-postmaster.md`       | acquired; official-current | Outlook.com deliverability program overview.          |
| Deliverability Guides                                                  | `cleaned/web/postmark-deliverability-guides.md`     | acquired                   | Practical deliverability guide hub.                   |
| CAN-SPAM Act: A Compliance Guide for Business                          | `cleaned/web/ftc-can-spam-guide.md`                 | acquired; official-current | United States commercial email compliance.            |
| Electronic mail marketing                                              | `cleaned/web/ico-pecr-electronic-mail-marketing.md` | acquired; official-current | UK electronic mail marketing rules.                   |
| Frequently Asked Questions about Canada's Anti-Spam Legislation / CRTC | `cleaned/web/crtc-casl-faq.md`                      | acquired; official-current | Canadian anti-spam compliance basics.                 |

## Compiler, Taste, And Sequence

- Message packaging, taste, follow-up, and directional benchmark sources.
- Legacy template PDFs and generic copywriting pages were pruned.

| Source                                                                  | Cleaned file                                                  | Status                       | Use                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Updated: The Cold Email Benchmark Report (Added Content Insights)       | `cleaned/web/lavender-cold-email-benchmark.md`                | acquired; directional-vendor | Benchmarks, quality scoring, inbox psychology.                              |
| How to Write Cold Email Subject Lines that Get Opens                    | `cleaned/web/lavender-subject-line-tips.md`                   | acquired; directional-vendor | Subject and preview rules.                                                  |
| Cold Email 101: How to Write Emails People Actually Read (and Reply To) | `cleaned/web/lavender-cold-email-101.md`                      | acquired; directional-vendor | Cold email fundamentals and relevance framing.                              |
| Email Teardown #1: A little more them > you                             | `cleaned/web/lavender-email-teardown-1.md`                    | acquired; directional-vendor | Before/after taste examples.                                                |
| The Cold Email Conversion Machine by Florin Tatulea / pclub.io          | `cleaned/web/pclub-cold-email-conversion-machine.md`          | acquired                     | Florin Tatulea/pclub conversion-course structure.                           |
| Does the 1-2-3 Email Hack Still Work 8 Years Later?                     | `cleaned/web/close-123-email-hack.md`                         | acquired                     | Low-friction reply fork.                                                    |
| The Hail Mary Email That Turned “Dead Leads” Into Gold                  | `cleaned/web/close-hail-mary-dead-leads.md`                   | acquired                     | Reviving silent or dead threads.                                            |
| The Winning Cold Email Follow-up Plan for Sales Teams                   | `cleaned/web/close-cold-email-follow-up-plan.md`              | acquired                     | Cold follow-up timing and structure.                                        |
| Sales Follow-Ups: A Complete Guide to Increasing Your Close Rates       | `cleaned/web/close-follow-up.md`                              | acquired                     | Follow-up philosophy and cadence.                                           |
| Mastering Objection Handling: 12 Techniques That Work / Gong Labs       | `cleaned/web/gong-objection-handling-techniques.md`           | acquired; directional-vendor | Objection categories and response patterns.                                 |
| Black Swan Group Leadership Guide - Tactical Empathy                    | `cleaned/pdf/black-swan-leadership-guide-tactical-empathy.md` | acquired; official-source    | Tactical empathy, labels, summaries, and calibrated questions for Reply OS. |
| From Volume to Precision: The New Era of Outbound Sales                 | `cleaned/web/cognism-state-of-outbound-2026.md`               | acquired; directional-vendor | Outbound channel mix and current market context.                            |
| Mailshake State of Cold Email 2025                                      | `cleaned/pdf/mailshake-state-of-cold-email-2025.md`           | acquired; directional-vendor | Cold email benchmarks; triangulate before using as governing truth.         |

## ICP, Offer, And Market Learning

- Buyer progress, customer discovery, useful asks, and learning-loop discipline.
- Shallow book marketing pages were pruned; manual book extraction remains a gap.

| Source                                                                                   | Cleaned file                                                        | Status                         | Use                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Demand-Side Sales                                                                        | `cleaned/web/demand-side-sales.md`                                  | acquired                       | Bob Moesta demand-side sales entry point.                                       |
| Bob Moesta Demand-Side Sales 101 Talk                                                    | `cleaned/web/bob-moesta-demand-side-sales-talk.md`                  | acquired; transcript-backed    | Buyer progress timeline, struggling moments, and demand-side offer framing.     |
| The Mom Test by Rob Fitzpatrick                                                          | `cleaned/web/mom-test-book.md`                                      | acquired                       | Rob Fitzpatrick book/source metadata for customer-discovery rules.              |
| The Mom Test Publisher Page                                                              | `cleaned/web/mom-test-publisher-page.md`                            | acquired; official-publisher   | False-positive avoidance and evidence-first customer research outreach.         |
| April Dunford Sales Pitch Structure                                                      | `cleaned/pdf/april-dunford-sales-pitch-structure.md`                | acquired; practitioner-primary | Buyer-choice sales pitch structure for OfferLab and compiler.                   |
| The Challenger Customer - Mobilizers, Talkers, and Blockers                              | `cleaned/web/challenger-customer-profiles.md`                       | acquired; practitioner-primary | Mobilizer/Talker/Blocker logic and buying group support for strategic outreach. |
| Experiment Guide – Accelerate innovation using trustworthy online controlled experiments | `cleaned/web/experiment-guide.md`                                   | acquired                       | Practical experiment design support.                                            |
| Lean Analytics sneak peek PDF                                                            | `cleaned/pdf/lean-analytics-sneak-peek.md`                          | acquired excerpt               | Partial official excerpt; full book remains manual.                             |
| Predictable Revenue methodology PDF                                                      | `cleaned/pdf/predictable-revenue-methodology.md`                    | acquired                       | Outbound system and specialization primer.                                      |
| Sahil Bloom cold email thread PDF                                                        | `cleaned/pdf/sahil-bloom-cold-email-thread.md`                      | acquired                       | Founder/operator cold email checklist and examples.                             |
| Trustworthy Online Controlled Experiments chapter 1                                      | `cleaned/pdf/trustworthy-online-controlled-experiments-chapter1.md` | acquired excerpt               | Controlled experiment principles for outreach testing.                          |

## Specialty Modes

- Investor, recruiting, founder/creator, and PR/podcast mode references.
- Duplicate vendor posts and generic AI prompt sheets were pruned.

| Source                                                                | Cleaned file                                                       | Status                       | Use                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| How To Cold Email Investors - Michael Seibel / Y Combinator           | `cleaned/web/yc-cold-email-investors.md`                           | acquired                     | Investor mode, concise factual payload.                                |
| Aaron Harris on Fundraising and Meeting with Investors / Y Combinator | `cleaned/web/yc-aaron-harris-fundraising-and-meeting-investors.md` | acquired                     | Fundraising outreach, investor-fit research, direct ask.               |
| How to Email Early Stage Investors / Y Combinator                     | `cleaned/web/yc-email-early-stage-investors.md`                    | acquired                     | Early-stage investor outreach basics.                                  |
| The anatomy of a great cold recruiting email                          | `cleaned/web/gem-cold-recruiting-email.md`                         | acquired; directional-vendor | Candidate-centered recruiting outreach.                                |
| Sourcing Automation email best practices and templates                | `cleaned/web/greenhouse-sourcing-email-best-practices.md`          | acquired; directional-vendor | Recruiting sequence structure and templates.                           |
| Cold Outreach Email Checklist: What six elements do you need to have? | `cleaned/web/recruitingdaily-cold-outreach-six-elements.md`        | acquired; directional-vendor | Recruiting-specific copy and sender norms.                             |
| Advice for Sending Cold Emails and DMs                                | `cleaned/web/justin-jackson-cold-email.md`                         | acquired                     | Founder/creator recipient perspective.                                 |
| How to Write a Podcast Pitch Email — Kai Davis                        | `cleaned/web/kai-davis-podcast-outreach-email.md`                  | acquired                     | Podcast guest pitch craft.                                             |
| Muck Rack guide to pitching PDF                                       | `cleaned/pdf/muckrack-guide-to-pitching.md`                        | acquired                     | Media pitching guide; use as PR/podcast-mode source.                   |
| Muck Rack successful pitch checklist PDF                              | `cleaned/pdf/muckrack-successful-pitch-checklist.md`               | acquired                     | Pitch checklist; use as PR/podcast-mode quality control.               |
| Muck Rack State of Journalism 2025                                    | `cleaned/web/muckrack-state-of-journalism-2025.md`                 | acquired; survey-summary     | Current journalist workload and trust context for PR/podcast outreach. |
| PR News - The State of Journalism in 2025                             | `cleaned/web/pr-news-state-of-journalism-2025.md`                  | acquired; current-secondary  | Media-relations constraints and audience-first pitch guidance.         |

## Pruned Source Cards

Pruned cards are intentionally omitted from this human-facing manifest to keep future work pointed at the active corpus. Use `source-materials/metadata/sources.json` for the full machine-readable pruning log with URLs and reasons.

## Remaining Gaps

- Deeper legitimate/manual book extractions remain useful for April Dunford, Bob Moesta, Rob Fitzpatrick, Brent Adamson, Cialdini, Voss, Pink, Ross, StoryBrand, Made to Stick, full Lean Analytics, and full Trustworthy Online Controlled Experiments.
- Lavender Inbox Triage and Joel Klettke Case Study Blueprint need replacement URLs.
- Optional transcript targets remain for Becc Holland, April Dunford, Bob Moesta, Chris Voss, Trent Dressel, and Will Allred/Lavender.
- Runtime references now operationalize OfferLab, Reply OS, deliverability, strategic-account, PR/podcast, and customer-research rules. Remaining depth work is mainly richer examples and full/manual book extraction, not missing architecture.

## Acquisition Notes

- Official deliverability and compliance pages were acquired as snapshots on 2026-05-15 and converted to Markdown. Recheck them before operational send recommendations.
- Vendor benchmark reports are directional inputs, not governing truth unless methodology is clear and triangulated.
- Runtime skills should load distilled references, rubrics, and examples rather than raw source dumps.
- The north star remains: qualified conversations started per unit of market trust consumed.
