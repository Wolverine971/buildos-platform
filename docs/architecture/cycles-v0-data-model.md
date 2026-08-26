<!-- docs/architecture/cycles-v0-data-model.md -->

# BuildOS Cycles: product intent, architecture, and rollout plan

Status: production Daily Brief shadow observation active; admission remains dark  
Last updated: 2026-08-26  
Initial proving use case: Daily Brief

## Why we are building this

BuildOS already performs recurring work, but the intent, scheduling, execution, and delivery logic is spread
across feature-specific schedulers and queue jobs. Daily Briefs, project audits, and task reviews each look
different in code even though they share the same underlying shape:

> At the right moment, run an agentic unit of work against a target, remember what happened, and surface the
> result only when it deserves the user's attention.

Cycles make that shape a first-class BuildOS primitive. The goal is not merely to add another scheduler. The
goal is to simplify the product and the codebase around one durable model for recurring work.

The kernel is:

- A **Cycle** is durable user intent: what should repeat, what it targets, and its operating policy.
- A **Trigger** is one condition that can admit a Cycle occurrence.
- A **Cycle Run** is one immutable occurrence of that intent.
- A **queue job** is temporary delivery and retry transport for a Cycle Run.
- An **Outcome** is the normalized meaning of the work that completed.
- A **notification** is one optional delivery effect of an outcome. It is not the Cycle and does not schedule it.

This gives users one place to see and configure recurring BuildOS work, while giving engineers one execution
path that can absorb more Cycle kinds without adding a new queue, scheduler, and lifecycle model each time.

## Product language

| Term     | Meaning                                | Example                              |
| -------- | -------------------------------------- | ------------------------------------ |
| Cycle    | Configured recurring work              | “My Daily Brief”                     |
| Trigger  | A condition that may start the work    | Every weekday at 9:00 AM             |
| Run      | One admitted occurrence                | The brief for August 25              |
| Handler  | Kind-specific domain implementation    | Daily Brief generator                |
| Outcome  | Normalized result of a run             | Artifact created; attention required |
| Delivery | A channel-specific notification effect | Push notification at 9:00 AM         |

The product should say “Runs at 9:00 AM,” not expose worker polling, queue rows, cron syntax, or retry tokens.

## What Cycles should eventually cover

The first known kinds are:

- `daily_brief`: creates a user-level daily orientation artifact.
- `project_audit`: analyzes project health, inconsistencies, risks, and stale state.
- `project_review`: helps a user reflect, decide, and plan; distinct from an automated health audit.
- `task_review`: reviews personal or project tasks for relevance, priority, and follow-up.

Likely later candidates include:

- Weekly planning and weekly retrospective
- Stale-project and blocked-work detection
- Deadline and milestone readiness checks
- Goal progress review
- Project summary refresh
- Waiting-for and follow-up review
- Inbox or capture triage
- Knowledge/document freshness review
- Calendar preparation and post-meeting follow-up
- Recurring status report generation
- Relationship/contact follow-up review
- Workspace hygiene, archive, or cleanup suggestions

These are candidates, not all v0 commitments. A behavior earns a Cycle kind when it needs durable
configuration, repeated execution, run history, and a user-visible lifecycle. Low-level maintenance jobs and
one-off asynchronous commands should stay plain queue jobs.

## Relationship between Cycles and notifications

Cycles and notifications overlap in time-oriented product UX, but they solve different problems:

```text
Cycle decides whether work should run
  -> handler performs domain work
    -> outcome decides whether attention is warranted
      -> notification system decides subscription, channel, quiet hours, and delivery time
```

A Cycle Run can emit zero, one, or several notification events. Notifications can also originate from
mentions, assignments, invitations, billing, and other non-Cycle events.

The Cycle's attention policy controls whether an outcome should compete for attention:

- `silent`: retain the artifact and history without interruption.
- `exceptions`: notify only for decision- or urgent-level outcomes.
- `always`: notify when the expected artifact is ready, subject to delivery preferences.

The notification system still owns channel subscriptions, email/SMS/push preferences, quiet hours, batching,
rate limits, and actual delivery. Turning notifications off must never disable the Cycle.

`notification_events.cycle_run_id` provides optional origin tracing. It supports questions such as “which
Cycle caused this?” without coupling notification delivery back into scheduling.

## Target architecture

```text
                     CONTROL PLANE

  UI / API ──create, update, pause, delete──> cycles
                                                 |
                                                 +── cycle_triggers
                                                 |
  schedule coordinator / event consumer ──admit occurrence
                                                 |
                                                 v
                                            cycle_runs
                                      immutable execution input

                     EXECUTION PLANE

  cycle_runs ──one run_cycle envelope──> queue_jobs
                                             |
                                  existing polling/claim/retry worker
                                             |
                                      processCycleRun()
                                             |
                                      handler registry
                                  /          |           \
                           daily_brief  project_audit  task_review
                                  \          |           /
                                      normalized outcome
                                             |
                             artifacts / history / AI Inbox
                                             |
                                  optional notification event
```

