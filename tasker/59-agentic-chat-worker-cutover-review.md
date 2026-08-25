<!-- tasker/59-agentic-chat-worker-cutover-review.md -->

# 59 — Agentic Chat worker full-cutover: findings and remediation

**Reviewed 2026-08-24** against the uncommitted working tree, driving from
`docs/plans/AGENTIC_CHAT_WORKER_FULL_CUTOVER_EXTERNAL_ACCOUNTS_PLAN_2026-08-24.md`.
Nine parallel reviews: web transport, attachment/voice parity, worker concurrency, deletion
completeness, Gmail port security, package hygiene, smart-llm plumbing, full verification, architecture.

**Ship gate:** WP-1 through WP-4 must land before `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=true`.

## Remediation status — 2026-08-24

The code-side cutover blockers found by this review are resolved. The worker is now the primary
executor for compatible turns, while any resolved capability it cannot execute is routed through a
server-authorized legacy lease. This is a deliberate boundary, not a lexical browser heuristic.

The corrected worker release is deployed at `e799f2b70`; the web attachment-fallback correction is
deployed at `44331ee8a`. Railway configuration, release
health, authenticated lease/capability preflight, and the live two-overlapping-turn smoke have all
passed. Corrected image fallback, capacity closure, and rollback are also green. **Production routing
intentionally remains disabled** until the remaining authenticated voice-note, Gmail, and Calendar
fallback smokes are completed; see the deployment record below.

| Work package | Result                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WP-1**     | Landed a shared, fail-closed worker tool policy. Admission rejects a resolved unavailable tool surface with `TRANSPORT_RENEGOTIATE`; the browser then obtains a legacy-only lease. The regex router and all wiring/tests for it are deleted.                                                                                                             |
| **WP-2**     | Legacy-selected transport failures now return the narrow `TRANSPORT_UNAVAILABLE` sentinel, preserving the rollback path when routing is off or its lease/decision dependencies are unavailable. Worker-selected failures remain retryable and never silently fall back.                                                                                  |
| **WP-3**     | Worker admission/execution use explicit `AGENT_CHAT_LIVE_VISION_ENABLED`; legacy SSE may independently use `AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED`. Attachment turns fail over to legacy while worker vision is disabled, legacy still receives pixels, worker execution fails closed on drift/no image, and metadata records live-vision request/count. |
| **WP-4**     | A security-invoker trigger atomically attaches an owned draft voice-note group when the user message is inserted. It cannot relink an already attached group. The disposable PostgreSQL admission/claim contract covers attachment and relink resistance.                                                                                                |
| **WP-5**     | Provider degradation state is keyed by `turnRunId`, so one concurrent turn cannot close or clear another turn's latch. The production two-overlapping-turn smoke reached `activeTurns: 2`; both isolated turns passed end to end and worker health returned cleanly to idle.                                                                             |
| **WP-7**     | The ox trial is opt-in, ox requests cannot provider-fallback into production models under relaxed routing policy, request price is capped, and model selection no longer escapes a cost-filtered deployable pool.                                                                                                                                        |
| **WP-8**     | The Gmail account port stores only an availability boolean, validates UUIDs, enforces ownership + active/read-enabled capability, rejects oversize results, maps typed errors without swallowing unknown failures, and is subpath-only to prevent dual class identity.                                                                                   |
| **WP-9**     | Shared project-state normalization, project context-document generation, and the blocked-retry message now serve web and worker. Date parsing remains behavior-specific, and the durable receipt-validator extraction remains intentionally deferred until post-cutover stability as this review directs.                                                |
| **WP-10**    | The controller harness now always negotiates like production. Admission fixtures pass the real strict schema, include valid storage paths, and the turns route is tested with a non-empty attachment.                                                                                                                                                    |
| **WP-11**    | Agent-orchestrator test consumers use a real dev dependency/subpath export; dead negotiation/retry fields and write-only loggers are removed; attachment restoration preserves newer drafts; smart-llm has strict unused-code linting; timeout classification is typed; stale canary guidance is corrected.                                              |

WP-6 (worker-native Gmail reads) is not required for correctness after WP-1: Gmail remains fully
available through the legacy external-account executor. Per the sequencing decision in this review,
copying Gmail token-decryption/client secrets into Railway and mounting all four Gmail reads is a
separate optimization to take only when traffic justifies the larger trust boundary.

### Verification evidence

- Focused web cutover suite: **123/123 passed**.
- Worker suite: **1,153 passed**, with **1 explicit eval skip**; native TypeScript check and build passed.
- Agentic Chat runtime: **268/268 passed**; build passed.
- Shared agent ops: **128/128 passed**; build/declaration generation passed.
- Smart LLM: **87/87 passed**; strict unused-code lint passed.
- Disposable PostgreSQL admission/claim contract: **2/2 passed**, including voice-note attachment,
  relink resistance, and cross-user ownership isolation.
