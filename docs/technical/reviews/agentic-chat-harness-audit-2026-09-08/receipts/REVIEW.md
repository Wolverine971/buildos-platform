<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/REVIEW.md -->

# Adversarial review — agentic chat harness audit iteration (2026-09-10)

Scope: the unstaged diff of `apps/worker`, `packages/agentic-chat-runtime`, `apps/web/src/lib/services`
(97 files, +6,123 / −4,472) read against the seven implementer receipts and `INTEGRATION.md`.
Read-only: no edits, no test runs. Every finding below was verified by reading the working-tree code
at the cited lines, not the receipts. Blockers first, then majors, then minors, then what was checked
and found sound.

Verdict: **no blocker; three majors that should be fixed before the tree is merged or the 09-04
battery is rerun** (F56 partial-completion lane, F39 tool-free forcing, F33 email description vs.
mount), plus five minors.

## Majors

### 1. F56 partial-completion lane finalizes `completed` with a false "Not yet …" disclosure when the mutation ledger write fails after the effect committed

`apps/worker/src/workers/agentic-chat/turn-executor.ts:877-902` (condition at `:882`),
`:1485-1509` (`persistMutation`), `:2721-2730` (disclosure source).

`PARTIAL_COMPLETION_FAILURE_CLASSES` now includes `transient_infra` and `unknown`, and the old
`providerBudget.signal.aborted` conjunct is gone. The disclosure ("Done: N of M … Not yet moved: …")
is computed by `enforceAgenticChatTerminalTextIntegrityV1` from `terminalContext.toolExecutions`,
and a mutation is only appended to that list (`recordTerminalToolExecution`, `:1515`) **after**
`persistMutation` (`:1485`) succeeds. `persistMutation` is awaited on a fresh signal with no wrapper,
so `AgenticChatToolExecutionTimeoutError` (`tool_execution_persist_timeout`, class `transient_infra`,
`toolExecution.ts:111-113`) or any PostgREST error (class `unknown`, `classifyFailure` `:3705`)
thrown there reaches the outer catch with the effect already committed by `mutation.execute`.

Failure scenario: a two-move contract. Move 1 commits and lands in the ledger. Move 2 commits at
the gateway (`this.ports.mutation.execute` returns an `effectId`), then the `chat_tool_executions`
RPC times out. New behaviour: `transient_infra` ∈ set, not a fence loss, cancellation/overload not
aborted, `hasSuccessfulDurableEffects` true (move 1) → `finalizePartialAfterDurableWrites` →
`completed` / `mutation_unfulfilled` with the text "Done: 1 of 2 moves. Not yet moved: Task B."
while Task B **was** moved, and the pending contract carries Task B forward to be re-run next turn.
Old behaviour: `failed` with the generic error and DB recovery — lossy, but it never asserted a
false negative. The same shape applies to creates (a create receipt lost → "not yet created" → the
next turn creates a duplicate).

The verifier's docstring (`:2696` "read or ledger timeout") shows this was intended for the read
ledger, where it is harmless. Fix: exclude failures raised between a successful `mutation.execute`
and `recordTerminalToolExecution` from the partial lane — e.g. wrap `persistMutation` so its
rejection is tagged (or set a `terminalContext.uncertainTrailingEffect` flag) and add
`!terminalContext.uncertainTrailingEffect` to the condition at `:882`.

### 2. F39 tool-free forcing keys on "no completion continuation" instead of "every outcome fulfilled", stranding a partially executed same-kind create in the turn

`apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:844-859`, with
`incompleteApprovedContractResolution` at `:373-407` and `buildContractCompletionRequest` at
`review/contract-execution.ts:7-23`.

`takeContractCompletionContinuation` returns `null` in four cases, only one of which is "all
outcomes fulfilled": (a) `resolution.fulfilled`, (b) every unfulfilled outcome is already _touched_
by a successful write of the same kind (`:390-406` — deliberately, so a partially executed outcome is
never re-run _from the completion pass_), (c) `phase !== 'mutating'`, (d) `surfaceFor('completion')`
has no write tools. The new branch treats every `null` as "the shell is durable and no child outcome
is left" and forces `tools: []`, `toolChoice: 'none'` for the next pass.

