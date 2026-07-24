<!-- apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-3-PILOT-COMPLETION.md -->

# Handoff — Gmail Relevance Phase A, Slice 3 Pilot Completion

**Created:** 2026-07-23  
**Purpose:** Give the next agent one complete entry point for finishing the synthetic lifecycle,
adding the gated manual invocation, preparing the live pilot, and recording the Slice 3 receipt.  
**Current safety state:** Both Phase A flags are default off. No production invocation route or
scan queue exists. No real Gmail retrieval has run.

## Mission

Finish Slice 3 without expanding its authority or data boundary:

1. prove the complete metadata driver lifecycle across three synthetic connections;
2. publish and capture immutable project profile versions safely;
3. add an exact-user-gated, manual, one-operation-at-a-time private invocation;
4. prepare a content-free pilot runbook and stop for explicit live-run approval;
5. only after that approval, run the bounded three-account pilot and record the exit receipt; and
6. write the Slice 4 review/evaluation handoff before building review UI.

The implementation and synthetic verification work is authorized by this task. A real Gmail call,
deployment flag change, allowlist change, or live pilot is a separate operational gate. Do not infer
approval for those actions from this handoff.

## Read first

Read these in order before editing:

1. `apps/web/AGENTS.md`
2. `apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-3-METADATA-RETRIEVAL.md`
3. `apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md`
4. `apps/web/docs/technical/email/GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md`
5. `apps/web/docs/technical/email/SUPABASE-MIGRATION-LEDGER-BASELINE.md`
6. `tasker/36-gmail-project-relevance-phase-a.md`

Inspect `git status --short` before changing anything. Preserve unrelated staged or unstaged work;
do not reset, restore, reformat, or stage files outside this task. If editing a Svelte file, follow
the repository's required Svelte skill/autofixer workflow.

## Current deployed state

Migration `20260723223402_gmail_relevance_metadata_retrieval.sql` is already installed in production.
Do not apply it again and do not author another migration unless a demonstrated schema defect makes
one unavoidable.

The production receipt is:

- physical schema/security verification: 15/15 checks `ok`;
- local and remote migration ledger: `20260723223402` aligned;
- generated public types: 243 tables and 14 views;
- `@buildos/shared-types` build: passing;
- focused Gmail/Phase A suites: 83/83 passing across 19 files;
- focused lint: passing;
- `@buildos/web` check: zero errors and zero warnings;
- disposable Slice 3 SQL lifecycle: `gmail_relevance_metadata_retrieval_ok`;
- prior Slice 2 SQL lifecycle on the extended schema:
  `gmail_relevance_scan_control_plane_ok`; and
- failed SQL-editor fixture attempts left zero synthetic rows in production.

Use these SQL files correctly:

- `supabase/tests/20260723223402_gmail_relevance_metadata_retrieval.production_verify.sql` is
  strictly read-only and safe for the Supabase SQL editor.
- `supabase/tests/20260723223402_gmail_relevance_metadata_retrieval.test.sql` is psql-only and
  disposable-database-only. Never run it against a linked, staging, or production database.

## Existing implementation map

