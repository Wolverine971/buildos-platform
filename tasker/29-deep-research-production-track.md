<!-- tasker/29-deep-research-production-track.md -->

# 29 — Deep Research: V0.1 → production track

**Consolidated 2026-07-24** from taskers 29 (cost ledger), 30 (evidence + report persistence),
31 (deploy + reconciliation), and 33 (evaluation + provider bakeoff). The UI/chat surface stays
separate in [32](32-deep-research-chat-tool-and-progress-ui.md).

**Status: PARKED, code-complete-locally, not deployed.** Nothing has moved on this track since
2026-07-22. Every track below reached the same wall: the runtime is proven against production data
in scoped smokes, but **the code was never deployed, reconciliation was never enabled, and the
quality gate failed** — so V0.1 cannot be exposed to users.

**Authoritative background:** `apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md`.
Implementation detail for everything marked built lives there and in git history.

---

## The one-paragraph read

The money side is genuinely solid: 55/55 paid attempts terminal (50 settled, 5 released), the
`agent_run_cost_entries` ledger holds a durable reservation before every dispatch, root/leaf budgets
are enforced atomically in the DB, and the hardening migration closed the prod exposure (`anon` /
`authenticated` denied on every cost RPC, the ledger, and `queue_deep_research_synthesis`). What
blocks rollout is **quality, not safety**: the final clean batch passed the runtime envelope and
failed the output gate — fan-out stayed `partial` with one synthesis returning the literal
placeholder `...`, while the cheaper direct-single path cited candidates it had never visited and
confidently asserted a false claim about OpenRouter's `max_price`. **There is no defensible
architecture winner yet.** Do not run another ad-hoc batch; build the corpus/scorer first.

---

## Track A — Cost ledger & hard budgets (was 29)

**Built and proven.** Durable reservation/settlement ledger with atomic root+leaf enforcement,
idempotent duplicate handling, lease-fenced reconciliation claims, OpenRouter `total_cost` lookup by
generation id, conservative treatment of missing usage, and blocked direct table writes. 17
disposable-PostgreSQL cases. Crash-redelivery accounting fixed: only a genuine retry ordinal may
reclaim a `running` row, and it reconstructs usage from the ledger.

**Open:**

- [ ] Deploy, then real-provider smoke the OpenRouter generation lookup.
- [ ] Resolve the historical unresolved exposure row.
- [ ] Determine authoritative Moonshot + Tavily lookup/audit paths; retain the reservation where no
      per-request proof exists.
- [ ] Regenerate database types (blocked on a Supabase management access token — same blocker as
      [35](35-agentic-chat-gmail-tools.md) item 4).
- [ ] **WP-3 quotas:** per-root max cost, per-user daily cost + run count, max paid searches per
      child/root, global + provider circuit breakers. Atomic, pre-dispatch, DB-authoritative.
- [ ] **WP-4 price registry:** versioned model/tool pricing, price version recorded per reservation,
      scheduled drift check, fail closed on unknown models.
- [ ] Alerting on actual-above-reservation and unknown-provider-price. The read-only operator report
      is built and found zero aged unresolved rows on first run; it needs delivery/escalation policy.
- [ ] Remaining abuse tests: killed worker after provider acceptance in a live environment,
      duplicate queue delivery across a real deployed lease, price change mid-run, cancellation
      during an in-flight call, live scheduled-reconciliation idempotency.

## Track B — Evidence contracts & report persistence (was 30)

**Built and live-proved through WP-2.** Versioned typed child packets (claims typed
`fact | inference | opinion`, source records, bounded claim-to-source links, contradictions,
limitations, coverage, confidence). Source URLs are accepted only when the same child durably
recorded a successful `util.web.visit`; redirects canonicalize without losing aliases; excerpts are
verified against fetched text. Fabricated ids / unvisited URLs / unsupported factual claims cannot
produce a `completed` child. Token envelope fixed (20k child target, 22k ceiling, forced final
evidence turn, 2,048/4,096 output caps) after all four children initially blew through before
`submit_result`.

**Open:**

- [ ] **WP-3 citation-aware synthesis** — the gap the smoke exposed. The direct-single baseline and
      the root report still need citation resolution against durable visits plus explicit
      objective-coverage checks. Fan-out already fails closed; single does not.
- [ ] **WP-4 durable report artifact** — versioned Deep Research Report linked to root/child runs,
      originating chat/project/message, packet versions, cost metrics, status/confidence/open
      questions. Decide: BuildOS document subtype, dedicated table, or both. Rerun creates a version.
