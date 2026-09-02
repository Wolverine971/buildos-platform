<!-- tasker/75-agentic-chat-prepared-admission-lease.md -->

# 75 — Agentic Chat prepared-admission lease

**Created:** 2026-08-30

**Status:** Active — prepared-admission, audit hardening, trigger-composition repair, and
consent-gated immediate-fetch Send-latency telemetry are deployed; live global-worker,
project-selection, and analytics-ingestion canaries are green; the public-schema RPC parser repair
is deployed with a green manual production-drift and full CI receipt; only the 100–500-turn real-user
measurement cohort remains before the consolidation decision

**Priority:** P1 latency and database-load reduction; security correctness is a release gate

## Kernel

Agentic Chat already precomputes project/global context, session history, prompt surfaces, tool
definitions, and a short-lived opaque prepared-prompt key. A worker Send that has a valid prepared
prompt still repeats the same admission evidence across several sequential database requests before
the atomic turn-creation RPC. The common prepared-hit path therefore avoids expensive prompt
construction but does not yet realize the intended click-to-admission latency reduction.

Upgrade the existing `pp_v1.<uuid>.<nonce>` key into a **prepared-admission lease** for worker turns.
The browser must continue sending only the opaque key and the current user command. The application
must still authenticate the HTTP request. One service-only database inspection should then validate
the prepared row, its scope, access, context generation, history currency, session ownership, and
checkpoint eligibility and return the server-owned prepared content. The existing atomic worker
admission RPC remains the final durable write and race guard.

This is not a browser authentication token and is not a bearer capability for project data. It is a
short-lived, single-use proof that the expensive bounded preparation was completed for one user,
session, and context. Authentication and runtime tool/write authorization remain mandatory.

## Product outcome

For a valid prepared project/global turn with an existing session, no attachments, and no pending
supervisor checkpoint:

```text
Modal open / selected context
  -> authenticate and authorize
  -> resolve materialized project/global context generation
  -> compose session history
  -> build legacy + worker prompt surfaces
  -> persist short-lived prepared row
  -> return opaque pp_v1 key

Send
  -> authenticate HTTP request
  -> verify signed worker transport lease locally
  -> one service-only prepared-admission inspection RPC
       - nonce, owner, session, scope, access
       - expiry and one-use state
       - context invalidation generation
       - history currency
       - checkpoint fast-path eligibility
       - return prepared row + owned session
  -> append current message/domain/tool overlays in memory
  -> one atomic admission write RPC
       - re-lock prepared row
       - recheck race-sensitive scope/history/consumption
       - consume key, freeze artifact, create message/turn/job
  -> worker starts provider request
```

The read-side checks become one round trip. The second database request is the required durable
admission transaction, not another context-loading pass.

## Baseline and expected gain

The audited existing-session prepared-hit worker path can perform roughly ten database round trips
after HTTP authentication: project actor/access resolution, session lookup, checkpoint recovery and
lookup, prepared lineage lookup, prepared content lookup, context-generation validation, history
currency validation, and atomic admission. Most are sequential.

Historical production batteries (before the new materialized-context work) show approximately:

| Stage                                           | Median |
| ----------------------------------------------- | -----: |
| Send to durable admission                       |  2.05s |
| Response headers                                |  2.19s |
| Queue wait                                      |  0.62s |
| Provider-authorized to first persisted response |  9.39s |
| Client first token                              | 12.92s |

These are directional inputs, not an A/B result for this implementation. The modeled target is
0.8–1.8 seconds saved on a prepared hit, with larger gains under cross-region database latency and
smaller gains when the app and database are tightly colocated.

## Scope

### Fast path

- Existing, owned session.
- `global`, `project`, or `ontology` context.
- Matching unexpired prepared-prompt key.
- No message attachments in v1.
- No active or stale-resuming supervisor checkpoint requiring recovery.
- Prepared context invalidation token still matches the current project/global generation.
- No newer persisted session message than the prepared history snapshot.
- Current prompt/tool harness still matches after the database receipt is parsed.

### Safe fallback

Any miss, malformed response, unsupported context, attachment, checkpoint, stale generation,
history drift, prompt/tool harness drift, or database inspection error uses the existing worker
preparation flow. A miss must never become an authorization bypass or a failed chat solely because
the optimization is unavailable.

