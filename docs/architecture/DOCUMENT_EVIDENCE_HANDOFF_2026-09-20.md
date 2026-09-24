<!-- docs/architecture/DOCUMENT_EVIDENCE_HANDOFF_2026-09-20.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-20; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Shared document evidence — September 20, 2026

Implemented locally after the production pilot exposed the reviewer/organizer evidence mismatch.
The account-only pilot remains on the previously deployed profile. This change has no new paid
model calls or production configuration changes. The migration was exercised in disposable
local PostgreSQL and **applied to production September 20** alongside published specialist execution.
See [production verification](PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md#production-migration-verification--september-20).
Enabling the evidence-handoff feature remains a separate rollout step.

## Behavior and compatibility

New document organization reviews can use profile **3**, policy
`internal-document-organization:v4`, and plan `agentic_chat_document_evidence_plan_v1`:

1. Planner assigns the review.
2. `document_organizer@2` selects at most four documents in one bounded read batch and finishes
   its report (or exhausts its attempts).
3. `risk_reviewer@2` independently assesses the same accepted context and saved read results.
   Its input does not include the current organizer report. Full text, excerpts, unavailable reads,
   and inventory-only coverage remain explicit.
4. Editor combines the accepted reports and saved evidence. Its new assignment asks for document
   titles and `[[document:FULL_UUID|Document title]]` links, without bare/abbreviated UUIDs or
   internal agent chatter. Live answer compliance still needs a synthetic smoke.

The database and runner both enforce the ordering. A failed/skipped organizer permits review of
whatever sources were saved; no saved batch produces an explicit inventory-only handoff. Cancelled
runs and lost project access stop the workflow. Access is rechecked at step claim, reservation,
and immediately before provider dispatch for the new profile.

Older policies and snapshots retain their original parallel plan, definitions, and recovery.
Ordinary project reviews are unchanged. The new worker reads the additional column only for the
new policy, so it can be deployed with the admission switch off before schema rollout.

## Durable binding

The first reviewer claim atomically saves `chat_turn_workflow_steps.input_evidence`, containing
its version, accepted context ID/hash, saved read-result hash (or explicit null), and the organizer's
terminal status. Existing immutable context/read rows remain the source of document bodies.
A trigger validates this binding and prevents replacement. Later reads cannot appear after the
handoff is pinned. Claimed reviewer work requires a binding.

The claim receipt returns the binding, avoiding another database round trip in the normal path.
The worker verifies it against the exact context, read batch and terminal organizer on use and
recovery. Retries reuse the binding. Recovery never reloads live document bodies or asks Jev for
another decision. Jev remains shadow-only; `document_read` audit metadata now identifies the
new reviewer accurately when that profile was admitted.

There are still four model requests without a read, or five with the organizer's read continuation
(on the happy path). Attempt, physical dispatch, payload, spending and synthesis-headroom limits
are unchanged. Specialist concurrency is now one for this profile. The reviewer receives more
input tokens and starts later; expect some additional cost and latency. The prior live document
smoke was 36.522 seconds and $0.003512 for the workflow. No new live measurement is claimed.

## Validation

**128 focused free tests pass:**

| Scope                                                 | Passing tests |
| ----------------------------------------------------- | ------------: |
| Disposable PostgreSQL, both old/new document profiles |            33 |
| Evidence binding corruption and no-read coverage      |             8 |
| Workflow runner                                       |            27 |
| Jev shadow bundle contracts                           |            15 |
| Worker configuration                                  |            15 |
| Web admission and independent gates                   |            12 |
| Versioned specialist snapshots                        |            11 |
| Shared request/policy contract                        |             7 |

Database tests cover exact evidence, read truncation/unavailable sources, no domain writes,
failed/no-read organizers, immutable claim replay, restart after reading and after pinning the
handoff, no repeated document read or Jev decision, cancellation, revoked access, budget exhaustion,
and worker gate denial. SQL policy/plan JSON matches the TypeScript contract; evidence helpers
remain service-only. Scripted responses test transport/contract behavior, not real-model quality.

Shared-types/runtime builds and worker typecheck pass. Full research and `pnpm agentic:gate`
remain deferred by DJ. No claim of full QA or a fixed live regression is made.

## Rollout and rollback

Migration: `supabase/migrations/20260920154843_agentic_chat_document_evidence_handoff_v1.sql`.
It adds one nullable private column, service-only helpers, a v4 admission RPC, and policy-aware
versions of the existing fixed-plan RPC bodies. No document data is rewritten. The preceding
three specialist migrations must exist, including the shadow migration already verified in
production. This repository has ledger drift: apply this exact migration transactionally and
record its version, **do not use a blanket database push**.

1. Apply and verify the additive migration, including function bodies/privileges and ledger entry.
2. Deploy this worker source with `AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED=true`, keeping
   the existing specialist, document-read, execution and account-cohort gates. Wait for all new
   replicas to be healthy and older worker replicas to drain.
3. Deploy this web source with the same new flag true; retain the existing account-only cohort.
   The new flag requires document-read and specialist admission gates too. It defaults to false
   in both applications.
4. Repeat the three-document synthetic workshop smoke from the pilot. Inspect reviewer findings,
   final document links, saved binding/read hashes, dispatch count, cost, latency, and History
   restoration. Confirm that the reviewer uses the supplied bodies and does not ask to fetch them.

To roll back new admissions, disable the **web** handoff flag and redeploy. New reviews return to
profile 2. Keep the new worker code and its flag enabled until admitted profile-3 runs finish;
then disable the worker flag or roll back its source. Leave the additive schema and ledger intact.

## Next implementation

Build the small specialist workbench and bounded knowledge loader described in
SPECIALIST_NEXT_IMPLEMENTATION_2026-09-20.md.
Actual Jev routing needs its own durable selection checkpoint before the executable profile is
frozen. Cross-turn evidence reuse is separate: recheck access and freshness before importing
previous immutable source evidence; previous assistant prose is not verified source material.
