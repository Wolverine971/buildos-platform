<!-- docs/technical/reviews/AGENTIC_CHAT_HANDOFF_2026-09-19.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat handoff: workflow pilot (81–89) and the Jev freshness radar (88)

**Written:** 2026-09-19, about 01:35 UTC (Sept 18, 9:35pm EDT), by the coordinating session.
**For:** the next agent picking up this work.
**Owner:** DJ, solo founder.

## Read this first

**Workflow inspector built, September 20 (later):** Task 91 is implemented locally on `main`,
uncommitted and undeployed: lab Logs/Trace/Export actions on the real session id, the session
audit API joins the seven workflow tables with admin-only access and per-table coverage, a new
`/admin/chat/workflows` inspector (Flow/Timeline/Evidence/Costs/Transcript/Raw, deep links,
polling only while running), and Markdown/ZIP exports with `flow.mmd`, `agents/<step>/`,
`raw/*.json` and a manifest that keeps stored hashes apart from exported-file hashes. 53 free
tests and `web check` pass; the inspector was browser-checked read-only on the pilot session
`d104deef…`. No paid runs, no QA gate, no worker/schema changes; per-attempt prompts remain
not persisted and are reported as coverage. Status and remaining items are in
[Task 91](../../../tasker/91-workflow-lab-audit-and-export.md#implementation-status-2026-09-20).

**Workflow inspection handoff, September 20:** DJ tested Workflow Lab and requested log links,
an admin-style multi-agent flow inspector, and chat/flow/evidence export for another agent to
reverse-engineer a run. [Task 91](../../../tasker/91-workflow-lab-audit-and-export.md) is a ready
implementation handoff with source map, data/coverage contract, and acceptance criteria. Existing
`ChatSessionAuditActions` and `AgentChatModal.onSessionChange` provide the lab link/export entry;
the session audit API still needs the workflow-specific records. This update creates the task,
not the feature. Research and the full QA gate remain deferred.

**Workbench migration applied, September 20:** `20260920162616_agentic_chat_specialist_workbench_v1`
is now applied to production and recorded under its original migration version. Fixed a hosted
default-grants issue before applying: service role now has only the required catalog operations,
with no delete/truncate access. Seven focused Postgres tests and a rolled-back production
save/publish/retry/ownership smoke pass; exact function bodies and migration source match. No paid
calls, application deployment, or custom-agent activation. See
[production verification](../../architecture/SPECIALIST_WORKBENCH_2026-09-20.md#production-migration-verification).

**Specialist workbench continuation, September 20:** Implemented locally at
`/workflow-lab/specialists`: private drafts, authored reference-note loading, free input/capability
checks, exact prompt previews, and immutable catalog versions. Publication does **not** activate
a custom agent in live chat. The `20260920162616_agentic_chat_specialist_workbench_v1` migration
was subsequently applied as recorded above; existing pilot cohort membership controls access. 32 focused
free tests, runtime build, web check, and a synthetic browser interaction check cover this slice.
No paid inference or production changes. See
[implementation and remaining activation bridge](../../architecture/SPECIALIST_WORKBENCH_2026-09-20.md).
Next: explicitly select and pin a published specialist in a supported chat workflow, then let Jev
choose among eligible versions/profiles. The full QA/research gate remains deferred.

**Shared-evidence continuation, September 20:** Implemented locally: document profile 3 now runs
the reviewer after the organizer and binds its input to accepted context and saved read-result hashes.
Old profiles keep their parallel behavior. 128 focused free tests and worker typecheck pass;
no paid calls were used. The new `20260920154843_agentic_chat_document_evidence_handoff_v1`
migration is **not yet applied to production**. Deploy the migration, then the worker, then web
with `AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED=true` while retaining DJ's cohort.
See [implementation, validation, rollout and rollback](../../architecture/DOCUMENT_EVIDENCE_HANDOFF_2026-09-20.md).
A small synthetic live smoke remains; the full QA/research gate stays deferred. Next implementation
was the specialist workbench with bounded knowledge loading, now described above. Activation of
published versions and durable Jev routing remain.

**Next-work clarification, September 20:** Rechecked production: all three specialist migrations,
the shadow table, and the three matching shadow functions are present. No reapplication is
needed. DJ asked to figure out the next work; the
bounded implementation plan
prioritizes shared document evidence, then the specialist workbench/knowledge loader, then
versioned Jev routing. Cross-turn evidence reuse is a separate follow-up rather than a prerequisite
for authoring specialists. This clarification changed documentation only.

**Production pilot enabled, September 20:** DJ explicitly authorized migration application and
live testing. All three specialist migration versions are recorded in production (the first two
already existed; their ledger entries were repaired after verifying SQL). Worker deployment
`629435b3-aeee-43ff-a3ca-556ec12a67e4` and web deployment
`dpl_8jMxWUeePvTN9pWm8aUPM8dnCoeE`, source `3c787c76d`, enable Review project,
Organize documents with bounded reads, and Jev **shadow** selection for DJ only. Two production
UI-to-worker runs on a new synthetic fixture completed for **$0.00647589** in recorded workflow
plus selector cost. History restored both answers/cards after reload; domain hashes were unchanged.
See [rollout, evidence, quality gap, and rollback](SPECIALIST_PILOT_ROLLOUT_2026-09-20.md).
Next: specialist evidence handoffs and safe cross-turn evidence reuse. The parallel risk reviewer
does not receive the organizer's full reads. Full QA/research remain deferred; dynamic Jev routing
is still unimplemented. Earlier "local only" notes below describe the implementation milestones,
not the current rollout state. The shadow migration and these documentation files still need to
be included in DJ's next source commit; no push was made by this session.

**Jev specialist shadow continuation, September 20:** The next local change set adds typed Jev
comparison of the supported specialist/tool bundles, a durable one-attempt audit receipt, and a
free offline comparison report. The fixed agents, tools, and answers remain authoritative.
`AGENTIC_CHAT_JEV_SPECIALIST_SELECTION` defaults to `off`; only `off|shadow` are accepted.
See [implementation, cost boundary, and rollout](../../architecture/JEV_SPECIALIST_SHADOW_2026-09-20.md).
91 focused free tests, worker typecheck, and the offline report command pass. The audit migration
is local only, with no paid inference or production setting changes. Shadow
cost is separate evaluation telemetry, outside the fixed workflow dispatch budget. Full QA remains deferred.

**Bounded document-tool continuation, September 19:** `document_organizer@2` now has one native
read tool for up to four inventory documents, immutable saved read results, and recovery without
refetching changed text. A new explicit policy and default-off `AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED`
gate preserve older tool-free runs. See [implementation and rollout](../../architecture/DOCUMENT_ORGANIZATION_SPECIALIST_2026-09-19.md#bounded-document-reads-implemented-locally).
253 focused free tests pass, along with runtime build, worker typecheck, catalog preview, and
web check (0 errors/warnings). The additional document-read migration is local only; no paid
inference or production changes. Next implementation boundary: Jev shadow selection and a durable selection receipt. Full QA and
research remain deferred by DJ.

**Document specialist continuation, September 19:** The next local change set adds the
**Organize documents** composer mode and `document_organizer@1`, with immutable admission-time
specialist snapshots and recovery through the existing durable engine. It proposes organization
from bounded titles/summaries and saved structure; it does not read full bodies or change documents.
See [implementation, rollout, and remaining work](../../architecture/DOCUMENT_ORGANIZATION_SPECIALIST_2026-09-19.md).
192 focused free tests passed, plus runtime build, worker typecheck, and web check (0 errors/warnings).
The migration is local only; production flags are unchanged. Full QA/research remain deferred.

**Specialist continuation, September 19:** DJ approved the next implementation step. The local
change set extracts the analyst/reviewer into versioned definitions, connects them to the current
runner, adds a selector port with a free deterministic preview, and specifies the future v2 run
snapshot. See [the implementation contract](../../architecture/SPECIALIST_DEFINITIONS_V1_2026-09-19.md).
That baseline is now followed by the document-specialist continuation above. No production switch or schema changed; the full gate remains deferred.

**Latest continuation, September 19, 8:16pm EDT:** DJ deployed the UI changes at `8951b7dc9`
and requested an inexpensive smoke. One real-model durable review passed for **$0.00573078**,
along with 79 free recovery/admission/restoration checks. The tested worker revision matches
Railway's successful deployment; its durable review switches and allowlist remain unset.
See the [light-smoke results and boundaries](AGENTIC_CHAT_LIGHT_SMOKE_2026-09-19.md).
Specialist definitions can proceed; full hosted acceptance remains deferred.

**Earlier continuation, September 19:** DJ explicitly deferred research and the full Agentic Chat QA gate.
The first live radar scans were inspected; see the
[radar follow-up](AGENTIC_CHAT_RADAR_LIVE_CHECK_2026-09-19.md). The current local change set adds
the composer’s **Review project** choice, durable workflow progress/restoration, and the freshness
card’s **Review deeper** draft action. Production rollout switches remain unchanged. See the
[UI implementation record](AGENTIC_CHAT_REVIEW_UI_2026-09-19.md) and the proposed
specialist agents/Jev next steps.
The original handoff below records the earlier deployment state.

- **The most urgent task is the freshness radar.** It went live for DJ's account minutes before
  this was written.
- Your first job is to watch its first real scans, fix anything that breaks, and report the
  results to DJ in plain product terms.
- Everything else below is ordered by priority.

## 1. What is live right now

| Item                                             | State                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `main` / origin                                  | In sync at `262e86bfc`. Everything below is committed and pushed.                                                             |
| Web (Vercel)                                     | Deployed from the push.                                                                                                       |
| `agentic-chat-worker` (Railway, 4 replicas)      | Running `262e86bfc`.                                                                                                          |
| `daily-brief-worker` (Railway)                   | Running `262e86bfc`. **This is the general job-queue worker, and the radar runs here**, not on the chat worker.               |
| Production migrations                            | Applied and recorded in the ledger: `20260914165546`, `…203007`, `…203008` (86/87), and `20260918200000`–`200300` (radar).    |
| Radar mode                                       | `FRESHNESS_RADAR_MODE=live` on `daily-brief-worker`.                                                                          |
| DJ's radar feature flags                         | ON: `freshness_radar`, `freshness_radar.surfaces`, `freshness_radar.inbox_cleanup`. **OFF: `freshness_radar.auto_apply`.**    |
| 86/87 workflow switches                          | All OFF: `AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED`, `…_V4_PREPARATION_ENABLED`, `AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED`. |
| Jev chat tool narrowing (another session's work) | `AGENTIC_CHAT_JEV_TOOL_SELECTION` defaults to `on`, so it affects every chat turn. This was not built here.                   |

DJ's user id is `255735ad-a34b-4ca9-942c-397ed8cc1435`.

## 2. The freshness radar (Tasker 88): what it does

After DJ brain dumps about a project in agentic chat, the radar works like this:

1. **Trigger.** A SQL trigger on `chat_turn_runs` (status → `completed`) upserts a debounced
   `freshness_radar_signals` row: 60 seconds after the last turn, at most 10 minutes after the first.
2. **Queue job.** The trigger then enqueues a `freshness_radar_scan` job.
3. **Scan.** The worker builds a small context and asks Jev (`typesafe/jev-1.13`, via
   `https://openrouter.ai/api/alpha/decisions`) three batches of typed questions:
    - is each item stale, and what change would fix it;
    - is each goal or milestone on track;
    - is any pending inbox item now obsolete.
4. **Decide.** Code applies thresholds, grounding checks and the allowlist. Every judgment is
   written to the ledger (`freshness_scans`, `freshness_flags`, `freshness_track_scores`).
5. **Surfaces** (live mode only):
    - a chat card (an injected `chat_messages` row: `message_type 'assistant_message'`,
      `metadata.kind='freshness_radar_card'`);
    - one AI Inbox bundle per project (a `project_suggestions` row, kind `freshness_update`);
    - badges and gauges in the project UI;
    - inbox auto-retire, with undo.

**Sources of truth:**

- Frozen plan: `docs/architecture/jev-freshness-radar-v1-plan.md`. The lane amendments are at the
  bottom.
- Tracker: `tasker/88-chat-workflow-ordinary-chat.md`. It holds DJ's decisions and the coordinator
  defaults he may veto.
- Code:
    - `apps/worker/src/workers/freshness-radar/**`
    - `packages/smart-llm/src/jev-client.ts`
    - `packages/shared-types/src/freshness-radar.types.ts`
    - `packages/shared-agent-ops/src/inbox-index.ts`
    - `packages/shared-agent-ops/src/proposal-context/verify-operations.ts`
    - `apps/web/src/lib/server/freshness-radar.service.ts`
    - `apps/web/src/routes/api/onto/projects/[id]/freshness/**`
    - `apps/web/src/lib/components/agent/FreshnessRadarCard.svelte`
    - `apps/web/src/lib/components/project/freshness/**`

**DJ's decisions (2026-09-18):**

- Ambitious scope.
- All three surfaces: chat card, inbox bundle, badges.
- Auto-apply when very confident.
- Inbox auto-retire, with undo.

**Coordinator defaults DJ has not vetoed:**

- Auto-apply covers tasks only: status → in_progress/blocked/done, and absolute due dates the user
  actually stated.
- Auto-apply is gated until about 20 clean live scans.
- The radar never rewrites text. "Draft in chat" pre-fills the composer instead.
- Badges are visible only to the person who did the dump.
- Only individual Project Review suggestions auto-retire.

## 3. Next steps, in priority order

### Step 1: watch the first live scans (do this now)

DJ will brain dump about a real project in chat. Within about 60–90 seconds of his last message,
a card should appear. Run these checks with
`supabase db query --linked --file <abs path>`. The repo link is **PRODUCTION**, and these queries
are read-only.

```sql
-- Signals and their jobs
select id, status, session_id, turn_count, due_at, queue_job_id, error_message, created_at
from public.freshness_radar_signals where user_id = '255735ad-a34b-4ca9-942c-397ed8cc1435'
order by created_at desc limit 10;

-- Scans: skip reasons, counts, cost, latency, errors
select id, project_id, status, skip_reason, mode, counts, jev_requests, jev_cost_usd, jev_latency_ms,
       candidates_total, candidates_evaluated, card_message_id, error_message, created_at
from public.freshness_scans where user_id = '255735ad-a34b-4ca9-942c-397ed8cc1435'
order by created_at desc limit 10;

-- What Jev judged in the latest scan
select subject_kind, subject_title, round(probability, 2) p, change_kind, round(change_kind_probability, 2) kp,
       disposition, disposition_reason, status, features->>'auto_apply_check' auto_check
from public.freshness_flags where scan_id = '<scan id>' order by probability desc;
```

**Likely failure points, and what to check:**

- **No signal created.** Check that the turn reached `status='completed'`. Check that the turn has
  a `project_id` or `mutation_reserved_at`. Check that the request text is at least 40 characters,
  and that it is not a workflow turn. Also check the Postgres logs for a `WARNING` from
  `enqueue_freshness_radar_signal_v1`, because the trigger never raises an error.
- **Signal created, but the job never runs.** Railway runs `daily-brief-worker` from the same repo
  and `worker.ts` registers `freshness_radar_scan`, but a real queue run has never been observed.
  Check `railway logs --service daily-brief-worker` (always pass `--service`: the CLI is linked to
  `libri-worker` by default).
- **Scan `skipped`.** Read `skip_reason`. Common causes:
    - no window text;
    - the chat session is not linked to the project;
    - everything was excluded because the chat already edited it.
- **Scan `failed`.** Any Jev or network failure fails closed and silently: no card is posted and
  nothing is written. The key the worker uses is `PRIVATE_OPENROUTER_API_KEY` on
  `daily-brief-worker`.
- **Card missing in the UI.** The card is delivered by the existing `chat_messages` realtime insert
  and by session hydration. Only the session that triggered the scan gets it.
- **Kill switch.** Set `FRESHNESS_RADAR_MODE=off` on `daily-brief-worker`, which redeploys it.
  Alternatively, disable DJ's `freshness_radar` flag, which takes effect immediately with no deploy.

**Report to DJ in product terms:** what he said, what Jev flagged and at what percentage, what went
on the card, and whether it matched reality.

### Step 2: open auto-apply once the ledger earns it (needs DJ's OK)

Auto-apply turns on with the `freshness_radar.auto_apply` flag. The coordinator's gate: about 20
live scans with **zero grounding violations** among candidates that would have auto-applied.

While the flag is off, such a candidate is recorded as `disposition='drafted'` with
`disposition_reason='draft_auto_apply_disabled'` and `features->>'auto_apply_check'='passed'`.

- A violation is one of these candidates that DJ marked "Not out of date"
  (`outcome_source='user_marked_not_stale'`), dismissed, or undid.
- A success is `user_approved`.

Before asking DJ, report a count, a precision figure, and one or two example flags.

### Step 3: tune thresholds with real outcomes (needs DJ's OK)

`pnpm --filter @buildos/worker backtest:freshness` replays past chats read-only through the same
scanner stages and reports AUROC, a reliability chart, top-3 precision, would-auto-apply precision
(target ≥ 0.95), and retire precision.

- It needs the triple opt-in: `FRESHNESS_BACKTEST_DJ_OK=yes`, `--confirm DJ-OK:<date>`, and
  `--execute`.
- It reads production data. **DJ declined it on 2026-09-18.** Do not run it without a new, explicit
  OK.
- The live ledger alone can produce the same calibration with `--ledger`.

### Step 4: check the side effect of the inbox approval change

The push hardened `verify-operations`. A pending Project Review suggestion that carries an edit the
user can't see is now quarantined instead of approved (intended). Count what that did after the
deploy: `project_suggestions`/`inbox_items` rows with quarantine reasons created since
2026-09-19 01:22 UTC. Tell DJ if anything he cared about disappeared.

### Step 5: Tasker 89, the final acceptance run (needs DJ's OK and a QA slot)

DJ waived the full gate after each change set on 2026-09-18. **One** full gate plus live acceptance
runs here. See `tasker/89-chat-workflow-integration-acceptance.md`. Still owed:

- `pnpm agentic:gate` on the isolated QA database. The latest real results were 46/52 (09-15) and
  an invalid 40/52 (a second gate shared the QA database). **There is no lock on the QA
  database:** before running, check `ps` and `ls -lt output/agentic-gate` for another gate.
- A 87 restart with the real OpenRouter and a real Railway process kill. Restart has only been
  proven locally, against a stub provider.
- Recheck DeepSeek V4 Flash prices in `packages/smart-llm/src/model-config.ts`, recorded 07-17.
  The cache-read rate is the contract ceiling.
- Add a gate case where a radar card is already in the chat history, to confirm the chat assistant
  handles it sensibly.
- The live radar browser journey: dump → card → Update these → Undo → badge → inbox.

### Step 6: open correctness debts (do not start without DJ's go-ahead)

- **Case 14 overclaim** (`tasker/82`). The chat says things like "no evidence physical work has
  begun" that the records don't support. It recurred three times (09-14, 09-15, 09-18); the 09-18
  run was on the Pareto trial model. Unproven on the default model.
- **Suspected ordinary-turn stall defect** (`tasker/80` WP-3). A worker that dies right after a text
  batch may leave the turn `running` forever. This was fixed for workflow turns in `7702ca006`, and
  the same shape is suspected for ordinary turns. Reproduce it on real SQL first.
- **Calendar Case 10.** DJ deferred it; do not work on it until he resumes it.
- **The displaced "Review project" entry** (the original Tasker 88 scope). The radar card's future
  "Review deeper" action needs it. The 86/87 path is complete behind its switches. Activation order
  is the worker preparation switch, then execution, then the web admission switch, plus the cohort
  list `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS`.

## 4. Rules and landmines

- **Work directly on `main` in `/Users/djwayne/buildos-platform`.** DJ forbids worktrees and side
  branches.
- **Other sessions edit this same checkout,** including Codex and the Jev tool-selector work
  (`provider/jev-tool-selector.ts`, `catalog/surfaces.ts`, `agenticChatWorkerSurfaceBudget.test.ts`).
    - Commit only your own files: `git add -- <paths>` then `git commit -m ... -- <paths>`.
    - Check `git diff --cached --name-only` first.
    - Never `git add -A`, `commit -a`, `stash`, `reset`, or check out over someone else's files.
    - Commit only when DJ asks. **Do not push**; DJ pushes.
- **`supabase db query --linked` is PRODUCTION** (ref `iwifjt…`). QA (`daudvq…`) is reached only
  through `--workdir <scratch>` with a QA `project-ref`.
- **Applying a migration to prod:**
    - Never run a blanket `supabase db push`, because the ledger has drifted.
    - Apply one file at a time, wrapped in `BEGIN`/`COMMIT`, with `supabase db query --linked --file`.
    - Then run `supabase migration repair --status applied <version> --linked`.
    - Run a read-only precheck and a postcheck.
    - Every production write needs DJ's explicit OK.
- **Validation.** Use narrow `pnpm --filter <pkg> exec vitest run <files>` through the machine-wide
  `test-gate` (at most 2 heavy runs at once). Never run root `test:run`, `verify` or `pre-push`, and
  never pass worker or pool flags.
    - The radar's Postgres end-to-end test needs the sandbox disabled.
    - Worker typecheck needs `pnpm --filter @buildos/shared-types build` first.
- **Milestone dates.** The web milestone route parses a bare `YYYY-MM-DD` as UTC midnight, which
  shows as the previous day in the US. Radar milestone drafts send local midnight (`zonedMidnightIso`).
  Task and goal drafts keep civil dates.
- **Jev confidence is not accuracy.** Choice `confidence` measures how concentrated the
  distribution is. Use the per-option probabilities, and treat every percentage as uncalibrated
  until the ledger has about 50 labelled outcomes.
- **Chat edits never trigger Project Review.** Gateway writes don't call the loop's burst or
  review-signal paths. The radar is currently the only freshness path for chat work.
- **Model spend.** OpenRouter spend shares one key with production. Never use GPT-6 Astra. The
  prevention steps from the 09-13 spend incident are still not applied.

## 5. How DJ works

- **Vision-first.** Talk in product and outcome terms. Make technical decisions yourself. Surface
  only the choices that change user experience or cost money, in one or two sentences each, framed
  so he can veto them.
- **Interview first** on nontrivial builds: ask one open question, then only the questions that
  narrow real options.
- **Pitch lean and ambitious** versions of anything with real design space, and let him pick.
- **Ask before anything outward-facing:** production writes, deploys, environment changes, or
  running jobs on real data.
- He can read screenshots of UI work more easily than a description, so capture them.

## 6. What changed on 2026-09-18 (for reference)

- **Housekeeping:**
    - `bd356380b`: the three prod-applied workflow migrations, SQL tests and contract.
    - `e1d14e942`: trackers.
- **86/87 merged:** `a8521ae14`.
- **87 finished:**
    - `2b35755aa`: stall → best durable answer.
    - `49a5de7b2`: priced V4 Flash fallback.
    - `7702ca006`: crash cuts, plus the stuck-stall fix.
    - `b90e573bf`: real restart proof.
- **Radar:**
    - Plan: `c2acac6c2`.
    - Lane A (`fc8c1edcc`…`3b5ed1955`): schema, `JevClient`, verify-ops, inbox helpers.
    - Lane B (`b6d1642f8`…`1e12e8de2`): scanner and backtest.
    - Lane C (`1e1a19f26`…`359f152ab`): card, badges, routes.
    - Integration fix: `fd8b76f4d`.
    - Tracker: `262e86bfc`.
- **Test evidence on merged `main`:**
    - radar and inbox worker suites: 126/126, including a real disposable-Postgres end-to-end scan;
    - web freshness, chat session and decide suites: 116/116;
    - SQL contracts: 52/52;
    - worker typecheck clean.

## September 20 continuation — published specialists connected to Workflow Lab

After DJ reported Tasker 91 complete, implemented explicit published-version selection in Workflow
Lab and the composer. Admission verifies owner/version/hash, pins the full catalog snapshot and
reference knowledge into the run, and uses a distinct v3 executable snapshot rejected by old workers.
The worker applies custom instructions and knowledge only to the selected specialist, enforces its
optional document-read capability, and retains the existing reviewer/editor and spend limits.
Changed versions and built-in/custom swaps conflict on retry; recovery uses the original run copy.
Jev stays shadow-only for built-ins and is skipped for explicit custom selections.

Tasker 91 Logs/Trace/Export remain connected to the actual session and include the raw pinned version.
New default-off flag on both services: `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED`.
Local migration: `20260921002731_agentic_chat_published_specialist_execution_v1.sql`; it requires the
previous evidence-handoff migration (still pending production) and the already-applied workbench
migration. No production flags, migrations or deployments were changed in this turn.

Validation: 191 focused free tests passed; runtime build, worker typecheck, and web Svelte check
(zero errors/warnings) passed.

See [implementation, validation and rollout](../../architecture/PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md).
The full Agentic Chat gate and paid research remain deferred by DJ. Next: deploy/enable this bounded
selection path, inspect a small real custom-specialist run, then curate the eligible roster for Jev.

## September 20 — specialist migrations applied to production

On DJ's request, applied `20260920154843_agentic_chat_document_evidence_handoff_v1.sql` and
`20260921002731_agentic_chat_published_specialist_execution_v1.sql` together on `build_os`
(`iwifjtlebphefldmwbkh`). Each exact source and original ledger ID committed in the same transaction.
The workbench migration was already installed and was not reapplied. No unrelated migrations ran.

Verified at September 21 01:02 UTC: both ledger/source hashes match, all 23 final function bodies
match, service-only execution and fixed search paths remain correct, all changed constraints validate,
both new triggers are enabled, and profile 2/3 plan selection and reviewer dependencies are correct.
Relevant table RLS remains enabled; no security-advisor warnings concern changed objects.

App deployment and feature activation are still pending: deploy worker/runtime then web, enable
`AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED` on worker before web. No flag or deployment was changed
while applying these migrations. Paid inference and the full QA gate remain deferred.
See [rollout and verification](../../architecture/PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md).
