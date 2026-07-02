<!-- apps/worker/docs/WORKER_FLOW_AUDIT_2026-07-01.md -->

# Worker Flow Audit — 2026-07-01

Full audit of `apps/worker`: queue core, brief pipeline, agentic workers (agent-run, project-loop, tree-agent, homework, ontology, chat), notification/SMS/calendar/misc workers, the web↔worker integration contract, and dead code. Six parallel audit passes, findings verified against actual code (both TS and the Supabase RPC SQL).

**Overall verdict:** The architecture is sound — atomic `FOR UPDATE SKIP LOCKED` claiming with `processing_token` fencing, fail-closed auth on every mutating surface in both directions, and a producer/processor contract with zero drift on live job types. The three systemic problems are: (1) **lifecycle, not locking** — no graceful shutdown drain and a stall-reclaim window that causes concurrent double execution of long jobs; (2) **decorative safety mechanisms** — notification retries, optimistic-lock detection, and adapter idempotency are all claimed in comments but dead in practice; (3) **~2,700 LOC of confirmed-dead code** that will keep drifting.

Legend: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low

---

## 1. Critical bugs

### 1.1 🔴 Notification-driven SMS jobs are queued without `user_id` and fail validation forever

- `apps/worker/src/workers/notification/smsAdapter.ts:748-758` + `supabase/migrations/20260421000000_notification_risk_cleanup.sql:104-109` + `src/workers/shared/queueUtils.ts:227-229`
- The `queue_sms_message` RPC (repo state) builds `send_sms` job metadata with `message_id`, `phone_number`, `message`, `priority` — **no `user_id`**. `processSMSJob` (`smsWorker.ts:52`) calls `validateSMSJobData`, which throws `"user_id is required"`. Every SMS through the notification pipeline (daily-brief SMS, admin signup SMS) is queued, the delivery is marked `sent`, and the actual send job fails validation forever.
- **Caveat:** the deployed DB may predate this migration redefinition — verify against prod before/while fixing. The dailySmsWorker path is unaffected (passes `user_id` explicitly at `dailySmsWorker.ts:439`).

### 1.2 🔴 Stall-reclaim double execution of long-running jobs (tree-agent, homework, project-loop)

- `reset_stalled_jobs` (migration `20260502000001`) requeues any `processing` job idle > 5 min (keyed off `GREATEST(started_at, updated_at)`). Homework, tree-agent, and project-loop **never call `job.updateProgress`** (`job.log` is console-only, `supabaseQueue.ts:287-290`), so any run > 5 min is reclaimed and executed **concurrently** with the original. `processing_token` only fences the completion write, not side effects.
- All three re-run non-idempotently: duplicate `project_suggestions` + inbox items (`project-loop/projectLoopWorker.ts:205-218, 346`), duplicate tree nodes/artifacts/onto writes (`tree-agent/treeAgentWorker.ts:1440, 964-980`), duplicate homework docs/tasks — homework even _adopts_ the duplicate iteration row on 23505 conflict (`homeworkWorker.ts:282-293`).
- Compounding: `withWorkerTimeout` (`supabaseQueue.ts:351-374`) rejects via `Promise.race` with no AbortController — "timed-out" runs keep executing as zombies while the retry starts. Tree-agent/homework have 60-min internal budgets vs the 10-min queue timeout vs the 5-min stall sweep.
- Agent-run is the only long worker that's safe (conditional-status claim at `agentRunWorker.ts:615-644`). **Fix pattern exists in-repo:** heartbeat via `updateProgress` per round + status-fenced claim like agent-run.

### 1.3 🔴 Fail-open scoping on service-role clients → cross-tenant exposure

- **Tree-agent:** empty `allowedProjects` set removes ALL project filtering — `if (ctx.allowedProjects.size) { query = query.in(...) }` in `tools/treeAgentToolExecutor.ts:644-646` and 9 more list/search tools → cross-tenant data leak when accessible-projects resolves empty. (Its own `search_ontology` does fail closed, executor:1372.)
- **Homework:** `update_onto_document`/`update_onto_task` skip the ownership check when the pre-check select _errors_ (`engine/homeworkEngine.ts:937-945, 1074-1082`) → cross-tenant write on an LLM-supplied ID.
- Both should fail closed. Small diffs, high stakes.

### 1.4 🔴 Tree-agent recursion is unbounded

