<!-- tasker/28-loop-inbox-freshness.md -->

# 28 - Project Review/Inbox Freshness: Attention Budget + Rotation

**Created 2026-07-18.** Owner: product/engineering agent.
**Type:** audit + phased build plan. Supersedes the analysis in `loop-freshness.md` (root, DJ's
brain dump + a prior agent's answer — keep as input, don't execute from it; several of its claims
are stale or wrong, see §2).

## The problem, in one paragraph

Project Reviews are live and nightly. Every active project gets a light review pass (~daily,
end-of-day local time) and scheduled Complete Project Audits (04:00 cron + triggers). Each pass inserts new
`project_suggestions` and syncs them into `inbox_items` — but **nothing ever retires the previous
pass's still-pending suggestions**, every source shares one uniform 30-day TTL, and the badge
counts raw rows. Result on 2026-07-18: **50 pending inbox items** across 10 projects (11 on one
project), items from 7/07 still pending, and near-duplicate paraphrases sitting side by side. DJ
decides ~items daily (64 decided in the recent window) but producers outpace him. The fix is a
deterministic freshness/rotation layer plus a per-project attention budget — not primarily an
LLM reviewer (that's Phase 2 polish, not the containment).

## 1. Verified system map (2026-07-18)

Two Project Review job types in `apps/worker/src/workers/project-loop/projectLoopWorker.ts`:

- **Light review pass** (`processProjectLoopJob`, :2528) — generators for `doc_outdated`,
  `task_conflict`, `doc_org`, `drift`; concatenated and capped at `MAX_SUGGESTIONS = 25` (:79,
  enforced :2783). Cost cap $0.35.
- **Complete audit** (`processCompleteProjectAuditJob`, :2272) — writes `project_audits` +
  ≤ `MAX_AUDIT_CHILD_SUGGESTIONS = 8` children of kind `audit_recommendation` (:80, :2022),
  linked via `project_audit_suggestions`.

Inbox: `inbox_items` (migration `20260624010000`) is a **denormalized read model** over
`project_suggestions` / `project_audits` / `agent_runs` / `calendar_project_suggestions`.
All writes go through `packages/shared-agent-ops/src/inbox-index.ts` (`syncInboxItemFor*`,
upsert on `UNIQUE (source_type, source_ref_id)`). Key mechanics:

- **TTL**: single `INBOX_REVIEW_EXPIRY_MS = 30d` for every source (inbox-index.ts:47).
- **No cron sweep**: expiry/unsnooze/deleted-project checks run only at read time inside
  `listInboxItems`/`countInboxItems` (`inbox.service.ts` `reconcileInboxLifecycle` :391).
- **Backfill on every read**: `backfillVisibleSourceRows` (`inbox.service.ts:993`) re-syncs any
  open source row missing an inbox row (≤200/read). Any producer-side filtering that isn't
  mirrored in the shared sync layer gets resurrected here.
- **Dedup exists but is partial**: `suggestionSuppressionKey`
  (`apps/worker/src/workers/project-loop/generators.ts:339`) keys on operation-target entity ids;
  60-day lookback against `['pending','delegated','addressed','rejected','applied']`
  (projectLoopWorker.ts:88-99, applied :2782-2794). **Returns `null` for `drift` and
  `audit_recommendation`** — those kinds have zero deterministic dedup (prompt-only).
- **Supersede exists but only for audits + failed passes**: `supersedeOlderReadyAudits` (:2142)
  retires the previous audit + its pending children when a new audit goes ready;
  `supersedePendingSuggestionsForFailedRun` (:444). **Light-review suggestions are never
  superseded across passes — they accumulate.**
- **Scheduling has no pending-awareness**: `enqueueProjectLoop` guards on active runs and a
  30-min cooldown, never on how many undecided suggestions already exist.
- **Audit surface has flip-flopped 3×**: children as individual items (7/03, `399d9a11`) →
  single parent packet, children grouped/expired (7/07, `eafbdad7` + migration
  `20260707060000`) → children individual again, parent hidden (7/15, `88b9d39d`;
  `mapProjectAuditToInboxItem` returns null for `ready`, parent marked
  `recommendations_indexed`/expired at inbox-index.ts:616-629). The 7/07 packet design was
  likely reverted because packet cards are chat-first (direct decide disabled in
  `loadDecisionCapabilities`, inbox.service.ts:821-827) — i.e. the packet was un-actionable.
- **Badge = raw rows**: `aiInboxCount.store.ts` polls `/api/inbox/count?status=pending`.

Live DB evidence (2026-07-18): 50 pending (48 `project_suggestion`, 2 `project_audit` — the
latter are stale `ready`-status rows written under pre-7/15 code; current reconcile will expire
them on next read). Worst projects: 11, 9, 8 pending. Oldest pendings from 7/07 (`expires_at`
8/06). Same-day paraphrase dupes observed ("Expand and finalize project documentation" vs
"Expand or consolidate project documentation."). Zero pending calendar items right now (2
expired, 3 decided) — calendar staleness is real but not the current fire.

## 2. Audit of the prior agent's analysis (`loop-freshness.md`)

**Right (verified):** caps 25/≤8; audit children synced individually (:2120-2132); parent packet
hidden (:616); backfill resurrection risk (:1029); uniform 30d TTL; badge counts raw rows;
calendar has no event-lifecycle revalidation; overall "admission layer + budgets + per-source
TTL" direction.

**Wrong or stale:**

1. **Its #1 priority ("fix the audit-child regression, restore one packet per project") is a
   trap.** That is literally the 7/07 design that was deliberately reverted on 7/15 because the
   packet card couldn't be actioned. Re-reverting without fixing packet actionability recreates
   the "non-actionable, stale audit packet" it itself observed. Also, today only 2 of 50 pending
   items are audit packets — audit fan-out is not the live fire.
2. **It missed the dominant mechanism: cross-pass accumulation of light-review suggestions.**
   Nightly passes + no supersede + 30d TTL is the arithmetic that produced 35→50. Its plan has no
   rotation concept.
3. **It missed the existing machinery**: entity-keyed suppression (and its `drift`/
   `audit_recommendation` null-key hole), audit supersede, failed-run supersede, the approve-time
   freshness guard (`freshness_state: 'changed'` in `project-suggestion-actions.service.ts`).
   Phase 1 extends these; it does not need the new "candidate ledger" table it proposed —
   `project_suggestions` **is** the candidate ledger; `inbox_items` is the admission surface.
   What's missing is policy between them, enforced where backfill can't bypass it.
4. **It missed that expiry is read-time only** (no sweep) and that scheduling has no
   pending-count awareness.
5. Counts stale (28 → 50); source mix shifted from audit children to accumulated review findings.

## 3. Target model

```
Generators (review pass / audit / calendar / agent runs)
   → project_suggestions etc.        (candidate ledger — already exists)
   → ROTATION at run completion      (new: each run refreshes, not appends)
   → ADMISSION in shared sync layer  (new: per-project budget, per-source TTL)
   → inbox_items pending             (the CEO surface: few, fresh, deduped)
   → Phase 2: synthesis/broker       (merge overlaps, global top-3)
```

Invariants after Phase 1:

- A light-review finding older than the project's last two successful passes cannot sit `pending`.
- No project shows more than **3** pending inbox items; overflow is `deferred`, auto-promoted
  when a slot frees.
- Every source type has its own TTL; calendar ≤ 7d.
- Backfill and worker sync produce identical admission results (policy lives in
  `shared-agent-ops`, not the producer).
- Badge number = admitted items (which is now ≤ 3/project by construction).

## 4. Phase 1 — deterministic containment (build now)

No LLM calls anywhere in this phase. All in `shared-agent-ops` + worker + one migration.

### WP-1: Pass rotation for light-review suggestions

At successful light-review completion (where suggestions are inserted, projectLoopWorker.ts):

1. Load the project's still-`pending` light-review suggestions (`doc_org`, `doc_outdated`,
   `drift`, `task_conflict` — NOT `audit_recommendation`, audits already rotate).
