<!-- docs/technical/reviews/project-loops-flow-audit-2026-07-04.md -->

# Project Loops Flow Audit — Findings — 2026-07-04

Response to [`project-loops-flow-audit-handoff-2026-07-04.md`](./project-loops-flow-audit-handoff-2026-07-04.md). Method: four parallel code audits (task-conflict dedupe, feedback memory, Complete Project Audit, ops plumbing) + direct read-only queries against the production database + deploy-environment checks. All file references verified against the working tree as of 2026-07-04.

## Resolution Log

> The findings below are preserved as the original audit record. This log tracks what has been fixed since. Inline `✅ Fixed 2026-07-04` markers point back here.

### Tier 0 — all three shipped 2026-07-04 (migration applied to prod)

1. **P0 `chat_type` CHECK violation — FIXED.** Migration `supabase/migrations/20260704000000_add_project_audit_chat_type.sql` re-adds `'project_audit'` to `chat_sessions_chat_type_check` (kept `context_type = 'project'`, already valid). **Applied to production.** The Complete Audit track is now unblocked at the schema level — it still needs the validation run (Tier 1 #9) and remains flag-gated off.
2. **Feedback memory now exists.** `decideProjectSuggestion` (`project-suggestion-actions.service.ts`) now writes `user_feedback` on _every_ dismissal, synthesizing `{ reason: 'dismissed_without_note', created_at }` when the surface sends nothing (covers the dashboard modal). Added `'dismissed_without_note'` to `ProjectSuggestionFeedback['reason']`. Dropped the `user_feedback IS NOT NULL` filter in `loadPriorDecisions` (`projectLoopWorker.ts`) so `rejected` **and** `applied` rows re-enter loop context. (`loadAuditMemory` never had that filter.)
3. **Deterministic pre-insert suppression.** New pure `suggestionSuppressionKey()` (`generators.ts`) keys a suggestion on the entities its operations touch — order-insensitive task-pair for `task_conflict`, document-id set (namespaced by kind) for `doc_org`/`doc_outdated`, `null` for drift. `processProjectLoopJob` loads existing open + recently-decided suggestions (`loadExistingSuggestionKeys`, statuses `pending`/`delegated`/`rejected`/`applied`, 60-day window) and drops matching fresh proposals before insert, plus within-run dedup. Suppressed count is logged and summarized. Unit test: `apps/worker/tests/projectLoopSuppression.test.ts`.

### Tier 1 — code fixes landed 2026-07-04/2026-07-05 (uncommitted; typecheck + targeted tests green)

4. **Freshness fingerprint scoped per suggestion.** The whole-project SHA (which superseded every pending item on any edit — 100% supersede rate in prod) is replaced by a fingerprint over _only the entities a suggestion's operations mutate_. New shared helpers in `packages/shared-agent-ops/src/project-loops.ts`: `extractProjectLoopSuggestionEntities` (operation targets — task_id + `props.loop_conflict_with_task_id` + document_id), `loadProjectLoopSuggestionEntityStates` (loads those entities by id, missing = null-state), `buildScopedSuggestionFingerprint` (order-insensitive hash), and `computeProjectSuggestionFreshnessFingerprint`. The worker stamps each suggestion via a batch load; the web check (`isProjectSuggestionFresh` in `project-loop-snapshot.service.ts`, called by both `decideProjectSuggestion` and `decideProjectSuggestionWithClarification`) recomputes it the same way. Suggestions that mutate nothing (drift, `audit_recommendation`) get a `null` fingerprint → no freshness guard, which also removes the §5 audit-child over-invalidation. The now-dead whole-project machinery (`loadProjectLoopSnapshotContext`, `loadProjectLoopSourceFingerprint`) was deleted. Tests: `apps/worker/tests/projectLoopsShared.test.ts`. **Needs a review of the stamp==check symmetry before enabling.**
5. **Stable single-flight dedup keys + dedup-loser cleanup.** `projectLoopDedupKey` / `projectAuditDedupKey` (per-project, per-UTC-day) live in shared-agent-ops. The web light-loop enqueue (`project-loops.service.ts`), the worker end-of-day enqueue (`enqueue.ts`, re-exported for its test), and both complete-audit enqueues (web `project-audit-trigger.service.ts` + worker `auditEnqueue.ts`) now use them, so a manual trigger racing a burst or the cron collapses onto one job instead of double-running. `add_queue_job` only dedups against pending/processing jobs, so sequential same-day runs still proceed. **2026-07-05 hardening:** every producer now resolves the returned queue row, parses its metadata via `readProjectLoopQueueMetadata`, and requires exact ownership (`runId`, and `auditId` for complete audits). If the RPC returned an existing job, or metadata is missing/malformed, the freshly-created loser `project_loop_runs` / `project_audits` rows are immediately marked `failed` instead of lingering `queued`.
6. **Suggestion-lifecycle telemetry.** Worker emits `project_suggestion_generated` (generated/inserted/suppressed counts, `repeated_after_dismissal_count`, per-kind counts, cost). Web `decideProjectSuggestion` emits `project_suggestion_{accepted,dismissed,superseded_freshness,application_failed}` via `captureServerEvent`. `loadExistingSuggestionKeys` now separates rejected keys so the repeated-after-dismissal signal is real.
7. **Run finalization + proactive reclaim.** `finalizeProjectLoopRunIfComplete` (new `apps/web/src/lib/server/project-loop-run.service.ts`) advances a run `waiting_review → completed` once no child suggestion is `pending`; wired into every decide path (`project-suggestion-actions`, `clarified-decision`, `resolve-from-chat`). Worker `reclaimStalledProjectLoopRuns` (scheduler cron `*/30 * * * *`) fails runs stuck `running`/`queued` past the stale thresholds and finalizes orphaned `waiting_review` runs — independent of the next enqueue.
8. **Document caps + brief under the cost cap.** Worker `loadLoopContext` caps documents fed into generator prompts to the most-recently-updated `MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS` (40); `generateProjectBrief` now runs under the shared cost cap with a heuristic-brief fallback. `loadProjectAuditSnapshot` was deliberately left uncapped — its doc list drives size classification and is deterministic (no LLM prompt), so capping there would silently change the audit gate.
9. **Complete-audit claim lifecycle hardened.** `processCompleteProjectAuditJob` now claims the paired `project_audits` row before the `project_loop_runs` row, scopes the audit claim to `loop_run_id`, and compensates any partial claim by failing the inconsistent row set. This closes the bug where an audit-claim miss could leave the run stuck `running`.
10. **Failed-parent suggestion cleanup.** If a light loop or complete audit fails after writing child `project_suggestions`, the worker now marks still-`pending` suggestions for that `run_id` as `superseded` and re-syncs their inbox rows. This prevents pending inbox items from surviving under a failed parent run/audit.
11. **Regression coverage added.** New/updated tests cover complete-audit claim compensation, failed-run suggestion cleanup, queue-metadata parsing, web light-loop dedup cleanup, and web complete-audit dedup cleanup (`projectLoopWorkerCompleteAuditClaim.test.ts`, `projectLoopsShared.test.ts`, `project-loops.service.test.ts`, `project-audit-trigger.service.test.ts`).
12. **LLM audit synthesis exists.** Complete Audit now builds a deterministic packet, then runs `project_audit_synthesis` through `SmartLLMService` when an audit user is available. The prompt is evidence-catalog constrained, requires cited evidence refs on findings/dimension updates/risks/questions/recommendations, records `model_used = llm-audit-synthesis-v1`, and falls back to the deterministic packet on LLM failure.
13. **Task-conflict intelligence improved.** `generateTaskConflicts` now uses deterministic candidate-pair shortlisting before LLM classification, with title overlap, same-goal/date signals, opposing-action language, candidate-pair enforcement, `loop_conflict_with_task_id` validation, and evidence/operation agreement checks. Remaining task-conflict product work is mostly richer UI/actions and making accepted conflict flags useful outside the inbox.
14. **Feedback UI wiring landed.** Project Inbox and Dashboard Inbox render dismissal reason/note fields for project suggestions. The current slice fixes the optimistic-removal bug that cleared those fields before submit and preserves bare dismissals by omitting empty feedback fields instead of forcing `reason = other`. Route coverage confirms the shared inbox decide route passes explicit dismissal feedback to the decision service; `pnpm --filter=web check` is clean and the web test run passed (317 files / 1998 tests).

**Bonus (discovered during the fix, not in the original audit):** the worker end-of-day `createLoopChatSession` wrote `chat_type: 'project_loop'`, which is **not** in `chat_sessions_chat_type_check` — it would 23514 the moment the end-of-day loop ran with the flag on (a latent P0 blocking #9). Aligned to `'project'`, matching the web path.

**Still open:** **the operational step: set `PUBLIC_ENABLE_PROJECT_LOOPS` in Vercel + `ENABLE_PROJECT_LOOPS` in Railway, confirm the 0703/0704 migrations are applied to prod, then run the handoff validation sequence (never executed).** Plus Tier 2 product work: inbox shape/grouping, per-user scheduled-loop timezone, audit history depth, and making accepted task-conflict flags visible/useful outside the inbox. Tier 1 code is uncommitted; loops remain flag-gated off in prod.

## Executive Summary

The four questions the handoff asked, answered:

1. **Are the loops helping users maintain clearer projects?** Not yet — they have never had the chance. Project Loops are off in production (no flag set in Vercel; worker presumed off), every prod row came from local runs against the prod DB, and the only two apply attempts ever made were both blocked by the freshness guard with **zero operations applied**. Net clarity delivered to production users so far: 0.
2. **Are duplicate/similar task suggestions smart enough to be useful and safe?** Safe: yes — approval writes only 4 reversible metadata keys into task `props`. Smart: no — one LLM call over ≤20 unsorted tasks with title + 160-char description, no similarity layer, no cross-run pair dedup, and it is the first generator starved by the cost cap.
3. **Does user feedback reliably suppress future suggestions?** In code, yes for the core loop: bare dismissals now get implicit feedback, prior decisions load without the old non-null filter, and deterministic pre-insert suppression prevents repeated semantic duplicates. Product gap: the inbox UI still does not collect useful free-text dismissal rationale.
4. **Is the Complete Project Audit flow real, testable, and pointed at the right outcome?** It is now real enough to validate: the schema blocker is fixed, queue/claim/failure lifecycle is hardened, and LLM evidence-grounded synthesis exists with deterministic fallback. It is still not production-validated, and the report quality needs a live smoke before broad enablement.

## 1. Flow Map

```
MANUAL LIGHT LOOP
  UI "Run Project Review"
  → POST /api/onto/projects/[id]/loops           [gated: PROJECT_LOOPS_ENABLED web]
  → project-loops.service.ts queueProjectLoop()
      · select-then-insert active-run guard (TOCTOU still not fully atomic)
      · insert project_loop_runs (queued)
      · add_queue_job dedup_key = project-loop:{projectId}:{YYYY-MM-DD}
      · resolve returned queue row metadata; if it does not own this runId, fail the new loser run
  → worker processProjectLoopJob                  [gated: ENABLE_PROJECT_LOOPS worker]
      · status-fenced claim queued→running (idempotent vs stall re-runs)
      · loadLoopContext (tasks≤20 recent, goals≤10, docs≤40 recent)
      · loadPriorDecisions (60d, status ∈ rejected/applied/delegated/superseded)   ← ✅ 7/04: dropped "AND user_feedback IS NOT NULL"
      · generators, sequential: brief (cost-gated with heuristic fallback) → doc_org → doc_outdated → drift → task_conflict
        (shared $0.35 cap checked between calls; task_conflict starves first)
      · loadExistingSuggestionKeys + suggestionSuppressionKey  ← ✅ 7/04: deterministic pre-insert dedup (task-pair / doc-set)
      · insert ≤25 project_suggestions
      · syncInboxItemForProjectSuggestion → inbox_items
      · if parent later fails, supersede pending child suggestions + sync inbox
      · run → waiting_review/completed; decide paths finalize waiting_review once no child is pending

BURST LIGHT LOOP
  onto task/document/doc-tree mutation routes (5 routes)
  → queueProjectLoopBurstAsync                    [skipped by structured suppress context; legacy header fallback remains]
  → score = source score + 30-min activity lookback; threshold ≥ 4
  → queueProjectLoop() (same path/races as manual)
  → also evaluateCompleteAuditBurst → queueProjectAudit('burst')

END-OF-DAY SCHEDULED LOOP
  cron 0 4 * * * (server clock ≈ UTC — NOT user timezone)
  → enqueueEndOfDayProjectLoops: active/planning, updated<24h, LIMIT 500
  → resolveProjectLoopOwnerUserIds (actor→user, validates public.users)  ← fixed vs 97 historical FK failures
  → enqueueProjectLoop dedup_key = project-loop:{projectId}:{YYYY-MM-DD}; returned queue metadata must own the new run

SUGGESTION ACCEPT
  POST /api/inbox/decide (or project suggestions route)
  → decideProjectSuggestion: claim → scoped freshness guard when operations mutate concrete entities
    (mismatch → superseded, "Rerun Project Review"; no-op suggestions skip the guard) → replay operations via ChatToolExecutor
    (with structured `project_review_context` suppress policy) → applied/failed → refresh audit counts → sync inbox
  ← user_feedback NEVER written on approve; ✅ 7/04: filter drop means applied rows are now visible to future runs anyway

SUGGESTION DISMISS
  → status='rejected' + decided_at + user_feedback ALWAYS   ← ✅ 7/04: synthetic {reason:'dismissed_without_note'} when none passed
  ← ✅ 7/05: Project Inbox + Dashboard Inbox expose reason/note fields and preserve values through optimistic card removal;
    empty fields are omitted so the server can distinguish bare dismissals from explicit "other"

INBOX-ORIGIN CHAT RESOLUTION
  → resolve-from-chat: mutation-satisfied → applied (no user_feedback);
    explicit Mark-handled/Dismiss → rejected + canned note ("Dismissed from chat.")

COMPLETE PROJECT AUDIT
  manual (POST /audits/run, bypasses gates) | burst | scheduled (14d cadence, medium+ only)
  → queueProjectAudit / queueProjectAuditFromWorker
      · insert chat_sessions chat_type='project_audit'   ← ✅ 7/04: constraint value re-added (was ✗ VIOLATES → aborts)
      · insert project_loop_runs + project_audits + project_audit_trigger_evaluations + queue job
      · resolve returned queue row metadata; if it does not own this runId/auditId, fail the new loser run/audit rows
  → worker processCompleteProjectAuditJob
      · claim project_audits + project_loop_runs as a paired ownership step; compensate partial/missing claims
      · build deterministic packet, then synthesize with LLM when an audit user is available (deterministic fallback)
      · ≤8 child project_suggestions (kind=audit_recommendation) + project_audit_suggestions links → inbox
      · if parent later fails, supersede pending child suggestions + sync inbox
      · supersede older ready audits
  → ProjectAuditTracker UI + audit chat session
```

## 2. Status Table

| Path                   | Built                             | Tested                                                     | Prod enabled                                                                    | Observed prod rows (2026-07-04)                                                                                       | Known failure modes                                                                                                                                       |
| ---------------------- | --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual light loop      | ✅                                | Locally (2 runs → 5 suggestions); targeted tests           | ❌ `PUBLIC_ENABLE_PROJECT_LOOPS` absent from Vercel (all envs)                  | 4 runs: 2 failed `feature_disabled`, 2 `waiting_review` (pre-fix)                                                     | Stable queue dedup + loser cleanup now in code; enqueue parent creation is still not a single DB transaction                                              |
| Burst light loop       | ✅                                | ❌ never fired in prod                                     | ❌ same flags                                                                   | 0 burst-triggered runs                                                                                                | Same queue lifecycle as manual; guard coverage only on 5 onto routes                                                                                      |
| End-of-day loop        | ✅ (owner fix + regression tests) | Historical only                                            | ❌ worker flag presumed off (no rows since 6/25; unverifiable — no Railway CLI) | 97 failed rows 6/14–6/25 (all `brief_generation_jobs_user_id_fkey` FK violation, pre-fix)                             | 4am server-clock global tick, not user TZ; 500-project silent cap                                                                                         |
| AI Inbox               | ✅                                | ✅ live in prod                                            | ✅ (inbox itself not loop-gated)                                                | 16 items (5 project_suggestion, 5 calendar, 6 agent_run); 2 calendar items stuck `deciding`/`processing` since 6/25   | `created_at DESC` only; `expires_at`/snooze dead code (never written); no grouping/caps                                                                   |
| Feedback memory        | ✅ server write + read path       | Targeted server/worker coverage; no live post-fix prod run | n/a                                                                             | Pre-fix: **0 of 5 suggestions had `user_feedback`**                                                                   | Finding decisions share one note for Address/Dismiss; bare dismissals get implicit feedback and prior decisions load without the old `IS NOT NULL` filter |
| Freshness guard        | ✅                                | ✅ targeted tests                                          | ✅                                                                              | Blocked **2 of 2** apply attempts ever made pre-fix (`freshness_guard`, 0 ops applied)                                | Scoped fingerprint now in code; no post-fix production run yet                                                                                            |
| Complete Project Audit | ✅ end-to-end                     | Targeted lifecycle tests; no prod execution yet            | ❌ flags                                                                        | `project_audits`: 0; `project_audit_trigger_evaluations`: **0** (gate never even evaluated); no audit queue jobs ever | Queue dedup/claim/suggestion-cleanup hardened; still needs live smoke and product-quality validation                                                      |

Historical correction to the handoff: before the Tier 1 fixes, "current light-loop dedup key should be stable by project/day in worker enqueue code" was true **only** for the end-of-day path. Manual and burst used run-UUID keys, so `add_queue_job` never deduped them. Current code uses stable per-project/day keys across web/worker producers and verifies that the returned queue row metadata owns the newly-created parent row(s).

## 3. Evidence: Task Dedupe Quality (`task_conflict`)

**Safety: good. Intelligence: thin. Noise control: absent.**

- **Context is title + 160-char description + state + updated_at only.** `LoopTask` carries no dates, priority, assignees, links, or goal linkage (`generators.ts:47-53`; `describeTasks` `generators.ts:337-345`). Tasks are filtered non-done then `.slice(0, 20)` **unsorted** (`projectLoopWorker.ts:169-170`) — above 20 an arbitrary, run-varying subset is scanned.
- **No discriminator language in the prompt.** It asks for "duplicated, contradictory, or mutually blocking" with only "Be conservative" as a brake (`generators.ts:799-812`) — nothing separating duplicates from subtasks, checklist repeats, or intentionally parallel work.
- **Current implementation note:** deterministic candidate-pair precomputation now exists before LLM classification. It is not embeddings-based, but it makes task-conflict coverage auditable and constrains the model to concrete candidate pairs.
- **Approval writes 4 inert props keys** (`loop_flagged_conflict`, `loop_conflict_kind`, `loop_conflict_with_task_id`, `loop_conflict_reason`) via a props-merging PATCH (`onto/tasks/[id]/+server.ts:493-525`), with undo ops and `risk_tier: 1`. Fully reversible; a false positive cannot damage task content, state, or existence.
- **Write-only metadata.** The only consumer of the flags is a display-label map (`shared-agent-ops/src/proposal-context/decode-operations.ts:50-53`). No task-creation flow, agent run, or future loop prompt reads them.
- **Cross-run pair dedup now exists** through stable semantic suppression keys and prior-decision loading. This still needs a live post-fix run to prove the user-facing repeat rate is down.
- **Validation improved.** `loop_conflict_with_task_id` and evidence/operation agreement are now checked against known task IDs and the deterministic candidate-pair set.
- **Cost-cap behavior improved.** `generateProjectBrief` now runs under the shared cost cap with heuristic fallback. `task_conflict` still runs late in the sequence, so the product tradeoff remains whether it should get a reserved budget.
- **Only approve/dismiss exist.** No merge / link / convert-to-subtask / close-duplicate actions (`suggestions/[suggestion_id]/+server.ts:24` — `z.enum(['approve','dismiss'])`); a chat can be opened to discuss, but resolution work is manual.

Recommendation on the handoff's design question: yes — compute candidate pairs deterministically first (title trigram/embedding shortlist), then have the LLM classify pairs with fuller context (dates, goal linkage, recent activity). The current whole-list scan combines the worst of both: nondeterministic coverage and no auditability.

## 4. Evidence: Dismissed-Suggestion Memory

**Historical pre-fix evidence.** Production on 2026-07-04 had 0/5 suggestions carrying feedback and 3 bare rejections, so the loop had never learned anything. Current code fixes the server-side memory path and the inbox dismissal input path; a post-fix live run is still needed to verify production behavior.

The original chain had four independent breaks:

1. **No input control existed. ✅ Fixed 2026-07-05; simplified 2026-07-18.** Project Inbox and Dashboard Inbox now use one decision note for findings: it records resolution context for Address or feedback for Dismiss. Bare dismissals remain valid and receive implicit server feedback; executable proposals keep direct Accept/Dismiss controls.
2. **Dashboard modal sent nothing. ✅ Fixed 2026-07-05; simplified 2026-07-18.** Dashboard dismissals now use the same shared decision-note contract as the Project Inbox path.
3. **Approve never writes feedback. ✅ Mitigated 2026-07-04.** The apply path still does not synthesize feedback, but applied rows now load into prior-decision context without requiring `user_feedback`, so completed work can suppress repeat proposals.
4. **The loader required what nothing wrote. ✅ Fixed 2026-07-04.** `loadPriorDecisions` now includes rejected/applied/delegated/superseded rows without the old `user_feedback IS NOT NULL` filter.

Even when a prior decision _does_ reach the prompt, `describePriorDecisions` (`generators.ts:347-362`) renders only kind/title/status/reason/note — no entity IDs, no evidence refs — so suppression depends on the LLM fuzzy-matching a title it regenerates fresh each run. The only deterministic suppression anywhere is normalized-title matching for `audit_recommendation` in the audit path (`projectLoopWorker.ts:529-535, 733-754`) — which has the opposite flaw: it blocks same-title recommendations for 90 days with no materiality override.

Resolve-from-chat: the mutation-satisfied path writes `applied` with no `user_feedback`; the explicit path writes `rejected` + a canned note ("Dismissed from chat.") — and notably records "Mark handled" as `rejected` too (`resolve-from-chat/+server.ts:142-223`).

Answer to the handoff's primary question: **yes — every dismissal should write at least an implicit `user_feedback` server-side**, and the `IS NOT NULL` filter should be dropped for `rejected` and `applied` statuses. But prompt-only suppression will still be unreliable; a deterministic pre-insert check (stable semantic key: task-pair for `task_conflict`, target-entity+kind for doc suggestions) is the real fix. **✅ Fixed 2026-07-04** — all three landed (server-side feedback, filter drop, `suggestionSuppressionKey` pre-insert check). See Resolution Log.

Telemetry update: project-suggestion lifecycle events now exist (`generated`, `accepted`, `dismissed`, `superseded_freshness`, `application_failed`) plus repeated-after-dismissal counts. The remaining gap is production validation that those events are emitted with useful payloads and surfaced in a dashboard.

## 5. Evidence: Complete Project Audit Readiness

**Built with deterministic scaffold plus LLM synthesis, but not product-validated in production.**

- **P0 — CHECK constraint violation (verified in-tree). ✅ Fixed 2026-07-04.** `chat_sessions_chat_type_check` was last defined by `20260430000003_remove_brain_dump_chat_context.sql:35-47` with 9 allowed values — `project_audit` is not one, and no later migration touches `chat_type`. But three sites insert it: `auditEnqueue.ts:101`, `project-audit-trigger.service.ts:82`, `project-audit-chat-session.service.ts:332`. Every queue path creates the chat session **before** the `project_audits` insert, so creation aborts with a 23514 (`project_audit_queue_failed`) on all four entry points — manual included. **Zero audits are guaranteed under any flag configuration.** No test caught it because worker tests mock Supabase. **Fix:** migration `20260704000000_add_project_audit_chat_type.sql` re-adds the value; applied to prod. The three insert sites are unchanged (they already wrote a valid `context_type`).
- **The gate has never even been evaluated in prod**: `project_audit_trigger_evaluations` has 0 rows and no audit-type queue job has ever existed — consistent with flags off (burst/scheduled/manual are all behind `PROJECT_LOOPS_ENABLED`), with the constraint bug waiting behind the flag.
- **The report now has an LLM synthesis stage.** `buildCompleteAuditPacket` still provides the cheap deterministic scaffold, but `synthesizeCompleteAuditPacket` asks an evidence-catalog-constrained LLM to refine confidence, thesis, summary, findings, dimensions, risks, open questions, and recommendations. It requires cited `evidence_refs` and falls back to `deterministic-audit-v1` if synthesis fails.
- What _is_ solid: trigger math with real thresholds (`project-audits.ts:244-269, 297-315, 618-635`; cooldowns 14d scheduled / 7d complete / 2h burst-quiet), manual run wired end-to-end (`ProjectAuditTracker.svelte:800-811` → `POST .../audits/run`, bypasses baseline gates), audit memory reuse (90-day prior recommendation decisions + light-loop prior decisions), child-suggestion linking + inbox indexing, count maintenance on decide (`refreshLinkedAuditSuggestionCounts`, `project-suggestion-actions.service.ts:125`), superseding of older audits, and a rich UI + seeded audit chat.
- Additional defects: `critical_change` trigger reason has no producer (plumbed, never invoked); `audit_recommendation` children now intentionally carry no freshness fingerprint, so stale audit follow-ups rely on parent audit lifecycle and recurrence memory rather than the approval freshness guard; a prior audit stuck `queued`/`running` may still block manual runs if the audit row itself is not reconciled with the parent run; minor unresolved-count status-set mismatch between worker (`:970`) and web refresher.

**Minimal validation run once unblocked:** (1) migration re-adding `project_audit` to the constraint; (2) both flags on; (3) confirm 0703 migrations applied; (4) click "Run audit" on any active project (manual bypasses baseline); (5) verify `project_audits` reaches `ready`, child suggestions + links + inbox rows, tracker rendering, audit chat seed.

**Product call:** the architecture now matches the intended shape: deterministic trigger/scaffold plus evidence-grounded LLM synthesis. The remaining question is not whether the synthesis stage exists; it is whether a live audit produces specific, trustworthy, low-noise findings that users will act on.

## 6. Cross-Cutting Findings

- **Freshness guard over-invalidation (P1). ✅ Fixed in code.** Original defect: one SHA-256 over the whole project invalidated every pending suggestion on any edit. Current code stamps scoped fingerprints over only the mutated entities, and no-op/informational suggestions carry no freshness guard.
- **Run/audit lifecycle gaps (P1). ✅ Fixed in code.** Original defects: `waiting_review` runs never finalized, stale `running`/`queued` rows were only reclaimed on later enqueue, complete-audit claim could leave a run stuck `running`, dedup losers could leave orphan queued rows, and failed parents could leave pending suggestions visible. Current code has decide-path finalization, proactive worker reclaim, paired complete-audit claim compensation, queue metadata ownership checks, dedup-loser cleanup, and failed-parent suggestion superseding.
- **Inbox is structurally on the path to a second task list (P2).** Ordering is `created_at DESC` only; `expires_at` and snooze are read/reconciled but **never written anywhere** (dead features); no grouping or pending caps. Counterpoint: sync/repair is genuinely good — per-list reconciliation, backfill, decide-route fallback status forcing, delegated-run repair (`inbox.service.ts:173-254, 503-671`; `inbox-index.ts:92-158`). The two `deciding` items stuck since 6/25 mirror a _source_ (`calendar_project_suggestions`) stuck in `processing` — the inbox is faithfully reflecting an upstream stall, and nothing repairs that source state.
- **Recursion guard no longer depends on a custom header. ✅ Fixed in code.** Suggestion application now injects a structured `project_review_context` body (`origin:'project_suggestion_replay'`, `review_policy:'suppress'`) for JSON replay mutations. The burst-wired task/document/doc-tree routes parse that context and suppress recursive project-loop bursts; `X-Skip-Project-Loop-Burst` remains only as a compatibility fallback. Regression coverage now checks the replay body context, the allowlisted suppress policy, and task PATCH route behavior.
- **Telemetry is improved but still unvalidated in production.** Complete-audit lifecycle events and project-suggestion lifecycle events now exist. Remaining gaps are run-level/burst dashboards, aggregate inbox-decision observability, and live validation that emitted payloads are queryable and useful.
- **Prompt payload caps improved.** Light-loop document context is capped before generator prompts, and the brief generator is under the shared cost guard. `loadProjectAuditSnapshot` remains deliberately uncapped because it drives deterministic audit sizing; the remaining product question is how to bound any future LLM audit synthesis pass without hiding material project evidence.
- **End-of-day ≠ end of day.** Single global `0 4 * * *` server-clock cron with no timezone arg (`scheduler.ts:202`), unlike the timezone-aware daily-brief scheduling in the same file. 500-project scan cap silently drops the remainder; no per-user fan-out cap (a user with 40 touched projects gets 40 loops that night, throttled only by queue batchSize=5).
- **Historical end-of-day failures**: confirmed stale (97 rows, 6/14–6/25, all the same FK violation via the legacy-named `brief_generation_jobs_user_id_fkey` constraint on `queue_jobs`; owner-resolution fix + regression tests in place). Recommend bulk-marking them archived/acknowledged so dashboards don't read as live failures.

### Operational answers (handoff §Operational Questions)

1. `ENABLE_PROJECT_LOOPS` in prod worker: **unverifiable from this machine** (no Railway CLI); no scheduled rows since 6/25 is consistent with off. 2. `PUBLIC_ENABLE_PROJECT_LOOPS` in prod web: **confirmed absent** (0 loop/audit vars across all 58 Vercel env entries). 3. Effectively yes — loops are off pending validation, but note dev mode force-enables web-side (`project-loops.ts:18-19` — `dev ||` ignores the flag). 4. Archive the 97 failed rows as historical. 5. Dedup keys: light loop ✅ per project/day; complete audit ✅ per project/day; audit-trigger-eval ✅ project/reason/minute; all parent rows now verify returned queue metadata ownership and fail local losers. 6. Stalled-job reclaim is safe against duplicate suggestions (status-fenced claim) and no longer depends only on future enqueue. 7. Cost caps improved but still soft per LLM call. 8. Telemetry: audit lifecycle + project suggestion lifecycle now exists, but prod signal is unvalidated. 9. Recursion exclusion: yes on the wired paths, now body-context based with a legacy header fallback and targeted tests. 10. Inbox transitions repairable: yes for inbox↔source drift; no repair for stuck _source_ states or for suggestions stuck `approved` mid-apply.

## 7. Ranked Recommendations

### Tier 0 — Broken; nothing downstream matters until fixed — ✅ ALL DONE 2026-07-04

1. **✅ DONE — Migration: re-add `'project_audit'` to `chat_sessions_chat_type_check`** (or stop writing that chat_type). Unblocks the entire Complete Audit track. One migration file. → `20260704000000_add_project_audit_chat_type.sql`, applied to prod.
2. **✅ DONE — Write `user_feedback` on every dismissal, server-side.** In `decideProjectSuggestion`, synthesize `{ reason: 'dismissed_without_note', created_at }` when the sanitizer returns null; drop the `user_feedback IS NOT NULL` filter for `rejected` and `applied` in `loadPriorDecisions`/`loadAuditMemory`. This makes the memory loop _exist_ with zero UI work. → Shipped; filter dropped only in `loadPriorDecisions` (`loadAuditMemory`'s recommendation query never had it). `'dismissed_without_note'` added to `ProjectSuggestionFeedback['reason']`.
3. **✅ DONE — Deterministic pre-insert suppression.** Before inserting suggestions, load the project's pending + recently-rejected suggestions and skip proposals matching a stable key (order-insensitive task-pair for `task_conflict`; target-entity-id + kind for doc suggestions). Prompt-only suppression has empirically never had data to work with and would be unreliable even with it. → Shipped as `suggestionSuppressionKey()` + `loadExistingSuggestionKeys()` (suppresses against `pending`/`delegated`/`rejected`/`applied`, 60-day window; `drift` has no key and falls back to prompt suppression). Unit test: `apps/worker/tests/projectLoopSuppression.test.ts`.

### Tier 1 — Must be true before enabling loops in production

4. **✅ DONE — Scope the freshness fingerprint** per suggestion to the entities its operations touch.
5. **✅ DONE — Stable single-flight dedup keys + queue metadata ownership checks** for manual/burst light loops and complete-audit enqueues.
6. **✅ DONE — Suggestion-lifecycle telemetry**: `project_suggestion_{generated,accepted,dismissed,superseded_freshness,application_failed}` plus repeated-after-dismissal counts.
7. **✅ DONE — Run finalization + reclaim + failed-parent cleanup**: transition `waiting_review` → `completed` when the last child suggestion is decided; proactively reclaim stale active rows; supersede pending children when a parent fails after insert.
8. **✅ DONE — Cap documents** in light-loop context and put `generateProjectBrief` under the cost cap.
9. **TODO — Operational validation:** deliberately set both flags in Railway + Vercel, confirm the 0703/0704 migrations are applied in prod, then run the manual validation sequence from the handoff (§Suggested Audit Method steps 3–6) — none of it has ever been executed.

### Tier 2 — Product quality (the "thinking environment" gap)

10. **✅ DONE — Add the LLM synthesis stage to Complete Project Audit.** The deterministic packet remains the scaffold/fallback; synthesis must use catalog evidence refs.
11. **MOSTLY DONE — Task-conflict intelligence.** Candidate-pair precomputation and validation landed. Remaining work: richer task context where available, user-facing conflict actions, and surfacing accepted flags in task/agent contexts so approval buys the user something.
12. **DONE — Feedback UI wiring**: a small reason select + optional note is now present in both inbox surfaces. The UI preserves values through optimistic removal, omits empty fields so bare dismissals become `dismissed_without_note`, and route coverage locks the inbox decide feedback contract.
13. **Inbox shape**: either wire `expires_at`/snooze for real or delete the dead branches; group child suggestions by run/audit; consider risk-tier-aware ordering.
14. **End-of-day per-user timezone** (reuse the daily-brief zoned scheduling in the same file) and a per-user fan-out cap.
15. Archive the 97 historical failed rows; delete or wire up the orphaned per-suggestion telemetry route; give `critical_change` a producer or remove it.

## Appendix: Production Data Snapshot (2026-07-04, read-only)

- `project_loop_runs` (101): 97 end_of_day/failed 6/14–6/25 (FK: `brief_generation_jobs_user_id_fkey`), 2 manual/failed (`feature_disabled`), 2 manual/waiting_review (6/24, still stuck). Nothing after 6/25.
- `project_suggestions` (5): 3 rejected — all `user_feedback = null`; 2 superseded — `result.errors[0].tool = "freshness_guard"`, `applied_operations: 0`.
- `inbox_items` (16): 5 project_suggestion (all decided), 5 calendar_suggestion (2 stuck `deciding` w/ `source_status='processing'` since 6/25), 6 agent_run (all decided).
- `project_audits`: 0. `project_audit_trigger_evaluations`: 0. Audit queue jobs: none ever.
- `queue_jobs` (buildos_project_loop): 4, all completed, historical pre-fix dedup keys `project-loop:<run-uuid>`; current code uses stable per-project/day dedup plus returned-metadata ownership checks.
- Vercel production env: no `*PROJECT_LOOP*`/`*AUDIT*` variables in any environment. Local `.env`: both flags `true` (explains how the 6/24 manual runs succeeded — local web+worker against prod DB).
