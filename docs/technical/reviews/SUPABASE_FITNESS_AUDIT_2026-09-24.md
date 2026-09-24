<!-- docs/technical/reviews/SUPABASE_FITNESS_AUDIT_2026-09-24.md -->

# Supabase fitness — evidence and implementation options

**Owner: Codex · Tasker 104 · 2026-09-24 · Research delivered; busy-window validation pending**

**Later same-day recheck:** see the [work order and polling investigation](SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md). The earlier maintenance RPC failure window has ended; live security grants remain exposed; all four chat workers receive wakes while continuing one-second polling. DJ chose to keep QA.

Read the [decision brief](SUPABASE_FITNESS_DECISION_2026-09-24.md) first. All remote work was read-only: Management API, privileged metrics, authenticated dashboard, deployed infrastructure metadata, and fixed SQL/catalog queries. No reset, migration, resize, restart, load generation, paid model call, or configuration change was performed.

Evidence is in [the dated baseline](supabase-health/2026-09-24/README.md). Final snapshots collected at **17:19–17:20 UTC** have every requested section and explicitly report `transaction_read_only=on` on both projects. Deployments changed during the day through other work; this is a timestamped observation, not a frozen experiment. Current working-tree changes in Tasks 102/103 are not assumed deployed.

## 1. Sizing: what is established, and what is not

| Observation                      | Production                                       | QA gate branch         |
| -------------------------------- | ------------------------------------------------ | ---------------------- |
| Project                          | `iwifjtlebphefldmwbkh`                           | `daudvqczjqxhpzstlfih` |
| Compute / physical RAM           | Micro / ~966 MB                                  | Nano / ~455 MB         |
| Database including indexes/TOAST | 610.19 MB / 581.93 MiB                           | 390.76 MB / 372.66 MiB |
| Shared buffers                   | 256 MiB                                          | 224 MiB                |
| Postgres / PostgREST             | 15.8 / 12.2.3                                    | 15.14 / 14.5           |
| Work memory / maintenance memory | 3,500 KiB / 64 MiB                               | 2,184 KiB / 32 MiB     |
| Disk used / provisioned          | 1.13 GB / ~8 GB                                  | 0.72 GB / ~8 GB        |
| Connections                      | 15 at final catalog sample; dashboard peak 21/60 | 8 at sample; max 60    |

**Correction:** the original tasker says 610 MB is bigger than 966 MB. It is not. Nor must every byte of the database reside in RAM. Postgres buffers, filesystem cache, other Supabase processes, active queries, and reclaimable/idle pages share the machine. A near-100% Postgres buffer hit rate does not rule out swapped-out buffer pages.

Two five-minute windows, with no newly observed chat admission during the first window, give:

| Project / UTC window   | Swap-in MiB/min | Swap-out MiB/min | Major faults/s | Root reads MiB/min | Data reads MiB/min | CPU iowait |
| ---------------------- | --------------: | ---------------: | -------------: | -----------------: | -----------------: | ---------: |
| Prod 17:07:51–17:12:52 |            3.21 |             0.33 |           8.87 |               5.93 |              0.083 |      0.37% |
| Prod 17:14:43–17:19:44 |            1.38 |                0 |           4.43 |               2.00 |              0.005 |      0.18% |
| QA 17:07:54–17:12:56   |            4.38 |            10.94 |          86.58 |             132.20 |              10.61 |      1.74% |
| QA 17:14:47–17:19:48   |            1.25 |                0 |           8.27 |               5.54 |                  0 |      0.11% |

These are **quiet/application-light observations, not certified zero-user or busy-load experiments**. Catalog/advisor inspection overlapped and could have provoked cold reads, particularly on QA. Exporter timestamps were absent; cached metrics make wall-time rates approximate. CPU fractions use total counter deltas. Page conversion assumes 4 KiB. Root reads include activity other than swap; major faults include file-backed faults.

Production CPU was ~97–98% idle in these samples. The dashboard's last-day CPU aggregation was 2.89%, with no recovered high-resolution history proving an incident-time paging spike. Production's root I/O totals accumulated since April **2025**, whereas QA started September **2026**. Comparing the cumulative terabytes directly would be misleading.

**Decision:** retain Micro pending a simultaneous busy sample, or buy Small's 2 GB as a modest headroom experiment (+$5.23/730 h). Do not claim it fixes locking. QA should at least match Micro; its Nano configuration has half the RAM, different component versions and a different retained-data mix. Medium (+$50.19/730 h over Micro) is not supported by current utilization.

