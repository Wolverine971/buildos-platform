<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md -->

# Agentic Chat Worker Migration: Phase 0 Contract Lock

**Date:** 2026-07-29

**Contract family:** `agentic_chat_worker_v1`

**Status:** Executable local contract revision .5 complete; final independent re-acceptance pending. Changes require a versioned contract update and proving-test update.

**Revision:** 2026-07-29.2 — added the typed error taxonomy, per-transition idempotency/reconciliation lock, session-bootstrap contract, transport-lease validation semantics, queue isolation topology, and publisher overflow semantics after external review. No previously pinned type, fixture, or hash changed.

**Revision:** 2026-07-29.3 — first-turn latency redesign (DJ-approved): the Realtime topic is per-user (`chat-user:<user_id>`, subscribed at chat-surface mount), the session is resolved-or-created inside the atomic admission transaction, and the separate session-bootstrap endpoint/claims table is removed. `CanonicalAdmissionRequestV1.sessionId` becomes nullable (new pinned fixture `cbbfbdf2…`), `AgentStreamEventV1` gains `session_id`, and the first text batch of each generation flushes immediately. Existing pinned hashes are unchanged.

**Revision:** 2026-07-30.4 — independent-audit response (`AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md`, F1–F23). Admission hash bumped to `agentic_chat_request_hash_v2`: client-recomputed state (`sessionId`, `lastTurnContext`, `projectFocus`) is no longer hashed — it is validated against the stored turn — and a client retry rule plus revised `idempotency_conflict` behavior are locked (F1). Input artifact bumped to `agentic_chat_input_v2` with `historySource` (F19). Sequence allocation moves inside the write RPC with one serialized writer slot per turn (F2). Session resolve-or-create is pinned (F4), the hash is computed by the web gateway (F5), the admission lock domain is per-user in both modes (F9), active-turn handle discovery/adoption is added (F8), chat queue timeouts and corrected capacity/sweeper values are locked (F11/F12), lease renewal/`JOINING`/token-refresh rules are added (F16/F17), and canonicalizer field sets are fixture-pinned (F13). New pinned digests: admission `7c29017b…`, artifact `8c7fcdbd…`; the .3 null-session fixture is superseded. Suite: 13 tests.

**Revision:** 2026-07-30.5 — re-audit response. Closes the two normative blockers the re-audit found in .4: the excluded-field validation rule no longer manufactures conflicts (non-null `sessionId` asserts, `null` asserts nothing, `lastTurnContext`/`projectFocus` are ignored on a duplicate hit — N1, which had re-opened F1), and §12's Realtime RLS instruction now specifies the per-user topic predicate (S1). Also: prepared-history divergence rule + named Phase 1 test (S3/F19), strengthened field-set fixtures that compare against the fixture's own keys (S2), `to_regclass`-guarded dynamic preflight counts plus `client_turn_id` format and duplicate-sample probes (S4/S5), hash-version deploy-window note (N7), legacy hash-compare stated (N6), and stale `request_hash_v1` labels, the orphaned §12 subject, the batch-RPC sequence wording, and the §15/§17 registers corrected (N2–N5). Suite still 13 tests, green.