The architecture deliberately has one generic `run_cycle` queue type. Adding a Cycle kind means registering a
handler and validating its contracts; it does not mean adding another queue or polling loop.

## How work is triggered

Every Cycle may be run manually. Automatic triggers are independent child records so one Cycle can have more
than one condition.

### Schedule trigger

Structured local-time schedules support daily, weekly, and elapsed interval cadence. The schedule stores an
IANA timezone where calendar meaning matters. `next_run_at` is a materialized UTC projection used for indexed
due scans.

The coordinator runs approximately once per minute when `PRIVATE_CYCLE_COORDINATOR_ENABLED=true`. It is off by
default while legacy Daily Brief scheduling remains authoritative. `claim_due_cycle_triggers` leases a bounded
batch in a short `FOR UPDATE SKIP LOCKED` transaction. The application then materializes kind-specific input
without holding database locks. `admit_claimed_cycle_trigger` validates the lease, locks Cycle then Trigger in a
consistent order, and atomically creates the Run and queue job, advances the trigger, and clears the lease.
Materialization failures release the lease immediately; crashed coordinators become reclaimable after the
short expiry. The first coordinator cohort claims only `daily_brief` kinds because that is the only registered
handler.

For Daily Brief, the displayed time is the intended availability/delivery time. The coordinator admits the Run
`generation_lead_minutes` early so generation can start before that nominal time. The setting defaults to two
minutes and is bounded from zero through 30 minutes. The Run keeps the nominal time in `scheduled_for`; the
queue row is available immediately, while delivery evaluation retains the nominal time in `not_before`.

### Manual trigger

“Run now” is available for every Cycle and is not stored as a trigger record. The caller supplies a request ID,
which makes retries resolve to the same Run.

### Catch-up trigger

On scheduler outage or delayed processing, the Cycle's misfire policy decides whether to skip missed work or
admit one catch-up occurrence. We do not create one Run for every missed tick by default.

The v0 coordinator uses a five-minute operational grace window: an occurrence processed no more than five
minutes late is still `scheduled`; anything later is a misfire. This grace is coordinator behavior rather than
user configuration. At a misfire:

- `run_once` admits exactly one `catch_up` Run for the stored due occurrence, then advances directly to the
  first occurrence after coordinator time.
- `skip` records a durable `skipped_misfire` Run, creates no queue job, and advances the trigger the same way.

There is no backlog fan-out after a long outage. Overlap policy is evaluated only when `run_once` actually
attempts admission: `overlap=skip` may record `skipped_overlap`, while `overlap=allow` may enqueue the catch-up.
Misfire skips and overlap skips have separate dispositions and history reasons so operators can distinguish an
outage decision from concurrency control.

### Event trigger

A domain event consumer matches event types to active triggers. Optional debounce windows coalesce noisy
events. The deterministic event identity participates in the occurrence key.

### Threshold trigger

A lightweight evaluator admits work when a named metric crosses a configured boundary, for example 20 project
changes within an hour. Threshold evaluation is separate from the expensive Cycle handler.

### Relative trigger

A relative trigger derives its due time from a milestone, deadline, or calendar event, such as “review this
project 24 hours before its milestone.”

## The worker mechanism

BuildOS already has the correct transport mechanism for the first version:

- `SupabaseQueue` polls the existing `public.queue_jobs` table every five seconds in production.
- `claim_pending_jobs` claims batches atomically with `FOR UPDATE SKIP LOCKED`.
- A processing token fences queue completion and failure writes.
- Heartbeats, bounded attempts, stalled-job recovery, concurrency, and graceful drain already exist.

We will keep this system. We are not migrating to a second queue product while introducing Cycles.

The steady-state flow is:

1. A coordinator calls `admit_claimed_cycle_trigger`; event consumers call `admit_cycle_run` directly.
2. The database creates one immutable `cycle_runs` row and one `run_cycle` queue row in the same transaction.
3. The existing worker claims the queue row on its normal poll.
4. `processCycleRun` fences and claims the domain Run.
5. The handler registry dispatches by the Run's snapshotted `kind`.
6. The handler returns a normalized outcome and handler-specific result.
7. The worker completes the Run under the processing token; the generic queue completes its own row.

A database notification or worker wake-up could later reduce idle latency, but it is an optimization. Polling
remains the correctness path.

## Delivery semantics and failure model

The system is intentionally **at least once**. Exactly-once execution cannot be guaranteed across database,
model/provider, and notification boundaries. Instead:

- A deterministic `occurrence_key` identifies one logical trigger occurrence.
- `(cycle_id, idempotency_key)` prevents duplicate Run admission.
- The queue dedup key is derived from `cycle_run_id`.
- Every queue retry executes the same Cycle Run.
- A completed Run is acknowledged without invoking its handler again.
- Queue processing tokens fence stale workers from completing or failing a newer claim.
- Domain handlers must make external effects idempotent where those effects can be retried.