## 2. Spend: organization costs versus BuildOS workload

The authenticated billing dashboard showed the September 17–October 17 cycle at **$29.97 accrued and $65.28 projected**: $25 Pro, three projects each with 183 Micro hours ($2.46 each), compute credits offsetting $7.38 so far (maximum $10/cycle), $2.46 branching, and $2.51 custom-domain accrual. Project names are `build_os`, `uxm`, and `cody-shooting-complex`; the branch is additional.

Organization usage was **4.327/250 GB egress**, **0.312/100 GB storage**, **20,705/5 million Realtime messages**, peak **12/500** Realtime connections, and **3 MAU**. No usage overage was shown. Production alone accounted for 3.963 GB egress, 0.311 GB storage, 1,923 Realtime messages, and 2 MAU. Do not divide organization spend by production turns as a unit-cost estimate.

| Choice | Hourly compute | 730-hour equivalent | Delta from currently billed Micro/Nano |
| ------ | -------------: | ------------------: | -------------------------------------: |
| Micro  |       $0.01344 |               $9.81 |                                     $0 |
| Small  |        $0.0206 |              $15.04 |                                 +$5.23 |
| Medium |        $0.0822 |              $60.01 |                                +$50.19 |

QA Nano is already billed at the Micro hourly rate. Its size change therefore has **expected zero compute delta**, subject to the actual resize quote. Branching is billed separately from the compute credit. [Official compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute) and [branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching) support this interpretation.

Reasonable alternatives: review continued need for the other two projects (~$19.62/month combined); use an ephemeral QA branch only if it can reliably rebuild seed data, migrations, credentials and calendar integration. The latter is currently a poor trade given the failed migration history. Review the $10/month custom domain's authentication/OAuth purpose before considering removal. No project was paused and no add-on was changed.

## 3. Where time goes, and the queries worth attention

The [production report](supabase-health/2026-09-24/prod-report.md) and [QA report](supabase-health/2026-09-24/qa-report.md) contain **top 20 by total time, calls and maximum**, with query IDs, role OIDs, block reads and temporary writes. Full redacted SQL shapes are retained in compressed snapshots.

Production statement counters reset August 11; QA September 11. Database/table counters have other reset dates, including an inherited August 25 QA database reset. QA's 674 lifetime deadlocks cannot all be attributed to this gate. Evicted statement entries and older code remain limitations. `track=top` hides nested SQL in RPCs; `track_io_timing=off` means zero I/O timings are unavailable measurement. **Means and maxima are not p95/p99.**

| Work category       | Measured production SQL                                                                                             | Interpretation / next action                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform/background | `realtime.list_changes`: 1.509M calls, **9,463 s**, 6.27 ms mean, 10.48 s max                                       | Largest accumulated execution entry; inspect publication/client demand before disabling anything. Execution includes waits, not just CPU.                 |
| Queue background    | `claim_pending_jobs`: **13.314M calls**, 2,107 s, **0.16 ms mean**, 159 ms max                                      | Call volume, not a slow execution plan, is the primary opportunity.                                                                                       |
| User-visible list   | `agent_runs` + project full projection: **44,627 calls**, 877 s, 19.64 ms mean; another shape 95,935 calls, 1.84 ms | Compare callers/projections; use existing summary view and avoid redundant refreshes. Do not infer an exact 10× speedup from different historical shapes. |
| Chat preparation    | Prepared-prompt inserts: 10,636 calls, **217 s**, 20.39 ms mean                                                     | Short-lived large artifacts have serialization/TOAST and write costs. Coordinate with Tasks 101/102/103.                                                  |
| Search/background   | Embedding upserts: 743 calls, **205 ms mean**, 2.11 s max, 60,347 shared blocks read                                | About 471 MiB of historical buffer reads; measure batches and HNSW maintenance before tuning.                                                             |
| User search         | Several `onto_search_semantic` shapes reach **3.9–5.35 s max**; one 27-call shape averages 1.08 s                   | Strong candidate for parameter-specific plan inspection with representative embeddings and filters; no customer vectors fetched here.                     |
| User chat           | `load_fastchat_context`: 4,369 calls, **25.13 ms mean**, 695 ms max                                                 | Review serial round trips before assuming the SQL itself dominates whole-turn latency.                                                                    |
| Admin               | Usage dashboard: 43 calls, **1.82 s mean**, 3.10 s max                                                              | Cache/bound date ranges and inspect aggregation plan if admin UX matters. Low frequency.                                                                  |
| Operator overhead   | Catalog discovery: 1,015 calls, **222.5 s**, 123,777 temp blocks (~967 MiB)                                         | Tool/dashboard metadata scans spill. Avoid tight introspection loops; do not raise global `work_mem` on a 1 GB instance for these.                        |

