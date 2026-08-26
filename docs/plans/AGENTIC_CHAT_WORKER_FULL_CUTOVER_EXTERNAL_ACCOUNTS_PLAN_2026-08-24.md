<!-- docs/plans/AGENTIC_CHAT_WORKER_FULL_CUTOVER_EXTERNAL_ACCOUNTS_PLAN_2026-08-24.md -->

# Agentic Chat worker full-cutover and external-account plan

Date: 2026-08-24

## Continuation handoff — start here

**Current state (2026-08-25): public worker routing is active, the dedicated service is healthy, and the global rollback path is being retired.**

- Deployed source: `main` release `7097b47ec154`.
- Web: `https://build-os.com` returns HTTP 200.
- Dedicated Railway service: `https://agentic-chat-worker-production.up.railway.app/health`
  reports release `7097b47ec154`, a running healthy runtime, connected Realtime, healthy recovery,
  `activeTurns: 0`, and matching 20-tool provider/adapter mutation surfaces.
- Phase 7 source cleanup is implemented after that verification and is not part of the deployed
  release above. It removes the general-worker chat bootstrap/capacity fallback and the global web
  routing gate. Deploy and verify it as a two-service ownership cleanup, not as a capability cutover.
- Gmail, Calendar, browser OAuth handoff, and worker-disabled image execution remain available only
  through explicit capability renegotiation. Their web executor is not the infrastructure rollback.

The release-blocking review in Tasker 59 has been remediated and deployed. The authoritative routing
model is now:

1. Every UI turn negotiates server-owned transport.
2. Worker admission resolves the real tool surface and accepts only explicitly executable worker
   capabilities.
3. An unavailable resolved capability returns `TRANSPORT_RENEGOTIATE`; the browser requests a
   legacy-only lease for that same send.
4. Infrastructure or admission uncertainty after worker selection never opens legacy implicitly.

This removes the lexical client gate described in the historical appendix below and makes worker
execution primary without pretending external-account parity exists. Gmail and Calendar remain
available through the declared legacy external-account executor. Moving Gmail reads into the worker
is now an optional optimization with an expanded Railway secret boundary, not a cutover correctness
prerequisite.

WP-1 through WP-5, the ordered Railway/Vercel deployment, shared lease/capability preflight,
Realtime evidence, live two-overlapping-turn smoke, and public worker activation are complete. The
remaining operational task is to deploy the Phase 7 ownership cleanup and verify that the general
worker reports only general-queue health while the dedicated service remains healthy.

### Deployment verification found and fixed two additional blockers

1. The first production worker restart failed closed because
   `AGENT_CHAT_LIVE_VISION_ENABLED` was not explicitly configured for the production profile. Web
   and worker are now both explicitly `false`; image turns must use the declared legacy fallback.
2. The first live canary rejected ordinary launch surfaces with `TRANSPORT_RENEGOTIATE` because
   `domain_search` and `change_chat_context` were not classified correctly, and the immutable turn
   artifact froze the unfiltered web tool surface. Commit `e799f2b70` omits `domain_search`, makes
   `change_chat_context` worker-executable, mounts its worker adapter, and freezes only the filtered
   worker prompt tools in both preparation paths.
3. The first authenticated image fallback proved that the shared live-vision flag also disabled
   pixels in legacy SSE. The turn renegotiated correctly but legacy received no image and guessed
   from project context. Commit `44331ee8a` adds the Vercel-only
   `AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED` switch so legacy image fallbacks can remain enabled while
   worker image admission remains disabled.

Do not regress this boundary. The relevant sources are:

- `packages/agentic-chat-runtime/src/worker-tool-policy.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`
- `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`

### Production environment and Phase 7 source state

