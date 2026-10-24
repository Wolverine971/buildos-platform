<!-- tasker/144-shared-project-calendar-sync.md -->

# 144 — What shared projects put on your Google Calendar

**Status:** DONE — implemented and tested locally; rollout pending · **Priority:** P3 · **Opened:** 2026-10-23 · **Size:** ~half a day to map, then DJ decides

**Owner:** Codex · **Needs from DJ:** nothing

## Why

The access audit found that dated tasks a guest agent adds in a shared project sync to every member's Google Calendar, including the owner's. DJ (2026-10-23): "I don't even know how much that gets updated." Before deciding anything, map what actually happens.

**Research correction:** that is not the default in the current code or the shared projects inspected in production. See the findings below; do not treat the original audit premise as confirmed.

## Map, in plain words

1. Which tasks and events from a shared project reach which members' calendars (owner, editors, viewers; only those who connected Google and mapped the project?). Start at `apps/web/src/lib/services/project-calendar.service.ts` (`total_members`, `mapped_members`, `active_sync_members`) and the calendar workers in `apps/worker/src/workers/calendar/`.
2. When: on create, on every edit, on a schedule, by webhook? How fast?
3. What a guest agent's task does: does it create an event for the owner? For everyone?
4. What gets updated or deleted when the task changes or is archived.

## Then DJ picks

- Leave as is.
- Guest-agent tasks sync only to their person's calendar.
- Only assigned tasks sync to the assignee's calendar.

Related: [130](130-calendar-you-can-trust.md) (calendar correctness and the MCP project fence).

## Exit

A short plain-language answer to DJ, his pick recorded, and the change (if any) built with tests.

## Findings — 2026-10-23

Checked source at `81ca4bfa1` and read-only production database aggregates around **10:16 p.m. EDT**. No Google writes, settings changes, or live model calls were made.

### What reaches whose calendar

**Default: the person making the change.** `actor_projection` targets the user performing the create/edit/delete. A guest connector runs as its connected person, not the project owner. A newly created dated task therefore targets that person's project calendar. Being the owner, an assignee, or another member does not independently make someone a recipient.

**Optional: all enabled project mappings.** With `props.calendar_sync_mode = 'member_fanout'`, the service-role task/MCP path queues one job per enabled `project_calendars` user. Owners, editors, and already-mapped viewers are not distinguished. It does not inspect task assignments or filter mappings by current membership. With no enabled mappings, it falls back to the person making the change. If some mappings exist but the acting person has none, that person is not automatically added to the targets.

A Google connection alone does not subscribe a person to every shared project. For a new external event, the target needs a usable Google connection and an enabled project mapping. The acting person's job may create their missing project calendar; jobs for other people may not. Normal project-calendar creation/settings endpoints require project write access, so a viewer cannot set up a new mapping through those endpoints. Existing mappings can still be selected by the fan-out code.

These are separate per-user Google copies, not invitations automatically sent to everyone. A mapped Google calendar could itself be shared outside BuildOS; BuildOS's target count does not measure who can view it in Google.

| Task dates, when calendar sync runs | Calendar entry |
| --- | --- |
| No dates | None |
| Start only | 30-minute “Start: …” entry |
| Due only | 30-minute “Due: …” entry ending at the due time |
| Start and due, positive span up to 10 hours | One entry covering that span |
| Start and due, span over 10 hours | Separate 30-minute start and due entries |

Task-derived entries are timed, not all-day. Explicit project events can be all-day. Undated tasks do not become calendar entries just because their project is shared.

### Production snapshot

“Shared” here means an undeleted project with more than one unremoved member.

- **5 shared projects; all 5 use `actor_projection`; none use `member_fanout`.**
- Their **5 owner memberships have enabled mappings; their 7 editor memberships have none**. There were no viewer memberships in this sample. These are membership counts, not necessarily distinct people.
- Across those projects: **45 ontology event rows and 25 Google mapping rows**. All 25 mappings belong to the event creator's user; none point to a deleted event with an uncancelled mapping.
- No retained `sync_calendar` jobs for those projects in the preceding 30 days. This cannot establish that no sync ever happened or measure its latency: completed jobs can disappear, and some event paths write inline.

This snapshot does **not** support the claim that guest task creation is currently broadcasting to every member. It is database evidence, not an inspection of the contents of Google calendars or proof of the deployed application revision.

### When it happens

