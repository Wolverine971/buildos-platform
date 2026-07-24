<!-- apps/web/docs/technical/email/RECEIPT-PHASE-A-SLICE-3-LIVE-PILOT.md -->

# Receipt — Gmail Relevance Phase A, Slice 3 Live Pilot

**Run date:** 2026-07-23 EDT / 2026-07-24 UTC  
**Production revision:** `dcb55351`  
**Run ID:** `fa8c0e78-faf4-4f42-84eb-8cc7ede37a4d`  
**Outcome:** Completed within every approved boundary.

This receipt contains no mailbox address, provider identifier, connection identifier, project
identifier, project term, profile term, cursor, Gmail query, subject, snippet, participant,
header, label, Gmail URL, or message metadata.

## Immutable selection and policy

- one exact allowlisted BuildOS user; identifier omitted;
- three active, owned, read-enabled Gmail connections with an enabled read capability, current
  unrevoked `gmail_read` credential, and stored `gmail.readonly` scopes with no broader Gmail scope;
- the three most recently updated active owned projects; identifiers and terms omitted;
- three immutable captured project profiles, all profile version 1, with no invalidation;
- window: `2026-06-24T03:44:00Z` through `2026-07-24T03:44:00Z`, exactly 30 days;
- expiry: `2026-07-25T03:44:00Z`;
- query policy: `inbox-sent-exclude-spam-trash-drafts-v1`;
- control plane: `email-relevance-scan-control-plane-v1`;
- serializer: `email-relevance-scan-serializer-v1`; and
- quota policy: `email-relevance-gmail-quota-v1`.

## Content-free result

| Scope | Terminal state | Checkpoint / operations | List pages | Observations discovered / processed | A candidates | B candidates | Provider calls | Gmail units | Runtime ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | completed | 5 / 5 | 2 | 148 / 148 | 43 | 35 | 150 | 2,970 | 22,628 |
| 2 | completed | 30 / 30 | 10 | 1,000 / 1,000 | 1,000 | 15 | 1,010 | 20,050 | 154,356 |
| 3 | completed | 30 / 30 | 10 | 1,000 / 1,000 | 681 | 681 | 1,010 | 20,050 | 120,595 |
| **Total** | **completed** | **65 / 65** | **22** | **2,148 / 2,148** | **1,724** | **731** | **2,170** | **43,070** | **297,579** |

Global ceilings were 3,000 observations, 30 list pages, 60,150 Gmail units, and 3,600,000
milliseconds. Every metadata reservation was at most 1,000 Gmail units, equivalent to the approved
50-get batch ceiling. List pages were at most 100 observations and provider get concurrency
remained four.

## Lifecycle and accounting receipt

- Run state and terminal reason are both `completed`.
- All 65 operation reservations settled exactly once; checkpoint version equals operation count
  and completed-step count for every scope.
- All pending observations were drained before terminal state.
- No pending cursor or pending-final-page marker remains.
- No reservation, Gmail quota, or runtime quantity remains reserved.
- No retry, checkpoint retry, fixed error code, invalidated profile, or expired retention row was
  recorded.
- Scope 1 ended on its final provider page. Scopes 2 and 3 stopped exactly at 10 pages and 1,000
  observations.
- One scope-2 browser request returned Vercel `FUNCTION_INVOCATION_TIMEOUT` after the database had
  already committed checkpoint 14. The database showed the 50-observation batch settled, zero
  reserved quota/runtime, no lease, and no error. The operation was not replayed; execution resumed
  at checkpoint 14 and completed without a retry or duplicate checkpoint.
- Live pause, resume, cancel, expiry, and disconnect were not invoked because no durable anomaly
  required them. Their lifecycle behavior remains covered by the synthetic and SQL suites.

## Data and authority boundary

- Raw-content bytes, model tokens, and model cost budgets were all zero globally and per scope.
- The reachable provider surface remained only `users.messages.list` and
  `users.messages.get?format=metadata`; no body, raw MIME, attachment, thread, or mutation route was
  mounted.
- No Gmail send, draft, modify, label, archive, trash, delete, read-state mutation, watch, Pub/Sub,
  cron, queue, polling loop, model, embedding, or project mutation ran.
- Action responses were restricted to fixed states/errors, versions, booleans, numeric counters,
  and opaque run/scope identifiers. The browser output boundary scan found no restricted key.
- The production physical schema/security verifier remained 15/15 `ok`, including the restricted
  durable-column and authenticated-ciphertext checks.
- Observation and candidate retention constraints remain at most seven days. At receipt time,
  expired observation rows and expired candidate rows were both zero.

## Deployment posture

The temporary production values for `GMAIL_RELEVANCE_PHASE_A_ENABLED`,
`GMAIL_RELEVANCE_PHASE_A_USER_IDS`, and `GMAIL_RELEVANCE_MODEL_ENABLED` were removed after the run.
The follow-up production redeploy restores the code-defined default-off, empty-allowlist, model-off
posture. Confirm the redeploy is `Ready` before treating this receipt as closed.

## Verification commands retained from implementation

- focused Gmail/Phase A suite: 109/109 passing across 22 files;
- manual pilot route suite: 7/7 passing;
- focused ESLint: passing;
- `@buildos/shared-types` build: passing;
- `@buildos/web` check: 0 errors and 0 warnings;
- Svelte autofixer: no findings; and
- `git diff --check`: passing.
