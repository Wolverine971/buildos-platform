# Libri frontend Supabase catalog shadow

Date: 2026-09-01 EDT
Status: database boundary live; frontend adapter committed on local `main`; credential and deployment intentionally pending

## Outcome

The first frontend cutover seam reads the migrated catalog from Supabase without placing the
BuildOS project-wide service-role key in the separate Libri Vercel application.

Libri commit `d23a5a0` adds an admin-only shadow endpoint at
`GET /api/internal/libri/catalog-shadow`. The existing Convex session remains only as a temporary
authentication gate. The endpoint performs no writes and does not replace a visible route yet.

The adapter maps Supabase books, people, author links, domains, and book-domain links into the
existing Convex homepage list shape. It preserves titles, slugs, authors, domains, ownership,
indexing state, completeness, ISBNs, and creation time. Cover URLs intentionally remain `null`
until private Storage signing is added; this prevents a premature visible cutover with broken
images.

## Shared-database boundary

Production migration `20260902025903_libri_frontend_catalog_read_boundary` is applied. The
separately provisioned `libri_frontend_reader` login:

- is capped at three database connections;
- has no superuser, database creation, role creation, inheritance, replication, bypass-RLS, or
  role-membership capability;
- defaults transactions to read-only with a 2-second lock timeout, 10-second statement timeout,
  and 10-second idle-in-transaction timeout;
- can select only the exact columns used by the adapter from `libri.books`, `libri.people`,
  `libri.book_people`, `libri.domains`, and `libri.book_domains`;
- cannot select `library_id`, write a catalog row, use a sequence, or read `public.queue_jobs`; and
- is restricted by forced RLS to library `f09948c4-e4e0-581c-8689-7258bea2f501`.

The role currently has no password, so the new database path is inert. No Libri Vercel secret was
created and no release was deployed from this slice.

## Performance posture

The Vercel adapter uses the Supabase connection pooler, one connection per warm server instance,
prepared statements disabled, a five-second idle timeout, and strict CA-backed TLS verification.
The five catalog queries use existing library-leading indexes and explicit fail-closed limits:

| Relation          | Maximum rows |
| ----------------- | -----------: |
| Books             |        1,000 |
| People            |        2,500 |
| Book-person links |       10,000 |
| Domains           |        1,000 |
| Book-domain links |       10,000 |

Current production cardinalities are 85, 97, 103, 26, and 211 respectively. This is intentionally
a bounded snapshot seam, not the final pagination/search API.

Adding the isolated login causes Supabase's performance advisor to enumerate existing permissive
`PUBLIC` policies against the new role on unrelated BuildOS tables, just as it does for
`libri_worker`. The reader has no grants on those tables, so those notices do not create access or
change BuildOS query plans. The new Libri policies do not produce a Libri warning-level security
finding.

## Verification

- Libri adapter unit tests: 3/3 passed.
- Libri Svelte/TypeScript check: zero errors and zero warnings.
- Libri Vercel production build: passed; the endpoint is server-only.
- Libri migration static firewall: 21 migrations accepted; 32/32 guard tests passed.
- Disposable PostgreSQL contracts: 38/38 passed, including exact column grants, five exact
  policies, hidden second-library rows, denied writes, denied BuildOS reads, and an unchanged
  BuildOS control row.
- Production postcheck: the migration receipt and five exact policies exist; `title` is readable,
  `library_id` is not, book writes are denied, and `public.queue_jobs` remains unreadable.
- The broader linked Supabase dry run remains blocked by two pre-existing remote-only BuildOS
  versions (`20260827133601` and `20260830200035`); this is existing repository drift and is not a
  Libri migration discrepancy.

## Next controlled steps

1. Land and pass CI for the BuildOS grant/RLS migration and Libri adapter commits.
2. Generate a random password for `libri_frontend_reader`, validate the session-pooler URL against
   the pinned Supabase root CA, and place only the scoped URL, CA, and library UUID in Vercel.
