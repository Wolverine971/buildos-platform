<!-- apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md -->

# Deep Research V0.1 — Implementation & Plan Audit

**Date:** 2026-07-20
**Scope:** `DEEP_RESEARCH_ARCHITECTURE_2026-07-19.md`, tasker/29–33, and the implementation
committed across `d78acab2..7444fdc3` (~21k lines: 5 migrations, orchestrator, cost ledger,
reconciler, web dispatch, safe-fetch, tests).
**Method:** four parallel adversarial code reviews (migrations/DB, orchestrator state machine,
cost ledger + smart-llm spend path, web dispatch + SSRF), a full test-suite verification run, and
live production probes of the RPC privilege surface. The migrations reviewer stood up a scratch
PostgreSQL 16, applied the real migrations, and reproduced every `[verified]` finding live.

## Remediation status (updated 2026-07-20, same day)

Fix waves executed after this audit:

- **Deployed to production** — `20260720010000_deep_research_hardening.sql`: revokes
  `queue_deep_research_synthesis` from anon/authenticated (blocker 2, re-probed live → 42501);
  fails the synthesis stage-guard closed + writes the checkpoint (blocker 5); rounds ledger
  idempotency comparisons to column scale (blocker 6); preserves recorded overrun actuals; FK
  `ON DELETE RESTRICT` (blocker 9); removes both reproduced lock-order deadlocks (blocker 11).
  Also confirmed live that `20260719050000` **was already deployed** (correcting the docs).
- **Worker liveness one-liners** — empty `orchestration_state` on a running coordinator is treated
  as `planning` (un-strands the pre-checkpoint crash); `finalize()` throws on a failed terminal
  update so the job retries instead of stranding.
- **Cost bridge (Wave 1)** — `usage: {include: true}` on OpenRouter requests; 200-with-missing-usage
  on a budgeted call settles `reconciliation_required` not `$0`; settled Tavily charges write
  `llm_usage_logs` (`agent_run_web_search`). (Corrects strategic finding 3.)
- **Web security (Wave 3)** — API budget clamps + default standard-run cost ceiling (blocker 8);
  synthesis-prompt untrusted-evidence fencing; transcript cap 10k→12.5k. DNS-rebind pinning
  (blocker 3), canonical-URL cache keying (blocker 4), and the quadratic HTML-strip fix are in the
  same wave.
- **Liveness sweep (Wave 4)** — a scheduled stranded-run reconciler (blocker 1 P0) plus retry
  attempt-key ordinals so a job retry no longer self-kills.
- **CI** — the 24-case disposable-Postgres integration suite is now wired into `ci.yml` (blocker 10),
  with fixture fidelity fixes (Supabase default-privilege tripwire, prod dedup semantics, prod FK).

Still open: the live provider smoke (worker Tavily credential + Railway-vs-local claim race) and the
fan-out-vs-single bake-off. Strategic items (per-user daily quota before the chat tool, report
persistence) remain sequenced as below.

## Verdict

The architecture direction is right and the engineering quality is genuinely high — but the
release-blocker list in the docs is wrong in both directions. The documented blocker (RPC
privilege hardening) is **already deployed and verified closed**, while the real blockers are
undocumented: a stranded-run liveness cluster that can permanently lock a user out of all agent
runs, one SECURITY DEFINER function the hardening migration missed (verified anon-callable in
production), a DNS-rebinding SSRF bypass, and a cross-user web-visit cache-poisoning vector.

Strategically, the effort is inverted: ~21k lines of control/cost plane, zero evidence yet that
the research output is good. The plan's own open question — whether 2 fan-out children beat a
single deep run at a $0.50 budget — should be answered *before* more orchestration hardening.

## Verified state (live probes + test runs, 2026-07-20)

- **All suites green:** worker unit 83/83 (9 files), disposable-Postgres integration 17/17,
  smart-llm 62/62, web dispatch budget 4/4, shared-types validation 5/5, worker typecheck clean.
  The doc's "44 worker tests" figure is stale (suite grew).