An important recovery case is: the handler completes domain work, but queue completion fails. The retry claims
the same Run. If the Cycle Run was durably completed, it exits immediately; if not, the handler relies on its
domain idempotency. Daily Brief already deduplicates by user and brief date, and notification emission
deduplicates by brief identity.

Overlap defaults to `skip`: if the previous Run is still queued or running, a new occurrence is recorded as
skipped rather than creating concurrent work. Kinds that are proven safe may opt into `allow` later.

## Data model

### `cycles`

One mutable definition per configured Cycle:

- Identity: `id`, `user_id`, `create_request_id`, `label`, `kind`
- Create idempotency: an internal SHA-256 request fingerprint rejects accidental request-ID reuse with
  different intent while ignoring a recomputed `next_run_at` projection
- Target: `target_type`, nullable `project_id` with a real foreign key
- Intent: kind-specific `config`, execution `policy`, `attention_policy`
- Lifecycle: `state`, compare-and-swap `version`, timestamps, tombstone time
- Projections: `next_run_at`, `last_run_at`, `last_run_id`, `last_error`

Kind is constrained application text rather than a Postgres enum. The handler registry is the executable source
of truth, so adding a kind does not require rebuilding database enum history.

### `cycle_triggers`

One Cycle can own several automatic triggers:

- Identity: `id`, `cycle_id`, `trigger_type`, `version`
- Typed condition: `spec`
- Lifecycle: `state`, timestamps, tombstone time
- Scheduler projections: `next_run_at`, `last_fired_at`

Manual execution is universal and therefore is not a stored trigger.

### `cycle_runs`

One immutable occurrence:

- Identity and routing: `id`, `cycle_id`, `user_id`, optional `project_id`, `kind`
- Admission: trigger identity, occurrence key, idempotency key, due/trigger times
- Reproducibility: definition snapshot, trigger snapshot, materialized execution input, delivery intent
- Lifecycle: status, processing token, attempt count, timestamps, errors
- Result: normalized `outcome` and handler-specific `result`
- Transport link: both `queue_jobs.id` as the real FK and public queue ID for support/logging

Identity and execution snapshot fields are immutable after insert. Queue links, fenced processing state, and
results are mutable lifecycle fields.

### Normalized outcome

All handlers return one of:

- `no_change` with `none` attention
- `artifact_created` with `none` or `minor` attention
- `attention_required` with `decision` or `urgent` attention
- `failed` with an explicit attention level

Opaque handler JSON may contain useful details, but history, AI Inbox admission, and notification routing must
use the normalized outcome.

## Daily Brief as the first adapter

### Today

Daily Brief has several admission paths:

- the recurring preference scheduler,
- app-open “ensure today,”
- manual generation,
- regeneration.

They converge on the legacy `generate_daily_brief` queue type and `processBriefJob`.

### Target

The existing Daily Brief generator remains the domain implementation. Cycles first replace admission and
lifecycle ownership, not the generator itself:

```text
Daily Brief Cycle + schedule
  -> admit Daily Brief Cycle Run
    -> run_cycle queue job
      -> Daily Brief Cycle handler
        -> existing brief domain implementation
          -> normalized Cycle outcome
```

The admitted Daily Brief input freezes:

- local `brief_date`,
- IANA `timezone`,
- scheduled/manual/catch-up/regenerate mode,
- regeneration and project filters,
- notification evaluation or suppression intent,
- the earliest requested notification time.

The legacy Daily Brief path remains registered during migration. The Cycle handler invokes the same domain
implementation with legacy queue-row ownership disabled so there is one owner of the generic `run_cycle` row.
It also disables legacy per-attempt failure broadcasts and `brief.failed` events. The generic Cycle lifecycle
owns retries, and outcome routing may surface failure only after the Run becomes terminal.

### Daily Brief migration phases

1. Deploy schema and generic worker support; do not change current admissions.
2. Backfill one paused Daily Brief Cycle from each valid `user_brief_preferences` record.
3. Compare projected Cycle occurrences with legacy scheduler decisions in shadow mode.
4. Canary Cycle admission for internal users, then a small cohort.
5. Make Cycle admission authoritative for scheduled Daily Briefs.
6. Move app-open, manual, and regenerate entry points to admit Runs against the same Cycle.
7. Drain old `generate_daily_brief` jobs and then remove legacy scheduling code.
8. Keep the domain generator; simplify it only after all callers use the Cycle adapter.

Rollback before phase 7 is operational: stop Cycle admission and return traffic to the legacy scheduler. Already
admitted Runs remain inspectable and can drain safely.

Current rollout state: phases 1 and 2 are complete and the read-only phase 3 production observation window is
active. Initial local and deployed snapshots are exact, but the sustained window has not completed yet. All
backfilled Cycles are paused, the generic coordinator kill switch remains off, and legacy scheduling is still
authoritative.