| Host / boundary           | Variable / capability                             | State                                                                      |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Vercel                    | `AGENT_CHAT_LIVE_VISION_ENABLED`                  | `false` — image turns explicitly renegotiate to web capability execution   |
| Vercel                    | `AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED`           | `true` — capability execution receives image pixels                        |
| Vercel                    | `PRIVATE_AGENTIC_CHAT_WORKER_URL`                 | Present and dedicated-only; Phase 7 source has no general-worker fallback  |
| Vercel                    | `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET`             | Present as encrypted/sensitive; CLI cannot print its value                 |
| Vercel                    | `PRIVATE_RAILWAY_WORKER_TOKEN`                    | Present as encrypted/sensitive                                             |
| Web source                | Global routing gate                               | Retired; compatible new turns select worker transport unconditionally      |
| Dedicated Railway process | Start command                                     | `node apps/worker/dist/chat-worker.js`; starting the process is enablement |
| Dedicated Railway process | `AGENT_CHAT_LIVE_VISION_ENABLED`                  | `false`                                                                    |
| Dedicated Railway process | `CHAT_CONCURRENCY`                                | `2`                                                                        |
| Dedicated Railway process | Supabase, OpenRouter, and worker-auth credentials | Present                                                                    |
| General Railway process   | Agentic Chat bootstrap/health/capacity            | Removed by Phase 7 source cleanup                                          |

The old Vercel `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` value may still exist as inert platform
configuration, but the source no longer reads it. The same is true of
`AGENTIC_CHAT_WORKER_ROUTING_ENABLED` after the Phase 7 deployment. The dedicated source no longer
reads `AGENTIC_CHAT_WORKER_ENABLED`; remove those stale environment values after deploy verification.
Do not copy Gmail/Google token-decryption credentials to Railway while Gmail and Calendar remain
worker-unavailable.

### Verified release evidence

- Authenticated zero-spend preflight passed login, private Realtime subscription, exact worker
  lease, and mutation-capability readback.
- Two isolated `project-catchup-cold` turns ran concurrently. Production health observed
  `activeTurns: 2`; both passed end to end (approximately 83s and 165s), then returned to
  `activeTurns: 0`.
- Post-canary worker health was clean: queue, Realtime, recovery, and the 20-tool provider/adapter
  mutation surfaces were healthy with zero consecutive failures.
- Railway warning/error log query for the new deployment returned no entries.
- Focused launch fix: runtime policy **3/3**, worker **117/117**, web admission **49/49**.
- Full release regression: Agentic Chat runtime **268/268**; worker **1,153 passed** plus one explicit
  eval skip; worker/runtime typechecks and builds passed; full Svelte check reported **0 errors and
  0 warnings**; production web build passed.
- `git diff --check` and Prettier verification for this plan and Tasker 59 passed.

### Phase 7 source verification — pending deployment

- Dedicated production health was checked first against deployed release `7097b47ec154`; all chat
  runtime signals were healthy before removing the redundant general-process fallback.
- Active source/config scans contain no global routing gate, no dedicated-runtime enable flag, and
  no Agentic Chat bootstrap, health, or capacity ownership in the general worker.
- Worker ownership/lifecycle tests passed 45/45; the full worker suite passed 1,189 tests with one
  opt-in eval skipped; worker check and production build passed.
- Web transport/controller tests passed 64/64, retained legacy capability execution passed 220/220,
  and the legacy stream route passed 45/45 after refreshing the already-shipped
  `tool_surface_materialized` telemetry goldens.
- Runtime parity passed 278/278, the Svelte autofixer reported no issues, full Svelte check reported
  zero errors and warnings, and the production web build passed.

### Historical canary evidence — 2026-08-25

The following records the rollout before public activation and Phase 7 cleanup. Routing-flag and
rollback instructions in this evidence are superseded by the current handoff and cutover rule.

- Realtime recovered from the startup-degraded state after a real isolated worker turn. Post-turn
  health was healthy with `activeTurns: 0`, Realtime connected, zero consecutive Realtime/claim/
  recovery failures, and both mutation catalogs at 20 tools.
- Authenticated image fallback passed after the flag split. Session
  `7ef2f216-f0d5-479d-87a8-1b87ae123413`, turn
  `170e7fd9-48db-465c-88cd-1b8e2bdf3563`, and user message
  `e3964f51-7991-43a8-b435-b10fbbb705ba` completed as `legacy_sse` with
  `live_vision_requested=true`, one live-vision attachment, and the correct visible description of
  the purple brain/lightning icon. Server logs retained the preceding explicit
  `TRANSPORT_RENEGOTIATE` worker-admission result.
- Capacity closure passed in the authenticated local UI using an unreachable canary-only worker
  origin. The composer displayed retryable worker-unavailable, retained the exact draft, and did
  not open legacy SSE. Server evidence recorded `missing_evidence` on both capacity attempts.
