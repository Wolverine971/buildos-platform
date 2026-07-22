<!-- apps/web/docs/technical/architecture/agent-work/DEEP_RESEARCH_BAKEOFF_RUNBOOK.md -->

# Deep Research Bake-off / Live Smoke — Runbook

**Purpose:** run a small, real-money, capped deep-research bake-off (fan-out vs. single deep run)
against production Supabase to (a) compare research quality/cost and (b) satisfy the tasker/31 WP-2
live smoke (one `reserved → settled` ledger lifecycle per paid call). First run: 2026-07-20, results
in [`../../../audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md`](../../../audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md)
("Live $2 bake-off"). This runbook exists so the next run is reproducible.

## Why the setup is the way it is

- The **production Railway worker polls the same `agent_run` queue** with no feature flag, so it would
  race a local worker for the test jobs — and it may lag the local code and lack a Tavily key. So it
  must be **paused** for a clean run.
- A local worker pointed at prod Supabase would otherwise process **all** job types (real users'
  briefs/SMS/notifications) and run the scheduler. So we use a **scoped worker** that registers only
  `agent_run` and starts no scheduler/cleanup: `apps/worker/src/scripts/bakeoffAgentRunWorker.ts`
  (`claim_pending_jobs` only claims registered job types, so real jobs are never touched — they queue
  until Railway resumes).

## Prerequisites

1. **Pause the Railway worker** (`daily-brief-worker-production`) — scale to 0 / stop in the Railway
   dashboard. Real brief/SMS/notification jobs will queue and resume when you turn it back on. - **Gotcha:** a paused Railway service returns an **edge-404** (`{"code":404,"message":"Application
not found"}` from `server: railway-hikari`, `x-railway-fallback: true`), NOT a connection
   refusal. Detect "paused" by that 404 body, not by a dropped connection. - Confirm paused: `curl -s https://daily-brief-worker-production.up.railway.app/health` → the
   `Application not found` 404.
2. **Tavily key in the worker env:** `apps/worker/.env` needs `PRIVATE_TAVILY_API_KEY` (copy from
   `apps/web/.env`). Without it, child researchers can `visit` but not `search`.
3. **Test user:** `AGENTIC_TEST_USER_EMAIL` / `AGENTIC_TEST_USER_PASSWORD` in `apps/web/.env` (the
   agentic-e2e harness user). Must not be billing-frozen (a 402 on login = frozen).

## Run it

```bash
# 1. Local web (serves the dispatch API; no queue polling)
pnpm --filter @buildos/web dev            # http://localhost:5173

# 2. Scoped agent_run-only worker (no scheduler, no other job types)
pnpm --filter @buildos/worker exec tsx src/scripts/bakeoffAgentRunWorker.ts

# 3. Driver — ONE run per invocation, strictly sequential (deep_research reserves
#    all 3 agent-run slots, so runs cannot overlap). Waits for terminal + captures.
node apps/worker/scripts/deep-research-bakeoff.mjs q1-fanout
node apps/worker/scripts/deep-research-bakeoff.mjs q1-single
node apps/worker/scripts/deep-research-bakeoff.mjs q2-fanout
node apps/worker/scripts/deep-research-bakeoff.mjs q2-single
node apps/worker/scripts/deep-research-bakeoff.mjs status     # session ledger spend
node apps/worker/scripts/deep-research-bakeoff.mjs unbrick    # cancel any stranded test-user runs
```

Before dispatch, verify there is **no** full worker (`tsx watch src/index.ts`) and exactly one
`bakeoffAgentRunWorker.ts` process. Do not use the repo-wide `pnpm dev`: it starts the normal worker
alongside the web app, which races the scoped worker and can claim unrelated production job types.

- **Hard $2 cap:** the driver sums the session's ledger exposure before each dispatch and refuses to
  start a run whose `$0.50` ceiling would cross `$2.00`. (Actual first-run spend was ~`$0.015–0.077`,
  so 4 runs ≈ `$0.23`.)
- Results are written under `BAKEOFF_OUT` (default `tmp/bakeoff-results/`, gitignored): a full
  `<runKey>.json` capture (run row, children, events, ledger) and a `<runKey>-report.md`.
- Modes: `*-fanout` = `{run_template:'deep_research'}`; `*-single` = `{effort:'deep',
budgets:{max_tool_calls:12}}`.

## Teardown (important)

- **Stop the scoped worker** BEFORE re-enabling Railway (`pkill -f bakeoffAgentRunWorker`), so two
  workers don't both claim `agent_run` jobs.
- **Re-enable the Railway worker** in the dashboard.
- Stop local web (`pkill -f 'vite.*dev'` / free port 5173).

## Gotchas (learned the hard way)

- Auth cookie is `sb-<projectref>-auth-token`, not `auth-token` — the driver's `includes('auth-token')`
  substring check still passes.
- Login endpoint is `/api/auth/login` (JSON). `/auth/login` is a page form action and 415s on JSON.
- In inline `node -e` scripts, don't name a `const URL` — it shadows the global `URL` constructor and
  breaks `fetch`.