### Non-goals

- Do not skip `safeGetSession()` on Send.
- Do not return prompt text, context payloads, nonce hashes, or authorization claims to the browser.
- Do not trust a deterministic user/project/time hash.
- Do not call OpenRouter during prewarm.
- Do not put the OpenRouter call inside a database transaction.
- Do not weaken runtime tool execution, write authorization, RLS, confirmation, or reviewer gates.
- Do not force attachment or supervisor-resume turns through the v1 fast path.
- Do not remove the legacy SSE prepared-prompt consumer.

## Security and consistency contract

The service-only prepared-admission inspection must fail closed unless all conditions hold:

1. The caller is `service_role`; execution is revoked from `PUBLIC`, `anon`, and `authenticated`.
2. The prepared id and SHA-256 nonce digest match the stored row.
3. `user_id`, `session_id`, `context_type`, `entity_id`, and `project_id` match the authenticated
   command and an owned session.
4. The row is unconsumed and unexpired.
5. Project/ontology access is current through the authoritative actor membership function.
6. Global context belongs to the authenticated user's actor scope.
7. The stored context invalidation token equals the current materialized generation token.
8. No session message exists after the prepared row's history cutoff (`created_at` in v1).
9. No checkpoint state requires the existing recovery/resume flow.
10. Only server code receives the prepared row and session payload.

The final `create_agentic_chat_turn_with_job` transaction keeps its advisory lock, duplicate and
active-turn resolution, prepared-row lock, expiry/consumption checks, prepared-content copy checks,
history-currency trigger, immutable input artifact, and atomic message/turn/queue creation. Context
or membership invalidation that commits between inspection and admission deletes the unconsumed
prepared row, causing the final transaction to reject rather than admit stale context.

## Database design

Add one service-only function:

```sql
inspect_agentic_chat_prepared_admission(
  p_user_id uuid,
  p_prepared_prompt_id uuid,
  p_nonce_sha256 text,
  p_session_id uuid,
  p_context_type text,
  p_entity_id uuid,
  p_project_id uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
```

Expected receipts:

- `hit`: returns the owned session and prepared row to server code.
- `fallback`: returns a bounded internal reason such as `not_found`, `nonce_mismatch`, `expired`,
  `consumed`, `scope_mismatch`, `access_revoked`, `stale_context`, `stale_history`, or
  `checkpoint_required`.

The function is an inspection, not an early claim. Consumption stays inside final atomic admission
so an application exception after inspection does not burn the user's key and so duplicate retries
continue resolving at the authoritative admission boundary.

## Application design

Add a server-only adapter that:

- parses the existing opaque key;
- hashes the nonce server-side;
- calls the inspection RPC exactly once;
- validates the receipt shape, session identity, and prepared-row shape;
- returns a typed hit or fallback without exposing raw database errors.

Worker preparation attempts that adapter before the current access/session/checkpoint/prepared
lookup chain when the command is fast-path eligible. On a hit it reuses the returned session and
prepared row, performs local message-dependent tool/prompt harness validation, and skips:

- the project access RPC chain;
- the session lookup;
- checkpoint recovery and checkpoint lookup when the receipt proves none are relevant;
- prepared lineage lookup;
- prepared row lookup;
- context invalidation-token RPC;
- latest-history query.

The final admission RPC remains unchanged in the first slice. This makes rollout reversible and
keeps durable admission invariants concentrated in the already-tested transaction.

## Work packages

- [x] **WP-0 — Tasker and architecture:** record the target flow, threat model, fallbacks, and
      performance gates.
- [x] **WP-1 — Database inspection RPC:** add the service-only function, explicit grants, indexes
      review, and disposable-Postgres contract tests.
- [x] **WP-2 — Server adapter:** parse/hash the key, call the RPC once, validate its receipt, and add
      hit/miss unit coverage.
- [x] **WP-3 — Worker fast path:** reuse receipt session/prepared content and bypass repeated reads;
      preserve the existing path for misses and unsupported commands.
- [x] **WP-4 — Observability:** record fast-path requested/hit/miss reason plus inspection and total
      preparation timings without logging prompt content or nonce material.
