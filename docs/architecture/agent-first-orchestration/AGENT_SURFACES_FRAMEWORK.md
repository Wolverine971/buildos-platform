<!-- docs/architecture/agent-first-orchestration/AGENT_SURFACES_FRAMEWORK.md -->

# Agent Surfaces Framework — debugging taxonomy + audit rubric

**Date:** 2026-07-27
**Status:** Framework ratified against two weeks of diagnosed failures; per-surface deep audits
pending (see §6).
**Origin:** DJ's four-surface model (initial context / tools / skills / harness), stress-tested
against every diagnosed agent failure from 2026-07-11 → 2026-07-26.

---

## 1. The claim under test

DJ's model: when an agent misbehaves, the defect lives on one of four surfaces —

1. **Initial context** — the world the agent spawns into (system + seed prompt)
2. **Tools** — definitions and coverage
3. **Skills** — higher-level procedural knowledge for composing tools
4. **Harness** — the runtime: budgets, error detection, infrastructure

And the converse: if the agent does a good job, all four surfaces are good.

## 2. What the failure record actually shows

Every diagnosed failure from the last two weeks, classified honestly:

| #   | Failure (where fixed/recorded)                                                            | Fits DJ's four?                              | Actual surface                                 |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| 1   | `must_synthesize` injected mid-turn: "do not call more tools" → system forbade the write  | ✗ (mid-turn, not spawn)                      | **Context-flow**                               |
| 2   | Forward-carry gate waived by `?`-pattern match on model output                            | ~ (harness, but the lesson is gate _design_) | Harness                                        |
| 3   | Organize L1: router misroute                                                              | ✓                                            | Harness                                        |
| 4   | Organize L2: escalation ladder                                                            | ✓                                            | Harness                                        |
| 5   | Organize L3: finalization floor                                                           | ✓                                            | Harness                                        |
| 6   | Organize L4: parent semantics on the write tool                                           | ✓                                            | Tools                                          |
| 7   | Organize L5: fabricated UUIDs — fixed by existence checks at execution, not id lists      | ✓                                            | Tools (result/validation)                      |
| 8   | Organize L6: `new_parent_title` param on the move tool                                    | ✓                                            | Tools                                          |
| 9   | Organize L7: prose on the forced write pass → `tool_choice=required`                      | ✓                                            | Harness (enforcement)                          |
| 10  | Skill routing: `skill_load` gate + lite policy                                            | ✓                                            | Skills (activation)                            |
| 11  | `activation: always_on` — dead enum no code ever reads                                    | ~ (skills↔harness contract)                 | Skills                                         |
| 12  | Tool-def doubling (singleton mutation) — corrupted **telemetry only**, never provider     | ✗                                            | **Instrument**                                 |
| 13  | Phase A routing gate arithmetically unreachable; 3/13 labels contested                    | ✗                                            | **Instrument**                                 |
| 14  | 185/187 "failed" loop runs benign — alert noise                                           | ✗                                            | **Instrument**                                 |
| 15  | System-written Research Log satisfying model-output assertions                            | ✗                                            | **Instrument**                                 |
| 16  | 900-token router cap truncations scored as wrong routes (`infrastructureInvalidCount: 0`) | ✗                                            | Harness config + **Instrument** misattribution |
| 17  | A2 model confound: GLM 5.2 `powerful` writer vs `deepseek-v4-flash` control               | ✗                                            | **Model** + Instrument                         |
| 18  | `active_domain_signals` at position 4 → 40.6% cache hit                                   | ✗ (economics of assembly)                    | **Context-flow**                               |
| 19  | User-stated futures land on 0/4 surfaces (forward-carry gap)                              | ~ (cross-surface)                            | Context-spawn + Harness floor                  |

**Tally:** Harness ~7, Instrument ~6, Tools 3, Skills 2, Context-flow 2–3, Model 1–2,
Context-spawn 1–2.

Three conclusions the four-surface model cannot survive:

1. **The instrument is a surface — and it's your second-biggest failure source.** Roughly a third
   of the diagnosed "agent failures" were the _measurement_ being wrong: phantom telemetry,
   unreachable gates, contested labels, benign failures alerting, system-written docs passing
   model-output assertions. `research/SYNTHESIS.md` said it exactly: _"The architecture is in
   better shape than the experiment measuring it."_ A taxonomy for "why isn't the agent doing what
   I want" that has no box for "the agent is fine; your judge is broken" will misdirect ~1 in 3
   debugging sessions. That is the empirical base rate here.

