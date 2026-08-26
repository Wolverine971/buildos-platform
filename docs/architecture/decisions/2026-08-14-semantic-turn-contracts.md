<!-- docs/architecture/decisions/2026-08-14-semantic-turn-contracts.md -->

# Semantic turn contracts for agentic chat

Status: implemented for web and worker runtimes on 2026-08-14.

## Context

`packages/agentic-chat-runtime/src/loop/turn-intent.ts` infers mutation intent from verbs,
nouns, pronouns, and curated phrase shapes. That can be useful telemetry, but it is not a
sound completion contract: paraphrases escape it, innocent phrases can trigger it, and one
successful call with the expected tool name can incorrectly satisfy a request for several
distinct effects.

Adding more examples improves a benchmark without proving semantic correctness. Adding a
separate intent-model call to every turn would improve semantic interpretation, but would also
add latency, cost, a new failure boundary, and disagreement between two model calls. Production
canaries later demonstrated a narrower place where that tradeoff is justified: an acting model
must not be the sole judge of its own proposed write target.

## Decision

The existing agent model is the semantic parser. It receives a stable bundle of common project
read/write capabilities and four internal control tools: `declare_turn_contract`,
`declare_read_only_turn`, `request_turn_clarification`, and `cancel_turn_contract`.

On the worker mutation path, `declare_turn_contract` is an untrusted proposal. Before any write
surface is restored, a distinct reviewed model lane sees the exact normalized contract, its
SHA-256, and the complete acting-model turn record. It must choose exactly one internal control:
`approve_turn_contract_review`, bound to that SHA-256, or `request_turn_clarification`. The decision
crosses the normal durable tool-result fence. The worker assembly refuses to enable mutation
capabilities without this independent reviewer. Reviewer routing is derived from the existing
reviewed model catalog and OpenRouter configuration; it adds no environment variable.

`declare_read_only_turn` is also an untrusted proposal on the worker. Otherwise an acting model
could avoid write review by calling the read-only control for a commissioned but ambiguous
mutation. Before a read-only turn can finish, the distinct reviewer sees the exact normalized
disposition, its SHA-256, and the complete turn record. It must call
`approve_read_only_turn_review`, bound to that SHA-256, or request clarification. Reads may happen
before this review; mutations never can. A direct read-only declaration counts as the turn's one
semantic disposition gate, so it is not classified and reviewed a second time after the first
read.

Contract approval is not a blanket capability grant. The acting model often cannot choose exact
values until after reads or earlier writes, so every concrete mutation batch is withheld at the
last pre-execution boundary. The same independent lane sees the approved contract, complete turn
evidence, exact tool names/targets/values, and a SHA-256 over the proposed batch. It must choose
exactly one control: `approve_mutation_batch_review`, bound to that batch SHA-256, or
`request_turn_clarification`. One review covers an entire parallel batch. Only the exact held calls
are released after the approval result is durable; the model cannot rewrite them after approval.
This is the semantic value/target check that a comparison between strings such as `parent_id` and
`new_parent_id` cannot provide.

- When a durable request needs reads before writes, the model calls
  `declare_turn_contract` alongside its first reads.
- On the worker, a proposed direct write is withheld until a semantic disposition has completed.
  After a safe mutation disposition, the reissued write is durable evidence for that contract.
  Legacy web direct writes still form implicit contracts for compatibility.
- When a read-first turn commissions no durable change, the model calls
  `declare_read_only_turn` with a concise semantic reason. The worker independently reviews that
  exact disposition before accepting the terminal answer.
- When a durable change was commissioned but loaded context leaves multiple plausible targets or
  another required value dependent on a real user choice, the model calls
  `request_turn_clarification`. The result requires user action and prevents any write in that
  turn; the runtime asks the validated question instead of guessing.
- When the current user explicitly cancels or supersedes a prior unfinished commission, the
  model calls `cancel_turn_contract`. Difficulty or a blocker is not cancellation.
- A contract describes outcomes as action, entity kind, optional canonical target ids,
  required mutated fields, and the minimum number of distinct successful effects. It does
  not contain user-message patterns or make tool names the definition of success.
