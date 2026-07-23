<!-- apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-3-METADATA-RETRIEVAL.md -->

# Handoff — Gmail Relevance Phase A, Slice 3 Metadata-Only A/B Retrieval

**Created:** 2026-07-23  
**Status:** Local implementation checkpoint complete on 2026-07-23. Migration
`20260723223402` is authored and disposable-tested but is not applied to production; generated
production types are intentionally unchanged, both flags remain off, and no real Gmail call has
been run.

**Tracker:** `tasker/36-gmail-project-relevance-phase-a.md`  
**Slice 2 receipt:**
[HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md](HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md)  
**Architecture:**
[GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md](GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md)  
**Migration protocol:**
[SUPABASE-MIGRATION-LEDGER-BASELINE.md](SUPABASE-MIGRATION-LEDGER-BASELINE.md)

## Objective

Add the first real, bounded Gmail read on top of the proven Slice 2 control plane. For each selected
account, list at most 1,000 messages from the immutable 30-day window, retrieve at most 50 metadata
records per bounded operation, and evaluate two deterministic, model-free retrieval variants:

- **A:** explicit rules, confirmed threads, actors/domains, artifacts, and identifiers;
- **B:** A plus bounded structured-profile lexical scoring and negative evidence.

The result is a set of explainable, content-free observation/candidate rows suitable for the
separate Slice 4 review build. Subject, snippet, participant addresses, and provider responses are
request-lifetime values only. No model or Gmail mutation is reachable.

## Assessment and implementation checkpoint — 2026-07-23

The Slice 2 prerequisites and production migration ledger were reassessed before implementation.
Local and linked history remain aligned through `20260723211500`, with no later production
migration present. The handoff's security and lifecycle design is implementable without a queue or
new public route. Four contracts needed to be made concrete and are now versioned in code: scorer
weights/thresholds, purpose-specific provider request shapes, encryption/hash contexts, and
database-owned operation pricing.

The local checkpoint includes:

- a pure metadata normalizer and deterministic A/B scorer with fixed evidence categories;
- a purpose-specific Gmail gateway limited to one 100-message list page or at most 50
  metadata-format gets, re-authorizing immediately before each provider call;
- domain-separated AES-256-GCM envelopes and per-user keyed hashes for provider IDs, cursors,
  rule values, and evidence fingerprints;
- a direct one-operation driver through the existing claim/reserve/settle boundary, with no queue,
  model, Gmail mutation, watch, or recurring trigger;
- transactional migration `20260723223402_gmail_relevance_metadata_retrieval.sql` for encrypted
  observations, content-free candidates, database-priced list/metadata operations, cursor
  promotion after page drain, retention, RLS, and disconnect cleanup; and
- invented-fixture unit, gateway, driver, leak/static-boundary, and disposable PostgreSQL tests.

Verification at this checkpoint: 83 focused Gmail/Phase A tests pass across 19 files; focused lint
passes; the web check passes with zero errors and zero warnings; the Slice 3 SQL harness returns
`gmail_relevance_metadata_retrieval_ok`; and the existing Slice 2 SQL lifecycle harness still
returns `gmail_relevance_scan_control_plane_ok` after the Slice 3 migration.

This is not the Slice 3 production exit receipt. Before production apply, review the exact
migration, run the remaining complete synthetic three-connection lifecycle, apply only the reviewed
file through the forward protocol, regenerate types from production, wire the reviewed exact-user
private invocation, and then run the explicitly authorized pilot with flags otherwise remaining
off.

## Proven prerequisite

- Production versions `20260723000000` and `20260723211500` are ledger-aligned.
- Slice 2 run, project-scope, connection-scope, and reservation tables are live and empty after
  deployment.
- The control plane proves immutable manifests, exact run/scope binding, lease/CAS replay safety,
  pause/resume/cancel/expiry, quota/runtime reservation, disconnect isolation, and owner RLS.
- The server gate still requires both `GMAIL_RELEVANCE_PHASE_A_ENABLED=true` and an exact user ID in
  `GMAIL_RELEVANCE_PHASE_A_USER_IDS`; wildcards remain unsupported.
- `GMAIL_RELEVANCE_MODEL_ENABLED` remains default off.
- No scan queue is registered yet. The existing strict serializer permits only `run_id`,
  `connection_scope_id`, `checkpoint_version`, and an opaque `processing_token`.

## Hard boundary

