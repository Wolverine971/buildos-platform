<!-- docs/research/project-pulse-unification-2026-09-27.md -->

# One project pulse: unifying loops, capture, audits, and stewards (2026-09-27)

**Status:** research and recommendation, nothing built. Asked by DJ on 2026-09-27: "research how
to make this cohesive instead of just tacking on another clock … project loops, end-of-day reviews,
agentic loops, and now stewards." Produced by a fresh-context research agent; the headline claims
below were re-checked read-only against production the same day (marked ✓).

## Recommendation

Don't give stewards a clock. Build one per-project reconciler, a **project pulse**, and make the
steward its owner: "the project loop IS the steward's clock." A trigger on the change ledger
(`onto_project_logs`) marks a project dirty and arms one debounced job per project. Every run does a
free deterministic refresh; the LLM work (today's loop lenses, the steward's narration refresh)
runs only when the accumulated change weight crosses a bar. End of day and the 14-day audit become
modes of the same job, not separate scans. Projects without a charter run the same pulse without the
persona, which is what "loop-born" means.

The pattern is a Kubernetes-style reconcile loop: level-triggered (each run reads current state, so
missed or duplicate events are harmless), one job per key, `generation` vs `observedGeneration`
cursors, and a periodic resync as a safety net.

## What exists today (findings)

- **The burst path barely runs.** ✓ Last 14 days of `project_loop_runs.trigger_reason`: end_of_day
  34, scheduled 6, burst 2, manual 1. The burst is called from 6 web routes only (tasks, documents,
  doc tree) ✓; chat and Codex writes go through the shared op gateway and never reach it, and they
  make up most writes (about 295 agent vs 128 app-route ledger rows in 30 days).
- **Projects frozen out of automated review.** ✓ `unresolvedBriefHasNoNewEvidence`
  (`apps/worker/src/workers/project-loop/enqueue.ts:65-95`) looks for newer rows in
  `project_review_signals`, which has 1 row ever (last Aug 11) ✓. So once a v2 brief is waiting
  for review, automated reviews of that project stop for good. 21 projects have a run waiting for
  review ✓.
- **Seven or more definitions of "what's new":** the loop's and audit's `finished_at` watermark
  (misses writes during a run), the audit's 500-row / 72 h / 7 d windows, the radar's cursor,
  capture's per-session watermark, the brief's fixed 24 h, the steward's 7 d, and /today's
  localStorage. On the Codex logging path the caller supplies `created_at`
  (`agent-call-project-activity.service.ts:294`), so timestamp cursors can skip rows.
- **START HERE has six writers:**
    - the snapshot job (a blind update, `start-here.service.ts:347`), which runs twice per chat close
      and never after a Codex or app edit;
    - capture;
    - edits made during a chat turn;
    - Codex;
    - loop drift fixes;
    - the radar's "Fix in chat".

    A steward refresh on its own clock would be the seventh.

- **Five LLM passes over one change, with nothing shared:** a chat document edit is read separately
  by capture, the radar, the loop lenses, the audit, and the brief. `next_step_*` has two writers
  (the close classifier and the brief), and the steward discards it as stale.
- **Self-wake:** capture's writes land in the ledger as "BuildOS chat" and count as activity.
  Membership and invite events still log as project updates scored 5 (the same class as the steward
  approve row removed in tasker 110).
- **Cost is not the problem:** all project-watching LLM spend is about $0.20–0.30 a week, against
  about $0.95 for chat. The gains are coherence and latency.

## Candidate architectures

- **A. Shared feed, independent consumers** (the steward is one more consumer). Least refactor; the
  passes and writers keep multiplying.
- **B. Project pulse owned by the steward. Recommended.**
- **C. The steward as an event-sourced LLM memory that everything else reads.** Most agentic, but it
  can't be verified or replayed and is risky on weak models. It could later become how B's review
  tier is implemented.

### B in brief