- Fulfillment is calculated from the durable write ledger. Failed calls, validation-only
  calls, and duplicate calls do not count.
- Only unfinished declared or observed outcomes carry into the next turn.

Clarification turns add no independent approval call. A true read-only worker turn adds one
independent read-only review. A write contract adds one independent contract-review call plus one
independent call per proposed mutation batch. Batching keeps that cost proportional to decision
points rather than individual writes; a folder-creation batch and the later moves that consume its
ids normally require two batch reviews. This is the deliberate cost of checking semantic
disposition, concrete targets, and values instead of giving the acting model authority over its
own proposal. A separate bounded fallback adds
one acting-model provider round when the model omits a semantic disposition and then tries to read,
write, or return final prose. That pass is forced to call exactly one of `declare_turn_contract`,
`declare_read_only_turn`, or `request_turn_clarification`; it cannot answer in prose or smuggle a
choice through unstructured prose. A proposed mutation is discarded before execution, and proposed
final prose is withheld, until that control result is durable. Rare tools remain discoverable on
demand. Common project reads,
task/document writes, tree reads, and document moves are stable at turn start; discovery launches
with only `skill_search` and `domain_search` to keep the provider payload within budget.

This removes an intent-classification round trip by spending more static tool-schema context.
The 2026-08-15 canonical project measurement is 37,515 provider-payload characters (about
9,379 tokens), up from the prior 31,500-character guardrail. The guardrail is ratcheted to
41,300 characters / 10,320 estimated tokens (about 10% headroom), and the production worker
still intersects the frozen artifact with its reviewed deployed capabilities before the
provider call. Revisit the stable surface if measured latency or cost outweighs the avoided
round trip; do not hide the increase behind a stale passing threshold.

The worker provider deadline defaults to 300 seconds, leaving a 60-second terminal-persistence
margin below the 360-second worker timeout. This is a code default, not a new environment variable.
The prior 270-second provider deadline was observed expiring after all organization writes had
completed but before the terminal response, and the semantic reviewer adds real provider time; the
extra headroom prevents a successful durable turn from being reported as a timeout while retaining
a bounded outer deadline.

## Runtime flow

1. The model sees the stable surface.
2. For read-before-write work, it emits `declare_turn_contract` in the same response as the
   reads. The runtime validates and acknowledges that control call locally; it never reaches
   a data executor.
3. If the model starts with reads, proposes a write, or attempts to finish without a disposition,
   the worker runs one semantic disposition gate. It adds one provider round with only `declare_turn_contract`,
   `declare_read_only_turn`, and `request_turn_clarification` available and
   `tool_choice: required`. The same model must classify the actual request and loaded context by
   meaning; arbitrary prose and multiple or contradictory dispositions are rejected. After a
   mutation contract, the worker sends the exact contract to the independent reviewer instead of
   restoring writes. After a read-only disposition, it sends the exact disposition to the
   independent reviewer before accepting final prose. After a clarification disposition, it
   removes every tool and forces the final question. A pre-gate write never reaches a mutation
   adapter, and its proposed target is explicitly treated as untrusted rather than as evidence of
   resolution.
4. The reviewer can durably approve only the supplied contract or read-only disposition SHA-256,
   or durably request clarification. Contract approval restores the reviewed acting-model surface;
   read-only approval permits pure reads/final prose but no mutation; clarification clears the
   premature proposal and forces a tool-free question. Missing, malformed, mismatched, or
   unavailable review decisions fail closed to clarification. Reviewer controls come from a
   stable admitted control surface, not a transient narrowed write-only surface, so the
   clarification fallback is always callable.
5. Every proposed worker mutation batch is then withheld again. The independent reviewer can
   durably approve only its exact SHA-256 or request clarification. Approval releases the already
   held calls; rejection, malformed output, unavailable review, or a SHA mismatch releases no
   mutation. Deterministic code still checks contract identity, allowed outcome/tool scope, and
   known target ids, but `required_fields` remain fulfillment postconditions rather than a lexical
   allowlist of tool argument names.
6. Web and worker runtimes retain the normalized contract and reserve a safe write-only
   recovery pass if synthesis would otherwise strand it.