2. A new proposal suppressed by an existing pending row = **re-confirmation**: update that row's
   `updated_at` (and new column `last_confirmed_run_id`), keep it pending, refresh inbox row.
3. Pending rows **not** re-confirmed by this run AND older than the grace window (72h — survives
   one nondeterministic-LLM miss) → `status: 'superseded'`, result reason
   `not_reconfirmed_by_latest_run`, re-sync inbox rows (existing pattern from
   `supersedePendingSuggestionsForFailedRun`).
4. Never rotate rows the user has touched: inbox status `deciding`/`snoozed`, or suggestion
   status beyond `pending`.

`drift` has no suppression key (see WP-2) — until WP-2 lands, drift rotates purely by age:
a successful run supersedes pending drift items from runs older than the grace window.

### WP-2: Close the suppression-key hole

In `generators.ts` `suggestionSuppressionKey`: for kinds with empty operations (`drift`,
`audit_recommendation`), derive the key from **`evidence_refs` entity ids** (sorted, deduped),
falling back to normalized-title tokens (lowercase, stopwords stripped, sorted) when no evidence
refs exist. Keys become `drift:ev:<ids>` / `<kind>:t:<tokens>` etc. This makes rotation
re-confirmation (WP-1) work for findings. **Build decision:** keys stay kind-namespaced — no
cross-kind aliasing (`doc_outdated` ↔ `audit_recommendation` on the same doc), because whether
two cross-kind items are "the same ask" is semantic; that merging belongs to Phase 2 synthesis,
not a deterministic key.

