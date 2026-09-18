<!-- docs/architecture/agentic-chat-workflow-v1-contract.md -->

# Agentic Chat workflow v1 contract

**Status:** **Interface freeze ready** (2026-09-14). Storage and readers are
implemented with every writer off; see section 16 and the
[Task 85 receipt](../technical/reviews/CHAT_WORKFLOW_TASK85_DURABLE_CONTRACTS_2026-09-14.md).

**Source baseline:** `c324762250e8c9546d63cf1dada4b6c885d36974` plus coordinator-recorded
executable dirty-tree SHA-256
`79e3613c2cb2ca0d2c7176476fab884e560bba53c2adec2dffe134f82a55fb3f`.

**Scope:** Internal, explicitly enabled, project-scoped, text-only, read-only review.

This document is the shared boundary for Taskers 85–88. Consumers implement against
it and must not change it independently; changes go through the 85 schema owner. The
freeze prerequisites were resolved as follows:

1. **Stabilization gate (82/84): waived by DJ on 2026-09-14** so the contract could
   freeze and storage could land with writers off. One combined 82+83+84+85 gate is
   still required before any writer, recovery activation, or deploy.
2. 83 supplied its accepted bounded role-report shape and output limits (**satisfied
   2026-09-14**; see sections 3, 4 and 7).