7. Real write executions produce semantic ledger entries (`action`, `entityKind`, target,
   changed fields, and a distinct effect id).
8. Finalization matches every contract outcome against successful ledger effects. Cardinality,
   known targets, required fields, and lifecycle state evidence must all be satisfied.
9. Web session metadata and worker terminal metadata persist only unfinished contract
   outcomes. The worker database trigger independently recomputes fulfillment from durable
   tool rows. A durable clarification is an ordered reset: it discards the current turn's
   premature declaration and failed pre-clarification writes while preserving an older in-scope
   pending commission.

The frozen web artifact can describe more tools than a deployed worker capability set actually
advertises. When that happens, the worker adds an authoritative callable-tool override to the
model input. It does not loosen the allowlist; it prevents stale discovery, skill, context, or
disabled-mutation instructions from contradicting the worker's real execution surface.

`turn-intent.ts` remains temporarily for compatibility and shadow telemetry. It no longer
chooses the common project tool surface, bypasses domain sensing, or owns web/worker outcome
persistence.

### Rollout boundary

The independent contract, read-only, and mutation-batch reviewers are implemented at the worker
provider boundary. The shared parser, ledger, fulfillment logic, controls, and database terminal
truth are used by web and worker code, but the legacy web orchestrator does not yet provide the
same independent reviewer guarantee. With `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false`, default
production traffic still uses that legacy path; worker-pinned Realtime turns use the reviewed
path proven below. Do not describe the system as universally review-gated until worker routing is
the production default or the same reviewer boundary is ported to legacy web.

## Important guarantees

- A request for six document moves is not fulfilled by one `move_document_in_tree` call.
- Retrying the same entity with a new call id still counts as one semantic effect, and
  required fields must be changed on every declared target rather than somewhere in the batch.
- A direct failed write becomes an unfinished implicit contract only on the legacy/no-declaration
  path. Once a declaration exists, an out-of-contract rejected proposal is not silently promoted
  into future authority.
- A declaration is not itself evidence that data changed.
- A worker declaration is not itself authority to expose writes. Its exact SHA-bound independent
  approval must also be durably recorded.
- Contract approval is not authority for arbitrary later calls. Every exact mutation batch needs
  its own durable SHA-bound semantic approval immediately before execution.
- `required_fields` are durable postconditions, not a tool-argument allowlist. Tree
  `parent_id`/`new_parent_id` and `position`/`new_position` normalize to semantic placement fields;
  the exact proposed values are judged by the mutation-batch reviewer.
- Assignment/completion/archive/restore outcomes are not satisfied by an unrelated generic
  update; their assignment fields or lifecycle state must match the declared action.
- Direct writes made after a declaration are eligible evidence for that declaration, not extra
  obligations appended to it. Rejected or unmatched proposals cannot expand an existing
  declaration.
- A pending contract is admitted only in the context/project where it originated.
- Explicit cancellation is ordered: it clears prior outcomes, while a later declaration or
  failed direct write starts a new contract.
- Destructive operations are never forced by contract recovery. Delete and unlink remain on
  their confirmation/discovery paths.
- The web and worker use the same parser, semantic mapping, ledger, and fulfillment code.
- The semantic disposition gate runs at most once and only when all three disposition controls are
  callable, no disposition exists, and no mutation has started. It covers read feedback, proposed
  writes, and proposed final prose.
- Direct-answer turns do not pay for the fallback provider round when the model emits their
  disposition first. True read-only worker turns still pay one independent disposition review;
  write turns pay one contract-review call. If the acting model omits its auditable disposition,
  one additional checkpoint round is the deliberate cost of preventing an unclassified write or
  final answer. Mutation batches pay their explicit pre-execution review calls even when the
  disposition was emitted correctly.
- A commissioned action cannot satisfy the gate by becoming a proposal or approval request;
  `declare_read_only_turn` explicitly means no durable change was commissioned.
- A commissioned action with an unresolved user choice cannot be satisfied by guessing a target;
  `request_turn_clarification` is a distinct semantic terminal state and clears any premature
  contract.