- [x] **WP-5 — Local verification:** focused unit tests, disposable PostgreSQL proof, typecheck, and
      relevant worker admission regression suites.
- [ ] **WP-6 — Deploy and A/B receipt:** migration/application deploy and bounded canary are done;
      compare at least 100–500 prepared-hit turns and retain the cohort receipt.
- [ ] **WP-7 — Decide next consolidation:** only after measurements, decide whether merging the
      read receipt and durable admission into one larger RPC is worth the extra SQL/application coupling.

## Local implementation receipt — 2026-08-30

- Created the additive migration with the Supabase CLI:
  `20260830184117_agentic_chat_prepared_admission_lease.sql`.
- Added `inspect_agentic_chat_prepared_admission`, restricted execution to `service_role`, and added
  `(session_id, user_id, created_at desc)` history-currency indexing.
- Added a server-only adapter that parses the existing `pp_v1` key, sends only the nonce SHA-256 to
  PostgreSQL, accepts one bounded receipt, and falls back on returned errors or thrown connection
  errors.
- Wired the common worker path to reuse the receipt's owned session and prepared row. The focused
  contract proves it skips the old project-access, checkpoint, prepared-lineage, prepared-content,
  context-loader, and history read path on a hit.
- Kept message-dependent prompt/tool harness inspection in application memory and preserved the
  existing `create_agentic_chat_turn_with_job` prepared-row lock, content-copy comparison,
  history-currency trigger, one-time claim, and durable admission transaction.
- Added durable `preparedAdmissionLease` requested/hit/miss/inspection metadata to the worker
  request payload and `Server-Timing` stages for prepared inspection, total worker preparation, and
  durable admission.
- No frontend contract change was needed: the browser already sends the opaque prepared-prompt key.
- Rollback: `AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED=false` restores the existing path without
  reverting the additive migration.

Local gates passed:

- 39 focused web unit/route tests across prepared lease, worker preparation/admission, and the turn
  route.
- Prepared-admission disposable PostgreSQL contract, including migration idempotence, valid
  project/global hits, nonce/scope/consumed/expired/context/history/checkpoint/access failures,
  index presence, and role privileges.
- Existing materialized-context and legacy atomic-admission disposable PostgreSQL regressions.
- `pnpm --filter @buildos/web check`: 0 errors and 0 warnings.

## Production deployment and canary receipt — 2026-08-30

Deployment:

- Applied the exact reviewed materialized-context prerequisite and prepared-admission migrations to
  the linked production database, then confirmed a clean hosted migration dry run. Source SHA-256:
  `5b417ebe80e37c91928ec74ac695ac7e2d01d6bc689d0b3527ad6ff9800a8d46` and
  `c0ec658fb045162461d19a3a83fb9458e416e206be72678068c854acac5f48d7`.
- Verified the production function is `SECURITY INVOKER`, has a fixed
  `search_path=pg_catalog, public`, denies `anon`/`authenticated`, and grants only `service_role`.
  The history index is valid/ready, the materialized snapshot table/token column exist, and all 13
  expected context-invalidation triggers are enabled.
- Vercel production is Ready at `build-os.com`: deployment
  `dpl_FBmztyK1ecimPYRs2Zpsf1cC8m5n`, application SHA
  `319a3627ed8f7b4d8dd09b18909c84166dea66c5`.
- Railway first deployed the same application SHA successfully; its current Agentic Chat deployment
  `37aea6a9-13d5-4c38-8e21-64f4324b6804` is the one-commit descendant
  `9bf48617119616468f292abf844d14734901aa9b`, with all four replicas running. The final canary ran
  against this current worker.
- GitHub CI run `33331172725` completed successfully for the feature/application SHA. The newer
  descendant worker run `33332532403` was still in its long coverage/SQL-contract phase with setup
  green when this receipt was written.

Verification:

- Re-ran 33 focused unit/route tests, all green; re-ran the materialized-context,
  prepared-admission, and atomic-admission disposable PostgreSQL contracts serially, all green;
  `svelte-check` reports 0 errors and 0 warnings.