- Full web Svelte check: **0 errors, 0 warnings**; Svelte analyzer: **0 issues, 0 suggestions**.
- Production web build passed. The broad web test run recorded **3,778 passes**; its five non-Postgres
  failures are the same pre-existing `projects-old`, stream-orchestrator, and living-fiction cases
  already identified by this review. PostgreSQL suites require localhost binding and were separately
  verified for the changed migration above.
- `git diff --check` passed.

### Production deployment verification — 2026-08-24

- Commit `e799f2b70` was pushed to `main`; only the six launch-tool-surface remediation files were
  included in that commit. The unrelated dirty working-tree files were not staged or deployed.
- Railway deployment `36a1d43b-5486-4b3a-89dd-782afd6e17cc` completed successfully and reports the
  exact release `e799f2b70ed8cf30a3d5979812b688a62599b7dc` from `/health`.
- Railway production environment is explicitly configured with
  `AGENT_CHAT_LIVE_VISION_ENABLED=false`, `CHAT_CONCURRENCY=2`, and an empty retired
  `AGENTIC_CHAT_INTERNAL_USER_IDS`. Worker enablement is true and all required Supabase,
  OpenRouter, and worker-auth secrets are present.
- Runtime health passed after startup and after live traffic: worker, queue, Realtime, recovery, and
  database access were healthy; provider and adapter mutation catalogs both advertised all 20
  reviewed mutation tools; claim/recovery failure counts remained zero.
- The authenticated zero-spend preflight passed login, private Realtime subscription, exact worker
  lease validation, and mutation-capability readback.
- Two isolated `project-catchup-cold` worker scenarios were launched concurrently. Production health
  observed `activeTurns: 2`; both passed end to end (approximately 83s and 165s), and the worker then
  returned to `activeTurns: 0` with a healthy idle queue.
- Vercel deployment `dpl_CHBAsUfhTbjDDKLSRGTv4m2b7sKG` completed from the same commit, is Ready and
  aliased to `build-os.com`; the public alias returned HTTP 200.
- Vercel production explicitly has `AGENT_CHAT_LIVE_VISION_ENABLED=false` and
  `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false`. The worker URL and encrypted transport lease secret
  are present. Routing stays false until the remaining authenticated UI/fallback smokes pass.

### Cutover continuation — 2026-08-25

- The first authenticated attachment turn exposed a release blocker not covered by WP-3: with the
  shared live-vision flag false on both hosts, admission renegotiated correctly but legacy SSE also
  omitted the image. The model guessed from project context. Commit `44331ee8a` split legacy vision
  behind `AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED`, retaining the old shared flag as a backwards-
  compatible fallback and failing closed on an invalid dedicated value.
- Verification for the split passed: focused legacy/worker/stream tests **61/61**, full Svelte check
  **0 errors and 0 warnings**, production web build passed, and `git diff --check` passed.
- The corrected authenticated attachment turn passed. Session
  `7ef2f216-f0d5-479d-87a8-1b87ae123413`, turn
  `170e7fd9-48db-465c-88cd-1b8e2bdf3563`, user message
  `e3964f51-7991-43a8-b435-b10fbbb705ba`, and assistant message
  `e7a28f1c-5ca3-4075-83ba-551141d00270` completed as `legacy_sse`; metadata recorded one attached
  image with `live_vision_requested=true`, and the assistant correctly identified the purple brain
  and lightning icon. Server evidence recorded explicit `TRANSPORT_RENEGOTIATE` before legacy.
- Capacity closure passed against a canary-only unreachable worker origin. The authenticated UI
  displayed retryable worker-unavailable, preserved the full composer draft, and never opened legacy
  SSE; server logs recorded two `missing_evidence` capacity observations.
- Rollback passed with fresh turns. Routing-off turn
  `4764219a-435e-4f9d-acfe-6f36d297e3d7` in session
  `66906169-68d9-4e6a-a5e8-2dae7a1597f0` completed as `legacy_sse`. Re-enabled turn
  `4ec41e13-19b2-4e1f-ac37-39031fdb01f6` in session
  `ce923e0f-8bcb-458d-8702-e8e05a377bc2` completed as `worker_realtime` with
  `agentic_chat_worker_v1`.
- Post-traffic worker health is healthy and idle: Realtime connected with two active channels and
  zero consecutive failures; queue claim failures and recovery sweep failures are zero; both
  mutation catalogs advertise 20 tools.
- Vercel deployment `dpl_A2AuvnKDB57S6czbe6gJR9hR8Uqd` cloned commit `44331ee`, is Ready and
  aliased to `build-os.com`; the public alias returned HTTP 200. Production now has
  `AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED=true`. The unchanged routing/worker-vision values remain
  `false`/`false`.
- The Riley canary account has no external-account connections. The DJ account has three active,
  read-enabled Gmail connections and two active Calendar connections with 38 current sources, so
  those smokes must use DJ's authenticated context.
- Remaining gate: real voice recording plus Gmail and Calendar legacy reads in a DJ-authenticated
  routing-on protected canary. The in-app microphone stayed at “Preparing mic…” and produced no
  group; local Chrome Google login is blocked by the unregistered localhost redirect URI. These are
  not passes, so public routing remains disabled.