Slice 3 may call only Gmail `users.messages.list` and `users.messages.get` with
`format=metadata`. It must not:

- request `format=full`, `format=raw`, MIME bodies, attachment data, or attachment IDs;
- call a model, embedding provider, autonomous agent, or tool loop;
- retain subject, snippet, participant address, raw header, label name, Gmail query, raw page token,
  or Gmail URL;
- put provider message/thread IDs, cursor material, profile terms, or mailbox-derived values in a
  queue payload, log, trace, audit metadata, analytics event, or error;
- register a Gmail watch, Pub/Sub subscription, cron, recurring poll, or daily-brief integration;
- create a task, event, decision, risk, note, progress update, or other project entity;
- send, draft, label, archive, delete, mark read/unread, or otherwise mutate Gmail; or
- enable the Phase A/model flags or broaden the user allowlist as part of the implementation.

The Gmail API can include a `snippet` in a metadata response. Treat it as restricted even when the
request is `format=metadata`: cap and sanitize it in memory, never pass the provider object to a
logger, and never persist the snippet itself.

## Provider contract

Do not route the scan through the current interactive `searchMessages` or full-message method.
Add a purpose-specific server-only gateway operation with an exact input/output schema:

- validate the caller's user, selected connection, active status, read capability, and stored
  read-only scopes again immediately before every provider call;
- compile the Gmail query from the immutable policy and timestamps inside the gateway; accept no
  caller-provided query text and never persist/log the compiled query;
- list inbox plus sent mail for the fixed window while excluding spam, trash, and drafts;
- request only an explicit fields allowlist and only the metadata headers the deterministic scorer
  actually needs;
- bound provider response bytes and timeout exactly as the current read gateway does;
- return a new narrow internal type, not the interactive `GmailMessageSummary` type, because that
  type includes account address/label and display content not allowed across this boundary; and
- convert all provider failures to fixed codes before they reach control-plane settlement.