- Terminal cleanup honors the structured `requires_user_action` result. A clarification question
  containing a word such as “update” is not reclassified as an unfinished-action lead-in by the
  legacy text safety floor.
- Parallel validation failures are emitted as one durable failed result per proposed call and sent
  back together for bounded repair. One malformed call no longer converts a whole parallel batch
  into an opaque permanent stream failure.

## Main implementation boundaries

- Shared contract and matcher:
  `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- Effect ledger:
  `packages/agentic-chat-runtime/src/loop/write-ledger.ts`
- Web surface and internal execution:
  `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts` and
  `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/`
- Web carry-forward:
  `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- Worker control execution and recovery:
  `apps/worker/src/workers/agentic-chat/readOnlyTool.ts` and
  `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`
- Independent reviewer construction and fail-closed assembly invariant:
  `apps/worker/src/workers/agentic-chat/phase3Bootstrap.ts` and
  `apps/worker/src/workers/agentic-chat/phase3Assembly.ts`
- Worker terminal truth:
  `apps/worker/src/workers/agentic-chat/fixtureTurnExecutor.ts` and
  `supabase/migrations/20260814010000_agentic_chat_terminal_pending_contract_metadata.sql`
- Clarification ordered-reset patch:
  `supabase/migrations/20260815010000_agentic_chat_clarification_contract_reset.sql`
- Worker-boundary hardening and internal helper isolation:
  `supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql`
  through `20260814013000_agentic_chat_contract_internal_helpers.sql`

## Rollback

Application rollback is localized:

1. Restore project/ontology default routing to `project_basic` and restore intent-selected
   write materialization in `tool-selector.ts`.
2. Remove `declare_turn_contract`, `declare_read_only_turn`, `request_turn_clarification`, and
   `cancel_turn_contract` from the surface, and remove the worker-only
   `approve_turn_contract_review`, `approve_read_only_turn_review`, and
   `approve_mutation_batch_review` controls/reviewer lane.
3. Restore `resolveFastChatTurnOutcome` and lexical pending-intent persistence at web and
   worker finalization.
4. Keep the richer write-ledger fields; they are backward-compatible and harmless.

Database rollback should be explicit rather than deleting data:

```sql
DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_pending_contract
  ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_terminal_pending_intent
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.apply_agentic_chat_terminal_pending_intent_v1();
```

The clarification migration patches the existing terminal function in place. If reverting only
that behavior, restore the prior stored function definition from migration
`20260814013000_agentic_chat_contract_internal_helpers.sql`; do not reverse it with a data delete.

The helper functions and `fastchat_pending_turn_contract` metadata may remain in place; older
application code ignores them. A code rollback does not require a destructive metadata
migration, but lexical `fastchat_pending_turn_intent` records cleared by completed worker turns
cannot be reconstructed automatically.

## Verification

The focused suites cover malformed declarations, explicit cancellation, scope changes,
lifecycle evidence, paraphrase-independent declaration shape, multi-target cardinality,
duplicate/failed effects, cumulative per-target fields, implicit direct-write contracts,
internal web execution, stable surface size, worker control execution, worker recovery, and
terminal metadata behavior. Shared runtime/shared database types are type-checked, and focused
web/worker suites compile and exercise the changed integration boundaries.

### Production canary, 2026-08-15

The dedicated E2E user ran through the production web route and Railway worker with exact
Realtime/`agentic_chat_worker_v1` attribution and retries disabled.

- Explicit semantic cancellation passed with one successful `cancel_turn_contract`, no
  mutations, and database-trigger cleanup of the pending metadata.
- Task rescheduling, a three-operation task update, and two contextual document edits passed
  after the existing worker mutation capability gate was temporarily enabled for the reviewed
  tools.
- The project-organization case exposed a real omission: the model performed 13 successful
  document reads, never called `declare_turn_contract`, proposed a hierarchy, and asked for
  approval even though the user had already commissioned the organization. With no declared or
  implicit write contract, terminal metadata incorrectly had no obligation to mark unfinished.
- The same trace showed the frozen prompt naming discovery/context/disabled mutation tools that
  the worker had filtered out. An authoritative worker tool-surface override fixed that
  contradiction.
