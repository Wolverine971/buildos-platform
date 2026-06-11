---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Lavender Cold Email Benchmark'
title: 'Updated: The Cold Email Benchmark Report (Added Content Insights)'
source_url: 'https://www.lavender.ai/blog/the-cold-email-benchmark-report'
source_label: 'Lavender Cold Email Benchmark Report'
status: 'acquired; directional-vendor; interactive table not capturable'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/lavender-cold-email-benchmark.md'
raw_artifact_removed: 'web/lavender-cold-email-benchmark.html'
created: 2026-05-15
rescraped: '2026-06-10'
rescrape_method: 'origin (WebFetch, lavender.ai; 2 fetches — JS benchmark table did not render)'
rescrape_note: 'Original 2026-05-15 scrape captured only "Read next" footer boilerplate. Re-fetch recovered the article prose and dataset facts; the segment-level reply-rate table is an interactive JS embed and was not capturable via static fetch.'
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/lavender-cold-email-benchmark.md
---

# Updated: The Cold Email Benchmark Report (Added Content Insights)

Source URL: <https://www.lavender.ai/blog/the-cold-email-benchmark-report>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

Benchmarks, quality scoring, inbox psychology. The canonical citation for the 231,818-email / ~50k-inbox dataset behind Lavender's numbers. Vendor data — directional, not diagnostic.

## Source Notes

- Acquisition status: acquired; directional-vendor. Article prose captured; the interactive benchmark table (segment-level reply rates) did not render via static fetch and is NOT in this card.
- Source label: Lavender Cold Email Benchmark Report.
- Source description: Cold email benchmarking report; industry/department/seniority-specific benchmarking for cold email performance.

## Cleaned Extract

### Dataset and methodology (as stated on page, 2026-06-10 fetch)

- **231,818 recent cold emails analyzed, as of February 4, 2026.**
- Drawn from "~50k active inboxes connected to Lavender's Email Coach" (page frames its history as "billions of emails we've analyzed" across those inboxes).
- Automated replies excluded (OOO messages, bounces); both positive and negative responses counted as replies.
- Outputs are organized by recipient **department, seniority, and industry**, with filterable/sortable table segments.
- "Content insights" (what works/doesn't for email content) are available for department and seniority segments — inside the interactive table, not the prose.

### Metrics the report tracks

- Overall reply rate per segment.
- "Reply Rate When Sending 90+ Scoring Emails with Lavender" (their A-grade band).
- "Reply Rate Lift" — improvement percentage for high-scoring emails vs segment average.
- Average email scores by segment.

### Lavender's own framing (use as the caveat language)

- "You may find you're above averages. You may find you're behind. This is all normal and should be taken with a grain of salt as no one offering is the same."
- "Lavender's analysis of your inbox is the only true benchmarking."
- Some teams using Lavender reportedly achieve double-digit reply rates (vendor self-claim).

### Adjacent persona learnings (from Lavender's "Benchmark Learnings" companion posts)

- Operations: A-level emails reach a 5.4% reply rate — one of the larger quality lifts across departments.
- Finance: only 6.1% of emails to finance earned a Lavender "A" grade.
- Technical buyers: engineering and product are among the most-prospected technical departments in the 231,818-email dataset.

### Caveats

- The segment-level benchmark numbers themselves live in a JS-rendered interactive table that a static fetch cannot capture; only the dataset description and metric definitions are verified here. If segment numbers are needed, pull them manually in a browser.
- Sample size is stated but selection bias (Lavender users are senders who bought an email coach) is not characterized — keep "directional-vendor."