`agent_runs` received a **non-executing EXPLAIN**: the planner uses the created-at index, filters user ID, and joins the project primary key with memoization. Estimated relation size is only 109 rows. A `(user_id, created_at)` index may help later, but the existing `view=summary` projection in [the endpoint](../../../apps/web/src/routes/api/agent-runs/+server.ts) and fewer fetches come first. This plan uses a representative subquery parameter, not a customer identifier, and is not an executed benchmark.

`queue_jobs` has 5.03M lifetime sequential scans and 25.15B tuples read, but current claims average 0.16 ms. Its function uses due pending rows, job-type filtering, priority ordering, `FOR UPDATE SKIP LOCKED`, then `UPDATE … RETURNING`. Empty claims do not rewrite rows. Historical sequential-scan counts alone do not justify another index.

## 4. HTTP latency, real failures, and idle traffic

Production logs cover **Sep 23 17:00–Sep 24 17:00 UTC**. Path totals equal hourly totals: **465,179 REST requests**, 1,811 responses ≥400, just **one ≥500**. Every counted request has origin timing. These are edge **origin times**, not client/network RTT or pure SQL execution.

| Endpoint                                |   Count | p50 / p95 / p99 / max, ms     |
| --------------------------------------- | ------: | ----------------------------- |
| Production queue claim                  | 408,669 | 12 / 91 / 254 / 8,960         |
| Production agent-runs list              |   6,250 | 80 / 227 / 328 / 19,685       |
| Production prompt snapshot v3           |      18 | 233 / 301 / 301 / 301         |
| QA queue claim, 03:00–03:30             |     518 | 91 / 714 / 2,340 / 9,306      |
| QA prompt snapshot v3, same gate window |      39 | 386 / 3,506 / 11,852 / 11,852 |

QA's gate window had 5,391 requests, 13 errors including five ≥500. Postgres logs contain lock waits/acquisitions around 03:13:43–03:13:50, consistent with Tasker 102. The production log search returned no matching lock/timeout records in its day window; this is not proof that no short waits occurred.

The production outlier is an **HTTP 522** on `agent_runs` at **08:36:01 UTC**, 19.685 s origin time. There is no corresponding captured Postgres lock event proving its cause. Earlier that day recovery/reaper RPCs returned **1,010 + 743 HTTP 404s**, ending 15:03:09. Cron metadata confirms `reaper_failed,recovery_failed`; later recorded runs succeeded. Also investigate **29 HTTP 400s** from provider-attempt observation. These are deployment/schema/application failure signals; extra RAM does not repair missing RPCs or validation errors. Other diagnostic SQL errors during the audit should not be counted as user failures.

Nineteen production completed turns in bounded last-day metadata had p50 **53.12 s**, p95 **176.32 s**, median **27 durable events**. These totals include model/tool work and cannot be apportioned to Supabase without per-span traces. Likewise, hour-level traffic peaks (~21,500 requests/hour) mostly measure queue polling, not human load.

Production queue claims average **283.8/min over the day**. A separate **162.62-second statement-counter delta** observed 758 claims (**279.7/min**, 114.7 ms total SQL execution), 319 Realtime polls (**117.7/min**), and 46 recovery calls (**17.0/min**). There were a few web reads and audit queries, so this is an application-light floor, not a certified zero-user test.

Four chat replicas at one-second idle polling explain a modeled 240 calls/min before other workers. Increasing their idle interval toward five seconds would reduce that part to 48/min: **192/min, or ~8.41M calls/730 h**, if the live intervals match source defaults. Keep the existing [queue wake listener](../../../apps/worker/src/workers/agentic-chat/host/queue-wake-listener.ts), jitter/backoff and a durable fallback poll. Test lost/disconnected wakes and backlog pickup. Wake fan-out to all four replicas can create competing claims; measure before introducing a leader. Cancellation polling and lease renewal only run for active work and should not be counted as a perpetual idle baseline.