## Decisions recorded (DJ, 2026-08-24)

1. **Fix the routing gate holistically, not with a regex patch.** Message-text matching is
   superficial and will rot again. Build the capability check — WP-1.
2. **Gmail is out of the pilot phase.** Tier 1 Gmail read tools are generally available; any user may
   optionally connect an account. [tasker/35](35-agentic-chat-gmail-tools.md) has been corrected.
   This retires the "Gmail is a DJ-only pilot, so do Calendar first" argument — see
   _Sequencing_ below.

## Original review read, in six lines (pre-remediation)

1. **The cutover direction is right and the discipline is above bar.** The deletions are clean, the
   Gmail port's ownership boundary is genuinely sound, and the worker concurrency change is correct
   where it counts. Full verification found **zero failures attributable to the working-tree changes.**
2. **The plan's claim that "Calendar conversations [are] legacy-gated" is false in the code** —
   `EXTERNAL_ACCOUNT_TERMS` matches `google calendar`, never bare `calendar`. Highest-consequence
   finding, and it is silent. → WP-1.
3. **The transport catch-all put the emergency rollback in the same failure domain as the thing it
   rolls back.** A missing lease secret or a Supabase blip kills _all_ chat, flag-off included. → WP-2.
4. **Image and voice turns were switched onto the worker before it could serve them.** Vision sits
   behind a differently-named default-off flag; voice-note groups are never attached and get
   garbage-collected. → WP-3, WP-4.
5. **`CHAT_CONCURRENCY=2` is safe in the machinery** but adds one real cross-user coupling (the
   provider degradation latch) — exactly what the live two-turn smoke exists to catch. → WP-5.
6. **Package usage is mostly correct.** The export map has zero drift. Costs were the un-tree-shakable
   barrel (fixed), dual module identity, and five duplicated web/worker concepts — one of which ships
   users a degraded result today. → WP-9.

---

## Preliminary fixes in the review pass — 2026-08-24

All verified: `apps/worker` TS7 `tsc --noEmit` exit 0 · `svelte-check` **0 errors 0 warnings** ·
worker concurrency suite 60/60 · web transport suite 55/55 · `shared-agent-ops` build success.

| Fix                                                                                                                                                                                                                                                                                                                                                         | Files                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **P0-4 draft loss.** Added `INVALID_FIELD` + `FORBIDDEN` to `WORKER_KNOWN_NOT_ADMITTED_CODES` — the two rejections an attachment turn is most likely to hit, both decided before any durable write. A 422/403 no longer eats the user's images.                                                                                                             | `agent-chat-stream-controller.svelte.ts`                                          |
| **`instanceof` hazard.** Renamed the browser class to `AgenticChatWorkerUnavailableResponseError`. The server/client split is deliberate (browser cannot import `.server.ts`); the identical _name_ was the trap.                                                                                                                                           | `worker-transport-client.ts`, `agent-chat-stream-controller.svelte.ts`, + test    |
| **Barrel tree-shaking.** Added `"sideEffects": false`. The 626 KB `dist/index.mjs` re-exports `googleapis`/`marked`/`posthog-node`; 25 call sites import the barrel, several for one symbol.                                                                                                                                                                | `shared-agent-ops/package.json`                                                   |
| **28 junk `.test.d.ts` shipped in `dist/`.** Added `**/*.test.ts` to tsconfig `exclude`. Verified gone after rebuild.                                                                                                                                                                                                                                       | `shared-agent-ops/tsconfig.json`                                                  |
| **Leaf-module import hazard.** Moved `MAX_AGENTIC_CHAT_CONCURRENCY` out of `consumer.ts` into `concurrencyBounds.ts`. `capacity.ts`/`providerCapacity.ts` are pure policy and were transitively pulling `supabaseQueue` → `lib/supabase.ts`, which **throws at module load** without Supabase env.                                                          | `concurrencyBounds.ts` (new), `consumer.ts`, `capacity.ts`, `providerCapacity.ts` |
| **Orphaned env.** Removed `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` from the turbo passthrough and root env example.                                                                                                                                                                                                                                           | `turbo.json`, `.env.example`                                                      |
| **Dead code from the agent-to-agent deletion.** Deleted the orphaned `actionable-insight-agent.ts` (sole importer was the deleted endpoint; only file in `prompts/`), the unreachable `changeContext()` modal wrapper, and the empty route dirs. `shellRouter.changeContext()` is still live at `agent-chat-shell-router.svelte.ts:107` and was left alone. | 3 deletions                                                                       |
| **Stale API doc** advertising the removed `/api/agentic-chat/agent-message`.                                                                                                                                                                                                                                                                                | `apps/web/docs/features/agentic-chat/README.md`                                   |

---

## Work packages (original findings; closed status is recorded above)

### WP-1 (P0) — Capability-gated transport routing

**Replaces** `needsLegacyExternalAccountTools` entirely. No message-text matching anywhere in the
routing path.

**The defect being fixed.** `apps/web/src/lib/components/agent/external-account-tool-routing.ts:5-8`:

```
EXTERNAL_ACCOUNT_TERMS =
  /\b(gmail|email|e-mail|inbox|mailbox|google account|google calendar|oauth)\b/i;
```

`calendar` matches only after `google`. Verified against real phrasing:

| Message                                     | Routes to                                 |
| ------------------------------------------- | ----------------------------------------- |
| "what's on my calendar tomorrow?"           | **worker**                                |
| "schedule this task on my calendar Tuesday" | **worker**                                |
| "move my 3pm meeting to Friday"             | **worker**                                |
| "the client emailed me about pricing"       | **worker** (`\bemail\b` misses `emailed`) |
| "add a task to email Sarah"                 | legacy (false positive, benign)           |

`create_calendar_event` / `update_calendar_event` / `set_project_calendar` / `delete_calendar_event`
are all in `AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1`, and `list_calendar_events` has **zero
occurrences anywhere in `apps/worker/src`**. Compounding it,
`buildWorkerToolSurfaceOverride` (`readOnlyProvider.ts:4994`) tells the model _"Do not delay a safe
direct action merely because an absent … tool was suggested; use the callable tools that are
present."_ So a missing calendar tool does not produce an error — it produces a **confident
substitute action**: a BuildOS task dated Thursday, a confident reply, and no Google Calendar event.

**Where the gate lives today.** Entirely client-side. `AgentChatModal.svelte:592` supplies
`requiresLegacyToolSurface`; `agent-chat-stream-controller.svelte.ts:617-631` narrows
`supportedModes` to `['legacy_sse']` in the lease request; the server honors it because
`selectAgenticChatNewTransport` returns `LEGACY_TRANSPORT` when `worker_realtime` is unsupported.

**Recommended design — decide at admission, not negotiation.**

Transport negotiation does _not_ know the tool surface (tool selection runs later, and forcing it
early is an expensive restructure). Admission _does_:
`worker-turn-preparation.server.ts` already calls `buildToolSurface` at **lines 443 and 529**.

So:

1. **Shared source of truth.** Today the worker's executable policy lives in
   `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts` where the web cannot read it. Move
   (or mirror with a drift test) a **worker-executable tool-name contract** into a shared package —
   `packages/shared-types` or `packages/agentic-chat-runtime`.
   **Critical:** `AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1` covers _write_ tools only. The contract
   must also cover **reads the worker lacks** — `list_calendar_events`,
   `get_calendar_event_details`, and every Gmail read tool.
2. **Fail closed.** Any tool in the web catalog not explicitly classified as worker-executable is
   treated as worker-unavailable. Mirror the existing `auditAgenticChatMutationSurfaceV1()` pattern,
   which already **throws on drift** — that is the right shape; extend it rather than inventing one.
3. **Check at admission.** In the worker-turns admission path, intersect the resolved tool surface
   with the contract. If the turn's surface contains anything the worker cannot execute, reject with
   **`TRANSPORT_RENEGOTIATE`** — already in `WORKER_KNOWN_NOT_ADMITTED_CODES`, already draft-preserving,
   already handled by the client. The client re-negotiates with `supportedModes: ['legacy_sse']`.
4. **Delete** `external-account-tool-routing.ts`, the `requiresLegacyToolSurface` dep on
   `StreamControllerDeps`, its wiring in `AgentChatModal.svelte`, and their tests.

**Known cost:** Gmail/Calendar turns pay one extra round trip (negotiate → admission reject →
re-negotiate). Acceptable for correctness; if it shows up in latency, add a cheap server-side
pre-classifier at negotiation later. Do **not** re-introduce message-text matching to save the hop.

**Acceptance criteria**

- "what's on my calendar tomorrow" → legacy. "move my 3pm meeting to Friday" → legacy.
- A pure project turn with no external-account tools → worker.
- Adding a tool to the web catalog without classifying it → **drift test fails**, and the turn
  routes to legacy at runtime.
- Zero message-text pattern matching remains in the routing path (grep proves it).
- Mid-conversation is already safe — transport is pinned per turn — but add a regression test.

---

### WP-2 (P0) — Stop transport failures from killing the legacy rollback

`transport/+server.ts:121-146`, `worker-transport-client.ts:61-70`.

`adoptWorkerAdmissionResponse` is supplied unconditionally (`AgentChatModal.svelte:632`), so every
send negotiates a lease, and the endpoint issues leases for **both** modes — meaning `validateSecret`
(`transport-lease.server.ts:331-338`) runs even with routing disabled. The widened catch-all turns
every failure into `503 WORKER_UNAVAILABLE`, and the client now **throws** instead of returning `null`.

- **Failure A:** `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET` unset or <32 bytes (new env, preview deploy,
  rotation window) → **100% of chat sends fail**, and setting the routing flag to `false` does not
  recover it.
- **Failure B:** `resolveExistingAgenticChatTransportDecision` (`transport-decision.server.ts:108-128`)
  queries `chat_turn_runs` on every negotiation, **upstream of the flag check**. A 30-second Supabase
  pool blip fails every send.