3. 84's final receipt names are reconciled in section 9, and its two-checkpoint proof
   exists (`apps/worker/tests/agenticChatStreamPublisher.test.ts`, "accepts newer
   durable progress before delayed Broadcast and covers both events with one exact
   ACK") (**satisfied 2026-09-14**).

The 83-dependent values below come from Tasker 83's closed role contract
(2026-09-14; see the [Task 83 receipt](../technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md)).
They are marked **(83)**. Where implementation settled a question the proposal left
open, the text below states the implemented rule and section 16 lists each amendment.

## 1. Existing contracts this proposal preserves

The current checkout already has these authorities:

- `chat_turn_runs.id` is the durable turn identity. Transport statuses remain
  `queued | running | completed | failed | cancelled`.
- `chat_turn_input_artifacts` stores one immutable, non-null input artifact for each
  admitted worker turn. Its current readers accept prepared
  `agentic_chat_input_v2` and `agentic_chat_input_v3` artifacts.
- `create_agentic_chat_turn_with_job(...)` is the existing 34-argument, service-only,
  duplicate-first prepared admission transaction. Queue-first admission now retains
  queued work until `retain_until` rather than applying the obsolete five-minute
  queue-residence rule.
- `claim_agentic_chat_turn(...)` owns the queue-processing-token and execution-generation
  fence. Current stream writes are also fenced by turn, queue job, processing token,
  generation, cancellation, and terminal state.
- `persist_agentic_chat_semantic_event(...)` and
  `persist_agentic_chat_text_batch(...)` allocate durable sequence numbers. The
  latter enforces a complete-text prefix and idempotent `batch_id`.
- `acknowledge_agentic_chat_stream_delivery(...)` acknowledges only an exact current
  durable sequence. `reconcile_agentic_chat_turn(...)` remains the owner-scoped
  reconnect/read model and the assistant message remains the terminal truth.
- Frozen inputs, events, stream state, and signals are retained for at least seven
  days after terminalization. Ordinary mutation effects retain their existing
  30-day / unresolved-uncertain rules.

The workflow contract must extend these boundaries. It must not reinterpret a v2/v3
prepared artifact as raw input, reset the answer on workflow recovery, bypass the
single terminal writer, or relax ordinary mutation recovery.

## 2. Version and naming constants

```ts
export const AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION = 'agentic_chat_workflow_v1' as const;
export const AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4 = 'agentic_chat_input_v4' as const;
export const AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION =
	'agentic_chat_workflow_request_hash_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_POLICY_VERSION =
	'agentic_chat_project_review_policy_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PLAN_VERSION = 'agentic_chat_project_review_plan_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION = 'agentic_chat_prepared_context_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION =
	'agentic_chat_workflow_projection_v1' as const;
```

These are the proposed public names after reconciliation with current v2/v3 and
stream contracts. SQL routine names below carry `_v1` because their signatures are
new and must not silently replace the existing prepared-admission or ordinary
recovery semantics.

## 3. Exact pilot limits

All limits are server policy. The browser may request project review intent; it may
not submit authoritative values for any row in this table.

| Limit                                         |                                                                                                                                         Frozen proposal |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------: |
| admitted review question                      |                                                                                                    3–6,000 Unicode code points and at most 24 KiB UTF-8 |
| frozen raw history                            |                                                                             50 messages and 256 KiB canonical UTF-8, matching the current store ceiling |
| complete v4 request artifact                  |                                                                                               2 MiB canonical UTF-8, matching the current store ceiling |
| prepared context payload                      |                                                                                                                                 256 KiB canonical UTF-8 |
| prepared evidence-version entries             |                                                                                                                                                     256 |
| fixed plan                                    |                                                                                                                   four steps and 64 KiB canonical UTF-8 |
| compiled assignment per step                  |                                                                                                                                  16 KiB canonical UTF-8 |
| accepted result per step                      |                                                                                                                                 128 KiB canonical UTF-8 |
| accepted specialist editor projection         |                                                                                                                                   24 KiB per specialist |
| serialized model request                      |                                                                                                             128 KiB UTF-8 before provider-added framing |
| specialist concurrency                        |                                                                                                                two, lowered by shared provider capacity |
| step execution attempts                       |                                                                                                              two per step; recovery does not reset them |
| physical provider requests                    |                                                                                   two per step attempt, including application-level fallback/correction |
| whole workflow physical provider requests     |                                                                                                                                                 sixteen |
| planner completion                            |                                                                                                       1,200 tokens, including hidden reasoning **(83)** |
| analyst/reviewer completion                   |                                                                4,000 tokens each, including hidden reasoning; equals the acting client ceiling **(83)** |
| editor completion                             |                                                                                                       3,200 tokens, including hidden reasoning **(83)** |
| specialist compact retry                      | one second attempt per specialist for a truncated, empty or evidence-invalid report, only with at least 75,000 ms of provider budget remaining **(83)** |
| whole workflow spend cap                      |                                                                                                                               250,000 micro-USD ($0.25) |
| synthesis headroom                            |                                                                                                                50,000 micro-USD ($0.05), 20% of the cap |
| model-provider work per worker invocation     |                                                                                                                                              300,000 ms |
| worker invocation timeout                     |                                                                                                                                              360,000 ms |
| stale-worker detection threshold              |                                                                                                                                              420,000 ms |
| one physical provider request                 |                                                                                             90,000 ms, bounded further by remaining invocation/run time |
| provider response-header wait                 |                                                                                                                                               10,000 ms |
| finalization time held from an invocation     |                                                                                                                                                5,000 ms |
| whole workflow lifetime                       |                                                                                                                  900,000 ms from its first worker claim |
| context-read timeout                          |                                                                                                                                               20,000 ms |
| active workflow artifact retention            |                                                                                                                                   through the whole run |
| terminal request/context/step/event retention |                                                                                                                at least seven days after terminal truth |

The 300/360/420-second clocks and 90/10-second provider clocks are current source
defaults. They are intentionally distinct from the 15-minute persisted workflow
lifetime and seven-day artifact retention. The workflow deadline is written once;
requeue never restarts it.

At dispatch, the physical request deadline is the earliest of `now + 90_000`, the
worker invocation deadline minus the 5,000 ms finalization reserve, and the persisted
workflow deadline. The response-header wait is the lesser of 10,000 ms and the time
remaining to that physical deadline. Context preparation uses the same invocation and
workflow bounds with `now + 20_000`. A boundary at or before `now` refuses new work;
it does not start a request that cannot preserve finalization time.

## 4. Pricing and deterministic reservation

The configured QA route referenced by the current source/evidence is
`deepseek/deepseek-v4.1-flash`. On September 12, 2026, OpenRouter's official
`GET /api/v1/models` response listed per-token base prices of $0.00000015 input,
$0.00000060 output, and $0.000000003 cached input, with time-based overrides up to
$0.00000030 input, $0.00000120 output, and $0.000000006 cached input. The repository's
current `MODEL_CATALOG` already budgets the peak $0.30/$1.20 per million-token rates.
See OpenRouter's [current Models API](https://openrouter.ai/api/v1/models),
[Models API documentation](https://openrouter.ai/docs/guides/overview/models), and
[provider max-price contract](https://openrouter.ai/docs/guides/routing/provider-selection).

The workflow therefore freezes these maximum admitted rates for that model:

```ts
type WorkflowPricingSnapshotV1 = {
	version: 'agentic_chat_workflow_pricing_v1';
	model: 'deepseek/deepseek-v4.1-flash';
	canonicalModel: 'deepseek/deepseek-v4.1-flash-20260910';
	promptUsdPerMillion: '0.30';
	completionUsdPerMillion: '1.20';
	cacheReadUsdPerMillion: '0.006';
	requestUsd: '0';
	source: 'openrouter_models_api';
	observedAt: string;
};
```

Every physical request uses OpenRouter `provider.max_price` of `$0.30/M` prompt,
`$1.20/M` completion, and `$0` per request. A configured primary or fallback without
a complete current pricing snapshot is `pricing_unavailable`; it cannot dispatch.
Changing the model or admitted maximum rates requires a new server policy version,
not mutation of an active run.

Reservation uses integer micro-USD and rounds each request up. It reuses the current
spend guard's conservative input estimate of one token per UTF-8 byte plus 1,024:

```ts
estimatedInputTokens = serializedRequestUtf8Bytes + 1_024;
reservedMicroUsd = ceil((estimatedInputTokens * 3 + maxOutputTokens * 12) / 10);
```

With 83's output caps at the 128 KiB request ceiling:

- The maximum planner reservation is 41,069 micro-USD.
- Each analyst or reviewer reservation is at most 44,429 micro-USD.
- The maximum editor reservation is 43,469 micro-USD.
- All four first attempts reserve at most 173,396 micro-USD, which leaves 76,604
  micro-USD for bounded retries. The research gate refuses a planner/specialist dispatch whenever it
  would leave less than 50,000 micro-USD for synthesis. That headroom admits one
  maximum-sized editor attempt (43,469 micro-USD). A second attempt is allowed only if
  settled/held exposure and its actual request size still fit; otherwise the runner uses
  the bounded model-free partial/failure fallback. At the request ceiling, the
  headroom rule admits at most one of 83's two compact specialist retries (44,429
  micro-USD each): the second would leave 31,215 micro-USD for synthesis. At observed
  request sizes, roughly 20 KiB or less, all six provider calls reserve about 63,000
  micro-USD, so both retries fit.

Provider-reported actual cost is rounded up to micro-USD and retained even when it
exceeds a reservation. An overrun does not rewrite history or get discarded; it
blocks further spending. Paid tools are disabled, but the ledger schema retains a
`paid_tool` dispatch kind for a later contract version rather than silently treating
tools as free.

## 5. Raw v4 request artifact

The raw request is a third branch in the existing input union. It is not a v3
artifact with an empty prompt.

```ts
type AgenticChatProjectReviewIntentV1 = {
	kind: 'project_review';
	objective: string;
	requestedCoverage: ['project_analysis', 'risk_and_alternatives'];
};

type AgenticChatWorkflowPolicyV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_POLICY_VERSION;
	workflowVersion: typeof AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION;
	scope: 'project_text';
	domainAccess: 'read_only';
	modelTools: 'none';
	domainWrites: 'forbidden';
	recoveryPolicy: 'durable_read_only_v1';
	maxSpecialistConcurrency: 2;
	maxStepAttempts: 2;
	maxPhysicalDispatches: 16;
	maxSpendMicroUsd: 250_000;
	synthesisHeadroomMicroUsd: 50_000;
	wholeRunLifetimeMs: 900_000;
};

type AgenticChatRawWorkflowInputV4 = {
	artifactVersion: typeof AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4;
	request: {
		requestId: string; // UUID, identical to the non-null artifact row id
		turnRunId: string;
		sessionId: string;
		userId: string; // authenticated server identity
		userMessageId: string;
		clientTurnId: string;
		streamRunId: string;
		message: string;
		context: {
			type: 'project';
			entityId: string;
			projectId: string;
		};
		reviewIntent: AgenticChatProjectReviewIntentV1;
		policy: AgenticChatWorkflowPolicyV1;
		policyRef: string;
		cacheRef: { id: string; generation: string } | null;
	};
	historySource: 'admission_window';
	history: FrozenHistoryMessageV1[];
	requestHashVersion: typeof AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION;
	requestHash: string;
	historyHash: string;
	contentHash: string;
	createdAt: string;
	retainUntil: string;
};

type AgenticChatWorkerInputV1 =
	| { kind: 'prepared'; artifact: PreparedInputArtifactV2OrV3 }
	| { kind: 'raw_workflow'; artifact: AgenticChatRawWorkflowInputV4 };
```

Example (history abbreviated):

```json
{
	"artifactVersion": "agentic_chat_input_v4",
	"request": {
		"requestId": "64f17036-53f0-4e6b-a51d-e8be69b10e88",
		"turnRunId": "d84bf59e-bd12-46ee-9b45-39ded05d7c71",
		"sessionId": "b293317a-9db2-45e6-afd1-f595863a47c0",
		"userId": "047d9b44-7552-4c34-b9ab-97bfa6cf17ed",
		"userMessageId": "d4214af2-80c0-41ac-83b1-363db85c3806",
		"clientTurnId": "client-01992",
		"streamRunId": "stream-01992",
		"message": "What should we prioritize next, and which assumptions could change that order?",
		"context": {
			"type": "project",
			"entityId": "fdf7f8c0-926c-44fd-acf8-f296842ac09e",
			"projectId": "fdf7f8c0-926c-44fd-acf8-f296842ac09e"
		},
		"reviewIntent": {
			"kind": "project_review",
			"objective": "What should we prioritize next, and which assumptions could change that order?",
			"requestedCoverage": ["project_analysis", "risk_and_alternatives"]
		},
		"policy": {
			"version": "agentic_chat_project_review_policy_v1",
			"workflowVersion": "agentic_chat_workflow_v1",
			"scope": "project_text",
			"domainAccess": "read_only",
			"modelTools": "none",
			"domainWrites": "forbidden",
			"recoveryPolicy": "durable_read_only_v1",
			"maxSpecialistConcurrency": 2,
			"maxStepAttempts": 2,
			"maxPhysicalDispatches": 16,
			"maxSpendMicroUsd": 250000,
			"synthesisHeadroomMicroUsd": 50000,
			"wholeRunLifetimeMs": 900000
		},
		"policyRef": "internal-project-review:2026-09-12",
		"cacheRef": null
	},
	"historySource": "admission_window",
	"history": [],
	"requestHashVersion": "agentic_chat_workflow_request_hash_v1",
	"requestHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"historyHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	"contentHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	"createdAt": "2026-09-12T20:00:00.000Z",
	"retainUntil": "2026-09-19T20:00:00.000Z"
}
```

### Hash rules

The canonicalizer is the current `canonicalizeAgenticChatJson` algorithm: recursively
sorted object keys, omitted `undefined` object fields, preserved array order, NFC and
LF-normalized user text, and rejection of non-JSON/cyclic values. The SQL counterpart
must accept only the constrained JSON scalar types used here and order the fixed ASCII
keys identically.

- `requestHash` hashes `{ version, clientTurnId, streamRunId, context, message,
reviewIntent, policy, policyRef }`. It intentionally excludes `cacheRef`: cache is
  an optimization, not request semantics or authority.
- `historyHash` hashes the admission-transaction history snapshot.
- `contentHash` hashes `{ artifactVersion, request, historySource, history,
requestHashVersion, requestHash, historyHash }`.

The raw admission transaction derives the user, session, project authorization,
normalized request fields, policy, and bounded history under its locks. It recomputes
`requestHash` from those server-derived fields and verifies `p_request_hash` only as a
caller echo; a mismatch is rejected before any insert. It constructs `historyHash` and
`contentHash` inside the same transaction. The browser never supplies authoritative
history, content hashes, identity, authorization, or policy. A duplicate is resolved
before cohort/capacity checks. The same `(user_id, client_turn_id)` plus changed text,
scope, intent, policy, or stream identity returns `idempotency_conflict`; it never
changes the accepted row.

## 6. Prepared context checkpoint

Prepared context is immutable and separate from the request artifact:

```ts
type AgenticChatPreparedWorkflowContextV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION;
	contextId: string;
	turnRunId: string;
	requestId: string;
	requestHash: string;
	preparationVersion: string;
	contextIdentity: {
		userId: string;
		projectId: string;
		accessCheckedAt: string;
		contextLoadedAt: string;
		cacheRefUsed: string | null;
	};
	evidenceVersions: Array<{
		kind: string;
		id: string;
		version: string;
		observedAt: string;
	}>;
	payload: JsonObject;
	payloadBytes: number;
	contextHash: string;
	acceptedAt: string;
};
```

Acceptance requires the current queue processing token, execution generation,
uncancelled/nonterminal turn, unexpired whole-run deadline, matching v4 request/hash,
and a current project-access check. The first valid checkpoint wins. A matching replay
returns `already_accepted`; a different context id/hash/version returns
`context_conflict`. Recovery reuses this checkpoint. It may recheck current access,
but it cannot overwrite evidence with a fresh snapshot. Revoked access returns
`access_revoked` and prevents provider dispatch.

## 7. Fixed plan, step, and accepted report

The pilot plan has stable keys and dependencies:

```ts
type WorkflowStepKeyV1 = 'planner' | 'project_analyst' | 'risk_reviewer' | 'editor';

type AgenticChatWorkflowPlanV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PLAN_VERSION;
	contextId: string;
	requestHash: string;
	planner:
		| { outcome: 'accepted'; stepAttemptId: string; resultHash: string }
		| { outcome: 'fixed_fallback'; stepAttemptId: null; resultHash: null };
	steps: [
		{ key: 'planner'; capability: 'plan_review'; dependsOn: [] },
		{ key: 'project_analyst'; capability: 'project_analysis'; dependsOn: ['planner'] },
		{ key: 'risk_reviewer'; capability: 'risk_and_alternatives'; dependsOn: ['planner'] },
		{
			key: 'editor';
			capability: 'synthesize_review';
			dependsOn: ['project_analyst', 'risk_reviewer'];
		}
	];
	assignments: Record<WorkflowStepKeyV1, JsonObject>; // exactly these four keys, 16 KiB each
};
// planHash = SHA-256 of the canonical plan. It is passed beside the plan and stored on
// the run; every later step RPC echoes it.

// The planner is a step with its own attempts and dispatches. Its accepted result:
type AgenticChatWorkflowPlannerResultV1 = {
	version: 'agentic_chat_workflow_planner_result_v1';
	assignments: { project_analyst: JsonObject; risk_reviewer: JsonObject }; // 16 KiB each
};
```

The planner may produce bounded assignment content, but cannot change the topology,
add tools, add a specialist, or authorize a mutation. Context acceptance creates the
planner step, and the plan can be installed only after that step is terminal. An
accepted planner result must appear verbatim as the plan's two specialist assignments,
bound by its step attempt id and result hash. A failed planner requires
`fixed_fallback` with null bindings and the explicitly labeled fixed assignments. The
database rejects any other combination, so the persisted plan always states which
source produced it.

Execution and quality are separate:

```ts
type WorkflowStepExecutionStatusV1 = 'pending' | 'claimed' | 'accepted' | 'failed' | 'skipped';

type WorkflowResultQualityV1 = 'complete' | 'partial';

type WorkflowEvidenceRefV1 = {
	kind: 'project_record';
	id: string;
	version: string;
	label: string;
};

// Accepted from Tasker 83 (closed 2026-09-14). The durable form adds kind/version to
// each evidence reference; the prototype validates id membership in the supplied packet.
type WorkflowRoleReportV1 = {
	version: 'chat_workflow_role_report_v1';
	role: 'project_analyst' | 'risk_reviewer';
	summary: string; // 1-280 chars
	findings: Array<{
		claim: string; // 1-320 chars
		basis: 'recorded' | 'inferred';
		evidence: WorkflowEvidenceRefV1[]; // 1-4, each resolving in the accepted evidence set
	}>; // 1-5 supported findings after unsupported ones are removed
	risks: Array<{ risk: string; evidence: WorkflowEvidenceRefV1[] }>; // 0-4, 1-280 chars
	unknowns: string[]; // 0-4, 1-240 chars
	recommendation: string; // 1-480 chars
	unsupportedReferences: number; // cited ids outside the evidence set, removed
	unsupportedFindings: number; // findings left without a supported reference, removed
};
// The editor projection is derived deterministically from the accepted report
// (record labels beside ids); it is not a separately trusted model field.
```

Every reference must match an accepted `evidenceVersions` entry on both `id` and
`version`; the database re-checks this and raises
`agentic_chat_workflow_step_result_unverified` otherwise. JSON shape alone is not
success. The accepted result and its hash are immutable, and a late attempt cannot
replace it. The editor becomes claimable once both specialists are terminal and at
least one was accepted. With none accepted, the editor is `skipped` with
`dependency_failed`. A `complete` synthesis requires both specialists accepted at
`complete` quality; anything less must be `partial`, and an overstated quality is a
SQL error. The editor's accepted result is the synthesis receipt
`{ version: 'agentic_chat_workflow_synthesis_result_v1', answerId, textBytes,
textSha256, quality }`.

The database validates the shape, size, and binding of worker-computed hashes
(context, plan, result). It does not recompute them. Request, history, and content
hashes are the exception: admission recomputes them from server-derived data.

One step row is unique on `(turn_id, plan_version, step_key)`. Each claim records a
stable attempt id, increments the durable attempt count, and binds the claiming
execution generation. Parent recovery never resets the count.

### State transitions

The workflow phase is monotonic. `preparing -> assessing` requires the accepted
context; `assessing -> executing` requires an installed plan; `executing ->
synthesizing` requires both specialist steps to be terminal and at least one accepted
specialist result. `synthesizing -> finished` requires an accepted synthesis or an
explicit bounded partial terminalization. Cancellation, access revocation, deadline
expiry, exhausted attempts/budget, or an unrecoverable invariant may terminalize any
nonterminal phase as `finished` with a truthful terminal outcome. Requeue changes the
transport execution state, not the workflow phase.

A step moves `pending -> claimed -> accepted`. A retryable failed claim moves
`claimed -> pending` while consuming its durable attempt; a non-retryable/exhausted
claim moves `claimed -> failed`. A dependency that can no longer be satisfied moves
`pending -> skipped`. `accepted`, `failed`, and `skipped` are terminal and cannot be
reopened by a later generation.

A dispatch moves `reserved -> dispatching -> settled`. An unused reservation may move
`reserved -> released`. A dispatch for which a network attempt may have crossed the
provider boundary moves `dispatching -> uncertain`; only provider-backed
reconciliation may move it to `settled` or `released`. Worker death, requeue,
cancellation, and local timeout do not release uncertain exposure.

## 8. Physical dispatch ledger

`chat_turn_workflow_dispatches` records each BuildOS-to-provider HTTP request. An
OpenRouter-internal upstream fallback contained in one HTTP request is one physical
dispatch and uses the provider's actual receipt; an application-level retry,
correction, route fallback, or model fallback that creates another HTTP request gets
a new dispatch id and reservation.

```ts
type WorkflowDispatchKindV1 =
	| 'planner'
	| 'specialist'
	| 'editor'
	| 'corrective'
	| 'provider_fallback'
	| 'paid_tool';

type WorkflowDispatchStateV1 = 'reserved' | 'dispatching' | 'settled' | 'released' | 'uncertain';

type WorkflowDispatchReceiptV1 = {
	dispatchId: string;
	turnRunId: string;
	stepKey: WorkflowStepKeyV1;
	stepAttemptId: string;
	physicalAttempt: number;
	kind: WorkflowDispatchKindV1;
	state: WorkflowDispatchStateV1;
	modelRequested: string;
	pricing: WorkflowPricingSnapshotV1;
	estimatedInputTokens: number;
	maxOutputTokens: number;
	reservedMicroUsd: number;
	actualMicroUsd: number | null;
	providerRequestId: string | null;
	providerUsage: JsonObject | null;
	reservedAt: string;
	dispatchedAt: string | null;
	settledAt: string | null;
};
```

Reservation and dispatch start are separate. A lost reservation response is safe to
read back because no network call follows without a `dispatching` permit. A lost
dispatch-start response leaves held exposure and does not grant another permit. Once
dispatch start was granted, absence of a provider receipt is `uncertain`; recovery
cannot release it merely because the worker died. Settlement is idempotent by dispatch
id and a settlement token; it remains allowed after cancellation, generation change,
or terminalization because recording already-incurred cost never grants execution.

Budget exposure (`agentic_chat_workflow_exposure_micro_usd_v1`) is the sum of:

- `reservedMicroUsd` for `reserved | dispatching | uncertain`; and
- `actualMicroUsd` for `settled`, including any overrun above the reservation.

Released dispatches count zero. A reservation fails with `budget_exhausted` when
exposure plus the new reservation would exceed the cap. For any non-editor step, it
fails with `synthesis_headroom_required` when less than the synthesis headroom would
remain. A step claim refuses new work once exposure has reached the cap.

Concurrent reservation serializes on the parent workflow row, so two specialists
cannot both observe the same remaining budget. Dispatch count, attempts, and exposure
survive requeue.

## 9. Stream, answer identity, and UI projection

84's delivery boundary has two different receipts. These are its final names in
`apps/worker/src/workers/agentic-chat/streamPublisher.ts`:

```ts
type AgenticChatPublisherDurableAcceptanceV1 = {
	outcome: 'persisted' | 'already_persisted';
	turnRunId: string;
	executionGeneration: number;
	sequenceIndex: number;
	phase: AgentStreamEventPhaseV1;
	eventType: string;
	persistedAt: string | null; // replay receipts prove durability without a commit time
};

type AgenticChatPublisherDeliveryV1 =
	| 'broadcast_acknowledged'
	| 'broadcast_sent_reconcile_pending'
	| 'reconcile_only'
	| 'already_persisted'
	| 'blocked';

type AgenticChatSemanticEnqueueResultV1 = {
	accepted: Promise<AgenticChatPublisherDurableAcceptanceV1>;
	delivery: Promise<AgenticChatPublisherDeliveryV1>;
	pressure: AgenticChatPublisherPressureV1; // plus pressureRelieved; see the source
};
```

The contract may permit computation to proceed after `accepted` only when the
publisher's internal scheduling also releases that event at durable acceptance. Two
promises are insufficient if the publisher queue remains busy awaiting `delivery`,
because a second semantic checkpoint would still serialize behind the first gated
broadcast. `delivery` must run on a separate bounded delivery lane, and a bounded
`flushTurn` remains the explicit terminal delivery/drain fence. Failed persistence
never becomes acceptance. A lost ACK means persisted/reconcile-pending, not unsaved.

84's deterministic adapter test, "accepts newer durable progress before delayed
Broadcast and covers both events with one exact ACK", gates event A's broadcast after
A is durably accepted, enqueues event B, and observes B durably accepted while A's
delivery is still gated. B keeps the next durable sequence, neither event is persisted
twice, and one exact ACK covers both.

Checkpoint/context/step-result acceptance and the associated full workflow projection
update commit in one database transaction and allocate one durable sequence. They are
not followed by a second best-effort progress write. Specialist drafts never use
`text_delta`.

The editor alone owns assistant deltas. Its answer identity and byte offsets extend
the current prefix contract:

```ts
type WorkflowAnswerCursorV1 = {
	answerId: string;
	startByte: number;
	endByte: number;
	deltaSha256: string;
	completeTextSha256: string;
};

type WorkflowSynthesisCheckpointV1 = {
	answerId: string;
	status: 'not_started' | 'streaming' | 'accepted';
	durableBytes: number;
	textSha256: string;
	editorStepAttemptId: string;
	acceptedAt: string | null;
};
```

Each batch must begin exactly at the persisted byte cursor and preserve the current
complete-text prefix. A matching batch replay is idempotent; a different delta for the
same batch/offset conflicts. Once any answer byte is durable, recovery cannot start a
new editor generation and append regenerated prose. It may reconcile/finish an already
accepted synthesis checkpoint or terminalize the durable prefix as partial. If zero
bytes were durable, the remaining editor attempt/budget may start from offset zero.

The privacy-safe projection is the only workflow detail the UI needs:

```ts
type AgenticChatWorkflowProjectionV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION;
	workflowVersion: typeof AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION;
	reviewIntent: 'project_review';
	phase: 'preparing' | 'assessing' | 'executing' | 'synthesizing' | 'finished';
	terminalOutcome: 'complete' | 'partial' | 'failed' | 'cancelled' | null;
	steps: Array<{
		key: WorkflowStepKeyV1;
		label: string;
		status: WorkflowStepExecutionStatusV1;
		quality: WorkflowResultQualityV1 | null;
		attemptsUsed: number;
		acceptedFinding: {
			summary: string;
			evidence: WorkflowEvidenceRefV1[];
		} | null;
		failureCode: string | null;
	}>;
	answer: WorkflowSynthesisCheckpointV1;
	transport: {
		executionState: 'queued' | 'active' | 'recovering' | 'terminal';
		lastDurableProgressAt: string | null;
		providerActivity: {
			state: 'idle' | 'waiting_for_capacity' | 'request_active' | 'settling';
			lastObservedAt: string | null;
		};
		delivery: {
			state: 'connected' | 'delayed' | 'reconcile_pending' | 'disconnected';
			lastObservedAt: string | null;
		};
	};
	coverageGap: string | null;
};
```

The server reconciliation response may add computed ages and a stall classification:
`queued`, `healthy_provider_work`, `delivery_delayed`, or `semantic_progress_stalled`.
Those ages are computed from database time and the persisted timestamps; busy queue
polls, socket activity, and non-semantic heartbeats never update
`lastDurableProgressAt`.

Workflow progress is the semantic event type `workflow_progress` in phase `llm`. Its
payload is `{ type: 'workflow_progress', workflow: AgenticChatWorkflowProjectionV1 }`,
and the stream projection carries the same object under `projection.workflow`. The
database requires `workflow.version` and `workflow.phase` to match the committing
checkpoint. Existing v1 stream envelope identity and exact sequence ACK are unchanged.

Sequences are **generation-scoped**, like every other worker turn: event ids stay
`turn:generation:sequence`, and the unchanged claim resets the stream cursor and text
for each generation. The first fenced write of a new generation must be
`resume_agentic_chat_workflow_projection_v1`. It republishes durable workflow truth
as that generation's sequence 1 and reseeds the stream's assistant text with the
durable answer prefix, so reconnecting clients converge on the same text. An answer
batch attempted before that reseed returns `stream_reseed_required`.

## 10. Storage proposal

The migration proposal is additive:

1. Extend `chat_turn_input_artifacts` to accept the explicit v4 raw branch. Add a
   nullable `request` JSON object and make the v2/v3 `prepared` object conditional by
   version; enforce exactly one branch. Keep the existing row id as the immutable,
   non-null request id referenced by `chat_turn_runs.input_artifact_id`.
2. Add `chat_turn_workflow_runs`, one row per v4 turn, for request/context/plan hashes,
   policy, pricing snapshot, fixed deadlines/budgets, phase/outcome, and synthesis
   cursor. This avoids putting a 256 KiB prepared context in general turn metadata.
3. Add `chat_turn_workflow_steps`, unique on
   `(turn_run_id, plan_version, step_key)`, for compiled assignments, dependencies,
   durable attempts/claim generation, and one immutable accepted result/hash.
4. Add `chat_turn_workflow_dispatches`, unique on `dispatch_id` and on
   `(turn_run_id, step_key, step_attempt_id, physical_attempt)`, for atomic reservation,
   dispatch start, settlement, provider receipt, and uncertain exposure.

All three workflow tables derive `session_id` and `user_id` from the parent turn and
use composite foreign keys where current schema supports them. No custom object is
created in the managed `realtime` schema. Supabase now blocks modifications to that
schema, and its 2026 Data API change also makes explicit grants mandatory for newly
exposed public tables. See [current Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
and the [breaking-change entry](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

For each table:

- enable RLS;
- revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`;
- grant only the required privileges to `service_role`;
- expose no direct browser mutation policy;
- use `SECURITY INVOKER` RPCs; where a defense-in-depth body check is retained, use
  the repository's supported trusted-role pattern based on
  `current_setting('request.jwt.claims', true)` with `current_user` fallback, never
  deprecated `auth.role()`;
- revoke function execution from `PUBLIC`, `anon`, and `authenticated`, then grant
  the exact signature to `service_role`.

The UI reads the existing owner-scoped chat reconciliation projection, so it does not
need direct access to prompts, checkpoints, dispatch rows, provider receipts, or cost.
Exact function `EXECUTE` grants, table privileges, and RLS are independent controls;
passing one does not imply passing either of the others.

## 11. Proposed SQL RPC signatures

These signatures are the implementation handoff. All JSON arguments have the exact
wire types and byte bounds above. All mutating routines use short transactions and
perform no provider call or context network read.

```sql
-- Duplicate-first atomic v4 admission. It freezes history, request artifact,
-- user message, turn, workflow row, and queue job together.
-- p_request_hash is an untrusted echo: recompute it from server-derived fields;
-- construct history_hash and content_hash inside this transaction.
create function public.create_agentic_chat_workflow_turn_with_job_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_turn_run_id uuid,
  p_user_message_id uuid,
  p_request_artifact_id uuid,
  p_stream_run_id text,
  p_client_turn_id text,
  p_transport_decision_id uuid,
  p_correlation_id uuid,
  p_project_id uuid,
  p_message text,
  p_review_intent jsonb,
  p_policy jsonb,
  p_policy_ref text,
  p_request_hash text,
  p_cache_ref jsonb default null
) returns jsonb;

create function public.accept_agentic_chat_workflow_context_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_context_id uuid,
  p_request_artifact_id uuid,
  p_request_hash text,
  p_preparation_version text,
  p_context_identity jsonb,
  p_evidence_versions jsonb,
  p_context_payload jsonb,
  p_context_hash text,
  p_context_bytes integer,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

create function public.install_agentic_chat_workflow_plan_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_context_id uuid,
  p_plan_version text,
  p_plan jsonb,
  p_plan_hash text,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

create function public.claim_agentic_chat_workflow_step_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_plan_hash text,
  p_step_key text,
  p_step_attempt_id uuid
) returns jsonb;

create function public.accept_agentic_chat_workflow_step_result_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_plan_hash text,
  p_step_key text,
  p_step_attempt_id uuid,
  p_quality text,
  p_result jsonb,
  p_result_hash text,
  p_result_bytes integer,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

create function public.fail_agentic_chat_workflow_step_attempt_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_plan_hash text,
  p_step_key text,
  p_step_attempt_id uuid,
  p_failure_code text,
  p_retryable boolean,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

create function public.reserve_agentic_chat_workflow_dispatch_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_dispatch_id uuid,
  p_step_key text,
  p_step_attempt_id uuid,
  p_physical_attempt integer,
  p_dispatch_kind text,
  p_model_requested text,
  p_pricing_snapshot jsonb,
  p_serialized_request_bytes integer,
  p_max_output_tokens integer
) returns jsonb;

create function public.begin_agentic_chat_workflow_dispatch_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_dispatch_id uuid
) returns jsonb;

