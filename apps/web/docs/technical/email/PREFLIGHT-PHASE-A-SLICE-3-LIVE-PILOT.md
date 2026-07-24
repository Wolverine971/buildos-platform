<!-- apps/web/docs/technical/email/PREFLIGHT-PHASE-A-SLICE-3-LIVE-PILOT.md -->

# Gmail Relevance Phase A, Slice 3 — Pre-pilot Review

**Prepared:** 2026-07-23  
**Base revision:** `2db0e12b` on `main`  
**Decision:** Implementation and synthetic verification are ready. The live pilot is not
authorized or started.

## Stop gate

No Gmail provider call, production deployment, feature-flag change, allowlist change, production
run creation, or production profile publication was performed while preparing this review.

Before proceeding, obtain explicit approval for all of the following:

1. the exact production user added to `GMAIL_RELEVANCE_PHASE_A_USER_IDS`;
2. temporary production enablement of `GMAIL_RELEVANCE_PHASE_A_ENABLED`;
3. the selected owned projects and the resulting immutable profile capture;
4. creation of one 30-day run over exactly three eligible read-only connections; and
5. manual execution of one Gmail operation at a time.

Keep `GMAIL_RELEVANCE_MODEL_ENABLED=false`. Restore the Phase A flag and allowlist to their
approved default-off posture after the run or any stop.

## Change scope

No migration is required. The implementation scope is:

- `project-email-profile-publication.ts` and its focused tests: ownership-first, deterministic,
  immutable publication with idempotency and safe concurrent-winner handling;
- `metadata-driver-lifecycle.test.ts`: a three-connection, overlapping-profile synthetic lifecycle
  through the real one-operation driver contract;
- `manual-pilot.ts` and its tests: exact-user gate, connection/project validation, server-built
  manifest, idempotent create/resume, one bounded operation, and run controls;
- `routes/admin/gmail-relevance/pilot/+page.server.ts`, `+page.svelte`, and route tests: private
  CSRF-safe form actions with no loop or polling; and
- `scan-manifest.ts` plus `metadata-content-boundary.test.ts`: shared idempotency hashing and the
  extended forbidden-route/key boundary.

The existing dirty handoff and tracker files were preserved and are not part of this implementation
claim.

## Verification receipt

| Check                         | Result                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| Production Slice 3 verifier   | 15/15 `ok`, including `physical_installation_complete`                |
| Migration ledger              | local/remote `20260723223402` aligned; no repair or migration applied |
| Focused Gmail/Phase A suite   | 109/109 passing across 22 files                                       |
| Manual pilot route suite      | 7/7 passing                                                           |
| Focused ESLint                | passing                                                               |
| `@buildos/shared-types` build | passing                                                               |
| `@buildos/web` check          | 0 errors, 0 warnings                                                  |
| Svelte autofixer              | no findings                                                           |

The production verifier used only
`supabase/tests/20260723223402_gmail_relevance_metadata_retrieval.production_verify.sql` inside a
read-only transaction. The fixture-bearing psql lifecycle file was not run against linked data.

## Authenticated action contract

All actions derive `user_id` from `safeGetSession()`, require the global flag plus an exact UUID
allowlist match, and return 404 outside that gate.

| Action        | Exact accepted form fields                                                      | Bounded behavior                                                                                                       |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `?/createRun` | one `idempotency_key`; 1–3 repeated `connection_id`; 1–25 repeated `project_id` | validates current ownership/read eligibility, captures profiles server-side, then creates or resumes one immutable run |
| `?/runOne`    | one `run_id`; one `connection_scope_id`                                         | calls `runOneOperation()` exactly once                                                                                 |
| `?/pause`     | one `run_id`                                                                    | requests pause through the existing control plane                                                                      |
| `?/resume`    | one `run_id`                                                                    | resumes through the existing control plane                                                                             |
| `?/cancel`    | one `run_id`                                                                    | requests terminal cancellation through the existing control plane                                                      |
| `?/expire`    | one `run_id`                                                                    | applies the existing expiry semantics                                                                                  |

Unknown, missing, malformed, or incorrectly repeated fields fail closed. Caller-supplied user IDs,
provider IDs, cursors, query text, metadata, OAuth material, profile hashes, and profile versions
are not accepted.

The one-operation response is restricted to `status`, `operation_code`, `checkpoint_version`,
`scope_state`, `error_code`, `provider_calls_started`, `observation_count`, and `candidate_count`.
Create/resume returns only opaque run/scope IDs and `created`. Control actions return only fixed
state codes.

## Reachable Gmail surface

The manual route reaches Gmail only through `EmailRelevanceMetadataDriver` and
`GmailRelevanceMetadataGateway`. The gateway contains exactly these provider request shapes:

- `GET /gmail/v1/users/me/messages` with the fixed inbox+sent query, spam/trash/drafts excluded,
  `maxResults=100`, and a bounded page token; and