### WP-3: Per-source TTLs

Replace the single `INBOX_REVIEW_EXPIRY_MS` in `inbox-index.ts` with a per-source table applied
in `reviewExpiresAt`:

| source_type                                   | TTL                                             |
| --------------------------------------------- | ----------------------------------------------- |
| `calendar_suggestion`                         | 7d (Phase 2 adds event-date awareness)          |
| `project_suggestion` (light-review kinds)     | 7d (rotation usually beats this)                |
| `project_suggestion` (`audit_recommendation`) | 14d (audit supersede usually beats this)        |
| `project_audit`                               | 14d                                             |
| `agent_run`                                   | 14d (user-initiated work product, give it room) |

Expiry stays read-time (badge polls make reads frequent enough); no cron needed yet.

### WP-4: Per-project attention budget (admission layer)

New module in `packages/shared-agent-ops` (e.g. `inbox-admission.ts`), invoked from both the
worker sync paths and web `reconcileInboxLifecycle`/backfill so it cannot be bypassed:

- Migration: add `'deferred'` to `inbox_items.status` CHECK.
- Policy: per project (audience `project_members`), max **3** `pending` rows. Overflow →
  `deferred`, ranked by (risk_tier desc, created_at desc). When a pending item is decided /
  expired / superseded, promote the top deferred row.
- `listInboxItems` / `countInboxItems` exclude `deferred` by default (opt-in filter for a
  "show deferred" affordance later).
- Audit children count toward the same budget — which resolves the packet-vs-children question
  without another flip-flop: children stay individually actionable (the 7/15 fix stands), but at
  most 3 surface; the rest defer. Parent packet stays hidden.

### WP-5: One-time backlog cleanup

**Build finding: no script needed — the cleanup is emergent.** Once the code ships:

1. The shortened TTLs retro-apply on the next inbox read (read-time reconcile re-syncs every
   visible row; `upsertInboxItem` applies the incoming expiry and `shouldExpireIncoming` flips
   past-due rows) — the 7/07 and pre-7/11 backlog expires on the first open.
2. Tonight's nightly runs rotate every unconfirmed pending older than 72h.
3. The budget pass defers overflow beyond 3/project on the same read.
4. The 2 stale `ready` audit packet rows expire via the existing packet-hide reconcile.

So "cleanup" = **apply the migration, deploy, open the inbox once, verify counts**.

### WP-6: Badge semantics