- Rollback passed in both directions with fresh turns. Routing-off session
  `66906169-68d9-4e6a-a5e8-2dae7a1597f0`, turn
  `4764219a-435e-4f9d-acfe-6f36d297e3d7` completed as `legacy_sse`; after re-enabling the canary,
  session `ce923e0f-8bcb-458d-8702-e8e05a377bc2`, turn
  `4ec41e13-19b2-4e1f-ac37-39031fdb01f6` completed as `worker_realtime` with contract
  `agentic_chat_worker_v1`.
- The focused legacy-vision suite passed **61/61**, full Svelte check passed with **0 errors and 0
  warnings**, the production web build passed, and `git diff --check` passed. Commit `44331ee8a`
  was pushed with exactly four source/config paths.
- Vercel production now contains the dedicated legacy flag set to `true`; the pre-existing readback
  for routing and worker live vision remains `false`/`false`, and no command changed either value.
  Deployment `dpl_A2AuvnKDB57S6czbe6gJR9hR8Uqd` cloned commit `44331ee`, is Ready and aliased, and
  `build-os.com` returned HTTP 200.
- Account capability inspection found that the Riley canary account has no Gmail or Calendar
  connection. The DJ account has three active/read-enabled Gmail connections and two active
  Calendar connections with 38 current sources. Gmail and Calendar UI smokes therefore require the
  DJ authenticated browser context.
- Voice is **not green**: the in-app browser remained at “Preparing mic…” and created no voice-note
  group. Chrome can provide a real microphone surface, but the local Google callback is not an
  authorized redirect URI and the DJ production session cannot be reused on localhost. Public
  routing remains false pending a DJ-authenticated protected canary (or explicit temporary
  credential-assisted login) for voice, Gmail, and Calendar.

### Working-tree warning

The repository contains many unrelated user edits and untracked documents. Commit `e799f2b70`
contains exactly six launch-tool-surface source/test files; none of those unrelated files were
included. This plan and Tasker 59 are currently untracked working-tree documents. A continuation
agent must inspect `git status`, stage exact paths only, and must not bulk-add, restore, or discard
the surrounding working tree.

## Cutover rule

Every compatible new user turn selects worker transport. Capacity/configuration/network/session
uncertainty returns retryable worker-unavailable and never changes transport semantics. Only an
explicit capability result may renegotiate the same send to synchronous web execution. Existing
persisted turns retain their immutable decision. Emergency rollback is a release rollback of the
worker-routing source, not an environment switch inside the current architecture. The dedicated
service is the only process that starts Agentic Chat or serves its health/capacity surface.

## Pre-review baseline (superseded)

This section records the implementation state that Tasker 59 reviewed. It is not the current
routing contract; the implementation update above and Tasker 59 remediation table are authoritative.

- Removed the web `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` and exact-user cohort routing.
- Passed image attachments and `voiceNoteGroupId` through the browser worker-admission client. The server already owned attachment validation, OCR/context preparation, message metadata, and the worker command contract.
- Removed the agent-to-agent creation/runtime surface, its browser service, and the `/api/agentic-chat/agent-message` endpoint. Historical `agent_peer` message rendering remains for old sessions.
- Kept Calendar conversations legacy-gated after research found that the existing Agent Run `CalendarPort` bypasses the Agentic Chat access gateway and targets the obsolete single-account token model. It must not be mounted directly in Agentic Chat.

## Pre-review assessment and execution status (superseded)

This table is retained as historical review evidence, not as a current task list. Its status column
records the state when Tasker 59 began. Use the continuation handoff and remaining-work sections for
current work.

The original plan's ordering was sound, but item 0 was a release prerequisite rather than optional
hardening. The reviewed source had three interacting failure modes: the dedicated consumer rejected
users outside `AGENTIC_CHAT_INTERNAL_USER_IDS`, every queue/provider/cancellation/capacity guard
assumed one slot, and worker capacity or transport failures selected a fresh legacy lease. Together
those paths could make an enabled all-user rollout look healthy while turns either failed after
admission or quietly exercised the legacy system.