- `GET /gmail/v1/users/me/messages/{opaque-id}` with `format=metadata`, an allowlisted header set,
  bounded response size, and concurrency four.

Static boundary tests reject full/raw format, body/parts, attachments, watch/Pub/Sub, queues,
timers/polling, models/embeddings, and mutation-oriented fields or paths. The route submits exactly
one driver operation and contains no worker registration or browser loop.

## Production readiness facts

| Fact                                        | Pre-pilot status                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Slice 3 physical schema/security            | verified 15/15                                                                     |
| New migration needed                        | no                                                                                 |
| `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1`     | present as an encrypted Production environment variable; value not read or printed |
| `GMAIL_RELEVANCE_PHASE_A_ENABLED`           | not configured in Production; code default is false                                |
| `GMAIL_RELEVANCE_PHASE_A_USER_IDS`          | not configured in Production; exact-user gate fails closed                         |
| `GMAIL_RELEVANCE_MODEL_ENABLED`             | not configured in Production; code default is false                                |
| Eligible connection count for intended user | pending exact-user approval; no account identifiers queried or printed             |
| Selected project count                      | pending approved selection                                                         |
| Captured profile/version count              | pending approved selection and create/resume step                                  |
| Immutable window                            | server-generated at create time: minute-bucketed end minus exactly 30 days         |
| Run expiry                                  | server-generated at create time, no later than 24 hours after creation             |

The three-connection ownership/scope check and selected profile counts remain deliberate operational
gates. They cannot be attributed to an “intended user” without the approved exact user and project
selection. After approval, the private page exposes eligible resources using ordinal labels only;
the service rechecks connection ownership, active/read-enabled state, enabled read capability, an
unrevoked `gmail_read` credential, and stored `gmail.readonly` scopes with no broader Gmail scope.

## Hard ceilings

Per connection: 1,000 observations, ten list pages, 100 list results per page, 50 metadata gets per
operation, four concurrent gets, 20,050 Gmail quota units, and 1,200,000 milliseconds accounted
runtime. A three-connection run therefore has global ceilings of 3,000 observations, 30 list pages,
60,150 Gmail quota units, and 3,600,000 milliseconds accounted runtime. Raw-content bytes, model
tokens, and model cost are all fixed at zero. Observation and candidate retention is at most seven
days.

## Pause, cancel, and abort

- For an expected inspection, submit `pause` before the next operation. An already in-flight
  operation may settle once; the next claim is a zero-provider-call no-op.
- Resume only after the content-free counters/checkpoint are consistent.
- On ownership, policy, accounting, cursor, route, content-boundary, or model anomalies: pause,
  allow any in-flight settlement to finish, then cancel. Do not submit another run-one action.
- A disconnected connection is cancelled by the existing database trigger. Expiry is enforced by
  the manifest/control-plane boundary.
- After completion or abort, restore the flag/allowlist posture and run the checks below. Do not
  inspect raw provider payloads while diagnosing.

## Content-free live verification queries

Replace only `<RUN_UUID>` with the opaque run ID. These queries intentionally return states,
versions, booleans, timestamps, and numeric counters—not connection IDs, project IDs, profile
terms, provider identifiers, ciphertext, hashes, cursors, or message metadata.

### Run manifest, budgets, and terminal state

```sql
SELECT
  state,
  terminal_reason_code,
  window_start,
  window_end,
  expires_at,
  connection_count,
  project_count,
  message_cap_per_connection,
  gmail_quota_budget,
  gmail_quota_reserved,
  gmail_quota_used,
  runtime_ms_budget,
  runtime_ms_reserved,
  runtime_ms_used,
  raw_content_byte_budget,
  model_token_budget,
  model_cost_budget_micros,
  steps_completed,
  messages_seen,
  query_policy_version,
  control_plane_version,
  serializer_version,
  quota_policy_version
FROM public.email_relevance_scan_runs
WHERE id = '<RUN_UUID>'::uuid;
```

### Per-scope checkpoints and counters

```sql
WITH scopes AS (
  SELECT
    id,
    row_number() OVER (ORDER BY id) AS scope_ordinal,
    state,
    terminal_reason_code,
    checkpoint_version,
    list_pages_completed,
    observations_discovered,
    observations_processed,
    steps_completed,
    total_attempts,
    checkpoint_attempts,
    gmail_quota_budget,
    gmail_quota_reserved,
    gmail_quota_used,
    runtime_ms_budget,
    runtime_ms_reserved,
    runtime_ms_used,
    raw_content_byte_budget,
    model_token_budget,
    model_cost_budget_micros,
    last_error_code,
    pending_page_is_final,
    cursor_envelope IS NOT NULL AS has_committed_cursor,
    pending_cursor_envelope IS NOT NULL AS has_pending_cursor
  FROM public.email_relevance_scan_connections
  WHERE run_id = '<RUN_UUID>'::uuid
)
SELECT
  scope_ordinal,
  state,
  terminal_reason_code,
  checkpoint_version,
  list_pages_completed,
  observations_discovered,
  observations_processed,
  steps_completed,
  total_attempts,
  checkpoint_attempts,
  gmail_quota_budget,
  gmail_quota_reserved,
  gmail_quota_used,
  runtime_ms_budget,
  runtime_ms_reserved,
  runtime_ms_used,
  raw_content_byte_budget,
  model_token_budget,
  model_cost_budget_micros,
  last_error_code,
  pending_page_is_final,
  has_committed_cursor,
  has_pending_cursor
FROM scopes
ORDER BY scope_ordinal;
```

