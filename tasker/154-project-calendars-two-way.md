<!-- tasker/154-project-calendars-two-way.md -->

# 154 — Project calendars sync both ways (+ Gmail digest, DJ only)

Started 2026-11-05. DJ's call: calendar = ambitious (live webhooks, low-risk changes applied
without asking, with Undo); Gmail = lean, DJ's accounts only, no CASA.

## Calendar (BUILT, UNCOMMITTED, migration APPLIED)

What it does:

- Every project calendar is watched. First time one is seen (`project_calendars.inbound_backfilled_at`
  is null) the hourly cron turns its source's read + sync on, registers a Google watch, and copies
  the next 90 days of events into the project. After that the user's calendar settings win.
- Webhook deltas on a project calendar (`ingestProjectCalendarChanges`):
    - BuildOS event moved / renamed / re-located in Google -> BuildOS event follows; a task's
      dates follow via `syncTaskFromEvent`.
    - BuildOS event deleted in Google -> BuildOS event deleted (task stays).
    - New event added straight to the project calendar -> new project event + mapping.
    - Last writer wins: a Google copy older than the BuildOS row is skipped (echo / stale).
    - Skipped on purpose: recurring-instance exceptions, imports from full listings (410 resync),
      events on personal calendars, a calendar linked to 2+ projects (imports only).
- Each applied change -> `calendar_ingest_changes` (before/after). AI Inbox "Done for you" lists
  them with Undo (`POST /api/calendar/changes/:id/undo`): old values back on both sides; refuses
  if the event was edited since.
- Hourly cron also sweeps channels quiet > 6 h (Google drops some pings).
- Outbound Google patches now send `status: 'confirmed'` (lets Undo restore a Google delete).

Files: `packages/shared-agent-ops/src/calendar/calendar-change-ingest.ts` (+test, 14),
`apps/web/src/lib/services/calendar-webhook-service.ts` (+`calendar-webhook-project-ingest.test.ts`, 4),
`apps/web/src/routes/api/cron/renew-webhooks/+server.ts`,
`apps/web/src/routes/api/calendar/changes/[id]/undo/+server.ts`,
`apps/web/src/routes/api/inbox/done-for-you/+server.ts`,
`apps/web/src/lib/components/inbox/InboxDoneForYouStrip.svelte`,
`apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte` (one filter line),
`apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts` (watch right after linking),
`packages/shared-agent-ops/{package.json,tsup.config.ts}`, `onto-event-sync.service.ts` (status),
`supabase/migrations/20261105160000_calendar_ingest_changes.sql` (APPLIED + repaired 11-05).

Validation: shared tests 14/14 + onto-event-sync 65/65; web 18/18 webhook tests; web
svelte-check 0 errors; migration rehearsal passed.

Deploy: web only (Vercel). First cron run after deploy (:15 each hour) flips DJ's 16 project
calendars on and copies upcoming events in (preview not possible from this session).

Open / follow-ups:

- [ ] DJ: deploy, then move an event on a project calendar in Google -> check AI Inbox "Done for you".
- [ ] Multi-member projects: a Google edit by one member updates BuildOS but not other members'
      Google copies (pushing back races the user's next drag). Fan-out later with a debounce.
- [ ] Personal-calendar events -> project suggestions (needs a model call; not low-risk).
- [ ] Regenerate shared types (`calendar_ingest_changes`, `inbound_backfilled_at` are cast `any`).

## Gmail: "From your email" cards (BUILT 11-06, UNCOMMITTED, migration APPLIED)

DJ 11-06: "go ahead" on the recommendation = AI Inbox cards per project with Apply; nothing
changes without his OK. Lean: only users on `EMAIL_PROJECT_UPDATES_USER_IDS` (exact ids) who are
also admins — DJ only (3 Gmail accounts). No CASA.

What it does:

- Nightly cron `/api/cron/email-project-updates` (10:30 UTC) reads each active Gmail account's
  inbox since the last completed run (first run / long gap: 24 h, cap 72 h) through the shared
  `GmailReadGateway.scanInboxWindow`; skips Gmail's Promotions/Social/Forums/Spam labels and mail
  that already made a card; newest 120 emails max.
- One model call (`email_project_updates`, `balanced` JSON route = DeepSeek V4 Flash first,
  ≈ $0.004/night at this week's measured rates) sees live projects (active/planning, owner/editor,
  ≤40) with ≤15 open tasks each, and the emails as untrusted text. It answers with refs (P1/T3/E2)
  only; code drops invented refs, no-op changes, bad dates; ≤15 cards/run.
- Cards: `create_task` (title, optional due date) or `update_task` (due date and/or status). The
  headline is written by code ("New task: …", 'Move "X" to Sat, Nov 14', 'Mark "X" done').
- AI Inbox strip "From your email" above Done for you, open by default: why, project, sender +
  subject, Open in Gmail, **Apply** / **Not now**. Apply runs the write gateway
  (`onto.task.create` / `onto.task.update`, `calendar_sync: 'none'`) on the user's own client,
  fenced to the card's project. Counted in the nav badge and header. Unanswered cards expire after
  14 days. `?dry_run=1` on the cron returns proposals without saving.

Files: `apps/web/src/lib/server/email-project-updates.service.ts` (+test, 12),
`apps/web/src/routes/api/cron/email-project-updates/+server.ts`,
`apps/web/src/routes/api/inbox/email-updates/{+server.ts,[id]/+server.ts}`,
`apps/web/src/routes/api/inbox/count/+server.ts` (badge), `InboxEmailUpdatesStrip.svelte`,
`DashboardInboxModal.svelte` (load + count + strip), `vercel.json` (cron),
`supabase/migrations/20261106120000_email_project_updates.sql` (APPLIED + repaired 11-06).

Validation: 12 new + 56 inbox route tests green; svelte-check 0 errors in these files (2 errors in
Task/GoalCreateModal belong to another session's work); eslint/prettier clean; rehearsal passed.

To turn on: Vercel env `EMAIL_PROJECT_UPDATES_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435`,
then deploy web. No live (paid) run done yet — needs DJ's OK.

Open:

- [ ] First paid dry run (≈ half a cent) to judge card quality before it goes live.
- [ ] Sent mail isn't read (gateway reads `in:inbox` only); commitments DJ makes in replies are
      missed. Next step if cards look good.
- [ ] No Undo after Apply (it was the user's explicit click); add to Done for you if wanted.