- **`20260719050000_agent_run_cost_rpc_privileges.sql` IS deployed to production**, contrary to
  the architecture doc and tasker/29+31. Anon probes: `reserve_agent_run_cost` → 42501,
  `claim_agent_run_cost_reconciliation` → 42501, `agent_run_cost_entries` read → 42501.
  Service role: claim RPC reaches validation, table read 200. Docs must be corrected; the
  "deploy migration 5" blocker is done.
- **`queue_deep_research_synthesis(p_parent_run_id)` is anon-callable in production** (HTTP 200
  with an anon key). The 050000 migration revokes the five cost RPCs but omits this function
  (`20260719020000:354-355` only revokes PUBLIC). Verified live. See P1-DB-1.

---

## Blockers before any rollout (ranked)

### 1. Stranded-run liveness cluster — P0 (orchestrator)

Worker death mid-child (deploy, OOM; graceful drain is only 25s vs 5-min child runtime) leaves
the child `running` forever: `isClaimableStatus` (`agentRunWorker.ts:153-171`) never re-claims a
`running` child, and the stall-reclaimed redelivery returns `status:'skipped'` **completing the
queue job permanently** (`agentRunWorker.ts:686-694`). The synthesis trigger then never fires,
the root stays `running` at `researching`, and the capacity trigger
(`20260719020000:183-258`) **rejects every future agent run for that user**. User cancel cannot
rescue it — cancel only inserts a signal, and signals are only drained by claimed jobs. Only
operator SQL recovers. Related stranding paths:

- Crash between coordinator claim and first checkpoint: `orchestration_state={}` parses to null
  → redelivery skips → stranded root (`agentRunWorker.ts:696-706`,
  `deepResearchOrchestrator.ts:195-217`). One-line fix: treat empty state on a running
  coordinator as `planning`.
- `finalize()` never checks the terminal-status update error (`agentRunWorker.ts:986-996`) — a
  transient DB error leaves the run `running` while the job completes.
- Child/synthesis queue job exhausting `max_attempts` (3) with the run row still `running`.

**Fix:** the tasker/31 WP-3 stranded-run reconciliation sweep must be pulled forward to *before*
rollout, not after. It also subsumes the two app-level `queueParent` backstops (one of which can
kill a healthy run — see P2 list) and simplifies the wake-path story from three mechanisms to
two.

### 2. `queue_deep_research_synthesis` privilege gap — P1, verified live (DB)

Any anon/authenticated PostgREST caller can invoke this SECURITY DEFINER function against
arbitrary run UUIDs. Internal guards bound the damage (requires running deep-research root,
stage `researching`, two settled children), but it takes `FOR UPDATE` locks on other users' rows
and can insert `queue_jobs` — and it compounds with the fail-open stage guard (blocker 5).
One-line follow-up migration. Also verified: `CREATE OR REPLACE` does *not* re-grant, so the
050000 revokes are durable for the functions it covers.

### 3. DNS-rebinding TOCTOU in shared `safe-fetch` — P1 (web/worker)

`packages/shared-agent-ops/src/web/safe-fetch.ts:182-188` resolves + vets the hostname, then
`:263` calls `fetch()` which does its **own second DNS resolution**. A TTL≈0 attacker domain
answers public for the check and `127.0.0.1`/`10.x` for the fetch — bypassing every IP check,
per redirect hop. Research children visit attacker-influenceable URLs by design; the worker's
localhost Express API and Railway-private services are reachable. Fix: pin the connection to
the vetted address (undici `Agent` with custom `connect.lookup`). The IP blocklists themselves
are excellent (hex/dotted v4-mapped v6, CGNAT, ULA, fail-closed parsing — experimentally
verified), which makes this the one hole in an otherwise strong fence. `safe-fetch.test.ts` has
only 3 tests; add rebinding/redirect-hop coverage.

### 4. Cross-user web-visit cache poisoning via `<link rel=canonical>` — P1 (web)

`external-executor.ts:467-468` persists visits keyed by the **page's own** canonical URL with no
same-origin check (`webvisit/parser.ts:383-393`); `web_page_visits` is a global cache with no
`user_id`. Any user (or injected model) visiting `evil.com/x` that declares
`<link rel="canonical" href="https://www.nytimes.com/article">` poisons that URL for **every**
user's later `web_visit`. Fix: honor canonical only on the same registrable domain as
`final_url`, or key strictly by `final_url`.

