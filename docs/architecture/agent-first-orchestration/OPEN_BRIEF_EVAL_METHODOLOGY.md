<!-- docs/architecture/agent-first-orchestration/OPEN_BRIEF_EVAL_METHODOLOGY.md -->

# Open-Brief Evaluation Methodology

**Status:** Specified, not authorized. Follow-on to Phase A.
**Date:** 2026-07-25
**Owner:** BuildOS
**Blocked on:** Phase A reaching a recorded verdict, then Tier 1 breadth (§3).
**Origin:** [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) §8 — "what this research could not
answer." DJ authorized the sequencing on 2026-07-25: finish Phase A → Tier 1 breadth → this.

---

## 1. Why this document exists

The research dossier closed with four unanswered items. Two of them are not research gaps at all —
they are **instrument gaps**, and no amount of further literature review closes them:

> Zero published comparisons exist in BuildOS's actual domain — agent work over a user's own
> structured project data. All external evidence is coding, math, multi-hop QA, or web research.

> No frontier lab publishes a multi-agent _evaluation_ methodology.

You cannot borrow an instrument that does not exist. You build it and become the source.

The important correction is that **"can the agent do the job" is two different measurement problems**,
and Phase A is only instrumented for the narrower one.

|               | Tier 1 — verifiable baseline                              | Tier 2 — open brief                           |
| ------------- | --------------------------------------------------------- | --------------------------------------------- |
| Example       | "This task is done." → find it, update it                 | "Build me a marketing plan for this project." |
| Ground truth  | Yes — a database row either changed or it didn't          | None. No answer key can exist                 |
| Instrument    | **Already built** — `apps/web/src/lib/tests/agentic-e2e/` | This document                                 |
| What it needs | Breadth (§3)                                              | Methodology (§4)                              |
| Failure mode  | Wrong write, missed write, spurious write                 | **Generic plausible slop**                    |

Phase A measures neither. Phase A is a read-only, single-turn, 8-scenario comparison asking whether
a specialist team answers project questions better than one agent. That is worth finishing — it is
nearly finished — but a Go there says little about the capability described below, a point the
synthesis itself makes at §7.5.

---

## 2. The capability being evaluated

Stated in DJ's terms, 2026-07-25:

> If I say "go build me a marketing flow," it should build me a marketing plan based on my project.
> It should get context on the project and/or assign an agent to get context. It should have an
> analysis agent say "what are the ways in which we should market it?" It should research the domain.
> Maybe it should ask the user some questions about what I'm actually looking for. Then it should
> start to do research and come back. The orchestrator CEO agent should have this high-level goal and
> orchestrate all this together. **This is novel functionality that we're not predefining. It should
> be learned on the fly.**

The evaluative consequence of "not predefining" is the whole problem: there is no correct
decomposition to score against, and no correct output to diff against. Any methodology that requires
either one cannot measure this capability.

---

## 3. Tier 1 — breadth gap list (build this first)

The instrument exists and asserts against real database state — `task-create.scenario.ts:54` reads
`onto_tasks` back and checks the row the agent claimed to write. Six scenarios ship today
(`scenarios/catalog.ts:12`). The named gaps, in priority order:

1. **Cross-session entity resolution.** New chat, no conversation history, user says _"the beta email
   task is done."_ Agent must **search** the project for the matching entity, not read it out of
   history. Today's closest scenario (`document-edit-context.scenario.ts:118`) resolves _"that section
   you just added"_ — but that referent is in the threaded session, which is a different and much
   easier mechanism. **Zero coverage of the cold case.**
2. **Ambiguous referent.** Three tasks partially match the user's description. Correct behavior is to
   disambiguate, not to guess. Asserts a question was asked and **zero mutations occurred**.
3. **The no-op case.** User mentions a task in passing without asking for anything. Asserts **zero
   writes**. An eager agent's characteristic failure is the spurious mutation, and nothing in the
   suite currently catches it.
4. **Reschedule by reference.** "Push the beta email to next Tuesday" in a fresh session — resolution
   plus a date mutation, verified against `due_at`.
5. **Multi-entity update in one turn.** "Mark the first two done and push the third."
6. **Document from a description.** "We need to figure out research for a doc about X" → a document
   exists with sensible structure. Partially covered by `document-create`; the gap is the vaguer,
   non-imperative phrasing.

Every one of these is deterministic, needs no judge, and is mechanically delegatable.

---

## 4. Tier 2 — the open-brief instrument

### 4.1 Corpus unit: the brief

Not a question — a **commission**. 6–10 briefs, each run against a frozen, anonymized real project
snapshot. Nothing about the decomposition is specified in the brief.

Seed set:

- "Build me a marketing plan for this project."
- "What's blocking this project? Propose a recovery plan."
- "Research this domain and tell me what I'm missing."
- "Turn this project into a four-week execution plan."
- An intentionally underspecified brief, to exercise clarification behavior (see §6.1).

### 4.2 Four scoring layers, cheapest first

