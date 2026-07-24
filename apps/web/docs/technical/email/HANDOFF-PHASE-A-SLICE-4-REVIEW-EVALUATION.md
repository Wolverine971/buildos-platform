<!-- apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-4-REVIEW-EVALUATION.md -->

# Handoff — Gmail Relevance Phase A, Slice 4 Review and Evaluation

**Created:** 2026-07-23  
**Depends on:** Slice 3 live pilot receipt  
**Current authority:** Design and implement candidate review/adjudication only. Do not enable a
model route, retrieve bodies, mutate Gmail, or create autonomous project updates.

## Entry state

Slice 3 completed one bounded production run over three read-only connections and three captured
project profiles. The content-free outcome is recorded in
`RECEIPT-PHASE-A-SLICE-3-LIVE-PILOT.md`.

- 2,148 observations were fully processed;
- variants A/B produced 1,724 and 731 candidates respectively;
- all scopes completed with exactly-once checkpoints and no retries/errors;
- no raw-content/model budget or mutation path was enabled; and
- the temporary production Phase A environment values were removed after the run.

Do not rerun Slice 3 merely to build review UI. The transient observations and candidates are
available for at most seven days, so prioritize a reviewed access design and sampling plan before
their retention deadline.

## Mission

Build a human review and evaluation surface that can measure retrieval quality without weakening
the Phase A data boundary:

1. select a statistically useful, account-balanced candidate sample;
2. show only the minimum review context authorized by a separately reviewed retrieval decision;
3. record explicit human adjudications and correction reasons;
4. compute recall, precision, wrong-project risk, coverage, and cost by variant/account/project;
5. export only content-free aggregate metrics; and
6. produce a written A/B decision before any C/D model bakeoff.

## Required decisions before implementation

### Review context

The Slice 3 candidate table intentionally contains no subject, snippet, participant, header, or
body. Choose and review one of these approaches before authoring the UI:

- request-lifetime metadata re-fetch for a single explicitly opened candidate; or
- a separately approved encrypted short-lived review cache with a seven-day maximum.

Body retrieval is not authorized by Slice 3. If a later review decision allows it, use the existing
sanitized on-demand read path for one explicitly opened item; never prefetch bodies or attachments.

### Adjudication schema

Define a narrow human-decision record containing opaque candidate/project references, reviewer,
decision enum, bounded correction reason enum, variant blindness metadata, and timestamps. Do not
copy mailbox content or free-form model reasoning into the record.

### Sampling

Lock an account-balanced and variant-aware sampling policy. The Phase A target remains at least 300
adjudications, including at least 100 per account and positive/negative/ambiguous examples. Prevent
duplicate A/B candidates for the same observation/project from double-counting the human sample.

## Review workflow contract

The reviewer must be able to mark:

- correct project;
- wrong project;
- relevant but missing another project;
- not project-relevant;
- ambiguous/insufficient context; and
- explicit always/never rule proposal.

Rule proposals remain proposals until separately confirmed. Review must not create tasks, events,
decisions, risks, notes, progress updates, Gmail labels, drafts, or messages.

Use variant blinding where feasible so the reviewer does not know whether A, B, or both produced a
candidate before adjudication. Preserve version identifiers and evidence-category booleans for
post-adjudication explanation.

## Metrics and exit criteria

Report content-free aggregates for:

- precision and recall by variant;
- wrong-project rate and ambiguous rate;
- account/project coverage;
- candidate overlap and unique contribution of A vs B;
- candidate yield per 100 observations;
- provider calls, Gmail units, runtime, and cost per accepted candidate;
- correction/rule proposal counts; and
- retention/deletion completion.

The architecture target is candidate recall at least 95%, wrong-project rate below 2%, and a
written precision/coverage tradeoff. Treat these as evaluation thresholds, not claims already met
by the Slice 3 candidate counts.

## Security and test matrix

Before production review:

- owner and exact-user gate every list/open/adjudicate action;
- reject foreign candidate, observation, project, profile version, run, and connection scope IDs;
- use CSRF-safe form actions with exact input allowlists;
- prove variant blinding and one-review-per-sample idempotency;
- prove disconnect and retention behavior;
- scan action payloads, logs, errors, traces, analytics, and snapshots for restricted values;
- prove no Gmail mutation/model/queue/watch/cron/project-mutation import is reachable; and
- run the existing Slice 3 verifier and focused regression suites unchanged.

## Explicit stop gates

- Do not start C/D or another model without a separate zero-data-retention provider decision.
- Do not add temporary subject/snippet storage without a separate schema, encryption, retention,
  and leak review.
- Do not accept or mutate BuildOS project data automatically from a candidate.
- Do not extend retention merely because review implementation is incomplete.
- Do not run another mailbox scan without a separately approved manifest and operational gate.

## Definition of done

Slice 4 is complete when at least 300 balanced human adjudications can be recorded safely, A/B
quality and cost are reported from those decisions, correction proposals remain explicit human
actions, transient retention is verified, and a written decision chooses the next retrieval policy
without enabling a model or autonomous mutation path.