### 5. Fail-open synthesis guard + unrepairable stage — P1, verified (DB)

`20260719020000:285`: with `stage` absent from `orchestration_state`, the NULL comparison makes
the early-return *not* fire (three-valued logic inverts fail-closed to fail-open), and
`jsonb_set(..., create_missing => FALSE)` at :318-324 silently never writes the checkpoint.
Reproduced: a root with `{}` state + two settled children enqueues synthesis on every wake;
production `add_queue_job` dedup only spans `pending`/`processing`, so once the first synthesis
job completes, the next wake enqueues **another**. Fix: `IS DISTINCT FROM` semantics +
`create_missing => TRUE`, and add stage shape to the root CHECK.

### 6. Ledger idempotency broken by NUMERIC rounding — P1, independently found twice, verified (DB + cost)

`20260719030000:222` compares the 8-dp-rounded stored `reserved_cost_usd` against the unrounded
retry parameter; token-level pricing routinely carries >8-dp float noise, so a byte-identical
retried reservation raises `AGENT_RUN_COST_IDEMPOTENCY_CONFLICT` instead of returning
`idempotent: TRUE`. Same class in settle (:401-419) and reconcile replay. Fail-closed, but the
"duplicate equal calls OK" guarantee is false. Fix: round parameters to column scale before
comparing.

### 7. Same-job retry kills the run instead of adopting prior exposure — P1 (cost + orchestrator)

Every reservation passes `requireNewAttempt: true`; queue retries reuse the same `job.id` →
same attempt key → `duplicate_attempt` → planning rethrows → `finalize('failed')`
(`agentRunWorker.ts:1206,1223-1231`, `deepResearchOrchestrator.ts:803`). The doc's "retry
inspects existing exposure instead of paying for a duplicate" is **not implemented** — retry is
simply refused, the run dies, and the orphan reservation becomes permanent operator-needed
exposure. Synthesis-stage crash degrades to `partial` (paid synthesis output discarded). Fix:
an adoption path (`requireNewAttempt: false` + treat settled/reserved prior attempt as already
paid) — which also requires blocker 6's rounding fix.

### 8. Unbounded budgets for standard-effort runs via `POST /api/agent-runs` — P1 (web)

`normalizeAgentRunBudgets` (`dispatch.ts:82-104`) caps only `max_cost_usd`; `wall_clock_ms`,
`max_tool_calls`, `max_tokens` accept any finite value, and standard effort gets no defaults.
With `max_cost_usd` omitted there is **no LLM spend ceiling at all** (`agentRunCostPolicy.ts:16-17`
returns undefined → `accounting = null` → unreserved, price-uncapped LLM calls — also noted as
P2-5 in the cost review). An authenticated user can POST `max_tool_calls: 1e6, wall_clock_ms:
10 days`. The chat path is tighter than the raw API path. Fix: clamp all four fields
server-side and require/derive a cost budget for every run.

### 9. Run deletion cascades away the money ledger — P1 (DB)

Ledger FKs are `ON DELETE CASCADE` (`20260719030000:11-12`) and the direct-write guard doesn't
cover DELETE. Production `agent_runs.parent_run_id` is `ON DELETE SET NULL`, so deleting a root
orphans children, erases the tree's cost entries, and a subsequent reserve makes each orphan
**its own root with a fresh budget**. The integration test codifies the cascade as desired.
Fix: `ON DELETE RESTRICT` + block deletion with unresolved entries.

### 10. Integration suite never runs in CI — P1 (DB)

`vitest.config.ts` excludes `tests/integration/**`; `test:deep-research:integration` is wired
into neither turbo nor `.github/workflows/ci.yml`. The DB guarantees are only verified when
someone remembers to run the script. Graceful skip on missing `initdb` already exists — wiring
is cheap. Also fix fixture fidelity: no `ALTER DEFAULT PRIVILEGES` in the fixture means the
privileges test passes **without 050000 applied** (it cannot detect the exact production failure
mode it exists for — which is how blocker 2 was missed); the fixture's global-unique dedup key
masks the double-enqueue in blocker 5; the fixture FK differs from production's `SET NULL`.

### 11. Lock-order deadlocks — P1/P2, verified (DB)