| Area                | Assessment                                                                                                                                                                                                       | State when Tasker 59 began                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker-local cohort | Duplicate authorization/routing gate after authenticated web admission and a signed transport lease. It has caused real `internal_cohort_rejected` terminals when Railway configuration drifted.                 | Removed from worker config, bootstrap, consumer, executor, examples, and focused tests.                                                                                                               |
| Chat concurrency    | The original migration contract permits 2 only after measurement. Queue, provider, cancellation, and capacity validation must use one value or admission evidence becomes incoherent.                            | Source now accepts the reviewed range 1–2, caps above 2, and threads the configured value through all four boundaries. Live two-turn measurement remains a deployment gate before routing is enabled. |
| Failure routing     | Capacity/config/network/protocol failure is not an affirmative rollback decision. Returning legacy here creates mutable transport semantics for new turns.                                                       | Enabled compatible routing now returns `503 WORKER_UNAVAILABLE` with `Retry-After: 2`; the browser preserves the draft and does not open legacy SSE.                                                  |
| Session bootstrap   | A failed session bootstrap previously fell through to sessionless legacy when a prepared prompt existed.                                                                                                         | Sessionless legacy is now allowed only after the server explicitly issues a legacy lease; a worker lease without a session is retryable unavailable.                                                  |
| Gmail reads         | The tool definitions and web executor exist, but token refresh, provider fetch, cursor, sanitization, and chat execution still live in SvelteKit-only modules; no Gmail tool is installed in the worker catalog. | In progress. Account discovery/configuration and exact-`connection_id` ownership enforcement now live in a shared worker-safe port used by the web OAuth service. The browser legacy gate remains.    |
| OAuth handoff       | The web executor already returns bounded `client_action`, while the worker catalog explicitly defers `request_email_account_connection` as `browser_user_action_handoff`.                                        | Not started. Requires a durable worker result/effect contract, not provider-side OAuth.                                                                                                               |
| Calendar            | Shared runtime metadata exists, but the worker catalog still defers calendar mutations for provider reconciliation and the web executor owns source-aware behavior.                                              | Not started. Do not mount the Agent Run single-account port.                                                                                                                                          |
| Final client gate   | `needsLegacyExternalAccountTools` and `requiresLegacyToolSurface` are both still live and tested.                                                                                                                | Correctly retained until Gmail, OAuth handoff, and reviewed Calendar parity land.                                                                                                                     |

### Historical deployment sequence for item 0

Steps 1–3 are complete on `e799f2b70`. Step 4 is complete for negotiation, Realtime, and two
overlapping turns; its isolated capacity-closure/draft and rollback drills remain in the next-agent
sequence. Step 5 is intentionally not complete.

1. Keep `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false` while deploying the worker build.
2. Remove `AGENTIC_CHAT_INTERNAL_USER_IDS` from Railway, set `CHAT_CONCURRENCY=2`, and verify worker health plus open capacity evidence.
3. Deploy the web build that returns retryable worker-unavailable instead of minting legacy leases on failure.
4. Verify transport negotiation, two overlapping worker turns, draft preservation on forced capacity closure, Realtime completion, and rollback by setting only `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false`.
5. Enable routing for all compatible turns only after the lease secret and deployment-gate credentials below are verified.

Do not reverse steps 2 and 3 while routing is enabled: the source changes are compatible, but an old cohort-rejecting worker behind a new no-fallback web route would produce avoidable unavailable turns.

### Pre-review local verification

These counts describe the baseline before Tasker 59 remediation. Current counts are maintained in
Tasker 59 to avoid two competing verification ledgers.

- Worker Agentic Chat regression: 50 files, 524 tests passed.
- Worker TypeScript check: passed.
- Web transport/controller regression: 4 files, 55 tests passed.
- Full web `svelte-check`: 0 errors and 0 warnings.
- Svelte module analyzer: 0 issues in the edited stream controller. It retained one unrelated suggestion about the controller's existing built-in `Date` use.
- Re-audit after the cutover edits: worker concurrency/consumer regression 4 files and 51 tests passed; web transport/controller regression 4 files and 55 tests passed; `git diff --check` passed.
- Gmail account-port slice: shared package build and typecheck passed; 8 ownership/configuration/bounds tests passed; web OAuth/executor regression 27 tests passed after adding the web delegation assertion.

## Review corrections — 2026-08-24 (historical findings; remediated in Tasker 59)