- **Task create:** web task APIs and external MCP default to `calendar_sync: auto`; `none` skips event reconciliation entirely. Built-in chat's worker task mutations default to `none` unless `auto` is explicitly supplied. Guest status does not change the MCP default.
- **Task edit:** title changes, start/due changes, and transition to `done` trigger reconciliation when sync is enabled. Description-only, priority-only, assignment-only, and ordinary status changes do not. Reopening alone does not restore removed calendar entries. The web route checks actual title/date changes; the gateway uses supplied field presence.
- **Project event create/edit/delete:** the web service queues work immediately unless `syncToCalendar: false`. There is no nightly task export in this path. Jobs are scheduled for now; production's default queue poll is **5 seconds**, configurable by environment, plus queue load and provider time. This is an expected pickup cadence, not a measured delivery guarantee.
- The calendar worker calls the authenticated internal `/api/webhooks/calendar-sync-job` endpoint, which applies the Google write. Duplicate pending work is keyed by event/action/user/version; stale jobs reconcile the current version. Transient failures use the queue's retry handling; disconnected accounts and some terminal errors require intervention/manual retry.
- **Direct built-in chat event writes** use the same event service without the enqueue hook and write inline for the acting user. They do not apply the queued member fan-out policy. Personal/user-calendar events also stay user-scoped.
- Google's incoming `/webhooks/calendar-events` notification is a different direction. Its handler processes legacy `task_calendar_events`/time blocks (including some task write-back), not these `onto_event_sync` projections. Webhook-renewal cron maintains watches; it is not a periodic export of shared tasks. No general automatic backfill on joining, connecting Google, or changing sync mode was found in the traced path. The old `syncProjectToCalendar` method has no repository caller.

### Changes, completion, and archive

When reconciliation runs, it updates existing task entries' title and times, creates missing start/due entries, and deletes obsolete entries. Google descriptions include task/project links and the current task description; a description-only edit does not itself trigger this refresh. Removing both dates removes linked entries. Marking done removes future entries while retaining past/started entries; a due marker is considered future until its end time.

The **web task DELETE/archive endpoint** normally soft-deletes task-owned events and requests deletion of Google copies. Callers can explicitly disable linked-event deletion or Google sync. **Agent `update_task(archived: true)` is different:** it updates archive/deletion fields but an archive-only edit does not trigger calendar cleanup. The guest-agent lane refuses archive/restore altogether; the gap applies to callers allowed to archive, such as the owner's agent.

Important limits in the current implementation:

1. **Editing/deleting someone else's task does not reliably maintain their existing copy.** Default targeting follows the person making this change, not every user holding a copy. A collaborator's edit/archive can leave the owner's event stale. Task-move cleanup explicitly adds all mapped users; normal task edits/deletes do not.
2. **Fallback Google IDs live on the shared event.** If a target has no user-specific mapping, `resolveExternalMapping` can recover IDs from shared event props/link. It can consequently attempt the first person's Google event using another person's credentials, rather than create that person's copy. The provider/source ownership checks can reject it. Treat successful multi-member fan-out as unproven; it also means actor targeting is not a complete isolation guarantee for existing events.
3. **“Sync off” is not a universal stop for an existing copy.** Fan-out target discovery excludes disabled mappings, but actor-mode/manual/already-queued updates with an existing mapping bypass the new-event `sync_enabled` check. Disabling sync or switching modes does not delete existing copies. Disabled copies can also miss later fan-out cleanup.
4. **The collaboration counters are setup indicators, not delivery proof.** `total_members` counts unremoved membership rows; `mapped_members` counts members with a visible mapping; `active_sync_members` counts those mappings with sync enabled. They do not validate Google credentials, job delivery, mode participation, or per-event copies. Production RLS lets users read only their own `project_calendars` rows, and the collaboration endpoint uses that user-scoped client. Consequently the displayed mapped/active counts can omit other members; normal web fan-out discovery has the same visibility limitation, unlike the admin-backed MCP/worker paths.

These are findings to consider when choosing the change, not fixes already implemented or failures reproduced against Google.

### Evidence and validation

- [Recipient defaults and project setting](../packages/shared-agent-ops/src/calendar/project-calendar-read.service.ts); [web/shared target selection, mapping fallback, and job processing](../packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts) (`resolveProjectSyncTargets`, `resolveExternalMapping`, `processProjectEventSyncJob`).
- [Task scheduling and completion](../packages/shared-agent-ops/src/calendar/task-event-sync.ts); [worker task fan-out](../packages/shared-agent-ops/src/calendar/worker-task-event-mutation-port.ts); [task side-effect gates](../packages/shared-agent-ops/src/gateway/op-execution-gateway.activity.ts).
- [MCP identity](../apps/web/src/lib/server/agent-call/mcp-connector.service.ts); [admin-backed task adapter](../apps/web/src/lib/server/agent-call/external-tool-gateway.ts); [guest archive restriction](../packages/shared-agent-ops/src/gateway/op-execution-gateway.guest-lane.ts); [built-in chat task default](../apps/worker/src/workers/agentic-chat/mutations/argument-normalizers.ts).
- [Web queueing](../apps/web/src/lib/services/ontology/onto-event-sync.service.ts); [calendar worker](../apps/worker/src/workers/calendar/calendarSyncWorker.ts); [queue cadence](../apps/worker/src/config/queueConfig.ts); [inline worker event path](../apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts).
- [Task archive/delete](../apps/web/src/routes/api/onto/tasks/[id]/+server.ts); [agent archive](../packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts); [all-copy task-move cleanup](../apps/worker/src/workers/calendar/organizeTaskSync.ts).
- [Counters and manual retry](../apps/web/src/lib/services/project-calendar.service.ts); [user-scoped collaboration endpoint](../apps/web/src/routes/api/onto/projects/[id]/calendar/collaboration/+server.ts); [Google inbound webhook processing](../apps/web/src/lib/services/calendar-webhook-service.ts).
- Read-only production queries checked mode counts, member roles/mappings, event mappings, retained jobs, active RLS policies, and task/event/member triggers. No automatic task-to-calendar database trigger was present.
- Free focused checks: **103 tests passed across 9 files**, with `VITEST_MAX_WORKERS=1` through `test-gate`. Shared package: 73 tests (`project-calendar-read`, `task-event-sync`, `worker-task-event-mutation-port`, `onto-event-sync`, gateway activity). Web: 30 tests (event queue shim, task completion, linked-event deletion, archive). These existing mocked tests corroborate the traced behavior; they do not reproduce the newly identified cross-member gaps against Google. No production writes or paid validation.