## Project Audit and Project Review

These should remain separate Cycle kinds even if they share project data and some implementation:

- A **Project Audit** is diagnostic and usually exception-oriented: find stale state, conflicts, risks, missing
  structure, or unhealthy signals.
- A **Project Review** is deliberative: summarize progress, ask for decisions, and help plan the next period.

The existing project loop/audit machinery is a likely second adapter after Daily Brief proves the generic path.
The migration should wrap existing domain services rather than rewrite project intelligence at the same time.

## Security and access model

- All three Cycle tables use RLS.
- Authenticated clients receive owner-scoped read access for the initial slice.
- Mutation and execution RPCs are server-owned and granted only to `service_role`; authenticated API handlers
  validate user input and invoke those narrow commands on the user's behalf.
- Mutation and execution RPCs are locked-search-path security-definer functions. Authenticated and anonymous
  roles have no execute privilege, so trusted servers get atomic operations without receiving raw Cycle-table
  mutation grants.
- Target IDs and queue links use foreign keys; authorization-relevant values are not hidden only inside JSON.
- Client create/update/delete endpoints derive `user_id` from the validated authenticated session rather than
  accept an arbitrary owner ID.
- Every service-only Cycle RPC also asserts the service-role JWT internally. Explicit execute grants remain the
  primary boundary; the assertion prevents an accidental future grant from turning a definer function into an
  owner-impersonation path.
- Project-targeted create, resume/update-to-active, and Run admission re-check current write access. Pause and
  delete remain available after access loss so stale configuration can be disabled safely.

The initial authenticated API is intentionally small:

- `GET/POST /api/cycles` lists or creates definitions.
- `GET/PATCH/DELETE /api/cycles/:id` reads or compare-and-swap mutates one definition. Delete requires
  `expected_version` in the query string.
- `POST /api/cycles/:id/run` admits an idempotent manual Run. `Idempotency-Key` is preferred; Daily Brief is the
  only registered handler in this slice.
- `GET /api/cycles/:id/runs` returns owner-scoped Run history.

Reads use the authenticated Supabase client and RLS. Commands use only narrow service-role RPCs after the API
derives the owner, validates the request shape, and materializes scheduler-owned values such as `next_run_at`
and the Daily Brief timezone/date input.

## Observability

Every operational log and trace should carry `cycle_id`, `cycle_run_id`, `kind`, `queue_job_record_id`, queue
public ID, occurrence key, attempt, and processing token where safe.

Initial metrics:

- due-to-admitted latency,
- admitted-to-started latency,
- Run duration by kind,
- success/failure/skip rate by kind,
- retry and stalled-recovery rate,
- duplicate-admission conflicts,
- notification emission and suppression by outcome,
- legacy-versus-Cycle Daily Brief shadow mismatch rate.

Operational views should distinguish domain status (`cycle_runs`) from transport status (`queue_jobs`).

The worker `/health` payload now exposes coordinator and Daily Brief shadow snapshots without making a disabled
or shadow-only subsystem restart the worker. Coordinator runs publish latest-value health, duration, claim,
failure, and maximum due-latency metrics to `system_metrics`. Shadow comparisons publish match rate, mismatch,
missing-Cycle, and invalid-preference metrics. Metrics are best-effort diagnostics: a telemetry write failure is
logged but cannot change scheduling truth.

`PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED` is off by default. When enabled, the worker compares the legacy and
Cycle projections hourly at minute 7 and once shortly after startup. It does not admit Runs or mutate Cycle
state.

## Required invariants

1. A Cycle is durable configuration; a queue row is never its source of truth.
2. Every automatic occurrence is represented by at most one Cycle Run.
3. Definition or trigger edits cannot change an already admitted Run.
4. Trigger resolution, Run history creation, and any required queue creation are one transaction.
5. A queue retry updates the same Run and never creates another Run.
6. The queue envelope contains only `cycle_id`, `cycle_run_id`, and `kind`.
7. The worker validates the envelope against the stored Run before dispatch.
8. Only the handler registry chooses domain implementation.
9. Outcome routing never depends on opaque handler result JSON.
10. Notification preferences never determine whether the Cycle executes.
11. Delete is a tombstone; completed history remains available.
12. Definition updates use `expected_version` and atomically increment the version.
13. Reusing a create or occurrence request ID with different immutable intent is a conflict, not a silent retry.
14. A terminally failed Run cannot be reclaimed by a delayed or duplicated queue attempt.

## Explicit v0 limits

- No user-authored cron expressions; schedules are structured.
- No dependencies or graphs between Cycles.
- No budget marketplace or generalized multi-step workflow engine.
- No simultaneous migration to Supabase PGMQ or another queue product.
- Event, threshold, and relative trigger records are modeled now; their consumers arrive after schedule/manual
  admission is proven.