A nine-lens adversarial review landed after this plan was written. Findings and remediation work
packages live in [`tasker/59`](../../tasker/59-agentic-chat-worker-cutover-review.md). Four claims
above are wrong or incomplete and are corrected here rather than edited in place, so the original
reasoning stays legible:

1. **"Kept Calendar conversations legacy-gated" is false in the code.**
   `external-account-tool-routing.ts` matches `google calendar`, never bare `calendar`, so
   "what's on my calendar tomorrow" routes to a worker with no calendar tools — and
   `buildWorkerToolSurfaceOverride` tells the model to act with the tools it has. The result is a
   confident substitute action and no Google Calendar event. **This is a release blocker.**
   DJ ratified a holistic fix (capability check, not a regex patch) on 2026-08-24 — tasker/59 WP-1.
2. **"Historical `agent_peer` message rendering remains" is not functionally true.**
   `agent-chat-session.ts:682` is the only row→`UIMessage.type` mapper and can only emit
   `'user'`/`'assistant'`; it never emitted `agent_peer`. Old peer turns were persisted with
   `role: 'user'` and already rendered as user bubbles. Harmless, but the retained branches are
   unreachable dead code, not a working safety net.
3. **The reversed-deploy-order consequence is understated.** Capacity evidence carries no cohort
   information, so an old worker behind the new web publishes _open_ capacity and produces durable
   `failed` / `internal_cohort_rejected` turns — a consumed draft and a visible failure, not a
   retryable 503. Setting `CHAT_CONCURRENCY=2` or clearing `AGENTIC_CHAT_INTERNAL_USER_IDS` against
   the old image is a hard boot failure and a total chat outage.
4. **"Full web `svelte-check`: 0 errors and 0 warnings" reproduces only with a raised heap**
   (`NODE_OPTIONS="--max-old-space-size=8192"`); it OOMs at the default.

Two further release blockers this plan does not mention: transport failures now take down the
**legacy rollback path** too (a blank lease secret fails 100% of sends with the routing flag off),
and image/voice turns were routed to the worker before it could serve them — vision sits behind a
differently-named default-off flag, and worker voice-note groups are never attached and get
garbage-collected. See tasker/59 WP-2 through WP-4.

**Gmail is out of the pilot phase** (DJ, 2026-08-24). The "Gmail reads are a DJ-only pilot" premise
in the priority ordering below no longer holds; tasker/35 has been corrected.

## Cutover completion and remaining external-account work

### 0. Infrastructure cutover blockers — complete

Remove Railway's `AGENTIC_CHAT_INTERNAL_USER_IDS` rejection path, replace the hard `CHAT_CONCURRENCY === 1` invariant with measured bounded concurrency, and change transport failures so capacity/config/network/session errors return retryable worker-unavailable instead of silently opening legacy SSE. Only the explicit emergency kill switch should select legacy for a new turn during the rollback window.

Source implementation and deployment are complete through commit `e799f2b70`. Railway now runs
with explicit live-vision disablement and two-slot chat concurrency, the retired internal-user
cohort is empty, and the live two-overlapping-turn smoke reached `activeTurns: 2` with both turns
passing end to end. Production web routing remains disabled pending the authenticated attachment,
voice-note, Gmail, and Calendar fallback smokes in the deployment gate below.

### 1. Gmail read port — optional post-cutover optimization

Extract a Railway-safe Gmail port from the web-only Gmail OAuth/read gateway. It must take explicit Supabase and Google credentials, enforce user ownership on every `connection_id`, refresh encrypted tokens without SvelteKit imports, sanitize MIME/HTML, bound result size, and preserve account provenance. Then admit and test:

- `get_external_account_status`
- `list_email_accounts`
- `search_email_messages`
- `get_email_message`

The first extraction sub-slice is complete: `@buildos/shared-agent-ops/email/gmail-account-read-port`
accepts only an explicit availability boolean plus an injected Supabase client. It stores no Google
credentials or token-encryption material, performs service-role-safe ownership filtering, validates
canonical UUIDs, caps and rejects oversize account/requested-ID batches at five, preserves
account/capability provenance, and is now the implementation behind the web OAuth service's
connection listing. Its `requireOwnedReadableConnections` primitive enforces ownership plus
`status='active'` and `read_enabled=true` before a future token/search/message port may read Gmail
data. No Gmail worker tool is advertised; capability admission routes those turns to the legacy
external-account executor without a browser text heuristic.