- `treeAgentWorker.ts:1302-1349` — no max depth, node count, or cost cap on tree recursion; only wall clock and 1-replan-per-node bound exponential planner fan-out.
- Note: tree-agent as a whole appears to be an **orphaned experiment** (UI linked from nowhere, untouched since May, superseded by `agent_run`) yet carries 1.2/1.3/1.4 live in production. Strong candidate to flag off or delete rather than fix.

### 1.5 🔴 No graceful shutdown drain; duplicate SIGTERM handlers; sync `process.exit(0)`

- `index.ts:818-828`, `worker.ts:533-543`, `supabaseQueue.ts:144-154` — `queue.stop()` only clears poll intervals; nothing awaits the in-flight batch. SIGTERM/SIGINT handlers are registered **twice**: index.ts starts an async PostHog flush, then worker.ts's handler calls `process.exit(0)` synchronously, killing the flush and all running jobs.
- Every Railway deploy kills in-flight jobs mid-execution → 5-10+ min stall-recovery delay + duplicate side effects on retry (see 1.2) + dropped PostHog events on every deploy.

### 1.6 🔴 SMS double-send: no idempotency check before Twilio send

- `smsWorker.ts:256-291` — `processSMSJob` fetches the `sms_messages` row but never checks `status` (`sent`/`sending`) before calling Twilio; scheduled path only checks `cancelled` (:93). Stalled-job recovery or the Twilio status-webhook re-enqueue path (`apps/web/src/routes/api/webhooks/twilio/status/+server.ts:356-374`) re-sends the same SMS. No Twilio idempotency key either.

---

## 2. High-severity bugs

### Queue core

- 🟠 **Head-of-line blocking** (`supabaseQueue.ts:127-131, 159-213`): poll tick skips while `isProcessing`; `processJobs` holds it until the _entire_ batch resolves. One 10-min homework job blocks claiming of every `send_sms`/`send_notification`/`generate_daily_brief` on the instance. Fix: refill-on-completion semaphore instead of batch barrier.
- 🟠 **NODE_ENV profiles silently override queue env vars** (`queueConfig.ts:151-216`): `QUEUE_POLL_INTERVAL`, `QUEUE_BATCH_SIZE`, `QUEUE_STALLED_TIMEOUT`, `QUEUE_STATS_UPDATE_INTERVAL` are ignored whenever `NODE_ENV` is production/development — i.e., always. `validateEnvironment()` even validates the vars that then have no effect. Related: two config objects in use at once (`worker.ts:55` merged profile vs raw `queueConfig` in supabaseQueue/index/scheduler) with divergent stalledTimeout values.

### Notifications

- 🟠 **Retry mechanism is dead** (`notificationWorker.ts:686-694` vs `:972`, `:1019-1021`): first channel failure sets delivery `failed`, throws for a queue retry, and the retry immediately returns because `failed` ∈ `FINAL_STATES`. `max_attempts=3` is fiction; every transient email/push blip is terminal after one attempt.
- 🟠 **Optimistic-lock detection never fires** (`notificationWorker.ts:987-1011, 1053-1071`): `count` is always `null` because `{ count: 'exact' }` is never passed — the "another worker processed this" guard is dead code, undermining the duplicate-send mitigation the comments claim.
- 🟠 **Email double-send window** (`emailAdapter.ts:503-617`): fresh `emails` row + tracking id per attempt, send webhook has **no fetch timeout** (contrast `calendarSyncWorker.ts:58`) — a hung webhook > 5 min → stall reclaim → second send. Also `await webhookResponse.json()` uncaught on the 200 path (`:603`) → non-JSON success body → false failure → retry → double send.

### Daily SMS