**Fix shape.** The distinction the plan wants is _"was worker transport affirmatively selected?"_ —
only then is 503 correct. A legacy-selected turn whose lease or DB lookup failed should still return
`TRANSPORT_UNAVAILABLE`, and the client should still return `null` for that code so legacy stays
reachable. Keep no-fallback for genuine worker capacity/observation failures; that decision is sound.

**Acceptance:** with the routing flag off and the lease secret blank, chat works on legacy.
Add the test — `server.test.ts` currently mocks `selectAgenticChatNewTransport` and only asserts the
worker rejection, so neither failure is covered.

---

### WP-3 (P0) — Worker vision flag: two names, defaults off, no telemetry

Web reads `AGENT_CHAT_LIVE_VISION_ENABLED` (`worker-turn-preparation.server.ts:133`); worker reads
`AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED` (`phase3Config.ts:86-90`). Different switches. The worker's
defaults `false`, is `=false` in `apps/worker/.env.example:93`, is absent from `railway.toml`, and is
**not in `PRODUCTION_REQUIRED_CONFIG`** — so production boots healthy with vision off.

With it off, `phase3Assembly.ts:264-269` leaves `liveVision` undefined and `readOnlyProvider.ts:1753`
returns early: no signed URL, no `image_url` part. For `temporary_file` attachments the contract
**forces** `ocr_status: 'skipped'` and null extraction (`agentic-chat-worker-contract.ts:2216-2219`),
so the model gets a filename, a byte size, and a note that pixels were not passed — then answers
anyway with no acknowledgement it never saw the image.

**Do:** reconcile the two variable names (or document the split loudly), decide whether vision is a
release requirement and add it to `PRODUCTION_REQUIRED_CONFIG` if so, and write
`live_vision_requested` / `live_vision_attachment_count` into worker-path message metadata — legacy
already does (`stream/+server.ts:1661-1662`) and without it this defect is undetectable in prod.

**Interim:** until this lands, image turns should not be worker-routed. WP-1's capability contract is
the natural place to express that.

---

### WP-4 (P0) — Worker voice notes are garbage-collected out of history

Legacy calls `sessionService.attachVoiceNoteGroup(...)` (`stream/+server.ts:3996`), setting
`linked_entity_id`, `chat_session_id`, `status:'attached'`. The worker path stores
`voice_note_group_id` in message metadata and **nothing else** — `attachVoiceNoteGroup` has exactly
one server call site, the legacy one. `ChatTurnCommandV1.voiceNoteGroupId`
(`agentic-chat-worker-contract.ts:329`) has **no consumer in `apps/worker`**: a dead contract field.

**Failure:** the group stays `status:'draft'`, `api/voice-note-groups/cleanup/+server.ts:39-46`
soft-deletes the notes and **deletes the audio from storage**, session hydration filters deleted rows,
and `AgentMessageList.svelte:356` renders a chip pointing at nothing. This is silent user data loss.

**Do:** attach the voice-note group on the worker admission path with the same durable effect as
legacy. Add a test asserting `status:'attached'` + `linked_entity_id` after a worker voice turn.

---

### WP-5 (P1) — Provider degradation latch is cross-user at concurrency 2

`providerCapacity.ts:34` `degradedUntilMs` is a process singleton (`phase3Assembly.ts:288`), set from
five sites in `readOnlyProvider.ts` and cleared from five more. At concurrency 1 it was per-turn by
construction; at 2 it is shared:

- **Innocent-turn bounce:** turn A hits a retryable provider error → `markTemporarilyUnavailable(2000)`
  → turn B, admitted seconds earlier against open capacity, throws `provider_capacity_unavailable`.
- **Erased backoff:** turn B's next success calls `markAvailable()`, nulling A's cooldown; A retries
  into a known-bad provider with zero backoff.

Cooldown default is 2s so blast radius is bounded. **Do:** key the latch per-turn (or per-route), or
accept it explicitly and make the live two-turn smoke assert it. Note the admission RPC caps
`max_running = 2` **per user**, so one user can occupy both slots.

Related, same gate: the timeout slot-release race (`supabaseQueue.ts:734-766`) widens at 2 — the
injected-timeout smoke should exercise **two simultaneous** timeouts.

---

### WP-6 (P1) — Gmail worker parity

Now that Gmail is GA (decision 2 above), Gmail turns are real user traffic that WP-1 will route to
legacy until worker tools exist. Continue the port extraction:

Move token decryption/refresh and content-free audit operations behind the shared port with injected
key material, then port the bounded Gmail gateway and install all four reads
(`get_external_account_status`, `list_email_accounts`, `search_email_messages`, `get_email_message`)
**atomically** in the worker catalog and execution adapter.

`requireOwnedConnections` is the ownership boundary the token/search/message port must call before
reading credentials — but see WP-8: it is **ownership-only** and is not sufficient as an
authorization gate on its own.

---

### WP-7 (P1) — ox-alpha plumbing (not the model choice)

Two plumbing defects, independent of the trial itself:

1. **The relaxed privacy policy is not scoped to ox.** `openrouter-v2-service.ts:812-822` sets
   `max_price` instead of `zdr` keyed on the _primary_ model, but `:1257-1260` / `:1706-1709` ship the
   whole production route in the **same request's** `models` array — provider-side failover under the
   same `provider` block. So the request offers `deepseek/…`, `z-ai/…` with **no `zdr: true`**.
   `data_collection: 'deny'` is retained, so this is a retention/logging break, not training. The
   comment at `stream/+server.ts:1810` claiming "every fallback retains the normal privacy policy" is
   true only of the application-level retry loop. The new test at
   `openrouter-v2-service.test.ts:292-299` asserts this arrangement as _expected_.
2. **Every agentic-e2e battery silently runs on ox-alpha.** `agentic-e2e/harness/env.ts:35` defaults
   `baseUrl` to `localhost:5173` → `vite dev` → `dev === true` → the trial defaults **ON** (`?? 'true'`).
   Re-running the PC1 release gate or the organize/multi-update batteries produces numbers not
   comparable to any prior run. **Make the trial opt-in (`?? 'false'`), or make the guard require that
   the harness is not driving.**

Also: `max_price` (`openrouter-v2/types.ts:46-49`) caps only `prompt`/`completion`, not `request` —
unlike `spend-guard.ts:124-128`. And `model-selection.ts:111`
(`deployableEligible.length > 0 ? deployableEligible : eligible`) is an escape hatch — a
`profile: 'custom'` call with a tight `maxCost` can empty the pool and return ox **in production**,
contradicting the "excluded from requirement-based selection" comment.

---

### WP-8 (P1) — Gmail port hardening

The **ownership boundary is sound** (see Verified clean). These are the surrounding issues:

- **Stop demanding secrets the port never uses.** `gmail-account-read-port.ts:85-104` consumes
  `clientId`, `clientSecret`, `tokenEncryptionKey`, `conflictingGoogleClientId` **only** to compute an
  `available` boolean. Shipping this to Railway means copying the Gmail token-decryption key to a
  second host for zero functional benefit. TS `private` fields are enumerable, so
  `JSON.stringify(port)` in any APM serializer prints them. Pass `available: boolean` (or an
  `isConfigured()` thunk) until token work actually lands.
- **Map the error code through.** `gmail-read-oauth.service.ts` wraps the delegation in a bare
  `catch {}`, collapsing `invalid_request` into `database_error` and making any `TypeError`
  unrecoverable — no stack reaches a logger. _(Two premises to record as corrected: `getPrivateEnv`
  returns `undefined` rather than throwing, so config errors cannot masquerade as DB errors; and the
  env read was already per-request before this change.)_
- `requireOwnedConnections` does **not** check `status === 'active'` or `read_enabled`. The plan's
  wording invites the next slice to treat it as sufficient — which would read an account the user
  explicitly toggled read-off. Either fold those checks in or rename it to say what it does.
- The gateway's current ownership check writes an `email_access_audit_events` row
  (`gmail-read-gateway.ts:341-350`); the shared port emits nothing. Don't lose that on the worker.
- `.limit(MAX_GMAIL_CONNECTIONS)` is silent **truncation**, not rejection (unreachable today — DB
  trigger caps at 5 — but the constant now means two different things).
- No UUID validation, deviating from `agent-run-calendar-port.ts:276`'s `isValidUUID`.
- **Dual module identity:** `src/index.ts` `export *` makes tsup inline a **second copy** into the
  626 KB barrel (verified: `dist/index.mjs` carries its own `GmailAccountReadPortError`). Root vs
  subpath importers get distinct classes, and this codebase discriminates Gmail errors by `instanceof`
  in eight places. Pick one specifier — the worker-safe siblings are subpath-only.
- `apps/web/vitest.config.ts:72-100` aliases shared-agent-ops subpaths to `src`; the email subpath is
  missing, so `cd apps/web && pnpm test <file>` tests a **stale dist**. CI is safe.
- Duplicated types: `GmailConnectionSummary` / `GmailConnectionsPayload` / `GmailConnectionCapability`
  now exist in both the port and `apps/web/src/lib/types/gmail-integration.ts`.

---

### WP-9 (P2) — Web/worker duplication

Beyond `docs/plans/AGENTIC_CHAT_RUNTIME_WORKER_DEDUPLICATION_PLAN_2026-08-22.md`:

| Pair                                            | Size      | Note                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Context-document template**                   | ~50/~22   | **Do first.** Worker copy (`createOntoProjectMutationAdapter.ts:398-419`) hardcodes Spark/Goals/Tasks to empty fallbacks. Worker-created projects get a **worse context document today**, and the cutover makes that copy authoritative for real users. |
| Project-state alias map                         | 5 copies  | Already drifted 3 ways — one returns `null`, one the raw token, two unvalidated. Twin of the completed `normalizeTaskStateInput`.                                                                                                                       |
| Date-boundary normalization                     | ~60/~65   | No shared home exists.                                                                                                                                                                                                                                  |
| Blocked-retry supervisor message                | ~10       | Worker exports the const; web inlines the same 200-char literal (`tool-round-runner.ts:72`). `fixtureTurnExecutor.ts:1379` asserts the shape — drift breaks parity fixtures silently.                                                                   |
| `reconcile_agentic_chat_turn` receipt validator | ~230/~300 | Largest by line count. Touches the durable-receipt invariant chain — do it **after** the cutover is stable, fixtures green.                                                                                                                             |