With WP-4 the count is structurally small; keep `count(pending)` but have the dashboard modal
title show `N items · K projects`. No store rewrite needed in Phase 1.

**Phase 1 verification:** worker tests for rotation (confirm/rotate/grace/user-touched),
admission tests (cap, promote-on-decide, backfill parity), TTL mapper tests; live smoke: run a
manual Project Review on a flooded project, watch pendings rotate instead of accumulate.

## 5. Phase 2 — synthesis + review layer (LLM-assisted)

The per-project synthesis work has been extracted into
[`34-project-review-holistic-synthesis.md`](34-project-review-holistic-synthesis.md) so the
holistic review outcome does not remain buried behind Phase 1 containment. The global
cross-project broker remains in this tracker.

- **Per-project synthesis pass (task 34)** after a materially useful review pass; attention-budget
  overflow is one required trigger. Cluster
  overlapping candidates (cross-kind), merge into a single decision item with the members as
  evidence; disposition recorded per candidate (`merged_into:<id>`). Reuses the review pass's existing
  LLM budget/cost-cap plumbing.
- **Global attention broker**: dashboard shows top-3 packets across projects (rank by
  urgency/importance separated from risk_tier); the rest reachable per-project. This is where
  DJ's "you don't ping the CEO with a million small details" lands globally.
- **Calendar event-lifecycle revalidation**: ✅ **BUILT 2026-07-18 (second pass, uncommitted)**
  — `mapCalendarSuggestionToInboxItem` now caps `expires_at` at the suggestion's
  `event_patterns.end_date` (falling back to `start_date`) + 48h grace (date-only values parse
  as UTC midnight; grace covers the full day in any timezone). Enforced by the existing
  read-time reconcile — a passed event window expires on the next badge poll. Tests in
  `inboxIndex.test.ts`. Remaining refinement (later): event _cancellation_ detection would
  need a live Google Calendar lookup — deferred; TTL + window expiry cover the common case.