Neither database has the **pg_cron extension installed**. A preloaded launcher is not a scheduled job. The observed Vercel deployment has **four** crons, not every cron in local/root configs: stale turns each minute, Gmail connection health hourly, webhook renewal hourly, Gmail relevance retention hourly. Stale-turn reconciliation and pure SQL retention are candidates for a single database scheduler; HTTP/OAuth work should remain in an application worker. Prefer consolidating duplicate sweep ownership first: ~17 recovery calls/min already exist alongside the web cron. Installing pg_cron is optional, not an urgent performance requirement.

## 5. Hot rows, locks, retention and indexes

Production `chat_turn_stream_state` had **88,525 updates, zero HOT updates, 563 autovacuums**; QA had **39,158 / zero / 210**. Its secondary index includes `updated_at`, which the stream path changes, making these updates ineligible for HOT regardless of fillfactor. The secondary index has **56 production scans and zero QA scans**, while the primary key has 245,894 production scans. Review actual session-latest queries before removing/replacing the secondary index; coalescing checkpoints may avoid more work than physical tuning. Lower fillfactor alone cannot fix an indexed-column change. [PostgreSQL HOT conditions](https://www.postgresql.org/docs/15/storage-hot.html).

Production `chat_turn_runs` has **64,734 updates, 6,756 HOT (~10.4%), 223 autovacuums**; QA has 45,208 updates and 188 autovacuums. Both tables have no per-table storage/autovacuum overrides. Global vacuum scale factor is 0.2 and threshold 50. Dead tuples are estimates, not measured bloat; no heap scan, `pgstattuple`, VACUUM, REINDEX, or rewrite was run. Do not increase vacuum frequency blindly on Nano.

Tasker 102's prompt-snapshot v3→v2→v1 path holds a turn lock across repeated large writes (~66 KB in its incident analysis). Prioritize **one snapshot write and late/short locking**, then audit individual remaining `FOR UPDATE` sites for `FOR NO KEY UPDATE` when key identity is unchanged. The latter permits FK `KEY SHARE` checks to coexist, but **still serializes competing writers** and does not make a multi-write snapshot cheap. Do not weaken lease/fence invariants or blanket-change queue claims. [PostgreSQL lock compatibility](https://www.postgresql.org/docs/15/explicit-locking.html).

The newly deployed lock-free checks still contain the text `FOR UPDATE` in explanatory comments; the inventory's source-text flags are inspection leads, not proof of executed locks. Tasker 102 retains ownership of behavior changes and its required, separately approved paid gate.

Largest production consumers include embeddings **75.16 MiB**, usage logs **48.34**, tool executions **34.93**, messages **21.63**, notification logs **19.95**, prompt snapshots **15.99**, turn events **15.45**, and cron logs **10.88**. QA is different: prompt snapshots **121.87 MiB** plus input artifacts **70.10 MiB** occupy **~192 MiB, 51.5% of its database**. Cleaning retained test artifacts is a better first memory/storage experiment than global compression settings.

Retention is partially evidenced, not assumed: production statement history records 49 worker-artifact cleanup calls (1.21 s mean), 35 sensitive-transcript cleanups (1.30 s), and prompt-artifact cleanup variants with 28 and 32 calls. The latter have maxima **6.64 s and 2.71 s**: use bounded batches and off-peak scheduling, not one unbounded purge. Recent Gmail-retention cron records succeeded. No analogous QA PostgREST cleanup execution was visible. Existence of a function or a local scheduler is not proof of a currently effective retention policy.

Tasker 103 is concurrently adding broad privacy retention. Verify deployment and structured last-success/rows-remaining summaries there; do not create a competing cleanup system. Historical allocated pages do not instantly shrink after deletes/vacuum. The 10.33 MiB prepared-prompt table with ~one live estimated row merits follow-up on churn/free space, not an unsupported bloat percentage.

The production advisor flags **421 unused indexes**; QA's final snapshot flags **871** (one fewer than the initial snapshot). Broader all-schema zero-scan counts are different populations. Leading production candidates include document props trigram **4.05 MiB**, usage operation **2.98 MiB**, and derived-artifact search **2.59 MiB**. Review duplicates, constraints, foreign-key deletes, rare admin paths and reset windows before dropping. The embedding HNSW index is **35.39 MiB with one scan**: measure representative semantic-search plans before deciding whether it earns its write/memory cost. Never drop it solely because the scan count is small.

Current TOAST defaults are `pglz`. LZ4 could trade CPU against compressed size, but no compression ratio or speedup was measured. Test on synthetic representative payloads after eliminating redundant writes and enforcing retention; changing a column's compression does not rewrite existing values. Production already has database bytes below physical RAM; the goal is lower active footprint and write churn, not an arbitrary whole-database-in-RAM threshold.

## 6. Connections, timeouts and geography

The measured maximum of **21/60 connections** provides no case for a larger connection limit. Both APIs report `db_pool=null` (managed default), acquisition timeout **10 s**, and Supavisor transaction mode on port **6543** with null/default pool settings. Tasker 102 previously recorded a 10-connection PostgREST pool; this API read did not independently prove that effective value. Final catalog groups include PostgREST, Realtime, Supavisor and Libri; the saved overview preserves states/counts.

The `authenticator` role has **8 s statement and lock timeouts**; authenticated clients have 8 s statements, anonymous clients 3 s. A blocked operation can occupy scarce API capacity until timeout even when global connections are low. Consider **100–250 ms lock timeout only for optional telemetry**, with explicit bounded retry/drop behavior and observability. At 250 ms the upper blocked-slot residence would be 32× shorter than 8 s; that is arithmetic, not a measured latency gain. Durable events, effects, finalization and ownership checks need reliable semantics.

Direct pooled Postgres for a few worker RPCs may reduce HTTP overhead, but requires bounded pools across four replicas, correct session/transaction behavior and least-privileged credentials. Libri already uses `pg`. A larger direct pool could worsen the same row contention. First measure an equivalent metadata-only RPC through HTTP versus a small pool in QA; no transport rewrite was implemented.

[Deployed infrastructure evidence](supabase-health/2026-09-24/deployments.json) confirms:

- Supabase production and QA: **us-west-1**.
- Vercel production `dpl_6AWu9uNFZdoWCTBAw2s19shmSWRv`: actual runtime **sfo1**. The earlier iad1 mismatch is no longer present in this deployment.
- Railway chat deployment `a603a362-6057-4037-b37b-c43b27e1c3f1`: **four instances, us-west2**.
- General/daily-brief and Libri workers: **one each, us-east4-eqdc4a**. Their database traffic still crosses regions.

Taskers 101/102 measured ~28 ms from the western chat worker and ~105 ms from the Maryland gate laptop, with ~15 serial calls per write. As an illustrative lower bound, that is **0.42 s versus 1.58 s** of serialized network time per write; it is **not a new per-turn RTT measurement**, and a turn can contain multiple writes. The current evidence does not isolate exact production per-turn network cost. Check eastern-worker DB call counts/RTT before relocation; external provider geography may also matter.

## 7. Advisors, branch health and recovery

Every returned finding has an **initial disposition, priority, owner tasker, object metadata and remediation URL** in [advisor-triage.json.gz](supabase-health/2026-09-24/advisor-triage.json.gz): **1,774 production and 2,244 QA findings**. This is complete initial triage, not individual exploit validation or approval to apply fixes. Findings overlap; counts are not counts of distinct vulnerabilities.

| Finding                                      |          Prod / QA | Disposition                                                                                         |
| -------------------------------------------- | -----------------: | --------------------------------------------------------------------------------------------------- |
| Anonymous / authenticated definer execution  | 96 / 96; 115 / 115 | Tasker 76: prioritize known dangerous RPCs, then caller/authorization audit; avoid blanket revokes. |
| Mutable function search path                 |          111 / 112 | Explicit safe paths after dependency review.                                                        |
| RLS enabled without policy                   |            59 / 53 | Often intentional service-only denial; document intent, never add access just to clear a warning.   |
| Extensions in public                         |              4 / 4 | Review supported relocation and dependencies.                                                       |
| Long OTP expiry / leaked-password protection |         1 / 1 each | Review auth settings and UX; changes require approval.                                              |
| Vulnerable Postgres release                  |              1 / 0 | Plan production patch/restart with backup and QA rehearsal.                                         |
| Multiple permissive policies                 |          511 / 551 | Prove equivalent access rules, then optimize measured user queries.                                 |
| RLS auth initplan                            |          250 / 249 | Hoist statement-constant auth calls where safe; not a fix for service-role queue polling.           |
| Unindexed foreign keys                       |          203 / 190 | Prioritize measured joins/cascades and hot references, not all suggested indexes.                   |
| Unused indexes                               |          421 / 871 | Size/call-path/constraint review; see storage section.                                              |
| Absolute Auth connection allocation          |              1 / 1 | Revisit with sizing; no current capacity pressure established.                                      |

**Known security follow-up:** live grants still expose `get_subscription_overview`, `acquire_migration_platform_lock`, and `batch_update_phase_dates` as definer functions to anonymous/authenticated roles. Their previous Tasker 76 review is the basis for escalation; source-text absence of a particular auth helper alone would not establish a vulnerability. No exploit or mutation probe was performed.

The branch is healthy enough to accept connections but still reports **MIGRATIONS_FAILED**. Management action history identifies the original **migrate step as DEAD on September 11 at 01:18:42 UTC**. QA's migration ledger returned only eight entries, despite additional live functions, versus the many later production migrations. This supports **failed provisioning plus manual schema drift**, not a current connection outage. The original action-log request returned HTTP 400; the exact failing migration/error remains unknown. Reconcile schema/ledger deliberately with Tasker 63; do not blindly replay or reset the branch. Sizing parity alone will not produce a trustworthy gate.

Production has **seven completed daily logical backups**, newest September 24 14:51 UTC; QA has physical backups. **PITR is off on both.** A restore rehearsal and an explicit acceptable recovery-point objective are more useful decisions than buying a replica for latency. No restore was attempted. PITR pricing and a restore target should be scoped separately if a day's potential loss is unacceptable.

## 8. Realtime, observability and the next experiment

Thirteen tables are in the production Realtime publication, including legacy project/task/phase tables, queue jobs, chat messages, agent runs and question-tree tables. The final snapshot's active logical slot retained only **56 bytes**: no observed WAL backlog. No current subscription rows were returned in the opt-in sample, while the history clearly contains demand. Audit obsolete channels/publication members through caller evidence before removal.

The median completed turn persisted **27 durable events**. With one listening client, send-plus-delivery accounting would suggest roughly **54 messages** for those events alone; live previews and worker wake fan-out add more. This is a proxy, **not measured billed messages per turn**. The billing dashboard's production total of 1,923 messages cannot be equated with 1.509M `realtime.list_changes` SQL polls. Coalesce transient previews if measured volume warrants it; preserve durable completion events.

Authenticated dashboard access recovered CPU/memory views that the earlier CLI investigation lacked. Several I/O-history charts still returned “Unable to load data”; neither a token scope change nor a log drain was demonstrated to recover the missing history. The new kit samples the current Prometheus metrics and searches historical logs. The old `logs.all` endpoint was removed September 23; the kit uses ClickHouse-backed `/logs`, with separate path/hour aggregation to avoid the 1,000-row cap. [API migration](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint).

For the next naturally busy session, store one-minute metrics in an existing metrics system, or use repeated five-minute kit samples with a known start/end workload window. Capture paging, major faults, per-device I/O, CPU/iowait and connections alongside per-route p95/p99, lock events, queue admission lag and turn spans. Keep production/version/region constant for comparison. A log drain is not required to scrape metrics; new hosted monitoring spend needs a separate decision. [Supabase metrics](https://supabase.com/docs/guides/observability/metrics).

Suggested sequence and success criteria:

1. **Tasks 76/102:** review security containment and lock/maintenance changes; use free offline/local checks first. Success means correct access, no lost/duplicated effects, and functioning recovery—not merely fewer advisor warnings. Any required live paid gate needs DJ's explicit approval for that run.
2. **QA parity:** approve Micro resize/window, resolve ledger drift, then retain comparable data and component versions. Confirm actual price and rollback instructions before applying.
3. **Polling experiment:** target ~192 fewer idle claims/min from chat replicas while preserving wake-driven admission latency, bounded fallback recovery and throughput. Revert if delayed/missed pickup appears.
4. **Busy sizing comparison:** record at least one genuinely active and one quiet interval before/after any optional Small resize. Compare matched routes and enough samples, not aggregate REST latency dominated by empty polls. Keep Small only for demonstrable tail/headroom benefit or an explicitly chosen precaution.
5. **Retention/index work:** coordinate with Tasker 103, prove schedules and bounded backlog drainage, then reassess QA's 192 MiB artifacts, stream HOT eligibility and semantic-search plans. Deletion requires approved retention policy; physical shrink is not the goal.

Remaining limits are explicit: no busy-period paging/CPU-burst-credit/I/O-budget history, no exact original branch migration error, no newly measured worker RTT or per-turn DB/model partition, no actual bloat/compression benchmark, and no paid gate. These do not prevent the ranked decisions; they prevent claiming a complete live regression fix or a proven production RAM bottleneck.