- 🟠 **Cron fires at UTC midnight** (`scheduler.ts:181-184, 1052-1075`): `cron.schedule('0 0 * * *')` with no timezone; for America/New*York it runs at 19:00-20:00 local and computes the local date of the day \_ending* — daytime event reminders are systematically never scheduled for US users.
- 🟠 **Calendar window uses server-day, not user-day** (`dailySmsWorker.ts:136-141`): `toZonedTime(startOfDay(...), tz)` → `fromZonedTime(..., tz)` is an identity round-trip; correct form is `fromZonedTime(\`${date}T00:00:00\`, userTimezone)`. Evening events (8pm-midnight local) never get reminders.
- 🟠 **Duplicate scheduled SMS on retry** (`dailySmsWorker.ts:367-459`): `scheduled_sms_messages` inserts have no dedup key; a throw mid-loop → full-job retry → every message re-inserted with new IDs (per-message dedup key uses the new id, so it can't help).
- 🟠 **Reschedule doesn't move the queued send job** (`routes/sms/scheduled.ts:70-123`): `PATCH /:id/update` changes `scheduled_for` on the row only; the queued `send_sms` job fires at the old time and `processSMSJob` never re-checks.

### Agent-run

- 🟠 **Orphaned-run class** (`agentRunWorker.ts`): worker crash mid-run leaves the run `running` forever — requeued job sees non-`queued` status and returns skipped-**success**; no janitor exists; orphans permanently eat the 3-active-run scheduler cap (`scheduler.ts:462`) (:110-118, :605-613). Same terminal state from unvalidated `AgentTurn` shape throwing outside the LLM try (:935-971) and from unchecked terminal-status update errors (:750-759).
- 🟠 **Resume can re-execute committed writes** (`agentRunWorker.ts:395-407`): `reconstructPriorState` ignores query errors — transient DB error on resume → empty transcript + reset tool budget → a read_write commit-mode run redoes writes it already committed.

### Chat pipeline

- 🟠 **Signal extractors are dead-but-billing** (`contactSignalProcessor.ts:63`, `profileSignalProcessor.ts:86-87`): 2.5s/3.5s `Promise.race` pseudo-timeouts are below typical LLM latency, so contact/profile extraction fails on most sessions — and the race doesn't abort, so the discarded calls still bill tokens.
- 🟠 **Classifier reads the oldest 50 messages** (`chatSessionClassifier.ts:256-261`): fetches ascending, prompts on the first 30 — long sessions are classified from their opening. Then `last_classified_at` from the frozen window means sessions > 50 messages permanently skip as `already_classified` (:274-285, :431), halting all downstream signal processing.
- 🟠 **Activity processor duplicates history** (`chatSessionActivityProcessor.ts:272-295, 392-411`): no watermark + plain insert into `onto_project_logs` → close/reopen/close duplicates the activity history that feeds next-step prompts.

### Brief pipeline

- 🟠 **Backoff re-engagement uses exact-day equality** (`briefBackoffCalculator.ts:292-349`): day-4/day-14 emails only fire when `daysSinceLastLogin === 4`/`=== 14` exactly; a missed scheduler day (deploy, DST) drops the user into "no email" bands for weeks. Also the dormant "day 60 check-in" mathematically can't fire until ~day 104 (`:366-383` requires `daysSinceLastBrief >= 90` but the last brief goes out day 14).

### Project-loop

- 🟠 **Op sanitization spreads arbitrary LLM args through** (`generators.ts:226`): a "flag" suggestion can smuggle destructive `state_key`/`content` updates that approval replays; undo ops only reset flags (:375-396). Whitelist `args.props` keys.

### Tree-agent (beyond §1)

- 🟠 `finalOutput.result.parentHint`/`artifactLabels` dereferenced without validation → weak model omitting them TypeErrors the whole run (`treeAgentWorker.ts:1277-1279, 1408-1411`).
- 🟠 One failing child rejects `Promise.all`; siblings keep writing detached; failed nodes stay `running` forever (:1022-1038, 1328-1347).

---

## 3. Medium-severity (selected)

**Queue core**

- Operative scheduler lock has no expiry — crash between lock and enqueue permanently wedges that Operative (`scheduler.ts:444-456` vs `:417`).
- `add_queue_job` dedup race throws spurious `Failed to create or find job` if the deduped row completes between `DO NOTHING` and re-select (`add_queue_job.sql:29-45`).
- Stale-job cleanup only covers `generate_daily_brief` — worker down 2 days → 2-day-old pending SMS/notifications get sent on restart while stale briefs are correctly cancelled (`queueCleanup.ts:77`).
- `unhandledRejection` handler hard-exits, killing all in-flight jobs for one stray rejection (`index.ts:770-790`).
- `updateProgress` = SELECT + full-metadata UPDATE per tick — write amplification + lost-update window (`progressTracker.ts:49-117`).

**Brief**

- Brief marked completed _before_ `emit_notification_event`; emit failure only logged — "brief generated but no email" has no recovery path (`briefWorker.ts:203, 306-338`).
- Zero-project users with active brief prefs fail every day, forever, with `brief.failed` notifications (`ontologyBriefGenerator.ts:1105-1107`).
- Immediate-brief regenerate races the claimed scheduled job (timestamped dedup key + non-atomic cancel-then-add) → double generation, double LLM spend, **two emails** (`scheduler.ts:123-138`).
- `recordBriefEntities` plain-inserts on regeneration → duplicate `ontology_brief_entities` rows polluting agentic-chat's mentioned-entity source (`ontologyBriefGenerator.ts:1634`).

**Notifications/SMS**

- Quiet-hours at notification level _drops_ the SMS instead of deferring (adapter ignores `rescheduleTime`; with dead retries it's permanently lost) (`smsAdapter.ts:676-687`).
- Rate-limit counter consumed before the send and per retry; legacy fallback resets on server date (`smsPreferenceChecks.ts:352-353`).
- Preference-cancelled results recorded as `failed`, polluting failure metrics (`emailAdapter.ts:240-249`, `smsAdapter.ts:616-625`).
- Event-type fallback hardcodes `'brief.completed'` → wrong opt-in gate for non-brief notifications (`notificationWorker.ts:781`).
- Phone "masking" logs the full number: `substring(-2)` ≡ `substring(0)` (`smsAdapter.ts:646`; raw at :741, :785).
- Worker email-tracking route marks every recipient opened on one pixel hit — likely vestigial anyway, see §5 (`routes/email-tracking.ts:95-131`).

**Agent-run / homework / project-loop / tree-agent / ontology / chat**

- `consumeAllSignals` marks _all_ unconsumed signals consumed — a cancel arriving during steer processing is dropped (`agentRunWorker.ts:829-834`).
- `metrics.cost_usd` always 0: reads `usage.costUsd`, smart-llm emits `totalCost` (`agentRunWorker.ts:698-701` vs `packages/smart-llm/src/types.ts:64-72`).
- Full transcript resent every round, no windowing — O(n²) token spend (`agentRunWorker.ts:565-567`).
- Homework: single transient iteration error terminally fails the whole run, no resume (`homeworkWorker.ts:365-414`); read-only tool calls count as "progress" so the no-progress stop never fires (`homeworkEngine.ts:1486-1491`); failed runs never notify the user (`homeworkWorker.ts:110-114` vs `:701-706`).
- Project-loop: dedup key embeds fresh `runId` so it never dedups (`enqueue.ts:119`); `NODE_ENV !== 'production'` force-enables loops overriding explicit `ENABLE_PROJECT_LOOPS=false` (`config/projectLoops.ts:13-15`); documents unbounded in prompts while tasks/goals are capped (`projectLoopWorker.ts:135-143`); 4 generators strictly sequential (:269-317).
- Tree-agent: update tools replace the entire `props` JSON with the LLM's partial object (`executor:1564-1565` + 7 sites); raw LLM text interpolated into PostgREST `.or()` filters (comma/paren injection) (executor:666 etc.); Tavily fetch has no AbortSignal (executor:586-590); no cancellation path.
- Ontology classifier: entity fetched/updated by `id` only, `userId` used solely for billing (`ontologyClassifier.ts:256-330`); full document content into the prompt untruncated (:198-228).
- Chat: sub-0.9-confidence name matches mint a new contact + merge candidate per mention (`contactSignalProcessor.ts:640-680`); Libri results paired by array index → chimera records on reorder (`libriEntityHandoffClient.ts:303-306`); startHere no-op guard compares against the doc, not pending proposals → duplicate proposals (`startHereCaptureProcessor.ts:157-233`).
- Twilio status webhook does an unauthenticated DB read before signature validation (`apps/web/.../twilio/status/+server.ts:119-132` vs :154-181).

---

## 4. Performance

- **Head-of-line blocking** (above) is the biggest throughput issue.
- Brief: `onto_tasks`/`onto_edges` fetched unbounded for all projects (thousands of old `done` tasks daily, discarded after categorization) (`ontologyBriefDataLoader.ts:1824-1831, 1885-1888`); exec summary + LLM analysis sequential but independent (`ontologyBriefGenerator.ts:1245-1340`); Kokoro 82M-param model loaded from scratch in a fresh fork per audio job — the in-child cache never survives `process.exit` (`audioSynthesisProcess.ts:70` + `tts/kokoro.ts:26-37`).
- Scheduler: re-fetches each user's `users` row per queued brief despite the batch map already passed in (`scheduler.ts:72-76`).
- SMS delivery does ~6-7 preference-shaped queries where 2 would do (worker + adapter double-check + safety-check refetches).
- dailySmsWorker: one awaited LLM call per event, serial; then 3 sequential DB/queue writes per message (`dailySmsWorker.ts:192-326, 389-451`).
- Per-op `ensureActorId` + `fetchProjectSummaries` with zero caching — ~20 redundant lookups per agent run (`shared-agent-ops/op-execution-gateway.access.ts:65-76`).
- Scratchpad read-full/rewrite-full O(n²) + lost updates (tree-agent `:304-320`; homework engine `:1281-1289`).

---

## 5. Dead code & removal list (~2,700 LOC confirmed dead)

**Safe to delete now**

- **Legacy email chain (~1,575 LOC):** `workers/brief/emailWorker.ts`, `lib/services/email-sender.ts`, `webhook-email-service.ts`, `email-service.ts`, `gmail-transporter.ts`, `lib/utils/emailTemplate.ts`. The `generate_brief_email` job type was decommissioned by migration `20260426000009`; live path is briefWorker → `send_notification` → emailAdapter. Frees `nodemailer` + `@types/nodemailer`. Delete `tests/email-sender.test.ts`, `tests/test-email*.ts`, `tests/test-url-transform.ts` with it.
- **Legacy LLM pool (~744 LOC):** `lib/services/llm-pool.ts`, `lib/utils/activityLogger.ts`*, `lib/types/llm.ts`. Zero references anywhere. (*Note: one audit pass believed homework used `trackedInAppNotification`/activityLogger — activityLogger's only importer is llm-pool; re-grep at deletion time.)
- `src/routes/webhooks/daily-brief-email/+server.ts.spec` — 336-line SvelteKit design note inside the Express worker; never compiled or run.
- `apps/worker/scripts/` one-off queue diagnostics from 2025-10 (5 files); `tests/manual-test.ts` judgment call.
- `apps/worker/migrations/engagement_analytics_rpc.sql` — creates an RPC a later migration explicitly DROPs; whole dir dead.
- Root planning docs (`IMPLEMENTATION_COMPLETE.md`, `PHASE1/2_*.md`, `SCHEDULER_REVIEW_SUMMARY.md`), `thoughts/` research notes, `docs/EMAIL_SETUP.md` + `docs/features/EMAIL_SYSTEM_OVERVIEW.md` (describe the dead email path).
- Unused exports: `jobAdapter.ts` `isProcessingJob`/`isLegacyJob`; `queueUtils.ts` `EmailBriefJobData`; `markdown.ts` `getProseClasses`/`getMarkdownPreview`/`hasMarkdownFormatting`; `emailTemplate.ts` goes with the chain.
- Web side: `railwayWorker.service.ts` dead server branches (unauthenticated → would 401), no-op `cancelJob`/`cancelScheduledJobs` stubs, zero-caller `queueOnboardingAnalysis`/`queueChatSessionClassification`/`queueBraindumpProcessing`.

**Needs verification first**

- `workers/brief/projectNextStepGenerator.ts` (398 LOC) — superseded by inline generation in `ontologyBriefGenerator.ts:581-614`; confirm brief prompt no longer expects seeded next steps.
- `src/scripts/backfillStartHereDocuments.ts` + `backfill:start-here` script — delete once the prod backfill is confirmed run.
- App-level `apps/worker/nixpacks.toml` + `railway.toml` — stale duplicates of repo-root configs (node 20 vs 22!); confirm Railway root-directory setting is `/` first.
- `generate_brief_email` remnants in `packages/shared-types/src/queue-types.ts` (:272, :423, :564) — web may still read old rows for display.
- `routes/email-tracking.ts` — all generated pixels point at `PUBLIC_APP_URL` (web owns `/api/email-tracking/[tracking_id]`); confirm no old emails reference the Railway origin.
- **Tree-agent surface** — orphaned experiment carrying critical bugs; decide delete vs flag-off.

**Looks dead but is USED — do not remove**

- `audioSynthesisChild.ts` (forked by compiled path string), `@breezystack/lamejs` (dynamic import in `tts/mp3.ts:25`), `queueCleanup.ts` (dynamic import in index.ts:654/697), `tests/integration/sms-event-scheduling/` (wired via `test:integration`), `lib/services/smart-llm-service.ts` (legit thin adapter, 19 importers — NOT a duplicate of packages/smart-llm), `holiday-finder.ts`, `trackedInAppNotification.ts`.

**Dead-in-contract job types** (enum/typemap only, no producer, no processor): `generate_phases`, `process_brain_dump`, `send_email`, `update_recurring_tasks`, `cleanup_old_data`, `other`, `generate_brief_email`. Also `isValidJobMetadata` (`queue-types.ts:543-595`) is called nowhere and missing `agent_run`/`buildos_project_loop`. `retrying` status is vestigial (fail_queue_job resets to `pending`); web still branches on it in 4 places while `realtimeBrief.service.ts` omits it.

**Dead notification code:** `processNotificationJobs` (185 lines, `notificationWorker.ts:1090-1275`) — parallel self-claiming implementation never called; the misleading idempotency comments live here.

**Misc cleanup:** startup "Processing job types" log lists 10 of 18 registered types (`worker.ts:548-566`); `enableConcurrentProcessing` and `retryBackoffBase` config knobs are dead (real retry backoff is SQL-side `POWER(2, attempts)` minutes); stats `setInterval` never cleared; `(supabase as any)` casts pending `gen:types`; ~150 lines duplicated verbatim between contact/profile signal processors; emailAdapter's ontology/non-ontology branches are ~90-line duplicates and the "legacy" branch is unreachable (`is_ontology_brief` always true).

---

## 6. Integration contract (web ↔ worker) — healthy

- All 18 registered job types have live producers; all web enqueue payloads match processor reads field-for-field. No stuck-pending or orphaned-processor cases.
- Auth is fail-closed both directions: worker global bearer middleware 401s everything without the token (only `/health` + email-tracking exempt); web proxies derive `userId` from session, never the body; all three worker→web callbacks (daily-brief email HMAC, calendar sync bearer, notification email bearer) are secret-verified with live handlers.
- Results reach the frontend via Supabase Realtime on `queue_jobs` filtered by `user_id`; progress contract (`metadata.progress`, `metadata.generation_progress`) matches exactly between `progressTracker` and `realtimeBrief.service.ts`.
- Only debt: `railwayWorker.service.ts` (unauthenticated dead branches — a 401 landmine for the first server-side caller), `schedule_daily_sms` manual-trigger flags typed in a worker-local interface instead of shared types, and the dead job types above.

## 7. What's verified healthy

- Claim/complete/fail RPC contract: TS matches SQL exactly across all 8 RPCs; `processing_token` correctly prevents stale completion writes.
- Every LLM call routes through smart-llm's 120s `AbortSignal.timeout` — no infinite-hang class.
- Brief data loading is genuinely batched (no per-project N+1); brief idempotency rests on solid `user_id,brief_date` upserts; LLM failures degrade to deterministic fallbacks at every stage.
- Audio child-process lifecycle is closed against zombies/hangs; audio dedup is status-guarded.
- Braindump, onboarding, and context-snapshot processors are clean: user-scoped, idempotent, sanitized, correct fail-then-throw.
- Agent-run + shared-agent-ops security architecture: fail-closed op policy (raw op checked against supported + grant-bound `allowed_ops` before alias normalization), race-safe claiming, consistent user scoping.
- Calendar-sync, voice-note, OCR, project-icon workers: comparatively clean and idempotent.

---

## 8. Recommended fix order

1. **Verify/fix `queue_sms_message` missing `user_id` in prod** (§1.1) — cheap check, possibly a total SMS outage on the notification path.
2. **Heartbeat + status-fenced claiming for long jobs** (§1.2) — one shared pattern (agent-run already has it) kills the double-execution class across tree-agent, homework, project-loop. Pair with raising stall timeout above worker timeout and making `withWorkerTimeout` abortive.
3. **Fail-closed scoping in tree-agent + homework** (§1.3) — small diffs, cross-tenant exposure. Or decide tree-agent's fate first (§1.4 note) and delete instead.
4. **Graceful shutdown**: single SIGTERM handler, drain in-flight batch, then flush PostHog, then exit (§1.5).
5. **SMS idempotency**: pre-send status check in `processSMSJob` + Twilio idempotency key (§1.6).
6. **Notification retry contradiction** (§2): don't mark `failed` before the retry decision (or exclude first-attempt failures from FINAL_STATES), pass `{ count: 'exact' }`, add webhook fetch timeout.
7. **Daily SMS timezones**: per-timezone (or hourly) scheduling pass + `fromZonedTime` window fix + insert dedup (§2).
8. **Chat pipeline**: raise/remove the 2.5s/3.5s pseudo-timeouts, fetch newest messages, fix the >50-message permanent skip (§2).
9. **Config unification**: env vars win over NODE_ENV profiles, one config source (§2).
10. **Dead-code sweep** (§5) — ~2,700 LOC + deps + stale configs; mostly mechanical.
11. Backoff calculator range-matching, brief notify-before-complete ordering, head-of-line blocking, agent-run janitor + orphan fixes, project-loop sanitization whitelist — batch as a second wave.