Each layer gates the one above it — the ClawBench pattern, which the dossier found BuildOS had
independently arrived at. An illegal run is a bug, not a quality datapoint, and must not reach a
judge.

#### L0 — Process legality (code, $0, boolean)

Not "did it take the right path" — that is unknowable for novel work. **"Did it violate an invariant
we can name."**

| Invariant               | Violation                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Context before planning | Produced a plan having read no project context                                                  |
| Entity honesty          | Referenced a project entity absent from the snapshot                                            |
| Mutation honesty        | Claimed a write with no corresponding write                                                     |
| Budget                  | Exceeded step/token budget, or repeated an assignment with no new evidence (loop)               |
| Citation floor          | Zero citations on a research-bearing brief                                                      |
| **Silent guessing**     | Proceeded on an underspecified brief surfacing **neither** assumptions **nor** questions (§6.1) |

L0 failures veto every layer above. This is where "make misroutes cheap, not rare" lands: the system
is allowed to be wrong, it is not allowed to be _silently_ wrong.

Note the shape of the last invariant. **Both** "asked a clarifying question first" **and** "ran and
returned with assumptions attached" are legal. Only proceeding _silently_ is a violation. That
follows directly from the policy in §6.1 — because the choice between asking and assuming is a
judgment call, it cannot be a boolean gate without punishing correct behavior half the time.

#### L1 — Grounding ratio (code + cheap extraction, ~$0)

Extract every concrete referent from the output — entity names, task and document titles, dates,
numeric claims, URLs.

```
grounding_ratio = resolvable referents / total concrete referents
```

Resolvable = matches an entity in the frozen snapshot, **or** is a fetched-and-validated source URL.
Report the ratio _and_ the unresolved list — that list is the hallucination surface, and it is the
most directly actionable artifact the whole harness produces.

#### L2 — The swap test (code; this is the novel metric)

Run the **same brief** against two snapshots from genuinely different domains (e.g. a personal
training program vs. a SaaS launch).

```
structural_overlap  = normalized similarity of the two outputs after stripping entity names
specificity_delta   = 1 − structural_overlap
```

A template scores near zero specificity no matter how well it reads. **This is the metric that
catches the actual failure mode of open-ended orchestration**: not wrong answers, but confident
generic output that could belong to any project.

No published equivalent was found across ~150 sources. Two consequences:

- Do **not** pre-register a threshold on the first cohort. The first run's job is to establish what
  the distribution even looks like. Pre-register on the second.
- It graduates into a **runtime guardrail** later — refuse to ship a synthesis below a grounding or
  specificity floor. The eval investment compounds into the product.

#### L3 — Human usefulness (DJ, blind, 2–3 hours, one sitting)

One question per output, 4-point:

> **Would you execute this?**
> 1 — no · 2 — after heavy edits · 3 — after light edits · 4 — as-is

Plus one free-text: _what's missing._ Blind across lanes, counterbalanced ordering, scored before any
lane identity is revealed. Reuse the existing counterbalanced blind mechanic
(`testing/harness/blind-judge.ts`) rather than inventing a second one.

Budget: ~30–40 outputs at ~4 minutes each. Confirmed available: 2–3 hours, one sitting.

#### L4 — Judge panel (cheap, non-deciding until calibrated)

Runs on the same outputs and reports agreement with DJ's L3 labels. It earns the right to extend
coverage to unlabeled outputs only after clearing an agreement bar. It never gates on its own — the
Phase A ordering (human scores before the panel) is the stronger practice and is kept.

### 4.3 Lanes

Model held **fixed** across all lanes. This is Phase A's confound, pre-empted rather than repeated.

1. **CEO + assembled team** — the bet.
2. **One strong agent, same model, all tools, a well-written prompt** — the rival Anthropic
   specifically warns usually wins, and the rival Phase A deferred. It belongs in the first cohort.
3. **Production agentic-chat v2** — the incumbent control.

### 4.4 What a win actually looks like

Not "the plan was good." Specifically: L0 clean, **and** grounding ratio ≥ the single-agent lane,
**and** specificity_delta materially above the single-agent lane, **and** DJ's L3 ≥ single-agent.

The failure to watch for, and the reason L1/L2 exist: **multi-agent output that reads better — more
structure, more confidence, more sections — while scoring worse on grounding and specificity.** A
judge cannot see that. Only code can.

---

## 5. Sequencing

| Step                          | Depends on                       | Rough cost                         |
| ----------------------------- | -------------------------------- | ---------------------------------- |
| Phase A to a recorded verdict | synthesis Tiers 0–2              | ~1 week, ~$15, 2–3 hrs DJ labeling |
| Tier 1 breadth (§3)           | nothing; mechanical, delegatable | ~1–2 days                          |
| Open-brief corpus authoring   | Tier 1                           | ~1 day                             |
| L0/L1/L2 harness              | corpus                           | ~2 days                            |
| First scored cohort           | harness                          | model spend TBD + 2–3 hrs DJ       |

