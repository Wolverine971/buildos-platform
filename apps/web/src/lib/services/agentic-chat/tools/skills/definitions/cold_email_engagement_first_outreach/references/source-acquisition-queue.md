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

As of 2026-05-16, the archive has been cleaned, pruned, and tactically gap-filled: 36 active web-source Markdown cards and 9 active PDF-source Markdown cards remain. 28 low-value source cards were removed from the active corpus; source URL metadata and pruning reasons are stored separately. Raw HTML snapshots and raw PDF binaries were removed after conversion. The broader resource inventory tracks 7 total 2026-05-15 transcript pulls for the v2 buildout. Remaining gaps are mostly deeper manual book extractions, async reply examples, one moved Lavender article, one moved Joel Klettke PDF, and optional unresolved transcript targets.

Cleaned corpus:

```text
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/INDEX.md
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/SYNTHESIS.md
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/metadata/sources.json
```

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

Already acquired / analyze next:

- Google email sender guidelines and FAQ.
- Yahoo Sender Hub best practices and FAQ.
- Microsoft Outlook Postmaster sender support.
- Postmark deliverability guides.
- FTC CAN-SPAM guide.
- ICO PECR/electronic mail marketing guidance.
- CRTC CASL FAQ.
- Provider requirement matrix: `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_deliverability_readiness/references/provider-requirement-matrix.md`.

Output:

- Provider requirement matrix.
- DNS/auth checklist.
- Pass / blocked / manual-only decision tree.
- Compliance boundary notes.

## Batch 2: Compiler And Taste

Grab and analyze:

- Lavender benchmark, subject-line material, and teardown series.
- Florin Tatulea / pclub Cold Email Conversion Machine page.
- Existing Jason Bay webinar and subject-line transcripts.
- Close active follow-up/reply articles and Steli transcript.

Output:

- Subject/preview rules.
- Mode-specific compiler templates.
- Taste scorecard.
- Bad-to-good rewrite examples.

## Batch 3: ICP And Offer

Already acquired / analyze next:

- April Dunford sales-pitch structure source card.
- Bob Moesta demand-side sales talk source card.
- Rob Fitzpatrick / Mom Test source cards.
- Challenger Customer Mobilizer/Talker/Blocker source card.
- Existing local Craig Elias, Becc Holland, Lincoln Murphy, Mark Roberge, Michael Skok, Ash Maurya, and 30MPC buying committee analyses.

Output:

- Signal scoring rubric.
- Segment disqualifier checklist.
- Offer artifact library.
- Trust/ask ratio rubric.

## Batch 4: Reply OS And Learning Review

Already acquired / analyze next:

- Steli Efti / Close 1-2-3 and follow-up materials.
- Gong objection handling and sales follow-up articles.
- Black Swan tactical empathy source card; optionally add Chris Voss book notes later.
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

Already acquired / analyze next:

- YC/Michael Seibel and Aaron Harris investor email sources.
- Gem and Greenhouse recruiting outreach sources.
- Muck Rack PR/media pitching sources.
- Muck Rack State of Journalism 2025 and PR News 2025 media-relations source cards.
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
- Do not re-add pruned admin-only deliverability pages, testing-tool guides, generic AI prompt sheets, or legacy template PDFs unless a narrow troubleshooting task explicitly needs them.
- Do not optimize for emails sent instead of qualified conversations per unit of market trust consumed.