- **State:** `project_pulse(project_id, generation, pending_weight, dirty_since, last_change_at,
due_at, llm_runs_today, spend_today)` and `project_pulse_cursors(project_id, consumer,
observed_generation, observed_at, outcome, cost_usd)`. The consumers are facts, review, narration,
  radar, deep_audit, and brief_section. The existing
  `private.agentic_chat_project_context_versions.version` is already a complete "anything changed"
  generation.
- **The burst becomes the pulse's trailing debounce:**
    - facts refresh after about 2 minutes of quiet;
    - review when weight ≥ 4, after 15 minutes of quiet, with a 2-hour max wait and the existing
      30-minute cooldown.
- **End of day becomes the resync.** It enqueues a `day_close` pulse only where the review cursor
  lags the generation, or where a date crossed (overdue work, milestones). Date crossings are the one
  kind of change no write announces.
- **The audit** becomes a deep mode behind the existing `evaluateProjectAuditTrigger` policy.
- **Capture** keeps its session watermark. Its writes are tagged `origin=capture` and weighted like a
  document update. The pulse's own writes weigh 0.
- **One narration writer,** with compare-and-swap on `updated_at`. Capture feeds it the chat; the
  pulse feeds it the ledger slice and the Live Facts delta.
- **Cost stays bounded.**
    - Work scales with dirty projects, not with events or users; idle projects cost $0.
    - Tiers run free, then Jev, then the LLM.
    - Caps: 3 reviews per project per day, 1 deep audit per 14 days, and a daily dollar cap per user.
- **Don't build on Cycles v0.** It's dark, and its canary failed on 09-02. The pulse can become its
  `project_review` kind later.

## Migration path (each step ships alone)

1. **Unfreeze** (no migration):
    - the unresolved-brief gate checks `project_loop_activity` instead of `project_review_signals`;
    - loop and audit cursors use the run's `started_at`, not `finished_at`;
    - drop the duplicate snapshot enqueue in the chat close route.
2. **Ledger-fed debounce** (migration):
    - an exception-safe `AFTER INSERT` statement trigger on `onto_project_logs`, modelled on the
      radar's (`20260918200300`), scores rows from structured fields;
    - it upserts the pending `project_review_signals` row and enqueues one deduped
      `buildos_project_loop` job;
    - delete the web-route burst calls.

    Bursts then cover chat and Codex, and the unresolved-brief gate becomes correct as a side effect.

3. **Pulse state and cursors** (migration): pulse tables, a `seq` column on the ledger, and an
   `origin` tag. Replace the timestamp windows.
4. **The steward narration refresh as a consumer inside the pulse:** tasker 110's step 4, with no new
   clock. It makes paid calls and needs DJ's OK.
5. **Fold end of day and the audit into the pulse,** then delete their scans.
6. **Radar** runs from the pulse whenever documents or decisions change, from any source.
7. **Brief** reads pulse results; `next_step` becomes steward-owned.

## What this lets us measure

- **Change-to-steward latency:** from a weighted ledger row to the narration cursor catching up,
  p50/p90, split by source (chat, Codex, app).
- **Dirty age:** the oldest unabsorbed weighted change, per consumer.
- **Drift found vs missed:** "missed" means first raised by a deep audit or corrected by the user
  through a structured tool argument.
- **Self-wake rate:** should be about 0.
- **Spend per project-day by tier,** and a histogram of skip reasons.

## Risks

- **Ledger completeness:** a write that doesn't log never wakes the pulse, and Codex logging is
  best-effort. Keep `project_loop_activity` as the day-close fallback until a fitness test proves
  every write path logs.
- **More AI Inbox items** once bursts cover chat and Codex. Needs DJ's veto on the caps.
- **Locking:** the pulse upsert holds a per-project row lock until commit. Rehearse with
  `--role-probe`, given tasker 105's deadlock history.
- **Unverified:** triggers that exist only in the live DB; runtime skip reasons (not stored).

Measurement plan for the steward itself: `docs/research/steward-measurement-plan-2026-09-27.md`.
