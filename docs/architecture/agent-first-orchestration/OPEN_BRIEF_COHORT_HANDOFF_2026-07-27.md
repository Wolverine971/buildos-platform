<!-- docs/architecture/agent-first-orchestration/OPEN_BRIEF_COHORT_HANDOFF_2026-07-27.md -->

# Handoff: run the first open-brief cohort (3 lanes → DJ blind pass → recorded verdict)

**Date:** 2026-07-27
**For:** a fresh agent session. Self-contained; the reading list below is sufficient.
**Mission in one sentence:** produce the first scored, three-lane open-brief cohort and put a
blind-scoring packet in front of DJ, so the agent-first orchestration bet finally gets a number.

**Operating constraint (standing, from DJ's strategy frame):** DJ is in background mode —
job-hunting; his hours are the binding constraint. **Agents prepare, DJ fires.** Every DJ
touchpoint in this handoff must arrive as a veto-able draft, never an open question. Total DJ
time this handoff is allowed to consume before the blind pass: **~10 minutes.**

---

## 1. Where this stands (do not re-derive)

- **Phase A is CLOSED** (2026-07-26, [`PHASE_A_RESULTS.md`](./PHASE_A_RESULTS.md)): the routing
  gate was recorded **instrument-limited** — 3/13 corpus labels contested, two labels require
  post-route knowledge, 65/72 arithmetically unreachable. Do not resurrect it. Do not run the old
  Phase A scripts.
- **The architecture hypothesis is unmeasured, not falsified.** A2 (workflow lane) was built and
  never scored one output. The decision vehicle is now the **open-brief instrument**
  ([`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md)).
- **DJ's acceptance bar is captured and folded** into
  [`corpus/open-brief-v1.json`](./corpus/open-brief-v1.json) — read `design_corrections`,
  `output_contract`, `clarification_policy_rule`, `acceptance_bar_global`, `pending_from_dj`.
  Two corrections are load-bearing and easy to violate accidentally:
  1. **Steps, not schedules.** Week-by-week framing is an L0 violation even when content is good.
  2. **The quality bar is feasibility self-assessment, not specificity.** Grounding ratio and the
     swap test are anti-template detectors, not the headline metric (methodology §6.4).
- **The control got stronger this week** — the v2 chat path gained deterministic floors
  (research capture, forward-carry), seven organize-commission fixes, and a verified prompt
  restructure. The team architecture must beat *this* baseline, not July-24's.
- **The catalog is 15 e2e scenarios**, all green except two known model-bound bands. That suite
  is the control lane's regression guard, not your instrument — yours is the open-brief harness
  you are about to build.

## 2. Read these, in this order, nothing else first

1. [`PHASE_A_RESULTS.md`](./PHASE_A_RESULTS.md) — why the last instrument died; carry-forwards.
2. [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md) — §4 (layers L0–L4),
   §6.1 (clarification policy), §6.2 (swap pair), §6.4 (the two corrections).
3. [`corpus/open-brief-v1.json`](./corpus/open-brief-v1.json) — the whole file; it is the spec.
4. [`BLOCKS_B_C_QUESTIONS_2026-07-25.md`](./BLOCKS_B_C_QUESTIONS_2026-07-25.md) — DJ's verbatim
   answers; his register for brief-drafting lives here.
5. [`AGENT_SURFACES_FRAMEWORK.md`](./AGENT_SURFACES_FRAMEWORK.md) — the debugging taxonomy;
   its first law applies to you: **when a result looks wrong, audit the instrument first.**
   (~1/3 of diagnosed "agent failures" in the record were the measurement.)
6. `packages/agent-orchestrator/src/testing/harness/blind-judge.ts` and `blind-packet.ts` —
   reuse this counterbalanced blind mechanic; do not invent a second one.

**Do NOT read `research/`** (55k words — its conclusions are already compressed into the docs
above). Do not read the Phase A audit chain unless a specific question sends you there.

## 3. Work packages

### WP-1 — DJ veto packet (prepare first, send early, ≤10 min of his time)

The corpus's `pending_from_dj` lists exactly three gaps. Produce ONE message containing:

- **Three drafted briefs** (ob-02 what's-blocking, ob-03 domain-research, ob-05 blocked-control)
  in DJ's dictated register — run-on, lowercase, multi-clause, context stated mid-sentence
  (study his verbatim answers in Blocks B/C; also `docs/marketing/` for his voice). Draft off
  his REAL projects. For ob-05, use the `clarification_policy_rule.consequence`: a
  direction-setting brief against a snapshot stripped of its direction doc.
- **Five proposed blocked/proceedable labels** as a table with one-line rationales (labels are
  snapshot-conditional — say which snapshot each applies to).
- **A Tacemus recommendation** (recommend: run the generic marketing-plan wording against
  project-beta for cohort 1; snapshot Tacemus later only if the brief earns a dedicated lane).

Format everything for veto: "reply with the numbers you reject." Silence on an item after his
pass = confirmed. Record confirmations in the corpus file (`status` fields exist for this).

### WP-2 — L0 machine checks (code, $0, build while WP-1 waits)

Process legality, all deterministic. Implement against the corpus schema:

- **Silent-guessing floor** (§6.1): asking and assuming are both legal; the only violation is a
  load-bearing assumption that is neither surfaced nor asked about.
- **Artifact shape** (design_corrections): flag week-block scaffolding (`Week 1 —`, `Week 2:`)
  as a violation; require per-step effort estimates and an explicit knowns/unknowns section.
- **Output contract**: a durable document was created AND the reply carries bottom-line-up-front
  takeaways naming it. Either alone fails. (The Research Log must not satisfy this — it is
  system-written; the harness pattern is `excludeSystemDocuments`.)
- **Citation floor** for research-bearing briefs (ob-03 class): external claims carry sources.

### WP-3 — L1 grounding ratio + L2 swap test (code, $0)

Specs in methodology §4.2. Grounding ratio = resolvable concrete referents / total; the
unresolved list is the hallucination surface and gets reported per-output. Swap test runs the
anchor brief against both snapshots (`corpus/fixtures/`), strips entity names, measures overlap.
**Pre-register NO thresholds on cohort 1** — the first run establishes distributions
(methodology's own rule).

### WP-4 — Feasibility self-assessment check (NEW, from C5 — this is the headline metric)

Machine-checkable part: does the artifact contain an explicit doability/stress-test section
(does it say whether context suffices, weigh difficulty, name what it needs)? Judge/L3 part:
both DJ questions per output — *"would you execute this?"* (4-point) and *"did it know whether
it could be executed?"*. Wire both into the blind packet.

### WP-5 — Three lanes, model held fixed

| Lane | What runs | Notes |
| --- | --- | --- |
| **Control** | the production v2 chat path | drive `POST /api/agent/v2/stream` like the e2e harness does; pin the model |
| **Workflow** | the Phase A A2 lane | code exists in `packages/agent-orchestrator`; reuse, do not rebuild |
| **Single strong agent** | ONE powerful-tier model, same read tools, no orchestration | the rival Phase A deferred; external evidence says it usually wins — if the team can't beat this lane, Phase B should not exist |

Non-negotiables from the Phase A post-mortems: the **same model tier writes the final text in
every lane** (the model confound explained ~most of the apparent workflow win); report **model-only
AND all-in cost** per run plus latency; verify per-role pins (the mechanism exists); a crashed
lane run is **infrastructure-invalid, never a free win for the other side** (C07 lesson); log
every silent cap.

### WP-6 — Cohort, blind packet, decision rule

- Runnable briefs × applicable snapshots × 3 lanes, ≥3 runs per cell where budget allows; report
  what was dropped.
- **Pre-register the decision rule BEFORE scoring** (in a dated section of the methodology doc):
  what counts as a lane win, the denominator, and the binomial tail probability printed beside
  any win count. **No Go-class conclusion on a small denominator** — ~37 pairs is the 80%-power
  target at +20pp; cohort 1 is for distributions and instrument validation, and must say so in
  its own results doc.
- Build the blind packet with the existing counterbalanced mechanic. DJ has committed one 2–3 hr
  sitting for L3. L4 judge panel runs after and never decides — report agreement with DJ only.
- Deliverable: `OPEN_BRIEF_RESULTS_COHORT1.md` — per-layer scores per lane, cost/latency ledger,
  instrument defects found (there will be some — say them), and a decision brief for DJ in
  product terms.

## 4. Landmines (all measured, all recent — violating these wastes real money)

1. **Never edit source while a battery runs.** The dev server hot-reloads and kills in-flight
   streams; it contaminated two samples this week.
2. Dev servers bind IPv6 — `curl 127.0.0.1` lies; probe `[::1]` or `localhost`.
3. Stream-infra flake ≈ 1-in-10 on long research-heavy turns ("An error occurred while
   streaming") — classify infrastructure-invalid, never score it.
4. `pnpm test:agentic` and every lane run cost real money; the harness needs the dev server up
   and writes to hosted Supabase under the `AE2E ·` test user.
5. Escape-hatch doctrine: no "you may skip this if…" clauses in any gate or rubric you write —
   they get taken ~100%. Floors trigger from ground truth, never from patterns on model output.
6. Instrument-first debugging: my own catchup scenario went 0/3 → 3/3 purely by fixing the
   instrument (seed leaked the premise; the checker punished surfaced contradictions). Assume
   your first failing readout is the instrument until proven otherwise.
7. DJ's taste is ground truth and is captured **verbatim** — paraphrasing his briefs or bar
   sands off exactly what makes them usable. Never author his taste; draft for veto.
8. Commit with explicit pathspecs only (`git commit -- <paths>`); the repo routinely carries
   unrelated work from parallel sessions.

## 5. Non-goals

No Phase B. No durable infrastructure, tables, or queues. No routing-gate work. No UI. No
edits to the frozen Phase A corpora or their hashed results. No new blind mechanic. No reading
the 55k-word research dossier "for context."

## 6. Exit condition

`OPEN_BRIEF_RESULTS_COHORT1.md` exists with three scored lanes and a pre-registered-rule
readout; the corpus file shows every `pending_from_dj` item resolved or explicitly deferred by
DJ; DJ has a blind packet and a one-page decision brief. The verdict itself is DJ's to make.