-- Settlement token is created with the dispatch and is not a browser value.
-- Settlement may record an old generation's incurred charge but never grants work.
create function public.settle_agentic_chat_workflow_dispatch_v1(
  p_dispatch_id uuid,
  p_settlement_token uuid,
  p_provider_request_id text,
  p_provider_usage jsonb,
  p_actual_micro_usd bigint,
  p_outcome text
) returns jsonb;

create function public.reconcile_agentic_chat_workflow_dispatch_v1(
  p_dispatch_id uuid,
  p_reconciliation_id uuid,
  p_target_state text,
  p_provider_receipt jsonb default null,
  p_actual_micro_usd bigint default null
) returns jsonb;

-- Extends the current prefix writer with immutable answer identity/byte cursor.
create function public.persist_agentic_chat_workflow_text_batch_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_answer_id uuid,
  p_editor_step_attempt_id uuid,
  p_batch_id uuid,
  p_start_byte integer,
  p_text_delta text,
  p_assistant_text text,
  p_delta_sha256 text,
  p_complete_text_sha256 text
) returns jsonb;

create function public.accept_agentic_chat_workflow_synthesis_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_answer_id uuid,
  p_editor_step_attempt_id uuid,
  p_text_bytes integer,
  p_text_sha256 text,
  p_quality text,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

