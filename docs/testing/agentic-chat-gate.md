<!-- docs/testing/agentic-chat-gate.md -->

# Agentic Chat live validation

> **Status (2026-09-24):** live validation runs against **production**. DJ retired the isolated
> QA database. The Supabase branch `agentic-chat-gate` was deleted, and so were the local gate
> runner (`pnpm agentic:gate`, `agentic:calendar-setup`, `agentic:workflow`), its CI workflow, and
> the QA-only book-loop scripts. They were last present in commit `525cc6e6b`; restore them from
> there if an isolated database is ever provisioned again. Pre-production checks are now
> focused free tests plus `pnpm db:rehearse` for migrations
> ([migration rehearsal](../../scripts/migration-rehearsal/README.md)).

Use focused free tests for routine changes. Live runs are paid and need explicit approval for
each run. They are not required after every change set. The battery is the automated Cedar House
seed-data battery: 13 scored cases (1–11, 13–14) and three independent repetitions, with no
automatic retries. Case 12 would mutate an external calendar and is not part of the battery.
Manual browser checks supplement it.

Success requires all expected turns in every repetition to pass, a full 52/52,
verified provenance, and the audit's load-bearing timing limits: case 2 <60s,
cases 4 and 8 <30s, case 14 <40s and at most eight tool calls. The case 4 timing
limit applies to the update, not the added prepared-readback probe. Missing data,
missing repetitions, skipped cases, uncertain verification and stale services fail.
A failed gate is evidence to investigate; it must not be described as a passing run.

## Deployed-stack battery (post-deploy check)

`pnpm agentic:prod-battery --confirm-prod` sends the same 13-case, three-repetition battery
through **production**: Vercel web (`https://build-os.com`), the Railway `agentic-chat-worker`,
and the production database. It runs as the dedicated harness account
(`agentic-e2e-…@example.com`; the runner refuses any other address). It starts no local services
and proves what users get after a deploy. Only a deployed commit can be tested this way. With QA
retired, this is the live check. Test a risky change with the free preflight and focused tests
before deploying, then run the battery (approval required) right after the deploy.

- **Setup:**
    - `.env.agentic-prod-battery.local` (ignored, mode 0600) holds `AGENTIC_TEST_USER_EMAIL`,
      `AGENTIC_TEST_USER_PASSWORD`, and a `PRIVATE_OPENROUTER_API_KEY` used only by the judge on
      this machine. Production Supabase values come from `apps/web/.env`. Deploy metadata comes
      from the Vercel CLI login (or `VERCEL_TOKEN`) and the Railway CLI.
    - Case 10 needs the harness account's own Google Calendar connection in production. Sign in
      at `https://build-os.com/profile?tab=calendar` as the harness account and connect the
      dedicated QA Google account. Either connection kind passes preflight: the single-calendar
      flow, which nearly every production user is on, or the allowlisted multi-calendar flow.
      `prod-battery.json` records which one the run used.
- **Free first:** `pnpm agentic:prod-battery --preflight-only` checks the target, the production
  acting model against `AGENTIC_GATE_ALLOWED_MODELS`, one clean deployed commit on web and
  worker (Vercel deployment SHA = worker `/health` provenance), the harness account, and the
  calendar. It spends nothing and writes nothing.
- **What the run enforces:**
    - Every turn's executing worker receipt must match the deployed commit.
    - The deployment must be unchanged at the end, or the run fails as mixed.
    - Scoring is the same as the QA gate: `evaluateGateScorecard`, 52/52 plus the latency and
      call limits.
    - Evidence (`turns/`, `scorecard.json`, `prod-battery.json`) covers only the harness
      account's own rows. Production records no prompts, so there is no `provider-passes/`.
- **Cleanup (hard delete):** before the run, every project the harness account owns is deleted.
  After it, the run's projects are deleted, and the run's chat sessions go through
  `delete_my_chat_session` as the harness account. Both are verified empty. Usage rows keep
  their cost (their session and turn links are set null).
- **Cost:** it is paid. It needs explicit approval per run. `prod-battery.json` reports the
  production model spend (from the harness account's `llm_usage_logs`) and the judge spend
  (the judge key's usage delta).

## Before a paid run

- **Quote the model and its measured cost.** Cost is set by the production acting model (the
  Railway `agentic-chat-worker` env `AGENTIC_CHAT_OPENROUTER_MODEL`, reported by the free
  `--preflight-only`), plus the judge. `assertGateModelAllowed` refuses models outside
  `AGENTIC_GATE_ALLOWED_MODELS` (default DeepSeek V4.1 Flash). Measured on 2026-09-24:
  6 cases × 3 repetitions = $0.36 ($0.18 model + $0.18 judge).
- **Check OpenRouter credits before and after.** The delta is the real cost. An exhausted
  balance returns HTTP 402 at stream start, which is recorded as a generic
  `provider_stream_error`.
- **Keep the host awake** (`caffeinate -dims`, plugged in, lid open). A dark wake fires
  overdue test timeouts and contaminates the timings.

## CI and deployment

The `agentic-chat-gate.yml` CI workflow was removed on 2026-09-24. It failed on every push
because `AGENTIC_GATE_ENV` was never configured. Had it been configured, it would have started a
paid gate on every push, against the paid-run approval rule. Live runs are started by hand, with
approval.

The worker health response includes immutable startup `provenance`. Production
builds write `dist/source-provenance.json`; Railway source archives use the exact
provided deployment SHA. Missing provenance is exposed as null and cannot pass.
The legacy contract rollback remains available by setting
`CHAT_MUTATION_BATCH_LANE=false` on both web and worker. Delete that lane only after
retaining a clean live battery result for the cutover.