- The Cycle UI follows the execution foundation; clients read through RLS and mutate only through the
  authenticated server API.

## Product surface proposal: Cycles in Profile Settings

The first user-facing Cycle surface should live at `/profile?tab=cycles`. It is a user settings surface, not
an operations/admin console. Queue state, processing tokens, cron syntax, coordinator health, and retry
internals stay in operational tooling. Users should see intent, cadence, status, next run, outcome, and
delivery preferences.

### Why the current profile information architecture needs to change

The live profile page currently gives eight or nine destinations equal visual weight in one horizontal tab
strip. At desktop width the strip is crowded; at phone width it becomes a context-poor horizontal scroller.
Daily Brief behavior is also split across two destinations:

- `Brief Settings` owns generation cadence, activation, narration, and legacy queue-job history.
- `Notifications` owns Daily Brief email, SMS, push, in-app delivery, and quiet hours.

That separation reflects implementation history rather than the user's task. A user wants to answer four
questions in one place: what will BuildOS do, when will it happen, is it active, and how will I hear about the
result?

The profile route should be renamed visually from **Profile & Settings** to **Settings** and use grouped
navigation instead of one flat tab row:

```text
YOUR BUILDOS                 CONNECTIONS              DATA & PLAN
Account                      Calendar                 Contacts
AI Preferences               Email                    Billing
Cycles                       Agents
Notifications
```

Desktop uses a compact grouped left rail with the selected section in the main pane. Mobile keeps the compact
identity header and replaces the horizontally scrolling tab strip with one `Settings section` disclosure or
picker. Existing `?tab=` deep links remain valid, including a compatibility redirect from `tab=briefs` to
`tab=cycles` after cutover.

### Recommended Cycles index

The Cycles landing state is a scan surface, not a generic workflow builder:

```text
Cycles                                             [Add cycle]
Recurring work BuildOS runs for you.

┌ Daily Brief                                            Active ┐
│ Your daily orientation across active projects.                │
│ Every day at 9:00 AM · America/New_York                       │
│ Next: Thu, Aug 27 at 9:00 AM · Last run: Completed            │
│ Delivery: In-app · Email off                         Edit  Pause│
└────────────────────────────────────────────────────────────────┘

┌ Acme launch project audit                              Paused ┐
│ Weekly on Monday at 10:00 AM · Deep audit                     │
│ Last run: 2 recommendations                     Edit  Resume   │
└────────────────────────────────────────────────────────────────┘
```

Each overflow-safe row has:

- a kind icon, user label, and one-sentence purpose;
- a plain-language trigger summary with explicit timezone where calendar meaning matters;
- Active, Paused, or Needs attention state;
- next run and compact normalized last outcome, never a transport job name such as
  `generate_daily_brief`;
- delivery summary sourced from notification preferences;
- inline `Edit` plus `Pause`/`Resume`, because configuration and lifecycle are the primary actions.

`Run now`, short Run history, and Delete belong in the focused editor. `Add cycle` appears only when at least
one supported kind/target is available to add. The first release should not present empty Project Audit or
Task Review templates before their handlers are ready.

### Focused Cycle editor

Selecting a Cycle opens a large shared settings modal on desktop and a full-width detail state on mobile. The
list remains intentionally compact; the editor owns the form:

1. **Purpose** — kind description and user/project target. Kind is immutable.
2. **Schedule** — Daily/Weekly, days, local time, and timezone. Do not expose cron.
3. **Delivery** — In-app, email, SMS, and push subscriptions plus quiet-hours summary. These controls write to
   notification configuration, not the Cycle row. Copy explicitly says: “Turning delivery off does not pause
   this Cycle.”
4. **Status** — next occurrence, last normalized outcome, and Pause/Resume.
5. **Recent runs** — the latest three outcomes with `View history`; error details use user language and offer a
   safe retry only when the backend says retry is appropriate.
6. **Advanced** — omitted for normal users in v0. Overlap, misfire, lead time, attempts, and attention policy
   keep kind-owned defaults until a real user need earns a control.

The editor is kind-aware rather than a generalized trigger/action canvas. Common schedule, status, history,
and delivery sections are shared; the kind contributes only its meaningful configuration. Daily Brief, for
example, may show narration when available. Project Audit may show depth. Empty internal config objects never
create empty UI sections.

### Cycles and Notifications in the product

Cycles and Notifications remain separate settings destinations, but their UI is intentionally composable:

```text
Cycle editor: “How this work runs” + a scoped delivery summary/editor
Notifications: global channels, quiet hours, and subscriptions across Cycle and non-Cycle events
```

The current `Daily Brief Notifications` controls should be reused inside the Daily Brief Cycle editor while
remaining available from Notifications. Both surfaces must use one store/component and one backend source so
they cannot drift. The Notifications page should become channel-policy-first; it must not imply that disabling
delivery disables generation.