3. Deploy the shadow endpoint, sign in through the existing Libri admin session, and retain a live
   receipt proving exactly 85 books and 26 domains with representative field parity.
4. Add private cover signing and a server load for the homepage behind a default-off read-source
   flag. Keep the Convex query as rollback until the visible parity check passes.
5. Migrate book detail and search reads in small slices before moving any write path.

Do not create the reader password or deploy the endpoint until both repository commits and the CI
gate are green. Do not retire Convex during the shadow period.

## Original-app activity and current completeness (October 4)

The standalone Libri app now has a local-qualified replacement for owner activity
reads, search/book/chapter/domain activity logging, and live completeness. The original
screens and layouts stay in the Libri repository. Application activation remains off.

`20261004012951_libri_application_activity.sql` adds an append-only activity table with
forced RLS and owner-only reads. The session RPC pins `auth.uid()`, checks and locks
owner membership before any subject lookup, accepts only four explicit event types,
checks library/book/chapter scope, bounds text, and serializes duplicate calls. Clients
cannot directly append/update/delete events or supply an actor. The note trigger writes
one content-free creation event in the note transaction; a rollback removes both.
Imports without a user identity produce no new activity. Library and auth-user cascades
cover deletion without changing shared purge routines. Archived Convex events stay archived.

Security review of the rehearsal finding: `log_application_activity` is intentionally
callable by `authenticated`, because it is the original application's session write API.
The definer is necessary to keep raw event insertion unavailable to clients and to lock
membership for concurrent dedupe/revocation. It fixes its search path, rejects missing
identity and non-owner/foreign membership, validates subjects in that library, exposes
no arbitrary SQL or event type, and has no public/anonymous/worker/reader grant. The
note trigger has no client EXECUTE grant. PostgreSQL tests cover the negative boundaries,
revocation, note rollback/privacy, simultaneous dedupe, and actor/library deletion.

`20261004013540_libri_live_completeness_reads.sql` is a STABLE SECURITY INVOKER read with
caller RLS and 1–100 unique book IDs per call. It calculates the existing factor weights,
rounding, tiers and gaps from current canonical chapters, artifacts, sources, edges,
authors and visible notes. Archived OCR and rejected/superseded artifacts are excluded;
scans, uploaded files and transcript sources are not external-source points. Latest note
edits/count changes mark saved analysis stale. No old score is overwritten, and no
research queue or provider is invoked. The frontend requires a complete, validated score
response for each requested book, in bounded sequential batches. Catalog sorting and
book detail both use these current scores. Research-gap task lifecycle still needs its
own replacement; this read does not claim to migrate it.

Local PostgreSQL 16 contracts and the combined production-schema rehearsal pass. The
rehearsal has 36 intended Libri changes, no new client read failures, and both standing
shared-schema checks pass. Its one intentional session-definer finding is reviewed above.
The actual hosted PostgreSQL 15 CI gate and production application are still pending.
No hosted writes, provider calls, activation, or historical replay occurred here.

## Original book, chapter and prompt edits (October 4)

Migration `20261004015552_libri_manual_book_edits.sql` adds one session RPC for the
existing forms. The authenticated SECURITY DEFINER finding is intentional and reviewed:
atomic domain replacement, activity and versioned artifacts require a transaction, while
clients retain no raw artifact/activity write grants. The function fixes its search path,
checks `auth.uid()`, locks current owner membership before lookup, scopes every subject,
rejects unknown/bounded fields, and compares the exact saved timestamp under a row lock.
Anonymous, service, worker and reader execution are revoked. Existing shared permissions
and private-note policies are unchanged.

Book edits keep established URLs stable, normalize title/ISBN matching, and replace scoped
domain links atomically. Chapter edits retain order and research/evidence. Both add one
content-free activity event and mark saved book analysis/knowledge documents outdated
without deleting them. Prompt edits require both profile and current-artifact versions,
retain the prior artifact, increment versions, and hash the manually saved content.
No provider or queue calls occur. Automatic knowledge rebuilding and research-gap task
lifecycle still require the replacement worker before activation.

