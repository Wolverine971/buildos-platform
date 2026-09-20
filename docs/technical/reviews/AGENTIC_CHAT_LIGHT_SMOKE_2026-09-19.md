<!-- doc-status: point-in-time -->

# Project review: inexpensive workflow smoke

September 19, 2026, 8:14–8:16pm EDT. DJ requested a light test after deploying the
composer/workflow UI changes. The full Agentic Chat gate remains deferred.

**Result: enough confidence to start versioned specialist definitions.** One real-model
review and 79 zero-model-cost checks passed. This establishes the current fixed-roster
workflow as a useful foundation; it is not production rollout acceptance or a test of
custom specialist tools/Jev agent selection.

## Deployment and test boundary

- Railway reported a successful `agentic-chat-worker` deployment of
  `8951b7dc91cd021da110531d292bd41e8fb9843e`, matching the tested checkout.
- Worker preparation/execution switches and the review-user allowlist were **unset**.
  Deployment alone therefore has not enabled durable project reviews.
- No production configuration, hosted database, or user project was changed.
- The paid run used real OpenRouter requests and a disposable local PostgreSQL database
  with the existing frozen workflow migrations. Admission, preparation, runner, progress
  persistence, dispatch accounting, and terminal answer writing used the real worker code.
- Project context was a synthetic two-task workshop fixture. The Supabase RPC transport
  used the existing PostgreSQL shim, and live broadcasts were recorded locally. This did
  not test a hosted queue, browser interaction, deployed authentication, or Realtime delivery.

## Real-model result

| Measure | Observed |
| --- | --- |
| Provider-reported total | **$0.00573078**, about **0.57 cents** |
| Rounded durable ledger total | $0.005732 |
| Test elapsed time | 29.48 seconds, including local database setup/cleanup |
| Model requests | 4; no retries or fallback calls |
| Roles | Planner → project analyst + risk reviewer → editor |
| Accepted steps | 4/4, each on its first attempt |
| Saved answers / terminal events | 1 / 1 |
| Effects / project mutations | 0 / 0 in the test fixture |

The saved answer included the completed workflow projection and both specialists'
accepted findings, which are the inputs the new UI restores. The final answer distinguished
recorded facts from an inferred venue-before-catering dependency and identified missing
dates, ownership, and status. It was wordier than necessary for two tasks; concise output
guidance is a useful improvement when extracting specialist definitions.

The opt-in smoke enforces a **$0.10 aggregate reservation ceiling** before network dispatch
and a six-request maximum. It never releases a reservation during the run, so retries and
unknown charges remain covered. It preserves production prompts/token limits and sends
the workflow's provider price ceilings. This run reserved $0.021225 at conservative maximum
rates and actually cost $0.00573078.

Evidence: `output/agentic-workflow-light-smoke/2026-09-20T00-14-39-723Z.json` (local,
ignored, mode 0600; synthetic content and provider receipts, no credentials).

## Free checks

- **3 real-PostgreSQL checks:** complete/persist a review; replay a lost terminal-write
  response without duplicating the answer; kill/restart a worker without recalling an
  already accepted specialist.
- **27 recovery checks:** accepted answers, interrupted prefixes, model-free partial
  results, cancellation, permission loss, bounded recovery, and generation fencing.
- **49 web checks:** review admission and disabled/unsupported requests, capability gating,
  saved session restoration including stopped/failed reviews without answers, session
  ownership, and public projection parsing. This includes four existing session-close checks.

All checks ran through `test-gate`, sequentially. No research workflow, calendar test,
full `pnpm agentic:gate`, or load test was run.

## Repeat only when explicitly requested

The paid test is skipped by default. One bounded paid run:

```sh
AGENTIC_CHAT_PAID_LIGHT_SMOKE=yes test-gate run pnpm --filter @buildos/worker exec vitest run tests/agenticChatWorkflowLightSmoke.live.test.ts
```

It requires local PostgreSQL binaries and reads only the OpenRouter credential from
`.env.agentic-gate.local`. It never uses that file's database credentials. Each explicit
invocation has its own ten-cent ceiling; do not run it in an automatic retry loop.

## Next implementation

Proceed with `SpecialistDefinitionV1` and extract the current analyst/reviewer definitions
first. Keep their current behavior as the baseline. Configurable rosters need a versioned
durable snapshot because the existing SQL contract encodes four fixed step keys. Then add
one specialist with bounded tools/workflows and the `AgentSelector` interface for Jev.
See [the implementation path](../../architecture/SPECIALIST_AGENTS_AND_JEV_NEXT_STEPS_2026-09-19.md).

Broad rollout and hosted end-to-end acceptance remain separate work. This smoke provides
development confidence without claiming those checks passed.
