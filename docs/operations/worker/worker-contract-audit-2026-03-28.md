<!-- docs/operations/worker/worker-contract-audit-2026-03-28.md -->

# Worker Contract Audit

Date: `2026-03-28`

This audit traced worker REST endpoints, queue producers, direct `add_queue_job` callers, and worker consumers to verify that app payloads match the worker contracts.

## Fixed In This Pass

### Onboarding queue deduplication

- Problem: onboarding queueing relied on a read-before-write check and a unique fallback dedup key, so duplicate requests could race and enqueue multiple active jobs.
- Fix:
    - Use a stable dedup key for normal onboarding jobs.
    - Preserve force-regenerate behavior by using a unique dedup key only when forced.
    - Return `existingJobId` from the worker when an onboarding job is already active.

### Queue job ID consistency

- Problem: direct `add_queue_job` callers returned the internal `queue_jobs.id` UUID while worker endpoints return `queue_job_id`.
- Fix:
    - Add a shared server helper that resolves the public `queue_job_id` after `add_queue_job`.
    - Use that helper in direct queue helpers so exposed `jobId` values now match worker API behavior.

### Scheduled SMS queue cancellation contract

- Problem:
    - cancellation helpers looked for `metadata.scheduledSmsId` while queued SMS jobs use `scheduled_sms_id`
    - helpers also attempted to update a nonexistent `queue_jobs.error` column
- Fix:
    - match the real queued metadata key
    - cancel via `cancel_job_with_reason`, which correctly writes `status='cancelled'` and `error_message`

### Shared queue metadata drift

- Problem: shared types and validators no longer matched the metadata the worker actually stores for:
    - `generate_daily_brief`
    - `onboarding_analysis`
- Fix:
    - align shared queue metadata types and validators with the payloads persisted by current producers

## Deferred

### SMS event reschedules do not move queued `send_sms` jobs

- `scheduled_sms_messages.scheduled_for` can change without rescheduling the already-queued `send_sms` job.
- Result: reminders can still fire at the original time.

### SMS regenerate paths do not update the queued message body

- Regenerating the scheduled SMS record does not rewrite the queued `send_sms` payload.
- Result: the worker can still send the old message body.

## Verification

- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/worker test:run`
- `pnpm --filter @buildos/web test -- 'src/lib/services/project-calendar.service.test.ts' 'src/lib/services/ontology/onto-event-sync.service.test.ts' 'src/routes/api/onto/projects/[id]/icon/generations/server.test.ts'`