`reserve_agent_run_cost` locks root→leaf; the child-settle wake trigger locks child→root.
Deadlock reproduced live (40P01) — triggered by a cancel/reaper settling a child while that
child's worker is mid-reserve. Note the wake trigger fires for **every** parented run, not just
deep research. Second inversion: capacity trigger (row lock → advisory lock) vs child insert
(advisory → row). Both fail closed but will surface as flaky cancels/reserves. Fix: cheap
non-locking template pre-check in the wake trigger; hoist the capacity early-return above the
advisory lock.

---

## Notable P2s (fix soon, not blocking)

- **Settle can wipe recorded overrun actuals** (`030000:386-430`): a later NULL-actual
  `reconciliation_required` settle overwrites a recorded 0.03 actual with NULL → exposure
  shrinks below already-spent money. `COALESCE`-protect actuals. *(verified)*
- **200-with-missing-usage settles at $0** (`smart-llm-service.ts:838-855`) — the one silent
  release hole; should become `reconciliation_required`.
- **`usage: {include: true}` is never sent to OpenRouter**, so the `provider_reported` settle
  path is dead in production and everything settles as catalog estimate. Adding it makes
  settlement authoritative and shrinks reconciler traffic. Cheap win.
- **`X-Generation-Id` header capture unverified against live API** — if OpenRouter doesn't send
  it, lost-body rows silently degrade to operator-needed instead of auto-reconciling. Needs the
  live smoke.