- [ ] **WP-5 retrieval/export** — reopen a report, list sources, claim → evidence jump, Markdown
      export, attach conclusions to project context without copying raw web content.
- [ ] Retention + legacy packet handling.

## Track C — Deploy, reconciliation & live smoke (was 31)

**Proven locally against production data; never deployed.** The clean scoped smoke passed
runtime/cost/heartbeat/release behavior. Two live defects found during recovery and fixed locally:
an unread redirect response could hang SSRF-safe web visit awaiting `dispatcher.close()` (now
destroyed per hop), and a queue redelivery could skip a still-`running` Agent Run. The shared queue
now heartbeats a processing claim at one-third of its stalled timeout (bounded 5–60s) and fences
updates by `status='processing'` + exact `processing_token`.

The stranded-run reconciler is built: DB lease claims, bounded attempts/backoff, OpenRouter lookup,
operator routing for unsupported providers, five-minute scheduler behind
`AGENT_RUN_COST_RECONCILIATION_ENABLED` (currently `false` in `apps/worker/.env.example`). The
non-cost sweep covers jobless queued/running continuations, roots waiting on settled children,
partial dispatch, dead synthesis leases, terminal parents with non-terminal children, and
wall-clock-bounded terminalization.

**Open — this is the gating track:**

- [ ] **Deploy the code.** Everything above is local.
- [ ] Enable and observe `AGENT_RUN_COST_RECONCILIATION_ENABLED`.
- [ ] Deployed proof of: overlapping sweeps, worker restart, duplicate queue delivery, child
      completion races, parent cancellation, partial dispatch.
- [ ] Rollback rehearsal + documented kill switch.
- [ ] Guarded rollout behind a flag with per-user allowlist; dashboards for
      status/latency/cost/failures; alerts for stranded runs and budget violations.

## Track D — Evaluation & provider bakeoff (was 33)

**Not started.** This is the track that unblocks user exposure.

- [ ] **WP-1 corpus** — versioned set spanning current-fact research, ambiguous strategy, technical
      comparison, contradictory sources, sparse evidence, adversarial/prompt-injected pages, and
      questions that should decline or ask for clarification. Project-scoped **and** global.
- [ ] **WP-2 automated metrics** — source validity, citation entailment, claim coverage,
      contradiction handling, unsupported-claim rate, freshness, duplicate-source rate,
      tool/permission violations, completion/partial rate, latency, tokens, Tavily credits, cost.
- [ ] **WP-3 human rubric** — blind review of decision usefulness, completeness, calibration,
      structure, honesty of uncertainty. Reviewers must inspect cited evidence, not grade prose.
- [ ] **WP-4 architecture bakeoff** — coordinator+2 children (V0.1) vs sequential
      search/reason/synthesize vs different planner/synthesizer reasoning levels vs basic/advanced
      Tavily and alternative providers. Constant dataset and spend ceiling; track marginal quality
      per dollar and p50/p95 latency.
- [ ] **WP-5 regression gate** — offline suite + tiny-capped live canary, with written maximums for
      unsupported claims, invalid citations, permission violations, p95 cost, p95 latency. A
      provider/model route change reruns the gate.

---

## Recommended order if this track restarts

1. **Track C deploy + reconciliation enable** — the built safety work is worth nothing undeployed,
   and everything else needs a deployed environment to prove against.
2. **Track B WP-3** — apply the provenance gate to the single/root report path so both
   architectures are honest before they're compared.
3. **Track D WP-1/WP-2** — corpus + scorer, then and only then rerun a batch.
4. Track A quotas/registry and Track B WP-4/WP-5 in parallel once rollout is actually near.

## Definition of done (whole track)

- Every paid request has a durable reservation before dispatch and exactly one terminal settlement;
  root totals equal the sum of leaf settlements and reconcile against provider records.
- Unknown pricing fails closed; daily/global breakers are operable without a deploy.
- A report can be audited conclusion → claim → captured source; fabricated citations are caught
  before `completed`; reports are versioned and survive restarts.
- Every enumerated stranded state self-recovers or terminates explicitly; duplicate delivery cannot
  duplicate children, paid calls, or final chat messages.
- The chosen architecture beats or justifies its cost against the sequential baseline on a recorded
  eval, and no route change can reach broad rollout without one.
