<!-- research-library/research/research-textual-planning.md -->

https://arxiv.org/pdf/2602.04557

---

# BuildOS Analysis: Textual Planning with Latent Transitions

> **Paper:** EMBEDPLAN: Textual Planning with Explicit Latent Transitions
> **Relevance to BuildOS:** ⭐⭐⭐⭐ (High — Brain Dump & Task Planning)
> **Date Analyzed:** 2026-02-05

## TL;DR

This paper introduces **EMBEDPLAN** — a way to predict "what comes next" in a planning sequence using **embeddings** instead of generating text token-by-token. Key findings:

1. **Near-perfect interpolation** (99.7%) — if you've seen similar states, you can predict next states
2. **Moderate extrapolation** (54.6%) — generalizes somewhat to new problem configurations
3. **Zero cross-domain transfer** (6.6%) — learning one domain doesn't help with others
4. **The bottleneck is domain-specific knowledge**, not within-domain reasoning

## What EMBEDPLAN Does

Instead of generating "next state" text autoregressively:

```
State + Action → LLM generates → Next State (slow, expensive)
```

EMBEDPLAN:

```
State + Action → Embed → Lightweight Transition Network → Predict Next Embedding → Retrieve from candidates (fast, cheap)
```

**Key insight:** The transition function (state + action → next state) can be learned in embedding space with a tiny model (<500K params), avoiding expensive LLM calls.

## The Generalization Hierarchy

| Protocol      | Performance | What it Tests                          |
| ------------- | ----------- | -------------------------------------- |
| Interpolation | 99.7%       | Same problems, held-out steps          |
| Plan-Variant  | 51.2%       | Same problems, different optimal paths |
| Extrapolation | 54.6%       | New problem configurations             |
| Multi-Domain  | 37.2%       | All domains jointly                    |
| Leave-One-Out | 9.2%        | Train on 8 domains, test on 9th        |
| Cross-Domain  | 6.6%        | Train on A, test on B                  |

**Critical insight:** Once you've seen a domain's dynamics, you can extrapolate reasonably. But learning from one domain provides ZERO benefit for another.

## Why Cross-Domain Transfer Fails

Embeddings cluster by **surface form**, not **structural role**:

- "pick-up(BlockA)" and "board(Car1)" share the same abstract schema
- But embeddings place them in distant regions because the text is different
- This is a fundamental limitation of frozen LLM embeddings

## Key Insights for BuildOS

### 1. Domain-Specific Knowledge is the Bottleneck

> "The 8× jump from Cross-Domain (6.6%) to Single-Domain Extrapolation (54.6%) far exceeds the 1.8× gain from Extrapolation to Interpolation (99.7%)."

**BuildOS Application:**

- Don't expect a generic "task planning" model to work across all users
- **Personalization is key** — learn each user's domain/patterns
- Once you understand a user's workflow, you can extrapolate well

### 2. State Transitions Can Be Predicted in Embedding Space

The paper proves that: State + Action → Next State can be learned with a tiny network.

**BuildOS Application for Brain Dump:**

```
Current Brain State + User Input → Predicted Next State (tasks extracted, projects created)
```

Instead of generating extraction results from scratch, could we learn transition patterns?

### 3. Contrastive Learning for Action Disambiguation

Two losses used:

- **State prediction**: Pull predictions toward correct next states
- **Action disambiguation**: Distinguish effects of different actions on same state

**BuildOS Application:**

- When multiple actions are possible (create task vs create project vs add context), learn to disambiguate
- Train on: given this brain dump state, what action leads to what outcome?

### 4. 5-Minute Context is Sufficient (Corroborates ProAgentBench)

> "Teacher forcing decouples transition quality from compounding state-distribution drift"

**BuildOS Application:**

- Short context windows work for transition prediction
- Avoid feeding entire conversation history — it adds noise

### 5. Multi-Domain Training Retains Capability

> "A unified model achieves 37.2%, underperforming single-domain specialists by 17 pp but retaining meaningful capability across all nine domains without catastrophic forgetting."

**BuildOS Application:**

- A single model CAN handle multiple user types/workflows
- Trade-off: generalist vs specialist
- Consider user-specific fine-tuning for power users

## Limitations to Note

1. **Requires candidate pool**: Predictions retrieve from pre-enumerated states
    - BuildOS equivalent: need to define what possible "next states" exist

2. **Template language**: Tested on structured PDDL descriptions, not free-form text
    - Brain dumps are messy — may perform differently

3. **Frozen embeddings**: No fine-tuning of the encoder
    - Fine-tuning might improve cross-domain transfer

## Actionable Ideas for BuildOS

### Brain Dump Processing

1. **Frame brain dump processing as state transitions:**
    - State: Current parsed brain dump (raw text, extracted items so far)
    - Action: User adds more text, confirms extraction, rejects suggestion
    - Next State: Updated extraction with new items

2. **Learn transition patterns:**
    - "When user mentions 'tomorrow' after a task, add deadline"
    - "When user mentions a person after a task, add as assignee"
    - These are learnable state transitions

3. **Use contrastive learning for extraction quality:**
    - Given a brain dump state, distinguish between good and bad extraction actions

### Task Planning

4. **Predict task sequences:**
    - Given project + current tasks + user goal → predict likely next task
    - Use for proactive suggestions

5. **Learn user-specific planning patterns:**
    - Each user has their own "planning domain"
    - Once you see their patterns, extrapolation works

### Technical Implementation

6. **Embed task/project states:**
    - Represent ontology entities as embeddings
    - Learn lightweight transition models per user or user-type

7. **Action disambiguation for agentic chat:**
    - User says "add this" — is it a task, subtask, project, or context?
    - Learn to disambiguate based on state + input patterns

## Connection to State-Aware Agents Paper

These papers complement each other:

- **State-Aware Agents**: Agents need explicit state, not just conversation history
- **EMBEDPLAN**: State transitions can be predicted efficiently in embedding space

**Combined insight:** Build agentic chat with:

1. Explicit state representation (from State-Aware paper)
2. Lightweight transition prediction (from EMBEDPLAN)
3. Proactive timing detection (from ProAgentBench)

## Key Quotes

> "Frozen embeddings support generalization primarily after exposure to the target domain's dynamics, enabling meaningful extrapolation within a domain once its transition structure has been observed."

> "The gap structure reveals that acquiring domain-specific transition knowledge, not generalizing within domains, is the primary bottleneck."

> "Embeddings cluster by problem instance rather than structural role, placing functionally equivalent states in distant regions when variable names differ."

---

_Original paper content below_

---

Textual Planning with Explicit Latent Transitions
Eliezer Shlomi _ 1 Ido Levy _ 2 Eilam Shapira 1 Michael Katz 2 Guy Uziel 2 Segev Shlomov 2 Nir Mashkif 2
Roi Reichart 1 Sarah Keren 1
Abstract
Planning with LLMs is bottlenecked by tokenby-token generation and repeated full forward
passes, making multi-step lookahead and rolloutbased search expensive in latency and compute.
We propose EMBEDPLAN, which replaces autoregressive next-state generation with a lightweight
transition model operating in a frozen language
embedding space. EmbedPlan encodes natural
language state and action descriptions into vectors,
predicts the next-state embedding, and retrieves
the next state by nearest-neighbor similarity, enabling fast planning computation without finetuning the encoder. We evaluate the next state prediction across 9 classical planning domains using
six evaluation protocols of increasing difficulty:
Interpolation, Plan-Variant, Extrapolation, MultiDomain, Cross-Domain, and Leave-One-Out. Results show near-perfect interpolation performance
but a sharp degradation when generalization requires transfer to unseen problems or unseen domains; Plan-Variant evaluation indicates generalization to alternative plans rather than memorizing seen trajectories. Overall, frozen embeddings
support within-domain dynamics learning after
observing a domain’s transitions, while transfer
across domain boundaries remains a bottleneck.

1. Introduction
   Planning with large language models requires generating action sequences token-by-token, invoking full forward passes
   per decision. This makes multi-step lookahead and rolloutbased search, essential for robust, long-horizon planning,
   prohibitively expensive in latency and cost. The bottleneck is fundamental: without a compact transition function
   that predicts how actions transform states, planners cannot
   \*Equal contribution 1Technion – Israel Institute of Technology, Haifa, Israel 2
   IBM, Haifa, Israel. Correspondence
   to: Eliezer Shlomi <Eliezer@campus.technion.ac.il>, Ido Levy
   <Ido.Levy1@ibm.com>.
   Preprint. February 5, 2026.
   cheaply evaluate alternatives or backtrack from errors.
   Although efforts have addressed this via prompting-based
   reasoning (Wei et al., 2022; Yao et al., 2023; 2022), symbolic compilation to Planning Domain Definition Language
   (PDDL) (Liu et al., 2023; Guan et al., 2023; Oswald et al.,
   2024; Tantakoun et al., 2025; Zuo et al., 2025), and end-toend latent world models (Ha & Schmidhuber, 2018; Hafner
   et al., 2020; Schrittwieser et al., 2020), a key opportunity
   remains: can we leverage pre-trained language embeddings
   to construct efficient transition functions? Replacing autoregressive generation with lightweight operations in a frozen
   embedding space offers an architectural path toward reduced
   planning computation at inference time.
   We introduce EMBEDPLAN, a framework that learns explicit transition dynamics directly in frozen LLM embedding space over text-described planning domains. Rather
   than generating next states autoregressively, EMBEDPLAN
   encodes natural language state descriptions (e.g., “Block
   A is on B, Block C is clear”) and action descriptions (e.g.,
   pick-up(C)) into vectors, trains a lightweight network
   (<500K parameters) to predict next-state embeddings, and
   retrieves candidates by cosine similarity (Figure 1). EMBEDPLAN training combines two contrastive objectives:
   state prediction, which learns to identify correct next states
   among candidates, and action disambiguation, which learns
   to distinguish the effects of different actions applied to the
   same state. Together, these losses enable both accurate
   retrieval and fine-grained action semantics. This architecture decouples semantic understanding, handled by frozen
   pre-trained language encoders, from dynamics prediction,
   handled by learned transition networks, collapsing the need
   of expensive LLM calls into cheap embedding space operations while enabling modular updates and test-time verification. We isolate and characterize what frozen pretrained
   embeddings can support for transition learning, independent of search algorithms or symbolic compilation. We
   hypothesize that LLM embeddings encode sufficient structural regularities to support generalizable transition learning
   when planning problems are rendered as natural language.
   We evaluate the next state prediction ability of EMBEDPLAN across 9 classical planning domains from ACPBENCH (Kokel et al., 2025a), each rendered as natural
   1
   arXiv:2602.04557v1 [cs.CL] 4 Feb 2026
   Textual Planning with Explicit Latent Transitions
   Figure 1. EmbedPlan: Latent Transition Learning. (A) Planning domains define state transitions as linguistic triplets (s, a, s′
   ):
   the Blocksworld action pick-up(C) transforms the textual state description from “arm is empty, C is clear” to “arm is holding C.”
   (B) EMBEDPLAN encodes states and actions via frozen LLM embeddings, then trains a lightweight transition network Tθ to predict
   next-state embeddings. Contrastive learning (InfoNCE) pulls predictions toward ground-truth states while pushing away negatives;
   inference retrieves the nearest candidate.
   language state descriptions within a cumulative dataset of
   over 3 million transitions, using six protocols: Interpolation
   split (interpolation within problem manifolds), Extrapolation split (extrapolation to new problems), Cross-Domain
   transfer, Multi-Domain learning, and Leave-One-Out generalization. We compare Llama-3.3-70B (4096-dim) and allmpnet-base-v2 (768-dim) sentence embeddings, measuring
   next-state retrieval accuracy (Hit@k) across all conditions.
   Our experiments reveal a sharp capability boundary for latent transition learning in frozen embedding spaces. Within
   known problem manifolds, EMBEDPLAN achieves nearperfect next-state retrieval (99.7% Hit@5 under Interpolation), showing that pretrained embeddings are sufficient for
   learning accurate dynamics when train and test share the
   same underlying instances. However, this ability degrades
   substantially when generalization requires structural transfer: performance drops to 54.6% on unseen problem configurations (Extrapolation; a 45.2 pp gap), and transfer across
   domain boundaries fails, with Cross-Domain reaching only
   6.6% Hit@5 (+2.7 pp above the 3.9% untrained baseline)
   and Leave-One-Out achieving just 9.2% on the held-out
   ninth domain. Importantly, the within-domain generalization is not explained by memorizing training-set plans: in
   the Plan-Variant setting, where test problems require executing alternative optimal solution paths for the same underlying instances, EMBEDPLAN still achieves 51.2% mean
   complete plan execution, indicating that it learns reusable
   action-conditioned dynamics rather than merely replaying
   trajectories. Together, these results confirm that frozen embeddings support generalization primarily after exposure to
   the target domain’s dynamics, enabling meaningful extrapolation within a domain once its transition structure has been
   observed. Despite these limitations, we find two positive signals for practitioners: (i) joint training across all 9 domains
   retains meaningful performance (37.2% Hit@5) without
   catastrophic forgetting, and (ii) larger encoders consistently
   improve learnability (up to +104%).
   We make key three contributions:
1. We introduce EMBEDPLAN, a novel application of learning action-conditioned transitions in frozen LLM embedding spaces without encoder finetuning.
1. We rigorously characterize generalization boundaries via
   controlled protocols (interpolation, plan variation, extrapolation, and transfer), establishing a reusable evaluation
   methodology for latent dynamics models.
1. We establish a six-protocol hierarchy across 9 domains
   and 4 encoders for standardized evaluation.
1. Related Work
   Prompting-based reasoning methods framed planning as
   iterative generation over intermediate thoughts. Wei et al.
   (2022) showed that chain-of-thought prompting elicits multistep rationales from large models, and building on this idea,
   Yao et al. (2023) proposed tree search over candidate reasoning trajectories. Action-grounded schemes interleave
   reasoning with environment interaction, with ReAct-style
   traces enabling agents to update beliefs from observations
   (Yao et al., 2022; Shinn et al., 2023). More explicit planning
   formulations treat the LLM as a world model combined with
   2
   Textual Planning with Explicit Latent Transitions
   Monte Carlo Tree Search (Hao et al., 2023), while complementary work compiles natural language goals into PDDL
   and invokes classical solvers (Liu et al., 2023; Guan et al.,
   2023). However, these approaches rely on repeated LLM
   calls per decision, and recent critiques emphasize brittleness,
   hallucinated actions, and mismatches between generated rationales and executable plans (Kambhampati et al., 2024;
   Katz et al., 2024). EMBEDPLAN addresses this bottleneck
   by testing whether next state can be computed efficiently in
   a frozen embedding space using latent transition function.
   Early work demonstrated that planning can be done in the
   learned latent space rather than in the hand-crafted symbolic
   state space. Asai & Fukunaga (2018) introduced LATPLAN,
   which learns discrete state encodings from visual inputs via
   autoencoders and applies classical planners in latent space.
   Model-based reinforcement learning extended this by learning dynamics models that predict latent states under actions
   (Ha & Schmidhuber, 2018; Hafner et al., 2019; 2020; Schrittwieser et al., 2020). Recently, Micheli et al. (2023) applied transformer architectures to world modeling with high
   sample efficiency on Atari, while Gieselmann & Pokorny
   (2022) developed Expansive Latent Space Trees (ELAST)
   for tree search over visual dynamics. However, these methods operate in visual domains with limited action primitives.
   To our knowledge, our work is the first to translate this
   paradigm to natural language, where the transition function
   must generalize across combinatorial textual action spaces
   rather than fixed motor primitives. Unlike end-to-end training, EMBEDPLAN operates with frozen LLM embeddings
   and evaluates whether learned transition functions support
   multi-step planning across 9 classical domains, quantifying
   within-distribution success and out-of-distribution collapse.
   Object-centric architectures that factor states into entities
   and relations (Battaglia et al., 2018) and symbolic compilation to PDDL (Liu et al., 2023; Guan et al., 2023) offer complementary inductive biases for cross-domain transfer; our
   study establishes the baseline capability of unstructured text
   embeddings, quantifying the gap that structured approaches
   must close and providing a diagnostic methodology against
   which such methods can be measured.
   Sentence embedding methods target semantic similarity,
   often using contrastive objectives (Reimers & Gurevych,
   2019; Gao et al., 2021; Radford et al., 2021; Oved et al.,
   2025). Representation learning for control leverages similar contrastive signals to induce state structure (Oord et al.,
   2018; Laskin et al., 2020; Schwarzer et al., 2021), while
   JEPA-style methods predict held-out representations in an
   embedding space rather than reconstructing raw inputs (Assran et al., 2023). Retrieval-augmented models similarly rely
   on embedding space lookups for prediction (Khandelwal
   et al., 2020) and control (Humphreys et al., 2022). However, these approaches largely focus on visual/RL settings or
   general-purpose similarity, and are not evaluated as actionconditioned transition operators for planning in frozen language embedding spaces. EMBEDPLAN bridges this gap by
   learning transition functions in a frozen LLM embedding
   space and systematically evaluating generalization across
   planning domains and problem configurations.
   Classical planning benchmarks provide controlled testbeds
   (McDermott et al., 1998). ACPBENCH measures predictive
   transition accuracy and generalization across held-out problems (Kokel et al., 2025a). A recent extension, (Kokel et al.,
   2025b), introduces open-ended generative versions of these
   tasks. Compositional generalization benchmarks reveal that
   neural models often memorize training patterns (Lake &
   Baroni, 2018; Kim & Linzen, 2020). EMBEDPLAN evaluates transition learning in embedding space with explicit
   within-distribution and out-of-distribution metrics, connecting failures to embedding clustering by problem instance
   rather than generalizable structure.
1. Experimental Setup
   Task Formulation. Given a state s and action a described
   in natural language, we aim to predict the next state s
   ′
   . Let
   E : S → R
   d denote a frozen LLM encoder mapping text
   to embeddings. We train a lightweight transition network
   Tθ : R
   d × R
   d → R
   d
   to predict the next-state embedding:
   eˆs
   ′ = Tθ

E(s), E(a)

(1)
At inference, we retrieve the next state by finding the nearest
neighbor in a candidate pool C of encoded states:
sˆ
′ = arg max
s
′∈C
sim
eˆs
′ , E(s
′
)