- Upgraded the live modal canary to resume an existing session with real history, observe the
  session-bound prewarm response, require the same opaque `pp_v1` key on `/api/agent/v2/turns`,
  require `Server-Timing` `prepared-admission;desc="hit"`, verify the durable turn receipt records
  `requested=true`, `hit=true`, and render the exact model reply.
- Final green production sample: prepared inspection **195ms**, total worker preparation **220ms**,
  atomic admission **285ms** (approximately **505ms** combined server admission stages). Two prior
  production runs also reached verified durable hits at approximately **371ms** and **324ms**
  combined; they failed only stale canary assertions/cleanup and led to the harness fixes.
- Post-canary production aggregation confirms **3/3 prepared hits**, **3/3 completed turns**, and
  **0 failed/cancelled turns**; durable inspection ranged from **167–195ms**.
- A separate zero-provider-cost production canary selected a disposable project in the real modal,
  observed `context_type=project` plus the exact selected project/focus, and received a fresh
  project-scoped `pp_v1` prepared prompt with the canonical versioned cache key. The disposable
  project was removed afterward.
- Canary sessions are archived rather than deleted because worker control/input artifacts have an
  intentional retention floor. Three earlier retained canary sessions were archived after the run;
  durable safety evidence remains intact.
- Production database advisors reported no new blocking issue for this lane. The service-only
  snapshot tables intentionally have RLS enabled without browser policies; newly deployed indexes
  are expected to begin with zero usage.

Rollback remains `AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED=false`. The only incomplete WP-6
gate is the statistically useful 100–500-turn prepared-hit control/treatment comparison; a bounded
canary is not represented as that A/B result.

## Audit hardening receipt — 2026-08-30 (deployed 2026-08-31)

A full audit of the initial lane confirmed the architecture and surfaced four defects; all four
were fixed in `20260830213000_agentic_chat_prepared_admission_hardening.sql` plus application
changes and are now deployed:

1. **Inspection→admission race no longer fails the send.** A context invalidation, key
   consumption, or newer message landing between the inspection RPC and durable admission used to
   surface as a 503 `WORKER_ADMISSION_UNAVAILABLE` with no retry. The turns route now detects the
   prepared-guard exception (`isPreparedAdmissionRaceError`), re-prepares once with the prepared
   key removed, and admits on the slow path. The durable payload and `Server-Timing` record
   `admission_race_retry` so races are countable.
2. **Request-hash lineage parity.** The lease branch now applies the same cache-key and surface
   acceptance conditions as the legacy lineage inspection before hashing prepared lineage, so a
   retry of one clientTurnId hashes identically on either path.
3. **Explicit history cutoff.** Prepared rows record `history_cutoff_at` (captured before the
   prewarm history load); both history-currency guards compare against
   `coalesce(history_cutoff_at, created_at)`, closing the assembly-window hole where a message
   older than the row's created_at escaped both guards. Residual sub-clock-skew commit-visibility
   races remain and still fail closed only at the serialized admission boundary.
4. **Statement-level invalidation triggers.** The 12 per-row triggers are replaced by
   per-statement triggers with transition tables (three shape functions: projects, members,
   project-scoped). Bulk writes invalidate each distinct project exactly once per statement,
   removing the O(rows × members) amplification and shrinking the shared version-row lock window
   that could deadlock concurrent multi-row writers.

Also: the admission adapter preserves the Postgres exception detail server-side (required for the
"no error-counter regression" gate), and the browser PrewarmController pauses TTL re-warm loops in
hidden tabs, resuming on `visibilitychange`.

Local gates: 90 focused unit/route tests green (incl. new race-retry, lineage-parity,
cutoff-insert, and visibility tests); both disposable-Postgres contracts green with the hardening
migration applied twice (idempotence), a new assembly-window `stale_history` case, direct
execution of the redefined artifact-insert trigger, and a bulk-statement exactly-once generation
proof that fails under the old per-row triggers; full agentic-chat-v2 + v2-routes suite 971/971;
`svelte-check` 0 errors; `gen:schema` regenerated; `database.types.ts` updated to match the new
column pending the next live `gen:types`.