| Concern                  | Existing source                                | Contract                                                                                                      |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Feature gate             | `config.ts`                                    | Global flag plus exact user-ID allowlist; wildcards fail closed.                                              |
| Immutable run manifest   | `scan-manifest.ts`                             | Exactly 30 days, 1–3 connections, up to 25 projects, at most 24-hour lifetime.                                |
| State/budget policy      | `scan-state.ts`, `scan-budget.ts`              | 1,000 messages/account, 50 gets/batch, 10 list pages, 20,050 Gmail units/account, zero content/model budgets. |
| Control plane            | `scan-control-plane.ts`                        | Owner gate plus create, claim, settle, pause/resume/cancel, and expiry RPC wrappers.                          |
| Metadata gateway         | `metadata-gateway.ts`                          | Fixed inbox+sent query, spam/trash/drafts excluded, list page 100, metadata only, concurrency 4.              |
| Restricted normalization | `metadata-normalizer.ts`                       | Subject/snippet/headers are bounded request-lifetime values only.                                             |
| Deterministic scoring    | `metadata-scorer.ts`                           | Versioned variants A/B and fixed evidence categories; no model.                                               |
| Provider-link protection | `metadata-crypto.ts`                           | AES-256-GCM envelopes plus domain-separated per-user keyed hashes.                                            |
| Direct driver            | `metadata-driver.ts`                           | Executes exactly one reserved `list_page` or `metadata_batch` operation.                                      |
| Profile preview          | `routes/admin/gmail-relevance/+page.server.ts` | Exact-user-gated and currently read-only; compiles a profile in memory only.                                  |
| Storage/RPCs             | migration `20260723223402`                     | Encrypted observations, content-free candidates, cursor drain semantics, RLS, retention, disconnect cleanup.  |

All paths above are under `apps/web/src/lib/server/gmail-relevance/` unless otherwise stated.

## Critical gaps

### 1. No complete three-connection metadata lifecycle proof

The current tests prove individual gateway, driver, scorer, crypto, control-plane, and SQL behaviors.
They do not yet prove the full metadata list → fetch → score → settle lifecycle across three
connections with overlapping profiles and lifecycle interruptions.

### 2. No profile publication service

The admin preview compiles profiles in memory, but the driver loads captured versions from:

- `email_project_profiles`; and
- `email_project_profile_versions`.

Before a run can be created, every selected project needs a current immutable profile version. Add
a server-only service that uses the existing compiler/source loaders and service-role writes to:

1. verify exact user ownership of every selected project;
2. compile all selected projects at a consistent source snapshot;
3. create or load the active `email_project_profiles` row;
4. reuse the current immutable version when compiler version and profile hash match;
5. otherwise append exactly the next profile version and let the existing triggers synchronize the
   parent row;
6. handle an out-of-sequence concurrent insert by reloading and accepting an identical winner or
   failing safely; and
7. return only project/profile/version/hash identifiers needed by the manifest.

Never update an immutable version row. Never place profile terms in logs, errors, URLs, analytics,
or client-visible action responses. If safe concurrent publication cannot be implemented using the
existing grants/triggers, stop and propose a separately reviewed transactional RPC migration; do
not improvise production DDL.

### 3. No production invocation path

`EmailRelevanceMetadataDriver.runOneOperation()` exists but has no action or endpoint. The existing
admin preview is intentionally read-only. Keep that boundary clear when adding the manual pilot
surface.

### 4. No live pilot authority yet

The schema being live is not permission to enable the feature or read Gmail. Finish implementation
and synthetic verification, prepare a preflight report, then stop for explicit approval.

## Hard boundary

Allowed Gmail calls are only:

- `users.messages.list`; and
- `users.messages.get` with `format=metadata`.

Do not add or enable:

- `format=full`, `format=raw`, MIME bodies, attachment data, or attachment IDs;
- models, embeddings, autonomous agents, tool loops, or model fallback;
- Gmail send/draft/modify/label/archive/trash/delete/read-state mutations;
- Gmail watch, Pub/Sub, cron, recurring polling, or daily-brief integration;
- automatic task/event/decision/risk/note/progress/project mutations;
- raw provider objects in logs, traces, analytics, snapshots, or errors;
- subject, snippet, participant address, raw header, raw label, query text, raw cursor, Gmail URL,
  provider ID, profile term, or matched mailbox value in durable storage outside the already
  approved encrypted/hash boundary;
- OAuth tokens, encryption keys, provider IDs, cursors, queries, or message metadata in action or
  queue payloads; or
- a broad allowlist, wildcard user, or committed real user/account identifier.