### Operation accounting and provider-call count

```sql
WITH scopes AS (
  SELECT id, row_number() OVER (ORDER BY id) AS scope_ordinal
  FROM public.email_relevance_scan_connections
  WHERE run_id = '<RUN_UUID>'::uuid
)
SELECT
  s.scope_ordinal,
  r.operation_code,
  r.state,
  count(DISTINCT r.operation_id) AS operation_count,
  COALESCE(sum(
    CASE
      WHEN r.resource_kind <> 'gmail_quota' OR r.state <> 'settled' THEN 0
      WHEN r.operation_code = 'list_page' THEN r.settled_quantity / 5
      WHEN r.operation_code = 'metadata_batch' THEN r.settled_quantity / 20
      ELSE 0
    END
  ), 0) AS provider_calls_started,
  COALESCE(sum(r.settled_quantity) FILTER (
    WHERE r.resource_kind = 'gmail_quota' AND r.state = 'settled'
  ), 0) AS gmail_quota_used
FROM scopes s
JOIN public.email_relevance_scan_reservations r ON r.connection_scope_id = s.id
GROUP BY s.scope_ordinal, r.operation_code, r.state
ORDER BY s.scope_ordinal, r.operation_code, r.state;
```

### Observation/candidate and retention receipt

```sql
WITH scopes AS (
  SELECT id, row_number() OVER (ORDER BY id) AS scope_ordinal
  FROM public.email_relevance_scan_connections
  WHERE run_id = '<RUN_UUID>'::uuid
), observation_counts AS (
  SELECT
    s.scope_ordinal,
    count(o.id) AS observation_count,
    count(o.id) FILTER (WHERE o.processing_state = 'pending') AS pending_count,
    count(o.id) FILTER (WHERE o.processing_state = 'processed') AS processed_count,
    bool_and(o.retention_expires_at <= o.created_at + interval '7 days') AS retention_bounded
  FROM scopes s
  LEFT JOIN public.email_relevance_message_observations o ON o.connection_scope_id = s.id
  GROUP BY s.scope_ordinal
), candidate_counts AS (
  SELECT
    s.scope_ordinal,
    count(c.id) FILTER (WHERE c.variant = 'a') AS variant_a_count,
    count(c.id) FILTER (WHERE c.variant = 'b') AS variant_b_count,
    bool_and(c.retention_expires_at <= c.created_at + interval '7 days') AS retention_bounded
  FROM scopes s
  LEFT JOIN public.email_relevance_message_observations o ON o.connection_scope_id = s.id
  LEFT JOIN public.email_relevance_project_candidates c ON c.observation_id = o.id
  GROUP BY s.scope_ordinal
)
SELECT
  o.scope_ordinal,
  o.observation_count,
  o.pending_count,
  o.processed_count,
  COALESCE(o.retention_bounded, true) AS observation_retention_bounded,
  c.variant_a_count,
  c.variant_b_count,
  COALESCE(c.retention_bounded, true) AS candidate_retention_bounded
FROM observation_counts o
JOIN candidate_counts c USING (scope_ordinal)
ORDER BY o.scope_ordinal;
```

### Durable-boundary and expired-row checks

```sql
SELECT
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid IN (
      to_regclass('public.email_relevance_message_observations'),
      to_regclass('public.email_relevance_project_candidates')
    )
      AND attnum > 0
      AND NOT attisdropped
      AND attname ~* '^(subject|snippet|participant|raw_header|raw_label|gmail_query|gmail_url|metadata|context|error_message)$'
  ) AS no_restricted_durable_columns,
  (
    SELECT count(*)
    FROM public.email_relevance_message_observations
    WHERE run_id = '<RUN_UUID>'::uuid AND retention_expires_at <= now()
  ) AS expired_observation_rows,
  (
    SELECT count(*)
    FROM public.email_relevance_project_candidates c
    JOIN public.email_relevance_message_observations o ON o.id = c.observation_id
    WHERE o.run_id = '<RUN_UUID>'::uuid AND c.retention_expires_at <= now()
  ) AS expired_candidate_rows;
```

The existing `purge_expired_email_relevance_metadata(integer)` RPC is manual/service-only. Do not
invoke it merely to prepare or observe the pilot.