Local qualification: the disposable PostgreSQL contract covers actor/scope denial,
invalid fields, stale edits, rollback, normalized domains/ISBN/accented titles, retained
research and prompt provenance. Three real concurrent/rollback tests prove one winner
for edits by different owners and for simultaneous first-prompt creation. Rehearsal
against the fresh production schema passes both standing checks and adds no role-read
failures; the two intentional client-definer findings (activity and editing) are reviewed.
Exact-head PostgreSQL 15 CI, production application and hosted qualification remain pending.
Libri's original forms use `PRIVATE_LIBRI_CATALOG_EDITS_ENABLED`, still off by default.

## Research task management (October 4)

Migration `20261004021418_libri_research_task_management.sql` introduces current task
planning and manual status management. It does not import or activate the historical
Convex backlog. Tasks retain bounded type/priority/status, scoped parent references,
actor, immutable creation identity, exact edit versions, and an optional active run.
The original queue controls use a default-off `PRIVATE_LIBRI_TASK_WRITES_ENABLED` flag.
Research dispatch, gap generation, dashboard/run history and legacy archive reads remain
separate unfinished paths; the adapter never advertises unfinished dispatch as available.

The rehearsal's `manage_research_tasks` authenticated SECURITY DEFINER finding is
intentional and reviewed: task/activity writes must commit together without raw client
write privileges. The fixed-search-path function checks and locks current owner membership
before lookup, pins actor/source, validates scoped parents, and serializes bounded task
mutations across owners. An idempotency key only replays the same creator/payload; changed
requests conflict. Exact versions and deterministic locks make bulk edits atomic. A task
linked to any worker run refuses manual changes. Future dispatch must use the same library
then task lock order and clear the active link only when its run terminates. Read pagination
is an invoker RPC under member RLS; internal creation payloads never leave the function.
There are no queue/provider writes, new worker grants, or shared-schema changes.

The local SQL contract covers owner/editor/revoked/cross-library denial, idempotency,
bulk rollback, exact counts/filtering/priority/pagination, preserved actor and activity.
Four real concurrent/rollback tests pass, including competing owners and active-run
protection. The combined production-schema rehearsal passes both standing checks, with
the same pre-existing anon failure and no authenticated read failures. All three
intentional session-definer findings (activity, edits, tasks) are reviewed here.
Hosted PostgreSQL 15 CI, production application and full original-queue qualification
are pending. No historical work, live provider call or hosted task was created.

## Bounded current-task admission and durable dispatch (October 4)

Migration `20261004022726_libri_research_task_dispatch.sql` adds per-library controls,
immutable batch manifests, and owner-authorized admission to the existing fenced worker
lifecycle. Controls default disabled with no supported task types. Admission serializes
owners against a conservative UTC daily reservation cap, pins actor/request identity, and
creates bounded runs plus pending root steps atomically with task status and activity.
A replay only returns the same actor/payload receipt. Unsupported/manual tasks and
unconfirmed tasks are excluded. No archived work is imported or made runnable.

The session-callable `admit_research_task_batch` SECURITY DEFINER finding is intentional
and reviewed: it checks `auth.uid()` and locks current owner membership, then the library
and controls before task selection. Search paths and grants are explicit; users cannot
write controls, manifests, runs or steps directly. The other new definer functions are
worker-only or trigger-only. Member reads use forced RLS. The acknowledgement's sole
shared-table access is a reviewed read of `public.queue_jobs`; only a Libri receipt is
written. It requires matching family, IDs, actor, dedup key, payload/correlation metadata,
state and processing token. Nullable mismatches fail closed. A never-enqueued step
retired by bounded authority reconciliation is recorded as a failed task, not success.

