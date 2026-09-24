<!-- docs/architecture/DOCUMENT_ORGANIZATION_SPECIALIST_2026-09-19.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Document organization specialist

The document specialist now has two immutable versions: inventory-only `document_organizer@1`
and bounded document-reading `document_organizer@2`. Choose **Organize documents** in the
project-wide chat composer, edit the proposed question, and send it. The workflow combines
that specialist's findings with an independent risk review and returns one proposed structure
in chat. The action never moves, renames, merges, or deletes documents.

## Scope and evidence

The initial context contains bounded document inventory metadata (titles, state, timestamps),
structure summary, and coverage metadata. The context loader currently includes up to 20
selected documents, with total/returned counts. The inventory-only profile does not fetch document bodies. Profile 2 may read a selected batch
using the tool described below.
Document evidence is retained ahead of task evidence when the workflow's own context bound
requires trimming. Prompts explicitly distinguish titles/summaries from full text, require
record IDs for evidence, and require disclosure of incomplete inventories.

The planner, organizer, independent reviewer, and editor share the existing $0.25 / 15-minute
ceiling. Profile 1 is tool-free; profile 2 grants the organizer one explicit read tool. The two specialists can run concurrently. Selection is fixed
and free; Jev is not called.

## Durable adapter

The original inventory-only profile uses these bindings; the read-capable extension is below.

This is a **versioned profile on the existing v1 execution engine**, not an arbitrary agent graph.
Existing project reviews still use their pinned v1 definitions and make no new snapshot reads.

- Request policy reference: `internal-document-organization:v2`, included in the immutable request hash.
- Snapshot version: `agentic_chat_specialist_snapshot_v2`; profile `document_organization@1`.
- Execution slots remain `planner`, `project_analyst`, `risk_reviewer`, `editor`. The profile
  explicitly maps `project_analyst` to `document_organizer@1` and `risk_reviewer` to `risk_reviewer@1`.
- Snapshot contents include exact specialist definitions, fixed selector identity/version,
  slot assignments, and planner/editor instructions. One canonical SHA-256 hash covers the
  complete snapshot, including every definition. Model routing/timeouts remain the frozen
  host policy; validation rejects incompatible declarations rather than pretending to honor them.
- `create_agentic_chat_document_review_turn_v2` atomically calls the existing admission RPC
  and inserts `chat_turn_specialist_snapshots`. The service-only table binds the snapshot to
  the admitted run, owner, session, project, and request hash. Updates are forbidden.
- A matching retry preserves the original snapshot even if the incoming catalog changed.
  Context and the accepted plan/results retain their existing immutable storage and fences.
- Preparation and recovery validate saved contents before execution. Missing, unsupported,
  or corrupt snapshots fail closed. Recovery reads saved instructions, rechecks project
  access, reuses accepted evidence, and skips accepted specialist work.
- Public progress contains the selected specialist's label, never its private instructions.
  The existing `reviewMode: project_review` response and public projection schema remain
  compatible; the saved profile is private execution authority.

The worker caches validated snapshots per store instance (bounded to 128 entries), avoiding
repeated reads during checkpoints. Ordinary reviews retain the same prompt bytes and roster.

## Rollout

Migration: `supabase/migrations/20260920010743_agentic_chat_specialist_snapshots_v2.sql`.
It has been exercised only in disposable local PostgreSQL, not applied to a hosted database.

Keep `AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED` off until the migration and matching web/worker
code are deployed to **all** worker replicas. Set it to exactly `true` on web and chat worker
when enabling this profile. Existing prerequisites also apply:

- Web: `AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED=true`.
- Worker: `AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED=true` and
  `AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED=true`.
- Both: the intended user in `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS`.

The capabilities endpoint exposes a separate `documentOrganization` boolean. Admission
rechecks all gates and never silently falls through to ordinary chat. To stop new admissions
while existing work drains, turn off the web specialist flag first; turning it off on the
worker fails pending document profiles before model calls. Before rolling back to an old
worker binary, drain these runs or terminalize them with the current worker: old binaries
do not know the new profile. Do not remove snapshots while runs can resume.

## Inspect and verify

`pnpm --filter @buildos/worker specialists:preview` prints all four versioned definitions and both
profile hashes. `--json` includes both full document-organization snapshots. No credentials,
database connection, or model request is required.