- A second organization canary with the corrected surface and an optional semantic checkpoint
  still failed: after one full document-tree read, the model ignored the reminder, proposed
  merges/renames, and asked for signoff. This falsified the assumption that a same-round prompt
  reminder was a sufficient guarantee.
- The remediation is therefore the bounded required-tool disposition gate described above. It
  does not rely on curated user-message examples or a separate intent-classifier model, but it
  honestly costs one additional call on the read-first omission path. Production verification of
  that final gate is recorded after the matching web and worker surfaces are deployed.
- The required two-way gate then passed the organization case with six distinct document moves,
  zero retries, and no proposal detour. A subsequent restraint case exposed a second semantic
  distinction: after reading three plausible “email” tasks, the model declared a mutation contract
  for one target and guessed. Durable-request truth alone was insufficient; safe target resolution
  also had to be represented.
- The gate is therefore three-way. `request_turn_clarification` represents “durable change
  commissioned, but unsafe to choose without the user.” This was derived from the failed live
  trace rather than from a curated phrase list.
- A live rerun then proved that structural enforcement and an auditable same-model choice were
  still not semantic authority: the acting model complied with the required three-way gate,
  declared the launch-email target, and mutated it even though three email tasks remained
  plausible. The gate was working mechanically and wrong semantically.
- The remediation is the independent SHA-bound review lane described above. It runs only for
  proposed worker write contracts, uses a distinct reviewed tool-capable model at temperature zero,
  persists approve/clarify as a normal tool result, and fails closed. This is an explicit extra paid
  call at the high-risk write boundary—not a universal intent-classification call and not another
  curated phrase benchmark.
- The first exact-batch canary failed closed with `provider_parallel_tool_validation_failed`.
  Treating argument-field strings as semantic authority made parallel repair opaque. The
  deterministic pre-gate was narrowed to identity, coarse outcome/tool scope, known ids, and
  lifecycle structure; the independent reviewer now judges exact values, and validation failures
  are returned together for bounded repair.
- A later organization run completed its durable work but exposed two postcondition bugs: eligible
  target ids had been treated as “all targets required,” and a rejected convenience edit had become
  implicit future authority. `minimum_successful_effects` is now the reviewed cardinality inside a
  bounded eligible target set, and rejected out-of-contract proposals cannot expand a declaration.
- Another canary failed closed with `provider_semantic_reviewer_surface_invalid` after the acting
  model corrected its contract. The batch reviewer had inherited a transient narrowed write-only
  surface without clarification. Reviewer controls now come from the stable admitted surface.
- The final organization canary passed on turn
  `e94fc26c-fc1f-4b03-96f7-8e8d9204eb24` / stream
  `bfc8ad3d-36b1-4558-923e-c6c54328f438`: exact contract approval, two exact mutation-batch
  approvals, five folder creates, six document moves, zero failed mutations, no pending contract,
  124.6 seconds, and `$0.02374882` total model cost. Three of nine provider requests were reviewer
  decisions.
- The first restraint rerun then found a real bypass: for an ambiguous commissioned mutation, the
  acting model could declare the turn read-only and avoid contract review. This produced no write,
  but the semantic disposition itself was untrusted. The independent exact-SHA read-only review
  described above closes that path.
- The final no-op/ambiguity canary passed with retries disabled on deployment
  `d698e255-40f7-405b-b1f3-37089e94a85c`. The read-only turn
  `baee2568-d659-4b23-ae8d-62fb67523ec4` / stream
  `5f45f480-24b4-45f6-b728-ac06bcc55aee` performed one read-only declaration, two reads, exactly
  one SHA-bound read-only approval, and zero writes. The ambiguity turn
  `8ddc2d22-4159-46d6-a919-5a2c5aec6a4a` / stream
  `adf6c781-0074-4682-9a50-bc3e23e8a868` proposed one of three email tasks; the independent
  reviewer rejected the guess and durably requested clarification naming all three. It performed
  zero writes. Both turns completed under `worker_realtime` / `agentic_chat_worker_v1`, left
  pending contract and intent null, cleaned their fixture project, took 67.1 and 29.8 seconds, and
  cost `$0.00540282` and `$0.00635103` respectively.