Failure scenario: contract = create project + create task ×3 (one outcome, `minimum_successful_effects: 3`,
or three targetless task outcomes — `touched` matches any successful task create against every
targetless task-create outcome). Round 1 creates the shell; the completion continuation fires (task
outcomes untouched). Round 2: two `create_onto_task` succeed, the third fails at the adapter
(`known_mutation_failure`, e.g. bad assignee handle) and is fed back. `resolution.fulfilled` is
false but the task outcome is touched → `null` → the ledger holds `create_onto_project` → the next
request is tool-free. Before this diff the continuation kept the write surface
(`buildContinuationRequest` spreads the completion request's tools), so the model could retry the
third task with the feedback it just received (`findPermanentMutationFailureCap` bounds repeats).
Now the turn ends `mutation_unfulfilled` ("Done: 2 of 3") with a task the model was about to create.

Fix: gate the branch on the resolution itself — compute
`resolveTurnContractOutcome({ contract: turnContract, toolExecutions: turnToolExecutions }).fulfilled`
(or `unfinishedContractOutcomeDescriptions().length === 0`) rather than on `completionRequest === null`.
The 09-04 case-1 test still passes under that gate (its single outcome is fulfilled).

### 3. `request_email_account_connection` now describes itself as "present only because no Gmail account is connected yet", but the shipped web mount mounts it only for connected users

`packages/agentic-chat-runtime/src/catalog/definitions/email.ts:47-52` (new description) and
`apps/web/src/lib/services/agentic-chat-v2/email-surface-mount.server.ts:79-86`
(`applyEmailSurfaceMount`: `if (!hasConnection) return tools;` then mounts the union
`GATEWAY_EMAIL_SURFACE_TOOL_NAMES`, which still includes the handoff).

WP-B landed the catalog half of F33 and INTEGRATION.md records that the web half was applied and
then reverted (seven exact-surface pins). The tree therefore contradicts itself: the only users who
see the tool are connected users, and the tool tells them "any inbox, email, or 'connect my Gmail'
request starts here". This is exactly the prompt-vs-mount contradiction class the audit's F02 fixed
elsewhere.

Failure scenario: connected user, global turn, "what did Ana send me this week?". The surface
carries `search_email_messages` **and** a handoff whose description says every inbox request starts
with it. A weak model calls `request_email_account_connection(user_confirmed=false)` for the address
it guesses, and the turn ends asking the user to confirm connecting an account that is already
connected; the four read tools go unused. Before the diff the description said "Call
get_external_account_status first" and "an existing connection is returned instead", which at least
pointed a connected user at the status tool.

Fix: either apply WP-B handoff 4 (select through `getGatewayEmailSurfaceToolNames(hasConnection)`,
update the seven pins) or revert the `email.ts` description until the web half lands. Do not ship
one half.

## Minors

### 4. Read-saturation message at three read rounds no longer permits "the next required action"

`packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts:320-329` (new one-sentence
messages) versus the deleted count-ladder nudge in `repair-instructions.ts` (old `:710-720`: "Use the
existing results to answer, **or perform the next required action**"). The count floor now fires
`narrowing` at `readOnlyRoundCount >= 3` (`:57-64`, `turn-provider.ts:1013` passes
`readOnlyRoundCount`) with "Unless one specific missing fact remains, answer from the loaded
evidence." Case 8 (selective document edit) is exactly three sequential reads —
`search_project` → `get_document_outline` → `read_document_section` — followed by the write, so the
system message appended immediately before the write pass now tells the model to answer. The
write recipe and playbook in the system prompt still say to write; the ledger message is the last
instruction in the request. Suggest restoring the clause for the narrowing/saturated levels
("… answer from the loaded evidence, or perform the requested change now").

### 5. document_workspace playbook contradicts the `update_onto_document` description on `content`

`apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md:44`
("both need non-empty content") versus `mutationToolCatalog.ts:287-291` ("Required when
update_strategy is append") and `tool-validation.ts:423-429` (only append/merge requires content;
a replace-strategy title-only update passes). Scenario: "rename the Launch Plan doc to Launch Plan
v2" — the playbook makes the model read and resend the whole body (or refuse) for a rename that
`update_onto_document({ document_id, title })` already performs.

### 6. Civil-date rendering (F117) now shows the previous day for values stored at UTC midnight

`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts:3224-3228` (`formatLocalDate`)
renders every instant in the user's zone; `parseDate` (`:2975`) is `new Date(text)`. The worker's
own normalizers store date-only inputs at UTC midnight: `normalize_due_at_start_of_day`
(`mutation-argument-normalizers.ts:175-178`, used by `create_onto_milestone` / `update_onto_milestone`,
`mutationToolCatalog.ts:768, :806`) and the web executor's `'start'` boundary for `task.start_at`.
Scenario: America/New_York user says "add a milestone due Sept 11" → stored
`2026-09-11T00:00:00.000Z` → the next turn's prompt renders "due 2026-09-10 (tomorrow)"; the old
`toISOString().slice(0, 10)` rendered `2026-09-11`. The read path already projects instants this way
(`projectReadResultInstantsToTimezone`), and the cedar-house fixtures store NY end-of-day (so cases 4
and 14 improve: Sep 15 NY used to render as `2026-09-16`), so this is a storage-convention
interaction rather than a prompt bug — but it is user-visible for milestones and task start dates.
Worth an end-of-day normalizer for `due_at` on milestones, or a date-only fast path in the renderer.

### 7. F55 replays uncoded shared-read errors verbatim; the "raw driver messages never reach the model" claim holds only for errors that carry a `code`

`turn-executor.ts:3763-3767` returns `error.message` (≤ 2,000 chars) for `failureClass === 'permanent'`;
`execution-adapter.ts:761-770` (`sharedToolFailureClass`) classifies **any** thrown value without a
string `code` as `permanent`. A shared read that wraps a PostgREST failure in a plain `Error`
(`throw new Error(\`Failed to load …: ${error.message}\`)`) is therefore replayed to the model as-is,
including whatever row text the constraint or parser error echoed. Not a regression versus killing
the turn, but the receipt's invariant is narrower than stated; consider allow-listing the shared
implementations' own messages or capping to the first sentence.

### 8. A rejected private read after a durable write now ends `completed` instead of `failed`

Same `PARTIAL_COMPLETION_FAILURE_CLASSES` widening (`turn-executor.ts:882`): `read_tool_not_allowlisted`
/ `read_tool_context_invalid` are `permanent` and still terminate `executeReadTool` (`:2018-2031`
excludes them from recovery, as the survive list requires), but with one prior durable write the
outer catch now finalizes `completed` / `mutation_unfulfilled` with the partial disclosure rather
than `failed`. The fail-closed refusal to execute survives; only the terminal status of that turn
changed. Acceptable if intended — record it, since WP-E's tests cover the zero-write shape only.

## Checked and found sound (with the evidence)

- **Finding 11 addendum.** `provider/request-builders.ts` is not in the diff; `buildContinuationRequest`
  (`:240-300`) still appends every earlier tool message unchanged. Compaction runs once per result in
  `buildToolPayloadForModel` (`tool-payload-compaction.ts:178-233`) at the model boundary;
  `turnToolExecutions` / `terminalContext.toolExecutions` record `execution.result` uncompacted, so
  contract resolution, the write ledger, and the terminal-text floors are unaffected by the new
  document-receipt / task-list / overview compactors.
- **Direct-write floor.** `write-routing.ts` untouched; the new situational recipe
  (`situational-rules.ts:78`) matches `assessDirectWriteBatch` case-for-case (focused entity,
  single-hit read, user-typed UUID that a read loaded, `MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN = 3`).
- **SHA-bound approvals / fail-closed reviewer.** A failed `approve_turn_contract_review` result now
  flows back through F55 as a failed tool result instead of killing the turn, and
  `turn-provider.ts:903-923` maps it to `approvalResult = null` →
  `provider_turn_contract_review_identity_mismatch` (permanent). Still fail-closed.
- **Provider routing (item 5).** With `order: [pin]` and `allow_fallbacks: true`, a 404 means no
  endpoint in the model's pool serves the request, so `retryable: false` at
  `openrouter-client.ts:906-912` is model evidence; the pin is released by
  `observeTurnRouteFailure` (`:1032-1060`) and `applyTurnRouteHealth` (`:965-1010`) restores
  `fallbackModels`. `ignore` accumulation can still exhaust a pool inside one turn, but that is
  pre-existing and now narrower (only gateway-named or single-ordered timeouts are blamed,
  `:2129-2151`). The reviewer route no longer inherits `ignore: ['azure']` (`bootstrap.ts:503-510`),
  so Luna keeps its second endpoint.
- **F77 `routingModel`.** Pins and `lastResponse` hold configured ids only; usage receipts keep the
  snapshot id. A snapshot of a _fallback_ model resolves to `route.model` (the primary), which is
  cache-cold but never strands.
- **F50 / F67 detached effects.** `pendingEffects.ts` absorbs rejections, `drain` is bounded and
  never throws (`executorEffects.ts:127-140`), the executor drains before both fences
  (`turn-executor.ts:2620-2622`, `:2955-2958`), the client and executor default to the same singleton
  (no composition-root override; grep), tool steps run on `combined.signal` (not a per-call
  controller — `toolExecutionGraph.ts:359` passes `input.signal`), and the pass-count RPC
  (`20260828221405_…sql:124-153`) recounts distinct rounds rather than compare-and-setting a value,
  so concurrent `ended` receipts cannot race each other.
- **F19 ledger.** `toolRounds` is `readOnlyRoundCount` (reset on write rounds, untouched by control
  rounds), so the 3/6/8 floor and the `roundsRemaining <= 2` guard reproduce the deleted
  `selectReadLoopRepairEscalation` thresholds; the monotonic status reproduces the deleted
  `readLoopRepairRank`. Mixed research rounds now count toward the floor, as the old
  `readOnlyRoundCount` already did.
- **F06/F07 normalization (item 4).** `project_id` is in `NON_EFFECT_ARGUMENTS`
  (`write-ledger.ts:109-129`), so it was never a fulfillable postcondition for any action including
  `move_onto_task`; dropping it loses nothing the ledger could prove. Label drops are recorded as
  `normalization_notes` and only the reviewer-visible normalized contract changes.
- **F29 defaults.** `validateToolCalls` applies `default: []` from `request.tools` (the projected
  surface, `validation.ts:41-43`) before `validateDirectOpArgs` → `validateProjectCreateArgs`, and
  the adapter defaults a missing array (`createOntoProjectMutationAdapter.ts:196-206`).
- **F36.** `deferComplexWriteContractForInitialPass` keys on the admission-rendered
  `<pending_turn_contract>` system message, which `worker-turn-preparation.server.ts:673-681` pushes
  into the frozen history; `productionToolsFor` still force-mounts the gate pair for the legacy
  Project Setup artifact.
- **F12 sanitizer.** Separator-preserving re-join; unchanged lines are pushed byte-for-byte, so the
  `(?<=[.!?])(?=[0-9])` boundary cannot damage decimals unless a sibling sentence was dropped, and
  then the empty captured separator re-joins them.
- **F13 guard.** The new opener pattern is strictly narrower than the old three; the pre-existing
  "lead-in + real answer under 260 chars" replacement is unchanged in kind.
- **F118 / F69 / F44 (web).** Interrupted-turn summary drops control rows and renders successful
  writes as one line each; the loaded-skills ledger no longer rides the prompt; the checkpoint
  service had zero callers. The prewarm route test that still expects the ledger is the one known
  red test (routes/\*\*, not in scope).
- **Test flips.** Every flipped assertion I checked (`allow_fallbacks: true`, pinned 404
  `retryable: false`, `\n\n` text_delta seams, prompt-snapshot `expect.any(AbortSignal)`,
  `project_id` contract fields accepted, `create_onto_project.required = ['project']`,
  `merge_instructions` removed, `delegate_task` off global) is justified by a code change in the
  same diff; none was flipped to hide behaviour.

## Handoffs

None — read-only review. The fixes for 1–3 are described inline; 1 and 2 are single-file worker
changes (`turn-executor.ts`, `turn-provider.ts`), 3 is the already-specified WP-B handoff 4 or a
one-line revert of `email.ts:47-52`.