(2)
where sim(·, ·) denotes cosine similarity. This retrieval formulation assumes access to a candidate pool, appropriate
for settings with enumerable state spaces (classical planning
benchmarks, model-based RL with discrete observations).
Data. We construct transition datasets from 9 classical
PDDL planning domains sourced from ACPBENCH (Kokel
et al., 2025a): Blocksworld, Depot, Ferry, Floortile, Goldminer, Grid, Logistics, Rovers, and Satellite. These span
manipulation, logistics, and navigation tasks with varying structural complexity. Each domain contains multiple problem instances: specific configurations of objects,
initial states, and goals (e.g., a particular arrangement of
blocks to be stacked into a target configuration). For
each problem, we obtain one or more optimal plans (up
to 100 per problem): trajectories of states connected by
actions, τ = (s1, a1, s2, a2, . . . , an−1, sn), where each action at transforms state st into successor state st+1. From
these trajectories, we extract state-action-next-state triplets
(st, at, st+1) as training examples. The dataset comprises
2,969,574 transitions across 67 problems (259,427 states),
3
Textual Planning with Explicit Latent Transitions
with per-domain counts ranging from 13,256 (Depot) to
1,248,696 (Satellite). More details in Appendix C.
Architecture. Our model (Figure 1) comprises: (1) frozen
encoder producing state and action embeddings, (2) learned
projection heads reducing dimensionality to 128, and (3) a
transition network predicting the next-state embedding. We
evaluate two transition architectures: a residual MLP that
concatenates inputs and adds a skip connection, and a hypernetwork that generates action-specific transformation parameters. Both are lightweight (<500K trainable parameters).
The residual MLP consistently outperforms the hypernetwork across encoders and protocols (Appendix G.1), so we
report MLP results throughout the paper. Full architectural
details appear in Appendix B.1 (Figure 4).
Training Objective. We train with a composite contrastive objective:
L = Lstate + λ · Laction (3)
where λ controls action disambiguation emphasis.
The state prediction loss Lstate is InfoNCE (Oord et al., 2018) over next-state candidates: given a batch of B transitions, it pulls predicted embeddings toward ground-truth
next states while pushing away other batch states. This
teaches the model which state results from a transition, capturing coarse domain dynamics.
The action disambiguation loss Laction distinguishes effects
of different actions applied to the same state. For each
transition (s, a, s′
), we apply K applicable ground actions
to s and ensure the prediction from the correct action a is
closest to ground-truth s
′
. Here K denotes fully instantiated
actions (e.g., pick-up(BlockA)); for large action sets,
we sample up to K=50. This teaches fine-grained action
semantics critical for planning. Full formulations appear in
Appendix B.2.
We set λ = 2 after grid search (Appendix B.2.3), emphasizing action disambiguation (ablation in Appendix G.2).
Training uses batch size 128, temperature τ = 0.07,
AdamW with learning rate 4 × 10−5
, and early stopping.
Training completes in ∼2 hours per domain on a single
A100.
Evaluation Protocols. We evaluate on six protocols that
measure increasingly demanding generalization capabilities
(definitions in Appendix A):
• Interpolation split: Transitions randomly assigned to
train (80%) and test (20%). The same problem instance
may contribute to both sets. This measures interpolation
within known problem manifolds.
• Plan-Variant split: Evaluate full-plan execution on alternative optimal plans for problems seen during training. Train and test share the same underlying problem
instances, but differ in the action sequences used to reach
the goal. This measures generalization to unseen solution
paths under fixed problem structure.
• Extrapolation split: Entire problems assigned to train
or test. All transitions from held-out problems are unseen during training. This measures extrapolation to new
problem configurations within a known domain.
• Cross-Domain transfer: Train on one source domain,
evaluate on a different target domain with no shared problems or domain structure. This measures zero-shot domain transfer.
• Multi-Domain learning: Train a single unified model on
all 9 domains simultaneously, evaluate on held-out problems from each domain (Problem-Grouped within each).
This measures whether a shared transition network can
serve multiple domains without catastrophic forgetting.
• Leave-One-Out (LOO) generalization: Train on 8 domains, evaluate on the held-out 9th domain. Measures
whether exposure to diverse domains enables transfer to
an unseen domain.
Metrics. We report Hit@k (k ∈ {1, 5, 10}): the proportion of queries where the correct next state ranks within the
top-k retrieved candidates. The candidate pool contains 128
states: the ground-truth next state with 127 distractors. This
controlled retrieval setting enables precise measurement
of discriminative capability; practical deployment would
require either pre-enumerated state spaces or generative
mechanisms to produce candidates extensions we identify
as future work. Under Interpolation, distractors are sampled uniformly from all domain states. Under Extrapolation,
distractors are sampled exclusively from the same problem
instance as the query state, ensuring that all candidates share
the same object vocabulary and structural context. This design makes Extrapolation strictly harder: the model must
distinguish among states within a single problem’s manifold rather than across heterogeneous configurations . An
untrained model with random weights (Appendix D.6) establishes chance-level performance as a lower bound for
comparison.
We emphasize Hit@5 for two reasons. First, multiple optimal plans exist per problem, so Hit@1 can penalize predictions that correspond to alternative valid trajectories rather
than genuine errors. Second, our lightweight architecture
naturally enables beam search over multiple candidate futures at inference time, where ensuring the ground truth
ranks within the beam matters more than perfect top-1 accuracy. We report Hit@1 throughout for completeness.
4
Textual Planning with Explicit Latent Transitions
Table 1. Encoder Comparison. Hit@5 (%) for interpolation
and extrapolation. Extrapolation varies by 2× across encoders.
Gap significance: ∗∗∗p<0.001,
∗∗p<0.01 (paired t-test, n=9 domains). Full statistical analysis including effect sizes appears in
Appendix E.
Encoder Dim Interp. Extrap. Gap
MPNet 768 70.0±44 26.8±19 43∗∗
BGE-M3 1,024 99.6±0.5 36.3±15 63∗∗∗
Qwen2.5-7B 3,584 99.5±0.6 47.7±15 52∗∗∗
Llama-3.3-70B 8,192 99.7±0.4 54.6±17 45∗∗∗ 4. Results
We evaluate whether frozen LLM embeddings support generalizable transition learning.. Results report the best configuration, averaged over 3 seeds. More details in Appendix D.
Figure 2. PCA of sampled transitions from three domains. States s
(◦), predictions sˆ
′
(△), and ground-truth s
′
(□); dashed lines link
each prediction to its source state. Interpolation, BGE-M3.
Transition Learning with Frozen Embeddings We evaluate two generalization settings: interpolation (Interpolation
split, predicting held-out steps from partially observed problems) and extrapolation (Extrapolation split, generalizing to
entirely unseen problem configurations). Table 1 presents
results for four encoder sizes (Appendix B.1.1).
Under the Interpolation split, analogous to masked language
modeling where the model predicts held-out planning steps
from partially observed problems, models with expressive
embeddings achieve near-perfect performance: Llama-3.3-
70B attains 99.7% Hit@5. This establishes that frozen LLM
embeddings encode sufficient structure to support dynamics
learning without task-specific fine-tuning. Visualizations of
0 25 50 75 100
Hit@5 (%)
Depot
Ferry
Satellite
Blocksworld
Logistics
Rovers
Floortile
Grid
Goldminer
26
41
48
49
54
54
69
75
76
Baseline (3.9%)
Figure 3. Extrapolation by Domain (Llama-3.3-70B). Hit@5
(%) under Problem-Grouped evaluation. Dashed line: untrained
baseline (3.9%). Error bars: ± SE.
learned transitions confirm this finding: as shown in Figure 2, predicted next-state embeddings consistently land
near ground-truth embeddings in PCA projections, demonstrating that the transition network learns accurate displacement vectors in the latent space.
Under Extrapolation evaluation, Llama-3.3-70B achieves
54.6%, a 45 pp decline from interpolation but still 14 ×
above the 3.9% untrained baseline. This substantial improvement over chance indicates that models learn transferable
domain structure, not merely problem-specific memorization. However, the consistent gap across encoders reveals
that roughly half of predictive capability relies on problemspecific patterns that do not transfer to novel configurations.
This gap is amplified by our evaluation design: Extrapolation distractors come from the same problem instance, forcing discrimination among structurally similar configurations.
Scaling embedding dimension improves extrapolation, from
26.8% (MPNet, 768-d) to 54.6% (Llama-3.3-70B, 8,192-
d), with diminishing returns: the gain from Qwen2.5-7B
to Llama-3.3-70B (+6.9 pp) is smaller than earlier scaling
steps, suggesting a plateau larger embeddings cannot bridge.
Figure 3 shows extrapolation varies substantially across domains (26%–76%). Complete per-domain results appear
in Table 8. Grid-based domains with predictable spatial
dynamics (Goldminer, Grid) generalize best; domains requiring compositional multi-object reasoning (Depot) show
larger gaps. This pattern suggests that the domain structure,
not the scale, determines the difficulty of generalization. We
attribute this to embeddings encoding semantic similarity
rather than structural equivalence: the model cannot recognize that “pick-up(BlockA)” and “board(Car1)” share the
same abstract precondition-effect schema, as LLM embeddings cluster states by lexical surface form rather than the
structural role in planning (Appendix F.1).
5
Textual Planning with Explicit Latent Transitions
Table 2. Single-Step Transition Prediction (Interpolation Split, Llama-3.3-70B). Next State Prediction: whether the ground-truth next
state is in top-k retrieved candidates. Action Disambiguation: whether, among all actions applied to s, the correct action a produces the
prediction closest to ground-truth s
′
. High Acc@5 (85.3%) confirms the model captures action-specific transformation patterns.
Next State Prediction (%) Action Disambiguation (%)
Domain Hit@1 Hit@5 Hit@10 Acc@1 Acc@5 Acc@10
Blocksworld 94.6 ± 0.4 100.0 ± 0.0 100.0 ± 0.0 25.9 ± 0.9 88.6 ± 0.2 99.5 ± 0.1
Depot 76.9 ± 1.2 98.8 ± 0.1 99.4 ± 0.1 29.8 ± 2.3 82.2 ± 2.1 93.3 ± 1.4
Ferry 98.5 ± 0.2 100.0 ± 0.0 100.0 ± 0.0 43.1 ± 0.8 96.8 ± 0.1 99.8 ± 0.0
Floortile 97.9 ± 0.4 99.6 ± 0.0 99.8 ± 0.0 37.1 ± 2.8 86.5 ± 1.9 97.3 ± 0.8
Goldminer 93.8 ± 0.8 100.0 ± 0.0 100.0 ± 0.0 17.0 ± 0.5 73.3 ± 0.6 97.4 ± 0.2
Grid 90.1 ± 0.2 99.8 ± 0.1 99.9 ± 0.0 28.6 ± 0.2 86.7 ± 0.1 96.4 ± 0.3
Logistics 93.4 ± 0.6 99.9 ± 0.1 99.9 ± 0.0 25.1 ± 2.0 81.3 ± 3.8 94.0 ± 1.9
Rovers 86.0 ± 0.8 99.0 ± 0.1 99.6 ± 0.1 26.1 ± 1.5 73.9 ± 1.4 86.3 ± 0.7
Satellite 97.6 ± 0.2 99.9 ± 0.0 100.0 ± 0.0 55.0 ± 1.7 98.5 ± 0.3 99.9 ± 0.0
Mean 92.1 ± 6.5 99.7 ± 0.4 99.8 ± 0.2 32.0 ± 11.4 85.3 ± 8.3 96.0 ± 4.1
Single-Step Prediction and Action Disambiguation Table 2 provides a detailed per-domain breakdown of singlestep transition prediction under the Interpolation split, reporting Hit@k for k ∈ {1, 5, 10}. The results confirm
consistent interpolation success across all nine domains,
with Hit@5 exceeding 98.8% in every case. Hit@1 performance is similarly strong (mean 92.1%), though Depot
emerges as an outlier with the lowest Hit@1 (76.9%). Notably, this same domain exhibits the weakest extrapolation
performance (26%), suggesting that Depot’s complex multiobject interactions pose semantic state representation challenges even within known (trained) problem manifolds.
Beyond next-state prediction, we evaluate whether the transition network captures fine-grained action semantics through
an action disambiguation task. For each test transition
(s, a, s′
), we apply all possible actions to state s, producing a set of candidate next-state predictions {sˆ
′
a1
, . . . , sˆ
′
ak
}
where each prediction corresponds to a different action. We
then check whether the ground-truth next state s
′
is closest
to the prediction from the correct action a, rather than to
predictions from distractor actions. This tests whether the
model distinguishes the causal effect of the applied action
from plausible alternatives, validating that our transition
model understands action-space implications when faced
with fine-grained distractors.
Action disambiguation achieves strong performance: mean
Acc@5 reaches 85.3%, indicating the model correctly identifies the applied action among the top-5 candidates in
most cases. This confirms that the transition network
learns action-specific transformation patterns, not merely
generic state-to-state mappings. Notably, Satellite achieves
98.5% Acc@5 while Goldminer shows lower action accuracy (73.3%) , suggesting that some domains have more
distinguishable action effects than others. The gap between
Hit@1 (92.1%) and Acc@1 (32.0%) reveals that while the
model reliably predicts correct next states, pinpointing the
exact action among fine-grained alternatives remains challenging at strict thresholds. Qualitative error analysis reveals
that incorrect retrievals often share the query’s problem instance and differ by one or two predicates, suggesting the
model captures coarse dynamics but struggles with finegrained predicate-level precision (examples in Appendix J).
Full Plan Execution The single-step results above evaluate isolated transitions. To assess multi-step reliability, we
evaluate full plan execution under teacher forcing, intentionally isolating transition quality from error accumulation
dynamics to enable clean capability measurement. Given
an optimal plan π = (a1, . . . , an) for a problem, we iterate
from s0 and, at each step t, retrieve the top-k successor candidates for (st−1, at) and record whether the ground-truth
successor st appears in the top-k (Hit@k). We then feed
the ground-truth st as input to the next step. Teacher forcing decouples transition quality from compounding statedistribution drift, so this measures whether the correct successor stays within the retrieval beam throughout the plan.
Table 3. Plan-Variant Split Evaluation, Llama-3.3-70B. Mean
and exact plan execution under Hit@5.
Domain Mean Exact
Blocksworld 38.7 ± 0.8 1.6 ± 0.2
Depot 30.1 ± 2.6 11.2 ± 1.5
Ferry 71.1 ± 1.1 39.1 ± 1.6
Floortile 74.1 ± 2.7 33.6 ± 3.3
Goldminer 55.4 ± 2.2 23.8 ± 1.6
Grid 55.0 ± 2.4 37.4 ± 2.2
Logistics 52.8 ± 0.6 14.1 ± 2.0
Rovers 26.5 ± 0.8 10.0 ± 0.7
Satellite 56.8 ± 1.2 32.2 ± 1.0
Mean 51.2 ± 16.6 22.6 ± 13.7
This evaluation introduces a subtle generalization challenge
6
Textual Planning with Explicit Latent Transitions
that we term the Plan-Variant split. We test on alternative
optimal plans for problems seen during training: since multiple optimal solutions may exist for the same problem, train
and test trajectories can differ even when derived from the
same underlying instance. The model thus encounters novel
action sequences not observed during training, testing latent
planning generalization across equivalent solution paths.
Table 3 reports plan-level performance under two metrics.
Mean measures the average per-step Hit@5 across the plan,
while Exact requires every step to succeed (a single failure yields 0). The gap between Mean (51.2%) and Exact
(22.6%) reflects compounding errors over multi-step rollouts: even moderate per-step failure rates accumulate to
substantially reduce whole-plan success.
Performance varies markedly by domain. Ferry and Floortile achieve the highest Exact rates (39.1% and 33.6%),
while Blocksworld collapses to 1.6% Exact despite reasonable Mean (38.7%). We attribute this sensitivity to two
factors: (1) state similarity, as domains like Blocksworld
contain many near-identical configurations differing only in
object arrangements, making disambiguation difficult; and
(2) sparse coverage of critical transitions, it possible that certain planning phases (e.g., intermediate stack configurations)
may be underrepresented in training trajectories, causing
failures precisely where precision matters most. Crucially,
the Plan-Variant split tests on alternative optimal plans for
training problems, action sequences the model never observed. That Mean remains above 50% under this condition
provides evidence against pure trajectory memorization: the
model captures transferable transition dynamics rather than
simply replaying seen action sequences. The gap between
Mean (51.2%) and Exact (22.6%) quantifies potential error accumulation: even without closed-loop compounding,
moderate per-step failures substantially reduce whole-plan
success, indicating that deployment in planning systems
would require error recovery mechanisms. Plan-level results
for other encoders appear in Appendix D.7.
Transfer Across Domain Boundaries Established withindomain learning potential, we ask whether learned dynamics
transfer across domains. Table 4 presents a generalization hierarchy spanning chance-level to near-perfect performance.
Zero-shot transfer fails almost completely. Cross-Domain
achieves only 6.6%, merely +2.7 pp above chance. The complete 9×9 transfer matrix (Table 10) reveals that the only
notable success is Ferry→Logistics (22.3%), attributable
to shared transportation semantics in their state descriptions. Leave-One-Out fares little better at 9.2% despite
training on eight related domains (Table 11). This failure underscores a fundamental limitation: although all
PDDL domains share discrete state spaces, typed objects,
and precondition-effect schemas, latent planners trained on
Table 4. Generalization Hierarchy. Hit@5 (%) across protocols
of increasing difficulty. Cross-Domain and LOO barely exceed the
3.9% baseline, indicating near-zero transfer. Per-protocol breakdowns in Appendix D.
Protocol Hit@5 ∆ Setting
Untrained 3.9±0.1 — Chance
Cross-Domain 6.6±0.5 +2.7 A→B
Leave-One-Out 9.2±1.2 +5.3 8→1
Multi-Domain (Ex.) 37.2±3.8 +33 Joint
Single-Domain (Ex.) 54.6±5.5 +51 New probs
Plan-Variant 51.2±16.6 +47 New plans
Single-Domain (In.) 99.7±0.1 +96 Same probs
frozen embeddings capture essentially none of this structural commonality. Pre-trained embeddings support generalization only when training provides exposure to the target
domain; they cannot transfer successfully to novel domain
structures. We attribute this transfer failure partly to the
domain-specificity of learned action semantics. While the
action disambiguation loss substantially improves withindomain generalization (Appendix G.2), it does so by learning fine-grained distinctions among a domain’s actions, e.g.,
that pick-up(A) clears Block A while stack(A,B)
does not. These learned distinctions are inherently tied to
the source domain’s action space and provide limited benefit
when the target domain uses different actions.
The gap structure reveals the bottleneck in latent planning.
The 8× jump from Cross-Domain (6.6%) to Single-Domain
Extrapolation (54.6%) far exceeds the 1.8× gain from Extrapolation to Interpolation (99.7%). Acquiring domainspecific transition knowledge accounts for most of the difficulty; once a model has seen a domain’s dynamics, it
extrapolates reasonably to new problems within that domain. Learning from one domain, however, provides limited benefit for another. Training on all domains jointly
offers a partial solution, as a unified model achieves 37.2%,
underperforming single-domain specialists by 17 pp but retaining meaningful capability across all nine domains without catastrophic forgetting (Table 12). This gap represents
the cost of generality, where a single model substitutes for
nine specialists while preserving two-thirds of their average
performance, confirms the model captures action-specific
transformation patterns across domains. 5. Conclusion
This research introduces EMBEDPLAN, a framework for
learning transition dynamics in frozen LLM embedding
space, systematically evaluated across 9 planning domains,
4 encoders, and 6 generalization protocols. Our study
demonstrates that frozen embeddings can support transition
learning within known problem manifolds but fail to gener7
Textual Planning with Explicit Latent Transitions
alize beyond them. Our findings delineate a sharp capability
boundary: near-perfect interpolation (99.7%), meaningful
extrapolation (54.6%, 14× above chance), and near-zero
cross-domain transfer (6.6%). These results establish when
frozen embeddings suffice, within-domain applications with
sufficient training coverage, and when they do not, zero-shot
transfer to novel domains.
The gap structure reveals that acquiring domain-specific
transition knowledge, not generalizing within domains, is
the primary bottleneck. Once exposed to a domain’s dynamics, models extrapolate reasonably to new problems;
learning from one domain, however, provides essentially no
benefit for another. We attribute this to how embeddings
cluster by problem instance rather than structural role, placing functionally equivalent states in distant regions when
variable names differ. This geometric fragmentation persists
across encoder scales, confirming the limitation is architectural rather than capacity-based.
Plan-level evaluation provides evidence against pure trajectory memorization: models generalize to alternative optimal plans for training problems, suggesting they capture
transferable transition dynamics rather than simply replaying observed sequences. Moreover, multi-domain training
retains meaningful capability across all domains without
catastrophic forgetting, indicating that a unified latent space
can encode multiple transition functions simultaneously into
universal latent planner.
5.1. Limitations and Future Work
We evaluate classical domains with templated descriptions;
free-form language may behave differently. The framework
uses frozen embeddings only; fine-tuning might address
the clustering failure. Our retrieval formulation assumes
pre-enumerated candidate pools, limiting applicability to
open-ended generation settings. Training uses in-batch negatives sampled across problems while Extrapolation evaluation uses within-problem distractors; aligning these distributions during training may improve generalization. We
do not benchmark wall-clock latency against autoregressive
LLM planners, nor compare against symbolic compilation
or object-centric dynamics models—such comparisons require end-to-end planning benchmarks beyond our diagnostic scope. Our plan-level evaluation uses teacher forcing
to isolate transition quality; closed-loop evaluation with error accumulation remains future work. While our action
disambiguation objective improves within-domain generalization, it learns domain-specific semantics that do not
transfer across domain boundaries.
Several future directions emerge. First, embedding clustering by problem instance rather than structural role motivates planning-aware fine-tuning that groups functionally
equivalent states regardless of variable names. Second,
object-centric architectures that factor states into entities
and relations may better capture compositional structure,
for multi-object domains. Third, the action disambiguation loss improves within-domain generalization but learns
domain-specific semantics; action abstraction mechanisms
that recognize shared operation types across domains (e.g.,
mapping “pick-up” and “board” to an abstract “acquire”
schema) could improve cross-domain transfer. Finally, beyond pre-enumerated settings, predicted embeddings could
guide constrained decoders to generate candidate states dynamically during search at runtime. Finally, the quantified
capability boundary serves as a calibration for compositional
generalization, defining frozen-representation limits.
Impact Statement
This paper characterizes capability boundaries for learning
transition dynamics in frozen language embedding space.
By replacing token-by-token generation with embeddingspace prediction and retrieval, such methods could reduce
computational cost for planning within known domains
where state spaces are enumerable. Our experiments evaluate next-state retrieval accuracy in classical planning benchmarks rather than end-to-end decision-making or wall-clock
latency in deployed systems.
Our experiments are limited to classical planning domains
rendered as templated natural language and evaluate nextstate retrieval accuracy rather than end-to-end decisionmaking in real-world environments. Accordingly, we focus
on the most direct and tractable impacts of this contribution, rather than the full space of downstream applications.
The primary risks are indirect. First, overstating generalization could motivate use in higher-stakes settings despite our
findings of substantial out-of-distribution degradation and
near-zero cross-domain transfer. Second, embedding-based
retrieval may amplify sensitivity to surface form, leading
to brittle behavior under paraphrase, underspecification, or
distribution shift. Third, while the method amortizes runtime cost via cached embeddings and inexpensive transition
prediction, large-scale embedding extraction can still incur
nontrivial computational overhead.
We do not introduce new data collection involving human
subjects, nor do we target applications that directly affect
individuals’ rights or access to resources. As mitigation,
we explicitly characterize failure modes across increasingly challenging generalization protocols and recommend
that any practical use treat learned transitions as components requiring domain-specific validation, monitoring, and
guardrails. Future work should evaluate robustness to freeform language, incorporate uncertainty estimation and abstention mechanisms, and investigate representations that
better align embedding geometry with structural planning
constraints to reduce brittleness under distribution shift.
8
Textual Planning with Explicit Latent Transitions
References
Asai, M. and Fukunaga, A. Classical planning in deep
latent space: Bridging the subsymbolic-symbolic boundary. In Proceedings of the aaai conference on artificial
intelligence, volume 32, 2018.
Assran, M., Duval, Q., Misra, I., Bojanowski, P., Vincent,
P., Rabbat, M., LeCun, Y., and Ballas, N. Self-supervised
learning from images with a joint-embedding predictive
architecture. In Proceedings of the IEEE/CVF Conference
on Computer Vision and Pattern Recognition, pp. 15619–
15629, 2023.
Battaglia, P. W., Hamrick, J. B., Bapst, V., SanchezGonzalez, A., Zambaldi, V., Malinowski, M., Tacchetti,
A., Raposo, D., Santoro, A., Faulkner, R., et al. Relational inductive biases, deep learning, and graph networks.
arXiv preprint arXiv:1806.01261, 2018.
Gao, T., Yao, X., and Chen, D. Simcse: Simple contrastive
learning of sentence embeddings. In Proceedings of the
2021 Conference on Empirical Methods in Natural Language Processing, pp. 6894–6910, 2021.
Gieselmann, R. and Pokorny, F. T. Latent planning via
expansive tree search. Advances in Neural Information
Processing Systems, 35:16821–16835, 2022.
Guan, L., Valmeekam, K., Sreedharan, S., and Kambhampati, S. Leveraging pre-trained large language models to
construct and utilize world models for model-based task
planning. Advances in Neural Information Processing
Systems, 36:79081–79094, 2023.
Ha, D. and Schmidhuber, J. Recurrent world models facilitate policy evolution. Advances in neural information
processing systems, 31, 2018.
Ha, D., Dai, A. M., and Le, Q. V. Hypernetworks. In
International Conference on Learning Representations, 2017. URL https://openreview.net/forum?
id=rkpACe1lx.
Hafner, D., Lillicrap, T., Fischer, I., Villegas, R., Ha, D.,
Lee, H., and Davidson, J. Learning latent dynamics for
planning from pixels. In International conference on
machine learning, pp. 2555–2565. PMLR, 2019.
Hafner, D., Lillicrap, T., Ba, J., and Norouzi, M. Dream
to control: Learning behaviors by latent imagination. In
International Conference on Learning Representations, 2020.
Hao, S., Gu, Y., Ma, H., Hong, J., Wang, Z., Wang, D., and
Hu, Z. Reasoning with language model is planning with
world model. In Proceedings of the 2023 Conference on
Empirical Methods in Natural Language Processing, pp.
8154–8173, 2023.
Humphreys, P., Guez, A., Tieleman, O., Sifre, L., Weber, T.,
and Lillicrap, T. Large-scale retrieval for reinforcement
learning. Advances in Neural Information Processing
Systems, 35:20092–20104, 2022.
Kambhampati, S., Valmeekam, K., Guan, L., Verma, M.,
Stechly, K., Bhambri, S., Saldyt, L. P., and Murthy, A. B.
Position: Llms can’t plan, but can help planning in llmmodulo frameworks. In Forty-first International Conference on Machine Learning, 2024.
Katz, M., Kokel, H., Srinivas, K., and Sohrabi Araghi,
S. Thought of search: Planning with language models
through the lens of efficiency. Advances in Neural Information Processing Systems, 37:138491–138568, 2024.
Khandelwal, U., Levy, O., Jurafsky, D., Zettlemoyer, L., and
Lewis, M. Generalization through memorization: Nearest
neighbor language models. In International Conference
on Learning Representations, 2020.
Kim, N. and Linzen, T. Cogs: A compositional generalization challenge based on semantic interpretation. In Empirical Methods in Natural Language Processing, 2020.
Kokel, H., Katz, M., Srinivas, K., and Sohrabi, S. Acpbench: Reasoning about action, change, and planning. In
Proceedings of the AAAI Conference on Artificial Intelligence, volume 39, pp. 26559–26568, 2025a.
Kokel, H., Katz, M., Srinivas, K., and Sohrabi, S. Acpbench: Reasoning about action, change, and planning. In
Proceedings of the AAAI Conference on Artificial Intelligence, volume 39, pp. 26559–26568, 2025b.
Lake, B. and Baroni, M. Generalization without systematicity: On the compositional skills of sequence-to-sequence
recurrent networks. In International conference on machine learning, pp. 2873–2882. PMLR, 2018.
Laskin, M., Srinivas, A., and Abbeel, P. Curl: Contrastive
unsupervised representations for reinforcement learning.
In International conference on machine learning, pp.
5639–5650. PMLR, 2020.
Liu, B., Jiang, Y., Zhang, X., Liu, Q., Zhang, S., Biswas,
J., and Stone, P. Llm+ p: Empowering large language
models with optimal planning proficiency. arXiv preprint
arXiv:2304.11477, 2023.
McDermott, D., Ghallab, M., Howe, A., Knoblock, C.,
Ram, A., Veloso, M., Weld, D., and Wilkins, D. PDDL –
The Planning Domain Definition Language – Version 1.2.
Technical Report CVC TR-98-003/DCS TR-1165, Yale
Center for Computational Vision and Control, 1998.
Micheli, V., Alonso, E., and Fleuret, F. Transformers are
sample-efficient world models. In International Conference on Learning Representations, 2023.
9
Textual Planning with Explicit Latent Transitions
Muennighoff, N., Tazi, N., Magne, L., and Reimers, N.
Mteb: Massive text embedding benchmark. In Proceedings of the 17th Conference of the European Chapter of
the Association for Computational Linguistics, pp. 2014–
2037, 2023.
Oord, A. v. d., Li, Y., and Vinyals, O. Representation learning with contrastive predictive coding. arXiv preprint
arXiv:1807.03748, 2018.
Oswald, J., Srinivas, K., Kokel, H., Lee, J., Katz, M., and
Sohrabi, S. Large language models as planning domain
generators. In Proceedings of the Thirty-Fourth International Conference on Automated Planning and Scheduling (ICAPS 2024), pp. 423–431. AAAI Press, 2024.
Oved, A., Shlomov, S., Zeltyn, S., Mashkif, N., and Yaeli,
A. Snap: semantic stories for next activity prediction. In
Proceedings of the AAAI Conference on Artificial Intelligence, volume 39, pp. 28871–28877, 2025.
Perez, E., Strub, F., De Vries, H., Dumoulin, V., and
Courville, A. Film: Visual reasoning with a general conditioning layer. In Proceedings of the AAAI conference
on artificial intelligence, volume 32, 2018.
Radford, A., Kim, J. W., Hallacy, C., Ramesh, A., Goh, G.,
Agarwal, S., Sastry, G., Askell, A., Mishkin, P., Clark, J.,
et al. Learning transferable visual models from natural
language supervision. In International conference on
machine learning, pp. 8748–8763. PmLR, 2021.
Reimers, N. and Gurevych, I. Sentence-bert: Sentence embeddings using siamese bert-networks. In Proceedings
of the 2019 Conference on Empirical Methods in Natural Language Processing and the 9th International Joint
Conference on Natural Language Processing (EMNLPIJCNLP), pp. 3982–3992, 2019.
Schrittwieser, J., Antonoglou, I., Hubert, T., Simonyan, K.,
Sifre, L., Schmitt, S., Guez, A., Lockhart, E., Hassabis,
D., Graepel, T., et al. Mastering atari, go, chess and shogi
by planning with a learned model. Nature, 588(7839):
604–609, 2020.
Schwarzer, M., Anand, A., Goel, R., Hjelm, R. D., Courville,
A., and Bachman, P. Data-efficient reinforcement learning with self-predictive representations. In International
Conference on Learning Representations, 2021.
Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., and
Yao, S. Reflexion: Language agents with verbal reinforcement learning. Advances in Neural Information
Processing Systems, 36:8634–8652, 2023.
Tantakoun, M., Muise, C., and Zhu, X. LLMs as planning formalizers: A survey for leveraging large language
models to construct automated planning models. In Che,
W., Nabende, J., Shutova, E., and Pilehvar, M. T. (eds.),
Findings of the Association for Computational Linguistics: ACL 2025, pp. 25167–25188, Vienna, Austria, July 2025. Association for Computational Linguistics. ISBN
979-8-89176-256-5. doi: 10.18653/v1/2025.findings-acl. 1291. URL https://aclanthology.org/2025.
findings-acl.1291/.
Wei, J., Wang, X., Schuurmans, D., Bosma, M., Xia, F., Chi,
E., Le, Q. V., Zhou, D., et al. Chain-of-thought prompting
elicits reasoning in large language models. Advances in
neural information processing systems, 35:24824–24837, 2022.
Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan,
K. R., and Cao, Y. React: Synergizing reasoning and
acting in language models. In The eleventh international
conference on learning representations, 2022.
Yao, S., Yu, D., Zhao, J., Shafran, I., Griffiths, T., Cao, Y.,
and Narasimhan, K. Tree of thoughts: Deliberate problem
solving with large language models. Advances in neural
information processing systems, 36:11809–11822, 2023.
Zuo, M., Velez, F. P., Li, X., Littman, M., and Bach,
S. Planetarium: A rigorous benchmark for translating text to structured planning languages. In Chiruzzo,
L., Ritter, A., and Wang, L. (eds.), Proceedings of the
2025 Conference of the Nations of the Americas Chapter
of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers),
pp. 11223–11240, Albuquerque, New Mexico, April 2025. Association for Computational Linguistics. ISBN
979-8-89176-189-6. doi: 10.18653/v1/2025.naacl-long. 560. URL https://aclanthology.org/2025.
naacl-long.560/.
10
Textual Planning with Explicit Latent Transitions
A. Evaluation Protocols
These protocols form a diagnostic hierarchy for capability characterization. We deliberately isolate transition accuracy from
search algorithms, candidate generation, and latency measurement to provide clean assessment of what frozen embeddings
support. End-to-end planning evaluation, while important for deployed systems, would conflate these factors.
We evaluate EMBEDPLAN under six protocols that measure progressively more demanding generalization capabilities. Let
D = {d1, . . . , d9} denote the set of 9 planning domains. For each domain d ∈ D, let Pd = {p
d
1
, . . . , pd
nd
} denote the set of
problem instances, where nd = |Pd|. Each problem p ∈ Pd yields a set of transitions Tp = {(si
, ai
, s′
i
)}
mp
i=1 extracted from
optimal plan trajectories, where mp = |Tp|.
The complete transition set for domain d is Td =
S
p∈Pd
Tp, and the global transition set across all domains is T =
S
d∈D Td.
A.1. Protocol 1: Interpolation Split
Definition. Transitions are randomly partitioned regardless of problem or domain membership:
Td = T
train
d ∪ T test
d
, T
train
d ∩ T test
d = ∅ (4)
|T train
d
| = 0.8 · |Td|, |T test
d
| = 0.2 · |Td| (5)
where each transition (s, a, s′
) ∈ Td is assigned to train or test uniformly at random.
Key Property. For any problem p, transitions may appear in both splits:
∃ p ∈ Pd : Tp ∩ T train
d ̸= ∅ ∧ Tp ∩ T test
d ̸= ∅ (6)
Measures. Interpolation within known problem manifolds. Models can succeed by recognizing which problem instance a
state belongs to and applying memorized problem-specific transition patterns.
A.2. Protocol 2: Plan-Variant Split
Definition. Evaluate full-plan execution on alternative optimal plans for problems seen during training. Let Πp =
{π1, π2, . . . , πk} denote the set of optimal plans for problem p, where each plan πi
is a sequence of actions leading from
initial state to goal. Plans are partitioned:
Πp = Πtrain
p ∪ Π
test
p
, Π
train
p ∩ Π
test
p = ∅ (7)
T
train
p =
[
π∈Πtrain
p
Tπ, T
test
p =
[
π∈Πtest
p
Tπ (8)
where Tπ denotes the transitions extracted from plan π. Optimal plans are obtained directly from the dataset. For problems
admitting multiple optimal solutions, we partition plans such that train and test contain non-overlapping action sequences.
Problems with unique optimal plans are excluded from this protocol.
Key Property. Train and test share the same underlying problem instances, but differ in the action sequences used to reach
the goal:
∀ p ∈ Pd : P
train = P
test = Pd, but Π
train
p ∩ Π
test
p = ∅ (9)
Measures. Generalization to unseen solution paths under fixed problem structure. Models must learn transition dynamics
that transfer across different valid action sequences within the same problem, rather than memorizing specific plan trajectories.
This tests whether the model captures the underlying state-action mechanics or merely overfits to observed plans.
A.3. Protocol 3: Extrapolation Split
Definition. Problems are partitioned, and all transitions from each problem go exclusively to train or test:
Pd = P
train
d ∪ Ptest
d
, P
train
d ∩ Ptest
d = ∅ (10)
T
train
d =
[
p∈Ptrain
d
Tp, T
test
d =
[
p∈Ptest
d
Tp (11)
11
Textual Planning with Explicit Latent Transitions
with |Ptrain
d
| ≈ 0.8 · |Pd|.
Key Property. Train and test transitions come from disjoint problem sets:
∀ p ∈ Ptest
d
: Tp ∩ T train
d = ∅ (12)
Measures. Extrapolation to new problem configurations within a known domain. Models must learn transferable domain
dynamics (e.g., “pick-up removes a block from a surface”) rather than problem-specific patterns.
A.4. Protocol 4: Multi-Domain Learning (Unified Model)
Definition. Train a single model on all domains simultaneously, with Extrapolation splits within each domain:
T
train =
[
d∈D
T
train
d
, where T
train
d =
[
p∈Ptrain
d
Tp (13)
T
test =
[
d∈D
T
test
d
, where T
test
d =
[
p∈Ptest
d
Tp (14)
A single transition network T
multi
θ
is trained on T
train and evaluated per-domain:
Multi-Domain(d) = Hit@k

T
multi
θ
, T
test
d

(15)
Key Property. The model must represent 9 distinct transition functions in a shared parameter space:
T
multi
θ
: R
128 × R
128 → R
128
, ∀ d ∈ D (16)
Measures. Capacity sharing without catastrophic forgetting. Tests whether a unified 128-dimensional latent space can
encode transition dynamics for multiple domains simultaneously.
A.5. Protocol 5: Cross-Domain Transfer (Zero-Shot)
Definition. Train on one source domain, evaluate on a different target domain:
T
train = Tdsrc
, dsrc ∈ D (17)
T
test = Tdtgt , dtgt ∈ D \ {dsrc} (18)
For comprehensive evaluation, we compute performance for all source-target pairs:
Cross-Domain(dtgt) = 1
|D| − 1
X
dsrc̸=dtgt
Hit@k

T
dsrc
θ
, Tdtgt
.
(19)
where T
dsrc
θ
denotes the transition network trained on domain dsrc.
Key Property. No overlap in domains, problems, or transitions between train and test:
T
train ∩ T test = ∅, Pdsrc ∩ Pdtgt = ∅ (20)
Measures. Zero-shot domain transfer. Models must learn transition dynamics that generalize across fundamentally
different planning structures (e.g., from block manipulation to logistics).
12
Textual Planning with Explicit Latent Transitions
A.6. Protocol 6: Leave-One-Out Generalization (LOO)
Definition. Train on |D| − 1 domains, evaluate on the held-out domain:
T
train =
[
d∈D\{dheld}
Td (21)
T
test = Tdheld (22)
For comprehensive evaluation, we iterate over all held-out domains:
LOO(dheld) = Hit@k

T
D\{dheld}
θ
, Tdheld 
(23)
Key Property. Unlike Cross-Domain (single source), LOO provides maximum training diversity:
|T train| =
X
d̸=dheld
|Td| ≫ |Tdsrc
| (Cross-Domain) (24)
Measures. Transfer from diverse training to unseen domain. Tests whether exposure to 8 diverse domains enables
generalization to an entirely novel 9th domain.
A.7. Protocol Hierarchy
The six protocols form a hierarchy of increasing generalization difficulty:
Protocol Measures Shared Shared Shared Difficulty
Domain Problems Plans
Interpolation Interpolation ✓ ✓ ✓ Lowest
Plan-Variant Plan generalization ✓ ✓ ✗ Low
Extrapolation Extrapolation ✓ ✗ ✗ Medium
Multi-Domain Capacity sharing ✓ ✗ ✗ Medium
Cross-Domain Zero-shot transfer ✗ ✗ ✗ High
Leave-One-Out Diverse transfer ✗ ✗ ✗ Highest
Table 5. Evaluation protocol hierarchy by generalization difficulty.
Design Rationale. This hierarchy isolates where frozen embeddings succeed versus fail:
• Interpolation → Plan-Variant: Quantifies overfitting to specific action sequences
• Plan-Variant → Extrapolation: Quantifies the interpolation-extrapolation gap
• Extrapolation → Multi-Domain: Tests capacity sharing
• Multi-Domain → Cross-Domain/LOO: Tests zero-shot transfer
B. Experimental Setup
B.1. Architecture
Figure 4 provides a complete illustration of the EMBEDPLAN architecture.
B.1.1. FROZEN ENCODERS
States and actions are encoded using frozen pretrained language models. We experiment with four encoders spanning
different architectures and scales:
13
Textual Planning with Explicit Latent Transitions
State s
"Block A is on B..."
Action a
"pick-up(C)"
Frozen LLM
Encoder E
frozen
zs
za
768–8192d
πs
πa
learned
hs
ha
128-d
Transition
Network Tθ
hˆ
s′
Candidate
Pool C
hs
′
1
, hs
′
2
, . . .
Retrieved
sˆ
′
sim argmax
residual
InfoNCE Loss: L = − log exp(sim(hˆ
s′ , hs′ )/τ )
P
j
exp(sim(hˆ
s′ , hs
′
j
)/τ )
Figure 4. Complete EMBEDPLAN Architecture. State and action descriptions are encoded by a frozen LLM encoder E into highdimensional embeddings zs, za. Learned projection heads πs, πa reduce dimensionality to a shared 128-d space. The transition network
Tθ (with residual connection from hs) predicts the next-state embedding hˆ
s′ , trained via InfoNCE to maximize similarity to the groundtruth embedding. At inference, the model retrieves the most similar state from a candidate pool.
MPNet (all-mpnet-base-v2). A 110-million parameter sentence transformer (Reimers & Gurevych, 2019) trained on over
1 billion sentence pairs. This model produces 768-dimensional embeddings optimized for semantic similarity tasks. We use
the sentence-transformers library with default mean pooling.
BGE-M3 (BAAI/bge-m3). A state-of-the-art multilingual embedding model (568M parameters) designed for multigranularity retrieval. We utilize the dense retrieval component, which extracts 1024-dimensional embeddings from the
[CLS] token of the final layer.
Qwen2.5-7B-Instruct. A 7-billion parameter instruction-tuned autoregressive model. We extract sentence embeddings by
applying mean pooling over the final layer’s hidden states, producing 3584-dimensional embeddings.
Llama-3.3-70B-70B-Instruct. A 70-billion parameter autoregressive language model. Since decoder-only models do not
have a natural sentence embedding, we apply mean pooling over the final layer’s hidden states across all input tokens:
z =
1
T
X
T
t=1
h
(L)
t
(25)
where h
(L)
t ∈ R
8192 is the hidden state at position t in the final layer L, and T is the sequence length. Mean pooling over
decoder-only hidden states is a common approximation when dedicated sentence embeddings are unavailable (Muennighoff
et al., 2023). While task-specific pooling strategies (e.g., last-token with EOS prompting) may yield different representations,
we adopt mean pooling for consistency across autoregressive architectures and leave pooling sensitivity analysis to future
work.
Rationale for Freezing. We freeze encoders for two reasons. First, it isolates our research question: we test whether
existing pretrained representations support transition learning, without confounding this with task-specific fine-tuning that
might introduce planning structure. Second, it enables efficient experimentation: embeddings are computed once and cached,
reducing each training run from hours of LLM inference to minutes of lightweight optimization.
Pooling Strategy Rationale. We adopt mean pooling uniformly across decoder-only models for consistency, acknowledging that this is one of several reasonable choices. Instruction-tuned sentence encoders or last-token pooling with explicit
EOS prompting may yield embeddings better suited for semantic similarity; our results thus represent a lower bound on what
optimized embedding extraction could achieve. We prioritize architectural consistency across encoders over per-encoder
optimization.
B.1.2. PROJECTION HEADS
High-dimensional encoder outputs present computational and statistical challenges. We introduce learnable projection heads
that map to a lower-dimensional space where transition learning occurs.
14
Textual Planning with Explicit Latent Transitions
Each projection head is a multi-layer perceptron:
π(z) = WL σ

LN(WL−1 σ(LN(W1z)))
(26)
where σ(·) denotes GELU activation and LN(·) denotes layer normalization. We use separate projection heads for states
(πs) and actions (πa), allowing each to learn modality-specific transformations.
Default Configuration.
• Input dimension: encoder-dependent (768 for MPNet, 1024 for BGE-M3, 3584 for Qwen, 8192 for Llama)
• Output dimension: 128
• Hidden layers: 4
• Activation: GELU
• Normalization: LayerNorm after each hidden layer
B.1.3. TRANSITION NETWORK
We investigate two architectures embodying different hypotheses about how actions transform states.
Residual MLP (Primary). Our primary architecture processes the concatenated state-action representation through a
feedforward network with a residual connection:
hˆ
s
′ = LN
fθ

[hs; ha]


- Wres hs
  
  (27)
  The feedforward network fθ has architecture:
  fθ(x) = W3 σ

W2 σ(W1x)

(28)
with dimensions W1 : R
256 → R
128
, W2 : R
128 → R
128
, W3 : R
128 → R
128
.
The residual term Wreshs encodes an inductive bias: actions produce incremental modifications to states rather than
wholesale replacements. Most predicates remain unchanged after a single action; only a few flip.
HyperNetwork (Alternative). An alternative hypothesis is that different actions require fundamentally different transformations. We implement this via a hypernetwork (Ha et al., 2017) that generates action-conditioned modulation parameters:
gϕ(ha) = W(2)
g σ

W(1)
g ha

∈ R
2L·dadapt (29)
This output is split into L pairs of scale and shift vectors (Ai
, bi) for FiLM-style conditioning (Perez et al., 2018).
B.2. Training Details
B.2.1. TRAINING OBJECTIVE
We train with InfoNCE (Oord et al., 2018), a contrastive loss that operates on batches of transitions:
L = −
1
B
X
B
i=1
log
exp
sim(hˆ
s
′
i
, hs
′
i
)/τ
PB
j=1 exp
sim(hˆ
s
′
i
, hs
′
j
)/τ (30)
where sim(u, v) = u
⊤v/(∥u∥∥v∥) is cosine similarity, τ = 0.07 is temperature, and B = 128 is batch size.
In-Batch Negatives. The denominator treats all B states in the batch as candidates, with the B−1 non-matching states
serving as negatives. This provides 127 negatives per positive without additional computation.
15
Textual Planning with Explicit Latent Transitions
Why Contrastive? Contrastive learning offers advantages over regression losses: (1) scale invariance via cosine similarity,
(2) direct optimization of the retrieval objective, and (3) natural hard negative mining from same-domain states in the batch.
B.2.2. LOSS FORMULATIONS
The state prediction loss uses InfoNCE over batch elements:
Lstate = −
1
B
X
B
i=1
log
exp
sim(hˆ
s
′
i
, hs
′
i
)/τ
PB
j=1 exp
sim(hˆ
s
′
i
, hs
′
j
)/τ (31)
where sim(u, v) = u
⊤v/(∥u∥∥v∥) is cosine similarity and τ = 0.07 is temperature.
The action disambiguation loss contrasts predictions from different actions applied to the same state:
Laction = −
1
B
X
B
i=1
log exp(zi,i/τ )
PK
k=1 exp(zi,k/τ )
,
zi,k := sim
hˆ
(ak)
s
′
i
, hs
′
i

(32)
where {hˆ
(ak)
s
′ }
K
k=1 are predictions from applying each of K ground actions to state s.
B.2.3. HYPERPARAMETER CONFIGURATION
Table 6 lists the hyperparameter search space and final configuration.
Hyperparameter Values Explored
Architecture
Model Type MLP, HyperNetwork
Hidden Size 128, 256
Number of Layers 2, 4
Dropout 0.0, 0.5
Layer Normalization Yes
Loss Function
Action Loss Weight (λ) 0, 0.5, 1, 1.5, 2, 4
Projection Head
Use Projection Yes, No
Projection Dimension 128
Projection Layers 2, 4
Optimization
Learning Rate 2e-3, 1e-3, 4e-5
Batch Size 64, 128
InfoNCE Temperature (τ ) 0.07
Weight Decay 1e-2
Training
Max Epochs 400
Warmup Epochs 10
Early Stopping Patience 100
Table 6. Hyperparameter search space. Bold values indicate final configuration.
B.3. Evaluation Protocol
Hit@k Computation. For each test transition (s, a, s′
):

1. Compute predicted embedding: hˆ
   s
   ′ = Tθ(πs(zs), πa(za))
   16
   Textual Planning with Explicit Latent Transitions
2. Compute similarity to all candidates: simj = sim(hˆ
   s
   ′ , hs
   ′
   j
   ) for s
   ′
   j ∈ C
3. Rank candidates by similarity (descending)
4. Record hit if correct s
   ′
   appears in top-k
   The candidate pool C contains 128 states: the ground-truth next state plus 127 distractors sampled according to the evaluation
   protocol (uniformly from the domain for Interpolation; from the same problem instance for Extrapolation).
   Tie-Breaking. When multiple candidates have identical similarity scores, we take one of them randomly.
   Action Disambiguation. Given a state s and ground-truth next state s
   ′
   , we apply all possible actions of the domain and
   check which prediction best matches s
   ′
   :
   aˆ = arg max
   a∈A
   sim
   Tθ(hs, ha), hs
   ′
   
   (33)
   Accuracy measures how often aˆ matches the true action.
   B.4. Compute Resources
   All experiments were conducted on the following infrastructure:
   • GPU: NVIDIA A100 80GB
   • CPU: AMD EPYC 7763 64-Core Processor
   • Memory: 512GB RAM
   • Framework: PyTorch 2.1, CUDA 12.1
   Training Time.
   • Embedding extraction (per domain, Llama-3.3-70B): ∼2 hours
   • Embedding extraction (per domain, MPNet): ∼5 minutes
   • Transition network training (per domain): ∼15 minutes
   • Full experimental suite (all encoders, all protocols): ∼72 hours
   Carbon Footprint. Estimated total compute: ∼200 GPU-hours on A100. Using a carbon intensity of 0.4 kg CO2/kWh
   and A100 TDP of 400W, estimated emissions: ∼32 kg CO2.
   C. Dataset
   C.1. Dataset Statistics
   We use 9 classical PDDL domains from planning benchmarks (Kokel et al., 2025a). Table 7 summarizes the dataset. Note:
   our transition datasets are derived from ACPBench domains but involve additional processing not included in the publicly
   released dataset. We will release our processed data upon acceptance.
   C.2. State Representation
   States are rendered as natural language descriptions containing the current predicate values. Example from Blocksworld:
   “Block A is on the table. Block B is on Block A. Block C is clear. The robotic arm is empty.”
   Actions are parameterized strings (e.g., pick-up(BlockC), stack(BlockA, BlockB)).
   17
   Textual Planning with Explicit Latent Transitions
   Domain Problems States Transitions Actions
   Blocksworld 5 43,551 43,065 4
   Depot 7 5,795 13,256 5
   Ferry 10 46,205 225,300 3
   Floortile 6 33,608 166,565 6
   Goldminer 7 12,237 52,023 7
   Grid 5 8,671 664,346 5
   Logistics 7 13,373 46,866 6
   Rovers 10 46,783 509,457 9
   Satellite 10 49,204 1,248,696 4
   Total 67 259,427 2,969,574 —
   Table 7. Dataset statistics by domain.
   Blocksworld
   State s: Block block 2 is on the table, Block block 3 is located on the table, No blocks are placed on top of block 1, The block
   block 2 is currently situated under the block block 1, The robotic arm is not holding anything, and Block block 3 is clear.
   Action a: (pick-up block 3)
   Result s
   ′
   : Block block 1 is clear, Block block 2 is located on the table, The robotic arm is holding block 3, and The block block 2 is
   currently situated under the block block 1.
   C.3. Domain Descriptions
   Blocksworld. A robotic arm must rearrange colored blocks into a specified goal configuration. Only clear blocks (with
   nothing on top) can be moved. This domain is renowned for simple rules yet rich combinatorial complexity.
   Depot. Combines logistics and block stacking. Crates must be moved between depots using trucks for transportation and
   hoists for stacking/unstacking.
   Ferry. A ferry boat transports cars between locations. The ferry can carry only one car at a time, requiring optimization of
   loading/unloading sequences.
   Floortile. Robots paint floor tiles in a grid according to a target pattern. Robots must navigate while managing limited
   paint supplies and adjacency constraints.
   Goldminer. An agent navigates a grid to collect gold pieces and deliver them to goal locations while managing inventory
   limits.
   Grid. An agent moves on a 2D grid to reach target locations, potentially with obstacles restricting movement.
   Logistics. Packages must be delivered within and across cities. Trucks handle intra-city transport; airplanes handle
   inter-city deliveries.
   Rovers. Planetary exploration with multiple rovers collecting samples, taking images, and transmitting data. Rovers have
   specialized equipment and must communicate with a base station.
   Satellite. Multiple satellites with various instruments must photograph ground targets while managing power, storage, and
   instrument calibration.
   18
   Textual Planning with Explicit Latent Transitions
   Ferry
   State s: Car c0 is at location l0, Car c2 is at location l1, The ferry is at l0, and Car c1 is on the ferry.
   Action a: (debark c1 l0)
   Result s
   ′
   : Car c0 is at location l0, Car c1 is at location l0, The ferry is at l0, The ferry is empty, and Car c2 is at location l1.
   Logistics
   State s: p3 is in t1, a0 is at l0-0, t1 is at l1-0, p0 is at l1-0, p1 is in t1, t0 is at l0-0, and p2 is in a0.
   Action a: (fly-airplane a0 l0-0 l1-0)
   Result s
   ′
   : t1 is at l1-0, p0 is at l1-0, p1 is in t1, p3 is in t1, t0 is at l0-0, a0 is at l1-0, and p2 is in a0.
   C.4. Transition Examples
   D. Extended Results
   D.1. Per-Domain Results
   Table 8 provides complete per-domain breakdown across encoders and evaluation protocols.
   Qwen2.5-7B Llama-3.3-70B
   Domain Int. Ext. Int. Ext.
   Blocksworld 100.0 41.6±15 100.0 49.1±10
   Depot 98.2 24.8±9 98.8 25.9±6
   Ferry 99.9 36.7±1 100.0 40.6±3
   Floortile 99.4 55.2±19 99.6 68.8±16
   Goldminer 99.9 74.4±10 100.0 76.2±5
   Grid 98.6 62.7±9 99.8 74.9±1
   Logistics 99.6 44.7±20 99.9 53.7±10
   Rovers 99.7 49.2±3 99.0 54.4±3
   Satellite 99.9 40.0±1 99.9 47.5±6
   Mean 99.5 47.7±14 99.7 54.6±17
   Table 8. Per-domain Hit@5 (%) for Interpolation and Extrapolation splits.
   D.2. Full Performance Metrics
   Table 9 reports Hit@1/5/10 and action accuracy for Problem-Grouped evaluation.
   The gap between Hit@5 (54.6%) and Acc@5 (16.2%) reveals that models predict correct next states without fully capturing
   causal action structure.
   D.3. Cross-Domain Transfer Matrix
   Table 10 shows the complete 9×9 transfer matrix.
   The only notable transfer is Ferry→Logistics (22.3%), which we attribute to shared transportation semantics in state
   descriptions.
   D.4. Leave-One-Out Results
   Despite training on 8 diverse domains, LOO performance (9.2%) barely exceeds the untrained baseline (3.9%).
   19
   Textual Planning with Explicit Latent Transitions
   Rovers
   State s: Store(s) store0 is empty, Channel general is free, Image objective1 was communicated in mode colour, Rover rover0 has
   image objective1 in mode colour, Rover rover1 has soil analyzed in waypoint waypoint0, Rover rover1 is available, Rover rover1 is at
   waypoint0, Rocks can be sampled at the following location(s): waypoint0, Store(s) store1 is empty, Rover rover0 is available, and
   Rover rover0 is at waypoint2.
   Action a: (communicate soil data rover1 general waypoint0 waypoint0 waypoint1)
   Result s
   ′
   : Store(s) store0 is empty, Channel general is free, Rover rover0 has image objective1 in mode colour, Image objective1 was
   communicated in mode colour, Rover rover1 has soil analyzed in waypoint waypoint0, Rover rover1 is available, Rover rover1 is at
   waypoint0, Rocks can be sampled at the following location(s): waypoint0, Soil data was communicated from waypoint waypoint0,
   Store(s) store1 is empty, Rover rover0 is available, and Rover rover0 is at waypoint2.
   State Prediction Action Accuracy
   Domain Hit@1 Hit@5 Hit@10 Acc@1 Acc@5 Acc@10
   Blocksworld 17.6±9 49.1±17 64.6±13 0.7±0.2 7.9±2 24.0±4
   Depot 4.7±2 25.9±11 41.2±14 0.7±0.4 7.8±3 21.8±4
   Ferry 12.0±3 40.6±6 58.1±7 1.1±0.7 10.3±2 23.7±4
   Floortile 37.6±22 68.8±27 78.9±22 3.2±1 28.3±15 52.3±25
   Goldminer 35.8±11 76.2±9 88.0±3 3.0±0.4 16.5±2 45.7±6
   Grid 25.7±2 74.9±2 88.0±2 8.0±4 50.0±8 73.9±10
   Logistics 16.5±6 53.7±17 70.8±17 0.6±0.5 8.4±3 25.3±3
   Rovers 16.9±2 54.4±5 72.2±4 0.9±0.1 7.1±0.4 16.5±3
   Satellite 14.4±4 47.5±10 66.9±10 0.9±0.3 9.1±2 23.5±7
   Mean 20.1±11 54.6±17 69.9±14 2.1±2 16.2±14 34.1±19
   Table 9. Full metrics (Llama-3.3-70B, Problem-Grouped). Action accuracy measures whether the correct action is identified given (s, s′
   ).
   D.5. Multi-Domain Results
   D.6. Untrained Baseline
   To establish a performance floor, we evaluated the transition function with randomly initialized weights.
   The untrained baseline (3.9% Hit@5) confirms the retrieval task’s inherent difficulty and that learned performance results
   from actual dynamics learning.
   D.7. Plan-Level Evaluation Across Encoders
   We extend our evaluation to the trajectory level to assess whether high transition accuracy translates to reliable multi-step
   planning. We compare two splitting strategies:
   • Interpolation: Test plans come from problem instances seen during training (though the specific plans are held out).
   • Extrapolation: Test plans come from entirely new problem instances never seen during training.
   We report two metrics:
   • Mean Trajectory Hit@5: Average Hit@5 across all steps in a trajectory.
   • Exact Trajectory Hit@5: Percentage of trajectories where every step is correctly retrieved (100% reliability).
   Tables 14–16 present results across three encoders. We observe a consistent Trajectory Generalization Gap across all
   models. Under Interpolation, models achieve moderate reliability, though Exact Match rates remain low due to error
   accumulation. Under Extrapolation, performance collapses dramatically—for Blocksworld, the Exact Trajectory rate falls to
   0.0% across all encoders.
   20
   Textual Planning with Explicit Latent Transitions
   Block Depot Ferry Floor Gold Grid Logis Rover Satel Mean
   Blocksworld – 5.7 5.5 6.7 6.1 6.5 9.2 5.1 5.3 6.3
   Depot 4.3 – 5.3 4.8 5.0 4.9 6.0 7.5 5.4 5.4
   Ferry 5.3 8.7 – 9.3 5.2 9.0 22.3 6.6 5.6 9.0
   Floortile 5.0 7.3 7.0 – 6.1 6.5 7.5 10.0 7.9 7.2
   Goldminer 4.2 5.4 5.7 5.0 – 7.5 5.4 5.9 4.9 5.5
   Grid 5.4 6.6 8.6 9.0 10.4 – 14.3 5.9 5.4 8.2
   Logistics 4.3 5.5 7.7 4.9 7.0 6.3 – 5.1 4.5 5.7
   Rovers 4.3 5.7 5.0 8.4 4.6 5.9 4.8 – 8.2 5.9
   Satellite 4.5 7.5 6.3 7.8 6.4 5.2 10.1 5.9 – 6.7
   Mean 4.7 6.5 6.4 7.0 6.4 6.5 9.9 6.5 5.9 6.6
   Table 10. Cross-domain transfer (Llama-3.3-70B). Hit@5 (%) training on row, testing on column. Baseline: 3.9%.
   Held-Out Hit@1 Hit@5 Hit@10
   Logistics 3.3±0.4 15.8±2.2 27.6±3.3
   Grid 2.3±0.2 12.3±0.8 22.9±1.4
   Rovers 2.6±0.3 12.6±1.1 22.6±1.6
   Ferry 1.8±0.1 9.0±0.5 17.2±0.8
   Satellite 1.6±0.1 8.4±0.8 16.1±1.5
   Floortile 1.7±0.3 7.9±1.1 14.9±2.0
   Goldminer 1.3±0.0 6.4±0.2 12.5±0.3
   Depot 1.1±0.1 5.6±0.5 10.9±0.9
   Blocksworld 1.0±0.0 5.2±0.1 10.3±0.3
   Mean 1.9±0.7 9.2±3.5 17.2±5.8
   Table 11. Leave-One-Out (Llama-3.3-70B). Train on 8 domains, test on held-out.
   This confirms that the transition model’s planning capability is largely confined to memorized problem manifolds; when
   forced to extrapolate to new problems, the probability of executing a valid multi-step plan drops to near zero.
   Key Observations.
   • Interpolation performance scales with encoder size: Llama-3.3-70B and BGE-M3 achieve similar Mean Hit@5
   (∼51–53%), while MPNet lags significantly (24.3%).
   • Extrapolation collapse is universal: All encoders show dramatic degradation under Extrapolation, with Exact Hit@5
   dropping below 4% on average.
   • Domain-specific patterns persist: Goldminer and Grid show relatively better Extrapolation performance across all
   encoders, while Blocksworld and Satellite consistently fail.
   • MPNet struggles even with Interpolation: Rovers and Satellite show near-zero performance even under Interpolation,
   suggesting these domains require higher-capacity embeddings.
   E. Statistical Analysis
   E.1. Main Generalization Gap
   See Table 17.
   E.2. Effect Sizes for Key Comparisons
   See Table 18.
   E.3. Per-Domain Statistical Tests
   See Table 19.
   21
   Textual Planning with Explicit Latent Transitions
   Domain Hit@5 Domain Hit@5
   Floortile 52.0±10 Blocksworld 36.9±13
   Rovers 51.9±5 Satellite 34.3±7
   Goldminer 46.0±8 Grid 32.6±1
   Ferry 37.7±14 Logistics 24.8±10
   Depot 18.9±12
   Mean: 37.2±10.7 (vs. 54.6 single-domain)
   Table 12. Multi-domain unified model (Llama-3.3-70B, Problem-Grouped).
   Domain Hit@1 Hit@5 Hit@10
   Blocksworld 0.8±0.1 4.0±0.2 8.0±0.4
   Depot 0.9±0.2 3.9±0.0 8.0±0.4
   Ferry 0.7±0.1 4.3±0.6 8.4±0.9
   Floortile 0.8±0.0 4.0±0.1 8.0±0.1
   Goldminer 1.0±0.4 4.8±1.4 8.9±2.0
   Grid 0.9±0.1 4.4±0.3 8.0±0.2
   Logistics 0.9±0.1 4.1±0.2 8.6±0.6
   Rovers 0.7±0.0 4.1±0.2 8.4±0.1
   Satellite 0.7±0.0 3.9±0.1 7.8±0.1
   Mean 0.8±0.1 3.9±0.3 8.2±0.4
   Table 13. Untrained baseline (random weights, Llama-3.3-70B).
   All comparisons remain significant after Bonferroni correction (α = 0.05/9 = 0.0056) except Floortile and Goldminer,
   which are significant at uncorrected α = 0.05.
   F. Embedding Analysis
   F.1. PCA Visualization
   Figure 5 compares embedding geometry across model scales.
   (A) MPNet (110M) (B) Llama-3.3-70B-70B
   Figure 5. Embedding Space Fragmentation Across Scales. PCA visualization of state embeddings colored by problem instance. (A)
   MPNet embeddings show tight, isolated clusters for each problem. (B) Llama-3.3-70B-70B embeddings, despite being 700× larger,
   exhibit the same fragmentation. This confirms that pre-trained embeddings primarily cluster by problem-specific lexical features rather
   than abstract planning roles, regardless of model scale.
   Both MPNet and Llama show isolated clusters corresponding to specific problem instances. While Llama shows slightly
   more spread within clusters, the critical structural limitation remains: manifolds for different problems are disjoint. Scaling
   up model parameters does not automatically induce abstract, problem-invariant representations.
   22
   Textual Planning with Explicit Latent Transitions
   Interpolation Extrapolation
   Domain Mean Hit@5 Exact Hit@5 Mean Hit@5 Exact Hit@5
   Blocksworld 38.7 ± 0.8 1.6 ± 0.2 3.7 ± 1.3 0.0 ± 0.0
   Depot 30.1 ± 2.6 11.2 ± 1.5 2.4 ± 1.7 1.0 ± 1.0
   Ferry 71.1 ± 1.1 39.1 ± 1.6 2.0 ± 0.7 0.5 ± 0.2
   Floortile 74.1 ± 2.7 33.6 ± 3.3 11.6 ± 4.4 2.8 ± 1.2
   Goldminer 55.4 ± 2.2 23.8 ± 1.6 18.5 ± 6.2 5.5 ± 1.8
   Grid 55.0 ± 2.4 37.4 ± 2.2 16.6 ± 3.7 8.2 ± 2.1
   Logistics 52.8 ± 0.6 14.1 ± 2.0 22.7 ± 8.6 9.6 ± 4.4
   Rovers 26.5 ± 0.8 10.0 ± 0.7 12.2 ± 3.5 1.9 ± 0.8
   Satellite 56.8 ± 1.2 32.2 ± 1.0 1.2 ± 0.4 0.5 ± 0.1
   Mean 51.2 ± 16.6 22.6 ± 13.7 10.1 ± 8.0 3.3 ± 3.5
   Table 14. Plan-Level Evaluation (Llama-3.3-70B-70B). Trajectory metrics across Interpolation and Extrapolation.
   Interpolation Extrapolation
   Domain Mean Hit@5 Exact Hit@5 Mean Hit@5 Exact Hit@5
   Blocksworld 23.7 ± 1.5 0.2 ± 0.1 1.0 ± 0.4 0.0 ± 0.0
   Depot 45.5 ± 1.0 20.9 ± 0.1 3.0 ± 1.4 1.1 ± 0.6
   Ferry 63.3 ± 1.4 27.8 ± 2.1 5.4 ± 4.5 2.4 ± 2.2
   Floortile 49.2 ± 1.0 13.1 ± 1.1 3.4 ± 1.2 0.6 ± 0.3
   Goldminer 67.9 ± 2.6 35.0 ± 3.2 23.1 ± 3.2 9.4 ± 1.7
   Grid 51.9 ± 1.5 34.0 ± 1.2 13.1 ± 5.5 7.1 ± 3.7
   Logistics 67.2 ± 0.3 25.6 ± 1.6 22.7 ± 8.6 9.6 ± 4.4
   Rovers 60.5 ± 0.2 24.7 ± 0.2 12.2 ± 3.5 1.9 ± 0.8
   Satellite 51.2 ± 0.4 27.5 ± 0.6 1.2 ± 0.4 0.5 ± 0.1
   Mean 53.4 ± 13.5 23.2 ± 10.6 9.5 ± 8.4 3.6 ± 3.8
   Table 15. Plan-Level Evaluation (BAAI/bge-m3). Trajectory metrics across Interpolation and Extrapolation splits.
   Interpolation Extrapolation
   Domain Mean Hit@5 Exact Hit@5 Mean Hit@5 Exact Hit@5
   Blocksworld 16.7 ± 0.3 0.3 ± 0.1 0.7 ± 0.3 0.0 ± 0.0
   Depot 31.1 ± 1.6 10.8 ± 1.1 2.9 ± 1.2 1.8 ± 1.2
   Ferry 60.9 ± 2.0 29.1 ± 2.3 1.2 ± 1.0 0.6 ± 0.5
   Floortile 9.2 ± 0.5 3.0 ± 0.4 0.2 ± 0.1 0.1 ± 0.1
   Goldminer 26.8 ± 0.8 10.5 ± 0.5 5.1 ± 1.2 1.8 ± 0.3
   Grid 32.7 ± 2.7 17.5 ± 2.6 17.6 ± 2.6 7.7 ± 0.9
   Logistics 41.3 ± 2.2 9.9 ± 1.9 12.1 ± 5.4 2.4 ± 1.0
   Rovers 0.1 ± 0.0 0.0 ± 0.0 — —
   Satellite 0.2 ± 0.1 0.1 ± 0.0 0.0 ± 0.0 0.0 ± 0.0
   Mean 24.3 ± 19.5 9.0 ± 9.5 5.0 ± 6.3 1.8 ± 2.5
   Table 16. Plan-Level Evaluation (MPNet). Trajectory metrics across Interpolation and Extrapolation splits.
   F.2. Domain Complexity Analysis
   Correlation analysis reveals moderate positive correlation between average state space size and generalization gap (Pearson
   r = 0.42, p = 0.26), though not statistically significant with n = 9 domains. Domains with complex multi-object
   interactions (Depot, Logistics) show larger gaps than domains with simpler dynamics (Goldminer, Grid).
   23
   Textual Planning with Explicit Latent Transitions
   Statistic Value
   Interpolation 99.5% ± 0.6%
   Extrapolation (Problem-Grouped) 47.7% ± 13.9%
   Gap 51.8 pp
   Paired t-test t(8) = 10.58
   p-value 5.57 × 10−6
   95% CI [40.7, 62.9] pp
   Table 17. Statistical analysis of the generalization gap.
   Comparison ∆ Cohen’s d p
   Interpolation vs. Extrapolation −51.8 pp 5.25 < 10−5
   Extrapolation vs. Cross-Domain −48.0 pp 4.32 < 10−5
   Cross-Domain vs. Untrained +2.7 pp 0.82 0.032
   Llama vs. MPNet (Ext.) +27.8 pp 2.53 < 0.001
   Single vs. Multi (Ext.) +17.4 pp 1.42 0.028
   Table 18. Effect sizes for major findings.
   G. Ablations
   G.1. Architecture and Encoder Comparison
   Architecture choice has minimal impact on performance (paired t-test: p > 0.5 for all comparisons). The generalization
   gap is consistent across architectures, confirming that the limitation stems from embedding structure rather than transition
   network design.
   Larger encoders yield better extrapolation performance, but the improvement is sublinear: a 700× increase in parameters
   (MPNet to Llama) yields only a 2.2× improvement in Hit@5. This suggests that scale alone does not resolve the fundamental
   structural limitation.
   G.2. Effect of Action Disambiguation Loss
   We ablate the contribution of the action disambiguation loss Laction by comparing models trained with the full composite
   objective (λ = 2, i.e., L = Lstate + 2Laction) against models trained with state prediction loss only (λ = 0).
   The action disambiguation loss yields substantial improvements across both metrics and all nine domains. The direct
   target—Action Acc@5—shows the most dramatic gain, improving 3.4× from 4.8% to 16.2%. Without explicit supervision
   on action effects, models fail to distinguish between actions with similar but distinct consequences: Action Acc@5 under
   λ = 0 barely exceeds the untrained baseline in most domains, indicating that state prediction loss alone provides essentially
   no signal for learning action semantics.
   Critically, Hit@5 also improves by 19.3 pp (+55% relative), despite Laction not directly optimizing this metric. This
   substantial indirect benefit reveals that action disambiguation serves as more than auxiliary supervision—it fundamentally
   shapes how the transition network represents dynamics. We identify two mechanisms: (1) without action-contrastive
   training, the model exploits spurious correlations between surface-level state-action features and outcomes, which fail to
   transfer to unseen problems; (2) the action loss forces the network to encode causal transformation patterns—understanding
   that pick-up(A) and pick-up(B) share abstract structure while differing in object binding—enabling compositional
   generalization.
   The improvement is consistent across domains but varies in magnitude. Grid shows the largest absolute gain in Action
   Acc@5 (+31.3 pp), likely because its spatial action semantics (movement in cardinal directions) are highly distinctive when
   explicitly supervised. Depot and Rovers show the largest relative Hit@5 gains (+93% and +55%), suggesting that domains
   with complex multi-object interactions benefit most from learning precise action effects.
   We set λ = 2 to emphasize action disambiguation, reflecting that distinguishing among K domain actions applied to the
   same state requires finer-grained representations than distinguishing among B random states in a batch. This design choice
   proves essential: without it, EMBEDPLAN’s extrapolation capability would drop by over one-third, and action understanding
   24
   Textual Planning with Explicit Latent Transitions
   Domain Gap (pp) t-statistic p-value
   Depot 73.4 12.87 1.17 × 10−4
   Ferry 63.3 65.49 3.24 × 10−6
   Satellite 59.9 153.39 4.11 × 10−8
   Blocksworld 58.4 5.95 2.70 × 10−3
   Logistics 55.0 4.28 8.28 × 10−3
   Rovers 50.5 20.22 8.90 × 10−6
   Floortile 44.2 3.68 1.57 × 10−2
   Grid 35.9 5.38 2.40 × 10−3
   Goldminer 25.5 3.54 1.13 × 10−2
   Table 19. Independent t-tests comparing Interpolation vs Extrapolation per domain (Qwen2.5-7B).
   Domain Actions Predicates Avg States Gap
   Depot 5 8 1,247 73.4
   Logistics 6 6 892 55.0
   Satellite 5 8 634 59.9
   Blocksworld 4 5 423 58.4
   Ferry 3 5 312 63.3
   Rovers 9 26 1,891 50.5
   Floortile 7 10 567 44.2
   Grid 5 9 489 35.9
   Goldminer 4 7 234 25.5
   Table 20. Domain complexity metrics and generalization gaps.
   would be nearly absent.
   Given the substantial impact of the action disambiguation loss (+19.3 pp Hit@5, +55% relative), we reference this ablation
   in the main text (Section 3, Training Objective) and report λ = 2 as the final configuration. The full ablation across
   λ ∈ {0, 0.5, 1, 1.5, 2, 4} confirms λ = 2 as optimal; performance degrades slightly at λ = 4 due to over-emphasis on action
   discrimination at the expense of state prediction.
   H. Preliminary Studies
   H.1. Latent Distance Alignment
   Before learning transition functions, we tested whether pre-trained embeddings already encode planning-relevant structure.
   If embedding geometry reflects plan costs, one could use simple distance-based heuristics for search without any additional
   learning.
   Hypothesis. We define Latent Distance Alignment (LDA) as the property that embedding distance between a state and
   goal correlates with the number of actions required to reach the goal:
   LDA : corr
   d(es, eg), cost(s, g)
   
    > 0 (34)
    > where es and eg are the embeddings of state s and goal g, d(·, ·) is cosine distance, and cost(s, g) is the optimal plan length
    > from s to g.
    > Motivation. This hypothesis draws from successes in other domains. CLIP embeddings align images and text such
    > that semantic similarity corresponds to embedding proximity (Radford et al., 2021). Sentence embeddings place entailed
    > sentences closer than contradictions (Reimers & Gurevych, 2019). We test whether similar alignment emerges for planning
    > cost.
    > Method. For 21,003 state-goal pairs across 9 domains, we computed embedding distances (using all four encoders) and
    > correlated with ground-truth plan costs from A\* search.
    > 25
    > Textual Planning with Explicit Latent Transitions
    > Encoder Parameters MLP HyperNetwork
    > Llama-3.3-70B-70B 70B 54.6±17.0 53.8±16.5
    > Qwen2.5-7B 7B 47.7±14.8 46.2±15.1
    > BGE-M3 568M 33.5±15.6 32.8±14.9
    > MPNet 110M 24.4±17.1 22.8±17.4
    > Table 21. Architecture and encoder comparison (Problem-Grouped, Hit@5 %).
    > Hit@5 (%) Action Acc@5 (%)
    > Domain λ=0 λ=2 λ=0 λ=2
    > Blocksworld 30.2±8 49.1±10 1.8±0.4 7.9±2
    > Depot 13.4±4 25.9±6 1.6±0.3 7.8±3
    > Ferry 24.8±3 40.6±3 2.5±0.5 10.3±2
    > Floortile 45.3±14 68.8±16 8.2±3 28.3±15
    > Goldminer 55.7±6 76.2±5 4.9±1.2 16.5±2
    > Grid 52.1±2 74.9±1 18.7±5 50.0±8
    > Logistics 31.5±9 53.7±10 1.9±0.6 8.4±3
    > Rovers 35.2±4 54.4±3 1.7±0.3 7.1±0.4
    > Satellite 29.8±5 47.5±6 2.2±0.5 9.1±2
    > Mean 35.3±13 54.6±17 4.8±5 16.2±14
    > ∆ +19.3 pp (+55%) +11.4 pp (3.4×)
    > Table 22. Ablation: Action Disambiguation Loss. Comparing models trained without (λ=0) and with (λ=2) action disambiguation
    > under Extrapolation evaluation (Llama-3.3-70B). The action loss yields substantial gains in both state prediction (+19.3 pp) and action
    > accuracy (3.4×).
    > Result. After controlling for prompt length as a confound, correlations collapsed to near-zero across all encoders.
    > Pre-trained embeddings do not encode planning cost through geometric distance.
    > Implication. This negative result motivated our transition learning approach: rather than relying on inherent geometry, we
    > explicitly learn how actions transform states in embedding space.
    > I. Reproducibility
    > I.1. Code and Data Availability
    > Will be released upon publication.
    > I.2. Experimental Reproducibility
    > • Random Seeds: All experiments run with seeds {42, 123, 456}; results report mean ± standard error.
    > • Hardware: NVIDIA A100 80GB GPU
    > • Software: PyTorch 2.1, CUDA 12.1, Python 3.10
    > J. Error Analysis
    > We qualitatively analyzed Hit@5 errors under Extrapolation evaluation to characterize failure modes. Specifically, we
    > sampled 50 incorrect predictions per domain (where the ground-truth next state ranked outside top-5) and manually inspected
    > the retrieved candidates.
    > Methodology. For each error, we compared the top-1 retrieved state against the ground-truth next state, counting the
    > number of differing predicates and noting whether both states belonged to the same problem instance.
    > Findings. Across domains, 78% of top-1 errors shared the same problem instance as the query state. Among these, the
    > median predicate difference was 2 (IQR: 1–3). Table 23 shows representative examples.
    > 26
    > Textual Planning with Explicit Latent Transitions
    > Domain Ground Truth s
    > ′ Retrieved sˆ
    > ′
    > Blocks Block A is clear, arm
    > holds B, C is on table
    > Block A is clear, arm
    > holds C, B is on table
    > Ferry Car c1 at l0, ferry
    > empty, c2 at l1
    > Car c1 at l0, ferry
    > empty, c2 at l0
    > Logistics Package p1 in truck t0,
    > t0 at l1-0
    > Package p1 at l1-0, t0
    > at l1-0
    > Table 23. Representative Hit@5 errors. Retrieved states differ from ground truth by 1–2 predicates (italicized), typically involving object
    > locations or holdings within the same problem instance.
    > These errors suggest the model captures coarse transition structure (correct problem context, approximate state region) but
    > struggles to resolve fine-grained predicate changes, particularly when multiple objects undergo similar transformations.
    > K. Complete Results Tables
    > See Tables 24 – 25.
    > Domain Split Hit@1 Hit@5 Hit@10
    > Blocksworld Interpolation 94.3±0.3 100.0±0.0 100.0±0.0
    > Problem-Grouped 14.2±5.7 41.6±12.5 56.6±11.8
    > Depot Interpolation 76.7±1.4 98.2±0.2 99.0±0.0
    > Problem-Grouped 4.9±1.7 24.8±7.0 42.2±11.0
    > Ferry Interpolation 98.7±0.1 99.9±0.0 100.0±0.0
    > Problem-Grouped 10.7±1.1 36.7±1.0 52.8±1.5
    > Floortile Interpolation 96.2±0.4 99.4±0.0 99.6±0.0
    > Problem-Grouped 24.0±8.1 55.2±15.5 69.0±16.2
    > Goldminer Interpolation 94.0±0.8 99.9±0.0 100.0±0.0
    > Problem-Grouped 34.5±9.6 74.4±8.1 86.7±3.1
    > Grid Interpolation 80.9±1.7 98.6±0.1 99.6±0.1
    > Problem-Grouped 19.4±4.5 62.7±7.4 76.9±8.0
    > Logistics Interpolation 88.9±1.5 99.6±0.1 99.8±0.0
    > Problem-Grouped 14.9±6.5 44.7±16.0 60.7±17.4
    > Rovers Interpolation 97.4±0.2 99.7±0.0 99.8±0.0
    > Problem-Grouped 18.5±1.4 49.2±2.5 65.0±2.6
    > Satellite Interpolation 98.1±0.2 99.9±0.0 100.0±0.0
    > Problem-Grouped 14.3±0.6 40.0±0.8 54.8±1.4
    > Table 24. Complete metrics for Qwen2.5-7B across all domains and splits.
    > 27
    > Textual Planning with Explicit Latent Transitions
    > Domain Split Hit@1 Hit@5 Hit@10
    > Blocksworld Interpolation 96.2±0.4 100.0±0.0 100.0±0.0
    > Problem-Grouped 17.6±9.0 49.1±17.0 64.6±13.0
    > Depot Interpolation 79.5±1.2 98.8±0.1 99.2±0.1
    > Problem-Grouped 4.7±2.0 25.9±11.0 41.2±14.0
    > Ferry Interpolation 99.1±0.1 100.0±0.0 100.0±0.0
    > Problem-Grouped 12.0±3.0 40.6±6.0 58.1±7.0
    > Floortile Interpolation 97.4±0.3 99.6±0.0 99.8±0.0
    > Problem-Grouped 37.6±22.0 68.8±27.0 78.9±22.0
    > Goldminer Interpolation 95.8±0.6 100.0±0.0 100.0±0.0
    > Problem-Grouped 35.8±11.0 76.2±9.0 88.0±3.0
    > Grid Interpolation 84.3±1.4 99.8±0.0 99.9±0.0
    > Problem-Grouped 25.7±2.0 74.9±2.0 88.0±2.0
    > Logistics Interpolation 91.2±1.1 99.9±0.0 100.0±0.0
    > Problem-Grouped 16.5±6.0 53.7±17.0 70.8±17.0
    > Rovers Interpolation 97.8±0.2 99.0±0.1 99.5±0.1
    > Problem-Grouped 16.9±2.0 54.4±5.0 72.2±4.0
    > Satellite Interpolation 98.5±0.2 99.9±0.0 100.0±0.0
    > Problem-Grouped 14.4±4.0 47.5±10.0 66.9±10.0
    > Table 25. Complete metrics for Llama-3.3-70B-70B across all domains and splits.
    > 28