Focused tests cover the composer/transport gates, atomic admission, immutable/private storage,
duplicate preservation, invalid/missing snapshots, document evidence prioritization, planner
fallback, named progress, no domain writes, and recovery in a fresh worker without repeating
accepted work. Provider responses are scripted, so these prove orchestration and persistence,
not recommendation quality. The full hosted Agentic Chat gate remains deferred by DJ.

Inventory-only milestone validation: **192 focused tests passed** across runtime definitions (18), worker
preparation/execution/configuration (69), web composer/transport/admission (97), and disposable
PostgreSQL workflows (8). The runtime package builds with type declarations; worker typecheck
passes; the required web `check` reports **0 errors and 0 warnings**. The catalog JSON preview
also runs locally. No paid inference was used. This is not the deferred hosted QA gate.

## Bounded document reads: implemented locally

`document_organizer@2` can call `read_project_documents` through the provider's native tool
protocol. Only the organizer receives the exact registered tool schema; the planner, reviewer,
and editor stay tool-free. The tool is optional: an inventory-only answer still uses four model
passes; a successful read adds one organizer continuation, for five normal passes total.

- Request policy: `internal-document-organization:v3` / `agentic_chat_document_read_policy_v1`.
  Its explicit `modelTools: bounded_document_read_v1` permission is part of the request hash.
  Old policy references, snapshots, prompts, and recovery keep their prior behavior.
- Snapshot profile: `document_organization@2`, with `document_organizer@2` in the existing analyst
  slot. `create_agentic_chat_document_review_turn_v3` admits the request and snapshot atomically.
- Limits: one batch per run, up to four inventory documents, at most 6,000 characters and
  12,000 JSON-encoded content bytes per document. Results distinguish full text, excerpts, empty,
  unavailable, changed, unverifiable, and out-of-inventory documents. Large Unicode or escaped
  content may truncate before the character limit. The inventory itself remains bounded.
- `read_agentic_chat_documents_v1` checks the active queue lease, execution generation,
  cancellation, deadline, specialist attempt, current project access, saved capabilities, and
  accepted evidence version. A foreign document ID never causes a document lookup. Changed
  content is not attached to old evidence. This RPC performs no domain writes.
- One immutable `chat_turn_document_read_batches` row stores the result, original document IDs,
  request binding, attempt/generation, and canonical hash before the worker receives it. A lost
  receipt or worker restart reuses that saved evidence; it never refreshes the text silently.
- The organizer sees native tool-result history; the editor receives the saved evidence with
  accepted reports. The parallel reviewer has inventory evidence only. Tool content is labelled
  untrusted evidence. Every claim must still cite accepted document IDs.
- Continuations retain the same two-physical-request limit per step attempt and the same shared
  spend, lifetime, and request-size bounds. Their distinct logical rounds preserve usage receipts;
  the ledger records them as specialist calls. A provider fallback can consume the continuation's
  remaining request allowance; existing partial-answer behavior handles that limit.

Additional migration: `supabase/migrations/20260920032259_agentic_chat_document_read_tools_v1.sql`.
Apply the snapshot migration first. Both migrations are **local only**. This step changes no
production flags and performs no paid inference.

`AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED` defaults off. After migration and compatible code
reach every web/worker replica, set it to exactly `true` on web and worker alongside the existing
specialist/workflow gates. With only the web flag off, new requests use the inventory-only
profile while existing read-capable runs can drain. Turning it off on workers fails pending
profile-2 runs before model calls. Drain these runs before rolling back a worker binary.

The preview now includes both organizer versions, both snapshot hashes, and read limits.
Local scripted PostgreSQL tests cover native tool dispatch, distinct metering/usage, access and
lease fences, cancellation, immutable storage, malformed calls, Unicode bounds, no domain writes,
lost-receipt recovery, worker gating, and older profile compatibility. These establish mechanics;
recommendation quality still needs a separately authorized live smoke. The full gate stays deferred.

Read-tools change validation: **253 focused free tests passed** (17 disposable PostgreSQL,
181 worker/provider regression, 30 web admission/route, 19 specialist runtime, 6 shared contract).
Runtime build, worker typecheck, and the JSON catalog preview pass. Web `check` reports
**0 errors and 0 warnings**.

## Next implementation boundary

Jev **shadow selection** is now [implemented locally](JEV_SPECIALIST_SHADOW_2026-09-20.md) over
eligible specialist/tool bundles: record a versioned
selection receipt alongside the fixed choice, compare it with the deterministic baseline, and
leave execution authority in host code. Promote routing only after the comparison is useful.
User-authored definition editing, arbitrary specialist counts/dependencies, specialist knowledge
loaders, and document mutation workflows remain separate work.
