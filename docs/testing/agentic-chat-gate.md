<!-- docs/testing/agentic-chat-gate.md -->

# Agentic Chat change-set gate

Use `pnpm agentic:gate` for broader live Agentic Chat validation when warranted, with
explicit approval for each paid run. It is not required after every change set or
before continuing implementation; use focused free tests for routine changes. This is
the automated Cedar House seed-data battery, with three independent repetitions, no automatic retries, and
13 scored cases (1–11, 13–14). Case 12 would mutate an external calendar and is not
part of this battery. Manual browser checks supplement this gate.

## One-time environment

Set `AGENTIC_GATE_ENV_FILE` to a private env file for a **separate Supabase test
project**, with the current schema and Realtime configured. Do not use the normal
app database: a worker on a different port still consumes the same database queue.
The gate checks that its database differs from the normal app env files. Run only
one gate against this database at a time, with no other chat worker attached.

The current migration history assumes a pre-existing schema baseline. The September
11 isolate was provisioned from a schema-only export, custom roles and the private
Realtime policy; no production user data was copied. The gate's reference-data
bootstrap below does not replace that schema provisioning or repair migration history.

The file must contain:

```dotenv
AGENTIC_GATE_DATABASE_ISOLATED=true
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
PRIVATE_SUPABASE_SERVICE_KEY=...
PRIVATE_OPENROUTER_API_KEY=...
AGENTIC_TEST_USER_EMAIL=...
AGENTIC_TEST_USER_PASSWORD=...
```

Include the app's other required env values and Google Calendar client credentials
for the dedicated test account. Case 10 requires that account's connected calendar;
missing or failed sources fail visibly instead of silently shrinking the score.
Case 11 needs no calendar connection and checks both DST edges with an independent
oracle. The runner generates private transport/capacity tokens for its own services.
Never commit this file. An ignored `.env.agentic-gate.local` is a suitable name.

Calendar setup uses a dedicated Calendar OAuth client (different from the login
client), `PRIVATE_GOOGLE_CALENDAR_CLIENT_ID`, `PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET`,
and `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` (at least 32 UTF-8 bytes). Provision
the gate user in the isolated app and connect its dedicated QA Google account there,
using a callback URL registered for that app. Enable at least one readable calendar
source. Copy application configuration as needed; do not copy a production user's
OAuth tokens. The gate checks active connection/source metadata before model spend;
Case 10 must still prove a successful complete Google read.

Enable the source-aware connection flow in that same private env file with
`PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED=true` and set
`PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS` to the isolated gate user's UUID.
Both are required; a wildcard does not enable the flow. The current integration
requests the full Google Calendar scope, including edits, even though the gate
only reads. Use a dedicated QA Google account for this consent.

The one-time setup helper uses a fixed callback origin; subsequent gate runs use
ephemeral ports and reuse the saved connection. The QA client created on September
12 uses `http://localhost:5174/auth/google/calendar-callback`. Start its setup with:

```sh
AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local \
AGENTIC_CALENDAR_SETUP_PORT=5174 \
NODE_OPTIONS=--max-http-header-size=65536 \
pnpm agentic:calendar-setup
```

Sign in with the gate test credentials and connect the dedicated Google account
at `/profile?tab=calendar`. The helper checks for an active connection and readable
source before exiting. `pnpm agentic:calendar-setup --check` with the same env-file
setting checks prerequisites without starting a server. The larger header limit
accommodates existing localhost cookies; it applies only to this setup process.

## What runs

1. The harness and Cedar House oracle unit tests.
   Before booting services, the gate idempotently seeds the three facet definitions
   and 20 values in `scripts/agentic/reference-data.json`, checks them and exercises
   `validate_facet_values`. These are versioned system reference rows from the
   repository migration, not user fixtures. It then checks Calendar prerequisites.
2. Workspace dependency builds, serially, so a fresh source hash cannot hide stale
   dependency `dist` output.
3. Dedicated web and chat worker processes on allocated loopback ports, with the
   batch lane enabled. The worker is not a watcher; its source identity stays fixed.
4. Startup provenance checks: Git SHA plus a SHA-256 of changed executable files,
   including staged, unstaged, untracked, deleted and mode changes. Ignored secrets,
   generated artifacts and reports are excluded. This is an executable-tree hash,
   not a claim that every prose file in the repo is clean.
5. The 13-case battery three times, with fresh seeded projects and durable readback.
   Follow-up turns request real prewarm; case 4 includes a prepared follow-up after
   its task update. Every turn's executing worker identity is checked from its
   persisted `turn_phase` receipt, not just a nearby health endpoint.
6. Final service/tree checks, strict score evaluation, then process shutdown.

Success requires all expected turns in every repetition to pass, a full 52/52,
verified provenance, and the audit's load-bearing timing limits: case 2 <60s,
cases 4 and 8 <30s, case 14 <40s and at most eight tool calls. The case 4 timing
limit applies to the update, not the added prepared-readback probe. Missing data,
missing repetitions, skipped cases, uncertain verification and stale services fail.
A failed gate is evidence to investigate; it must not be described as a passing run.

