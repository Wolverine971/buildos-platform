<!-- apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-4-REVIEW-EVALUATION.md -->

# Handoff — Gmail Relevance Phase A, Slice 4 Review and Evaluation

**Created:** 2026-07-23  
**Depends on:** Slice 3 live pilot receipt  
**Current authority:** Design and implement candidate review/adjudication only. Do not enable a
model route, retrieve bodies, mutate Gmail, or create autonomous project updates.

## Implementation checkpoint — 2026-07-24

The review design decisions are now locked and the first local implementation exists:

The detailed context decision and verification receipt are recorded in
`DECISION-PHASE-A-SLICE-4-REVIEW-CONTEXT.md` and
`RECEIPT-PHASE-A-SLICE-4-REVIEW-IMPLEMENTATION.md`.

- review context uses a request-lifetime, one-message `format=metadata` re-fetch only; there is no
  review cache, body/attachment read, prefetch, or durable mailbox content;
- migration `20260724020000_gmail_relevance_review_evaluation.sql` defines a deterministic,
  variant-blinded, 100-sample-per-account set and immutable bounded adjudication records;
- `/admin/gmail-relevance/review` is gated by the separate default-off
  `GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED` flag and exact-user
  `GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS` allowlist, so review enablement cannot re-enable the
  Slice 3 scan route;
- the UI supports the five bounded decisions, bounded correction reasons, optional always/never
  proposals, post-decision variant reveal, and content-free A/B aggregate metrics;
- pending review samples expire when their source expires or is deleted, while completed
  content-free adjudications remain available for evaluation;
- the live-pilot timeout finding is fixed locally: pilot/review functions allow 60 seconds and a
  metadata batch stops new provider calls at 45 seconds, leaving settlement time inside the
  database lease; and
- migration `20260724030000_gmail_relevance_metadata_retention_enforcement.sql` makes expired
  metadata immediately unreadable to authenticated users, while a separate authenticated hourly
  retention job physically drains expired observations/candidates in bounded batches. This job
  deletes data only; it never polls or reads Gmail.

Focused verification is now 145/145 across 28 Gmail-relevance, admin-route, and retention-route
files. The PostgreSQL runtime test and expanded 16-check read-only physical verifier pass,
`@buildos/web` Svelte diagnostics are zero errors and zero warnings, and the official Svelte
autofixer reports no issue or suggestion for the review component.

The production schema is installed and aligned through `20260724040000`. Production initially
contained a zero-row, unledgered draft of the Slice 4 tables, so the canonical migration was not
destructively replayed. A forward-only reconciliation narrowed service-role table access, removed
the corrected-project FK, made adjudications update-immutable without blocking parent deletion,
added source-expiration cleanup, and aligned deterministic sampling. Retention enforcement and the
reconciliation were exact-file applied; the three exact versions are now aligned in the ledger.
Fresh production types report 245 tables and 14 views, and shared types build successfully.
Production now has Vercel's reserved `CRON_SECRET`, while all Phase A scan/review variables remain
absent. The currently deployed review and retention routes both return 404, confirming this web
revision has not yet been promoted. The production web build passes locally.

The web revision is not yet claimed deployed or review-enabled. Deployment with review flags off,
exact-user review enablement, 300 adjudications, aggregate evaluation, and a retention deletion
receipt remain outstanding.

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

## Locked implementation decisions

### Review context

The Slice 3 candidate table intentionally contains no subject, snippet, participant, header, or
body. Slice 4 uses request-lifetime metadata re-fetch for one explicitly opened sample. An
encrypted review cache is not authorized or implemented.

Body retrieval is not authorized by Slice 3. If a later review decision allows it, use the existing
sanitized on-demand read path for one explicitly opened item; never prefetch bodies or attachments.

### Adjudication schema

Define a narrow human-decision record containing opaque candidate/project references, reviewer,
decision enum, bounded correction reason enum, variant blindness metadata, and timestamps. Do not
copy mailbox content or free-form model reasoning into the record.

### Sampling

The sample is deterministic, account-balanced, and variant-aware: exactly 100 items per account,
with up to 25 items initially selected from each of `a_only`, `b_only`, `both`, and `none`, then a
deterministic fill to 100. One observation/project pair is one review item even when both variants
selected it, so A/B overlap cannot double-count the human sample.

## Recommended completion sequence

1. **Complete:** the disposable PostgreSQL harness covers foreign ownership,
   deterministic 300-item sampling, one-review idempotency, disconnect, expiry, authenticated
   write denial, update immutability, and account/project deletion cleanup.
2. **Complete:** production was reconciled through exact versions `20260724020000`,
   `20260724030000`, and `20260724040000`; the expanded physical verifier, fresh production type
   generation, shared-types build, and final ledger check pass.
3. **Next:** deploy the web route and hourly deletion job with both review variables absent/false.
   Verify the review route is 404, the scan flags remain absent/false, and the retention job can
   return only bounded content-free counts.
4. Temporarily enable only the separate review flag and exact reviewer UUID. Keep the scan and
   model flags off. Prepare the deterministic 300-item sample once; do not rerun Gmail ingestion.
5. Record at least 100 decisions per account, export content-free aggregate metrics, write the A/B
   decision, verify physical source deletion, and return the review gate to default off.

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