2. **"Initial context" is too static.** Context is a _flow_, not a spawn-time constant. The
   research-persistence root cause was an instruction _injected mid-turn_. The entire tasker/39
   restructure is about moving rules out of the spawn prompt and into
   situational blocks delivered at the moment of applicability (write-turn block, research block,
   mid-turn tool-materialization notices). The cache-position finding is a context-flow economics
   problem. None of that is "initial context," and none of it is harness plumbing either — it's
   the discipline of _what enters the window, when, and in what position_.

3. **The model is a surface.** The A2 confound (a better writer masquerading as a better
   architecture) and the standing lesson that weak models need explicit prose
   (`feedback_keep_project_create_prose`) both show model choice interacting with every other
   surface. If you can't say "same context, same tools, same harness, different model → different
   behavior," you can't attribute anything.

Two logical corrections, independent of the tally:

- **A passing agent does not validate the surfaces.** Compensation masks defects: a strong model
  papers over bad tool definitions; a good harness floor papers over a weak model. Green scenarios
  prove the _system_ works, not that each surface is good. Surface quality is only observable
  through failures and ablations — which means you audit surfaces by ablation, not by inspection.
- **Failures stack; one failure ≠ one surface.** Organize-commission was SEVEN layers across two
  surfaces, each fix revealing the next. The diagnostic rule is "chase the moving failure
  signature," not "find the broken surface."

## 3. The six surfaces, specified

Amended taxonomy: **Model · Context (spawn + flow) · Tools · Skills · Harness · Instrument.**
DJ's four survive as the middle of this list; context is redefined as a flow; model and
instrument are added.

### 3.1 Model

**Should provide:** raw capability, instruction-following density, and tool-calling reliability at
an acceptable price, per role.

**Spec:**

- Explicit pin per role (router / specialist / synthesizer / judge), with a documented escalation
  path (the delegation-hierarchy rule: orchestrate high, reason deep, execute cheap).
- Prompt prose density matched to model strength — weak models get explicit guidance; strong
  models get it cut.
- Never fix a model problem with more prompt without first costing the stronger model.

**Distinctive failure signatures:** erratic tool-call formatting; instruction amnesia at long
context; behavior class changes when only the pin changes.

**Diagnostic test:** model-swap ablation with everything else frozen. If behavior changes
materially, the other surfaces were compensating (or failing to).

### 3.2 Context — spawn

**Should provide:** identity/role, the world card (lay of the land), _always-true_ operating
rules, and the task. Nothing else.

**Spec:**

- Every token competes with the task. Situational rules do not belong here — they decay mid-list
  (bullet 14-of-19 syndrome) and cost every turn.
- Classification discipline for every rule: always-true / situational / belongs-on-tool / cut
  (the tasker/39 method — this is the reusable audit procedure for this surface).
- Cache-aware ordering: static prefix, dynamic sections after the static rule sections.

**Distinctive failure signatures:** the agent doesn't know something it was never told; the agent
ignores a rule that is present but buried; two sections state the same invariant three times.

**Diagnostic test:** dump the real rendered prompt (`.prompt-dumps/`), classify every bullet, and
check what fraction of the budget is navigation/instruction vs task.

### 3.3 Context — flow

**Should provide:** instructions at the moment of applicability; tool results that inform the next
action; compaction that preserves commitments; injected steering that never contradicts the
desired behavior.

**Spec:**

- Situational blocks arrive with their trigger (write-turn block on write intent, research block
  when web tools materialize), in the recency position.
- Any mid-turn injected instruction is reviewed against the outcomes you assert elsewhere — the
  `must_synthesize` lesson: **the system can forbid the behavior it tests for.**
- Assembly economics are part of the surface: section ordering, cache hit rate, per-turn overlay
  cost.

**Distinctive failure signatures:** the agent does exactly what it was told — and what it was told
was wrong; behavior degrades after compaction; rules present from turn one get ignored at turn
eight.

**Diagnostic test:** at the failure point, reconstruct _what the window actually contained_ and
read it as the model did. This is the single highest-yield debugging move in the record.