Optional next step, when traffic justifies the wider Railway trust boundary: move token
decryption/refresh and content-free audit operations behind a worker-safe port with injected key
material and Google client credentials, then port the bounded Gmail gateway and classify/install all
four reads atomically in the worker catalog and execution adapter.

Do not classify any Gmail tool as worker-executable until it is present in both the worker provider
catalog and execution adapter and passes the ownership/capability boundary above.

### 2. OAuth browser handoff — optional post-cutover optimization

`request_email_account_connection` does not perform OAuth in the model process. The worker mutation/effect path must return the same bounded `client_action` payload that the UI already renders, persist it in the tool result, and resume after the user-clicked web OAuth callback. The worker never receives Google credentials or an authorization code from the model.

### 3. Source-aware Calendar runtime and mutations — optional post-cutover optimization

Extract the current source-aware Calendar read/write services into a shared server runtime with explicit project/event access checks, connection ownership, `calendar_source_id` qualification, timezone parity, and injected credentials. Add worker reads only through that boundary. Then add reviewed mutation adapters for `create_calendar_event`, `update_calendar_event`, and linking/updating project mappings, each with a stable downstream idempotency key and provider-reconciliation receipt. Keep new secondary-calendar creation and `delete_calendar_event` deferred until ambiguity, confirmation, and tombstone recovery contracts exist.

### 4. Keep capability admission synchronized — ongoing invariant

The lexical client gate (`needsLegacyExternalAccountTools` / `requiresLegacyToolSurface`) has been
removed. The shared worker tool policy is now the only capability authority: adding a public tool
requires an explicit executable or unavailable classification, and the drift audit fails closed.
When Gmail or Calendar parity lands, update that policy only in the same change that mounts and tests
the worker execution adapter. Capacity closure remains retryable worker-unavailable, not a transport
fallback.

## Deployment gate

Before enabling the new default route in production, verify that web and worker share a non-empty
`AGENTIC_CHAT_TRANSPORT_LEASE_SECRET`, both explicitly keep
`AGENT_CHAT_LIVE_VISION_ENABLED=false`, Vercel explicitly uses
`AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED=true`, Realtime receipts arrive, and overlapping-turn plus
attachment/voice smokes complete. Verify a Gmail and Calendar read is admitted to the declared
legacy external-account executor. Google/Gmail credentials and token-encryption keys remain on the
web host while those capabilities are classified worker-unavailable; they are not a worker cutover
prerequisite. The routing flag alone is insufficient when the lease secret is absent.

Status on 2026-08-25: **cutover complete.** Exact-release deployment health, lease/capability
preflight, Realtime receipts, two overlapping turns, corrected image fallback, voice persistence,
DJ-authenticated Gmail and source-aware Calendar reads, capacity closure/draft preservation, and
rollback are green. Vercel production now has exact
`AGENTIC_CHAT_WORKER_ROUTING_ENABLED=true` and `AGENT_CHAT_LIVE_VISION_ENABLED=false`; Gmail,
Calendar, and image capabilities unavailable to the worker continue to receive an explicit
server-authorized legacy lease.

### Final activation record — 2026-08-25

- Reviewed `main` commit `06ce40b72` contains external-account routing/source-aware Calendar fix
  `8279847ad`. Production deployment `dpl_CGRinde1b5K3g3cXVdL2ppijpUYV` is Ready, is aliased to
  `build-os.com`, and returned HTTP 200.
- The supplied WAV completed server transcription and durable voice attachment. Group
  `b8364298-98d9-45b4-9e0b-15dea6d94dc0`, note
  `c495282b-2f19-4dd9-9fb5-11ca5ec58a32`, session
  `a35b3f2b-9b11-4f4f-aeb4-8b968ad7d489`, and turn
  `2e21d2cf-a5ca-4f80-b0fb-9173d510d5aa` completed as `worker_realtime`; the note transcription is
  complete, the group is attached to the user message, and hydration includes both records.