-- Workflow-only recovery. Ordinary recover_agentic_chat_turn remains unchanged.
create function public.recover_agentic_chat_workflow_turn_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_failure_class text,
  p_error_message text default null
) returns jsonb;

-- First fenced write of every generation: republish durable workflow truth and
-- reseed the stream's assistant text with the durable answer prefix.
create function public.resume_agentic_chat_workflow_projection_v1(
  p_turn_run_id uuid,
  p_queue_job_id uuid,
  p_processing_token uuid,
  p_execution_generation integer,
  p_transition_id uuid,
  p_projection jsonb,
  p_event_payload jsonb
) returns jsonb;

-- Service-only SECURITY DEFINER receipt cleanup. Retention floors of 30 and 90 days
-- cannot be lowered by arguments.
create function public.cleanup_agentic_chat_workflow_dispatches_v1(
  p_dispatch_retention_days integer default 30,
  p_reconciled_retention_days integer default 90,
  p_batch_size integer default 1000
) returns jsonb;
```

Terminal workflow truth is written by the trigger `trg_chat_turn_runs_workflow_terminal`
on the single existing terminal writer's status change. It sets `finished` with
`complete` (accepted complete synthesis), `partial` (any other completed turn),
`failed`, or `cancelled`. It releases unused permits and marks in-flight dispatches
`uncertain`.

Context/plan/result/synthesis routines return both their domain receipt and the
atomically committed semantic-event receipt. `persisted` is the only new publication
authority; matching replay returns `already_persisted` and reconciles.

## 12. Receipt outcomes and error policy

Expected domain outcomes are values, not exceptions:

The common fenced outcomes are `stale_generation`, `ownership_lost`,
`cancel_requested`, and `already_terminal`.

| Boundary           | Outcomes                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admission          | `newly_admitted`, `matching_duplicate`, `idempotency_conflict` (with `conflict_reason`), `active_turn_conflict`, `capacity_exceeded`, `access_denied`                                                                                                                                                 |
| context acceptance | `accepted`, `already_accepted`, `context_conflict`, `deadline_expired`, `access_revoked`, plus the common fenced outcomes                                                                                                                                                                             |
| plan installation  | `installed`, `already_installed`, `plan_conflict`, `context_required`, `not_ready`, `deadline_expired`, plus the common fenced outcomes                                                                                                                                                               |
| step claim         | `claimed` (a matching replay sets `replayed: true`), `claim_conflict`, `already_accepted`, `not_ready`, `plan_conflict`, `dependency_failed`, `attempts_exhausted`, `budget_exhausted`, `deadline_expired`, plus fenced                                                                               |
| step result        | `accepted`, `already_accepted`, `result_conflict`, `stale_claim`, plus the common fenced outcomes                                                                                                                                                                                                     |
| step failure       | `retry_scheduled`, `failed`, `skipped`, `already_accepted`, `stale_claim`, plus the common fenced outcomes                                                                                                                                                                                            |
| dispatch reserve   | `reserved`, `already_reserved`, `reservation_conflict`, `pricing_unavailable`, `stale_claim`, `dispatch_limit`, `budget_exhausted`, `synthesis_headroom_required`, `deadline_expired`, plus fenced                                                                                                    |
| dispatch begin     | `dispatching` (the only receipt with `dispatch_permitted: true`), `already_started`, `reservation_required`, `stale_claim`, `deadline_expired`, plus fenced                                                                                                                                           |
| dispatch settle    | `settled`, `uncertain`, `already_settled`, `settlement_conflict`, `unknown_dispatch`                                                                                                                                                                                                                  |
| dispatch reconcile | `reconciled`, `already_reconciled`, `still_uncertain`, `reconciliation_conflict`, `unknown_dispatch`                                                                                                                                                                                                  |
| text batch         | `persisted`, `already_persisted`, `answer_conflict`, `offset_conflict`, `stream_reseed_required`, `stale_claim`, plus fenced                                                                                                                                                                          |
| synthesis          | `accepted`, `already_accepted`, `answer_conflict`, `stale_claim`, plus the common fenced outcomes                                                                                                                                                                                                     |
| resume             | `resumed`, `already_terminal`, plus the common fenced outcomes                                                                                                                                                                                                                                        |
| recovery           | `retry_scheduled` (with released/uncertain counts and `uncertain_cost_held`), `already_requeued`, `terminal_reconciled`, `stale_generation`, `ownership_lost`, `cancel_requested`, `policy_denied`, `deadline_expired`, `finalize_failed`, `access_revoked`, `attempts_exhausted`, `budget_exhausted` |

Malformed identities/hashes/JSON, oversized payloads, missing parent relationships,
wrong roles, and internal invariant corruption remain SQL errors with stable
`agentic_chat_workflow_*` names. Role failure is SQLSTATE `42501`. Public HTTP surfaces
map database details to bounded application codes and never return provider receipts,
prompts, pricing internals, processing tokens, or settlement tokens.

Recovery is authorized only when all of these are durably true:

- v4 input and workflow v1 policy;
- `domainAccess = read_only`, `modelTools = none`, `domainWrites = forbidden`;
- no `chat_turn_effects` row, mutation reservation, or irreversible boundary;
- whole-run deadline and artifact retention have not expired;
- current project access still exists;
- attempts, physical dispatch count, and budget permit remaining work; and
- cancellation/terminal truth is absent.

Several changes commit together:

- queue lease release and requeue;
- releasing unused `reserved` permits;
- marking `dispatching` rows `uncertain`, which keeps them in exposure;
- recording the first execution start and incrementing the recovery count.

Recovery also clears `execution_started_at` and returns the turn to `queued`. The
unchanged claim then increments the generation. The old owner is fenced as soon as the
lease clears (`ownership_lost`) and becomes `stale_generation` after the next claim.

Only `transient_infra`, `provider_throttle`, `timeout_pre_start`, `timeout_post_start`,
and `publisher_overload` may retry; every other class returns `finalize_failed`.
Backoff is `min(5 × 2^attempts, 30)` seconds plus up to 2 seconds of jitter. Ordinary
mutating turns continue through `recover_agentic_chat_turn(...)` with their current
pre-start-only policy. The contract test shows it still returns `finalize_failed` for
a post-start v4 turn without mutating it.

## 13. Reader compatibility and rollout

Reader behavior is explicit:

| Input                                                  | Ordinary direct provider                  | Workflow preparation/runner                                                         |
| ------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| valid v2 prepared                                      | accepted, unchanged                       | rejected as not a raw workflow                                                      |
| valid v3 prepared                                      | accepted, unchanged                       | existing `/workflow` prototype may continue only while its separate flag is enabled |
| valid v4 raw, no accepted context                      | `raw_workflow_input_requires_preparation` | preparation allowed; model dispatch denied                                          |
| valid v4 raw plus accepted context, no dispatch permit | `raw_workflow_input_requires_preparation` | provider dispatch denied                                                            |
| valid v4 plus context and current dispatch permit      | rejected                                  | fixed workflow call allowed                                                         |
| unknown version or hash mismatch                       | rejected before model work                | rejected before model work                                                          |

Implemented readers (`apps/worker/src/workers/agentic-chat/executionInput.ts`):
`load()` throws `raw_workflow_input_requires_preparation` for any v4 row without
selecting v4 columns, and `loadRawWorkflowInput()` re-verifies every request, history,
and content hash, byte count, retention, and command binding through
`validateAgenticChatRawWorkflowInputV4`.

Forward order:

1. additive tables/columns, constraints, RLS/grants, and RPCs;
2. v4-compatible shared types and execution readers;
3. deploy recovery and reconciliation readers while v4 writer/model activation remain off;
4. enable raw admission for the isolated cohort with a fake provider;
5. enable real dispatch only after the durable dispatch adapter is active; and
6. enable the ordinary-chat review affordance after 86/87 acceptance.

Rollback order:

1. disable ordinary-chat review visibility and new v4 admission;
2. disable new workflow dispatch;
3. keep v4 readers, settlement, recovery, cancellation, and terminalization deployed
   until admitted work drains or is explicitly terminalized;
4. retain additive schema and readers through their retention window; and
5. remove them only in a later migration after proving no active/retained v4 rows.

Flags stop new work; they do not reinterpret accepted v4 work as v3 or route it into
ordinary provider execution.

## 14. Retention and deletion

- The raw request, prepared context, plan, steps/results, stream projection/events,
  and non-cost workflow observations are protected through the active turn and for at
  least seven days after terminalization.
- Settled/released dispatch receipts are retained for at least 30 days after both the
  turn and dispatch are terminal.
- A dispatch reconciled from `uncertain` is retained for at least 90 days after
  reconciliation. Unresolved `dispatching | uncertain` rows are never deleted.
- Parent deletion cascades only after those row guards permit every protected child.
- Cleanup is service-only, independently batch-bounded per table, and returns counts.

This matches the current worker artifact/effect retention shape without pretending
provider cost rows are ordinary mutation effects.

## 15. Freeze checklist

- **Done 2026-09-14:** 83's closed role contract replaced the provisional report schema
  and output ceilings (sections 3, 4 and 7). 85 adds evidence-reference `kind`/`version`
  against the durable context. See the
  [Task 83 receipt](../technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).
- **Done 2026-09-14:** 84's receipt names are reconciled and its two-checkpoint proof
  exists (section 9).
- **Waived by DJ 2026-09-14:** accepting the 82/84 stabilization gate before freeze.
  The combined gate still precedes any writer or deploy.
- **Consumer acknowledgements, not freeze blockers:**
    - 86 constructs admission from the v4 request/hash rules; `pg_temp.admit` in the
      SQL contract test is the reference call.
    - 87 adopts the two-phase dispatch permit, token-authorized settlement, generation
      scoped stream with the resume RPC, and model-free fallback.
    - 88 renders from `projection.workflow` through reconciliation, with no table grant.
      Disagreement reopens this document through the 85 owner. Consumers must not change
      it on their own.

## 16. Implementation status (2026-09-14)

Implemented with every writer, dispatch, and recovery activation off:

- `supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql`:
    - SQL canonical JSON, hashing, and normalization helpers;
    - the v4 artifact branch and in-place guard patch of the two prepared validators;
    - the v4 insert validator;
    - the three workflow tables with transition, retention, RLS, and grants;
    - role-report and planner validation;
    - admission, context, plan, and step RPCs.
- `supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql`:
    - the pricing allowlist;
    - reserve/begin/settle/reconcile;
    - answer cursor, synthesis, and resume;
    - read-only recovery, terminal sync, and receipt cleanup.
- `packages/shared-types/src/agentic-chat-workflow-contract.ts`: constants, types,
  outcome unions, request/content hash builders, reservation formula, and
  `validateAgenticChatRawWorkflowInputV4`.
- `apps/worker/src/workers/agentic-chat/executionInput.ts`: the v4 refusal on the
  prepared path and `loadRawWorkflowInput()`.

Proof:

- `supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql` (self-contained
  disposable contract) runs five v4 turns and two ordinary turns through the real
  hosted artifact triggers. It is built on `supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql`,
  generated from read-only QA catalog extracts.
- `apps/worker/tests/agenticChatWorkflowV1.postgres.test.ts` runs that contract, then
  proves:
    - TS and SQL normalization, canonical JSON, policy, plan, and ceilings agree;
    - a TS-hashed Unicode admission verifies byte-for-byte;
    - concurrent duplicate admission creates one turn;
    - concurrent context acceptance has one winner;
    - concurrent reservations stop at the synthesis headroom;
    - concurrent settlement is idempotent.
- Both migrations are applied to the isolated QA database only (not production).

Amendments settled during implementation, reflected above:

1. Stream sequences stay generation-scoped. The resume RPC republishes durable truth
   and reseeds answer text; the claim path is unchanged.
2. Recovery clears `execution_started_at` and requeues; the next claim increments the
   generation.
3. Terminal workflow truth comes from a trigger on the existing terminal writer.
4. Evidence references match accepted evidence on `id` and `version`.
5. Workflow progress is `workflow_progress` in phase `llm`, nested at
   `projection.workflow`.
6. Worker-computed context, plan, and result hashes are shape-, size-, and
   binding-checked, not recomputed. Admission recomputes request, history, and content
   hashes.
7. The planner is a step; its accepted result binds the plan's specialist assignments.

Still owed before any user sees this:

- the combined 82+83+84+85 gate;
- consumer work in 86/87/88;
- applying both migrations to production before or with the first deploy that reads
  or writes v4.

Generated database types were not regenerated; the workflow tables are service-only
and read through the typed contract module.
