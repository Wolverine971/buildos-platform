<!-- docs/architecture/agent-first-orchestration/research/07_EVAL_OPS_AND_OBSERVABILITY.md -->

# Chapter 07 — Eval Ops: Tracing, Observability, and the Tooling Layer

**Date:** 2026-07-25
**Author:** Independent research contribution (external perspective)
**Reviewed against:** `00_SYSTEM_UNDER_REVIEW.md` (BuildOS agent-first orchestration, Phase A falsification
harness)

---

## Scope

This chapter asks what the commercial and open-source agent-eval tooling ecosystem treats as
table stakes in mid-2026, and holds BuildOS's hand-rolled Phase A harness up against it. It covers
five vendors/standards (LangSmith, Braintrust, Langfuse, W&B Weave, Arize Phoenix/OpenInference)
plus the OpenTelemetry GenAI semantic conventions, which matter more than any single vendor because
they define what a _portable_ trace schema looks like. It does not evaluate routing/orchestration
architecture (see other chapters) and does not re-litigate whether Phase A's statistical design is
sound — only what off-the-shelf ops tooling would have given BuildOS for free, and what nothing on
the market gives it for free.

The single largest finding, previewed here because it recurs in three sections below: **every
vendor surveyed treats trajectory (path) evaluation as a first-class, named primitive with
reference-based matching and precision/recall metrics over tool calls. BuildOS's harness has no
equivalent — it scores only the final transcript, blind, via LLM-as-judge.** The corpus's
`acceptance_checks` are a partial, ad hoc substitute, not a trajectory metric.

---

## Key sources