Results are in `output/agentic-gate/<timestamp>/`: `gate.json`, `scorecard.json`,
and separate oracle/build/web/worker/battery logs. The scorecard retains each turn's
repetition, result class, duration, call count and run ID so variation remains visible.
Raw per-turn evidence is retained in `turns/` before cleanup: input, before/after
rows, tool receipts, response, model/provider timing and metadata, judge rubric,
verdict and failed judge attempts. Files have mode 0600; capture requires explicit
database isolation. The existing redacted Phase 0 format remains separate. Capture
errors are recorded and prevent a passing score. Judge infrastructure gets at most
two 75-second attempts against the same retained response; a low score is never
retried, and the product turn is never rerun to improve its score.

The gate also enables the existing development-only worker prompt capture in its
own `provider-passes/` directory. It retains exact requests and response events for
acting, review, and correction passes, including rejected proposals that never
executed. Each model-usage receipt must have a completed capture; missing or pending
captures fail evidence verification. Token, reasoning, cache and cost counters are
included alongside timings. Hosted/production prompt capture remains disabled.

`AGENTIC_GATE_REPETITIONS=1` is useful for diagnosis and **cannot pass** the release
gate; the normal gate and CI use three.
`AGENTIC_GATE_OUTPUT_DIR` selects an output directory.

To investigate unaffected product cases while Calendar setup is incomplete:

```sh
AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local \
AGENTIC_GATE_DIAGNOSTIC=true AGENTIC_GATE_REPETITIONS=1 \
AGENTIC_GATE_DIAGNOSTIC_SCENARIOS=cedar-01-project-create,cedar-02-task-batch,cedar-04-narrow-update,cedar-08-document-edit,cedar-14-grounded-status \
pnpm agentic:gate
```

This explicitly marked diagnostic still exits failed and retains the setup failure;
it never substitutes for the complete gate. For a controlled routing comparison on
the same source and model, additionally set `AGENTIC_GATE_PROVIDER_ORDER` to a comma
separated list of providers, **or** `AGENTIC_GATE_PROVIDER_SORT=latency`. They map to
the worker's optional `AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER` / `_SORT` settings.
Fallbacks remain available. Compare retained provider pass durations before adopting
a default; V4 Flash measurements do not establish a V4.1 Flash provider ranking.
The September 11 repaired V4.1 route defaults to `sort: throughput` after three
repetitions of Cases 2/4/8 met their timing limits. V4 Flash keeps its separate
provider order. Sorting does not guarantee a latency bound; the gate still enforces
every threshold and records the provider actually used.

The runner uses `test-gate` when installed, waits 60 seconds after a resource refusal,
and retries once. It does not change Vitest pool/worker limits.

### Running it without losing the result (learned September 13)

- **Keep the host awake.** A laptop that idle-sleeps on battery suspends every request.
  Overdue 450-second test timeouts then fire on a dark wake and start later scenarios
  while earlier turns are still running, which contaminates the queue measurements. Plug
  in, keep the lid open, and prefix the command with `caffeinate -dims`.
- **Keep the checkout fixed.** The final provenance check re-hashes the checkout. A commit
  or edit in the same checkout during the roughly 25-minute run fails the gate even though
  the services keep their startup code. Hold commits, or run the gate from a separate
  worktree snapshot.
- **Check OpenRouter credits first.** An exhausted balance returns HTTP 402 at stream
  start, which the runtime records as a generic `provider_stream_error`.
- **Cost is set by the acting model, not by the gate.** Measured three-repetition spend
  from the OpenRouter usage counter: `deepseek/deepseek-v4.1-flash` about $0.29,
  `unbiased/pareto` about $1.66 (2026-09-22). The gate reads
  `AGENTIC_CHAT_OPENROUTER_MODEL` from the env file and refuses any model outside
  `AGENTIC_GATE_ALLOWED_MODELS` (default: the DeepSeek model) before anything boots, so a
  cost estimate taken from one model can never authorize a run on a dearer one. Quote the
  model and its measured figure when asking for approval; check the credits counter before
  and after, since that delta is the real cost. A three-repetition DeepSeek gate measured $0.32 on 2026-09-22 (usage-counter delta).

## Deployed-stack battery (post-deploy check)

`pnpm agentic:prod-battery --confirm-prod` sends the same 13-case, three-repetition battery
through **production**: Vercel web (`https://build-os.com`), the Railway `agentic-chat-worker`,
and the production database. It runs as the dedicated harness account
(`agentic-e2e-…@example.com`; the runner refuses any other address). It starts no local services
and proves what users get after a deploy. The isolated QA gate above still tests a change
before it ships. The two scorecards are separate. Only a deployed commit can be tested this way.

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

## CI and deployment

`.github/workflows/agentic-chat-gate.yml` runs on relevant pull requests and main
pushes. Configure repository secret `AGENTIC_GATE_ENV` with the dedicated env file
contents; the job fails with an actionable setup error when it is absent. Set
**Agentic Chat seed-data gate** as a required branch check in repository settings.
That repository setting and the secret are external prerequisites; adding this
workflow does not configure them automatically.

The worker health response includes immutable startup `provenance`. Production
builds write `dist/source-provenance.json`; Railway source archives use the exact
provided deployment SHA. Missing provenance is exposed as null and cannot pass.
The legacy contract rollback remains available by setting
`CHAT_MUTATION_BATCH_LANE=false` on both web and worker. Delete that lane only after
retaining a clean live battery result for the cutover.