Keep `GMAIL_RELEVANCE_MODEL_ENABLED=false`. Do not register a queue for this completion task. The
direct one-operation driver must be proven first.

## Work package 1 — Preflight and contract audit

Before editing:

- confirm the Slice 3 migration remains physically present with the read-only production verifier;
- confirm ledger version `20260723223402` is still aligned without repairing any other version;
- confirm generated types contain the two Slice 3 tables and five new RPCs;
- confirm both feature flags are default off and no invocation route imports the driver;
- inspect active worktree changes and isolate the task's files;
- re-run the 83-test focused baseline; and
- identify the exact profile publication and manual invocation seams before implementation.

Do not run `supabase db push`, `supabase migration up`, the disposable SQL harness against linked
data, or a bulk migration repair.

## Work package 2 — Profile publication and immutable capture

Implement a server-only profile publication/capture service. Prefer a focused module beside the
existing compiler rather than putting compilation, database mutation, and manifest assembly into a
route file.

Required tests:

- two selected projects owned by the same user publish deterministic versions;
- the same snapshot/hash is idempotent and creates no extra version;
- changed source material appends exactly one version;
- input project order does not change the captured manifest selection;
- foreign, deleted, or inaccessible projects fail before run creation;
- a simulated concurrent version winner is reloaded safely;
- no profile term appears in returned/logged/error material; and
- no project entity is mutated—only the dedicated profile tables are written.

Manifest creation must use the returned immutable identifiers and hashes. Never accept a caller's
profile version/hash as authoritative.

## Work package 3 — Complete synthetic three-connection lifecycle

Add a high-level lifecycle test using invented fixtures and a synthetic provider. It must exercise
the real driver orchestration contract, not merely call scorer helpers directly. Use dependency
injection already present in `EmailRelevanceMetadataDriver`; do not add a real Gmail credential.

The happy path must cover:

- one user, three distinct connection scopes, and at least two overlapping project profiles;
- at least two list pages on one connection and one final page on the others;
- duplicate provider list results that do not duplicate observations;
- enough messages to require multiple metadata batches;
- A-only, A+B, B-only, negative/suppressed, ambiguous, and no-match examples;
- input ordering changes that produce identical candidates and evidence;
- list reservation before each list call and metadata reservation before every get batch;
- encrypted IDs/cursors at every durable boundary;
- pending page cursor promotion only after every discovered observation on that page is processed;
- independent counters and terminal state for all three scopes; and
- a final run state consistent with the three connection states.

The negative/lifecycle matrix must cover:

- wrong user, wrong connection, wrong project, and wrong captured profile;
- denied quota/runtime reservation causes zero provider calls;
- pause before claim and pause while an operation is in flight;
- resume from the durable checkpoint;
- cancellation, expiry, and disconnect during list/fetch/score/settle boundaries;
- provider timeout/rejection/oversize/invalid-response fixed-code settlement;
- duplicate delivery, duplicate list results, stale checkpoint, stale processing token, expired
  lease, and settlement replay as no-ops;
- retry exhaustion without cursor corruption or duplicate candidates;
- no more than 100 observations per list page, 50 gets per operation, four concurrent gets, ten
  list pages, or 1,000 observations per account; and
- no cross-account cursor, encrypted ID, observation, candidate, quota, or state contamination.

Run a forbidden-value/key scan over action payloads, database settlement payloads, serialized
jobs—even though no queue is registered—logs, errors, snapshots, and test output. Use only invented
values in repository fixtures.

If a disposable database is used, run the psql-only harness there. Never create auth/user/project
fixtures in production or through the SQL editor.

## Work package 4 — Exact-user manual invocation

Only after Work package 3 is green, add the smallest manual invocation surface. A SvelteKit server
action under an exact-user-gated admin route is preferred over a general API. A separate private
admin sub-route is acceptable if it keeps the existing read-only preview conceptually clean.

Required operations:

1. **Create/resume run**
    - derive `user_id` only from the authenticated server session;
    - validate the Phase A global flag and exact-user allowlist before any service-role work;
    - accept only selected owned connection IDs and project IDs;
    - load active read-enabled Gmail connections owned by that user;
    - publish/capture profiles server-side;
    - construct the immutable exact 30-day manifest server-side;
    - use a bounded idempotency key; and
    - call `EmailRelevanceScanControlPlane.createRun()`.

2. **Run one bounded operation**
    - derive `user_id` from the session;
    - accept only opaque `run_id` and `connection_scope_id` identifiers;
    - never accept provider IDs, page tokens, query text, metadata, or a caller-supplied user ID;
    - call `EmailRelevanceMetadataDriver.runOneOperation()` exactly once;
    - return only status, operation code, checkpoint version, scope state, safe error code, provider
      call count, observation count, and candidate count; and
    - do not loop automatically in one request.

3. **Control run**
    - expose only existing pause, resume, cancel, and expire semantics;
    - enforce owner/session binding and the same gate; and
    - show fixed state/error codes only.

Action responses, redirects, form fields, and URLs must contain no Gmail-derived values. Use CSRF-
safe SvelteKit form actions and existing session conventions. Return 404 for users outside the
exact allowlist, consistent with the current preview.

Required action tests:

- unauthenticated user redirects or fails before any service call;
- flag off and non-allowlisted users produce no database/provider call;
- foreign connection/project/run/scope IDs fail closed;
- malformed and extra fields are rejected;
- duplicate create submissions resolve through idempotency;
- one operation submission makes at most one bounded driver call;
- action output contains no restricted keys/values; and
- pause/cancel prevents the next provider call.

Do not add a "run until complete" browser loop, worker, queue registration, cron, or recurring
client poll as part of this task. Manual repeated one-operation submissions are sufficient for the
pilot.

## Work package 5 — Pre-pilot review package and stop gate

Before any real Gmail call, produce a concise review package containing only content-free facts:

- exact commit/diff scope and verification results;
- confirmation that no new migration is required, or a stop notice if one is;
- the exact authenticated action and input allowlists;
- static proof that only Gmail list and metadata-get routes are reachable;
- confirmation that the three intended connections are active, owned by the exact user, read
  enabled, and carry stored read-only scopes—do not print their addresses or provider IDs;
- selected project count and captured profile/version count—do not print profile terms;
- chosen immutable window start/end and expiry;
- per-account/global quota and runtime ceilings;
- confirmation that `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1` is available without printing it;
- confirmation that the model flag remains off and no queue/watch/cron/mutation path exists;
- pause/cancel/abort instructions; and
- the content-free SQL queries that will verify counters, terminal states, retention, and leaks.

Then stop and request explicit authorization for the live pilot and any temporary deployment flag
or allowlist change. Do not make the first provider call in the same turn that merely prepares this
package unless the user explicitly authorizes it.

## Work package 6 — Live bounded pilot, only after explicit approval

The intended pilot is one user and three existing read-only Gmail connections. Do not write real
account addresses, provider IDs, or project terms into the repository, task, logs, or receipt.

Operational sequence:

1. Confirm the deployment points at the verified code and migration/type versions.
2. Temporarily enable Phase A only for the exact approved user; keep model disabled.
3. Create/resume one immutable manual run with three connections and the approved projects.
4. Execute one operation at a time per scope:
    - list one page;
    - drain its pending observations in batches of at most 50;
    - allow the database to promote the encrypted cursor only when the page is drained; and
    - continue until final page, 1,000 messages, ten list pages, cancellation, expiry, disconnect,
      failure, or denied reservation.
5. After every operation, inspect only fixed states and numeric counters. Never inspect/log raw
   provider responses or restricted values.
6. Stop immediately on ownership mismatch, policy/accounting inconsistency, unexpected route,
   restricted-value exposure, Gmail mutation capability, cursor/checkpoint divergence, or any
   model invocation.