| Source                                                                                                                                                                    | What it's used for                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [LangSmith — trajectory evaluations](https://docs.langchain.com/langsmith/trajectory-evals)                                                                               | Trajectory eval concepts, reference trajectories, LLM-as-judge over paths              |
| [langchain-ai/agentevals (GitHub)](https://github.com/langchain-ai/agentevals)                                                                                            | Exact trajectory-matcher function signatures and modes                                 |
| [LangSmith — observability concepts](https://docs.langchain.com/langsmith/observability-concepts)                                                                         | Trace/run/thread data model                                                            |
| [LangSmith — evaluation](https://docs.langchain.com/langsmith/evaluation)                                                                                                 | Offline vs. online evaluation framing                                                  |
| [LangSmith — improve judge evaluator with feedback](https://docs.langchain.com/langsmith/improve-judge-evaluator-feedback)                                                | Judge-human alignment ("Align Evals")                                                  |
| [LangChain changelog — pairwise annotation queues](https://changelog.langchain.com/announcements/pairwise-annotation-queues-for-comparing-agent-outputs)                  | Annotation queue design (single-run vs. pairwise)                                      |
| [Braintrust — run evaluations (experiments)](https://www.braintrust.dev/docs/platform/experiments/run)                                                                    | Experiment storage/versioning model                                                    |
| [Braintrust — write scorers](https://www.braintrust.dev/docs/evaluate/write-scorers)                                                                                      | Scorer taxonomy (autoevals, LLM-judge, code)                                           |
| [Braintrust — how to eval](https://www.braintrust.dev/articles/how-to-eval)                                                                                               | Prod→dataset feedback loop, CI gating (vendor framing)                                 |
| [Braintrust — human review docs](https://www.braintrust.dev/docs/annotate/human-review)                                                                                   | Human review workflow                                                                  |
| [Langfuse — evaluation overview](https://langfuse.com/docs/evaluation/overview)                                                                                           | Offline/online evaluation, CI/CD gating                                                |
| [Langfuse — LLM-as-a-judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)                                                                       | Judge execution model, what it can score                                               |
| [Langfuse — "what does a good trace look like"](https://langfuse.com/faq/all/what-does-a-good-trace-look-like)                                                            | Recommended trace/span schema and naming                                               |
| [Langfuse — token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)                                                              | How cost is derived (not standardized — vendor-maintained price table)                 |
| [Langfuse — self-hosting](https://langfuse.com/self-hosting)                                                                                                              | Self-host feasibility for a TypeScript monorepo                                        |
| [W&B Weave — what is Weave](https://docs.wandb.ai/weave/concepts/what-is-weave)                                                                                           | Sessions/turns/steps as first-class trace concepts                                     |
| [Arize Phoenix (GitHub)](https://github.com/arize-ai/phoenix)                                                                                                             | Traces/datasets/experiments primitives                                                 |
| [Arize Phoenix — precision/recall/F-score](https://arize.com/docs/phoenix/evaluation/pre-built-metrics/precision-recall-fscore)                                           | Classification-style scorer for tool-call sets                                         |
| [OpenTelemetry blog — "Inside the LLM Call: GenAI Observability" (2026)](https://opentelemetry.io/blog/2026/genai-observability/)                                         | invoke_agent / chat / execute_tool span hierarchy                                      |
| [OTel GenAI attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)                                                                  | Standardized attribute names, confirms no cost attribute                               |
| [OTel semantic-conventions-genai — agent spans (raw)](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md) | Primary spec text for `invoke_agent` span, requirement levels                          |
| [OTel semantic-conventions-genai — spans (raw)](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-spans.md)             | Primary spec text for `execute_tool` and chat spans                                    |
| [Google ADK — evaluation criteria](https://adk.dev/evaluate/criteria/)                                                                                                    | `tool_trajectory_avg_score` with EXACT/IN_ORDER/ANY_ORDER match types                  |
| [Google Cloud — evaluate Gen AI agents (Vertex)](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents)                                          | `trajectory_precision`/`trajectory_recall` definitions                                 |
| [FutureAGI — CI/CD LLM eval with GitHub Actions (2026, vendor blog)](https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/)                                      | CI gating patterns and honest caveat about "smoke test" gates (labeled vendor content) |

---

## Findings

### 1. Trace schema: what gets captured per span

There is no single mandated schema, but there is real convergence. **OpenTelemetry's GenAI
semantic conventions** are the closest thing to a standard, and as of the June 2026 reorganization
they live in a dedicated `semantic-conventions-genai` repository, still at **Development** stability
— no 1.0, names can still change ([OTel attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)).
The span hierarchy is three levels: a top-level `invoke_agent` span, child `chat`/`generate_content`
spans per LLM call, and `execute_tool` spans per tool invocation
([OpenTelemetry blog, 2026](https://opentelemetry.io/blog/2026/genai-observability/)). Pulling the
primary spec text directly:

- `invoke_agent` — **required**: `gen_ai.operation.name`, `gen_ai.provider.name`. **Recommended**:
  request model, temperature/max_tokens, `gen_ai.usage.input_tokens` /
  `gen_ai.usage.output_tokens`. **Conditionally required**: `gen_ai.agent.name`, `gen_ai.agent.id`,
  `error.type` on failure. **Opt-in** (flagged as potentially sensitive): full
  `gen_ai.input.messages` / `gen_ai.output.messages`, system instructions, tool definitions
  ([OTel agent-spans spec](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md)).
- `execute_tool` — **required**: `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`.
  **Recommended**: `gen_ai.tool.call.id`, description, type. **Opt-in**: `gen_ai.tool.call.arguments`
  and `gen_ai.tool.call.result`, both explicitly flagged as potentially sensitive
  ([OTel spans spec](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-spans.md)).
- **There is no cost or pricing attribute anywhere in the spec** — confirmed directly against the
  attribute registry and the spans spec. Every vendor computes cost by joining
  `gen_ai.usage.*_tokens` against its own maintained model-price table; Langfuse states this
  explicitly and notes it does not auto-sync provider price changes on self-hosted instances
  ([Langfuse token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)).

Vendor practice above the OTel layer converges on similar advice: name spans by verb
("retrieve-context", "generate-response"), type observations correctly (`generation` vs. `tool`) so
cost/filtering work, nest tool calls under the orchestrating span, and put a human-readable summary —
not raw JSON — at the root input/output
([Langfuse "good trace" FAQ](https://langfuse.com/faq/all/what-does-a-good-trace-look-like)). W&B
Weave promotes **sessions → turns → steps → tools/sub-agents** as first-class trace concepts rather
than a flat span list, to keep multi-agent execution navigable the way it actually ran
([Weave docs](https://docs.wandb.ai/weave/concepts/what-is-weave)) — the closest any vendor gets to a
native "subagent span" concept.

### 2. Offline vs. online evals

Every platform surveyed draws the same line: **offline** = run a task over a fixed dataset before
shipping (an "experiment"); **online** = sample live production traffic continuously. Langfuse frames
it as two halves of one loop — score "online, on live production traces" and "offline, before you
ship a change" ([Langfuse evaluation overview](https://langfuse.com/docs/evaluation/overview)).
LangSmith implements online eval as **Rule Automations** — a filter plus a sampling rate attached to
a tracing project, so a team scores 100% of customer-facing traffic while sampling internal traffic
lower, mainly to control judge-call cost (via search synthesis, direct page not fetched — treat as
**secondary**). Braintrust closes the same loop the other direction: low-scoring production traces
get one-click-added to a dataset, feeding back into offline evals
([Braintrust "how to eval"](https://www.braintrust.dev/articles/how-to-eval)).

**BuildOS has no online lane at all in Phase A** — this is by design, not a gap: persistence,
queues, and production traffic are explicitly out of scope
(`00_SYSTEM_UNDER_REVIEW.md` §6). It becomes a real gap the moment Phase B ships.

### 3. Experiment management: pinning, versioning, comparing

Braintrust's model is the clearest reference point: `Eval()` produces an immutable **experiment** —
"unlike playground runs, which overwrite previous results for fast iteration, experiments preserve
exact results" — storing dataset version (via `initDataset()`), custom metadata fields (model,
prompt version), scorer configuration, and full per-case outputs, with row-level provenance back to
the source dataset row so performance can be trended per case over time
([Braintrust experiments docs](https://www.braintrust.dev/docs/platform/experiments/run)). The
platform then diffs experiments for you — average score per scorer plus distribution shifts — though
the exact row-level diff mechanics are documented on a separate page this research did not fetch
(cite with that caveat). Phoenix's three primitives are explicitly named the same way: **traces**
(what happened), **datasets** (curated cases), **experiments** (task run over a dataset, scored)
([Phoenix GitHub](https://github.com/arize-ai/phoenix)).

**BuildOS's reproducibility mechanics are unusually strict for a hand-rolled harness** and in some
respects exceed what the docs above describe as default vendor practice: prompt + world-card +
corpus + blind-mechanic are each independently SHA-256 pinned, model pins are verified _per role_
(an untagged model call invalidates the run), and result JSON is hashed and committed
(`00_SYSTEM_UNDER_REVIEW.md` §3.6). What it lacks is the comparison layer — there is no diff view,
no "average score per scorer across N experiments" rollup; comparison currently means a human reading
committed JSON files.

### 4. Annotation and human review

The pattern across LangSmith, Braintrust, and (per search synthesis) Phoenix is: a queue of items,
a rubric, an assigned reviewer, and — critically — a mechanism that feeds human labels back into
judge calibration. LangSmith's **Align Evaluator** adds selected runs to an annotation queue for
human labeling, then uses the corrections as few-shot examples fed back into the judge prompt in
future iterations — LangSmith calls this "self-improvement"
([LangSmith judge-feedback docs](https://docs.langchain.com/langsmith/improve-judge-evaluator-feedback)).
LangSmith also ships **pairwise annotation queues** specifically for comparing two agent outputs
side by side — structurally the same shape as BuildOS's blind A/B
([LangChain changelog](https://changelog.langchain.com/announcements/pairwise-annotation-queues-for-comparing-agent-outputs)).
Braintrust frames the same idea as a **calibration queue**: multiple reviewers periodically score the
same items to keep the rubric aligned, and teams "compare automated scores with human scores on the
same traces, identify disagreements, and refine the scorer prompt"
([Braintrust human review docs](https://www.braintrust.dev/docs/annotate/human-review)).

On thresholds: practitioner-consensus synthesis (not one vendor's official number) puts judge-to-human
**Cohen's kappa above 0.6 as acceptable for production, above 0.8 as strong**, with the caveat that
raw percent-agreement is misleading on imbalanced label distributions and no universal threshold
should be applied blindly across task types (synthesized from Galileo/Arize commentary on
judge-human alignment measurement — treat as directional, not a single citable number).

**BuildOS does something structurally similar to a calibration queue but compressed to n=1**: DJ
scores all nine blind pairs before the panel runs, and the panel is invalidated unless it agrees with
DJ on ≥7/9 (`00_SYSTEM_UNDER_REVIEW.md` §3.4). That is a real judge-human alignment check with a
pre-registered bound — stricter than a lot of what the vendor docs describe as best practice, since
many teams treat "eyeball a few and move on" as sufficient. What's missing is durability: there's no
queue, no reviewer assignment, and no mechanism analogous to LangSmith's Align Evaluator that folds
DJ's corrections back into the judge prompt as few-shot examples for the _next_ run.

### 5. Regression gating

The vendor pitch is consistent: wire evals into CI so a pull request that touches a prompt or model
config automatically runs the eval suite and blocks merge on regression. Braintrust: "GitHub Actions
integration brings production-grade CI/CD to AI development. Every pull request automatically runs
evals and posts detailed results... Quality gates prevent regressions from reaching production"
([Braintrust "how to eval"](https://www.braintrust.dev/articles/how-to-eval), vendor claim).
Langfuse frames it as "block deploys on regressions" via CI/CD experiments plus deterministic code
evaluators for the parts of the pipeline that don't need an LLM judge
([Langfuse evaluation overview](https://langfuse.com/docs/evaluation/overview)). A useful honest
counter-note from a vendor-adjacent blog: "most CI LLM eval gates are smoke tests — they use tiny
datasets, mean against a frozen floor, and pass on anything short of catastrophe"
([FutureAGI, 2026 — vendor blog, labeled as such](https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/)).

**BuildOS's Go/Change/Stop rule is materially more rigorous than the CI-gate pattern described
above**, precisely because it isn't a mean-against-a-floor smoke test: it's a pre-registered,
multi-dimensional bound set (route accuracy, blind win rate on the full corpus _and_ on a specific
scenario subset, cost, two latency percentiles) derived from measured baselines, with an explicit
"marginal result is a stop, not a go" rule and hard safety gates that can force a Stop independent of
every other number (`00_SYSTEM_UNDER_REVIEW.md` §3.5). What it does **not** have is automation: the
rule is evaluated by a human reading a report, not a CI job that blocks a merge. That is a
capability the vendor tooling would add almost for free — the methodology doesn't need to change,
only the trigger.

### 6. Cost/latency as an eval dimension, not a side dashboard

This is where BuildOS is already ahead of what most docs describe as default practice. Vendor
tooling generally treats cost/latency as an **observability** feature (a dashboard, a filter) that
sits next to, but outside of, the eval/scoring pipeline — Langfuse computes cost per generation from
token counts and a price table purely as a monitoring feature
([Langfuse cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)).
BuildOS instead folds cost and two latency percentiles directly into the pre-registered pass/fail
bounds — a workflow that wins on quality but blows the 3× cost or 2× latency bound is a **Change**,
not a **Go** (`00_SYSTEM_UNDER_REVIEW.md` §3.5). Folding cost/latency into the gate itself, rather than
treating it as a separate dashboard concern, is closer to what CI-gating guidance recommends in
principle (multi-metric thresholds covering success rate, latency, and safety simultaneously, per
CI-gating search synthesis) than to what most teams appear to actually ship.

### 7. Build vs. buy, per the vendors themselves

No vendor enumerates "here is what you must not hand-roll" outright; it's implicit in the marketing
— Braintrust frames the status quo without a platform as forcing teams to "stitch together
fragmented workflows... this friction slows down everyone" (vendor framing,
[Braintrust "how to eval"](https://www.braintrust.dev/articles/how-to-eval)). What a platform
genuinely buys cheaply: a queryable trace store with a UI, a diff/comparison view across stored
experiments, an annotation queue with reviewer assignment, and judge-prompt self-improvement from
corrections. What stays expensive to buy and cheap to build, because it's product-specific: the
actual scoring logic (trajectory matchers, custom rubrics) and hard safety/policy gates — no vendor's
generic tool vocabulary knows what a Librarian call vs. a Researcher call means, or what counts as
unauthorized execution for BuildOS specifically. See the dedicated section below for the concrete
recommendation.

---

## Trajectory evaluation

This is the section that matters most, because it is where BuildOS's current harness and the
tooling ecosystem diverge hardest.

**Every trajectory/path-scoring vendor or spec surveyed treats the tool-call sequence as data to be
matched against a reference, not just prose to be judged.** The vocabulary is remarkably consistent
across three independent implementations:

| Metric                             | Definition                                                                                                                 | Source                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact match                        | Predicted trajectory identical to reference — same tool calls, same order, no extras/omissions                             | [LangSmith/agentevals](https://github.com/langchain-ai/agentevals) `trajectory_match_mode="strict"`; [Google ADK](https://adk.dev/evaluate/criteria/) `EXACT`; [Vertex Gen AI eval](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents) `trajectory_exact_match` |
| In-order match                     | All reference tool calls present, in the same relative order, extras allowed to appear in between                          | [Google ADK](https://adk.dev/evaluate/criteria/) `IN_ORDER`; [Vertex Gen AI eval](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents) `trajectory_in_order_match`                                                                                                |
| Any-order match / unordered        | All reference tool calls present, order doesn't matter, extras allowed                                                     | agentevals `trajectory_match_mode="unordered"`; ADK `ANY_ORDER`; Vertex `trajectory_any_order_match`                                                                                                                                                                                         |
| Subset / superset                  | Actual calls ⊆ reference (no unnecessary calls) or actual ⊇ reference (all required calls present, extras OK)              | agentevals `"subset"` / `"superset"` modes                                                                                                                                                                                                                                                   |
| Precision / recall over tool calls | Precision = matched actions ÷ predicted actions; recall = matched actions ÷ reference actions                              | [Vertex Gen AI eval](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents) `trajectory_precision`/`trajectory_recall`; Phoenix `PrecisionRecallFScore` evaluator for label-sequence comparison                                                                     |
| Single-tool-use check              | Binary — was a specific required tool used at all, regardless of order/count                                               | Vertex `trajectory_single_tool_use`                                                                                                                                                                                                                                                          |
| LLM-as-judge over trajectory       | No reference required; judge reads the full message/tool-call sequence and scores efficiency/appropriateness qualitatively | agentevals `create_trajectory_llm_as_judge`, prompts `TRAJECTORY_ACCURACY_PROMPT[_WITH_REFERENCE]`                                                                                                                                                                                           |

Two implementation details worth carrying forward: agentevals lets you override tool-argument
matching _per tool_ (`tool_args_match_overrides` — exact, ignore, subset, superset, or a custom
comparator), because argument-level strictness that's right for one tool (e.g., a search query) is
wrong for another (e.g., a write mutation) ([agentevals README](https://github.com/langchain-ai/agentevals)).
And ADK's metric is explicitly an _average over invocations_, not a single-run pass/fail — each turn
in a multi-turn session gets its own trajectory score and the reported number is the mean
([ADK criteria docs](https://adk.dev/evaluate/criteria/)).

**BuildOS's current harness has none of this.** The workflow-vs-control comparison lane (§3.1, §3.4)
scores two full response transcripts blind, on correctness/completeness/grounding/usefulness/
constraint*adherence, and a required-acceptance-check gate can veto a "win" — but the acceptance
checks are validators over \_outcomes* (was the right route chosen, was a citation present and valid),
not over the _shape of the tool-call path_ the workflow lane took to get there. There is no reference
trajectory per scenario, no exact/in-order/any-order scoring, and no tool-call precision/recall. A
workflow run that called the Researcher three times unnecessarily, or skipped the Librarian and
guessed instead, would show up — if at all — only indirectly, through cost/latency bounds or a lower
judge score on the final text, never as a labeled path-efficiency failure. Given that BuildOS's whole
architectural bet is about _how_ work gets decomposed across bounded specialists (not just whether
the final answer is good), this is the sharpest mismatch between what the system is trying to prove
and what its own harness can currently detect.

---

## Direct comparison to BuildOS

| Capability                                                                                  | What BuildOS does                                                                                                                                                      | Verdict                     | Cost to add                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Standardized trace schema (OTel GenAI spans/attributes)                                     | Ad hoc receipts + result JSON; no span hierarchy, no `gen_ai.*` attribute names                                                                                        | behind                      | Medium — rename/restructure existing receipt fields to match `invoke_agent`/`execute_tool` attribute names; no vendor lock-in required       |
| Trajectory / path evaluation vs. a reference                                                | None — only final-transcript blind A/B; `acceptance_checks` are outcome validators, not path matchers                                                                  | behind                      | Medium — needs a reference tool-call sequence per scenario plus an exact/in-order/any-order matcher; ~1 module, reuses existing receipt data |
| LLM-as-judge scoring                                                                        | 3 pinned judges, 5-dimension rubric, majority vote, told to treat both sides as untrusted content                                                                      | matched                     | —                                                                                                                                            |
| Blind pairwise comparison with counterbalancing                                             | Structural counterbalanced A/B mapping, hash-pinned, replaced after a v1 bias was found                                                                                | ahead                       | —                                                                                                                                            |
| Judge-human alignment gate                                                                  | DJ scores all pairs blind before the panel; panel invalid unless ≥7/9 agreement                                                                                        | ahead                       | —                                                                                                                                            |
| Judge self-improvement from human corrections                                               | None — no mechanism analogous to LangSmith's Align Evaluator few-shot feedback loop                                                                                    | behind                      | Low-medium — store DJ's corrections and inject as few-shot examples in judge prompts                                                         |
| Annotation queue / structured human review                                                  | None — DJ reviews ad hoc, not through a queue with assignment/rubric UI                                                                                                | behind                      | Low today (solo reviewer); rises fast if a second reviewer joins                                                                             |
| Experiment storage, versioning, diffing                                                     | Hashed result JSON committed to git; no comparison UI, no stored-experiment rollup                                                                                     | behind                      | Low — either a small diff script, or point a self-hosted Langfuse/Braintrust free tier at the existing JSON                                  |
| Reproducibility pinning (prompt/model/corpus/mechanic SHA-256, per-role model verification) | Explicit SHA-256 pinning across every input, untagged model usage marked invalid                                                                                       | ahead                       | —                                                                                                                                            |
| Held-out / anti-overfitting discipline                                                      | Explicit rule forbidding a 5th tuning pass after the frozen 8-case corpus hit 72/72 (training-set score); separate held-out 5-case corpus frozen                       | ahead / novel               | —                                                                                                                                            |
| Cost/latency folded into the pass/fail gate (not a side dashboard)                          | Cost + two latency percentiles are hard bounds in the Go/Change/Stop rule, derived from measured baselines                                                             | ahead                       | —                                                                                                                                            |
| Online (production-sampled) evaluation                                                      | None — Phase A is explicitly offline-only, no DB/queue                                                                                                                 | behind (by design, for now) | High — real gap opens only at Phase B                                                                                                        |
| CI-automated regression gating                                                              | Go/Change/Stop rule exists and is rigorous, but is evaluated by a human reading a report, not enforced by a CI job                                                     | behind                      | Low — wire the existing computed numbers into a CI check; methodology doesn't need to change                                                 |
| Hard safety/policy gate that overrides scoring                                              | Required-acceptance-check failure vetoes a workflow "win" regardless of judge preference; explicit hard safety gates (receipts, no blind replay of non-idempotent ops) | novel — unproven            | —                                                                                                                                            |

---

## Build vs. buy for BuildOS

Given BuildOS is a solo-founder TypeScript monorepo that already logs model usage (`smart-llm`) and
tool receipts through its own agent-ops layer, the honest recommendation is **don't buy a platform
for Phase A, and be selective at Phase B**:

- **Phase A (now):** Buy nothing. The harness is in-process with no DB; the real gap — trajectory
  evaluation — is a scoring algorithm, not infrastructure, and no vendor's generic matcher understands
  BuildOS's specialist vocabulary (Librarian vs. Researcher, forced-vs-model transitions) any better
  than a small hand-rolled matcher would. The agentevals exact/in-order/any-order/subset/superset
  taxonomy is worth **copying as a design**, not buying as a dependency — it maps directly onto the
  existing `acceptance_checks` infrastructure with one addition: a reference tool-call sequence per
  scenario. That's the single highest-leverage build.

- **Phase B (durable kernel, gated on a Go):** Adopt **OTel GenAI attribute names** in the receipt/log
  schema now — it's a naming convention, not a platform migration, and it keeps whatever storage
  BuildOS builds portable to any OTel-speaking backend later without a rewrite. Whether to also point
  a **self-hosted Langfuse** instance (MIT-licensed, same codebase as cloud, no outbound calls after
  image pull — [Langfuse self-hosting](https://langfuse.com/self-hosting)) at that data for the
  trace UI, annotation queue, and experiment-diff view is a real lean-vs-ambitious fork: lean is a
  small internal diff script over committed JSON; ambitious is running Langfuse alongside the existing
  Supabase/Railway stack. With DJ as the only reviewer today, the annotation-queue value is close to
  zero now and becomes real the moment a second person scores pairs.

- **Never buy:** the hard safety gates and the required-acceptance-check override. No vendor product
  reviewed treats a policy/safety check as a mechanic that can veto a win independent of score — this
  is BuildOS-specific and correctly stays hand-rolled.

- **Cheapest win regardless of build-vs-buy:** wire the already-computed Go/Change/Stop numbers into
  a CI job. No new methodology, no vendor — just a script reading the harness's own result JSON and
  failing the build on Stop.

---

## Open questions

1. The `acceptance_checks` infrastructure already stores a validator id + config per scenario — is
   the fastest path to trajectory evaluation to extend that same object with an expected tool-call
   sequence, rather than building a parallel trajectory-matcher module? This research didn't read
   BuildOS's implementation code, only the system-under-review brief, so it can't confirm how close
   the existing data model already is to what's needed.
2. Should Phase B's receipt schema adopt OTel GenAI attribute names _before_ durability lands, given
   retrofitting a naming convention onto live production data is much more expensive than adopting
   it now while the schema is still being designed?
3. How will judge-panel-to-human alignment be re-validated on an ongoing basis once DJ isn't the sole
   reviewer for every future comparison round — is a one-time ≥7/9 gate sufficient, or does BuildOS
   need a recurring calibration-queue equivalent (as Braintrust and LangSmith both recommend as
   continuous, not one-shot)?
4. At what point does DJ solo-reviewing every blind pair become the actual bottleneck, independent of
   any tooling gap? Unverified opinion, not evidence: probably synchronous with hiring or contracting
   out any part of the eval-review workload — that's the trigger for an annotation queue, not before.

---

## Confidence

- **High** on the vendor-capability claims that were fetched directly from primary docs and quoted:
  LangSmith trajectory matcher modes and function signatures, Braintrust experiment storage model,
  Langfuse trace-schema guidance and cost-tracking mechanics, the OTel GenAI span/attribute
  requirement levels (fetched from the primary spec repo after the old repo location redirected),
  and the Google ADK / Vertex trajectory metric definitions.
- **Medium** on claims sourced from WebSearch synthesis rather than a directly fetched primary page —
  flagged inline where this occurred (LangSmith online-eval sampling mechanics; Cohen's kappa
  threshold guidance, which is practitioner consensus, not one vendor's official number). Treat as
  directionally right, not verbatim-quotable.
- **Medium** on the BuildOS side of every comparison: based entirely on `00_SYSTEM_UNDER_REVIEW.md`,
  not on reading BuildOS's actual harness code — "what BuildOS does" reflects what the brief states.
- **Low / unverified:** vendor pricing, the exact mechanics of Braintrust's row-level experiment diff
  (referencing page not independently fetched), and W&B Weave's scoring API beyond the high-level
  session/turn/step framing — marked or omitted rather than asserted.
- Methodological note: the OpenTelemetry semantic-conventions repository recently split GenAI
  conventions into a separate `semantic-conventions-genai` repo (per third-party blog synthesis, not
  confirmed against a GitHub release changelog) — the canonical `opentelemetry.io/docs/specs/semconv/gen-ai/`
  page now just redirects there. Treat `opentelemetry.io` GenAI doc URLs as unstable pointers and
  prefer the `semantic-conventions-genai` GitHub repo directly.
