<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-C-contract-and-reviewer-text.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# WP C-contract-and-reviewer-text — receipt (2026-09-10)

Package: `C-contract-and-reviewer-text` from `evidence/work-packages.json`. Findings F06 (Tier 1
only), F07, F10, F02 (this package's part), F36, F39, F43. The package note narrows F06/F07/F10 to
the verifier-approved Tier 1 changes; the contract lane itself is untouched (DJ decision).

Files edited (left unstaged, nothing staged or committed):

Owned source

- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.test.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/controls.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/disposition.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/contract-execution.ts` (TODO comment only)
- `apps/worker/src/workers/agentic-chat/provider/tool-surface.ts`
- `apps/worker/src/workers/agentic-chat/provider/contract-fields.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-phase.ts`

Tests outside the literal `owns` list, edited only to keep them honest for the files above (the
note itself directs the first one; none is claimed by another package):

- `apps/worker/tests/agenticChatDocumentContractFields.test.ts` (note: "expect acceptance")
- `apps/worker/tests/agenticChatReviewRequestEvidence.test.ts` (pins `REVIEWER_EVIDENCE_SECTION_TITLES`)
- `apps/worker/tests/agenticChatTurnPhase.test.ts` (pins the removed `openingTools`/budget variants)
- `apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts` (new F36 test only)
- `apps/worker/tests/agenticChatTurnProvider.test.ts` — three lines in one `it.each` (~:6239-6250,
  :6278, :6392): its "invalid contract" fixture was a labelled goal without a name, which F06 now
  accepts; moved to `minimum_successful_effects: 0`, which nothing normalizes.

## Per finding

### F06 (Tier 1) — label machinery rejects what it could normalize — FIXED as narrowed by the note

`packages/agentic-chat-runtime/src/loop/turn-contract.ts` `normalizeOutcome`:

- The action-aware label normalization that `review/decision-completion.ts`
  `normalizeReviewerCorrectedContractValue` already applied to reviewer corrections now runs in the
  parser for every declaration: `label` off a `create`, `parent_label` off `move`/`organize`, and
  `src_label`/`dst_label` off a `link relationship` are dropped instead of rejected.
- A labelled `create` with `minimum_successful_effects > 1` or no title change keeps the outcome and
  drops the label (previously two rejection paths).
- `null` and blank-string label fields count as "unused" (no note); a non-string label on a create is
  still rejected ("label must be a non-empty string"), and a malformed label pattern on a create or
  on `parent_label` is still rejected, as are all six link-shape rejections on a relationship link.
- Every drop is recorded through a new optional `notes` sink (`parseDeclaredTurnContract(value,
issues?, notes?)`). On a successful declaration the notes ride the `declare_turn_contract` result as
  `normalization_notes` (only present when non-empty) so the model sees what was kept; when a later
  check still rejects the contract, the notes follow the rejections inside the existing 5-item cap
  (`describeDeclaredTurnContractIssues`) — a dangling `parent_label` caused by a dropped label now
  explains itself. This is the "issue note, not a rejection" the note asked for.
- Rejection paths removed: 4 of the 12 label-only paths (`label` on non-create, `parent_label` on
  non-move, labelled create min>1, labelled create without title) plus the endpoint-label
  "not a relationship link" branch. The cross-outcome checks in `describeContractReferenceIssues`
  (unique labels, dangling `parent_label`, endpoint kind, one destination) are unchanged.
- The schema-prose cut for the four label descriptions lives in
  `packages/agentic-chat-runtime/src/catalog/definitions/controls.ts`, which WP-B owns — exact text in
  Handoffs. `turn-contract.test.ts` no longer reads the worked example out of that description (test
  rewritten to parse the literal shape), so the cut cannot break this package's tests.

Tests: `turn-contract.test.ts` — the three rejection assertions became normalization assertions
(`drops the label with a note instead of rejecting …`, 6 cases including the placeholder `N/A` and
endpoint labels on a create); new `treats a null/"" label as unused`, `still rejects a malformed label
on a create`, `explains a dangling parent_label caused by a dropped label`, and `drops the label from a
labelled goal without its declared name instead of rejecting it`. The link-shape `it.each` (6
malformed endpoint references) is unchanged and still rejects.

### F07 — `project_id` in required_fields rejected instead of normalized — FIXED as narrowed

- `turn-contract.ts` `normalizeOutcome`: after `normalizeOutcomeFieldName`, `project_id` is filtered
  out of `required_fields` and out of `changes` (a change field always joins required_fields, so the
  invariant "every change field is a required field" holds) for every action, with a comment
  mirroring the `target_ids` one and a note ("project_id was dropped from required_fields and
  changes: project membership is execution scope, not a changed field."). Only `project_id`, per the
  note — the wider `*_id` set in `NON_EFFECT_ARGUMENTS` includes `parent_id`, which is a legitimate
  move postcondition.
- `contract-fields.ts`: the fieldless document-update rejection is KEPT verbatim (the verifier showed
  it is the only postcondition left on that path). The unknown-field message no longer says "omit
  project_id" (that advice was reachable only for other invented fields now); docstring notes why
  project_id never reaches the check.
- `agenticChatDocumentContractFields.test.ts`: the two `project_id` create cases and the two
  `project_id` reviewer-correction cases now expect acceptance; `estimated_minutes` (the other live
  rejection shape, turn ab4e567e) was added as the case that must still reject. The document-update
  cases (`undefined`/`[]`) are untouched and still reject.
- `turn-contract.test.ts`: the goal-vocabulary test now expects `['name', 'target_date']`; new
  `it.each` covers create task/document and an update whose `changes` carried `project_id`, plus the
  `normalization_notes` on the declared result and their absence on a clean declaration.
- The "never project_id (scope, not a field)" sentence for the `required_fields` schema description is
  in the WP-B-owned catalog file — Handoffs.

### F10 — reviewer prompt: one paragraph, four clarification rules, actor rules in the evidence — FIXED as narrowed

(a) `review/turn-contract.ts` `REVIEWER_EVIDENCE_SECTION_TITLES`: `'Rules for This Turn'` removed.
Chosen over the "duplicate the playbook delimiters on the worker" option because WP-A2 (F71) is
replacing the `Source: … / Skill-load gate: SATISFIED BY PRELOAD / Next step:` wrapper with a plain
one-line heading this same pass, so any delimiter copied today breaks tomorrow; the reviewer's own
system prompt already carries the commission semantics the playbook would have restated. The
docstring says which section is dropped and why.

(b) `TURN_CONTRACT_REVIEW_SYSTEM_PROMPT` rewritten format-only into five titled blocks separated by
blank lines — `Role and trust`, `Enumerate before judging`, `Decide: approve, read-only, revise, or
clarify`, `Commission rules` (one `- ` line per `SEMANTIC_COMMISSION_GUIDANCE` rule), `Contract shape`
(the two `CONTRACT_DECLARATION_GUIDANCE` lines kept, per the note's format-only scope). The four
clarification sentences (former lines 60, 61-tail, 62 and the "instead of … asking the user to
clarify a change they did not request" clause stays with its read-only rule) are merged into one
`Clarify when …` sentence. Every tested sentence is verbatim: "prior independent review already
established", "Prose fields (content, description, body) are postconditions", "Never copy,
abbreviate, or rewrite exact source text", "original user request and loaded source remain
authoritative", and all 14 commission lines. Measured: 9,672 → 9,721 chars (headers cost 49 chars;
the merge saved about as much), 0 → 5 paragraphs, 13 → 12 "never"s. The prompt is still one static
string; the byte-identical-across-reviews test passes, and the tools array is untouched.

- The "shell rules reach the reviewer a second time" claim in the evidence was checked and is not a
  reviewer problem: `buildReviewerEvidence` already drops every worker system message, so the gate's
  copy never reached the reviewer. The actual duplication was on the acting side (see F36).
- New test in `agenticChatReviewRequestEvidence.test.ts`: `formats the reviewer prompt as titled
blocks and keeps the SHA-binding rule`; the evidence fixture's `Rules for This Turn` now holds a
  web-research rule and a playbook line and the test asserts neither reaches the reviewer.

### F02 (this package's part) — actor guidance names an unmounted tool — FIXED

`review/controls.ts` `ACTOR_COMMISSION_GUIDANCE[0]` is now tool-neutral: "Commission rules: a simple
commissioned change calls the mutation tools directly; a complex one is routed to independent review
before execution." Lines 1-4 untouched. This line rides the deferred routing message, the full routing
message and the disposition gate, so all three stop naming `declare_turn_contract` where it is not
mounted. Deferred routing message measured at 2,421 chars (guard: < 2,600).

### F36 — `cancel_turn_contract` rides every turn — FIXED (verifier's version, worker side)

- `tool-surface.ts` `productionToolsFor`: the force-mounted standard controls for the legacy
  shell-only Project Setup artifact are now only `declare_turn_contract` +
  `request_turn_clarification` (verifier item 1).
- `tool-surface.ts` `deferComplexWriteContractForInitialPass`: also withholds `cancel_turn_contract`
  from the opening pass unless the frozen history carries the admission-rendered pending-contract
  system message (the note's "extend deferComplexWriteContractForInitialPass"). Detection is the new
  `isPendingTurnContractSystemMessage` in `loop/turn-contract.ts`, which shares the `<pending_turn_contract>`
  open tag with `buildPendingTurnContractSystemMessage` — a durable session fact rendered by the
  harness, never the user's message text. `CANCEL_TURN_CONTRACT_TOOL_NAME` joins
  `WORKER_KNOWN_ARTIFACT_ONLY_TOOL_NAMES` so the surface-override message does not fire on every
  opening pass because the artifact still lists it. The tool definition and the turn-provider handler
  are untouched; the admitted surface (later passes) still carries it whenever the artifact lists it.
- `review/disposition.ts` `buildProjectCreateInitialContractGateRequest`: the second
  `projectCreateShellGuidance` append removed — the base request's write-routing message already
  carries the shell rules on that surface (`buildWorkerSemanticMutationOrdering`). The
  `agenticChatTurnProvider.test.ts` assertion that the first Project Setup request contains "Project
  creation order" still holds (it comes from the routing message).
- `turn-phase.ts`: dead `openingTools` context field and the never-dispatched `budget` limits
  `validation_repairs`/`rounds` deleted (`nextTurnPhase` `budget` → `synthesis` unconditionally);
  `agenticChatTurnPhase.test.ts` updated accordingly.
- Web-side append (verifier item 2), the dead `providerToolCallCount` counters, `README.md:93` and
  `validation.ts:243` are outside this package — Handoffs.
- New test in `agenticChatWorkerSurfaceBudget.test.ts`: opening pass omits the control on
  global/project without a pending contract, includes it with one, override stays null, legacy
  shell-only artifact force-mounts exactly the gate pair.

### F39 — answer pass after a single-outcome project contract still mounts `create_onto_project` — NOT FIXED (handoff)

The verifier's fix lives entirely in `turn-provider.ts:833-846` (the branch that calls
`takeContractCompletionContinuation` after the shell round) and, optionally, `validation.ts`
`turnContractOutcomeAuthorizesCall`; neither file is in this package and no owned file sits on that
path (`buildContractCompletionRequest` is never reached when every outcome is fulfilled). Exact patch
in Handoffs.

### F43 — stale phase instructions accumulate — NOT FIXED (handoff + TODO, as the note anticipated)

Replacing instead of appending needs a tagged-replace helper in `request-builders.ts`
(`appendSystemInstruction` is the only primitive) and call-site changes in `turn-provider.ts`; two of
the five phase sites (carve-out, completion) are in the owned `review/contract-execution.ts` and one
(gate + clarification) in `review/disposition.ts`, but a partial replace with an untagged
`turn-provider.ts` still appending would give mixed semantics. A precise TODO naming the audit, the
helper, and the five sites is left above `buildTurnContractWriteCarveOutRequest` in
`review/contract-execution.ts`. Exact change in Handoffs.

## Tests run (one file per command, narrow targets only)

| Command                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/turn-contract.test.ts`                                                     | 103 passed (run twice; last after prettier)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/tool-validation.test.ts`                                                   | 14 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatDocumentContractFields.test.ts`                                                  | 31 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatReviewRequestEvidence.test.ts`                                                   | 11 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatRetest20260904Regressions.test.ts`                                               | 7 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnPhase.test.ts`                                                               | 18 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatReviewDecisionCompletion.test.ts`                                                | 4 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatReviewedTurnContract.test.ts`                                                    | 20 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatToolExecutionAdapter.test.ts`                                                    | 42 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatProviderBoundary.test.ts src/workers/agentic-chat/provider/tool-surface.test.ts` | 4 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatWorkerSurfaceBudget.test.ts`                                                     | 6 passed, 2 failed — both from WP-B's in-flight catalog edits, not this package: `delegate_task` no longer on global (their F25) and project admitted bytes 39,126 > 39,000 ratchet (their catalog growth). The new F36 test and the override/sidecar/defer tests pass.                                                                                                                                                                                                                            |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnProvider.test.ts`                                                            | 108 passed, 7 failed — none on this package's assertions: 4 × `routes repeated invalid contracts …` now pass their contract-validation/step/request-count assertions and fail only at `:6371` `allow_fallbacks: false` (WP-D F76 flipped the pin to `allow_fallbacks: true` in the working tree); 2 × `switches the disabled-tool provider …` fail at `:7103` on the same WP-D assertion; 1 × `projects every straightforward entity mutation …` fails on `merge_instructions` removed (WP-B F30). |
| `pnpm exec prettier --check/--write` on the 13 touched files; `apps/worker/node_modules/.bin/eslint` on the 7 touched worker source files        | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

No typecheck, svelte-check, suite run, or `pre-push` was run (integration agent's job). The worker
never imports web source (boundary test passes); reviewer system prompt and approval tools are
byte-identical across reviews (test passes); the Finding 11 addendum, the direct-write floor, SHA
binding, fail-closed unknown tools, and idempotent receipts were not touched.

## Handoffs (exact changes in files this package does not own)

1. **WP-B — `packages/agentic-chat-runtime/src/catalog/definitions/controls.ts` (F06/F07 schema
   prose).** Replace the four label descriptions (`label`, `src_label`, `dst_label`, `parent_label`,
   currently ~1,150 chars with a worked example and three "Null/omit when unused; no placeholders")
   with:
    - `label`: `Create only: name for one new entity (title declared in changes, minimum_successful_effects=1) that a later outcome references.`
    - `src_label`: `Link only: label of the source created in this contract.`
    - `dst_label`: `Link only: label of the destination created in this contract.`
    - `parent_label`: `Move/organize only: label of the parent created in this contract.`
      and change `required_fields.description` to
      `Nonempty changed fields for updates: ["content"] for text, ["due_at"] for reschedules; parent_id/position for tree moves. Never project_id (scope, not a field).`
      Then update `apps/worker/tests/agenticChatTurnProvider.test.ts:~5180`, which asserts the label
      description contains `Create only: optional symbolic reference to one new entity` (change to
      `Create only: name for one new entity`). `turn-contract.test.ts` no longer depends on the example.
2. **WP-B `surfaces.ts` + WP-A2 `worker-turn-preparation.server.ts` (F36 verifier item 2).** Remove
   `'cancel_turn_contract'` from `GLOBAL_DIRECT_TOOL_NAMES` (surfaces.ts:85), `PROJECT_DIRECT_TOOL_NAMES`
   (if listed independently) and `PROJECT_CREATE_DIRECT_TOOL_NAMES` (:166), keep
   `CANCEL_TURN_CONTRACT_TOOL_DEFINITION` in `GATEWAY_TOOL_DEFINITION_MAP`, and in web admission append
   `'cancel_turn_contract'` to the surface `toolNames` only when
   `turnPreparation.pendingTurnContract !== null`, through the same per-turn append the Gmail group
   uses (surfaces.ts:74-76). The worker side in this package already tolerates either state.
3. **`apps/worker/src/workers/agentic-chat/provider/turn-provider.ts` (F39, unowned).** In the branch
   at ~:833-846:
    ```ts
    const completionRequest = state.takeContractCompletionContinuation(currentRequest);
    if (completionRequest) {
    	currentRequest = completionRequest;
    } else if (
    	buildWriteLedger(turnToolExecutions).some(
    		(entry) => entry.status === 'success' && entry.toolName === 'create_onto_project'
    	)
    ) {
    	// The shell is durable and no child outcome is left: answer tool-free so
    	// create_onto_project cannot be called twice (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F39).
    	currentRequest = forceToolFreeRequest(currentRequest);
    }
    ```
    Optional second half (`validation.ts` `turnContractOutcomeAuthorizesCall`, ~:293): reject a
    `create_*` call for a targetless create outcome whose successful creates of that `entityKind` in
    the ledger already equal `minimumSuccessfulEffects`; leave update outcomes untouched. Add a test in
    `agenticChatTurnProvider.test.ts` next to the 09-04 case-1 shape (~:5054-5284) asserting the
    post-shell request has `tools: []`.
4. **`request-builders.ts` + `turn-provider.ts` (+ owned `review/disposition.ts`,
   `review/contract-execution.ts`) (F43).** Add to `request-builders.ts`:
    ```ts
    const PHASE_INSTRUCTION_PREFIX = 'Phase instruction: ';
    export function replacePhaseInstruction(request, content) {
    	const messages = request.messages.filter(
    		(m) =>
    			!(
    				m.role === 'system' &&
    				typeof m.content === 'string' &&
    				m.content.startsWith(PHASE_INSTRUCTION_PREFIX)
    			)
    	);
    	return {
    		...request,
    		messages: [
    			...messages,
    			{ role: 'system', content: `${PHASE_INSTRUCTION_PREFIX}${content}` }
    		]
    	};
    }
    ```
    and call it (instead of `appendSystemInstruction`) at the five phase sites: the gate
    (`disposition.ts` `buildSemanticTurnDispositionGateRequest`), the clarification post-disposition
    (`disposition.ts` `buildPostSemanticDispositionRequest`), the carve-out and completion builders
    (`contract-execution.ts`), and `organizeExecutionInstruction` in `turn-provider.ts`
    `takeTurnContractWriteCarveOut`. Ladder nudges, batching, disposition notices, and admission-time
    messages stay appended. Once the helper exists, WP-C's two files are a one-line swap each; the
    TODO in `contract-execution.ts` names them.
5. **`turn-provider.ts` dead counters (F36 verifier).** Delete `providerToolCallCount` (:334, :490),
   `getProviderToolCallCount` (:196, :492-494) — zero call sites.
6. **`apps/worker/src/workers/agentic-chat/README.md:93`** — delete the `review/mutation-batch.ts`
   bullet (file does not exist). **`provider/validation.ts:239-244`** — the docstring cites "the exact
   mutation-batch reviewer"; reword to "concrete tool arguments are adjudicated by the contract
   reviewer before execution".
7. **WP-D — `apps/worker/tests/agenticChatTurnProvider.test.ts` :6371-6382 and :7103-7106** assert
   `allow_fallbacks: false` on the pinned retry; with F76 landed these six tests fail on that line only.
   Flip to `allow_fallbacks: true` (or drop the key) as part of F76's test updates.
8. **WP-B — `apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts`**: the global list at ~:253
   still expects `delegate_task` and the project admitted ratchet at :133 (39,000) is 126 B under the
   measured 39,126 after the catalog edits; both need the honest re-baseline that package's note asks
   for. Also `agenticChatTurnProvider.test.ts:4558` expects `merge_instructions` on
   `update_onto_document` (F30).

## Behaviour changes (model-visible or reviewer-visible)

- A `declare_turn_contract` call whose only faults were a misplaced or over-scoped label, or
  `project_id` in `required_fields`/`changes`, now succeeds; the result carries
  `normalization_notes: [...]` naming each drop. Previously these were bounded validation-repair
  rounds (+1.6 passes / +38k tokens / +38 s on average per the audit).
- A contract that still fails after a drop lists the dropped-label note after its rejections (within
  the 5-item cap) so a dangling `parent_label` is explained.
- Reviewer corrections that carry `project_id` in `required_fields` are accepted rather than failing
  closed as `unexecutable_effect_fields`.
- The reviewer system prompt is five titled blocks with line breaks instead of one paragraph;
  content is the same set of rules (one merged clarify rule). Cache key unchanged in kind (still one
  static string), changed in bytes once — every review after deploy shares the new prefix.
- The reviewer no longer sees the "Rules for This Turn" section (web-research/delegation rules and the
  preloaded playbook, ~2.7k chars per review).
- Actor routing message and gate no longer say "calls declare_turn_contract first" (tool-neutral).
- Opening pass on global/project turns without a carried-forward contract no longer mounts
  `cancel_turn_contract` (~420 B); a turn with a pending contract still does. Legacy shell-only Project
  Setup artifacts get only the gate pair force-mounted.
- Project Setup opening gate carries the shell rules once instead of twice.
- `contract-fields.ts` unknown-field message for non-document kinds no longer mentions `project_id`.

## Deliberately left alone

- Labels themselves, `bindTurnContractLabels`, the label branches of `resolveOutcome`, and the
  cross-outcome reference checks — Tier 2 (dropping labels) is the DJ decision the note excludes.
- The fieldless document-update rejection in `contract-fields.ts` (note: KEEP).
- `CONTRACT_DECLARATION_GUIDANCE` in the reviewer prompt — the note scopes F10(b) to format-only; it
  now sits under "Contract shape" and its label sentence remains accurate.
- Only `project_id` is filtered (not the wider `NON_EFFECT_ARGUMENTS` `*_id` set), per the note;
  `parent_id` in that set is a legitimate move postcondition.
- `cancel_turn_contract` stays on the admitted surface for later passes whenever the artifact lists it;
  removing it from the artifact is the web-side handoff (item 2), which also keeps the phase machine's
  `cancel` transition reachable for a pending contract.
- The shell-guidance sentence "Project membership is execution scope: omit project_id …" in
  `projectCreateShellGuidance` — still accurate and it prevents a note; one sentence.
- `repair-policy.ts` opening-repair guidance still says "declare the complete turn contract first" on
  a surface where the schema is deferred (F02 shape, not in this package's findings or files).