---

## 6. Decisions

### 6.1 Clarification policy — DECIDED 2026-07-25

> **DJ:** "I like it if the CEO runs it anyway and hands back the plan with its open questions and
> assumptions attached. But if something's extremely underspecified and there are questions that
> need to be answered before we even start, then we should ask questions. That's a little judgment
> call. **I don't want it to be black and white.** The agent should have the option to ask a
> clarifying question before beginning, or it should be able to make reasonable assumptions and go
> forward."

**Policy:** run-and-surface is the default; ask-first is a legitimate option the agent may exercise
when the brief is genuinely unanswerable without input. Neither is mandated.

**Consequences for the instrument** — this is not a cosmetic decision, it moves where the behavior is
measured:

1. **L0 keeps only the floor.** Silent guessing is the violation. Asking and assuming are both legal.
   A hard "must ask" or "must surface" gate would mark correct behavior as a failure roughly half the
   time, which is worse than not measuring it.
2. **Judgment quality moves to L3.** _Should_ it have asked here? Did it ask needlessly and stall
   work DJ wanted done? A judgment call has no code-checkable answer — human preference is the only
   valid instrument, so this becomes a probe in DJ's blind pass rather than a machine check.
3. **It becomes partly machine-scorable if the corpus earns it.** Label every brief on a
   **blocked vs. proceedable** axis at authoring time — _blocked_ = missing information no amount of
   project context can supply (a budget, an audience, a deadline only DJ knows); _proceedable_ =
   underspecified but a reasonable practitioner would just make assumptions. Given those labels, two
   real rates fall out: **ask-rate on blocked briefs** (should be high) and **needless-ask rate on
   proceedable briefs** (should be low). Without the labels, neither is computable.

That labeling is a corpus-authoring task and is carried in
[`SCENARIO_AUTHORING_HANDOFF_2026-07-25.md`](./SCENARIO_AUTHORING_HANDOFF_2026-07-25.md).

### 6.2 Swap-test pair — DECIDED 2026-07-25

**Pair:** `Spooky Good — Processing Speed Training` × `BuildOS`.
**Anchor brief:** _"Turn this project into a four-week execution plan."_

Chosen by DJ from candidates proposed off his live project list (29 active
projects). The constraint that drove it: the swap test runs the **same brief**
against both snapshots, so both projects must be able to _receive_ it. That
disqualifies otherwise-attractive pairs — "build me a marketing plan" is
meaningless for a personal training program.

These two maximize range because the **correct** answers should share almost no
structure:

|                    | Spooky Good                                                  | BuildOS                          |
| ------------------ | ------------------------------------------------------------ | -------------------------------- |
| Domain             | personal cognitive/physical performance                      | SaaS product                     |
| Audience           | none — an audience of one                                    | users, market, funnel            |
| Correct plan shape | training blocks across hardware / software / pressure layers | product + GTM workstreams        |
| Scale at capture   | 11 tasks, 3 plans                                            | 121 tasks, 26 documents, 6 plans |

A plan that reads plausibly for both is, by construction, a template — which is
exactly what `specificity_delta` is built to catch.

**Snapshots.** `Spooky Good` already has a frozen anonymized snapshot built for
Phase A: `project-alpha.snapshot.json`
(sha256 `be9feaeade4134285f891f857ca02aad0a74cd1c890ba774c2b9ea1fa398af6c`). It is
copied — not modified — into this corpus so the open-brief instrument is
self-contained and cannot be broken by Phase A work. The BuildOS side is captured
as `project-beta.snapshot.json` at comparable density.

**Runner-up, recorded in case marketing briefs need their own pair:**
`The Cadre — DJ Internal` × `Beyond Exit Planning`. Both are marketable and wildly
different (scout-sniper precision-shooting instruction vs. regulated
financial-advisory book authority), and Beyond Exit Planning carries a real
compliance constraint — no promissory or investment-guarantee language — which
makes a template plan not merely generic but legally wrong. Set aside because two
marketing engagements may legitimately share structure, compressing the metric.

### 6.3 Still open

1. **Does specificity become a runtime guardrail** after the first cohort, or stay eval-only?
2. **What DJ sees on screen while a brief runs** — visible team assembly and progress, or just the
   result. Unanswered, and it shapes what "good" means beyond the artifact itself.
3. **The briefs themselves and the acceptance bar (L3 rubric).** Blocks B and C of the interview.
   These cannot be authored on DJ's behalf: for an open brief his taste _is_ the ground truth, so
   inventing them would produce an instrument that measures the author rather than the user.

---

## 7. Related

- [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) — §8 is the origin of this document
- [`NEXT_ITERATION.md`](./NEXT_ITERATION.md) — Phase A's remaining steps; this is blocked on them
- [`README.md`](./README.md) — the agent-first architecture this measures
- `apps/web/src/lib/tests/agentic-e2e/` — the Tier 1 instrument that already exists