Google's current quota reference assigns 5 units to `messages.list` and 20 units to
`messages.get`. `messages.list` accepts up to 500 results, but this pilot remains capped at 1,000 per
account and 50 metadata gets per bounded web invocation. See the official
[quota reference](https://developers.google.com/workspace/gmail/api/reference/quota) and
[`messages.list` reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

## Required Slice 2 extension

Do not overload the current `synthetic_step` reservation code for real reads. A new uniquely
versioned transactional migration must:

1. extend reservation operation codes to fixed `list_page` and `metadata_batch` values;
2. price reservations from a database allowlist/policy version rather than trusting arbitrary
   application quantities;
3. preserve zero raw-content/model budgets;
4. add encrypted cursor-envelope/key-version fields to connection scopes, with immutable manifest
   fields still protected;
5. advance the cursor/checkpoint only after every discovered message on the page is durably
   processed; and
6. retain the existing token hash, expected checkpoint, run/scope binding, lease, reservation, and
   settle CAS rules.

Keep `messages.list` and each metadata batch as independently reserved operations. The existing
20,050-unit account ceiling represents 1,000 metadata gets plus up to ten list pages. If the chosen
page/batch design would require more than ten list calls, stop and revise the policy/version and
manifest contract explicitly; do not silently overrun the locked budget.

## Proposed storage

Finalize names during migration review, but keep discovery, candidates, and control state separate.

### Message observations

One row per `(connection_scope_id, provider_message_id_hash)`:

- opaque user/run/scope IDs;
- keyed per-user hash plus encrypted provider message ID and encrypted provider thread ID, with key
  version; plaintext IDs are needed only inside the credential-bound web process;
- internal date, coarse allowlisted mailbox category bits, processing state, retention expiry, and
  content-free evidence fingerprints;
- unique replay constraint for the connection scope and message hash; and
- no subject, snippet, participant address, raw header, raw label, body, MIME, attachment, generic
  metadata/context JSON, or free-form error.

Discovery rows may temporarily represent page members awaiting metadata. Their encrypted IDs must
never leave the web credential boundary. Disconnect deletes unresolved observations and their
encrypted provider links.

### Project candidates

One active row per observation/project/variant:

- opaque observation, user, project, and captured profile-version IDs;
- variant `a` or `b`, scorer/policy versions, bounded numeric score/confidence, and fixed evidence
  category booleans/counts;
- candidate state and retention expiry; and
- no copied mailbox value or free-form explanation.

Store explainability as fixed categories such as `confirmed_thread`, `explicit_rule`,
`actor_overlap`, `domain_overlap`, `artifact_overlap`, `identifier_overlap`, `lexical_overlap`, and
`negative_evidence`. Do not store the matching term or mailbox value.

## Bounded execution sequence

1. An exact-user server action creates or resumes an immutable Slice 2 run.
2. Claim and reserve one fixed `list_page` operation before calling Gmail.
3. List one bounded page; encrypt/hash discovered provider IDs and settle the list reservation.
4. Claim and reserve one `metadata_batch` of at most 50 pending observations.
5. Decrypt IDs only inside the web process and issue metadata-only gets with bounded concurrency.
6. Normalize restricted values in memory, run deterministic A and B against the captured profile
   versions, and persist only approved hashes/categories/scores.
7. Settle actual quota/runtime and advance the checkpoint once. A stale token or checkpoint is a
   no-op.
8. Repeat until the page is drained, then advance the encrypted page cursor. Stop at 1,000 messages,
   the final page, cancellation, expiry, disconnect, or the next denied reservation.

The executor checks the durable pause/cancel/expiry state at claim and settlement boundaries. A
completed in-flight provider operation may settle once while its lease is valid, but no next call
starts after a stop request.

## Queue decision

Prove the entire lifecycle through a direct private server driver first. If transport is needed,
register exactly one dedicated job type using the already-locked four-field serializer. The worker
may pace and call a private authenticated web endpoint, but it must never receive OAuth tokens,
Gmail encryption keys, provider IDs, cursors, query text, or message metadata. `queue_jobs` remains
transport, never source of truth.

## Required tests

- Two users: every foreign run, connection, observation, project, and profile is rejected.
- Three connections and overlapping project profiles; input ordering does not change results.
- Exact query-policy tests cover inbox+sent, 30 days, and spam/trash/draft exclusion without
  snapshotting durable query text.
- Provider mocks assert only list and metadata-format get routes, fields/header allowlists, response
  byte ceilings, timeouts, and bounded concurrency.
- A malicious subject/snippet fixture remains inert data and never influences instructions or logs.
- At most 50 metadata gets begin per operation and at most 1,000 observations exist per account.
- Every list/get reserves the exact versioned units before execution; denied reservation causes
  zero provider calls.
- Duplicate list results, duplicate jobs, stale tokens, expired leases, and response retries create
  no duplicate observation/candidate/checkpoint.
- Pause/resume/cancel/expiry and disconnect during list, fetch, score, and settle leave consistent
  counters and affect only the intended scope.
- Variant A/B fixtures cover exact rules, thread, actor/domain, artifact/identifier, lexical,
  negative, ambiguous, and no-match outcomes with fixed explainability categories.
- Rows, serialized jobs, logs, audits, traces, analytics, errors, and snapshots pass a forbidden
  value/key leak scan.
- Static source tests prove no `format=full/raw`, model, embedding, mutation, watch, Pub/Sub, cron,
  or daily-brief import path is reachable.
- Disposable migration tests prove constraints, encryption/key-version requirements, immutable
  fields, RLS, browser write denial, retention, replay uniqueness, and disconnect deletion.

Use invented fixtures only. No real account address, provider ID, query/cursor, project term, or
mailbox content belongs in the repository or test output.

## Build order

1. Re-read the production ledger and Slice 2 receipt; choose a new unique UTC migration version.
2. Lock pure metadata normalization, fixed evidence, A/B scorer, retention, and leak contracts.
3. Add the narrow metadata-only gateway method and prove its request allowlist with provider mocks.
4. Author and disposable-test the exact transactional observation/candidate/control-plane extension.
5. Implement a direct private driver through the existing claim/reserve/settle boundary.
6. Prove the complete synthetic-provider three-account lifecycle and all negative paths.
7. Review and apply only the exact migration using the forward protocol, then regenerate types.
8. Keep flags off and stop. Write the separate Slice 4 review/evaluation handoff before adding a
   mailbox review UI or collecting real adjudications.

## Exit criteria

Slice 3 is complete only when a bounded three-account pilot can list/fetch metadata, produce
explainable A/B candidates, and finish inside quota/runtime ceilings with exactly-once checkpoints;
no restricted mailbox value crosses the approved in-memory boundary; all content/model budgets stay
zero; no model, body, attachment, queue secret, recurring trigger, or Gmail mutation is reachable;
and the migration/runtime/leak receipts are recorded while deployment flags remain off.
