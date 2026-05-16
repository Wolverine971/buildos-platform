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

Status: internal source archive. Do not publish raw source snapshots externally.

This archive captures the source acquisition pass for the master cold email outreach system. It is meant to feed source analysis, child-skill deepening, and private BuildOS skill refinement.

Acquired on 2026-05-15:

- 53 HTML/web snapshots in `source-materials/web/`.
- 13 PDFs in `source-materials/pdf/`.
- 3 additional YouTube transcripts in `docs/marketing/growth/research/youtube-transcripts/`; the broader resource inventory tracks 7 total 2026-05-15 transcript pulls for this buildout.
- Prior local transcripts, source analyses, and reference modules remain in their existing repo locations.

Use this manifest with:

- `../references/internal-source-acquisition-queue.md` for the original acquisition plan.
- `../resource-inventory.md` for the broader resource map from `next-sources.md`.
- `../references/source-map.md` for current governing source lineage.
- `../references/internal-child-skill-source-development-plan.md` for child-skill research assignments.

## Directory Layout

| Path | Contents | Notes |
| --- | --- | --- |
| `source-materials/web/` | HTML snapshots from official docs, vendor guides, practitioner articles, book pages, and specialty outreach sources. | Treat official deliverability/compliance sources as current only as of 2026-05-15; recheck before operational use. |
| `source-materials/pdf/` | Downloaded PDFs, reports, excerpts, and guide documents. | Muck Rack PDFs were sanity-checked with `pdfinfo` and are readable; Muck Rack web pages still require manual/browser retrieval. |
| `docs/marketing/growth/research/youtube-transcripts/` | Newly pulled transcripts plus previous transcript library. | New transcripts are listed below. |

## Batch 1: Deliverability And Compliance

These sources govern the deliverability control plane, technical sending floor, and legal/compliance guardrails.

| Source | Local file | Status | Use |
| --- | --- | --- | --- |
| Google email sender guidelines | `web/google-email-sender-guidelines.html` | acquired; official-current | Gmail and Google Workspace sender requirements. |
| Google sender guidelines FAQ | `web/google-email-sender-guidelines-faq.html` | acquired; official-current | Clarifications for bulk sender requirements. |
| Yahoo Sender Hub best practices | `web/yahoo-sender-best-practices.html` | acquired; official-current | Yahoo deliverability requirements and best practices. |
| Yahoo sender FAQ | `web/yahoo-sender-faq.html` | acquired; official-current | Sender requirement clarifications. |
| Yahoo complaint feedback loop | `web/yahoo-complaint-feedback-loop.html` | acquired; official-current | Complaint monitoring and feedback loop setup. |
| Yahoo SMTP error codes | `web/yahoo-smtp-error-codes.html` | acquired; official-current | Bounce/error diagnosis. |
| Microsoft Outlook postmaster | `web/microsoft-outlook-postmaster.html` | acquired; official-current | Outlook.com deliverability program overview. |
| Microsoft SNDS page | `web/outlook-postmaster-snds.html` | acquired; official-current | SNDS entry point. |
| Microsoft SNDS FAQ | `web/microsoft-snds-faq.html` | acquired; official-current | SNDS FAQ captured after the original uppercase URL failed. |
| M3AAWG sender documents | `web/m3aawg-sender-documents.html` | acquired; official-current | Anti-abuse and sender best-practice references. |
| DMARC resources | `web/dmarc-resources.html` | acquired; official-current | Authentication standard reference hub. |
| DMARC specifications | `web/dmarc-specifications.html` | acquired; official-current | DMARC standards reference. |
| Postmark deliverability guides | `web/postmark-deliverability-guides.html` | acquired | Practical deliverability guide hub. |
| Postmark troubleshooting | `web/postmark-delivery-troubleshooting.html` | acquired | Delivery diagnosis. |
| Postmark domain warmup | `web/postmark-domain-warmup.html` | acquired | Warmup and ramping considerations. |
| Postmark SPF importance | `web/postmark-spf-importance.html` | acquired | SPF and authentication explanation. |
| GlockApps deliverability guide | `pdf/glockapps-email-deliverability-ultimate-guide.pdf` | acquired | Inbox placement and deliverability testing primer. |
| FTC CAN-SPAM guide | `web/ftc-can-spam-guide.html` | acquired; official-current | United States commercial email compliance. |
| ICO PECR electronic mail guidance | `web/ico-pecr-electronic-mail-marketing.html` | acquired; official-current | UK electronic mail marketing rules. |
| ICO direct marketing plan | `web/ico-plan-direct-marketing.html` | acquired; official-current | UK direct marketing planning guidance. |
| CRTC CASL FAQ | `web/crtc-casl-faq.html` | acquired; official-current | Canadian anti-spam compliance basics. |
| CRTC CASL regulations | `web/crtc-casl-act-regulations.html` | acquired; official-current | Canadian act and regulations reference. |

