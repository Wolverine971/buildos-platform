<!-- docs/research/jev-decision-model-2026-09-18.md -->
<!-- doc-status: point-in-time -->

# Jev: research, video analysis, and opportunities

Research date: September 18, 2026.

**Recommendation:** use GPT/Claude to discover and revise the decision framework, Jev to evaluate narrowly defined semantic questions repeatedly, and application code to combine results and execute permitted actions. Keep complex planning and generated deliverables with a generative model. Start with a document-organization experiment before changing production agent routing.

This brief is based on TypeSafe's documentation, its launch article, OpenRouter's model metadata and browser-visible API reference, and Riley Brown's YouTube captions. No live Jev inference was run. Cost examples are calculations, not measured results. Application code and production settings were not changed.

## What Jev is

TypeSafe describes Jev as its first System One model: a language-understanding model with typed decisions as its output. You supply a state and explicit questions; the answer space is defined beforehand. It cannot write an explanation, invent a new category, draft a reply, or generate code. [System One documentation](https://docs.typesafe.ai/concepts/system-one).

The reported training approach is **reinforcement learning for calibrated decisions (RLCD)**. The target is useful decisions with probabilities that track outcomes, rather than preferred prose. Calibration concerns populations of predictions; it is not a guarantee for an individual answer. The public primer describes the objective, not a complete reproducible training recipe. [AI primer](https://docs.typesafe.ai/introduction/machine-learning-primer).

TypeSafe also reports a different architecture and parallel sampling. Its headline speed/cost gains are vendor measurements on particular workflows. Its workflow reference answers are averaged frontier-model predictions rather than independent ground-truth outcomes. The launch article acknowledges that its largest gains are likely toward the high end of real-world gains. Its zero-hallucination claim concerns guaranteed schema matching; a valid label can still be the wrong label. [Launch article](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

| Primitive | Meaning                                                               | Example for our experiment                                        |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Choice    | Pick one supplied option; returns option probabilities and confidence | Which existing project best fits this document, including “none”? |
| Score     | Position on an ordered rubric; may fall between levels                | How directly does this document support the selected objective?   |
| Noul      | Probability that a defined proposition is true                        | Does the text explicitly request a response?                      |

Choice supports up to 255 options. Use separate Noul questions for overlapping labels. Score supports up to ten distinctly described levels. A Noul of 0.5 means uncertainty about a proposition, not a medium quantity. [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul).

## What the video shows

[Riley Brown: JEV — How It Works and What You Can Build](https://www.youtube.com/watch?v=o1CogAtWdBk), published September 18, 2026; 20:18. Analysis uses available English automatic captions, which can mistranscribe names. This is a timestamped summary, not a verbatim transcript.

| Timestamp                                                   | Example or discussion                     | What it establishes                                                              |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| [00:38](https://www.youtube.com/watch?v=o1CogAtWdBk&t=38s)  | Classifies 500 emails                     | A useful bulk-processing demonstration; accuracy is not audited.                 |
| [02:08](https://www.youtube.com/watch?v=o1CogAtWdBk&t=128s) | Routes requests among model tiers         | Jev chooses the worker; another model generates the answer.                      |
| [05:19](https://www.youtube.com/watch?v=o1CogAtWdBk&t=319s) | Configures Choice, Score, and Noul fields | The human-defined rubric controls what can be evaluated.                         |
| [13:04](https://www.youtube.com/watch?v=o1CogAtWdBk&t=784s) | Monitoring and suspicious-email flags     | These are model flags, not verified scam findings.                               |
| [15:37](https://www.youtube.com/watch?v=o1CogAtWdBk&t=937s) | Context-window discussion                 | Needs the per-question versus whole-request distinction below.                   |
| [16:20](https://www.youtube.com/watch?v=o1CogAtWdBk&t=980s) | Driving, trading, and browser demos       | Illustrations, not evidence of production safety, profitability, or reliability. |

My assessment: the email and routing examples are the best starting points because their input, output, and correction process are easy to inspect. A convincing animation or rapid browser sequence tells us much less about failure handling. Current Jev takes text/structured state, so a visual environment requires another component to perceive it. [Supported input](https://docs.typesafe.ai/concepts/state).

## Current integration facts

| Item                          | Verified documentation                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| OpenRouter alias              | `~typesafe/jev-latest`; currently resolves to Jev 1.13                               |
| OpenRouter version            | `typesafe/jev-1.13`                                                                  |
| Native TypeSafe version       | `jev-1.13.0`; aliases include `jev-latest`                                           |
| Input price                   | $0.042 per million tokens; output is uncharged                                       |
| OpenRouter advertised context | 32,000 tokens                                                                        |
| Native TypeSafe limits        | 64K for state plus all questions; 32K for state plus the longest individual question |
| Native API                    | `POST https://api.typesafe.ai/v1/systemone`                                          |
| Request body                  | `model`, `state`, `questions`                                                        |
| OpenRouter API                | Dedicated `alpha.decisions` reference, with the same core request fields             |

Sources: [OpenRouter version](https://openrouter.ai/typesafe/jev-1.13), [alias](https://openrouter.ai/~typesafe/jev-latest), [TypeSafe models](https://docs.typesafe.ai/models), [native quickstart](https://docs.typesafe.ai/introduction/quickstart), [OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request).

OpenRouter's browser-visible reference currently generates the URL `https://openrouter.ai/api/v1/api/alpha/decisions`. **Follow-up verification on September 18:** that route returned 404; an authenticated synthetic request succeeded at `https://openrouter.ai/api/alpha/decisions` with model `typesafe/jev-1.13`. The recorded request and response are kept as a test fixture: [jev-choice-smoke-2026-09-18.json](../../packages/smart-llm/src/fixtures/jev-choice-smoke-2026-09-18.json). The accompanying JSON is an illustrative request using the OpenRouter model ID. For TypeSafe directly, change the model to `jev-1.13.0` and use the native endpoint and credentials.

Pin the version once thresholds are evaluated. TypeSafe currently lists 1,200 requests/minute and 250,000 tokens/second, explicitly subject to change; do not assume those are OpenRouter account limits. Domain adaptation currently happens through context and question definitions, not customer-specific fine-tuning. [Model reference](https://docs.typesafe.ai/models).

## How to implement your proposed architecture

Think of the framework as a maintained library of small decisions with an explicit dependency graph. It can become large as a system without becoming a giant prompt on every request.

1. **Define the objective.** Decide which outcomes matter and the cost of mistakes. For organization, distinguish a wrong label, a missed match, and a destructive move.
2. **Have GPT/Claude design the framework.** It proposes a taxonomy, criteria, boundary examples, missing-evidence behavior, and candidate actions. Use actual reviewed records to refine it.
3. **Prepare a compact state.** Code retrieves relevant records. A generative model extracts or summarizes only where necessary. Preserve original evidence and IDs so a bad summary does not become unquestioned truth.
4. **Ask Jev the applicable atomic questions.** Batch questions sharing the same useful context: project fit, record type, action requested, evidence quality, and ambiguity.
5. **Combine results in code.** Enforce hard constraints, rank candidates, apply evaluated thresholds, and decide whether to act or escalate.
6. **Execute through the appropriate worker.** Code applies a tag; GPT/Claude writes a draft; an existing integration performs an allowed operation. Then inspect the resulting state.
7. **Learn from corrections.** Log errors and outcomes; ask GPT/Claude to propose framework changes, and evaluate those changes before promoting them.

Questions in the same request do not see each other's answers. A second call is warranted when the first result determines what evidence to fetch or which options exist next. Many speculative questions can instead run together and be ignored when irrelevant. Question IDs are bookkeeping and are not seen by the model: each instruction must stand alone. [Question semantics](https://docs.typesafe.ai/primitives), [parallel evaluation pattern](https://docs.typesafe.ai/patterns/fan-out).

For example, avoid a question that asks Jev to balance business value, urgency, dependency risk, and personal preference in one score. Ask separately, then use explicit weights. The human chooses the tradeoffs, and changing the weights can reuse stored scores. [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring).

## Reorganizing a large collection

My proposed first workflow is a **reversible organization preview** for documents and notes:

- GPT/Claude proposes a taxonomy from representative material and your goals.
- Code builds a stable list of destination IDs and descriptions.
- Jev evaluates each record for primary destination, optional tags, actionability, and evidence quality.
- If there are too many destinations, retrieve candidates or traverse a hierarchy. Keep alternative branches alive when the early choice is ambiguous.
- Code produces a proposed mapping from old location to new location, with uncertain records separated for review.
- Apply reviewed changes in batches with an undo mapping. Use corrections to improve the taxonomy.

TypeSafe's hierarchical-classification cookbook provides a concrete beam-search design: retain several plausible paths instead of irreversibly committing at the first branch. Its path-ranking metric should not be mistaken for an empirically calibrated probability that the entire path is correct. [Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification).

For genuinely new categories, send the unmatched records to GPT/Claude to propose additions. Jev alone cannot discover and name arbitrary categories. Also distinguish exclusive destinations from overlapping tags: a note may belong to one project but discuss several themes.

My stronger product idea is to store these semantic judgments and generate several views: by project, by next action, by unanswered question, or by evidence quality. That can deliver most of the benefit without physically moving the source files every time your perspective changes.

## Possibilities worth exploring

These are proposed applications, not measured Jev capabilities on our data.

| Opportunity                    | What Jev would judge                                                      | What completes the work                                            |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Document and note organization | Destination, document type, themes, actionable content                    | Taxonomy design, database updates, undo                            |
| Project intake                 | Existing project match, duplicate candidate, missing information          | GPT/Claude structures the intake and asks useful clarifications    |
| Personal attention queue       | Action requested, relevance to current goals, interruption value          | Scheduler applies actual dates, priorities, and notification rules |
| Model/tool/skill selection     | Which supplied worker fits; whether any fits                              | Orchestrator invokes and evaluates the chosen worker               |
| Research evidence review       | Support, contradiction, irrelevance, missing evidence                     | Exact quote checks, source retrieval, generative synthesis         |
| Knowledge graph maintenance    | Same entity, related entity, conflicting claim                            | Candidate retrieval and graph integrity checks                     |
| Task quality checks            | Action clear, completion criterion present, likely dependency             | GPT/Claude drafts improvements; user intent remains authoritative  |
| Draft review                   | Meets each stated requirement, uses supplied evidence, inappropriate tone | Generative revision and final approval where appropriate           |
| Feedback mining                | Theme, user need, affected feature, severity                              | Aggregation and product planning                                   |
| Change detection               | Whether a new record materially alters a known situation                  | Event processing and targeted re-evaluation                        |
| Historical re-evaluation       | Whether old material fits a newly defined opportunity                     | Batch scheduling and a reviewable shortlist                        |
| Decision-feature dataset       | Many stable semantic features from messy text                             | Statistical analysis or a supervised downstream model              |
| Simulated interactive agents   | Best legal action from current structured state                           | Simulator, action constraints, and state feedback                  |

There are already official starting points for [skill selection](https://docs.typesafe.ai/cookbooks/skill_suggestion) and [citation checking](https://docs.typesafe.ai/cookbooks/citation_check). Neither makes Jev an authority on unavailable facts. For verification, provide source evidence; agreement between two models is not independent proof.

The most interesting extension of your proposal is **framework improvement from measured outcomes**. TypeSafe publishes a workflow where an LLM proposes semantic questions, Jev converts text into numeric features, and a CatBoost model learns from those features. Errors inform the next question proposal. For us, analogous targets could be whether an intake classification was accepted or whether an item was useful in a project. Maintain a final held-out test set; repeated prompt changes against the same examples can overfit. [Autoresearch feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery).

## Constraints that change the design

TypeSafe documents weaknesses in arithmetic, counting, date comparisons, indirect reasoning, and irrelevant context. It also warns that adversarial text can steer classifications and that logically related questions need not yield consistent probabilities. Use code for exact calculations and invariants, and treat state as untrusted data. Giving Jev a large irrelevant landscape can reduce accuracy. [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

The returned `confidence` for Choice/Score summarizes the distribution's concentration; it is not simply the winning option's probability or a guaranteed accuracy percentage. Noul has no separate confidence field. Tune action thresholds on representative labeled cases, for each question and model version. [Confidence reference](https://docs.typesafe.ai/confidence).

My implementation recommendations: retain an explicit unmatched outcome; validate target IDs and access in code; keep reversible proposals before writes; log source version, taxonomy version, model version, distributions, action, and eventual correction. Event-triggered evaluation and caching should precede continuous polling. When a schema or source changes, invalidate the affected decisions.

## First experiment and economics

Use a frozen sample of around 300 representative documents/notes, including mixed-topic and unmatched examples. Use one portion to design the framework and reserve a separate test portion. Compare Jev against the current LLM approach and a simple search/rules baseline on the same inputs. Human-reviewed labels, not model agreement alone, determine success.

Measure primary-destination accuracy, precision of accepted recommendations, fraction needing review, tag precision/recall, actual latency at median and p95, and full cost including preprocessing, retries, and fallback. Inspect errors by category. Agree a target before choosing thresholds; the initial experiment estimates feasibility and does not establish rare-error safety.

Illustrative input-only economics at $0.042/M tokens:

| Workload          |        Total billable input assumption | Jev inference calculation |
| ----------------- | -------------------------------------: | ------------------------: |
| 500 records       | 2,000 tokens each, including questions |                    $0.042 |
| 100,000 records   | 2,000 tokens each, including questions |                     $8.40 |
| 1,000,000 records | 2,000 tokens each, including questions |                    $84.00 |

These are arithmetic estimates, excluding all other services. Ten independent questions about one record can share its state in one request; sending the state ten times wastes input and round trips. Ten different records are a different batching problem and still have to fit the context and rate limits. [OpenRouter pricing](https://openrouter.ai/typesafe/jev-1.13), [fan-out pattern](https://docs.typesafe.ai/patterns/fan-out).

Deliverable for that experiment: an inspectable list of proposed classifications, original evidence, uncertainty, corrections, and before/after organization. Only after that works should we consider moving high-volume production decisions to Jev.