The worker dispatcher validates manifests, uses the existing atomic queue lifecycle,
and reconciles lost replies from stored state and independent queue evidence. Enqueue
and claim recheck current owner membership, supported type, dispatch switch and deadline.
All claimers lock the run before counting leased steps in a fresh statement snapshot;
a full run defers its queue item without spending an attempt. Expired/revoked queued
steps fail without a lease/provider attempt. Bounded reconciliation clears task ownership
when a pending admission expires before enqueue. Completed root steps publish task
outcomes only while the task still belongs to that run.

This is infrastructure only: it is exposed on the database port but no runtime profile
polls it yet, and no production controls are enabled. Before activation, implement the
actual task processors, recheck execution authority at paid-call authorization, handle
child-step completion and cancellation, wire original app actions/history, and qualify
the sustained worker. No hosted task or provider call is part of these local checks.
The combined production-schema rehearsal passes both standing checks and preserves
role-probe results (one existing anon failure; zero authenticated failures). Four
intentional client-definer findings, including the three preceding migrations, are
reviewed here; worker-only execute notes are expected.

## Queue dashboard and historical run reads (October 4)

Migration `20261004024537_libri_research_queue_reads.sql` provides member-scoped invoker
RPCs for exact queue counts, bounded current task samples, and current/archive run history.
Dashboard counts are not truncated by a task-page limit. Failure samples retain the exact
microsecond edit version; execution start time comes from the real root step. Run list
summaries use stored/derived aggregate counts and load detailed outcomes only for one
selected run. Each history branch is limited before combining the newest results.

`research_queue_history` stores immutable import receipts separately from executable
runs and tasks. Members can read; authenticated clients and the worker cannot mutate it,
and the worker has no read grant. The archive has forced RLS and a current membership
policy. It retains original counters, bounded outcomes, timestamps and dispatch filters,
with source-record and archive hashes. No history row creates or links to executable work.
Legacy running records display as archived, and the app labels historical sources clearly.
The preserved August 29 export contains 2,606 queue runs; the app-side transform verifies
its recorded SHA-256 before extraction. Import is idempotent, refuses conflicting stored
records, and verifies every row after insertion. The archive ZIP remains unchanged.

These reads add no security-definer function or shared-schema mutation. The current
scheduler and task processors are still unqualified and disabled; UI reads must not
advertise an enabled scheduler. Final-delta history refresh and hosted qualification
remain part of the cutover gate.

## Paid-attempt recovery and execution authority (October 4)

Migration `20261004030625_libri_provider_attempt_fencing.sql` refuses a new cost
reservation after any earlier generation of that step reached `started` or `settled`.
Changing the reservation key or model does not bypass the check. A table trigger applies
the same rule to direct inserts and authorization updates, and checks current task-batch
owner membership, enabled dispatch/type, cancellation and deadline before paid authority.
The functions remain SECURITY INVOKER with fixed search paths and worker-only execution;
no new client privilege, SECURITY DEFINER function, or shared-schema change is introduced.

Expired-lease recovery now checks durable cost state under the step/run locks. It releases
only reservations that never started, then retries within the existing attempt limit.
A started or settled provider attempt is dead-lettered as
`provider_reconciliation_required`; known cost and unresolved holds remain intact. This
also covers a crash after result settlement but before normal step completion. No provider
is called by these tests. The executable SQL contract proves cross-generation and raw-write
replay denial plus owner/control/type revocation at authorization. Restricted-role PostgreSQL
recovery tests cover unpaid, unknown, and settled outcomes.

The production-schema rehearsal preserves both standing checks and role-probe results.
The four client-definer findings belong to the reviewed prerequisite migrations; the
attempt-fencing migration introduces none. Actual research processors and sustained
worker qualification remain required before activation.

## Production release receipt: activity through dispatch (October 4)

PR37–40 passed full repository CI and the PostgreSQL 15 Libri safety job at their exact
heads. Each prospective merge tree matched the qualified tree before merging. Releases:

| PR  | Qualified head                             | Merge                                      | CI run        |
| --- | ------------------------------------------ | ------------------------------------------ | ------------- |
| 37  | `c2d3e81e0dc15d1418b72a35c2e7aa3d2c9a84c0` | `1081e632352cbf11e96fdbd74817d80a5f176b3b` | `37171449439` |
| 38  | `ad246227c6512e1bb9ef93eb5c62fb8124180c16` | `f5d5cc825f4fd4ba7ded44b686bd8eb0d8d5f5a0` | `37171452494` |
| 39  | `fc9af8b3b65d2405b96fb3ea5611535ed24c2dcd` | `3850582cdeda112b0c8370ec8034331afe014219` | `37171457683` |
| 40  | `a4383c9fa85391dc0c27547fec2e2cd1cbbfdea4` | `30163b084bdf1d95085365ed869de2828f85f4ca` | `37171979732` |

Applied one exact file at a time and repaired history separately: versions
`20261004012951`, `20261004013540`, `20261004015552`, `20261004021418`, and
`20261004022726`. The fresh pre-release and post-release non-Libri fingerprint both equal
`2ecb98e613300c76fc40f21fb59b4080` over 10,489 signatures. All 40 Libri tables have
forced RLS; worker and reader remain non-super/non-bypass with connection limits of three.
All 408 private image rows and objects remain. Activity, tasks, batches, and enabled
libraries are zero: this release did not import historical executable tasks or activate work.

Security advisors show exactly the four reviewed new authenticated-only definer APIs
(`log_application_activity`, `edit_application_record`, `manage_research_tasks`, and
`admit_research_task_batch`). All other finding identities/counts are unchanged. These
are expected bounded RPC entry points with explicit `auth.uid()`/current membership
checks, not unreviewed privilege additions. No hosted user-data or paid provider test ran.

## Bounded book synthesis processor (October 4)

Migration `20261004031434_libri_book_synthesis_execution.sql` provides two worker-only
capabilities for an active fenced `synthesize_book` root step. The read derives the book
from the admitted step; it checks lease generation/token, task kind/type, current owner,
controls and deadline before returning bounded context. The completion repeats that
check and pins the reservation, queue/processing identity, book and model. Both functions
are intentionally SECURITY DEFINER to avoid granting the worker raw catalog, private-note
or artifact mutation access. They use fixed search paths, no client/service-role grants,
and no shared-schema access. The rehearsal's server-only notes are intentional; do not
add authenticated grants.

The prompt retains the existing analysis fields: overview, key ideas, chapter references,
people, terms, chapter insights, takeaways, questions, blind spots and measured coverage.
Reference IDs must exist in the input and linked idea IDs must exist in the output. Thin
evidence stays `insufficient_evidence`. Only shared notes enter this library-visible
artifact; private note bodies are never sent. Version-2 input snapshots record that scope,
and the app compares the same shared-note population while preserving legacy snapshot
semantics. Current summaries can be reused for 24 hours only when the source fingerprint
matches. Explicit force tasks create a new version.

The input includes a full revision fingerprint in addition to bounded samples. A changed
source at completion saves an `outdated` artifact. Versions are serialized on the book;
previous artifacts remain in history and dependent agent knowledge documents are marked
outdated. Rebuilding those documents remains a separate processor requirement.

The worker transaction holds queue/step/run ownership, persists the analysis and cost
settlement, completes the queue/root step, and updates the run/task outcome together.
Invalid settlement rolls everything back. Lost authorization, provider, or completion
replies require reconciliation; there is no automatic provider retry or model fallback.
The OpenRouter request uses the established private/ZDR policy, one allowlisted model,
4,500 output tokens, a 200 KB context bound and a 512 KB response bound. Usage cost and
request ID must be present; response models and structured references are checked.