**Retained target-database capture:** `docs/plans/evidence/agentic_chat_worker_phase0_preflight_prod_2026-07-30.json` — the revised preflight executed read-only against production on 2026-07-30. Key results: zero duplicates on all four hazard probes (per-session key, per-user key, running-per-session, active-per-session), so both new unique indexes can be added without resolving pre-existing rows; `client_turn_id` is UUID for all 592 non-null rows (no `admin_replay:` rows persisted, so P37's format hazard is latent, not present); and it authoritatively captured the F3 signal (`queue_jobs` authenticated INSERT true, `add_queue_job` `security_definer=false` with authenticated EXECUTE).

## Executable contract lock

The transport-neutral TypeScript source of truth is
`packages/shared-types/src/agentic-chat-worker-contract.ts`. Its fixture suite is
`packages/shared-types/src/agentic-chat-worker-contract.test.ts`.

The suite (13 tests as of revision .5) pins exact SHA-256 outputs for normalized admission requests and immutable input artifacts, proves excluded transport metadata AND client-recomputed state (`sessionId`/`lastTurnContext`/`projectFocus`) cannot affect the admission hash, pins the exact field set of every canonicalizer output so a type change cannot silently escape the hash, proves the newly admitted message is excluded from copied history, checks source-mutation isolation, locks generation-aware event identities, and executes the terminal-race decision table. These are contract fixtures, not substitutes for the Phase 2 database concurrency/fencing tests.

The repeatable read-only legacy database inventory is
`supabase/tests/20260729000000_agentic_chat_worker_phase0.preflight.sql`. Run it against each target before Phase 2 schema work and retain the JSON result with the migration evidence.

## Conventions

- IDs are lowercase UUID strings unless a type explicitly permits another format.
- Timestamps are UTC ISO-8601 strings.
- Optional transport fields are omitted; durable command/artifact fields use explicit `null` when absence is meaningful.
- JSON hashing uses UTF-8, SHA-256, lowercase hexadecimal output, recursively sorted object keys, array order preserved, `undefined` omitted, and explicit `null` preserved.
- Accepted user text converts CRLF/CR to LF, applies Unicode NFC, and trims only leading/trailing whitespace. Interior whitespace is preserved.
- Attachment arrays preserve `display_order`, then stable input order. History arrays preserve the database-selected deterministic order.
- Lease tokens, decision IDs, current rollout flags, selected execution mode, queue IDs, timestamps, and correlation IDs are excluded from the semantic admission request hash. So is client-recomputed state — `sessionId`, `lastTurnContext`, and `projectFocus` (hash v2).
- Excluded-field rules on a duplicate hit, which must never manufacture a conflict (the point of de-hashing them):
    - `sessionId` is an assertion **only when non-null**: a non-null value must equal the stored `session_id` or admission returns a typed conflict. `null` asserts nothing, so a byte-identical retry of a create-inline send — which still carries `null` while the stored turn now has a real session — resolves to the existing turn and returns its session.
    - `lastTurnContext` and `projectFocus` are **ignored** on a duplicate hit: the first admission's frozen values win, and a later divergence is never a conflict source.
- Client retry rule: the client caches the exact admission request body of a pending send and resends it byte-identically until it holds a durable turn handle or a terminal rejection. It never regenerates ids or rebuilds any part of the request from live state for a retry.
- The web gateway (server code) canonicalizes and computes `request_hash` with the pinned TypeScript implementation and passes it to the admission RPC, which compares and stores but never recomputes it. The browser never supplies a hash. (A PL/pgSQL canonicalizer is not equivalent: `jsonb` orders keys by length-then-bytes, so it cannot reproduce the pinned digests.)

## Versioned command and input artifact

The queue payload is intentionally only an identifier envelope:

```ts
type AgenticChatTurnJobV1 = {
	turnRunId: string;
	correlationId: string;
};

type NormalizedChatAttachmentV1 = {
	attachment_kind: 'onto_asset' | 'temporary_file';
	media_type: 'image';
	asset_id: string | null;
	temporary_attachment_id: string | null;
	project_id: string | null;
	role: 'attachment' | 'analysis_target';
	display_order: number;
	file_name: string | null;
	content_type: string | null;
	file_size_bytes: number | null;
	width: number | null;
	height: number | null;
	checksum_sha256: string | null;
	ocr_status: string | null;
	extraction_summary: string | null;
	extracted_text_preview: string | null;
};
```

The authoritative command is loaded from the turn row and its immutable input artifact:

```ts
type ChatTurnCommandV1 = {
	commandVersion: 'agentic_chat_turn_v1';
	turnRunId: string;
	sessionId: string;
	userId: string;
	streamRunId: string;
	clientTurnId: string;
	correlationId: string;
	executionMode: 'worker_realtime';
	transportContractVersion: 'agentic_chat_worker_v1';
	transportDecisionId: string;
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	userMessageId: string;
	userMessage: string;
	attachments: NormalizedChatAttachmentV1[];
	projectFocus: Record<string, unknown> | null;
	lastTurnContext: Record<string, unknown> | null;
	voiceNoteGroupId: string | null;
	requestHash: string;
	historyCutoffAt: string;
	historyMessageIds: string[];
	preparedPromptId: string | null;
	inputArtifactId: string;
	staleContextPolicy: 'fail_after_max_queue_residence';
	requestPayloadVersion: 'agentic_chat_request_v1';
	requestPayload: Record<string, unknown>;
};

type TurnInputArtifactV1 = {
	artifactVersion: 'agentic_chat_input_v2';
	// prepared-prompt history carries no source message ids; the exclusion filter
	// and history_message_ids lineage apply only to 'admission_window' artifacts
	historySource: 'admission_window' | 'prepared_prompt';
	history: FrozenHistoryMessageV1[];
	prepared: {
		sourcePreparedPromptId: string | null;
		contextPayload: Record<string, unknown>;
		conversationSummary: string | null;
		surfaceProfile: string;
		systemPrompt: string;
		promptSections: Record<string, unknown>[];
		toolSurface: Record<string, unknown>;
	};
	createdAt: string;
	retainUntil: string;
	contentHash: string;
};

type FrozenHistoryMessageV1 = {
	sourceMessageId: string | null;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	attachments: NormalizedChatAttachmentV1[];
	toolCalls: Record<string, unknown>[];
	toolCallId: string | null;
};
```

`contentHash` hashes the artifact without `contentHash`, `createdAt`, or `retainUntil`. The worker verifies version, hash, total byte limit, user/session relationships, and active-turn reference before provider work. It never reloads source `chat_messages` or `agentic_chat_prepared_prompts` for execution.

## Canonical admission request hash

`request_hash_v2` hashes this exact semantic object after gateway normalization:

```ts
type CanonicalAdmissionRequestV1 = {
	version: 'agentic_chat_request_hash_v2';
	clientTurnId: string;
	streamRunId: string;
	context: {
		type: string;
		entityId: string | null;
		projectId: string | null;
	};
	message: string;
	attachments: NormalizedChatAttachmentV1[];
	voiceNoteGroupId: string | null;
	preparedPromptLineage: {
		id: string | null;
		acceptedSurfaceProfile: string | null;
	};
};
```

The hashed command covers only user-authored/user-chosen fields. `sessionId` (null when no session exists yet), `lastTurnContext`, and `projectFocus` still travel on the admission request but are excluded from the hash and handled by the excluded-field rules in Conventions — non-null `sessionId` asserts, `null` asserts nothing, and the other two are ignored on a duplicate hit. Field sets of every canonicalizer output are fixture-pinned so a type change cannot silently escape the hash.

Duplicate lookup occurs before active-turn and pressure checks. Matching `(user_id, client_turn_id)` plus hash returns the stored turn/mode/handle, including a session created by the original admission; a **non-null** supplied `sessionId` that does not equal the stored `session_id` is a typed conflict, while `null` asserts nothing. A hash mismatch returns `idempotency_conflict` with no prompt claim, message, turn, or queue side effect — and the client's response to it is to resolve the existing turn by `(user_id, client_turn_id)` and reconcile, never to mint a new client turn id.

## Transport-neutral event contract

`AgentSSEMessage` remains a compatibility alias during migration. New code uses:

```ts
type AgentStreamEventV1<TPayload extends { type: string } = { type: string }> = {
	contract_version: 'agentic_chat_worker_v1';
	event_id: string; // <turn_run_id>:<execution_generation>:<sequence_index>
	stream_run_id: string;
	client_turn_id: string;
	session_id: string; // required for per-user-topic multiplexing across sessions/tabs
	turn_run_id: string;
	execution_generation: number;
	sequence_index: number; // starts at 1 for each generation
	phase: 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';
	event_type: TPayload['type'];
	durable: boolean;
} & TPayload;
```

Rules:

1. A successful claim increments the generation and resets that generation's stream state and next sequence to 1 atomically. Legacy/backfilled turns use generation 0; the first worker claim uses generation 1.
2. The event writer validates current generation, allowed status, and ownership in the same database statement as the write. Sequence numbers are allocated INSIDE the write RPC (`last_event_sequence = last_event_sequence + 1 RETURNING`), never asserted by the caller — a caller-supplied sequence is not part of the contract.
3. All durable writes for a turn — text batches, semantic events, and projection updates — pass through one serialized per-turn in-flight slot. "At most one flush in flight" applies to the union of writers, not to text alone; the immediate first-text flush obeys the same slot.
4. User-visible text and all semantic events persist before Broadcast.
5. `done` is created only by the terminal finalizer.
6. A stale/rejected persistence result is never Broadcast; a rejected write's text remains in the accumulator and is retried by the same writer slot, so no durable prefix is lost.

## Snapshot and reconciliation contract

```ts
type TurnSnapshotV1 = {
	contract_version: 'agentic_chat_worker_v1';
	turn_run_id: string;
	// both transports implement reconcile(); legacy snapshots carry 'legacy_sse'
	execution_mode: 'worker_realtime' | 'legacy_sse';
	execution_generation: number;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	text: string;
	projection: Record<string, unknown>;
	snapshot_sequence: number;
	durable_through_sequence: number;
	projection_durable_sequence: number;
	durable_events: AgentStreamEventV1[];
	response_watermark: number;
	reconcile_required: boolean;
	assistant_message: Record<string, unknown> | null;
	terminal_event_id: string | null;
	updated_at: string;
};
```

A stale requested generation returns a complete current-generation snapshot and ignores the stale cursor. Reconciliation reads one generation-consistent transaction view. The client buffers live events while reconciling, replaces prior-generation state, applies the snapshot, applies returned durable events, then applies buffered events newer than the response watermark.

## Signal and cancellation contract

```ts
type ChatTurnSignalV1 = {
	signalVersion: 'agentic_chat_signal_v1';
	id: string;
	turnRunId: string;
	kind: 'cancel';
	reason: 'user_cancelled' | 'superseded' | 'timeout' | 'operator_cancelled';
	source: 'browser' | 'worker' | 'operator' | 'sweeper';
	createdAt: string;
	consumedAt: string | null;
	consumedByGeneration: number | null;
};

type CancelTurnResultV1 =
	| { outcome: 'cancel_requested' }
	| { outcome: 'cancelled'; status: 'cancelled'; terminalEventId: string }
	| {
			outcome: 'already_terminal';
			status: 'completed' | 'failed' | 'cancelled';
			terminalEventId: string;
	  }
	| { outcome: 'legacy_abort_requested' };
```

Queued/unclaimed cancellation cancels the queue row and terminalizes in one transaction. Running cancellation sets the first accepted cancel request and inserts/resolves one signal. The UI enters `stopping` for a nonterminal acknowledgement and waits for terminal live/reconcile evidence.

Batched cancel observation query shape: one RPC per consumer interval accepting an array of `(turn_run_id, execution_generation)` pairs (bounded per the operating-values table; startup fails if the bound is below configured consumer concurrency). It returns only rows with an accepted cancel request whose generation is still current; stale-generation pairs return nothing. The worker fans results out to local AbortControllers; no per-turn timers or queries.

Supersede proof requirement: the replacement turn may be admitted only after durable terminal evidence of the predecessor — a terminal live event or a reconciliation snapshot with terminal status — never a timer expiry or an HTTP acknowledgement alone.

## Transport lease and handle

```ts
type AgentChatTransportLeaseV1 = {
	mode: 'legacy_sse' | 'worker_realtime';
	contractVersion: 'agentic_chat_worker_v1' | 'legacy_internal_v1';
	decisionId: string;
	token: string;
	expiresAt: string;
};

type TurnHandleV1 =
	| {
			contractVersion: 'legacy_internal_v1';
			executionMode: 'legacy_sse';
			streamRunId: string;
			clientTurnId: string;
			sessionId: string | null;
			turnRunId: string | null;
	  }
	| {
			contractVersion: 'agentic_chat_worker_v1';
			executionMode: 'worker_realtime';
			streamRunId: string;
			clientTurnId: string;
			sessionId: string;
			turnRunId: string;
	  };
```

The signed lease is bound to authenticated user, client turn, stream run, normalized context hash, audience, contract, mode, kill epoch, issue time, and expiry. Raw tokens are neither logged nor persisted. A stored turn always wins over current rollout flags during renegotiation.

### Lease token validation semantics

- Token format: compact `base64url(claimsJson).base64url(signature)` where the signature is HMAC-SHA256 over the canonical (recursively key-sorted, per Conventions) claims JSON using a server-only secret. Claims: `sub` (user id), `aud = 'agentic-chat-transport'`, `mode`, `contractVersion`, `decisionId`, `clientTurnId`, `streamRunId`, `contextHash`, `killEpoch`, `iat`, `exp`.
- Verification order at `/stream` and `/turns`, before any durable write: signature → audience/contract support → expiry → kill epoch (worker mode only) → binding match (authenticated user, `clientTurnId`, `streamRunId`, context hash, mode matches the called route). Only then does the duplicate-first admission path run.
- Failure mapping: bad signature, wrong audience, or binding mismatch → `lease_invalid`. Expired lease or stale kill epoch → `transport_renegotiate`; renegotiation supplies the prior `decisionId` and the stored turn always wins over current flags.
- Secret rotation accepts the current and previous key for at least one lease TTL. The kill epoch is a server-side monotonic value embedded in claims at issue; worker-mode validation rejects a lower epoch, and rotation never affects admitted turns.

## Session-inline admission and channel lifecycle

Supersedes the revision-.2 session-bootstrap contract; there is no bootstrap endpoint, RPC, or claims table.

- **Topic:** `chat-user:<user_id>`, private Broadcast, subscribed once at chat-surface mount. Realtime RLS authorizes subscribe when the topic's user id equals `auth.uid()`; service role publishes. All of a user's sessions multiplex on this one channel; every event carries `session_id` and `turn_run_id`, and clients ignore events for turns they do not hold a handle for.
- **Readiness is a standing invariant, not a send-time handshake.** The channel is expected `SUBSCRIBED` long before Send. On Send the client checks channel state; only if the channel is down does it prove authenticated polling readiness before admitting. Admission is never blocked on a per-send subscribe round trip.
- **Session creation is pinned (F4):** admission accepts `sessionId: string | null`. `sessionId: null` means CREATE a new session from the validated context target inside the same transaction — after the capacity gate, before any other write — with exactly one exception: `context_type = 'daily_brief'` first resolves its existing canonical session, and that lookup must be made race-safe (a unique canonical key or the per-user advisory lock, not a best-effort `limit 1`). No other context ever resolves-by-context: two tabs starting fresh chats on the same project intentionally get two sessions. Uniqueness is enforced by `(user_id, client_turn_id)`; concurrent duplicate first-turn admissions race to exactly one session and one turn under the per-user advisory lock.
- **Active-turn handle discovery and adoption (F8):** `GET /turns?session_id=<id>` returns the `TurnHandle` of an owned queued/running turn (empty when none). A client that lost its handle — page reload, second tab — adopts the returned handle and must then apply that turn's events and reconcile. The "ignore events for turns you hold no handle for" rule always has this recovery path; a reload during a running turn resumes live output, which is a named proving test.
- **Lease renewal and readiness edges (F16/F17):** the client renews a lease before Send when its remaining TTL is below a renewal threshold (background-tab timer throttling makes expiry-at-Send common, and the renewal races the send otherwise). A context switch while drafting abandons the pending lease and negotiates a fresh one — it is a normal action, not a `lease_invalid` client bug. At Send, channel state `JOINING` admits immediately (lossless reconciliation plus the watchdog cover the join window); only `CLOSED`/`CHANNEL_ERROR` require the polling-readiness fallback. The mounted channel re-authenticates on `TOKEN_REFRESHED` and treats auth expiry as not-ready.
- **No orphan sessions:** if admission fails or is rejected, the transaction rolls back and no session persists. There is no separate session-cleanup obligation for failed sends.
- **Lease prefetch:** the client requests the transport lease at compose time (first keystroke), retains its ids, and silently renews on TTL expiry while drafting. Send performs no lease round trip in the common case.

## Mutation effect contract

```ts
type ChatTurnEffectState =
	| 'reserved'
	| 'started'
	| 'succeeded'
	| 'failed'
	| 'cancelled'
	| 'uncertain';

type ChatTurnEffectReservationV1 = {
	effectId: string;
	turnRunId: string;
	executionGeneration: number;
	sessionId: string;
	userId: string;
	toolName: string;
	operationName: string;
	canonicalArgumentHash: string;
	providerToolCallId: string | null;
};

type ChatTurnEffectReceiptV1 = {
	effectId: string;
	state: ChatTurnEffectState;
	downstreamIdempotencySupported: boolean;
	downstreamReceipt: Record<string, unknown> | null;
	startedAt: string | null;
	finishedAt: string | null;
};
```

The runtime generates and remembers `effectId` before reservation. Duplicate reserve/begin with the same effect and argument hash returns existing state; a different hash is a hard conflict. Only fenced `reserved -> started` sets `irreversible_boundary_at`, and only that caller invokes the adapter.

## Turn state and ownership transitions

| From     | Operation                            | To        | Allowed owner            | Database predicate/fence                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------ | --------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none     | worker admission                     | queued    | web service              | Per-user advisory lock (F9); duplicate-first hash check; no active queued/running turn; per-user cap; capacity open.                                                                                                                                                                     |
| none     | legacy admission                     | running   | web service              | Per-user advisory lock — the same lock domain as worker admission, so the two modes mutually exclude during canary (F9); duplicate-first hash check; no active queued/running turn. A 23505 on the active-turn index maps to typed `active_turn_conflict`, never a raw constraint error. |
| queued   | claim                                | running   | chat worker service      | Queue processing token owns job; turn still queued; no accepted cancel; generation increments atomically.                                                                                                                                                                                |
| queued   | cancel                               | cancelled | web service              | Turn queued and queue job still cancellable; terminal finalizer owns projection/event.                                                                                                                                                                                                   |
| running  | progress/event/checkpoint/tool write | running   | current executor         | Current processing token, generation, predecessor status, and relationship checks in the write statement.                                                                                                                                                                                |
| running  | request cancel                       | running   | web service              | First accepted cancel timestamp/reason plus one signal.                                                                                                                                                                                                                                  |
| running  | complete                             | completed | current executor         | Current generation/owner, status running, `cancel_requested_at is null`; one terminal CAS.                                                                                                                                                                                               |
| running  | fail                                 | failed    | current executor/sweeper | Current generation/owner and typed retry/recovery decision; one terminal CAS.                                                                                                                                                                                                            |
| running  | acknowledge cancel                   | cancelled | current executor/sweeper | Accepted cancel or timeout policy; one terminal CAS.                                                                                                                                                                                                                                     |
| terminal | repeat finalize/cancel               | unchanged | any authorized caller    | Return the committed terminal record; never rewrite it.                                                                                                                                                                                                                                  |

## Per-transition idempotency and reconciliation lock

Companion to the transition table above. Every transition names the key that makes a repeat safe and the mechanism that repairs a lost response.

| Transition                             | Idempotency key                                                                                                                                 | Reconciliation mechanism                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Worker admission                       | `(user_id, client_turn_id)` + `request_hash_v2` (session may be created inline; `(session_id, client_turn_id)` uniqueness also retained)        | Duplicate-first lookup returns stored identities/mode/session; hash mismatch → `idempotency_conflict` |
| Legacy admission                       | Same key; the gateway computes and compares `request_hash_v2` identically, so a legacy duplicate resolves by hash rather than by presence alone | Same duplicate-first return, without a queue row                                                      |
| Claim (queued → running)               | Queue dedup `agentic-chat-turn:<turn_run_id>` + processing token; generation increment is single-winner                                         | Chat-specific stalled recovery decides from boundary fields; never generic requeue                    |
| Queued cancel                          | First accepted cancel wins per turn                                                                                                             | Repeat returns the committed terminal record (`already_terminal`)                                     |
| Running event/snapshot/tool writes     | Event identity `<turn_run_id>:<generation>:<sequence>` + unique index                                                                           | Snapshot + independent durable-cursor reconciliation RPC                                              |
| Cancel request on running              | First accepted `cancel_requested_at`; signal insert-or-resolve                                                                                  | Repeat returns `cancel_requested` or the terminal outcome                                             |
| Terminal complete/fail/cancel          | One CAS finalizer per `turn_run_id`; unique `terminal_event_id`                                                                                 | Repeat finalize returns the committed terminal record                                                 |
| User/assistant message writes          | `chat-turn:<turn_run_id>:user` / `:assistant`                                                                                                   | Message idempotency unique index resolves duplicates                                                  |
| Effect reserve/begin                   | `effect_id` + canonical argument hash                                                                                                           | Same-key query/retry returns the existing receipt; different hash is a hard conflict                  |
| Queue completion after domain terminal | Queue row by job id                                                                                                                             | Recovery reconciles the queue row to the terminal domain result; never re-executes                    |

## Terminal race truth table

| First committed decision       | Later request           | Result                                                      |
| ------------------------------ | ----------------------- | ----------------------------------------------------------- |
| Cancel request on running turn | Complete/fail finalizer | Complete/fail CAS is rejected; worker finalizes cancelled.  |
| Completed finalizer            | Cancel                  | `already_terminal(completed)`; no new signal/event/message. |
| Failed finalizer               | Cancel                  | `already_terminal(failed)`; no rewrite.                     |
| Cancelled finalizer            | Complete/fail/cancel    | Return existing cancelled terminal record.                  |
| Queued cancel finalizer        | Worker claim            | Claim fails; no provider work.                              |

Completed creates exactly one assistant message. Failed/cancelled creates at most one nonempty partial assistant message. Queued cancellation creates no blank assistant message. The assistant message, terminal projection/event, status/reason, timestamps, and terminal identity commit together before Broadcast.

## Retry/recovery decision table

| Boundary                                               | Automatic retry                  | Rule                                                                                                                  |
| ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Before `execution_started_at`                          | Yes, only typed transient        | New claim receives a new generation.                                                                                  |
| After `execution_started_at`, no effect reserved       | No by default                    | Only an explicitly classified safe retry may proceed. Unknown/timeout is terminal/recoverable, not generic transient. |
| Effect reserved but not started                        | Turn retry remains policy-gated  | Reservation can be cancelled/abandoned; irreversible boundary is still null.                                          |
| Effect started with queryable/idempotent downstream    | Effect reconciliation/retry only | Reuse the same `effect_id`; do not blindly replay the whole turn.                                                     |
| Effect started without queryable/idempotent downstream | No                               | Mark `uncertain`; require reconciliation/user action.                                                                 |
| Domain turn terminal, queue row processing             | No execution                     | Reconcile the queue row to the terminal domain result.                                                                |

`agentic_chat_turn` is excluded from the generic stalled reset/requeue path — and the exclusion is bidirectional (F11): `reset_stalled_jobs` gains a job-type include/exclude parameter, each consumer instance passes only its own registered types, and the chat consumer's stalled timer therefore cannot requeue general jobs either.

## Typed error taxonomy (`agentic_chat_error_v1`)

The retry table's "typed transient" and every typed response in the plan resolve to this enumeration. The governing rule inverts the general queue default: **only codes explicitly marked retryable ever retry; an unmapped error is non-retryable.**

Admission/API surface:

| Code                         | HTTP                  | Meaning                                                                  | Client behavior                                                                                         |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `validation_failed`          | 400                   | Malformed request, attachments, or unsupported contract payload          | No retry                                                                                                |
| `unauthorized` / `not_found` | 401/404               | Auth or ownership failure                                                | No retry                                                                                                |
| `lease_invalid`              | 403                   | Signature, audience, or binding verification failure                     | Renegotiate; repeated failure is a client bug                                                           |
| `transport_renegotiate`      | 409                   | Lease expired or kill-epoch rejected                                     | Obtain a new lease, retain ids, re-attempt                                                              |
| `idempotency_conflict`       | 409                   | Same `(user_id, client_turn_id)` with different canonical hash           | Resolve the existing turn by `(user_id, client_turn_id)` and reconcile; never mint a new client turn id |
| `active_turn_conflict`       | 409                   | Another queued/running turn owns the session (existing id/mode returned) | Resume or await the existing handle                                                                     |
| `capacity_exceeded`          | 429/503 + Retry-After | Hard cap or soft pressure close; nothing was written                     | Retry after delay; duplicates still resolve                                                             |

Execution outcome classification (queue/worker surface):

| Class                       | Examples                                                             | Automatic retry                                        |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| `transient_infra`           | Database unavailable, claim race, pre-start Realtime publish failure | Yes, pre-start only, with backoff                      |
| `provider_throttle`         | Provider 429/5xx before `execution_started_at`                       | Yes, pre-start only, with backoff                      |
| `timeout_pre_start`         | Claim-to-start deadline exceeded                                     | Yes, once, new generation                              |
| `permanent`                 | Validation, artifact integrity/missing, unauthorized scope           | No; terminal `failed`                                  |
| `stale_context`             | Maximum queue residence exceeded                                     | No; terminal `failed`, readmission required            |
| `publisher_overload`        | Hard pending bound reached with unrecoverable persistence            | No; terminal `failed`, accumulated text preserved      |
| `timeout_post_start`        | Wall-clock exceeded after `execution_started_at`                     | No; terminal via cancel/fail policy                    |
| `cancelled`                 | User, supersede, timeout, operator                                   | Terminal `cancelled`                                   |
| `uncertain_external_commit` | Effect started, no queryable/idempotent downstream receipt           | Never; reconcile by `effect_id`                        |
| `unknown`                   | Anything unmapped, pre- or post-start                                | Never; terminal/recoverable via chat-specific recovery |

`failure_code` stores the internal class; `finished_reason` stays user-safe and never leaks provider detail.

## Queue isolation topology lock

- `agentic_chat_turn` is registered on exactly one dedicated chat consumer (its own `SupabaseQueue` instance filtered to that job type). It is never registered on the general queue instance.
- The general consumer's claim call excludes `agentic_chat_turn`; the chat consumer claims nothing else. A Phase 2 fixture proves cross-pool claims are zero in both directions.
- Chat configuration — `CHAT_CONCURRENCY`, `CHAT_POLL_INTERVAL_MS`, `CHAT_WORKER_TIMEOUT_MS`, `CHAT_STALLED_TIMEOUT_MS`, drain budget — is never derived from `QUEUE_BATCH_SIZE` or module-global `queueConfig`. Prerequisite refactor: the shared queue class must accept retry limits, timeout resolution, and stalled policy as instance/processor inputs before Phase 3, because today it reads module globals on the execute/fail paths.
- The batched text flush and batched cancel observer are services owned by the chat consumer; their timers stop during drain and reject new work after shutdown begins.
- Health: the process is unhealthy if either required consumer is wedged; dashboards report chat slots separately. Phase 6 moves the same consumer/entrypoint into a dedicated service with no semantic change.

## Publisher overflow semantics

Normal operation: one bounded accumulator per active turn, one worker-level flush loop, at most one persistence flush in flight per turn, adjacent text merged while a flush is pending. Broadcast follows only accepted database writes.

Escalation ladder (thresholds in the operating-values table):

1. **Soft high-water (per-turn or worker-wide):** merge text more aggressively, pause provider consumption where the adapter supports it, emit pressure metrics.
2. **Realtime degraded, persistence healthy:** discard redundant live text/progress broadcasts only; keep persisting; set `reconcile_required` on the projection and attempt a rate-limited hint. Durable writes, tool events, cancellation, and terminal state are never discarded. The client's reconcile watchdog guarantees convergence.
3. **Hard bound with unrecoverable persistence and an unpausable provider:** deliberately abort generation and finalize through the terminal CAS with `publisher_overload`, handing the finalizer the complete accumulated text including any unflushed batch. Never allocate past the hard bound, never drop a persisted prefix silently, never report `completed`.

Terminal Broadcast uses the bounded post-commit retry budget from the operating-values table, then relies on reconciliation. `reconcile_required` clears per the operating-values rule.

## Initial bounded operating values

These values are locked for Phase 2 fixtures and the Phase 3 internal slice. A change before wider rollout must update this document and its load/failure test.

| Value                                                      | Initial setting                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active turns per session                                   | 1 across queued + running                                                                                                                                                                                                 |
| Active worker turns per user across sessions               | 1 running + 2 queued internally; a per-user cap never exceeds its system cap (F12)                                                                                                                                        |
| `CHAT_CONCURRENCY`                                         | 1 default; 2 only after the Phase 3 smoke                                                                                                                                                                                 |
| Turn wall-clock limit                                      | 285 seconds                                                                                                                                                                                                               |
| Maximum queue residence before typed stale-context failure | 300 seconds                                                                                                                                                                                                               |
| Transport lease TTL                                        | 60 seconds                                                                                                                                                                                                                |
| Subscribe readiness timeout                                | 5 seconds, then authenticated polling readiness                                                                                                                                                                           |
| Supersede terminal wait                                    | 15 seconds before UI reports `still_stopping`; it does not admit afterward until terminal                                                                                                                                 |
| `CHAT_WORKER_TIMEOUT_MS` / `CHAT_STALLED_TIMEOUT_MS` (F11) | 360s / 420s, with the startup-asserted ordering invariant `CHAT_STALLED > CHAT_WORKER > 285s wall clock + finalize margin`; never derived from general-queue values                                                       |
| Batched cancel observation                                 | Every 500 ms; one RPC per consumer interval                                                                                                                                                                               |
| Cancel observer RPC bound                                  | 128 pairs; startup requires bound >= configured consumer concurrency                                                                                                                                                      |
| Worker progress heartbeat / stale sweep                    | Heartbeat every 15s; sweep every 30s. Per state (F12): `running` uses a 60s `last_progress_at` no-progress threshold plus 60s grace past the 285s wall clock; `queued` is judged only by the 300s maximum queue residence |
| Text flush trigger                                         | First text batch of each generation flushes immediately; then 200 ms or 4 KiB, plus phase/terminal flush                                                                                                                  |
| Per-turn publisher soft/hard pending bytes                 | 128 KiB / 512 KiB                                                                                                                                                                                                         |
| Worker-wide publisher soft/hard pending bytes              | 4 MiB / 16 MiB                                                                                                                                                                                                            |
| Full supported assistant output                            | 2 MiB UTF-8; spill to ordered chunks at 512 KiB; never truncate prefix                                                                                                                                                    |
| Terminal Broadcast retry                                   | At most 3 attempts within 2 seconds after commit                                                                                                                                                                          |
| Active reconcile watchdog                                  | 2 seconds with jitter; back off to 5 seconds when unchanged                                                                                                                                                               |
| `reconcile_required` clearing                              | Clear after durable backlog flush plus a later successful Broadcast attempt; client trusts a `false` snapshot                                                                                                             |
| Input artifact maximum                                     | 2 MiB canonical JSON, of which normalized history is at most 256 KiB                                                                                                                                                      |
| Input freshness policy                                     | Use only the frozen artifact up to maximum queue residence; then fail `stale_context` and require readmission                                                                                                             |
| Prepared prompt ordinary cleanup                           | Existing 10-minute post-expiry/consume window, but never delete an active referenced input                                                                                                                                |
| User-channel readiness at Send                             | Pre-subscribed at mount; >= 99% of sends see `SUBSCRIBED`; fallback readiness check only on channel failure                                                                                                               |
| Terminal stream/event/input-artifact retention             | 7 days; active references are never cleaned                                                                                                                                                                               |
| Effect retention                                           | 30 days terminal; 90 days for `uncertain` after explicit reconciliation policy review                                                                                                                                     |
| Internal hard caps (F12)                                   | `max_running = 2`, `max_queued = 20` while rollout is internal (stated per state; "active" for the one-turn invariant still means queued + running)                                                                       |
| Target-scale hard caps                                     | `max_running = 100`, `max_queued = 200`, enabled only after Phase 7 evidence                                                                                                                                              |
| Soft pressure close                                        | Oldest queued age >= 5 seconds or publisher/provider pressure above its configured soft limit                                                                                                                             |
| Pressure response                                          | Typed 429/503 with `Retry-After: 2`; duplicate resolution remains available                                                                                                                                               |
| Emergency kill epoch                                       | Monotonic; rotation rejects only unused worker leases; admitted turns keep their stored mode                                                                                                                              |
| Mutating tool rollout                                      | Disabled in Phase 3; every tool needs an idempotency/queryability matrix entry before Phase 4 enablement                                                                                                                  |
| Canary soak minimums                                       | Developers 24h; internal 48h; 1%/10% 48h each; 25%/50% 72h each; 100% worker routing 7d                                                                                                                                   |
| Quality parity tolerance                                   | Zero hard regressions; no required pass becomes fail; fuzzy mean drop <= 0.25/5 and pass-rate drop < 5pp                                                                                                                  |

Provider-specific concurrency starts equal to `CHAT_CONCURRENCY=1`. Raising it requires measured 429/5xx, memory, and latency evidence; no provider cap silently defaults above worker concurrency.

## Rollback lock

- Schema changes through Phase 7 are additive.
- Deploy order is database, dual-compatible shared code, worker, then web routing flag.
- Rollback disables new worker leases, drains the worker, and leaves additive schema in place.
- Existing/admitted turns keep their immutable stored mode. No rollback path replays a worker turn through SSE.
