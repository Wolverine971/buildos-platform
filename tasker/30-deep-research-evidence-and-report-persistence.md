<!-- tasker/30-deep-research-evidence-and-report-persistence.md -->

# 30 — Deep Research Evidence Contracts & Report Persistence

**Created 2026-07-19.** Owner: research-runtime / data engineer.  
**Type:** product-integrity build handoff.  
**Depends on:** bounded V0.1 orchestration; coordinate schema additions with task 29.

## Outcome

Research children return typed evidence—not prose blobs—and the coordinator persists a durable,
source-linked report that can be reopened, audited, and reused by Agentic Chat.

## Prior gap

Children currently return ordinary Agent Run results and the coordinator synthesizes bounded text
packets. URLs are retained in prose, but there is no enforced claim-to-source graph, source
deduplication, citation validation, or first-class report/document record.

## Local implementation checkpoint — 2026-07-21

The first WP-1/WP-2 slice is built locally:

- shared version-1 types cover claims, `fact | inference | opinion`, source records, bounded
  claim-to-source links, contradictions, limitations, unanswered questions, search coverage, and
  confidence;
- the worker accepts source URLs only when the same child durably recorded a successful
  `util.web.visit`, canonicalizes redirects without losing requested-URL aliases, deduplicates
  sources, verifies claimed exact excerpts against the bounded fetched text, bounds total packet
  size, and records worker-observed access times and queries;
- fabricated/unknown source ids, unvisited URLs, and factual claims without direct support preserve
  partial evidence but cannot produce a `completed` child;
- coordinator synthesis now consumes the typed JSON packets, and a root cannot finish `completed`
  when either child lacks completion-ready evidence; prose-only child answers are not substituted
  for missing validated packets.

Still open: live-provider/eval proof, stronger citation-aware validation of synthesized report
claims, durable report/source-manifest persistence, retrieval/export, retention, and legacy packet
handling.

### 2026-07-22 smoke + local remediation

The evidence contract was exercised live, but neither fan-out run produced a packet: all four
children reached their 20,000-token target before the model's final `submit_result`. The worker now:

- treats 20,000 as the child target with a modest 22,000 hard ceiling;
- estimates headroom for one final evidence turn and forces finalization before the ceiling;
- builds that turn from bounded, durably recorded search/visit observations rather than replaying
  every large tool response;
- caps normal research output at 2,048 tokens and the evidence turn at 4,096;
- sanitizes JSON-hostile telemetry before persistence and derives evidence observations from the
  exact sanitized value that was durably stored.

If successful telemetry cannot be persisted, its result is explicitly marked unusable for citation.
This is locally tested but does not count as live-provider proof until a rerun produces validated
packets and a source-linked root report. Durable report persistence remains the next product slice.

### Final remediation smoke — 2026-07-22

The clean rerun did produce typed live packets within the intended token envelope, so packet
generation/provenance is now live-proved. The integrity gate also exposed the remaining quality
boundary instead of hiding it:

- fan-out roots stayed `partial` when a packet was incomplete or invalid;
- a Q1 synthesizer returned schema-valid placeholder text (`...`), which the coordinator previously
  accepted; local code now rejects non-substantive reports and returns the evidence-only fallback;
- both direct single reports cited search candidates they had never visited, and the Q2 single
  confidently made the false claim that OpenRouter has no `max_price` control.

Therefore WP-1/WP-2 live proof is substantially complete, but WP-3 is not: the direct-deep baseline
and root report need citation resolution against durable visits plus explicit objective-coverage
checks. WP-4/WP-5 durable report persistence/retrieval remain fully open.

## Work packages

### WP-1 — Evidence packet schema (P0)

Define and validate a versioned child result containing:

- claims with stable ids, claim text, confidence, and `fact | inference | opinion`;
- source records with canonical URL, title, publisher, publication/fetch dates, and source type;
- claim-to-source links with supporting excerpt/location;
- contradictions, limitations, unanswered questions, and search coverage.

Reject or downgrade packets with fabricated source ids or unsupported factual claims.

### WP-2 — Source normalization and safe capture (P0)

Canonicalize/dedupe URLs, retain fetch metadata, enforce existing SSRF/content-size controls, and
store only bounded excerpts needed for audit. Respect robots/licensing/retention constraints; do
not silently persist full copyrighted pages.

### WP-3 — Citation-aware synthesis (P0)

Make synthesis consume typed claim/source ids. Validate that every report citation resolves to a
captured source and every factual conclusion has support. Preserve disagreement instead of
averaging it away. A validation failure produces a partial report with explicit unsupported
sections, not invented citations.

### WP-4 — Durable report artifact (P1)

Persist a versioned Deep Research Report linked to:

- root and child Agent Runs;
- originating chat/project/message;
- evidence packet versions and cost metrics;
- status, confidence, open questions, and generated-at timestamp.

Decide whether the canonical artifact is a BuildOS document subtype, a dedicated research table, or
both (structured record plus rendered document). Re-running must create a new version.

### WP-5 — Retrieval and export (P1)

Expose safe APIs for reopening a report, listing its sources, jumping from claim to evidence,
exporting Markdown, and attaching selected conclusions to project context without copying all raw
web content.

## Definition of done

- A report can be audited from conclusion → claim → captured source.
- Broken/fabricated citations are caught before a completed status.
- Reports survive chat reloads and worker restarts and are versioned on rerun.
- Retention and deletion remove derived evidence consistently.
