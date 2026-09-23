<!-- tasker/85-chat-workflow-durable-contracts.md -->

# 85 — Define and implement the durable workflow contracts

**Created:** 2026-09-12  
**Status:** Interface frozen and storage/readers implemented with writers off (2026-09-14; [receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK85_DURABLE_CONTRACTS_2026-09-14.md)). Production migrations applied 2026-09-15; the files were committed 2026-09-18 (`bd356380b`). Consumers 86 and 87 are integrated on `main` with no contract amendment or new migration. Open: schema ownership and consumer integration through 86–88; live combined-gate acceptance remains unproven and DJ explicitly declined another run.  
**Depends on:** 81 baseline; 82/84 accepted before runtime work; 83 done on 2026-09-14 ([receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md)).  
**Parallel with:** Later support for 86/87/88 as their shared contract owner.  
**Unblocks:** [86](86-chat-workflow-lightweight-submission.md), [87](87-chat-workflow-recoverable-steps.md), [88](88-chat-workflow-ordinary-chat.md).

**Inherited from 83:**

- Migration `20260914165546_agentic_chat_workflow_prompt_snapshot.sql` was applied to
  production on 2026-09-15. It was already present on the isolated QA database.
- The repository's Supabase link points at production. Target QA only through a
  workdir linked to the QA ref.
- 83's role and output contract is recorded in the contract proposal.

**Progress (2026-09-14):**

- DJ waived the stabilization gate as a freeze prerequisite. The
  [contract](../docs/architecture/agentic-chat-workflow-v1-contract.md) is **interface
  freeze ready**, and section 16 lists every amendment.
- Migrations `20260914203007` (storage) and `20260914203008` (dispatch/recovery) are
  applied to both production and the isolated QA database.
- Readers are in place. `executionInput.load()` refuses v4, and
  `loadRawWorkflowInput()` re-verifies it. The shared contract lives in
  `packages/shared-types/src/agentic-chat-workflow-contract.ts`.
- All required-proof items below pass in the self-contained SQL contract and the
  worker Postgres race test.
- **Remaining:**
    - ~~include the three production-applied migration files~~ done 2026-09-18 (`bd356380b`);
    - preserve the gate history as failed/invalid evidence: the 46/52 run exposed
      Case 7 and Case 14 defects, and the later 40/52 run was contaminated by a second
      gate sharing QA. Focused repairs are verified, but live acceptance remains
      unproven. Do not run another combined gate per DJ's September 15 direction;
    - review consumer integration as schema owner, including regenerating
      `packages/shared-types/src/database.schema.ts` when 86–88 begin consuming the new
      tables/RPCs. The versioned workflow contract remains the current application boundary.

Exception to the runtime start condition: a reproduced, minimal existing-schema
repair required by 84 belongs to the 82/84 stabilization change set and can be
implemented there by this schema owner. New workflow schema still waits.

## Outcome

Provide one typed, versioned contract and persistence layer that admission, runner,
recovery, and UI agents can implement against. New workflow execution remains off
until consumers and durable dispatch metering are ready. Existing prepared turns
continue to work. This task owns schemas and storage invariants; 86 owns request
handling/context assembly and 87 owns the running scheduler/provider integration.

Read [81](81-chat-workflow-implementation-program.md), architecture sections 3–6,
the current worker contract and latest effective SQL function definitions. The
architecture's older persistence table description does not supersede its explicit
v4 raw-request/separate-prepared-context decision. Record the corrected contract
in durable documentation rather than copying that inconsistency.

## First handoff: freeze interfaces

Create `docs/architecture/agentic-chat-workflow-v1-contract.md` with TypeScript/JSON
examples, SQL RPC signatures, state transitions, error codes, size bounds and hash
rules. Use proposed names only until reconciled with existing schema. Collect the
bounded role shape from 83, delivery acceptance interface from 84, preparation needs
from 86, runner/cost needs from 87, and UI projection needs from 88. Then notify
the coordinator **interface freeze ready**. Consumers may code against it before
migrations integrate, but must not independently change it.

The freeze must cover:

1. **Raw input:** distinct `agentic_chat_input_v4`, immutable non-null artifact ID,
   admitted text, project/session references, bounded frozen history, server policy,
   review intent, optional cache reference and canonical hash. Same idempotency ID
   with changed scope/intent/content conflicts. Keep v3 writer behavior and v2 readers.
2. **Prepared context:** immutable checkpoint tied to request hash, context identity,
   evidence versions, preparation version and size limits. Accept under processing
   token + execution generation + cancellation checks. Access revocation prevents
   use; a retry cannot silently refresh evidence or overwrite an accepted checkpoint.