7. Pause first if investigation is needed; cancel if the boundary cannot be re-established.
8. Return the global Phase A flag/allowlist to the approved default-off deployment posture when the
   bounded run is finished or stopped.

Expected hard ceilings per account:

- 30-day immutable window;
- 1,000 observations;
- 10 list pages at 100 messages/page;
- 50 metadata gets/operation;
- four concurrent metadata gets;
- 20,050 Gmail quota units;
- 1,200,000 milliseconds accounted runtime;
- zero raw-content bytes;
- zero model tokens; and
- zero model cost.

The observation/candidate retention window is at most seven days. Record the functional receipt
promptly and schedule Slice 4 work accordingly. Do not add a cron purge; the existing purge RPC is
manual/service-only.

## Work package 7 — Exit receipt and Slice 4 handoff

The Slice 3 receipt must record, without mailbox content:

- run and policy/scorer/normalizer version identifiers;
- counts of selected connections/projects/profile versions;
- per-scope list pages, discovered/processed observations, candidates by A/B, provider calls,
  quota, runtime, retries, and terminal state;
- duplicate/replay/no-op counts;
- pause/resume/cancel/disconnect behavior actually exercised;
- confirmation of exactly-once checkpoints and drained pending pages;
- confirmation that no restricted values appeared in durable columns, logs, errors, traces,
  analytics, action payloads, or snapshots;
- confirmation of zero Gmail mutation, body/attachment, model, queue-secret, watch, Pub/Sub, cron,
  and project-mutation paths;
- production verifier, focused tests, lint, shared-types build, and web-check results; and
- final deployment flag/allowlist posture.

After Slice 3 is complete, write a separate Slice 4 handoff covering candidate review,
adjudication, sampling, and metrics. Do not build the review UI or collect adjudications in this
task. Do not start optional C/D model work without a separate ZDR/provider decision.

## Verification commands

Use commands appropriate to the files actually changed. At minimum:

```bash
pnpm --filter @buildos/web exec vitest run \
  src/lib/server/gmail-relevance \
  src/lib/server/gmail-read-gateway.test.ts \
  src/lib/server/gmail-read-cursor.test.ts \
  src/lib/server/gmail-token-crypto.test.ts

pnpm --filter @buildos/web exec eslint \
  src/lib/server/gmail-relevance \
  src/routes/admin/gmail-relevance

pnpm --filter @buildos/shared-types build
pnpm --filter @buildos/web check
git diff --check
```

Run Svelte-specific validation/autofixing when a `.svelte` file is changed. Do not run the
fixture-heavy SQL test against production. The read-only production verification file is the only
Slice 3 test SQL intended for the Supabase SQL editor.

## Deliverables

- server-only immutable profile publication/capture service and tests;
- full synthetic three-connection metadata lifecycle test and negative matrix;
- exact-user manual create/resume, one-operation, and control actions plus tests;
- content/key leak and forbidden-route static tests extended across the invocation path;
- pre-pilot review package, followed by an explicit stop for authorization;
- if authorized, content-free pilot receipt; and
- separate Slice 4 handoff after Slice 3 exit criteria are met.

## Definition of done

This continuation is complete only when:

- all selected projects are represented by captured immutable profile versions;
- the synthetic three-connection lifecycle and negative matrix pass;
- one manual invocation can perform exactly one reserved list or metadata operation;
- all ownership, feature-gate, quota, checkpoint, encryption, retention, and leak boundaries hold;
- an explicitly authorized three-account pilot reaches correct terminal states within ceilings;
- no restricted mailbox value crosses the request-lifetime boundary;
- no model, Gmail mutation, body/attachment, queue secret, watch, Pub/Sub, cron, or autonomous
  project mutation is reachable;
- the production flags return to their approved default-off posture; and
- the Slice 3 exit receipt and Slice 4 handoff are written.
