---
doc_type: skill-reference
skill: cold_email_engagement_first_outreach
reference: source-acquisition-queue
visibility: internal
publish: false
created: 2026-05-15
canonical_research_path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-source-acquisition-queue.md
purpose: Runtime acquisition queue for agents sourcing materials to fully build the cold email architecture.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_engagement_first_outreach/references/source-acquisition-queue.md
---

# Source Acquisition Queue

Internal runtime source queue. Do not publish.

Use this when an agent needs to grab source materials for the cold email architecture. The canonical full version lives at:

```text
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-source-acquisition-queue.md
```

Acquired archive:

```text
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/manifest.md
```

As of 2026-05-15, the archive contains 53 web snapshots, 13 PDFs, and 3 newly pulled YouTube transcripts. Remaining gaps are mostly manual book extractions, blocked Muck Rack web pages, one moved Lavender article, one moved Joel Klettke PDF, and optional unresolved transcript targets. Muck Rack PDFs were captured and sanity-checked with `pdfinfo`.

## Priority Order

1. Deliverability and compliance official sources.
2. Cold email copy, taste, subject, preview, and compiler sources.
3. ICP, signal, buying committee, and offer sources.
4. Reply handling, objection handling, and learning review sources.
5. Specialty mode sources: investor, recruiting, PR/podcast, founder-to-founder, partnership.

## Source Status Terms

- `local-existing`: already in the repo.
- `local-analyzed`: already has a source analysis.
- `verified-2026-05-15`: URL or source page verified during the sourcing pass.
- `official-current`: must be rechecked when used.
- `to-pull-transcript`: pull transcript or transcript substitute.
- `manual-book-extract`: use legitimate book access or official excerpts.
- `directional-vendor`: useful but not governing without triangulation.

## Batch 1: Deliverability And Compliance

Grab and analyze:

- Google email sender guidelines and FAQ.
- Yahoo Sender Hub best practices, FAQ, complaint feedback loop, and error codes.
- Microsoft Outlook Postmaster, SNDS, and high-volume sender guidance.
- M3AAWG sender documents.
- DMARC.org resources/specs.
- Postmark deliverability guides.
- FTC CAN-SPAM guide.
- ICO PECR/electronic mail marketing guidance.
- CRTC CASL FAQ.

Output:

- Provider requirement matrix.
- DNS/auth checklist.
- Pass / blocked / manual-only decision tree.
- Compliance boundary notes.

## Batch 2: Compiler And Taste

Grab and analyze:

- Lavender benchmark, subject-line material, and teardown series.
- Florin Tatulea / pclub Cold Email Conversion Machine page.
- Jason Bay / Outbound Squad executive cold email source.
- VeryGoodCopy archive for voice and restraint.
- Close cold email and follow-up PDFs/articles.

Output:

- Subject/preview rules.
- Mode-specific compiler templates.
- Taste scorecard.
- Bad-to-good rewrite examples.

## Batch 3: ICP And Offer

Grab and analyze:

- April Dunford, `Sales Pitch` and `Obviously Awesome`.
- Bob Moesta, `Demand-Side Sales 101`.
- Rob Fitzpatrick, `The Mom Test`.
- `The Challenger Customer`.
- Existing local Craig Elias, Becc Holland, Lincoln Murphy, Mark Roberge, Michael Skok, Ash Maurya, and 30MPC buying committee analyses.

Output:

- Signal scoring rubric.
- Segment disqualifier checklist.
- Offer artifact library.
- Trust/ask ratio rubric.

## Batch 4: Reply OS And Learning Review

Grab and analyze:

- Steli Efti / Close 1-2-3 and follow-up materials.
- Gong objection handling and sales follow-up articles.
- Chris Voss, `Never Split the Difference`.
- Cognism State of Outbound 2026.
- Lavender benchmark.
- Mailshake State of Cold Email 2025.
- Experiment design sources such as `Trustworthy Online Controlled Experiments`.

Output:

- Reply taxonomy.
- SLA matrix.
- Objection route table.
- Stop / iterate / recycle / scale decision tree.
- Learning memo template.

## Batch 5: Specialty Modes

Grab and analyze:

- YC/Michael Seibel and Aaron Harris investor email sources.
- Gem and Greenhouse recruiting outreach sources.
- Muck Rack PR/media pitching sources.
- Kai Davis podcast pitch article.
- Justin Jackson cold email/DM guidance.
- Founder-to-founder sources from Sam Parr, Justin Welsh, and Sahil Bloom if a founder mode is active.

Output:

- Investor mode reference.
- Recruiting mode reference.
- PR/podcast mode reference.
- Founder/creator relationship mode reference.

## Do Not Do

- Do not use unauthorized book PDFs.
- Do not treat vendor benchmark claims as governing without methodology.
- Do not import newsletter/list-email advice as cold-email advice.
- Do not dump raw transcripts into runtime skills.
- Do not optimize for emails sent instead of qualified conversations per unit of market trust consumed.