Suggested source-analysis outputs:

- Provider requirement matrix.
- DNS/authentication checklist.
- Sending-volume and warmup guardrails.
- Compliance pass/block/manual-review decision tree.
- "Do not send" boundary list for agents.

## Batch 2: Compiler, Copy, Taste, And Sequence

These sources feed the outreach compiler, subject/preview rules, taste layer, sequencing, and follow-up behavior.

| Source | Local file | Status | Use |
| --- | --- | --- | --- |
| Lavender Cold Email Benchmark Report | `web/lavender-cold-email-benchmark.html` | acquired; directional-vendor | Benchmarks, quality scoring, inbox psychology. |
| Lavender subject line tips | `web/lavender-subject-line-tips.html` | acquired; directional-vendor | Subject and preview rules. |
| Lavender Cold Email 101 | `web/lavender-cold-email-101.html` | acquired; directional-vendor | Cold email fundamentals and relevance framing. |
| Lavender teardown #1 | `web/lavender-email-teardown-1.html` | acquired; directional-vendor | Before/after taste examples. |
| pclub Cold Email Conversion Machine | `web/pclub-cold-email-conversion-machine.html` | acquired | Florin Tatulea/pclub conversion-course structure. |
| Jason Bay / Outbound Squad executive cold email page | `web/outbound-squad-execs-dont-take-meetings.html` | acquired | Strategic executive outreach standards. |
| 30MPC 85M cold emails transcript | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-30mpc-85-million-cold-emails.md` | pulled-2026-05-15 | Large-sample cold email patterns, reply-oriented drafting. |
| Jason Bay cold email webinar transcript | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-cold-email-double-reply-rates.md` | pulled-2026-05-15 | Webinar-length source on reply-rate improvement. |
| Jason Bay / Belal Batrawy subject lines transcript | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-belal-batrawy-subject-line-formulas.md` | pulled-2026-05-15 | Subject-line formulas and open-rate framing. |
| Close 1-2-3 email hack | `web/close-123-email-hack.html` | acquired | Low-friction reply fork. |
| Close Hail Mary / dead leads | `web/close-hail-mary-dead-leads.html` | acquired | Reviving silent or dead threads. |
| Close cold email follow-up plan | `web/close-cold-email-follow-up-plan.html` | acquired | Cold follow-up timing and structure. |
| Close sales follow-up guide | `web/close-follow-up.html` | acquired | Follow-up philosophy and cadence. |
| Close cold email hacks PDF | `pdf/close-cold-email-hacks.pdf` | acquired | Legacy scripts and cold email examples; use selectively. |
| Close follow-up formula PDF | `pdf/close-follow-up-formula.pdf` | acquired | Follow-up doctrine and persistence standards. |
| Gong objection handling | `web/gong-objection-handling-techniques.html` | acquired; directional-vendor | Objection categories and response patterns. |
| Gong sales email follow-up | `web/gong-sales-email-follow-up.html` | acquired; directional-vendor | Follow-up behavior and reply conversion. |
| VeryGoodCopy home/archive | `web/verygoodcopy-home.html` | acquired | Voice, restraint, and copy taste; not cold email doctrine by itself. |
| Cognism State of Outbound 2026 | `web/cognism-state-of-outbound-2026.html` | acquired; directional-vendor | Outbound channel mix and current market context. |
| Mailshake State of Cold Email 2025 | `pdf/mailshake-state-of-cold-email-2025.pdf` | acquired; directional-vendor | Cold email benchmarks; triangulate before using as governing truth. |

Suggested source-analysis outputs:

- Mode-specific compiler templates.
- Subject plus preview-text packager.
- Mobile body lint.
- Trust/taste scorecard.
- Bad-to-good rewrite examples.
- Cadence and stop-rule matrix.

## Batch 3: ICP, Signal, Offer, And Market Learning

These sources feed the "right person -> right moment -> right reason -> right offer -> right ask" layers.

| Source | Local file | Status | Use |
| --- | --- | --- | --- |
| April Dunford books page | `web/april-dunford-books.html` | acquired | Official book/source metadata for positioning and sales-pitch extraction. |
| Demand-Side Sales | `web/demand-side-sales.html` | acquired | Bob Moesta demand-side sales entry point. |
| The Mom Test | `web/mom-test-book.html` | acquired | Rob Fitzpatrick book/source metadata for customer-discovery rules. |
| Lean Analytics book page | `web/lean-analytics-book.html` | acquired | Book/source metadata for metric discipline. |
| Lean Analytics sneak peek PDF | `pdf/lean-analytics-sneak-peek.pdf` | acquired excerpt | Partial official excerpt; full book remains manual. |
| Trustworthy Online Controlled Experiments page | `web/trustworthy-online-controlled-experiments-cambridge.html` | acquired | Experimentation book/source metadata. |
| Trustworthy Online Controlled Experiments chapter 1 | `pdf/trustworthy-online-controlled-experiments-chapter1.pdf` | acquired excerpt | Controlled experiment principles for outreach testing. |
| Experiment guide | `web/experiment-guide.html` | acquired | Practical experiment design support. |
| Fanatical Prospecting Wiley page | `web/fanatical-prospecting-wiley.html` | acquired | Official book metadata for prospecting discipline. |
| Fanatical Prospecting book club guide | `pdf/fanatical-prospecting-book-club-guide.pdf` | acquired companion | Discussion guide; not a substitute for the book. |
| Predictable Revenue methodology PDF | `pdf/predictable-revenue-methodology.pdf` | acquired | Outbound system and specialization primer. |
| Sahil Bloom cold email thread PDF | `pdf/sahil-bloom-cold-email-thread.pdf` | acquired | Founder/operator cold email checklist and examples. |
| Joel Klettke headline formulas | `pdf/joel-klettke-headline-formulas.pdf` | acquired | Optional copy inspiration; use carefully for email subject/offer language. |

Suggested source-analysis outputs:

- Segment and signal scoring rubric.
- Offer artifact library.
- Trust/ask ratio rubric.
- Buying-committee role map.
- Learning-loop and experiment design memo.

## Batch 4: Specialty Modes

These sources deepen investor, recruiting, PR/podcast, founder-to-founder, and creator-recipient variants.

| Source | Local file | Status | Use |
| --- | --- | --- | --- |
| YC: How to Cold Email Investors | `web/yc-cold-email-investors.html` | acquired | Investor mode, concise factual payload. |
| YC: Aaron Harris on fundraising and meeting investors | `web/yc-aaron-harris-fundraising-and-meeting-investors.html` | acquired | Fundraising outreach, investor-fit research, direct ask. |
| YC: How to Email Early Stage Investors | `web/yc-email-early-stage-investors.html` | acquired | Early-stage investor outreach basics. |
| Gem cold recruiting email | `web/gem-cold-recruiting-email.html` | acquired; directional-vendor | Candidate-centered recruiting outreach. |
| Greenhouse sourcing email best practices | `web/greenhouse-sourcing-email-best-practices.html` | acquired; directional-vendor | Recruiting sequence structure and templates. |
| RecruitingDaily cold outreach six elements | `web/recruitingdaily-cold-outreach-six-elements.html` | acquired; directional-vendor | Recruiting-specific copy and sender norms. |
| Puzzle Inbox recruiting cold email | `web/puzzle-inbox-recruiting-cold-email.html` | acquired; directional-vendor | Recruiting outreach mechanics; triangulate. |
| Justin Jackson cold email/DM advice | `web/justin-jackson-cold-email.html` | acquired | Founder/creator recipient perspective. |
| Kai Davis podcast outreach email | `web/kai-davis-podcast-outreach-email.html` | acquired | Podcast guest pitch craft. |
| CastFox podcast guest pitch | `web/castfox-podcast-guest-pitch.html` | acquired; directional-vendor | Current podcast outreach structure; triangulate claims. |
| Puzzle Inbox podcast guest outreach | `web/puzzle-inbox-podcast-guest-outreach.html` | acquired; directional-vendor | Podcast outreach examples; triangulate. |
| Muck Rack guide to pitching PDF | `pdf/muckrack-guide-to-pitching.pdf` | acquired | Media pitching guide; use as PR/podcast-mode source. |
| Muck Rack successful pitch checklist PDF | `pdf/muckrack-successful-pitch-checklist.pdf` | acquired | Pitch checklist; use as PR/podcast-mode quality control. |
| Muck Rack AI prompts for PR pros PDF | `pdf/muckrack-ai-prompts-pr-pros.pdf` | acquired | Optional AI-assisted PR workflow support. |

Suggested source-analysis outputs:

- Investor mode reference.
- Recruiting mode reference.
- PR/podcast mode reference.
- Founder/creator relationship mode reference.
- Mode-specific trust standards.

## Manual And Blocked Source Gaps

These are still needed for a complete source-backed architecture, but they should not be scraped or replaced with unauthorized copies.

| Gap | Status | Why it remains open |
| --- | --- | --- |
| April Dunford, `Sales Pitch` | manual-book-extract | Need legitimate copy or user notes for the full sales-pitch structure. |
| April Dunford, `Obviously Awesome` | manual-book-extract | Need legitimate copy or user notes for positioning extraction. |
| Bob Moesta, `Demand-Side Sales 101` | manual-book-extract | Official site captured, but full book extraction still needed. |
| Rob Fitzpatrick, `The Mom Test` | manual-book-extract | Official site captured, but full book extraction still needed. |
| Brent Adamson, `The Challenger Customer` | manual-book-extract | Needed for Mobilizer/Talker/Blocker and buying committee depth. |
| Robert Cialdini, `Influence` | manual-book-extract | Needed for psychology primitives; use legitimate access or notes. |
| Chris Voss, `Never Split the Difference` | manual-book-extract | Needed for tactical empathy and reply handling; use legitimate access or notes. |
| Daniel Pink, `To Sell Is Human` | manual-book-extract | Needed for attunement/clarity psychology; use legitimate access or notes. |
| Aaron Ross, `Predictable Revenue` full book | manual-book-extract | Methodology PDF captured, but full book remains manual. |
| Donald Miller, `Building a StoryBrand` | manual-book-extract | Needed only as a light "recipient as hero" support layer. |
| Chip Heath and Dan Heath, `Made to Stick` | manual-book-extract | Optional for memory/clarity rules. |
| `Trustworthy Online Controlled Experiments` full book | manual-book-extract | Chapter 1 captured; full book remains manual. |
| `Lean Analytics` full book | manual-book-extract | Sneak peek captured; full book remains manual. |
| `Fanatical Prospecting` full book | manual-book-extract | Book club guide captured; full book remains manual. |
| Muck Rack media pitching guide web page | blocked | Page returned 403 during acquisition. Use browser/manual retrieval if the web page is needed beyond the acquired PDF. |
| Muck Rack pitching best practices help page | blocked | Page returned 403 during acquisition. Use browser/manual retrieval if a help-center version is needed. |
| Lavender Inbox Triage article | missing | Previously listed URL returned 404 during acquisition. Find current replacement. |
| Joel Klettke Case Study Blueprint PDF | missing | Previously listed URL returned 404 during acquisition. Find current replacement or alternate source. |
| Becc Holland current public talk | unresolved-video | Existing analysis exists; current public transcript still optional. |
| April Dunford podcast/video | unresolved-video | Needed only if offer/positioning child skill needs a transcript-backed current source. |
| Bob Moesta interview/talk | unresolved-video | Needed only if Jobs-to-be-Done child skill needs transcript-backed examples. |
| Chris Voss interview/talk | unresolved-video | Needed only if reply-handling child skill needs transcript-backed examples. |
| Trent Dressel email/objection video | unresolved-video | Useful if deepening SDR objection and multi-channel behavior. |
| Will Allred/Lavender YouTube source | unresolved-video | Useful if a transcript-backed subject/taste source is needed beyond web articles. |

## Recommended Next Analysis Order

1. Analyze Batch 1 official deliverability/compliance sources and produce the provider requirement matrix before changing any sending recommendations.
2. Analyze Batch 2 compiler/taste sources and convert them into subject, preview, body, proof, CTA, cadence, and quality rubrics.
3. Analyze Batch 3 ICP/offer/experiment sources and strengthen the source-of-truth, ICP/signal engine, OfferLab, and learning loop.
4. Analyze Batch 4 specialty sources only after the root system is stable, because those are mode-specific standards rather than the base engine.
5. Use manual book extractions to deepen child skills, not to block the root skill. The root should work from already-analyzed local sources plus the acquired web/PDF archive.

## Acquisition Notes

- Official deliverability and compliance pages were acquired as snapshots on 2026-05-15. They should be rechecked before operational send recommendations because provider and legal requirements can change.
- Vendor and benchmark reports are useful as directional inputs, not governing truth unless their methodology is clear and triangulated.
- Raw transcripts and source snapshots are internal research artifacts. Runtime skills should load distilled references, rubrics, and examples rather than raw source dumps.
- The north star remains: qualified conversations started per unit of market trust consumed.