3. **Plan and steps:** persisted fixed plan/hash; stable step IDs/dependencies,
   attempts, claim generation, accepted result/hash and bounded evidence. Unique
   `(turn_id, plan_version, step_key)`. Cap each result at 128 KiB for the pilot.
   Separate execution status from complete/partial quality outcome.
4. **Physical dispatch ledger:** unique dispatch identity per actual network attempt,
   turn/step/attempt correlation, atomic reservation, usage settlement, uncertain
   exposure and idempotent reconciliation. Include planner, specialist, editor,
   corrective calls and provider fallbacks; no tools are enabled in this pilot.
5. **Stream/terminal projection:** preparing/assessing/executing/synthesizing progress,
   accepted findings, retry/recovery state and truthful terminal outcome. Define
   durable text identity/offset, accepted synthesis checkpoint and replay rules.
   Coordinate atomic checkpoint-plus-progress acceptance with 84 so events are
   neither lost nor persisted twice. Specialist drafts never become assistant deltas.
6. **Recovery and retention:** explicit server-enforced read-only policy; fixed
   whole-run deadline, durable attempts and budgets; atomic requeue + generation
   transition. Ordinary mutating turns retain their current rules. Retention and
   deletion cover requests, context, results, observations and cost records.

## Implementation

- Own changes in `packages/shared-types/src/agentic-chat-worker-contract.ts`,
  `chat-workflow-prototype.ts`, generated database types, dedicated workflow-store
  interfaces, and `apps/worker/src/workers/agentic-chat/turn/execution-input.ts` readers.
  Add an explicit prepared/raw input union. The ordinary direct provider rejects raw
  input; the workflow path cannot dispatch without accepted context and reservation.
- Add versioned atomic raw-admission support, prepared-context acceptance, step
  claim/result acceptance, cost reserve/settle/reconcile, and read-only recovery
  storage operations. Reuse existing queue/turn/stream authorities. Prefer short
  transactions; no model request or context network read inside a transaction.
- Keep auth/scope/session locks, duplicate-before-capacity ordering, cancellation,
  active-turn limits and immutable-artifact checks in the raw-admission transaction.
  Fresh history must be frozen with its concurrency check, not trusted from browser
  input or a stale unverified pre-transaction read.
- Choose finite budgets from 81's proposals, with deterministic worst-case reserve
  rules for the configured provider/token accounting. A missing price must have an
  explicit fail-closed dispatch policy. Spending limits do not claim to prevent all
  provider overruns; preserve actual overrun receipts and block additional spending.
- Add service-only grants and parent-turn authorization/fencing to mutation RPCs,
  RLS for exposed tables, owner-scoped read access only where needed, and bounded
  metadata. Explicitly test PUBLIC/anon/authenticated access and cross-user attempts.
  Load the Supabase skill, inspect the installed CLI and current docs, and create
  migrations with its supported workflow. Never alter an already applied migration.
- Implement readers and storage first, with new web writers/recovery activation off.
  Document forward/rollback ordering: flags stop new work; accepted v4 work still
  requires compatible readers/recovery until it drains or is explicitly terminalized.

Use current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
and check the [changelog](https://supabase.com/changelog) when implementing. Grants
and row policies are separate controls. Keep application state in application-owned
tables; this task does not need custom objects in the managed Realtime schema.

## Required proof

Use a disposable PostgreSQL fixture plus the isolated QA schema; no production
migration or database reset. Extend the narrow admission/recovery/input lifecycle
Postgres test lanes instead of rebuilding unrelated migration history.

- v2/v3 compatibility; valid v4 pending preparation; invalid versions/hashes rejected.
- Duplicate admission under concurrency creates one request/message/turn/job, even
  at capacity; changed payload conflicts; cross-user/project/session access rejected.
- Concurrent context acceptance chooses one immutable checkpoint; stale/cancelled
  workers cannot replace it. No model dispatch is possible with only a raw artifact.
- Duplicate step claims/late completions cannot replace accepted results or duplicate
  progress. A persisted result survives a lost RPC response and is read back correctly.
- Concurrent reservations cannot oversubscribe available budget/headroom. Duplicate
  settlement is idempotent; unknown charges remain held across recovery.
- Recovery is atomic, bounded and read-only; ordinary post-start mutation retry
  remains denied. `retain_until`, stalled detection and total deadline are distinct.
- Parent deletion/retention and role grants behave as documented, with no cross-user
  visibility of prompts, checkpoints or provider details.

Coordinate heavy validation through 81. Run narrow SQL/reader tests and relevant
typechecks, then the coordinator's full Agentic Chat gate with writers off. Return
contract examples, migration/rollback sequence, RPC concurrency proof and reader
compatibility results. Task remains the schema owner through consumer integration;
storage acceptance alone does not claim that recoverable workflows are running.