This preserves the system boundary: a Cycle requests notification evaluation after an outcome, while the
notification system still decides subscription, channel, quiet hours, batching, and delivery.

### Daily Brief UI migration

There must be one visible editor and one configuration authority at every rollout stage:

1. Add a read-only Cycles overview behind a product flag. It may show the backfilled Daily Brief Cycle and
   shadow status, but it must not expose operational language or claim the paused shadow definition is active.
2. Finish trigger create/update/pause/delete commands. The existing Cycle definition endpoint cannot yet edit
   child trigger specs, so it is insufficient for a schedule editor.
3. Add a cohort ownership gate shared by the legacy scheduler and Cycle coordinator. This is the release
   blocker identified by the adversarial worker audit.
4. For authoritative cohort members, make the Cycle editor write Cycle + trigger commands. Keep the existing
   notification preference source for delivery. Never dual-write scheduling intent from the browser.
5. Redirect `tab=briefs` to `tab=cycles`, remove `BriefsTab`, and stop loading legacy brief preference/job
   stores only after the cohort is fully authoritative and rollback evidence is accepted.
6. Replace raw scheduled-job history with normalized Cycle Run outcomes. Operations retains access to queue
   rows elsewhere.

### External product research distilled for BuildOS

- [Linear recurring issues](https://linear.app/docs/creating-issues) are created from the work itself and
  centrally managed from team settings. BuildOS should similarly provide both contextual creation later and
  one settings index now.
- [Notion database automations](https://www.notion.com/help/database-automations) separate triggers from
  actions and make recurrence fields explicit: frequency, time, date bounds, and timezone. BuildOS should
  preserve that clarity without exposing a generic action builder.
- [Slack Workflow Builder](https://slack.com/help/articles/17542172840595-Build-a-workflow--Create-a-workflow-in-Slack)
  starts with a plain-language start event—link, webhook, schedule, or domain event—before workflow details.
  Cycle rows should lead with the trigger summary users scan for.
- [Schedule by Zapier](https://help.zapier.com/hc/en-us/articles/8496288648461-Schedule-Zaps-to-run-at-specific-intervals)
  makes cadence, start time, and account timezone visible and acknowledges that scheduled execution is not
  exact to the minute. BuildOS should show local timezone and say `Next` rather than promise second-level
  precision.

The common pattern is a manageable list plus a focused editor. BuildOS should adopt that pattern while keeping
its advantage: each Cycle already has a durable Run history and normalized outcome, so the UI can explain not
only what is configured but what actually happened.

## Delivery plan and work tracker

### Slice 0 — contract exploration

- [x] Establish Cycle, Trigger, Run, Outcome, and notification boundaries.
- [x] Define typed schedules and multi-trigger support.
- [x] Add normalized outcome and attention policies.
- [x] Distinguish Project Audit from Project Review.

### Slice 1 — executable foundation

- [x] Add the `run_cycle` queue type migration.
- [x] Add `cycles`, `cycle_triggers`, and immutable `cycle_runs` schema.
- [x] Add RLS, explicit grants, indexes, and notification origin link.
- [x] Add atomic Run admission and fenced claim/complete/fail RPCs.
- [x] Add the shared queue envelope and runtime validation.
- [x] Add the generic worker handler registry and processor.
- [x] Add Daily Brief as the first handler adapter.
- [x] Apply migrations to a disposable database and run SQL contract tests.
- [x] Regenerate database types after applying migrations.
- [x] Deploy database before worker code; no production admission yet.

### Slice 2 — Cycle command surface

- [x] Add atomic create/update/pause/resume/delete RPCs with compare-and-swap versions.
- [x] Add owner-scoped, idempotent manual `run now` database admission.
- [x] Validate kind/target/config/policy/trigger shapes and materialized schedule projections in the database.
- [x] Test owner isolation, project write access, request conflicts, stale versions, tombstones, and privileges.
- [x] Add the authenticated server API that derives `user_id` and materializes kind-specific manual input.
- [x] Add list/detail/run-history server APIs.
- [x] Add defense-in-depth service-role assertions inside privileged RPCs.
- [ ] Add a true two-connection concurrent-update test in addition to the stale-version contract test.
- [x] Add atomic trigger-set replacement that tombstones prior triggers, clears claims, installs validated
      materialized triggers, and increments the parent Cycle version once.

### Slice 3 — schedule coordinator (current)

- [x] Implement daily/weekly/interval next-occurrence calculation with spring-forward and fall-back DST tests.
- [x] Claim due triggers in batches and call atomic admission.
- [x] Add misfire/catch-up and overlap test matrix.
- [x] Add Daily Brief lead-time configuration.
- [x] Add coordinator health and latency metrics.

### Slice 4 — Daily Brief migration

- [x] Backfill paused Cycles from valid brief preferences.
- [x] Implement legacy-versus-Cycle shadow comparison and capture the initial snapshot.
- [ ] Accumulate a sustained shadow window and accept its mismatch rate.
- [ ] Canary scheduled admission with a kill switch.
- [ ] Migrate scheduled, app-open, manual, and regenerate paths.
- [ ] Drain old jobs and retire legacy scheduler/admission code.

### Slice 5 — product surface

- [x] Audit the live Profile/Brief Settings/Notifications surfaces and record the information architecture
      proposal.
- [x] Approve the grouped navigation and Cycles list/editor shape before implementation.
- [x] Write the implementation tasker:
      [`CYCLES_PROFILE_SETTINGS_UI_TASKER_2026-08-26.md`](../../apps/web/docs/technical/audits/CYCLES_PROFILE_SETTINGS_UI_TASKER_2026-08-26.md).
- [x] Replace the flat desktop tab strip with grouped settings navigation and a mobile section picker.
- [x] Add the compact Cycles list with purpose, cadence, truthful preview state, and bounded available timing
      data; omit last outcome and delivery summary until their projections exist.
- [ ] Add a kind-aware focused editor with schedule, pause/resume, run-now, and recent history.
- [ ] Reuse one delivery-preference component from both Cycle detail and Notifications.
- [x] Add the atomic trigger mutation command required by the schedule editor.
- [ ] Explain artifact outcomes versus notification delivery preferences.
- [ ] Surface failures and safe retry controls.
- [ ] Redirect `tab=briefs` and remove the legacy Brief Settings surface only after authoritative cutover.

### Slice 6 — second and third adapters

- [ ] Adapt Project Audit using existing project loop/audit services.
- [ ] Define and adapt Project Review separately.
- [ ] Define Task Review execution input and output contracts.

### Slice 7 — richer triggers

- [ ] Event trigger consumer with debounce.
- [ ] Threshold evaluator.
- [ ] Relative trigger projection and re-projection on anchor edits.

## Verification record

On 2026-08-25 the foundation and command migrations were applied from zero to disposable PostgreSQL databases.
Both SQL contract suites passed. The command suite was rerun after adding internal service-role assertions. On
2026-08-26 the due-trigger coordinator migration also passed from zero in a disposable database. Its contract
test covers bounded leasing, competing coordinator exclusion, claim fencing, atomic Run/queue admission,
schedule advancement, lease clearing/release, and RPC privileges. The misfire-resolution migration and its
four-way `run_once`/`skip` by overlap `skip`/`allow` matrix also pass from zero. The matrix proves that only the
allowed catch-up creates queue work, while misfire and overlap skips remain separately visible in Run history.
The lead-time contract also passes from zero: default, zero, configured, maximum, and invalid values are
covered, and early leasing is proven not to move the nominal trigger projection.

All seven Cycle migrations are now applied to the linked Supabase project. Because the repository has unrelated
historical migration-ledger gaps, each forward deployment used a receipt-isolated workdir; dry runs named only
the intended migration, and the final dry run reports the remote database up to date. Live checks confirmed
RLS and authenticated reads on all three Cycle tables, service-only command execution, PostgREST visibility of
the scheduler claim columns, and no Cycle-specific Supabase security-advisor warnings. Generated database
types and the schema reference now include Cycles.

The covered foundation behavior includes admission deduplication, queue fencing, terminal failure reclaim
protection, normalized outcome validation, RLS reads, RPC privileges, internal role enforcement, atomic
create, request fingerprint conflicts, project access, stale-version rejection, pause/resume, manual Run
deduplication, pending-work cancellation, and tombstone replacement.

The TypeScript checks also pass:

- Full worker suite: 1,169 passed, 1 intentionally skipped (including 12 focused Cycle/Daily Brief tests)
- Full shared-types suite: 52 passed (including 10 Cycle contract tests)
- Worker and shared-types TypeScript typechecks
- Focused web Cycle service/schedule suite: 12 passed
- Web TypeScript typecheck, including the new Cycle API routes
- Focused coordinator suite: 9 passed, including early nominal scheduling, the exact five-minute grace boundary,
  and both overlap policies; shared DST schedule suite: 6 passed
- Worker typecheck and shared schedule utility build after coordinator integration

On 2026-08-26, the Daily Brief migration tooling scanned all 20 active legacy preferences and found all 20
valid. The apply run created 20 paused `daily_brief` Cycles and 20 active schedule definitions with deterministic
backfill request IDs. A second apply created zero records and recognized all 20 existing definitions, proving
the live backfill path is idempotent. A linked-database check confirmed 20 paused Cycles, 20 active triggers,
and zero Cycle Runs.

The first live shadow snapshot completed at `2026-08-26T02:06:52.379Z`: 20 preferences were comparable, all 20
projections matched, and mismatch, missing-Cycle, and invalid counts were zero (100% match). The latest-value
shadow metrics were persisted to `system_metrics`. Focused coordinator, observability, Daily Brief backfill,
shadow, and scheduler tests passed 63/63, and the worker typecheck passed.

The production `daily-brief-worker` started the sustained shadow window on 2026-08-26 with
`PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED=true` and `PRIVATE_CYCLE_COORDINATOR_ENABLED=false`. Deployment
`2669443c-f0bd-46b8-899f-54ec90d39497` succeeded from commit `7097b47`. Its startup snapshot completed at
`2026-08-26T02:49:44.288Z`: 20/20 projections matched in 417 ms, with zero mismatches, missing Cycles, invalid
preferences, or Cycle Runs. Worker health reported the shadow healthy and the coordinator disabled.

The next operational gate is the canary review scheduled for 2026-09-02 after the seven-day observation
window. Review the accumulated shadow evidence and select an internal cohort. Before activating any paused
Cycle, refresh its materialized `next_run_at`; paused definitions deliberately stop advancing while shadow mode
computes from their structured schedule specs. Do not enable the coordinator before that activation path and
cohort are explicitly approved.

## Release gates

Before Cycle admission controls any production Daily Brief:

- Duplicate coordinator calls create one Run and one active queue job.
- A worker crash after domain completion does not create a second brief or duplicate notification delivery.
- A stale worker cannot complete a Run after a newer processing token owns it.
- DST spring-forward and fall-back behavior is explicitly tested for supported schedule semantics.
- Paused/deleted Cycles cannot admit new automatic Runs.
- User A cannot read or mutate User B's Cycles, triggers, or Runs.
- Shadow mismatch rate is understood and accepted before canary expansion.
- Operators can disable new admissions without deleting configuration or history.

## Open decisions

- Whether users may configure more than one live Cycle of the same kind and target. The foundation currently
  enforces one live definition per kind/target because multiple triggers cover most scheduling needs.
- Whether Daily Brief lead time should eventually adapt to observed generation latency instead of remaining a
  fixed per-Cycle setting.
- Whether failed Runs should enter AI Inbox automatically or only after retry exhaustion and kind-specific
  classification.
- Project member visibility rules beyond the Cycle owner.
- Retention duration for detailed result JSON versus compact Run/outcome history.

## Decision log

- 2026-08-25: Model notifications as optional Cycle outputs, not as triggers or Cycle definitions.
- 2026-08-25: Reuse the existing Supabase-backed queue polling worker.
- 2026-08-25: Use one generic `run_cycle` queue type and a handler registry.
- 2026-08-25: Make Cycle Run snapshots immutable and fence domain lifecycle writes with the queue processing token.
- 2026-08-25: Prove the architecture by adapting Daily Brief without rewriting its generator.
- 2026-08-25: Keep Project Audit and Project Review as distinct product concepts and Cycle kinds.
- 2026-08-25: Keep raw table mutation private; expose service-only atomic Cycle commands with optimistic versions.
- 2026-08-25: Treat idempotency-key payload drift as a conflict and keep transport projections out of create
  request fingerprints.
- 2026-08-25: Defer Daily Brief failure effects until Cycle retry exhaustion and make failed Runs terminal.
- 2026-08-25: Put authenticated reads behind RLS and authenticated writes behind server-derived, narrow
  service-role RPC calls.
- 2026-08-25: Use wall-clock schedule semantics: advance spring-forward gaps and emit one earlier-offset
  occurrence during a repeated fall-back hour.
- 2026-08-26: Lease due triggers with short `SKIP LOCKED` transactions, then materialize input outside the
  transaction and require the lease token at atomic admission.
- 2026-08-26: Deploy the coordinator dark behind `PRIVATE_CYCLE_COORDINATOR_ENABLED`; legacy Daily Brief
  scheduling remains authoritative until shadow comparison and canary gates pass.
- 2026-08-26: Treat delays of at most five minutes as normal scheduler jitter. After that, `run_once` admits one
  catch-up and `skip` records a no-queue skipped Run; both advance past current coordinator time without backlog
  fan-out.
- 2026-08-26: Keep the Daily Brief schedule as the nominal availability time and use a bounded per-Cycle
  `generation_lead_minutes` setting (default two) only to advance queue admission; delivery remains gated by the
  nominal time.
- 2026-08-26: Backfill Daily Brief intent as paused Cycles with deterministic request IDs. Keep trigger specs
  inspectable while parent Cycle state prevents automatic admission.
- 2026-08-26: Compare legacy and Cycle projections in read-only shadow mode and publish latest-value operational
  metrics without making telemetry part of scheduling correctness.
- 2026-08-26: Propose one user-facing Cycles index in Profile Settings to replace Brief Settings after Daily
  Brief cutover; keep operations/queue internals out of the user surface.
- 2026-08-26: Keep Notifications as the channel and quiet-hours authority while reusing scoped delivery
  controls inside Cycle detail, so delivery can be configured without becoming Cycle execution state.
- 2026-08-26: Propose grouped desktop settings navigation and a mobile section picker instead of extending the
  already-crowded horizontal profile tab strip.