- Gmail turn `a30c101a-32a5-4e86-a662-9021d87697c4` in session
  `b31ece59-b3ec-4103-bcf4-51bba76ef599` completed as `legacy_sse`. It successfully called
  `list_email_accounts` and three bounded `search_email_messages` reads; no provider content was
  retained in this record.
- The routing-on compatible canary turn `8d475977-ece7-471a-aef0-40160b93d4d1` in session
  `15c6444a-34ba-4f20-bc80-3a199d9920e3` completed as `worker_realtime`. Calendar turn
  `398eaef8-5455-478a-8f6a-61082dd18fbe` in session
  `9e58ebfb-0943-4c12-89cd-ae77a5663b19` explicitly completed as `legacy_sse`; its successful
  `list_calendar_events` execution reported `source_aware`, two sources, two successful sources,
  zero failed sources, and zero events in the bounded interval.
- Post-traffic Railway health remained healthy and idle on release `e799f2b70`: database, queue,
  Realtime, and recovery were healthy; active turns, consecutive claim failures, Realtime failures,
  and recovery failures were zero; provider and adapter catalogs each exposed 20 mutation tools.
  The 15-minute post-activation warning/error query returned zero warnings and zero errors.
- The first CLI flag update included a trailing newline. Sanitized readback caught it before canary
  traffic; strict routing therefore remained off. The value was corrected to exact four-byte
  `true` and redeployed. There was no user-visible failure and no rollback event.

## Completed execution sequence

This sequence is retained as the completed activation and rollback runbook. Gmail and Calendar are
still intentionally not ported into Railway; their explicit legacy lease remains the production
boundary until worker-native implementations are separately justified and reviewed.

### A. Re-establish exact state

1. Read this handoff and Tasker 59 before changing code or environment configuration.
2. Confirm `main` and `origin/main` still contain `e799f2b70` or a reviewed descendant containing the
   same launch-tool-surface fix.
3. Inspect the dirty worktree. Do not stage, restore, or deploy unrelated changes.
4. Confirm Railway `/health` reports the expected release and healthy worker, queue, Realtime,
   recovery, and mutation-capability state.
5. Confirm the current Vercel production deployment is Ready and public routing is still `false`.
6. Treat encrypted Vercel secrets as present based on `vercel env ls`; `vercel env run` cannot expose
   sensitive values and a blank CLI read is not evidence that the secret is absent.

Useful read-only checks:

```bash
vercel inspect https://build-e22evj65h-djwayne35gmailcoms-projects.vercel.app
curl -fsSI https://build-os.com
curl -fsS https://agentic-chat-worker-production.up.railway.app/health | jq
railway status --json
railway logs 36a1d43b-5486-4b3a-89dd-782afd6e17cc \
  --service agentic-chat-worker \
  --environment production \
  --filter '(@level:error OR @level:warn)' \
  --lines 200
```

Do not paste full environment dumps into the plan or Tasker 59. Record only sanitized booleans,
non-secret flag values, release IDs, and health counts.

### B. Run the remaining checks in an isolated authenticated canary

Use a local or protected preview web deployment built from the exact reviewed source with worker
routing enabled only in that canary. Point it at the production worker, keep
`AGENT_CHAT_LIVE_VISION_ENABLED=false`, and use an ephemeral uncommitted canary lease secret where
the harness supports it. **Do not enable the public Vercel routing flag to create the canary.**

The known-good local canary shape is:

```bash
AGENTIC_CHAT_WORKER_ROUTING_ENABLED=true \
AGENT_CHAT_LIVE_VISION_ENABLED=false \
AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED=true \
AGENTIC_CHAT_TRANSPORT_LEASE_SECRET=<ephemeral-canary-secret-at-least-32-bytes> \
PRIVATE_AGENTIC_CHAT_WORKER_URL=https://agentic-chat-worker-production.up.railway.app \
AGENTIC_CHAT_WORKER_KILL_EPOCH=0 \
pnpm --filter @buildos/web exec vite dev --host 127.0.0.1 --port 5174
```

The zero-spend authenticated preflight command is:

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5174 \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
AGENTIC_E2E_WORKER_PREFLIGHT_ONLY=true \
AGENTIC_SCENARIOS=project-catchup-cold \
PRIVATE_AGENTIC_CHAT_WORKER_URL=https://agentic-chat-worker-production.up.railway.app \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts \
  --retry=0