- **Review trigger**: crossing the budget triggers a compaction pass (DJ's ">3 items → review
  layer kicks in" framing) rather than a scheduled job.
- LLM merges are reversible (members preserved); **LLM never hard-dismisses** — deterministic
  rules only (Phase 1) may do that.

## 6. Phase 3 — measurement

Telemetry (extend existing loop telemetry): promoted/deferred/rotated/re-confirmed counts per
run, suppression hit rates (already counted: `suppressedCount`, `repeatedAfterDismissalCount`),
time-from-admission-to-decision, dismissal ratio by kind, deferred-promotion rate. Targets:
median pending ≤ 3/project, zero pendings older than their TTL, dismissal rate trending down
(quality proxy), rotation restore-rate near zero (rotation isn't killing wanted items).

## 7. Phase 4 — preference learning

Feed decision history (`user_feedback`, `dismissed_without_note`, addressed notes — already
captured and already flowing into prior-decision memory, `PRIOR_DECISION_LOOKBACK_DAYS = 60`)
back into generator prompts + broker ranking. Only after Phase 3 gives a baseline.

## 8. Decisions for DJ (defaults chosen, building with them)

1. **Per-project budget = 3** (his stated number). Global hard cap deferred to Phase 2 broker —
   Phase 1 keeps per-project caps only; with ~10 active projects worst case is ~30 but
   realistically rotation keeps it far lower. If that's still too many, Phase 2's top-3
   dashboard broker is the real answer, not a cruder cap.
2. **Rotation grace = 72h** (one missed re-confirmation survives; two don't).
3. **Audit surface stays children-first** (7/15 model) + budget, rather than re-reverting to
   packets. Revisit only with packet actionability fixed.
4. Suggestions/audit history remain fully browsable in the project surfaces; rotation/deferral
   never deletes source rows.

## Build status (2026-07-18, uncommitted)

- [x] **WP-1 rotation** — `rotateUnconfirmedPendingSuggestions` in `projectLoopWorker.ts` +
      call after the light-run insert block; re-confirm bumps `updated_at`; 72h grace; skips
      user-engaged (`deciding`/`snoozed`) rows and cost-cap-skipped kinds
      (`GENERATOR_LABEL_TO_KIND`); telemetry fields `reconfirmed_count` / `rotated_out_count` on
      `project_suggestion_generated`.
- [x] **WP-2 suppression keys** — `suggestionSuppressionKey` evidence/title fallbacks
      (`generators.ts`); `loadExistingSuggestionKeys` selects + passes `evidence_refs, title`.
- [x] **WP-3 per-source TTLs** — `INBOX_REVIEW_EXPIRY_MS_BY_SOURCE` in `inbox-index.ts`
      (7d review findings + calendar, 14d agent_run + audit + audit children); project_suggestion
      expiry basis is `updated_at ?? created_at` so re-confirmation extends the window.
- [x] **WP-4 admission budget** — migration `20260718010000_inbox_items_deferred_status.sql`
      ('deferred' in CHECK); `applyProjectAttentionBudget` + `PROJECT_ATTENTION_BUDGET = 3` in
      `inbox-index.ts`; `shouldPreserveDeferred` in upsert (re-sync can't leak past budget);
      worker applies after light runs + audits; web applies in `listInboxItems` +
      `reconcileVisibleInboxLifecycle` (count path) via `applyAttentionBudgetForProjects`, which
      only touches over-budget or deferred-holding projects; deferred rows excluded from
      pending counts automatically (`.eq status` filters).
- [x] **WP-5 — EXECUTED against live DB 2026-07-18** (migration applied by DJ, then cleanup
      script ran the shared-package sync + budget): **50 pending → 25 pending + 23 deferred**,
      every project ≤ 3, both stale audit packets expired, 0 errors. Note: the 7/07 rows were
      deferred rather than TTL-expired — their source `updated_at` is recent, and the expiry basis
      is `updated_at ?? created_at`; rotation retires them post-deploy. TTL is the backstop, not
      the primary lifecycle, as designed.
- [x] **WP-6 badge copy** — modal header now appends "· K projects" when items span more than
      one project (`DashboardInboxModal.svelte`, `pendingProjectCount`).
- [x] Tests: worker 366/366 (incl. new `inboxAttentionBudget.test.ts`, suppression fallback
      cases, updated `inboxIndex.test.ts` TTL expectations); web inbox tests 28/28; typecheck
      green on shared-agent-ops, worker (tsgo), web (svelte-check).
- [ ] Live smoke: manual review pass on a flooded project (e.g. `2dcdb7d3`, 11 pending) →
      verify rotation supersedes, budget defers to 3, badge drops.

**Ship log:**

- Migration `20260718010000` applied to prod 2026-07-18 (DJ). ✅
- Phase 1 code committed in `292b61d8` + tasker doc in `2388613c`, pushed 2026-07-18 —
  Vercel/Railway deploys triggered. ✅ Post-commit verify: worker 366/366, live inbox held
  (25 pending + 23 deferred, no project over 3).
- WP-5 cleanup executed against live DB 2026-07-18 (see above). ✅
- Calendar event-window expiry built 2026-07-18 second pass (uncommitted): worker 369/369,
  svelte-check clean. ⏳ needs commit.
- **Next check-back:** after the first post-deploy nightly (2026-07-19), confirm rotation via
  `reconfirmed_count` / `rotated_out_count` on the `project_suggestion_generated` PostHog
  event (or `queue_jobs` logs), and confirm pending stays ≤3/project without manual cleanup.

**⚠️ Until the web + worker deploy ships this code:**

- The DEPLOYED web app's read-time reconcile predates `shouldPreserveDeferred` — opening the
  inbox on prod will flip today's 23 `deferred` rows back to `pending` (backfill re-syncs open
  sources and the old upsert has no deferred preservation). Self-heals after deploy; harmless
  but the badge count regresses.
- Tonight's prod worker runs OLD code: no rotation, no post-pass budget. New suggestions land
  as pending and wait for a NEW-code read to be budgeted.
  → **Commit + deploy is the single remaining step to make Phase 1 hold on its own.**