Production applied `20260830213000_agentic_chat_prepared_admission_hardening` before the application
became ready. The release is `19cf49a8cbba8c222715669a55763c0ee46f2012` on Vercel deployment
`dpl_6zT39kyWWJcBSfgfaFjKKNougBYT` and Railway deployment
`5ebde414-cfb6-4284-979b-9749512698d7`.

## Post-deploy composition repair and canary — 2026-08-31

The first live provider canary proved the new prepared admission path itself was fast — 165 ms
inspection, 232 ms worker preparation, and 144 ms durable admission — but the worker correctly
failed the turn before provider execution with `invalid_timing_source`. The hardening migration had
replaced the newer history-state/attachment-aware artifact trigger body with a shorter
freshness-only definition. As a result, the immutable artifact contained a three-message
`raw_history` snapshot while the parent turn's history strategy/count fields remained null.

`20260831003232_fix_agentic_chat_history_state_trigger_composition` restores the composed trigger:
explicit `history_cutoff_at` currency, prepared-history copy validation, frozen-attachment
validation, and the atomic copy of history strategy/count evidence onto the turn. The production
function is `SECURITY INVOKER`, has a fixed `pg_catalog, public` search path, and is executable only
by `service_role`.

Impact query for the deployment-to-repair window found exactly one prepared-hit failure: the modal
canary that exposed the defect. No non-canary prepared hit ran in that window. One separate
non-prepared worker turn failed permanently and is not attributable to this prepared-path trigger.

Post-repair receipts:

- Global worker Send: prepared hit; **171 ms** inspection, **246 ms** worker preparation,
  **144 ms** durable admission; exact provider response completed; Playwright **1/1 in 13.5s**.
- Persisted turn: `completed`, prepared hit, no failure code, assistant message present, and
  `raw_history` evidence copied as `3 → 3` with `compressed=false`.
- Project selection: project-scoped `pp_v1` prompt materialized from `fresh_load`; Playwright
  **1/1 in 6.5s**.
- Focused application checks: **88/88** unit/route tests before the canary; follow-up test typing
  repairs remain **68/68** and the repository's bounded web test-type gate reports **352/354**
  known errors (two below its baseline, exit 0).
- Supabase advisors reported no blocking `ERROR` for this lane. The prepared/context/artifact tables
  remain intentionally service-only with RLS and no browser policies; the authenticated invalidation
  token RPC is an intentional, actor-scoped `SECURITY DEFINER` read.

## Measurement follow-up — 2026-08-31 (deployed; cohort pending)

The existing passive database population is not a valid A/B receipt. Excluding the exact modal
canary prompt, production has 8 prepared-lease hits (4 completed, 4 failed historical canary/debug
turns), 1 lease miss, and 82 non-prepared worker turns over the last seven days. There are no legacy
worker prepared-hit controls, so comparing the 8 lease hits to the 82 non-prepared turns would
confound the optimization with context/prewarm availability.

The durable worker timing contract begins at admission (`request_started_at = admitted_at`), while
the primary Send-to-admitted measurement currently exists only in the `/api/agent/v2/turns`
`Server-Timing` response. To collect a real-traffic cohort without another Send-path database query,
the worker transport client now emits a consent-gated, fire-and-forget PostHog event after receiving
the admission response:

- event: `agentic_chat_admission_completed`;
- timings: browser admission round trip, prepared inspection, worker preparation, atomic admission,
  and preparation + admission server total;
- cohort fields: prepared requested/hit/outcome, response status, context type, and attachment
  presence;
- privacy boundary: no user/session/project/turn IDs, opaque keys, prompt text, or response content.

The analytics call is not awaited and reuses values already returned in the response header. Local
receipt: worker transport **7/7**, focused follow-up **68/68**, the disposable-Postgres composition
contract **1/1**, `svelte-check` **0 errors / 0 warnings**, Prettier clean, and bounded web test-type
gate **352/354** (exit 0).

Deployment receipt for commit `49528ed799a58b625f67084dda0b31d4fa549229`:

- Vercel production deployment `dpl_BVYjfkRGV4aTSaRwCRW1UkkNbiPh` is Ready and serves
  `build-os.com`.
- Railway agentic-chat-worker deployment `74554027-5982-4b61-9c02-a08746987ce0` is healthy on the
  four-replica production service; no `agentic_chat_typed_execution_failure` log matched during the
  post-release inspection window.