### 3.4 Tools

**Should provide:** the right verbs for the job; contracts that cannot be misread; results and
errors that teach the next action; validation at execution time.

**Spec:**

- Definition: purpose, parameters with unambiguous semantics, examples only where a weak model
  needs them; micro-policies live on the tool, not in the system prompt (belongs-on-tool rule).
- **Results are half the surface.** Error messages must tell the model what to do next.
  Existence/validity is enforced at execution — _existence beats id-inventories; fabrication is
  incurable by lists._
- No overlapping tools, no parameters that invite the model to do the harness's job
  (`new_parent_title` lesson), sizes budgeted and telemetered honestly.

**Distinctive failure signatures:** fabricated ids; the right tool avoided; the wrong parameter
used confidently; prose where a call should be.

**Diagnostic test:** serialize the registry and read exactly what the model reads; replay failing
call sequences; audit every error string with "does this teach the next action?"

### 3.5 Skills

**Should provide:** procedural knowledge too large or too situational for spawn context —
composition recipes, judgment, examples — loaded at the right moment.

**Spec:**

- Two halves with different failure modes: **routing** (trigger/gate — does it load when it
  should?) and **content** (does it actually improve behavior once loaded?). Audit them
  separately.
- Lifecycle: loaded-skills ledger, no double loads, `omit format` / reference-load mechanics on
  the tool description.
- **Contract rule:** every piece of skill metadata is either read by code or deleted. The
  `activation: always_on` dead enum is the standing counterexample — prompt-only invariants do not
  exist.

**Distinctive failure signatures:** right skill exists, never loads (routing — the measured
failure mode); skill loads, behavior unchanged (content); catalog rows costing every turn for
skills never routed to.

**Diagnostic test:** scenario battery with skill-load assertions (exists); content ablation — same
scenario with skill force-loaded vs absent (does not exist yet).

### 3.6 Harness

**Should provide:** everything that must _always_ happen. Budgets, passes, enforcement, floors,
gates, fencing, retries, permissions, cancellation, cost economics.

**Spec:**

