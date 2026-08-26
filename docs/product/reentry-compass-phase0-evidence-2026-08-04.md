<!-- docs/product/reentry-compass-phase0-evidence-2026-08-04.md -->

# Re-entry Compass — Phase 0 Evidence Report

**Date:** 2026-08-04
**Tasker:** [43 — Re-entry Compass experiment](../../tasker/43-reentry-compass-experiment.md)
**Phase:** 0 — baseline, routing, and truth audit (offline; no production UI changed, no LLM in any assembly path)
**Verdict:** GATE NOT PASSED — see §6. Recommendation: **park the Compass treatment; ship the two preconditions instead** (§8).

---

## 1. One-page DJ brief

**What we asked:** can BuildOS assemble a truthful, deterministic "pick up where you left off" card from stored project memory, and is there a population to test it on?

**What we found:**

1. **Nobody returns to `/today`.** Every authenticated return path — password login, both Google OAuth callbacks, signup, re-visiting `/onboarding` — still lands on `/dashboard` (tasker/27 WP-1 was never done, and its file list misses 5 additional live `/dashboard` defaults). `/today` is only reached from the bare domain, the nav tab, and fresh onboarding. Any `/today` experiment today measures the wrong population.
2. **The eligible population is ~1 user.** Of 108 external users: 26 completed onboarding, 14 ever owned a live project, **13 of those 14 have been gone more than 30 days**, and the single user inside the 3–30-day window fails the mutation-history requirement. Phase 2's "40 eligible episodes in 8 weeks" is off by an order of magnitude; even Phase 1's 8–12-user moderated study would have to recruit from deep-dormant (40–130 days) users.
3. **The card's marquee row has zero supply.** "Since you were away" was empty in **all 23 external packets** — no agent, collaborator, or system mutation occurred during any real user's absence, ever. The "AI worked while you were away" premise currently has no instances in production.
4. **Assembly is truthful but stale, and selection is wrong 4 times in 10.** No invented claims survived adjudication by two independent blind scorers (one raw flag traced to a 401 ms as-of boundary artifact in the offline harness). But only 61% of packets picked the right project (recency-only ranking repeatedly leads with empty or dead projects while the open work sits in a sibling), and the dominant truth failure is **temporal**: AI-written `next_step_short` values frozen months ago ("plan tomorrow's tasks" written in May, shown in August). Grounded ≠ trustworthy. Mean scorer usefulness: ~2.95/5.
5. **Preconditions from the tasker are all confirmed missing:** no server-side session signal (`/today`'s anchor is localStorage; `users.last_visit` is consent-gated and mutable), no experiment storage of any kind, PostHog feature flags hard-disabled in code, `feature_flags` table has **zero rows**, and PostHog prod ingestion is still unverified (needs your dashboard login — 5 minutes).

**The decision this buys:** don't build the card. Ship (a) the tasker/27 routing flip so returns actually land on `/today`, and (b) a durable authenticated-session signal (W1-lite). Those two are prerequisites for _any_ version of this experiment, they're cheap, and in 4–8 weeks they produce the return-episode data this experiment needed and didn't have. Full reasoning in §8.

---

## 2. What was run (reproducibility)

All read-only probes and the packet generator live in the session scratchpad (`probe1-recon.mjs`, `probe2-episodes.mjs`, `probe3-eligibility.mjs`, `generate-packets.mjs`, `render-packets.mjs`) and run against prod via the service-role key from `apps/web/.env`. Raw packet renders contain real user project text and are **deliberately not committed**; this report carries only aggregates, IDs, and DJ-owned (dogfood) examples.

Versioned operationalizations (`phase0-v1`):

- **User-attributed mutation:** `onto_project_logs` row with `change_source ∈ {chat, api, brain_dump, form, NULL}` (i.e. not `agent_call`) and non-null `changed_by`. Caveat: `change_source` defaults to `'api'` when the `X-Change-Source` header is absent, and logging is fire-and-forget with swallowed errors, so the ledger under-counts and occasionally mis-attributes.
- **User activity event:** user-attributed mutation OR a `role='user'` chat message.
- **Return episode:** ≥72 h gap between consecutive activity events for a user; episode t₀ = first event after the gap. **Known bias:** with no session signal, an episode is only observable when the user _acts_, so t₀ conditions on action and overstates the true advance rate measured from arrival.
- **Verified advance:** user-attributed mutation with `entity_type ∈ {task, project, goal, plan, document, milestone, risk, output}` (excludes `edge`, `event`, membership noise).
- **Internal users:** `is_admin` or DJ/test address patterns; 6 of 114.

---

## 3. Baseline numbers (all of production history)

Scale context: 114 users, 111 live `onto_projects`, 2,436 `onto_project_logs` rows, 29 users with any recorded activity, 19 with any mutation.

### Return episodes (≥72 h gap)

| Cohort                        | Episodes | Users | Advance ≤30 min | Rate  | Anchor was itself the advance | Chat-anchored rate | RMST to advance |
| ----------------------------- | -------- | ----- | --------------- | ----- | ----------------------------- | ------------------ | --------------- |
| External, all gaps            | 12       | 4     | 10              | 0.833 | 9/12                          | 0.333 (n=3)        | 5.0 min         |
| External, 3–30 d (doc window) | 9        | 2     | 7               | 0.778 | 6/9                           | 0.333 (n=3)        | 6.7 min         |
| Internal dogfood              | 17       | 2     | 7               | 0.412 | 4/17                          | 0.167 (n=12)       | 18.8 min        |

**Read this table as instrumentation evidence, not product truth.** The 0.833 is dominated by anchor-is-advance episodes (the first observable event after a gap is usually itself a mutation, because mutations are most of what we can observe). The chat-anchored subset — the closest available proxy for "arrived, then acted" — is 0.333. The honest conclusion: **the control's true 30-minute advance rate is unmeasurable until a session signal exists.** The tasker's Phase 0 kill-check ("does the control already advance within 5 minutes for most eligible returns?") is therefore **indeterminate by instrument absence**, not answered.

### Eligibility funnel (as of 2026-08-04)

| Criterion (cumulative)                                   | External users                 |
| -------------------------------------------------------- | ------------------------------ |
| External users                                           | 108                            |
| + onboarding completed                                   | 26                             |
| + owns a live project                                    | 14                             |
| + absent 72 h–30 d                                       | **1** (13 more are >30 d gone) |
| + project ≥3 d old with ≥3 user mutations across ≥2 days | 0                              |
| + resumption cue exists                                  | **0**                          |

Two structural causes: (a) most projects are created and mutated in a **single session** (onboarding braindump pattern), so the "across ≥2 distinct days" requirement fails almost everywhere; (b) the ledger only begins 2025-12, so older projects show zero mutations (left-censoring).

---

## 4. Source-of-truth audit (grounding contract feasibility)

Full details in the audit transcripts; deltas that change the experiment design:

| Grounding row           | Source status                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where it stands         | `status.now` is **parsed markdown** inside `onto_documents.content` managed fences, refreshed only by chat-session classification / instantiate / calendar-analysis (15-min TTL). **Only 17 of 111 live projects have a rendered `Now` line** (74 have the region, mostly placeholder). REST-only users never get a refresh. Authored-orientation fallback works. |
| Since you were away     | `onto_project_logs` is append-only and read-path-proven (`what-changed.service.ts`), but application-level, fire-and-forget, with a confirmed silent-drop case (`change_source='rpc'` on invite-accept violates the CHECK constraint). Absence of a log ≠ absence of a change.                                                                                    |
| Blocked                 | `blocked` is a real enum value but **functionally inert** — no reason, no since-when, no blocker entity; every consumer treats it as "open". 17 blocked + 177 overdue tasks exist. **Three conflicting overdue definitions** coexist (`< now` ×2 vs `< dayStart`).                                                                                                |
| Next move               | `next_step_short` exists and is displayable, but `next_step_updated_at` has **no staleness invalidation** — nothing bumps or clears it when underlying tasks change. `next_step_source` is unconstrained text. Display precedence in the shipped card: managed `status.nextStep` → `next_step_short`.                                                             |
| Freshness               | Two clocks (doc `updated_at` = authored, managed `refreshedAt` = snapshot), correctly separated by a DB trigger. Usable.                                                                                                                                                                                                                                          |
| Session/"you were away" | **No server-side source exists.** `/today` anchor = localStorage (overwritten by the act of reading it); `users.last_visit` = consent-gated, day-throttled, device-local, mutable — the codebase itself deprecated it for reactivation math.                                                                                                                      |
| Assignment substrate    | No experiment tables exist; `feature_flags` has 0 rows, no migration file, RLS unverified; PostHog flags disabled via `advanced_disable_feature_flags: true`. Closest reusable shape: `retargeting_founder_pilot` frozen-cohort + holdout + metrics RPC.                                                                                                          |

Routing (Phase 0 work item 1): **fail.** All auth/OAuth/signup/onboarding-revisit paths land on `/dashboard`; `/dashboard` never redirects to `/today`; `/today` itself links back out to the "Full dashboard". tasker/27 WP-0/WP-2 are genuinely shipped (readiness-aware `/today`, `/` landing guard) but its WP-1 file list is stale — 5 additional live `/dashboard` defaults exist beyond the 9 listed, and 1 listed file is dead code. tasker/38's PostHog-ingestion item is the same open item as this tasker's Phase 0 step 2; every tasker/38 checkbox remains open.

PostHog ingestion: **unverifiable from this session** (public capture key only; dashboard behind login). DJ path: log into PostHog → Activity → filter `loop_surface_shown`, `signup` — if prod events from the last 7 days appear, wiring ⇒ ingestion is confirmed.

---

## 5. The 20-packet truth audit

Generated **29 packets** with the deterministic assembler (`phase0-v1`, zero LLM calls): 14 current-dormant external, 9 replayed historical external return episodes, 6 internal dogfood replays. 23 external ≥ the required 20. Deviation from the tasker, documented: the strict eligibility contract yields **zero** packet-eligible users (§3), so packets cover all real dormant external users (3–130 d absent) and replayed real return episodes; replay packets omit `Where it stands` (Start Here state is not reconstructible retroactively) and task-state rows carry a not-time-traveled caveat.

Row population, external packets (n=23):

| Row                       | Populated | Notes                                                                                |
| ------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Where it stands           | 4         | replay auto-omits (9); of 14 current: 1 managed `status.now`, 3 authored-orientation |
| Since you were away       | **0**     | zero third-party/agent/system changes during any real absence                        |
| Blocked / needs attention | 7         | all overdue-based                                                                    |
| Next move                 | 19        | mostly `next_step_short` (AI-written)                                                |

Two independent blind scorers (no access to generator code or to each other) scored all 29 packets on selection, grounding, staleness, CTA validity, omission correctness, and subjective re-entry usefulness.

### Blind-scoring results (external packets, n=23; two scorers A/B)

| Rubric dimension                 | Scorer A | Scorer B | Adjudicated                                                                                                   |
| -------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| Selection appropriate (yes)      | 14/23    | 14/23    | 13/23 both-yes; 8 packets rated "no" by at least one scorer                                                   |
| Severe grounding violations      | 1        | 1        | **0 invented claims** (see adjudication below)                                                                |
| Minor grounding violations       | 5        | 4        | ~6 distinct issues (overlapping)                                                                              |
| Staleness failures               | 1        | 1        | 1                                                                                                             |
| CTA invalid                      | 1        | 2        | 1                                                                                                             |
| Incorrect omissions              | 10       | 1        | ~10 packets omit orientation text their evidence contains (A is right; B filed the same defect under "minor") |
| Mean "would help re-entry" (1–5) | 2.87     | 3.04     | ≈2.95 — "mildly orienting", not "act immediately"                                                             |

**Adjudication of the severe flag** (both scorers independently flagged the same packet, `replay-40bc9dec-b86f49d8-2026-03-12`, next-move row): the recommended task was completed **401 ms after** the packet's as-of instant (as-of 12:04:10.615Z; completion 12:04:11.016Z — the completion _is_ the return event the replay anchors on). The recommendation was correct at assembly time, and was literally the action the user took upon returning. The true defect — which stands — is that the offline harness leaked the _current_ `state_key: "done"` into the packet's source metadata, and its evidence renderer filtered tasks by current deletion flags, hiding an alive-at-as-of task in one dogfood packet. Verdict: **zero invented user-facing claims; two as-of-reconstruction bugs in the offline harness itself** (logged in the scripts' README; must be fixed before replays are reused).

**Convergent scorer findings (both, independently):**

1. **Selection fails in one consistent direction: recency-only ranking picks empty or temporally dead projects** while a sibling with all the open work sits in the same table (a 0-task project chosen over a 9-task one, four times in a row for one user; a February errand list served as the August resumption target). The low-confidence "offer a choice" rule never fired on any of these.
2. **Row-level truth discipline is genuinely good** — verbatim-sourced counts verified exactly everywhere scorers checked; replay packets correctly refused future-authored next steps.
3. **The omission logic is too conservative:** ~10 packets claim "no authored orientation" while their evidence contains a usable "What this is" line or a full authored strategy doc. A third of the cards degrade to name-plus-CTA stubs unnecessarily.
4. **The staleness failure mode is AI-text-frozen-in-time:** `next_step_short` written by AI months ago ("plan tomorrow's tasks", May) rendered as today's next move. Grounded ≠ trustworthy.

---

## 6. Gate evaluation

| Gate criterion (verbatim from tasker/43)                                    | Result                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ≥80% of packets contain a trustworthy current state or next move            | **FAIL — 18/23 = 78.3%** (both scorers independently arrive at 18)                                                                  |
| ≥16/20 (80%) choose an appropriate project                                  | **FAIL — 14/23 = 60.9%** (13/23 by both-scorer agreement)                                                                           |
| Zero severe unsupported claims                                              | **PASS after adjudication** (raw: 1, traced to a 401 ms as-of boundary artifact in the offline harness, not an invented claim — §5) |
| Packet assembly does not block or slow the base agenda                      | **PASS** (offline assembly is pure reads over indexed tables; no LLM; lazy-loadable by design)                                      |
| Kill-check: control already advances within 5 min for most eligible returns | **INDETERMINATE** — unmeasurable without a session signal (§3)                                                                      |

**Overall: GATE NOT PASSED** — on coverage (narrowly) and on project selection (decisively). The selection failure is a fixable algorithm problem (recency-only ranking ignores open work and temporal death), but fixing it doesn't rescue the phase: two findings outside the rubric are individually disqualifying for Phase 1/2 as designed — the eligible population is ~1 user (§3) and the treatment's differentiating row has zero data supply (§5).

---

## 7. What Phase 0 corroborates vs. falsifies

- **Corroborated:** deterministic, truthful assembly from existing sources is possible; omission-over-invention works; the grounding contract's freshness rules are implementable; `onto_project_logs` is a usable (if leaky) outcome ledger.
- **Falsified (for now):** that BuildOS currently has (a) a returning population to serve, (b) away-time changes to report, or (c) trustworthy-fresh next steps to recommend. The compounding-context moat claim (day-30 doc) remains **untested, not disproven** — the instrument to test it doesn't exist yet.
- **Unresolved:** whether a grounded resumption point reduces reconstruction cost — the causal question was never reached because its preconditions failed.

## 8. Recommendation: park + preconditions (maps to tasker's "cheaper alternatives" #1 and W1)

1. **Finish the return-routing flip** (tasker/27 WP-1, ~1 day): flip the 9 listed + 5 newly-found `/dashboard` defaults to `/today`, remove the dead-code file from the list, decide the `?onboarding=true` nudge coupling deliberately. Without this, no `/today` experiment measures returns.
2. **Build the durable authenticated-session signal** (W1-lite, ~1–2 days): server-recorded once-per-session row (the `retargeting_founder_pilot` frozen-cohort pattern is the in-repo shape reference). This unblocks: true return-episode denominators, the 5-minute kill-check, inactivity buckets, and the day-30 moat measurement — independent of whether the Compass ever ships.
3. **Verify PostHog prod ingestion** (DJ, 5 min, path in §4).
4. **Re-run the §3 funnel monthly** (script is reusable) — revisit the Compass when the 3–30 d external return population reaches ≥15 users/month, and reconsider the treatment then against the cheaper alternative already half-shipped: `/today` **already renders `next_step_short` per project** via the today-feed service, so the Compass's strongest row is live on the control surface today.
5. If re-entry work continues before then, aim it at **supply**, not display: make Start Here snapshots refresh on REST mutations (not just chat), and add staleness invalidation for `next_step_*` — the audit shows display is not the bottleneck; freshness is.

## 9. Artifact inventory

- This report (dated, in-repo).
- Reusable probe scripts + harness-debt log: `apps/web/scripts/reentry-compass/` (README documents the monthly funnel re-run and the revisit trigger).
- Blind scorers' raw JSON: session scratchpad `packets/scores-A.json` / `scores-B.json` (aggregates in §5; contain external-user project text, not committed).
- 29 rendered packets + evidence appendices: session scratchpad `packets/render/` (real user text; not committed).
- Decision packet: hypothesis **unresolved — preconditions falsified**; no phase beyond 0 is authorized. DJ approval was and remains required before any Phase 2 assignment; nothing here authorizes it.