- Production migration history contains both `20260830213000_agentic_chat_prepared_admission_hardening`
  and `20260831003232_fix_agentic_chat_history_state_trigger_composition` on PostgreSQL 15.8.
- GitHub Actions run `33404870649` is green: the main verification/coverage/database job passed in
  29m29s and the independent PostgreSQL 15 Libri migration-safety job passed in 1m1s.
- The no-LLM production project-selection canary passed **1/1 in 9.8s** and materialized a
  project-scoped prepared prompt from `fresh_load`.
- Supabase advisors still report no blocking `ERROR` for this lane. The service-only RLS notices,
  intentional actor-scoped invalidation RPC warning, and prepared-prompt session foreign-key index
  notice remain documented follow-up rather than release regressions.
- After explicit approval, the analytics-enabled paid synthetic Send passed **1/1 in 15.5s** with
  the exact provider response. It was a prepared hit: **184 ms** prepared inspection, **250 ms**
  worker preparation, and **389 ms** atomic admission; no typed worker failure appeared afterward.
  The modal E2E harness uses `AGENTIC_E2E_CAPTURE_ANALYTICS=true` for this exact canary while
  retaining necessary-only consent by default. A follow-up no-LLM prewarm canary passed **1/1 in
  9.6s** and asserted that the synthetic browser actually stored `analytics: true`.
- The authenticated browser exposes the actual BuildOS PostHog project (project 494127). A
  privacy-safe fingerprint comparison confirmed that its project token exactly matches the
  workspace's configured `PUBLIC_POSTHOG_KEY`; no token value was recorded. An exact Activity query
  for `agentic_chat_admission_completed`, with internal/test-user filtering disabled, returned zero
  matching events for both the last 24 hours and all time. The event therefore was not ingested into
  the BuildOS project; the earlier project-mismatch explanation is no longer sufficient. The PostHog
  connector itself remains bound to the unrelated `9takes` project (35460), so this verification used
  the signed-in browser project directly.
- The initial follow-up diagnostic was implemented locally. The admission event
  bypasses PostHog's batch queue with `send_instantly: true` and `transport: 'sendBeacon'`; the chat
  path still does not await analytics. An allowlisted browser receipt distinguishes not configured,
  consent disabled, initialization unavailable, SDK rejection, capture exception, and SDK acceptance.
  Its complete payload is only event name, status, delivery mode, and bounded reason—never timing
  properties, identifiers, prompt text, or response content. The analytics-enabled live modal test
  now requires an `accepted`/`immediate_beacon` receipt before it can pass. Because PostHog's public
  browser capture API does not expose end-to-end ingestion acknowledgement, `accepted` means that the
  SDK accepted the event and immediate beacon submission was requested; the exact PostHog Activity
  query remains the delivery receipt.
- Local validation for this follow-up is green: PostHog and adjacent consent/transport telemetry
  tests **17/17**, `svelte-check` **0 errors / 0 warnings**, targeted ESLint clean, the modal Playwright
  suite lists all **6** tests successfully, and the bounded web test-type gate remains **352/354**
  known errors (two below baseline, exit 0). The deployment and canary results below supersede the
  proposed paid retry.

## Immediate-delivery and CI follow-up — 2026-08-31 (deployed and verified)

The subsequent production rollout was healthy on both serving surfaces:

- Vercel production was Ready for `build-os.com`.
- Railway agentic-chat-worker deployment `fc752482-22d4-4d2d-9887-65ecf55dd3c4` was successful on
  all four replicas at commit `9087c287c1326dd53fc4c93fbb25f76931825cd8`.
- Three preliminary browser attempts stopped before Send while the harness exposed a native-dialog
  ordering problem in analytics consent. They made no provider request. Consent is now completed on
  `/dashboard` before the native chat dialog opens.
- One explicitly authorized paid Send reached and completed worker admission, then the test stopped
  on a local PostHog receipt of `dropped/sdk_rejected`. PostHog intentionally filtered the
  Playwright browser because `navigator.webdriver` and Client Hints identified automation. No second
  paid retry was made.

