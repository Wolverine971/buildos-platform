<!-- tasker/139-follow-through-on-djs-calls.md -->

# 139 — Follow through on DJ's calls

**Status:** DONE — awaiting Claude check · **Priority:** P2 · **Opened:** 2026-10-19 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

**Latest authorization/outcome (2026-10-19):** DJ explicitly authorized applying this task's migrations and expanding scope to the final SMS sender. Migration `20261019191933` is now applied and recorded in production; notification SMS remains off. The sender follow-up is implemented and validated with 60 focused tests and clean worker production/test type checks; worker deployment remains pending. This authorization supersedes the original no-production-write/apply restrictions below for this migration only.

Source: DJ's answers to the 8 product calls in `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (2026-10-19).

- **Kept:** Project Review, prepared prompts, SMS, the unused chat capabilities, Libri.
- **Yes:** stop the background reviews nobody acts on.
- **Already done:** deep research (deleted in `2b0f738be`).

This tracker does the code that follows from those answers. Bugs and line numbers were checked on 2026-10-18; confirm each one before fixing it.

Already done by Claude on 2026-10-19 (no code): `FRESHNESS_RADAR_MODE` moved from `live` to `shadow` on the Railway daily-brief-worker. Scans still run and write their ledger, but nothing reaches the inbox or chat.

## What users get

Fewer suggestions in the inbox that nobody acts on, and nightly project checks that finish faster. Old chats stop jumping to the top as "recently active" just because they were opened. A focused table stays visible to chat on fast turns. When SMS is turned back on, quiet hours defer a text instead of failing it, and no SMS rows pile up while it's off.

## Files you own