API contracts were checked against OpenRouter's official [chat API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion),
[usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), and
[structured output](https://openrouter.ai/docs/guides/features/structured-outputs) documentation.
No pricing estimate or live model qualification is claimed. Before activating a sustained
profile, qualify its acting model and conservative reservation against provider pricing
and the configured run/day budgets under the repository's per-run paid-test approval rule.

Validation: 66 focused tests pass across synthesis, restricted-role PostgreSQL completion,
and database-port suites. The SQL capability contract denies raw/client access. Source and
test typechecks pass; source ESLint passes. Production-schema rehearsal preserves both
standing checks and role probes, with no new client-definer finding. This implementation
is exposed on the database port but no operating profile or admission switch is enabled.

## Queue history release and import receipt (October 4)

PR41 qualified at `c60b2998ee08bc5d892b8600d561a4e9eb38f6ff` in CI `37172510184`
and merged as `52b7ea97f7103c18e25712b4c5dc4880aae52c7f`. Migration
`20261004024537` was applied individually and recorded; its SHA-256 is
`1b42c62668575d3787735b6e316cc2ad7bb0fcef4a31670fa3c84b7df1a6511f`.
All 41 Libri tables have forced RLS. The shared-schema fingerprint remains
`2ecb98e613300c76fc40f21fb59b4080`; security findings are unchanged from the
reviewed activity-through-dispatch release above.

Imported and verified 2,606 archive-only queue receipts from the August 29 snapshot.
The source ZIP SHA-256 is `394b791860b04978af9bd58a22bdc19b0fa8d0aca80ba22a5cc3bc9dc2783bbc`;
the transformed bundle SHA-256 is `d60380eaaca7d35c3c889fe963f29612cf1a4bd0fc9e134f808b182896608a49`.
Dry-run planned 2,606 inserts; postflight verified all 2,606 with zero remaining inserts.
An authenticated member saw all 2,606 receipts through a bounded 50-row list and a real
120-outcome detail record. The worker cannot read the archive and members cannot insert.
No executable run/step was created by this import; current tasks/batches/enabled libraries
remain zero. All 408 image rows and private objects remain. This is historical preservation,
not the final Convex delta import.

Libri app PR6 (shared-note synthesis freshness) qualified at
`4aac1adbae8c303a1ab33e84155ac08fc6c61754` and merged as
`0006f15db92102c9b2893bec90e09e2f54d0fce5`. Production deployment
`dpl_9czzj3WQPvs8kEgQSqhcyNeDSkRJ` is READY and its build logs identify that merge.
The live backend remains Convex.

## Sustained research runtime (October 4)

The dedicated entrypoint now supports explicit `research` activation with one configured
model, a required conservative integer microusd reservation, and concurrency 1–2. It
rejects canary/admission overrides and retains disabled defaults. No environment or database
control is enabled by this change. Only `synthesize_book` is registered.

Startup validates the restricted worker's synthesis capabilities and every enabled library's
processor set and per-task reservation capacity before touching queues. The same readiness
check runs before claims and each maintenance cycle. The SQL claim filter selects implemented
`task_execute` payload types before taking ownership, leaving unsupported tasks untouched.
Database authority is still rechecked at claim, paid authorization and persistence.

A serialized loop recovers at most 10 stale research leases and drains at most five admitted
batches per cycle (default five seconds). The existing consumer owns bounded claims, heartbeats,
provider timeouts and atomic processor completion. Recovery is limited to `libri_research`;
other queue families are untouched. Maintenance failures degrade readiness without exposing
raw database errors, and later successful cycles restore it. Shutdown aborts dispatch, begins
provider/claim draining immediately, and waits for all owned database work before pool closure.

Validation: 90 focused unit tests and 17 disposable PostgreSQL integration tests pass.
The integration uses the actual restricted role to run admission → outbox → consumer →
simulated provider → saved artifact/task/cost, then restarts and reuses the analysis without
a second provider call. It also verifies unsupported tasks remain queued with zero attempts,
capability revocation and oversized reservations fail readiness, and existing paid/unpaid
lease recovery fencing remains intact. Source/test typechecks and source ESLint pass;
Libri migration scope validation passes. No live model call or hosted qualification is claimed.

## Synthesis and queue release receipts (October 4)

PR42 merged as `58053eead1a7c19173cba6bd7e0e1bbe1c7ed4aa` after CI
`37173480238`. Migration `20261004030625` (SHA-256
`e1b6092dff4a07ede407d6b7e503abbee61521df950a128357ccbfc085220500`)
was applied and recorded individually. The provider attempt guard is enabled and invoker-only.

PR43 qualified at `35e60d9eedb7e677dfadd29e7ea42d03478b74cf` in CI
`37174497737`, including the PostgreSQL 15 safety gate. It merged as
`fae2ea9643522f702cb4d13f820c4d560b1ad8b3`. The exact synthesis migration
`20261004031434` (SHA-256
`35ed1a305941eae33e246cc09d7005cf80fec4215f1cdd2eec560a47e71ee549`)
was applied and recorded individually. Before/after shared-schema fingerprints were both
`2ecb98e613300c76fc40f21fb59b4080` across 10,489 signatures. Security advisor findings
were unchanged. Restricted worker capability granted; authenticated execution denied;
zero executable tasks and zero enabled libraries; 408 image records and 408 private
`libri-assets` objects remain. An initial object-count check named an incorrect bucket;
the corrected `libri-assets` count is 408.

Libri app PR7 qualified at `437de472bcf1cb8eb4a331b44749128b11258b8f`
and merged as `b4a5d2912dfd1766ccd33dcddaaa2789bddeb3f2`. Production deployment
`dpl_DiUPaCZHWTdspTtcGruzo13M226X` is READY and its build log identifies that merge.
The default-off Supabase path can admit bounded queue selections and show pending run
history. Local HTTP/browser qualification covered this; no hosted research was activated.

## Book expert execution

The next processor implements `generate_agent_profile` through the same fenced runtime.
It shares a bounded OpenRouter transport and atomic task-completion helper with synthesis.
A single model call returns a structured blueprint and the ordered, evidence-grounded
expert prompt; a deterministic source briefing requires no second model call. The prompt
requires explicit coverage, uncertainty, citations and runtime tool availability. Existing
model routing, enabled tools and active status are preserved on regeneration.

Worker capabilities select context through the exact active task lease. A private invoker
helper keeps synthesis behavior unchanged and cannot be called by clients or the worker.
Only shared notes enter either processor; legacy analyses without shared-note provenance
are excluded from expert context. Full source revisions, including current safe analysis,
produce the freshness fingerprint. Prompt and briefing versions remain historical.

Existing manual prompts are preserved unless explicitly forced; their source briefing may
refresh deterministically. Even force generation cannot replace a newer prompt revision
saved during the model call. That paid result remains a non-current outdated candidate,
with its cost settled. The SQL capability independently enforces manual-prompt protection.
Changed source material marks generated content outdated. Unknown paid outcomes require
reconciliation and cannot be retried as a second provider attempt.

Validation uses deterministic, free providers: provider privacy/model/cost/output checks,
ordered prompt sections, thin evidence, source quoting, lost authorization, durable reuse,
manual refresh/force, concurrent manual edits, SQL overwrite protection, stale sources,
atomic rollback, restricted-role admission through runtime, and original synthesis regressions.
Fresh production-schema rehearsal has no new SECURITY/API/DATA findings; anon has the same
one baseline read failure and authenticated has none; both standing checks pass.
Hosted qualification, live pricing and activation remain pending. Other task processors,
chat/tool execution, intake and final cutover remain incomplete.

PR44 qualified at `6bdbfde48da18fe83af3468777ea496ccc98c2ba` in CI
`37174554582` (full checks and PostgreSQL 15 safety) and merged as
`001fdbea703f71fb69e5a7e07caa3d884dcf9c64`. No dedicated worker activation or
hosted qualification was performed. Final expert-processor local validation passed
60 worker checks, 4 privacy-fitness checks, source/test types and source ESLint;
changed-file formatting and SQL inventory/scope passed. The final migration revision
was rehearsed again after adding the SQL-level manual protection.

## Book-page research actions

The original Synthesize and Generate Agent Profile buttons now have an atomic admission
capability for Supabase. The owner selects `missing`, `gaps` or `force`; mode is retained
in the durable task and step. Default-off controls and supported processor checks run
before creating work. Task creation and bounded budget admission share one transaction,
so an exhausted budget leaves no stranded task. Concurrent clicks deduplicate an active
book/type/mode task. Each request key stores a scoped receipt, including deduplicated
clicks, so retrying after completion never starts another paid run. A new force request
remains separate from a pending gaps request.

Six free restricted-role PostgreSQL tests cover mode, concurrent dedupe, historical
receipt replay, conflicting requests, budget rollback, paused controls, unsupported
processors, book scope and owner revocation. The matching SQL contract denies raw
receipt insertion, anonymous calls and worker impersonation. Rehearsal against current
production plus the pending expert migration passes role probes and both standing
checks. Its one SECURITY finding is the intentional authenticated entry point:
`enqueue_book_research` explicitly checks `auth.uid()` and locks the caller's current
owner membership before any data access. PUBLIC/anon/service/worker execution is revoked.
No new API or data findings. The receipt table forces RLS with owner-only reads.

App integration and hosted qualification are still in progress; no research activation.

## Durable chapter workflow prerequisites (October 4)

The next worker slice separates each chapter's paid search and extraction into distinct
steps under a nonterminal `waiting` parent. The parent remains in progress in the existing
queue DTO until every child reaches a terminal outcome. Failed prerequisites skip their
unstarted dependents; any failure or insufficient/outdated result prevents successful
parent completion. Parent completion, counters and task outcomes commit together, and
maintenance can repeat after restarts without double counting.

A restricted planner creates only ordered search/extraction pairs for chapters of the
root task's own book. It checks the exact lease, current execution authority, admitted
run/task/depth limits, duplicate stages and backward-only same-chapter prerequisites.
The worker receives no raw step/dependency insertion or canonical catalog writes. The
new dependency table forces RLS and is readable only by the restricted worker. A database
trigger also refuses enqueue/claim transitions before prerequisites finish. Per-task
capacity can now be configured up to 1,000 steps; its existing default and stored values
remain unchanged. The planner refuses oversized work without creating partial stages.

The durable dispatcher reconciles lost enqueue replies through actual transport state.
Batch acknowledgement accepts the original planner job after its parent starts waiting.
Cancellation still closes the waiting parent and children through the existing lifecycle.
Paid-search recovery preserves the existing generation fence: an unstarted reservation
can retry; an authorized request with an unknown outcome cannot automatically call again.

Validation: 11 real PostgreSQL workflow tests plus 5 existing dispatcher tests pass;
source/test typechecks, source ESLint, formatting and SQL scope/inventory pass. Production
schema rehearsal passed with no new security/API/data findings from this migration,
unchanged role probes and both standing invariants. The prerequisite book-admission
migration retains its previously reviewed authenticated RPC finding. This workflow module
is not yet registered as an actual chapter provider; provider implementations and runtime
integration follow. No hosted test or model/search request ran.

Libri app PR8 is merged as `9b3193d9d7a5e56d94bfef4294c772731d85df26`.
Production `dpl_5qukQJKb2LMmXXZCqhRue3YxtjFS` is Ready, with that exact source identified
in build logs. Original synthesis/agent buttons passed local browser checks, including
force confirmation and queued receipts. The app/backend activation switches remain off.