## DJ's decision

**Selected by DJ on 2026-10-23:** “Guarantee guest-agent tasks sync only to their person's calendar (recommended).” Original choices, retained for context:

1. **Leave current behavior:** default actor projection, optional member fan-out, with the limitations documented above.
2. **Guarantee guest-agent tasks sync only to their person's calendar:** overlaps today's default for new tasks, but needs an explicit guest override for fan-out projects and safe handling of existing mappings, later edits, and deletions.
3. **Sync only assigned tasks to assignees:** a new policy; assignment changes would need to add/remove copies, including a defined rule for unassigned and multiply assigned tasks. Explicit project events need their own recipient rule.

## Implementation — 2026-10-23

**Built DJ's choice:** a new task created by a connected guest agent belongs on that person's calendar. A project owner editing or scheduling that task later does not become its calendar recipient, even if the project uses member fan-out.

- The gateway stamps `props.guest_agent_calendar_user_id` from the authenticated connector identity in the task creation transaction, including undated tasks and `calendar_sync: none`. Arbitrary tool props cannot choose this recipient. The database preserves it across property replacement and copies it onto task-owned events.
- Web, worker task mutations, and direct Agent Run event writes queue the pinned person's copy. The job processor independently rejects an upsert for any other user, including old/manual jobs. Restricted jobs use only explicitly user-owned mapping rows; shared Google IDs and ownerless mappings cannot redirect them. Stale-job replacement preserves this restriction.
- Subsequent reconciliation queues deletion of any explicitly mapped older copies belonging to other people. Cleanup success or failure updates that person's mapping, leaving the guest event's sync state alone. A disconnected account still needs reconnection before its old Google copy can be removed.
- Authorized agent archive-only updates now reconcile calendar events. Archive removes past and future task events; ordinary completion retains the existing future-only behavior. Direct Agent Run creates link the event to its task before queueing, so later cleanup can find it.
- An external guest edit of an unpinned task suppresses fan-out for that write. A meaningful guest-agent update to a task that person created adopts the durable pin. Existing unmarked tasks are **not bulk reclassified**: task creator identity alone does not establish historical agent provenance. The policy is guaranteed at creation for new guest-agent tasks once the migration and application code are deployed.

Explicit `calendar_sync: none` / `sync_to_calendar: false` still suppresses provider side effects. A usable Google connection and project mapping remain prerequisites; another person's edit does not auto-provision the guest's calendar. General fan-out, collaboration counters, and existing sync-off semantics for unrelated tasks/events remain outside this change.

### Validation and rollout

- **186 focused free tests passed across 12 files:** 147 shared-package tests and 39 web tests, with `VITEST_MAX_WORKERS=1` through `test-gate`. Covered creation identity/spoofing, undated tasks scheduled later, owner edits, optional fan-out, archive, direct events, stale jobs, mapping isolation, cleanup errors, web enqueueing, and webhook propagation. The new recipient/archive regressions were observed failing before implementation.
- `test-gate run pnpm --filter @buildos/shared-agent-ops exec tsc --noEmit` passed; `git diff --check` passed. No Svelte component changes.
- [Migration](../supabase/migrations/20261024022550_guest_task_calendar_projection.sql) rehearsed successfully against the cached production schema with [custom checks](../supabase/tests/guest_task_calendar_projection.check.sql) and `--role-probe`. Actual authenticated-role writes, the definer-RPC JWT boundary, pin inheritance, spoof prevention, property replacement, and archive preservation passed. All four standing checks passed; no new security or role-probe failures (the anonymous role had one pre-existing failure both before and after).
- Reproduce the database check with `pnpm db:rehearse supabase/migrations/20261024022550_guest_task_calendar_projection.sql --check supabase/tests/guest_task_calendar_projection.check.sql --role-probe`.
- **Not deployed or applied to production.** Apply this migration using the repository's one-file/repair procedure before deploying the web/worker changes; it supplies the metadata protection and event inheritance. No hosted database changes, Google mutations, paid tests, or live model calls were made for this task. Calendar behavior is verified with local mocks and the disposable database, not live Google accounts.