- Results land in `tmp/bakeoff-results/`, not next to the script.
- `pnpm dev` at the repository root starts the full Turbo stack, including the normal worker. Use
  `pnpm --filter @buildos/web dev` exactly, then process-audit before spending.

## What the 2026-07-22 rerun verified

The second four-case capped batch confirmed the first fix wave only partially:

1. **`max_price` headroom and paid-attempt ledger wiring worked.** `spend-guard.ts` now sets `max_price` to
   `catalog_rate × safetyMultiplier` (2.0) — verify with
   `node apps/worker/scripts/openrouter-maxprice-probe.mjs` (mult=1 → 404, ≥1.25 → 200). The batch
   produced 35 paid-attempt rows; 34 settled and one definitive pre-generation route 404 was left
   `reconciliation_required` by the then-current code.
2. **Ledger rows appeared for roots, children, and paid searches.** Known actual spend was
   `$0.17764437`; conservative exposure including the unresolved `$0.04` reservation was
   `$0.21764436`, well under the `$2` session guard.
3. **Failures are loud:** if a stage still fails, `run.narration` carries a categorized `reason`
   (`reservation_infeasible` / `provider_price_rejected` / `model_error`).
4. **The architecture question remains unanswered.** Both fan-out runs went partial after their
   children hit the 20,000-token target before submitting evidence packets. The single runs failed
   on a ZDR/no-endpoint 404 and a `200 + null content`; these are provider/runtime failures, not a
   quality comparison.

The same run also caught two liveness/integrity defects: a slow call crossed the 120-second stalled
threshold and was reclaimed while its original worker still ran, and one successful web visit could
not be persisted as JSON telemetry. The exact invalid scalar was not retained, so do not overstate
the telemetry root cause.

## What to verify on the NEXT run (local fixes landed 2026-07-22)

1. Each fan-out child treats 20,000 observed tokens as a target and submits a validated packet before
   its 22,000 hard ceiling. A small overrun is acceptable; a large overrun is not.
2. Token-headroom finalization uses compact, durably recorded observations and emits
   `finalizing before token hard ceiling`; no child performs another tool call after that point.
3. A ZDR/no-endpoint 404 releases its first reservation and makes at most one separately reserved
   fallback attempt. A wrapped `200 + null content` failure takes the same bounded fallback path.
4. Successful tool telemetry containing PostgreSQL/JSON-hostile scalar values persists in sanitized
   form; only durably recorded visit output may enter evidence provenance.
5. The processing-token-fenced queue heartbeat keeps slow live jobs fresh, so the stalled-job sweep
   does not reclaim them and no duplicate paid attempt is made.
6. Every paid attempt is terminal. Definitive pre-generation rejection is `released`; ambiguous
   timeout/lost-response exposure remains `reconciliation_required`.
7. Only after both modes produce auditable reports should the run be scored as a fan-out-vs-single
   architecture comparison.

## Third capped remediation smoke (2026-07-22)

The third session found and removed an accidental second local consumer (the repo-wide Turbo dev
worker), preserved its hybrid artifacts separately, and then ran a clean four-case batch with one
web-only server and one scoped worker. Clean-batch exposure was `$0.267794599`; all **55** paid rows
were terminal (**50 settled, 5 released, 0 unresolved**). The full diagnostic session, including
preserved retries and accepted-timeout exposure, remained at `$1.0041` under the `$2` guard.

| Run        | Result    |           Cost | Tokens | Tools | Quality outcome                                                  |
| ---------- | --------- | -------------: | -----: | ----: | ---------------------------------------------------------------- |
| Q1 fan-out | partial   | `$0.073876935` | 35,924 |     8 | child packets existed, but synthesis returned `...`              |
| Q1 single  | completed | `$0.060169079` | 52,976 |     5 | polished report cited several search candidates never visited    |
| Q2 fan-out | partial   | `$0.071425954` | 39,912 |     8 | cautious sourced report, but packet coverage remained incomplete |
| Q2 single  | completed | `$0.062322631` | 54,560 |     6 | falsely concluded that OpenRouter `max_price` does not exist     |

Operationally, the remediation passed: children stayed below the 20k target/22k ceiling, direct
deep runs stayed below 62.5k, long calls were not stall-reclaimed, pre-generation 404s were released,
and the formerly hanging OpenRouter limits redirect completed. Quality did **not** pass. A local
post-smoke gate now rejects non-substantive synthesis and falls back to typed evidence packets;
direct single runs still need the same visited-source/citation contract before they are eligible to
win a quality bake-off.

Next evaluation should use a versioned corpus and deterministic scoring, pin the evaluated model
route, validate direct-run citations against durable visits, and require topic-coverage checks (the
Q2 cases missed the known `max_price` routing control). Do not spend on another ad-hoc four-run
batch first.

## Operational check that is NOT in this repo

Confirm the **Railway worker image is ≥ the commit that added the reservation wiring** (`7444fdc3`) and
that all cost migrations (`20260719030000/040000/050000` + `20260720010000`) are applied to the live
DB before trusting production deep-research budgets. No local access to Railway from the dev machine.
