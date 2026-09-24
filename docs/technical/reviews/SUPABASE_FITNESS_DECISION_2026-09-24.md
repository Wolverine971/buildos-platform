<!-- docs/technical/reviews/SUPABASE_FITNESS_DECISION_2026-09-24.md -->

# Supabase fitness — decision brief

**24 September 2026 · Tasker 104 · Owner: Codex · Read-only investigation**

**Follow-up:** DJ chose to keep QA. The [updated work order and queue investigation](SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md) rechecks live security grants, confirms maintenance RPCs are now healthy, and distinguishes chat wake notifications from delegated background jobs. No resize is approved or applied.

**Recommendation: fix the known reliability problems, move QA to Micro, and keep production on Micro while measuring a busy period.** Production Small is a reasonable ~$5/month precaution, but the evidence does not establish that production needs it. Medium, a read replica, and extra disk I/O are not justified by current measurements.

The [full audit](SUPABASE_FITNESS_AUDIT_2026-09-24.md) and [dated evidence](supabase-health/2026-09-24/README.md) distinguish measurements, inferences, and open questions. No database, setting, deployment, or subscription was changed; no paid test ran.

## What the money and latency actually show

- **The organization’s projected invoice is $65.28**, not just a $10 database: Pro, three Micro projects, a persistent QA branch, and a custom domain. Current usage has **no overages**. Other projects account for ~$19.62/month of compute at 730 hours; review whether both are still needed before buying larger infrastructure.
- **408,669 of 465,179 REST requests in 24 hours—87.9%—were queue claims.** The SQL averages **0.16 ms**, while HTTP origin p95 is **91 ms**. Reduce unnecessary calls before tuning this already-cheap query. Fewer calls save capacity; they do not immediately reduce a fixed compute bill.
- Production’s two five-minute samples showed **1.38–3.21 MiB/min swap-in and 0.18–0.37% CPU iowait**. That is paging, not demonstrated sustained thrashing. **610 MB of database is smaller than 966 MB of RAM**; the tasker’s initial comparison was incorrect. Busy-period paging remains unmeasured.
- QA has roughly half production’s RAM. During the gate window its snapshot RPC p95 was **3,506 ms**, versus production’s **301 ms** in the separate 24-hour sample; workloads differ and production has only 18 observations. Lock contention and migration drift also matter.

## Ranked changes

| Rank | Action and evidence                                                                                                                                                                     | User-visible benefit                                              | Incremental monthly cost                        | Risk / reversibility                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1    | Finish Tasker 76 containment: **three previously flagged definer RPCs still have anonymous/client execution grants**.                                                                   | Protect data and control operations.                              | $0 infrastructure                               | Caller compatibility; reviewed grants can be restored. No bulk advisor fixes.               |
| 2    | Finish Tasker 102 lock/snapshot work and verify maintenance RPC deployment: **1,753 recovery/reaper 404s** earlier today; QA snapshot max **11.85 s**.                                  | Fewer stalled turns and delayed recovery.                         | $0 infrastructure                               | Concurrency correctness; staged migration/code rollback. Paid gate needs separate approval. |
| 3    | **QA Nano → Micro**; already billed **$0.01344/hour**, the Micro rate. Reconcile branch migrations alongside sizing.                                                                    | More credible gate results and memory headroom.                   | **Expected $0**; confirm resize quote           | Restart interruption; reversible resize.                                                    |
| 4    | Adaptive queue polling with existing wake notifications; four replicas at 1 s can back off toward 5 s when idle.                                                                        | Less background traffic without delaying normal wake-driven work. | $0 infrastructure; no guaranteed invoice saving | Missed wakes need fallback; reversible config/code. Potential **192 fewer calls/min**.      |
| 5    | Coordinate retention with Tasker 103; QA prompt/input artifacts occupy **192 MiB**. Review stream-state index: **88,525 updates, zero HOT**, only **56 secondary-index scans** in prod. | Less write/vacuum pressure and more useful cache space.           | $0 infrastructure                               | Retention deletion is irreversible; index changes require query/constraint review.          |

## Decisions for DJ

1. **Sizing:** choose **A (recommended)**: production Micro + QA Micro, expected **+$0/month**; **B**: production Small + QA Micro, **+$5.23/month**; or **C**: both Small for matching 2 GB environments, **+$10.45/month**. Deltas use 730 hours; actual billing follows uptime. All require an approved interruption window. Nano is charged at Micro pricing on paid plans. [Compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
2. **Execution priority:** approve the ranked follow-ups as separate, reviewable changes. Start with security and known lock/deployment defects; collect busy-period metrics before interpreting a resize as a fix. Research authorization has not been treated as authorization to apply them.

Use the [read-only health kit](../../../scripts/supabase-health/README.md) for the next comparison. A controlled paid gate, historical I/O-budget evidence, exact per-turn network attribution, and the original branch migration error remain open; this audit does not claim those are resolved.