- Models propose; code disposes. Any invariant that matters is enforced here, not requested in
  prose (README problem #3: prompt-dependent invariants).
- **A gate with a model-text-derived waiver is not a gate.** Trigger floors from ground truth
  (user text + actual executions), never from patterns over model output — the `?`-waiver lesson,
  learned twice.
- Forced behavior is forced mechanically: `tool_choice=required` on a write-only pass, not "please
  call a tool."
- Deterministic floors for must-happen effects (the D1 deterministic write).
- Failure handling separates infra-invalid from model-failure _at the harness level_ so the
  instrument inherits clean categories.

**Distinctive failure signatures:** correct model behavior producing a wrong system outcome; an
outcome that should be guaranteed happening 4/5 times; flaky infra surfacing as "the model got it
wrong."

**Diagnostic test:** escape-hatch sweep (grep every gate for model-output-derived conditions);
chaos cases — timeout, truncation, mid-turn cancel, tool error — asserted in the battery.

### 3.7 Instrument (meta-surface)

**Should provide:** trustworthy attribution. Ground truth, honest telemetry, reachable gates,
valid assertions.

**Spec:**

- Labels have a **measured human ceiling** (2–3 independent cold labelers) before any gate is set
  against them; contested items are removed or restated, not scored.
- Gates are arithmetically reachable given the sampling design (65/72 over 8×9 near-deterministic
  replicates was not).
- Telemetry is verified against provider-side truth (the doubling bug survived until the dump was
  cross-checked against actual Pass-1 usage).
- Assertions exclude what the system itself wrote (`excludeSystemDocuments`), exclude parroting,
  and separate infra-invalid from model failure symmetrically across lanes.
- Anthropic's heuristic is standing policy: **a 0% pass rate across many trials is a broken task,
  not an incapable agent.**

**Rule of engagement:** before blaming the agent, audit the instrument. Empirical base rate in
this codebase: ~1 in 3 diagnosed "agent failures" were instrument failures.

## 4. Multi-agent is not "extended harness"

The clean reframe: **from the orchestrator's seat, a subagent is a tool.** The taxonomy recurses
instead of growing a fifth box:

| Orchestrator-side object       | Single-agent analog                                | Dominant failure mode                                        |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| Agent catalog entry / manifest | Tool definition                                    | Wrong specialist chosen; capability oversold in the manifest |
| Assignment (delegation prompt) | Tool-call args — and the **child's spawn context** | Model-authored context: bad decomposition in, garbage out    |
| Typed artifact / report        | Tool result                                        | Lossy or overconfident report trusted blind                  |
| Shared artifact store          | Context-flow                                       | Stale reads, version races, transcript smuggling             |

Two consequences:

1. **Auditing the CEO with the same six surfaces covers the team recursively.** The CEO's tools
   surface _is_ the catalog; the CEO's context-flow _is_ digests and artifacts. A specialist's
   spawn context is partly authored by the CEO at runtime — so a specialist's surface-quality is
   downstream of the CEO's behavior quality. This is the genuinely new thing: **spawn context
   stops being an engineered constant and becomes model output**, which means it needs the same
   validation any model output needs (schemas, floors, ground-truth checks).
2. **The one failure class with no single-agent analog is decomposition quality** — was the plan
   the right shape at all? That is exactly what the routing gate tried and failed to measure and
   what the open-brief instrument now owns. Everything else multi-agent adds (joins, fan-out,
   budgets) is harness proper, and the existing harness spec covers it.

Note: the V0 README already encodes most of this — manifests as capability boundaries, typed
artifacts over transcripts, deterministic control flow. The architecture doctrine was ahead of the
debugging taxonomy; this document closes that gap.

## 5. Current system vs spec — first pass

Grounded in the audits, batteries, and fixes on record. "Verdict" is against the §3 spec, not
against perfection.

| Surface       | State (evidence)                                                                                                 | Verdict | Top gap                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| Model         | Pins per role in Phase A; smart-llm profiles in prod; delegation hierarchy as practice                           | **B−**  | No standing model-swap ablation lane; WP-9 model A/B still open; A2 confound proved the risk    |
| Context-spawn | Best-audited surface: tasker/39 (19→7 bullets, situational reclassification, stages 1–4+6 built, battery 11×5/5) | **A−**  | Research-doc band 2/5 persists; verify cache-position fix landed with the restructure           |
| Context-flow  | Overlay + mid-turn tool notices exist; `must_synthesize` fixed; situational-block design ratified                | **B**   | Tool _results_ never audited (size, error text); "context never narrows" still unfixed          |
| Tools         | Seven-layer hardening on ontology writes; existence checks; doubling bug fixed                                   | **B+**  | Error-message design never audited as a surface; tool-surface size budget test known failing    |
| Skills        | Routing gate fixed; preload ledger works                                                                         | **C+**  | Dead metadata contract (`always_on`); zero content-quality evals; catalog costs ~800 tok/turn   |
| Harness       | Deepest investment: turn budgets, forced passes, floors, fencing, queue hardening, D1 write                      | **B+**  | No systematic escape-hatch sweep (both found by accident); backend audit list unfixed           |
| Instrument    | Real battery (11 scenarios), prompt dumps, pre-registration discipline better than published practice            | **C**   | 6 false readings in two weeks; no "audit the instrument first" checklist; pre-7/26 telemetry 2× |

The shape of this table is the finding: **investment is inversely correlated with failure rate on
the two ends.** Harness got the most work and still produces failures because it's where
everything lands; Instrument got the least systematic attention and quietly caused a third of all
misdiagnoses.

## 6. Per-surface audit plan (proposed order)

1. **Instrument** — first, because every other audit reads through it. Deliverable: assertion
   validity sweep (anti-parrot, system-doc exclusion, infra-invalid symmetry), telemetry
   verification against provider usage, gate-reachability arithmetic on every active gate.
2. **Tools (results half)** — cheap, never done, high yield. Every error string audited for
   "teaches the next action"; result payload sizes measured.
3. **Context-flow** — transcript reconstruction on the failing bands (research-doc 2/5);
   compaction/narrowing behavior.
4. **Harness escape-hatch sweep** — grep every gate/floor for model-output-derived conditions;
   chaos cases into the battery.
5. **Skills content** — force-load ablations on the top routed skills.
6. **Model** — standing swap-ablation lane (subsumes WP-9).

Context-spawn is excluded: tasker/39 _was_ that audit; re-auditing it now duplicates work.

---

## 7. Case study + amendments — Phase 6 battery, 2026-08-20

**Added 2026-08-20.** The post-Railway Phase 4 battery (`5/18`) was handed off as three agent-behavior
clusters. Running the §6 order — instrument first, then window reconstruction — re-attributed all
thirteen failures (full report:
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_ROOT_CAUSE_REPORT_2026-08-20.md`):

| Handoff cluster        | Actual surface                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Over-clarification (8) | **Harness** — reviewer's decision space is {approve, read-only, ask user}; every form defect it catches routes to the user. Trigger: **Model** (cheap acting model writes sloppy contracts) + **Tools** (contract schema can't express heterogeneous updates).              |
| Under-restraint (3)    | **Harness** — candidate uniqueness requested in reviewer prose, never enforced; reviewer is confirmation-framed.                                                                                                                                                            |
| Relative dates (3)     | **Instrument** — harness asserts America/New_York against a prompt that says `Timezone: UTC` for a UTC-profile user; valid only 04:00–20:00 EDT. Also a live **Context-spawn** defect (no local date/weekday in the prompt; `users.timezone` unpopulated for 93% of users). |
| "Regressed sharply"    | **Instrument** — 3 reps/scenario; `p = 0.46` once the timezone artifact is removed.                                                                                                                                                                                         |

The framework held: the base rate ("~1 in 3 diagnosed agent failures are instrument failures")
recurred, and "reconstruct what the window actually contained" was again the decisive move. Four
gaps in the spec surfaced; they are now part of §3:

### 7.1 Amendment to §3.6 Harness — audit the action space, not just the gates

> The set of exits a model is given is a harness decision and must be audited like a gate. A
> reviewer/judge whose only non-approving exit reaches the user converts every defect it finds in a
> _model artifact_ into a _user interruption_. Every review layer needs an exit that returns to the
> authoring model (bounded retries) before it escalates to a human. Diagnostic: list each model
> role's tool surface and ask, for each failure mode it can detect, "where does that go?"

### 7.2 Amendment to §3.7 Instrument — every model-authored decision carries its author

> In a multi-model turn (acting model + reviewers, or CEO + specialists per §4), control-tool rows
> and artifact summaries must record _which_ model produced each decision. Without it, a reviewer
> veto reads as acting-model hesitation, and the handoff asks the wrong surface to change. This is
> the §4 "subagent is a tool" rule applied to the instrument: a tool result must name its source.

### 7.3 Amendment to §3.2 Context-spawn — the world card includes the local clock

> "Current time" as an ISO-Z instant is an instruction to do date arithmetic, not a fact. The spawn
> context must carry `local date + weekday + IANA zone` sourced from the user, and any harness that
> asserts relative dates must seed the same zone it asserts in. Diagnostic: run the battery at
> 23:00 local once.

### 7.4 Amendment to §3.7 Instrument — power before verdicts

> A scenario comparison is a verdict only when the rep count can distinguish the rates in play.
> Report the binomial interval next to every pass count; 3 reps cannot separate 25% from 60%.
> Minimum 5 reps for go/no-go, and the §3.7 rule "0% across many trials is a broken task" should
> be checked _across batteries_, not within one (project-organize: 0/12 on the worker, 3/3 legacy).

### 7.5 Observation for §3.1 Model — the hierarchy can invert silently

> "Orchestrate high, reason deep, execute cheap" assumed the cheap model executes. Here the cheap
> model (`deepseek-v4-flash`) authors the semantic contract — the hardest artifact in the turn —
> and the expensive model (`gpt-5.6-luna`) only grades it. When the grader is stronger than the
> author, the system's visible failure mode becomes "too many rejections," which looks like
> over-caution. Check role/tier alignment before tuning prompts.

### 7.6 Audit-order update to §6

Item 1 (Instrument) now has a concrete checklist from this case: timezone/clock parity between
harness and prompt; decision attribution on control tools; rep-count power; cross-battery zero-rate
scan. Item 4 (Harness escape-hatch sweep) gains "action-space audit" (§7.1). Item 6 (Model swap
ablation) is now the open question that decides how much of the over-clarification cluster is
model vs harness — it has never been run.