---

### WP-10 (P2) — Tests that assert the wrong thing

- ~26 of 38 stream-controller harnesses omit `enableWorkerAdoption`, exercising a dep shape
  `AgentChatModal` **cannot produce**. Every "legacy happy path" assertion there tests dead code, and
  nothing covers "negotiation fails while routing is disabled" (the WP-2 gap).
- `worker-transport-client.test.ts:160-192` asserts client output against a hand-written mirror of
  that same output. Its fixture uses `storage_bucket: 'chat-attachments'` and a path prefix the **real
  server would reject** (requires `onto-assets` + `users/{userId}/chat-temp/{id}/`). Nothing feeds
  client output through `workerAdmissionRequestSchema` — do that.
- `turns/server.test.ts:84` only ever sends `attachments: []`.

---

### WP-11 (P2) — Remaining hygiene

- **`packages/agent-orchestrator` is not dead weight** — CLAUDE.md's "not yet consumed by the apps" is
  **stale**. Seven `apps/web` test files reach into its `src/` by relative path
  (`../../../../../../../packages/agent-orchestrator/src/...`), bypassing `exports` and the workspace
  graph; same violation at `change-set-commit.test.ts:3`. It holds the Phase A / open-brief eval
  harness. Wire it as a real `devDependency` with subpath exports and fix the 7 imports, then correct
  CLAUDE.md.
- `canUseStreamCreatedSession` (`stream-controller:552-553`) is now constant `false`; the non-worker
  branch at `:568-575` is unreachable. Delete the dead expressions.
- `parseRetryAfter` parses `Retry-After` into `error.retryAfterSeconds`, which nothing reads. Either
  surface it in the UI or drop it.
- Attachment restore has no "typed while in flight" guard, unlike the input restore.
- `private errorLogger` is write-only in `openrouter-client.ts:21` and `moonshot-client.ts:10`.
  Nothing flags it: no `noUnusedLocals`, and **`packages/smart-llm` has no `lint` script at all**.
- `progressTracker.ts:267`'s `'timed out'` branch is **dead code with a misleading comment** — that
  predicate classifies `queue_jobs` write failures; `LLMRequestTimeoutError` cannot reach it. In
  `errorLogger.ts` it is near-inert (`:86` returns `llm_error` first when model context is set). Both
  could use the existing typed check (`errors.ts:113-115`) instead of substring lists.
- **Observability note:** the errorLogger removal's rationale holds — Moonshot _is_ covered by the
  same service-layer catches. Real cost: timeouts _recovered_ by failover are now unstructured
  (`console.warn` only). If the §12.1 seven-day telemetry gate counts timeouts, it needs a new sink.
- Convention: write the worker-safe port contract as a 6-line comment in `shared-agent-ops/src/index.ts`
  (explicit credentials, typed client, `user_id` on every service-role query, subpath-only export,
  colocated test). **Do not** invent a `Port<T>` base type — the three ports share no method surface.
- `tasker/49:95` still instructs confirming `AGENTIC_CHAT_INTERNAL_USER_IDS`, which no longer exists.

---

## Sequencing

The original Fork-2 argument (Calendar before Gmail, because Gmail was a DJ-only pilot) is **retired**
— Gmail is GA. With WP-1 landed, ordering stops being a _safety_ decision: any capability the worker
lacks routes to legacy automatically. It becomes a value decision.

**Recommendation: keep Gmail first (WP-6), then Calendar.** Gmail extraction is already underway,
serves real users, and each slice _closes_ a boundary. Calendar is the bigger, riskier move and needs
a design decision before any code: the existing `agent-run-calendar-port.ts` (1,757 lines) **bypasses
the chat access gateway and targets the obsolete single-account token model** and must not be mounted
in Agentic Chat as-is. A _partial_ Calendar port would open a second auth model — the opposite of what
the Gmail slice did. **Slice when the slice closes a boundary; move Calendar atomically or not at all.**

Worth noting: with WP-1 in place, the dual system stops being debt and becomes declared architecture —
legacy as the permanent external-account executor. WP-6 and Calendar then become optimizations you do
when traffic justifies them, not a migration you owe.

## Deployment sequence — the plan understates one risk

`AgenticChatWorkerCapacityEvidenceV1` (`capacity.ts:38-50`) carries **no cohort information**, so an
old cohort-enforcing worker behind the new web still publishes _open_ capacity → the web mints a
`worker_realtime` lease → the turn admits and enqueues → the old worker calls `executor.reject()` →
durable terminal `failed` / `internal_cohort_rejected`. That is a consumed draft and a user-visible
failed turn, **not** "avoidable unavailable turns" — the exact failure that already happened twice in
the Phase 6 canary.

Two additional hard-fail landmines, both from Railway env edits redeploying the _current_ image:

- `CHAT_CONCURRENCY=2` against the old build → `must remain 1 until the load-smoke gate` → boot fail →
  healthcheck fail → **total chat outage**.
- Removing `AGENTIC_CHAT_INTERNAL_USER_IDS` against the old build → `must contain at least one
canonical UUID` → same outage.

Plan step 2 must land strictly **after** the new image is live, and step 3 strictly after step 2.

---

## Initial review snapshot — verified clean before remediation

The counts in this historical snapshot were superseded by the final verification evidence at the
top of this document. The architectural conclusions remain useful; use the top status table and
verification list for the current working tree.

- **Full verification: zero failures attributable to the working-tree changes.** All typecheck lanes
  pass (worker TS7, shared packages TS5.9), `pnpm lint` passes, `svelte-check` is **0 errors 0
  warnings**, worker suite **1150 tests pass**, `shared-agent-ops` **126**, `smart-llm` **86**, and
  both the worker build and the web vite build succeed. The 3 genuine web failures are **pre-existing**
  in files this diff does not touch: a stale `stream-orchestrator` test orphaned by commit `32c08d260`,
  two `tool-execution-service` cases, and a `projects-old` route deleted earlier.
- **The agent-to-agent deletion is clean.** Zero broken references across `apps/`, `packages/`,
  `supabase/`. Both `ModalStateDeps` implementers updated. No call site passes `senderType`;
  `suppressInputClear` survives with one live caller. **No DB enum or check constraint** strands
  `agent_peer` (`role`/`message_type` are plain `text`). No 404-able caller.
- **The Gmail port's ownership boundary is sound.** Every query filters `user_id` + `provider` +
  `deleted_at`; the requested-ID path applies `.in()` _on top of_, never instead of.
  `requireOwnedConnections` fails closed with one non-enumerating error and returns only requested
  rows. The five-cap **rejects before any DB call**. No secrets in returns, errors, or logs. Injection
  is impossible — postgrest-js quotes values containing `[,()]`. Payload parity is field-for-field. The
  port has **zero runtime imports** — genuinely worker-safe.
- **Provider capacity formulas match term-for-term.** `getSnapshot()` computes
  `available = configured && degradedUntilMs === null && activeRequests < concurrency`;
  `validProviderSnapshot` asserts exactly that. This was the highest-risk hypothesis for a
  permanently-closed-capacity outage — clean.
- **The cohort removal is complete.** No references in `apps/`, `packages/`, `supabase/migrations/`,
  `railway.toml`, `nixpacks.toml`, or CI. No DB constraint expects the failure code. `executor.reject`
  removal leaves **no coverage gap** — `execute()` already carries the identical envelope/claim failure
  paths, and deleting the cohort removes the only claimable-but-unrunnable job class.
- **Safe at concurrency 2:** per-turn `Map` in `streamPublisher`, batched flush with 8x headroom,
  `cancellationObserver` bound, `consumerRuntime` count-based, token-fenced stalled recovery, **zero
  non-`readonly` instance fields** on the executor / provider adapter / OpenRouter client. Zero/negative
  guards hold; config merge fails closed on explicit `undefined`.
- **`isCanonicalClosedCapacity` drift risk is disproven** — the decision object is minted web-side with
  a hardcoded constant; exact-key validators match byte-for-byte.
- **Attachment wire shape is correct** — both branches match the `.strict()` schemas field-for-field,
  the server reuses the identical validation as legacy, expiry is enforced twice with a 24h TTL that
  exceeds queue latency, and the worker re-asserts project access. That hop is solid; it just never
  runs while WP-3 stands.
- **ox-alpha dev gating is correctly scoped** — `dev` is a Vite build constant, false under
  `vite build` for production _and_ preview. No worker/script path can reach the model. Ox is
  **prepended**, not substituting. Zero-cost accounting is safe.
- **`AgenticChatFixtureTurnExecutor` is the only executor** — despite the name, it is production.

## Environment note

Full `svelte-check` OOMs at default heap (~4.1 GB). Run it with
`NODE_OPTIONS="--max-old-space-size=8192"` — it then reports 0 errors, 0 warnings. Two reviewers hit
the OOM independently, and one hit an esbuild goroutine panic during `svelte-kit sync` when two
typecheck processes ran concurrently in this repo.

## Corrections applied to the plan doc

1. "Kept Calendar conversations legacy-gated" — **false**; see WP-1.
2. "Historical `agent_peer` message rendering remains for old sessions" — **not functionally true**.
   `mapLoadedMessageToUI` (`agent-chat-session.ts:682`) is the only row→`UIMessage.type` mapper and can
   only emit `'user'`/`'assistant'`; it never emitted `agent_peer`, even at HEAD. Old peer turns were
   persisted with `role: 'user'` and already rendered as user bubbles. Harmless — but the three
   retained sites are unreachable dead code, not a working safety net.
3. "Full web `svelte-check`: 0 errors and 0 warnings" — true, but only with a raised heap.
4. The reversed-deploy-order consequence is understated; see _Deployment sequence_.