```

The full scenario lane makes real model calls and writes isolated hosted-database fixtures. It is
not a zero-spend check. Use unique `AGENTIC_E2E_RUN_LABEL` values for overlapping runs and keep
`AGENTIC_E2E_RETRY_COUNT=0` for release evidence.

For every UI smoke, retain the session/turn identity and verify the immutable transport decision or
server evidence. A plausible model answer alone is not proof that the intended executor ran.

1. **Image attachment fallback.** Upload a disposable image and ask a question about it. Because
   live vision is false, worker admission must return `TRANSPORT_RENEGOTIATE`, the browser must obtain
   a legacy-only lease, and legacy must complete the turn. Verify the attachment/draft survives the
   renegotiation and remains visible after session reload.
2. **Voice-note persistence.** Record and send a disposable voice note through the real composer.
   Verify the selected transport reaches a terminal result, the owned voice-note group becomes
   `attached`, is linked to the intended message/session, survives reload, and is not eligible for
   draft cleanup. The existing disposable PostgreSQL contract is supporting evidence, not a
   substitute for this UI smoke.
3. **Gmail legacy admission.** With an account that has an active readable Gmail connection, make a
   bounded read request. Confirm the resolved Gmail capability causes explicit legacy
   renegotiation, the legacy tool performs the read, and no Gmail provider credential is required on
   Railway.
4. **Calendar legacy admission.** With an account that has an active Calendar connection, make a
   bounded read request. Confirm explicit legacy renegotiation and a real Calendar read. Do not
   accept a BuildOS task or invented schedule summary as a substitute.
5. **Capacity closure and draft preservation.** In the isolated canary, make worker capacity
   unavailable without changing the production worker—for example, use a canary-only unreachable
   worker origin or a controlled capacity stub. A compatible turn must return retryable
   `WORKER_UNAVAILABLE`, preserve the composer draft, and must not silently start legacy SSE.
6. **Rollback behavior.** With routing false in the isolated web canary, a fresh compatible turn
   must use legacy. Re-enabling canary routing must offer worker transport again. Do not mutate or
   recycle an existing turn to prove this; transport decisions are immutable per turn.

Stop and leave production routing false if any check loses a draft/attachment/voice note, admits a
Gmail or Calendar tool to the worker, silently falls back on worker infrastructure failure, fails to
reach a durable terminal state, or produces a release/config mismatch.

### C. Activate public routing only after B is green

1. Record the canary evidence and exact turn/session IDs in Tasker 59 and update the deployment-gate
   status in this plan.
2. Change only Vercel production `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` to `true`. Keep
   `AGENT_CHAT_LIVE_VISION_ENABLED=false`; do not add Gmail/Google secrets to Railway.
3. Trigger a clean production Vercel deployment from the reviewed `main` commit. Environment changes
   do not alter an already-built deployment, and the dirty local checkout must not be deployed.
4. Verify the new deployment is Ready and aliased to `build-os.com`, the public alias returns HTTP
   200, and sanitized environment readback reports routing `true` and live vision `false`.
5. Run one compatible project turn and one external-account/attachment fallback turn in production.
   Confirm the project turn uses worker transport and the unavailable capability uses an explicit
   legacy lease.
6. Recheck Railway health and warning/error logs after traffic. Watch active turns, queue claim
   failures, Realtime failures, recovery errors, and unexpected renegotiation for compatible project
   turns.

### D. Emergency rollback

Set Vercel production `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false` and perform a clean Vercel
redeployment. Verify a fresh turn uses legacy and that `build-os.com` remains healthy. Do not roll
back the Railway image to the old cohort-enforcing build: the retired/empty
`AGENTIC_CHAT_INTERNAL_USER_IDS` configuration is intentionally incompatible with that old startup
contract. Existing turns keep their immutable transport decision; the flag controls newly
negotiated turns.

### E. Documentation completion criteria

The next agent should not mark the cutover complete until this document and Tasker 59 contain:

- canary date, exact commit, web deployment ID, and worker deployment/release ID;
- pass/fail evidence for attachment, voice note, Gmail, Calendar, capacity closure, and rollback;
- the final Vercel routing/live-vision values;
- post-activation worker health/log evidence; and
- any rollback event, user-visible symptom, or intentionally deferred follow-up.