- `apps/worker/src/workers/project-loop/projectLoopWorker.ts`, `driftEvidence.ts`, `driftFixes.ts`, `auditEnqueue.ts`, and the audit scheduling in `apps/worker/src/scheduler.ts`
- `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`, `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts`
- `apps/worker/src/workers/notification/smsAdapter.ts`, `apps/worker/src/workers/notification/notificationWorker.ts`
- New migrations (write and rehearse; DJ subsequently authorized Codex to apply this task's SMS migration)
- Follow-up scope approved by DJ on 2026-10-19: the shared SMS switch integration in `apps/worker/src/config/sms.ts` and its tests, plus SQL checks under `supabase/tests/`. Extend only where that integration requires it; record exact files in the report.
- Final sender expansion approved by DJ on 2026-10-19: `apps/worker/src/workers/smsWorker.ts`, new `notification/smsDispatchPolicy.ts`, the necessary SMS priority contract in `workers/shared/queueUtils.ts`, and `tests/smsWorkerNotificationDispatch.test.ts`.
- The tests next to these files, including `apps/worker/tests/projectLoop*.test.ts`, `apps/worker/tests/projectAuditEnqueueActiveRun.test.ts`, `apps/worker/tests/notificationRetrySemantics.test.ts`, `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts`

## Work, in this order

### Part A — stop background reviews nobody acts on (call #3: yes)

1. [x] **DONE — Drop the drift lens from the nightly light pass**
    - Implemented: `scheduled` and `end_of_day` skip drift evidence and generation; manual runs retain both. Existing findings keep their age and confirmation date. This policy skip does not mark the run degraded.
    - Before: `projectLoopWorker.ts` ran drift detection (`driftEvidence.ts`, `driftFixes.ts`) on every light pass. That is 2 of 7 AI calls per run (`project_loop_drift` 85 + `drift_finder` 108 calls in 30 days) and the slowest path (~42–55 s). It produced 68 findings in 30 days, of which 1 was applied.
    - Fix: skip drift on scheduled light passes. Keep it reachable from a manual run (a user-started review) so the rare real catch is still possible. Don't delete the drift code; it stays for manual runs.
    - Regression tests: a scheduled light pass makes no drift calls and still completes its other lenses. A manual run still includes drift.
2. [x] **DONE — Skip scheduled Complete Project Audits while the last one is untouched**
    - Implemented: one structured status/decision query for an otherwise eligible scheduled audit. Pending/failed recommendations block until one is approved, delegated, applied, addressed, or rejected; a failed application with `decided_at` also proves user engagement. Empty or fully superseded packets do not block. Manual and event-triggered audits bypass this new gate; existing cadence, cooldown, and active-run rules remain.
    - Before: `auditEnqueue.ts` / `scheduler.ts` scheduled audits regardless of whether the user acted on the last one. 71 recommendations in 30 days, 0 applied, 51 still pending.
    - Fix: before scheduling, check the project's latest audit. If its actionable recommendations are all still untouched, skip this one. Use the same structured status fields the inbox uses; never read recommendation text. User engagement lifts the new gate at the next eligible scan; it does not override cadence or cooldowns.
    - Regression tests: an untouched last audit → no scheduled audit. One answered recommendation → the audit schedules. A manual audit is never skipped.

### Part B — prepared prompts stay (call #2: keep), so fix their two bugs

3. [x] **ALREADY FIXED — Opening an old chat marks it "recently active"** (and writes ~40 KB into the session)
    - Rechecked 2026-10-19: prewarm reads existing sessions without writing activity, focus, or metadata. No replacement merge RPC is needed. Existing cleanup migration `20261019161423_remove_legacy_chat_session_context_caches.sql` removes old caches after the web change is deployed; production does not yet record it applied. Its ownership stays with the earlier cleanup.
    - Superseded diagnosis: prewarm formerly called `merge_chat_session_agent_metadata`, refreshing `updated_at` and persisting the large context cache. That call is already gone, so the proposed replacement merge RPC would add unnecessary code.
    - Verification: existing prewarm tests cover no updates to old sessions; included in the 62-test server/client review and final web suite.
4. [x] **DONE — Fast turns lose the focused table**
    - Implemented: preserve the loader-bounded table summary, total/shown row counts, and string column names. Prepared and fresh prompt text match for full and partial row coverage.
    - Before: the compaction allowlist in `prepared-prompt-cache.ts` omitted `table_summary`, `table_rows_shown` and `table_columns`. On a prepared hit the table section was missing, while the prompt still said the fields below were already loaded. Freshly built turns rendered it.
    - Fix: allow `table_summary` (exempt from the 1,500-character cap), `table_row_count` and `table_rows_shown`. Check `table_columns` is covered too.
    - Regression test: a prepared prompt with a focused table renders the same table section as a fresh build.
5. [x] **ALREADY FIXED — Stop shipping the full context to the browser** (step-skip; safe with prepared prompts kept)
    - Rechecked 2026-10-19: server returns `{ version, key, created_at }`; client consumes the receipt. Focused server/client verification passed 62 tests.
    - Verification: the response has no context body and the client still reports ready. No implementation changes needed here.

### Part C — SMS stays (call #5: keep, may plug in later), so fix its two bugs

6. [x] **DONE — Quiet hours fail a text instead of deferring it** (only matters once SMS is back on)
    - Implemented: structured deferral queues one deduplicated job at quiet-hours end without consuming a delivery attempt. Expired texts and briefs that would be stale at resume are cancelled; late wakes also check expiry. Failed deferral persistence retries without consuming delivery attempts.
    - Before: `smsAdapter.ts` returned `success: false` with "Cancelled: quiet hours". `notificationWorker.ts` treated that as retryable and retried inside quiet hours. After 3 attempts the delivery was `failed`.
    - Fix: return a structured outcome, not a message string (for example `deferred_until: <end of quiet hours>`). The worker reschedules the delivery for then without spending an attempt. If the text is no longer worth sending by then, cancel it.
    - Regression test: a delivery during quiet hours is rescheduled to the end of quiet hours with attempts unchanged.
7. [x] **DONE — SMS deliveries pile up as "pending" while SMS is off**
    - Root cause confirmed by production SELECTs: 91 SMS rows remain pending. The database CHECK rejects `cancelled`, and the worker logged that update error but returned success, leaving completed jobs with pending deliveries. Missing jobs were not the explanation for the newest rows.
    - Implemented: migration permits `cancelled`, introduces a shared notification SMS setting (default off), gates SQL admission, and cancels only pending SMS while preserving attempt/provider history. Worker reads the same setting, retains the environment emergency stop, and throws when cancellation persistence fails.
    - Fix:
        - Look up the SMS branch of `emit_notification_event`; the latest definition is in `supabase/migrations/20260421000001_prevent_duplicate_daily_brief_notifications.sql`, so confirm nothing newer replaced it.
        - In a new migration, have it skip creating SMS deliveries while SMS sending is off. Gate it on the same switch or setting the worker uses, never remove the branch, because SMS comes back later.
        - In the same migration, cancel the existing pending SMS rows with a clear reason (for example `cancelled: sms_disabled`).
        - Production read on 2026-10-19 disproved the missing-job assumption for recent deliveries: the three newest pending rows have completed queue jobs, zero delivery attempts, and the newest job reports success. Trace the delivery cancellation path before backfill. Old jobs may already have been removed by retention.
        - The current switch is the process-local `PRIVATE_SMS_SENDING_ENABLED`; introduce an explicit database-visible sending setting used by both admission and the notification worker, preserving the environment kill switch. Do not silently treat separate switches as synchronized.
    - Regression tests: rehearse the migration. A check SQL shows a brief event creates no SMS delivery while SMS is off and does create one when it's on, and that the backfill cancels only pending SMS rows.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each item, confirm it still happens in the current code (line numbers drift). If it doesn't, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes. Production reads are SELECT only.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Item 2 decides "untouched" from structured status fields only.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql` (add `--role-probe` when grants change), and **do not apply**. DJ applies. New functions are server-only by default; add `GRANT EXECUTE ... TO authenticated` only if a signed-in session calls it.
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `test-gate run pnpm --filter @buildos/worker exec vitest run tests/projectLoopGenerators.test.ts tests/projectLoopDriftEvidence.test.ts tests/projectLoopDriftFixes.test.ts tests/projectLoopLensInputs.test.ts tests/projectLoopEnqueueGate.test.ts tests/projectAuditEnqueueActiveRun.test.ts tests/projectLoopAuditSynthesis.test.ts tests/projectLoopDegradedRun.test.ts tests/projectLoopCancellation.test.ts tests/projectLoopDebouncedReviewSignal.test.ts tests/notificationRetrySemantics.test.ts tests/smsAdapterQuietHours.test.ts tests/smsSendingSwitch.test.ts`
- `test-gate run pnpm --filter @buildos/web exec vitest run src/routes/api/agent/v2/prewarm/server.test.ts src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts src/lib/components/agent/`
- `pnpm db:rehearse supabase/migrations/20261019191933_notification_sms_follow_through.sql --check supabase/tests/notification_sms_follow_through.check.sql --role-probe`
- `test-gate run pnpm --filter @buildos/worker run typecheck`, `test-gate run pnpm --filter @buildos/worker run typecheck:tests`, and `test-gate run pnpm --filter @buildos/web run typecheck:tests`. Run `test-gate run pnpm --filter @buildos/web run check` once at the end, then `touch apps/web/vite.config.ts`.

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test or migration. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each fix, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text. No paid calls. No migration applied.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. Files changed, and the new migration files with their rehearsal results.
3. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
4. Anything DJ must do: apply the migrations (say in which order relative to the deploy).

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Blocked

- No implementation item remains blocked. The broad web test type check fails with **31 errors** in four unchanged files outside this task's ownership: `src/lib/components/layout/agent-chat-resume-link.test.ts`, `src/lib/server/chat-share-review.test.ts`, `src/lib/server/chat-share-snapshot.test.ts`, and `src/lib/server/chat-share.service.test.ts`. `git diff --exit-code` confirms these files are unchanged from HEAD. Their test assertions need undefined-value narrowing; no errors were reported in this task's files. Left these files and the zero-error baseline untouched.
- **RESOLVED after DJ expanded scope:** the final notification SMS sender now rechecks linked-delivery status, expiry, brief date, preferences, quiet hours, and the database switch. See the final sender report below. Worker deployment is still required for these code changes to take effect.

## Completion report — 2026-10-19

### Outcome and review

Items **1, 2, 4, 6, and 7 are DONE**; **3 and 5 were ALREADY FIXED**. Reviewed the complete owned diff, including the new tests and SQL. Additional edge cases checked:

- Skipping drift neither ages nor retires existing drift findings and does not mark the pass degraded.
- Automatic superseding does not count as an audit answer; fully retired/empty packets do not block forever. A recommendation read failure prevents a new scheduled audit. Manual/event paths retain their existing gates.
- Focused-table summaries longer than 1,500 characters remain identical in fresh/prepared prompts; unrelated private properties remain omitted.
- Quiet-hour deferral handles midnight and DST, queue insertion failure, expiry before resume, late wakeup, and a brief crossing its local date. Policy cancellations do not spend delivery attempts.
- SMS database-setting read errors retry without sending; a missing/invalid setting fails closed. The environment emergency stop still wins. SQL admission and notification delivery share the database setting; direct/calendar SMS still use their existing environment switch.
- The migration retains opt-in and daily-brief dedup behavior, preserves other channels and terminal deliveries, and preserves attempts/provider references when cancelling old pending SMS. Compared its emitter definition with production: only the SMS gate and fixed search path changed.

### Exact files changed

Production code:

- `apps/worker/src/workers/project-loop/projectLoopWorker.ts`
- `apps/worker/src/workers/project-loop/auditEnqueue.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`
- `apps/worker/src/workers/notification/smsAdapter.ts`
- `apps/worker/src/workers/notification/notificationWorker.ts`
- `apps/worker/src/config/sms.ts`

Tests and migration:

- `apps/worker/tests/projectLoopDegradedRun.test.ts`
- `apps/worker/tests/projectAuditEnqueueActiveRun.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts`
- `apps/worker/tests/notificationRetrySemantics.test.ts`
- `apps/worker/tests/smsAdapterQuietHours.test.ts` (new)
- `apps/worker/tests/smsSendingSwitch.test.ts` (new)
- `supabase/migrations/20261019191933_notification_sms_follow_through.sql` (new)
- `supabase/tests/notification_sms_follow_through.check.sql` (new)
- This tracker. `apps/web/vite.config.ts` is touched only to refresh development types after sync; no content change.

### Validation results

The exact final commands are under **Checks** above. All tests used mocks/offline execution; no paid or live model/SMS calls.

| Check                                                          | Result                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Focused worker suite                                           | **129 passed, 0 failed**, 13 files (after adversarial review)                         |
| Drift suite after strengthening the age-preservation assertion | **18 passed, 0 failed**, 1 file                                                       |
| Required web/prewarm/prepared-prompt/agent suite               | **833 passed, 0 failed**, 67 files                                                    |
| Worker production type check                                   | **Passed**, exit 0                                                                    |
| Worker test type check                                         | **Passed**, 0 errors against baseline 0                                               |
| Web test type check                                            | **Failed**, 31 errors against baseline 0, all in the four unchanged files above       |
| Web Svelte check                                               | **Passed**, 0 errors and 0 warnings                                                   |
| Migration rehearsal and SQL checks                             | **5 passed, 0 failed** (new SMS check plus all 4 standing checks)                     |
| Migration role probes                                          | **0 regressions**; anon has 1 existing failure both before and after, authenticated 0 |
| Migration findings                                             | **No SECURITY, API, or DATA findings**; expected server-only getter noted             |
| Owned tracked-file whitespace check                            | **Passed**                                                                            |

**Regression-first evidence:** observed failures before implementing each remaining bug fix: scheduled drift (2), unanswered-audit gate (4), focused table (2), and SMS adapter/worker regressions (8 in the first combined run). The database-off worker regression and late-wake expiry regression were also run separately and observed failing before their fixes. The SQL check failed against the empty migration for backfill, the rejected `cancelled` status, and disabled SMS admission, then passed with the migration. Additional preservation/configuration tests are green; these are not claimed to have all failed before a fix. Corrected an opt-in SQL fixture and an SMS adapter mock before accepting those failures as evidence.

The first rehearsal attempt could not initialize local PostgreSQL shared memory inside the sandbox; the approved local retry ran successfully. No production writes were involved. The rehearsal warned about three unrelated unapplied local migrations; those were not included or replayed.

### Deployment handoff for DJ

1. **Applied and recorded on 2026-10-19:** `20261019191933_notification_sms_follow_through.sql`. Production verification: SMS setting false, zero pending SMS, 91 cancelled with `cancelled: sms_disabled`, and two cancelled rows retaining prior attempt/provider history. Do not reapply it. This satisfies the migration prerequisite for the worker deployment.
2. Deploy the worker changes and the focused-table web change. No additional migration is needed for either project-review change or table compaction.
3. The separately owned `20261019161423_remove_legacy_chat_session_context_caches.sql` cleanup remains a separate handoff: deploy its existing prewarm change first, then apply that cleanup through its owner's review. This task did not edit or apply it.
4. If enabling notification SMS later, first enable `PRIVATE_SMS_SENDING_ENABLED` on the sender workers, then set the singleton `private.notification_sms_settings.enabled` to true. Set the database row false to stop admission. The environment flag remains an additional emergency stop; the two settings are explicit and not automatically synchronized.

At the initial handoff no commits, migration applications, production writes, or deployment changes had been made. The later authorized migration application is recorded below; Claude's light review remains outstanding.

## Adversarial review — 2026-10-19

DJ requested a second adversarial pass. Traced audit recommendations through approval/application, quiet-hours deferrals through queue admission and replay, notification fallback content, the final SMS transport, table context construction, drift rollup handling, and migration role behavior.

### Fixed findings

1. **Audit engagement was lost after an application failure.** Approving a suggestion records `decided_at`, then failed application changes its status from `approved` to `failed`. The status-only gate incorrectly treated this as untouched. The query now includes `decided_at` and treats a failed application with a recorded decision as engagement. Automatic supersession timestamps and generation failures still do not count.
2. **Fallback notification content dropped lifecycle metadata.** When an event read failed for a raw notification, the fallback discarded the delivery's `expires_at`, `brief_date`, and `timezone`. An expired text could send, or a brief could be deferred past its valid local date. The fallback now retains delivery metadata while supplying valid display text.

Observed **3 failing regressions, 32 passing tests** before these fixes (one audit case, two fallback cases), followed by **35 passing tests**. Added six more preservation tests for replayed deferral keys, switch-read outages, invalid deferral timestamps, and cancelled deferred jobs after re-enabling SMS. The final same 13-file worker suite passed **129/129**.

The SQL check now asserts (rather than merely selects) the worker-facing setting value and executes the actual `add_queue_job` RPC twice as `service_role`, proving both calls return one future pending job. The first stronger assertion exposed a rehearsal limitation: its recreated roles lack production role attributes. A production SELECT verified `service_role.rolbypassrls = true`; the local-only check temporarily models that existing attribute, then restores the rehearsal role. No production grants or migration were changed to accommodate the test. The repeated rehearsal passed **5/5 checks**, **0 role regressions**, and **0 security/API/data findings**.

Worker production type check passed; worker test type check passed with **0/0 errors** against its baseline. The earlier web tests and Svelte check remain the relevant web validation because this review made no web changes. The previously reported 31 web test-type errors are not claimed resolved.

Changed in this review: `auditEnqueue.ts`, `notificationWorker.ts`, their two existing regression test files, `notification_sms_follow_through.check.sql`, and this tracker. The migration itself is unchanged. No paid/model/provider calls, deployment changes, commits, or production writes.

### Opportunity identified before SMS is enabled — subsequently implemented

DJ subsequently authorized this expansion. The final sender implementation and validation are recorded below.

## Final SMS sender and production migration — 2026-10-19

### Implemented

- New `apps/worker/src/workers/notification/smsDispatchPolicy.ts` checks notification-origin SMS against the current linked delivery, recipient identity/phone, SMS switch, notification opt-in, SMS opt-out/verification, timezone, quiet hours, expiry, and brief date. Preference reads run concurrently; read failures block sending and remain retryable. The adapter already reserved daily quota, so this check does not consume it again.
- `apps/worker/src/workers/smsWorker.ts` requeues the same SMS message to quiet-hours end with a stable dedup key and no delivery/message attempt increment. Expired, cancelled, replaced, or newly disabled notifications do not send. Cancellation/deferral persistence errors cannot silently complete the job.
- Saved provider receipts and terminal SMS records prevent replays. A conditional `sending` claim prevents overlapping notification jobs from both dispatching. Interrupted sends with unknown outcomes require reconciliation rather than automatic replay. Receipt persistence precedes progress/broadcast work; failures after known provider acceptance do not overwrite history or automatically resend.
- `apps/worker/src/workers/shared/queueUtils.ts` now accepts all four structured priorities produced by `queue_sms_message` and the notification adapter. The final sender preserves their queue priorities when deferring. This fixes a real existing mismatch: low/high priorities were rejected by the validator.
- New `apps/worker/tests/smsWorkerNotificationDispatch.test.ts` uses the real queue validator with mocked database/provider operations. Existing direct/calendar policy and carrier STOP tests remain covered.

### Validation

- Initial transport regressions: **16 failed, 2 passed**, then green after the policy fix.
- Overlapping/interrupted dispatch regressions: **2 failed, 20 passed**, then green after the send claim.
- Real-validator priority regressions: **2 failed, 22 passed**, then green after matching the SMS priority contract. A preceding mock setup error was corrected before accepting those failures as regression evidence.
- Final focused command: `test-gate run pnpm --filter @buildos/worker exec vitest run tests/smsWorkerNotificationDispatch.test.ts tests/smsWorkerOptOut.test.ts tests/smsAdapterQuietHours.test.ts tests/smsSendingSwitch.test.ts tests/notificationRetrySemantics.test.ts tests/schedulerSms.test.ts` — **60 passed, 0 failed**, 6 files.
- Worker production and test type checks both passed after the priority type change; test type debt remains 0/0 errors.
- Migration rehearsal immediately before application: **5 checks passed**, **0 role regressions**, **0 security/API/data findings**. The same known anon probe failure remained unchanged before/after.

### Production application and verification

Verified linked project `iwifjtlebphefldmwbkh`, absent migration ledger entry, absent SMS settings table, and 91 pending SMS rows. Verified the live emitter source hash still matched the rehearsed source before replacing it.

Applied exactly one file:

`supabase db query --linked -f supabase/migrations/20261019191933_notification_sms_follow_through.sql`

Then recorded it:

`supabase migration repair --status applied 20261019191933 --linked`

Post-application SELECTs confirmed version/name in the ledger, `notification_sms_enabled = false`, `pending_sms = 0`, `disabled_cancelled_sms = 91`, and two rows with prior attempt/provider history retained. The emitter source hash and expanded status constraint match the rehearsal.

No other migration was applied; the earlier chat-cache cleanup remains separately owned and dependent on its prewarm deployment. No worker/web deployment, commit, paid model call, or live SMS send was performed. **Next operational step: deploy the worker code; keep SMS off until that deployment and its review are complete.**

## Log

- 2026-10-19: DJ authorized production migration application and expanded SMS sender scope. Applied/recorded `20261019191933`; verified 91 pending SMS cancelled and setting still false. Closed final-dispatch policy/replay gaps and corrected the low/high-priority contract; 60 focused tests pass. Code deployment remains pending.
- 2026-10-19: Adversarial pass found and fixed lost audit engagement after failed application and dropped SMS lifecycle metadata in fallback content. Final worker regressions: 129 passed; stronger SQL rehearsal: 5 passed, zero role regressions. Documented the existing final SMS transport gap as a follow-up before re-enabling SMS, outside this task's owned files.
- 2026-10-19: Codex completed items 1/2/4/6/7 and confirmed 3/5 already fixed. Regression failures were observed before fixes; final suites passed 119 worker and 833 web tests, worker types and Svelte passed. Web test types report 31 errors in four unchanged files outside ownership. SMS migration rehearsed with 5 passing checks and no role regressions; not applied. Full diff self-reviewed and deployment order documented. Ready for Claude's light check; no commits or production writes.
- 2026-10-19: DJ authorized the review's next steps. Items 3/5 are already fixed; five implementation items remain. Production SELECTs confirmed 91 pending SMS deliveries (two with prior attempts/provider references), current SMS SQL still inserts queue jobs, and the session-cache cleanup is not recorded applied. No production writes or paid calls. Audit engagement will lift only the new gate; existing cadence/cooldowns remain. Automatic superseding is not user engagement; empty/non-actionable audit packets must not block indefinitely.
- 2026-10-19: created by Claude from DJ's answers to the 8 calls. Radar moved to shadow on Railway the same day.