- **Quadratic HTML-strip regexes** (`webResearchPort.ts:361-370`, `webvisit/parser.ts:69-70`):
  35s measured synchronous CPU on a 2.2MB adversarial page — stalls the worker's job loop
  (wall-clock budget can't preempt synchronous work). Let `sanitize-html` do the stripping.
- **Synthesis prompt lacks untrusted-evidence delimiting** (flagged independently by two
  reviewers): child packets splice raw into the synthesis user prompt
  (`deepResearchOrchestrator.ts:937-947`); the child layer's injection hardening is good, the
  reduce step is the unguarded hop.
- **Stalled reclaim can double-execute a live coordinator** (no heartbeat during processing;
  5-min `reset_stalled_jobs` vs 120s LLM timeout makes it low-probability, high-impact): second
  planner is paid, loser hits the two-child DB cap → `finalize('failed')` clobbers a healthy run.
  A processing heartbeat or lease token fixes it.
- **Unguarded redundant `queueParent` backstop can kill a healthy run**
  (`deepResearchOrchestrator.ts:869` unwrapped vs the correctly wrapped child-side backstop).
  Wrap or delete (the reconciliation sweep makes it deletable).
- **Thrown dispatch errors treated as permanent** — the retry-safe `dispatching` checkpoint is
  only exercised on process death, never on exceptions (`agentRunWorker.ts:1233-1242`).
- **Deep-research template flip bypasses the two-child cap** (verified: an `agent` root with 3
  children flipped to `deep_research` successfully). Forbid the transition.
- **Reconciled overruns can exceed root `max_cost_usd` with no run-level flag** — surface
  `SUM(exposure) > max_cost_usd` in the operator report.
- **`delegateTask` duplicates `dispatchAgentRun`** and has already drifted (clamp-vs-error on
  tool calls, $1-vs-$10 standard cap, token/wall-clock defaults). Consolidate on
  `dispatchAgentRun`.
- **Worker transcript cap (10k) truncates max-size web visits (12k)** — a max visit always
  loses its tail before the model sees it.
- **Cancel observed only at coordinator entry** — a cancel during planning still dispatches and
  spends child budget; during synthesis it finalizes `completed`.
- Moonshot-direct routing bypasses `max_price`; three-active-run cap has a count-then-insert
  race for non-deep runs; chat-side Tavily spend is unmetered; no port allowlist beyond
  undici's defaults; `claim` batch slots consumed by exhausted NULL-token rows.

## What is genuinely solid (verified, not assumed)

- Reserve-before-fetch is structural and honestly tested at both seams; no path dispatches
  before a committed reservation; no dispatch path ever releases a possibly-billed reservation.
- Root-first lock ordering makes tree exposure sums race-safe; the two headline race claims
  (concurrent two-child cap, concurrent over-budget reservations) hold under real parallel
  psql sessions.
- Idempotent fan-out with stable checkpointed child IDs; transactional exactly-once synthesis
  wakeup on the normal path incl. the fast-child race; parent-cancel signal-consumption race
  closed (`agentRunPolicy.ts:24-34`).
- Child fencing is three-layered (catalog, per-call allowlist, DB shape trigger); no delegation
  op exists in the child op surface at all.
- Budget math conservative in the right direction everywhere (floors, 35% synthesis reserve,
  `GREATEST(reserved, actual)` exposure, Tavily floor price un-lowerable via env).
- SSRF blocklists comprehensive and fail-closed (modulo the rebinding TOCTOU); safe-fetch
  consolidation across web/worker is real (url-client is now a 16-line wrapper).
- Lease machinery complete: SKIP LOCKED claims, token fencing under row lock, completed-token
  replay, attempts-at-claim bounding, crashed-final-lease operator routing.
- API authz correct: cross-user project runs blocked at membership RPC on both paths; agent_runs
  RLS is SELECT-only for users; $100 budget rejected.
- Documentation honesty and tasker hygiene are far above baseline.

## Strategic findings (plan level)

1. **Answer the fan-out-vs-single-run question now, not in Slice D.** The sequential baseline
   (one deep-effort run, ~12 tool calls — Slice A already ships it) may match 2×5-call children
   at $0.50, in which case V1 UX can ride the simpler, already-working path while fan-out waits
   for bigger budgets. Ten fixed questions run both ways ≈ $10. This reorders tasker/33 WP-4
   ahead of further orchestration hardening and is the cheapest way to de-risk the whole plan.
2. **Quality is now the critical path.** Everything built so far is control plane. Tasker/30
   (evidence contracts, report persistence) is the highest product-value open item: a $0.50,
   10-minute run currently produces one ephemeral chat message.
3. **Two disconnected cost-accounting systems.** Worker research spend never reaches
   `llm_usage_logs` (only the web OpenRouter service writes there), so admin LLM analytics and
   any future user-facing consumption accounting are blind to research spend. Decide the bridge
   (ledger as source of truth + admin view) before GA.
4. **Ordering constraint:** per-user daily quota (29 WP-3) must land before the dedicated chat
   tool (32 WP-1) broadens access — otherwise a user can chain $1 runs all day.
5. **No staging environment exists** — the plan says "staging" throughout, but every probe and
   deploy targets production. Either create a staging Supabase project or codify the
   capped-production-smoke procedure explicitly.
6. **Docs are stale on deployment state** (migration 5 deployed; "44 tests" now 83;
   `database.types.ts` still blocked on `SUPABASE_ACCESS_TOKEN`). Update
   `DEEP_RESEARCH_ARCHITECTURE_2026-07-19.md` and tasker/29+31, and swap the release-blocker
   list to the items above.
7. **Simplifications endorsed by reviewers:** one reconciliation sweep replaces the two
   app-level wake backstops; collapse `synthesis_queued`/`synthesizing`; consolidate the two
   HTML→text pipelines into shared-agent-ops; `delegateTask` → `dispatchAgentRun`. The cost
   ledger itself earns its keep (provider-side caps cannot give atomic per-tree budgets); freeze
   its scope — do not build Moonshot/Tavily lookup paths now, conservative retention is fine.

## Suggested order of operations

1. Follow-up migration: revoke `queue_deep_research_synthesis` (blocker 2) + stage-guard NULL
   fix (5) + rounding (6) + `COALESCE` actuals (P2) + FK RESTRICT (9) + wake-trigger pre-check
   (11). One migration, all verified defects, mostly one-liners.
2. Liveness: stranded-run sweep + `finalize()` error check + empty-state-as-planning (1).
3. Web fixes: DNS-rebind pinning (3), canonical-URL cache keying (4), API budget clamps (8),
   regex strip → sanitize-html (P2).
4. CI: wire the integration suite + fixture fidelity (10); attempt-adoption path (7).
5. Then the smoke (tasker/31 WP-2, needs worker Tavily credential) and the fan-out-vs-single
   bake-off (tasker/33 WP-4 slice) before building 30/32 UX on top.
