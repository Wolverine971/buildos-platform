<!-- docs/technical/reviews/AGENTIC_CHAT_RADAR_LIVE_CHECK_2026-09-19.md -->
<!-- doc-status: point-in-time -->

# Freshness radar: first production observations and next work

**Date:** September 19, 2026, approximately 21:10 UTC.
**Source:** `main` at `398f8a6b1`, plus the uncommitted cursor fix described below.
**Scope:** continued the [handoff](AGENTIC_CHAT_HANDOFF_2026-09-19.md) with read-only production SQL,
bounded Railway log reads, source inspection, and a local regression fix. No production writes,
deployments, feature changes, model replays, commits or pushes.

## First scans are running

DJ's rename conversation in **DJ Wayne Studio** produced two live scans. Both completed without
errors. The `daily-brief-worker` Railway logs independently record both jobs completing.

| Scan                                   | Started UTC  | Finished UTC | Entity candidates      | Jev requests | Recorded model cost |
| -------------------------------------- | ------------ | ------------ | ---------------------- | ------------ | ------------------- |
| `4a2328d5-fdaf-4794-b8e1-c6261bf569c3` | 20:37:13.324 | 20:37:16.221 | 28 total, 28 excluded  | 2            | $0.00016170         |
| `f15a7705-5949-41b9-9368-b22cdc1ab712` | 20:42:11.322 | 20:42:13.482 | 28 total, 19 evaluated | 3            | $0.00070304         |

Each started about 62 seconds after its triggering turn completed (about two seconds after the
debounce deadline). Each also evaluated one inbox item and six goal/milestone gauges.

- First input: DJ explained that Samos was not the new brand, Tacemus was the old name, and asked
  for a temporary project name. Second input: “lets do DJ Wayne Studio”.
- No card, bundle, automatic task edit, or inbox retirement resulted. All six gauges were `unknown`
  in each scan because evidence was insufficient; raw numeric scores do not override this gate.
- The highest stale probability was 38% for collecting client testimonials, below the surface
  threshold. The other 18 evaluated entities were at 5–10%. These are uncalibrated model estimates.
- The no-card result follows the implementation: cards require a surfaced item, applied task,
  retired inbox item, or meaningful gauge change. Successful scans do not always produce a card.
- This proves queue execution and a quiet scan, **not** the positive card/approval/undo browser journey
  or the model's accuracy. The rename provides little evidence for task status changes.

The ledger has **2 completed live scans, 0 failed scans, 0 labelled outcomes and 0 candidates passing
the auto-apply checks**. Total recorded Jev cost is **$0.00086474**. Auto-apply precision is undefined,
not 100%; the rollout gate has not been earned. The base, surfaces and inbox-cleanup feature flags
are enabled; no enabled auto-apply flag was present.

## Cursor defect reproduced and fixed locally

The first scan saved `info_cursor_at=2026-09-19T20:35:53.035917+00:00`. The next scan used
`info_window_start=2026-09-19T20:35:53.035+00:00`, rounding the exclusive lower bound down by
917 microseconds. It therefore reread the first message: `info_chars` grew from 464 to 487 instead
of containing only the 23-character follow-up.

`windowStartFor` now retains the database timestamp string whenever the cursor is within the
lookback limit. The fallback lookback limits remain the same.

The disposable-PostgreSQL regression inserts an already-processed message at `.123456` and a new
one at `.123789` in the same millisecond. Before the fix it returned both. After the fix it returns
only the new message. The test rolls back its fixture changes.

Validation:

```sh
test-gate run pnpm --filter @buildos/worker exec vitest run \
  tests/freshnessRadar.postgres.test.ts tests/freshnessRadarWorker.test.ts
```

**28/28 passed**, including four real disposable-PostgreSQL tests. `git diff --check` passed.
The full `pnpm agentic:gate` is still pending the fresh approval required by handoff Step 5.
This is a local fix, not a claim that production has been repaired or final acceptance has passed.
The read-only `AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local pnpm agentic:calendar-setup --check`
also passed: an active connection and readable source exist. This does not prove a successful
Calendar API read during Case 10 or replace the gate's other preflight checks.

## First-scan coverage limitation

All 28 open candidates in the first scan were excluded. Every entity in this project was created
the preceding evening, within the first scan's 72-hour window. Only two documents had updates
after the triggering message. Thus “chat already edited everything” would be an incorrect
explanation.

This matches the frozen plan's “anything created in the window” exclusion, but means a first scan
can miss stale entities imported a day earlier. A possible later adjustment is to distinguish
entities created before the earliest included user message from entities created in response to
the dump. Decide that behavior explicitly and test it; this change set does not alter the policy.

## Inbox quarantine check

One quarantine was found since the deployment cutoff, September 19 at 01:22 UTC, including rows
updated after that cutoff rather than only newly created rows:

- **“Group revenue-facing documents under ‘Samos — project context’”**, DJ Wayne Studio.
- Inbox row `b7e55702-e459-41a4-818e-7155a1006458`, quarantined at approximately 04:01:55 UTC.
- Reason: `MODEL_ENTITY_MISMATCH`; the proposed `move_document_in_tree` did not visibly name the
  resolved moved document/destination sufficiently. The resolved moved document was “Offer sheets
  — The Diagnosis, Bid Desk, Quiet Quote Recovery”.
- The inbox entry is expired; the underlying suggestion remains pending. This is consistent with
  quarantine, not evidence that the proposal was approved or its documents deleted.

## Workflow pricing recheck

The [current OpenRouter V4 Flash page](https://openrouter.ai/deepseek/deepseek-v4-flash) still lists
DigitalOcean at $0.098 input / $0.196 output per million tokens, matching the general model catalog.
However, its cache-read price is $0.0196, above the workflow's frozen $0.006 ceiling. Even the
lowest cache-read price displayed in that page's provider table was $0.007924 at inspection.

`workflow-dispatch.ts` currently assigns V4 Flash a $0.006 cache-read rate as an assumed contract
ceiling, with a July 17 observation date. That is not current observed pricing. Resolve pricing,
provider admission and the versioned contract together before workflow activation; merely changing
the catalog date would not fix this. No overspend was demonstrated by this audit, and the workflow
switches were reported OFF in the handoff (not reverified here).

## Next actions, in order

1. Run the required isolated full gate for the cursor fix after approval; keep the checkout steady
   and retain the scorecard. No gate/workflow-lab runner matched the local process check at inspection,
   but recheck before starting. Narrow tests do not substitute for the gate.
2. Resolve the first-scan exclusion behavior above before treating a quiet first scan as useful
   evidence of freshness.
3. Add the missing acceptance fixture with an existing radar card in ordinary chat history.
4. Prove the positive live browser journey: meaningful update → card → approve → undo → badge/inbox.
   This has not happened in the observed production scans.
5. Finish Tasker 89: reconcile workflow pricing, real-provider/Railway process-kill recovery,
   remaining browser matrix and measured usefulness/cost comparison. A full gate alone does not
   close that acceptance matrix.
6. Collect labelled live outcomes before proposing auto-apply. Keep the declined production
   backtest, Case 14 repair, ordinary-turn stall investigation, calendar work and displaced Review
   project entry subject to the handoff's existing scope/approval decisions.

The original handoff and historical failed gate evidence remain unchanged.