- Migration `20260815010000_agentic_chat_clarification_contract_reset.sql` was applied to the live
  database. Live traces verified that a durable clarification discards the current premature
  declaration while leaving no leaked pending metadata. The SQL regression is included, but it
  was not executed locally because this machine had no Docker/local Supabase runtime.
- Temporary canary capability overrides were restored to their original empty values. Worker
  deployment `18344217-1f70-4af5-9b5a-f854d560ac65` passed health checks after restoration. The
  production web artifact was rebuilt as deployment `dpl_8ffM6NwjanYKT5mBDfGZ1gqM6hm3` with
  the original routing value (`false`). A fresh authenticated, no-model transport negotiation
  returned `legacy_sse` / `legacy_internal_v1`, preserving the rollout boundary above.
- A post-deploy regression canary on exact `main` revision
  `debe7170cf437d13be023a7336f205cd861a78e6` repeated
  `restraint-noop-and-ambiguity` once with retries disabled. Production web deployment
  `dpl_HszDNRxZEP1hVyvnyvzZtDLdczUq` routed only the dedicated E2E user to worker deployment
  `da9fdd7d-21c2-44df-b7a0-01da4c9b4b4b`, with only `updateOntoTask` temporarily advertised.
  Read-only stream `c54b5bda-bc9b-48a6-bc1b-521d58c2750b` declared the disposition, read the
  task list, received exactly one successful SHA-bound independent approval, and wrote nothing.
  Ambiguity stream `7ade2852-2e23-43d5-ab58-f944406d62e1` declared a contract, then the
  independent reviewer rejected target selection and durably requested clarification; it had no
  mutation reservation, irreversible boundary, or write. Both turns completed natively under
  `worker_realtime` / `agentic_chat_worker_v1` with zero stream retries and zero validation
  failures. The six provider requests cost `$0.00936588` total. Routing was restored to `false`
  on Ready deployment `dpl_EKYitoHSCwQ4fYmx5dxiqgUgd55x`; both worker capability values were
  restored to empty on healthy deployment `2722e23a-1a06-4f96-93eb-f5158ec8bd4f`; final
  authenticated negotiation returned `legacy_sse` / `legacy_internal_v1`.
- The full Phase 4 hosted gate then ran all eight registered scenarios three times on exact
  revision `debe7170cf437d13be023a7336f205cd861a78e6`, with retries disabled. It was a NO-GO:
  12/24 scenario repetitions passed. The retained report is
  `docs/plans/evidence/agentic_chat_worker_phase4_gate_2026-08-15_debe7170c.json` (SHA-256
  `cef176f5e2526297e663f8db6acdaabb4074a9f9b37537959ea188e687a987af`). The worker-attributed
  model cost was `$0.14449753`; no paid rerun was attempted. Routing and both mutation capability
  gates were restored to their original off/empty values after the run.
- Retained rows separated the failures into concrete causes. Create contracts sometimes put the
  containing project in `target_ids`, making a new task/document impossible to authorize or
  fulfill. Targeted organization contracts also rejected their reviewed folder-creation step.
  Two read-only research turns received provider response headers and then stalled in the SSE body
  until the whole 300-second provider budget expired; the 90-second client timeout had not reliably
  bounded body reads. Finally, the evidence runner used the same 300-second wall for worker
  execution, reconciliation, assertions, judging, and capture, so several durably completed turns
  were reported as test timeouts and omitted from the artifact.
- The local remediation keeps semantic safety intact: create outcomes normalize to no pre-existing
  target id; the exact SHA-bound mutation reviewer still approves project scope and values;
  organization outcomes may authorize reviewed create calls; delegated judgment is explicit in the
  disposition/contract review prompts; provider body reads race the request abort signal; and the
  harness gives terminal reconciliation, a hard-bounded judge, and evidence capture separate time
  budgets. The visible activity-log planning event now satisfies the narration invariant without
  releasing unreviewed acting-model prose. This remediation is unit/type verified but not committed,
  deployed, or paid-canary verified yet.