The canary now removes those automation markers only inside the explicitly analytics-enabled test.
Production bot filtering is unchanged. More importantly, a new `@analytics` test proves the entire
browser Send-to-capture path without calling a model: it intercepts worker admission with a valid
synthetic worker receipt, intercepts the legacy stream as a safety net, requires the real application
PostHog capture receipt, and passed **1/1 in 10.9s**. No provider request can escape that test.

The SDK accepted that event, but an exact all-time Activity query in BuildOS PostHog project 494127
still returned zero events after the delivery window. SDK acceptance is not an ingestion
acknowledgement. Because admission capture happens while the page remains open, the next revision
uses immediate `fetch` (`send_instantly: true`, `transport: 'fetch'`) rather than `sendBeacon`.
PostHog's fetch path is still fire-and-forget from chat and uses keepalive for small payloads, while
providing better request/error behavior than a beacon. The browser receipt contract is now
`accepted/immediate_fetch`. The privacy allowlist is unchanged: no prompt, response content, opaque
key, or user/session/project/turn identifier is included.

The deployment's GitHub run `33430682056` executed **4,108 passing tests** but failed because Vitest
reported no suite in the semantic golden file. Commit
`4aa458a13a2e67f556291e728c857b1d149e3775` corrected that test discovery issue, and the golden suite
passes **3/3** locally. Its GitHub run `33434017647` did not reach a live comparison because both
Supabase workflow secrets were empty. A separate local live check then exposed the parser defect:
the checker read the first generated `Functions` block, now the intentionally empty `libri` schema,
instead of `public.Functions`. The checker now anchors to the `public` schema; its regression test
passes **1/1** and runs inside the schema-drift job before the live comparison; the repaired local
check reports **316 aligned RPC names**. The deployment receipt below supersedes this pre-deploy
diagnosis.

Pre-deploy local release checks are green:

- PostHog, consent, telemetry, and worker transport: **17/17**;
- semantic golden suite: **3/3**;
- RPC parser regression: **1/1** and live drift check: **316 aligned**;
- `svelte-check`: **0 errors / 0 warnings**;
- targeted ESLint and Prettier: clean.

### Continuation receipt — 2026-09-01

The immediate-fetch application revision is deployed. Current production serves main commit
`78b65a54a456ffe23b73913ec797ffdeee962cfe`: Vercel deployment
`dpl_Etg4c6WB4azdoRHen8vjmTXBAzMM` is Ready for `build-os.com`, and Railway deployment
`c8b61467-6bbf-4f73-8ade-40c4d1b0e037` is successful with all four Agentic Chat replicas running.

The earlier immediate-fetch commit `f83dda1ded7241f36b48a75a5d12f85658e19e42` has a green main CI
run (`33447540772`), but that push correctly skipped the manual/scheduled Supabase drift job and is
not the parser receipt. Scheduled run `33525981152` later failed at `Test generated RPC parser`
because `.github/workflows/ci.yml` referenced
`scripts/security/check-supabase-rpc-drift.test.mjs` while that test remained untracked. The local
repair now anchors extraction to `public.Functions`, includes the missing regression test, passes
the Node test, is Prettier-clean, and reports **316 aligned RPC names** against production. Release
commit `67e758421d05110ea1349bf191d2e089f2e07675` integrates both script changes.

The deployed zero-model `@analytics` production canary passed **1/1 in 15.3s**. It intercepted both
worker admission and the legacy stream safety net, made no provider request, and received the
application receipt `accepted/immediate_fetch`. BuildOS PostHog project **494127** then displayed the
new `agentic_chat_admission_completed` event in Activity, closing the prior SDK-acceptance versus
ingestion gap.

The event contains the exact 12 custom measurement/cohort properties:
`client_admission_round_trip_ms`, `prepared_inspection_ms`, `worker_preparation_ms`,
`worker_admission_ms`, `worker_server_total_ms`, `prepared_admission_outcome`,
`prepared_admission_hit`, `prepared_prompt_requested`, `response_status`, `response_ok`,
`context_type`, and `has_attachments`. No explicit prompt, response content, opaque key, or
application user/session/project/turn identifier is present in that custom payload. PostHog still
adds its normal consented SDK, person, browser, and current-page properties to the raw event envelope;
the privacy allowlist describes the application-owned custom properties rather than the complete
PostHog envelope.

