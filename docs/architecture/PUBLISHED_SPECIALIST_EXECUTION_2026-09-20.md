<!-- docs/architecture/PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-20; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Explicit published specialist execution

Implemented after Tasker 91; required database migrations applied to production September 20
(verified September 21 at 01:02 UTC). App deployment and feature activation remain pending. This connects the specialist workbench to the durable
Workflow Lab review, using one explicitly selected specialist alongside the existing risk reviewer
and editor. It does not introduce arbitrary workflow graphs or Jev routing.

## User flow

1. Save and publish a specialist at `/workflow-lab/specialists`.
2. At `/workflow-lab`, select a project, an exact specialist name/version, and a question.
3. Run the specialist review. The composer shows the selected version. `/workflow` and the
   Organize documents action use it; ordinary messages and project reviews keep their existing behavior.
4. Inspect the real session through Tasker 91's Logs, Trace, and Export actions. The raw specialist
   snapshot includes the complete published version, reference packet and hashes, and execution slots.

Publishing remains catalog-only. Only an explicit version selection admits a custom run; editing
or publishing another draft version does not alter admitted work. Choosing the built-in option
preserves the Lab's existing project-review path.

## Runtime boundary

- The browser sends only `{draftId, version, snapshotHash}`. The verified server reads that exact
  owner-scoped immutable version. SQL checks ownership and the complete catalog binding again
  inside admission, then copies it into `chat_turn_specialist_snapshots`.
- The executable snapshot is `agentic_chat_specialist_snapshot_v3`, selector
  `explicit_published_specialist`. Old workers reject it before provider dispatch. New workers
  require a separate default-off flag and validate all hashes, the pinned definition, and
  host-owned model, output contract, capability, budget and retry limits.
- This supports document profile 2 (parallel independent reviewer) and profile 3 (sequential
  reviewer sharing the frozen document evidence), under the existing evidence-handoff flag.
- Custom reference knowledge is supplied only to the selected specialist, labeled as untrusted
  reference material. It is not added to the project evidence index or treated as project-state
  citations. The reviewer retains its independent evidence view. The editor receives accepted reports.
- Document reads are optional per published definition. Both the worker's advertised tools and
  the database read RPC enforce the allowlist. Bounds remain one batch, at most four inventory
  documents, 6,000 characters / 12 KB serialized text per document, with current project access
  and the existing durable execution fence.
- Model calls and spending policies retain the existing workflow caps. Extra reference knowledge
  consumes input tokens within that budget; it does not add dispatches or a new allowance.
- Retry conflicts are explicit for changed published versions and built-in/custom swaps. Ordinary
  duplicate requests retain their original snapshot. Worker recovery reads only the run's copy,
  never the latest catalog version or draft.
- Jev shadow observation is skipped for explicit custom selection; its current candidate roster
  describes built-ins. Existing built-in shadow behavior remains unchanged.
- Admission adds one owner-scoped catalog read to the existing admission RPC. Lab loading fetches
  only version metadata, in parallel with projects, without mutable drafts or knowledge packets.

## Rollout order

Database steps 1 and 2 were completed on production `build_os` (`iwifjtlebphefldmwbkh`) after
DJ requested application. Both original ledger entries and exact SQL sources committed atomically.
Continue with deployment at step 3. No app deployments or feature flags changed during migration
application. Do not reapply these migrations or run a blanket `db push` with unrelated pending work.

1. Verify/apply `20260920154843_agentic_chat_document_evidence_handoff_v1.sql` if still absent.
   The workbench migration `20260920162616_agentic_chat_specialist_workbench_v1.sql` was previously
   applied and verified; do not reapply it.
2. Apply `20260921002731_agentic_chat_published_specialist_execution_v1.sql` and record its exact
   original migration identity. It extends the existing snapshot bound to 192 KiB for v3 only,
   adds the owner-bound admission wrapper and insert guard, and extends read authorization.
3. Deploy the worker/runtime, then web. Existing specialist, read-tool, workflow preparation,
   execution, admission and account-cohort gates still apply.
4. Enable `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED=true` on the worker first, then web.
   Keep evidence-handoff off to test profile 2 initially; enable it separately when ready.
5. Test one published version from the allowlisted account and inspect its Tasker 91 trace/export.

Rollback: disable web admission first and drain admitted custom runs with the compatible worker.
Disabling the worker flag immediately fails queued/resuming custom runs before further model work;
it is a stop switch, not a graceful drain. Keep the immutable snapshots and additive migration for
audit and recovery. Do not roll back to an old worker while custom runs remain active.

## Validation

Validation passed locally: 191 focused tests (27 runtime, 103 web admission/client/Lab,
39 workflow PostgreSQL integration/regression, 7 catalog PostgreSQL, and 15 worker configuration).
Runtime package build, worker typecheck, web Svelte check (zero errors/warnings), and diff whitespace
checks also passed. The initial SQL syntax and test-fixture failures were corrected before these results.

Focused runtime, route, client, catalog, and disposable PostgreSQL tests use scripted model replies;
no paid research, live inference or full Agentic Chat QA gate was run. The QA gate remains explicitly
deferred by DJ, and these checks are not a production gate pass.

Tests cover exact frozen knowledge after draft edits/new publications, duplicate and changed-version
submission, both evidence profiles, tool-disabled enforcement, flag-off refusal before inference,
owner isolation, tampered definitions, and unchanged built-in document behavior. A fresh store loads
the saved custom version and read batch without consulting the catalog. These checks do not establish live model quality or deployed-service compatibility.

## Production migration verification — September 20

Applied together with a five-second lock timeout, a sixty-second statement timeout, baseline
function checks, and schema-cache reload. No workflow runs were active at application time.
The existing workbench migration was verified and left intact.

| Original migration ID | Name                                             | Source SHA-256                                                     |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `20260920154843`      | `agentic_chat_document_evidence_handoff_v1`      | `6e08a4c41c3f8c06e04e78f6027dad1629993080feeb031a4a3b03d77940792f` |
| `20260921002731`      | `agentic_chat_published_specialist_execution_v1` | `3820af3e2054c5d907fe7f0e8d879d18592183a53fef9b88a0fd3f1786565861` |

Verified after commit at `2026-09-21 01:02 UTC`:

- Exactly one ledger entry for each migration; original file and recorded source hashes match.
- All 23 installed function bodies match the intended final source, including functions superseded
  by the second migration. Their search paths are fixed, security is invoker, and execution is
  denied to browser roles while granted to service role.
- All three changed constraints validate, both new triggers are enabled, and `input_evidence`
  exists. Relevant table RLS remains enabled.
- Profile 2 still selects the original project-review plan. Profile 3 selects the evidence plan,
  reviewer dependencies are planner + organizer, and concurrency is one.
- Security advisors show no warnings for changed objects. Informational
  [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  entries are expected for these existing service-only tables; no browser policies were added.

No model calls, synthetic persisted records, paid research, full QA gate, deployments, or flag
changes were needed for this database application.

## Next implementation

After a small live specialist review: curate a handful of real specialist definitions and example
questions, then let Jev choose from that eligible versioned roster before admission. Persist its
choice once, honor explicit selections, and retain host-owned tool/spend constraints. Additional
specialist tools and workflow entry points should follow concrete domain needs observed in these runs.