### Parser deployment and CI closure — 2026-09-01

Release commit `67e758421d05110ea1349bf191d2e089f2e07675` is on `main`. The first manual
verification run (`33581402657`) confirmed the parser regression itself passed but also proved the
workflow had never received `PUBLIC_SUPABASE_URL` or `PRIVATE_SUPABASE_SERVICE_KEY`; this was the
actual failure in run `33434017647`, not the parser. Both existing production values are now stored
as masked GitHub Actions repository secrets, with no values logged.

Authoritative manual CI run `33581615967` is green:

- Supabase RPC schema drift: parser regression plus live production comparison, **10s**;
- full typecheck, lint, tests, coverage, database integration, and self-contained Supabase SQL
  contracts: **29m13s**;
- independent Libri PostgreSQL 15 migration-safety gate: **1m13s**.

Vercel production deployment `dpl_3G4AFcW1zX9aGDfcpRtHhVY5Vm51` is Ready and owns the
`build-os.com` aliases. The release touched only repository scripts and this tasker, so Railway did
not rebuild the Agentic Chat service; its current deployment
`c8b61467-6bbf-4f73-8ade-40c4d1b0e037` remains successful with all four replicas Running. Focused
local verification immediately before release was parser **1/1**, telemetry/semantic **17/17**,
Prettier and syntax clean, `svelte-check` **0 errors / 0 warnings**, and a live **316-RPC** alignment
check.

WP-6 now remains open only for the 100–500-turn real-user cohort. A paid synthetic model request is
not needed.

Once the event reaches 100–500 comparable real-user turns, build the control/treatment insight and
retain p50/p95 plus hit, miss, HTTP-error, and admission-race counts here. Do not manufacture that
cohort from paid synthetic provider turns.

## Observability and success gates

Record these server-side timestamps/fields:

- request received;
- prepared-admission inspection started/finished;
- fast-path requested/hit/miss reason;
- worker preparation finished;
- durable admission RPC started/finished;
- provider authority established;
- first response persisted and first client event.

Release targets:

- prepared fast-path request to durable admission: **<500ms p50, <750ms p95** where deployment
  topology permits;
- at least **500ms p50** or **1s p95** saved versus prepared-hit control;
- no increase in access-denied, stale-history, stale-context, duplicate, or idempotency-conflict
  errors;
- prepared-hit rate high enough to improve aggregate Send latency (initial review threshold 60%);
- zero prompt/context/nonce leakage in client responses or logs.

Primary A/B metrics are Send-to-admitted and Send-to-provider-authorized. First-token time is a
secondary metric because model/provider generation dominates many turns.

## Test plan

Database contract:

- valid global and project receipts;
- wrong user, nonce, session, and scope;
- expired and consumed rows;
- revoked project membership;
- changed project/global invalidation token;
- newer history message;
- active/stale-resuming checkpoint fallback;
- direct execution denied for `anon` and `authenticated`;
- migration idempotence.

Application contract:

- malformed key performs no RPC;
- one RPC exactly on eligible requests;
- receipt identity/shape mismatch falls back;
- prepared prompt hit preserves canonical request-hash lineage;
- prompt/tool harness drift falls back to existing preparation;
- attachments, unsupported contexts, and checkpoint receipts use the existing path;
- prepared hit skips access, session, checkpoint, prepared-row, context-token, and history reads;
- final admission still claims once and rejects stale/consumed races.

## Deployment and rollback

1. Apply the additive function migration.
2. Verify function grants and disposable/Preview database tests.
3. Deploy application fast path behind `AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED`.
4. Canary enabled, inspect miss reasons and Send-to-admitted latency.
5. Expand only when safety counters remain flat.

Rollback is the environment flag. The existing preparation path remains intact. The additive RPC
can remain deployed while disabled and can be removed in a later cleanup migration after the lane
is either accepted or abandoned.

## Exit condition

Delete this Tasker only after the migration and application are deployed, the prepared-hit A/B
receipt meets or explicitly rejects the latency gate, security/error counters show no regression,
and any residual single-RPC admission decision has moved to a durable architecture record or a
narrow follow-up tracker.
