<!-- design/research-index.md -->

# BuildOS Research Index

> **Last Updated:** 2026-02-05
> **Source:** [arXiv CS Recent Submissions](https://arxiv.org/list/cs/recent)
> **Purpose:** Track relevant AI/ML research for BuildOS platform development

---

## Relevance Criteria for BuildOS

BuildOS is an AI-powered productivity platform with these core features:

- **Brain Dump System** — Transform unstructured thoughts into actionable items
- **Ontology Graph** — Hierarchical structure (projects → tasks → subtasks)
- **Agentic Chat** — AI assistant for productivity
- **ADHD-friendly design** — Cognitive support for neurodivergent users

**Research priorities:**

1. Agentic AI architectures & reasoning
2. Task extraction & planning from unstructured text
3. Graph/knowledge representation
4. LLM improvements (RLHF, long-context, uncertainty)
5. HCI for productivity & cognitive support
6. Personalization & user modeling

---

## Priority Research Papers

### Tier 1: High Priority — Direct Applicability

| #   | arXiv ID     | Title                                                                               | Why It Matters                                          |
| --- | ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `2602.04170` | **Textual Planning with Explicit Latent Transitions**                               | Task planning from text — core to brain dump extraction |
| 2   | `2602.04768` | **Billion-Scale Graph Foundation Models**                                           | Ontology graph embeddings & reasoning                   |
| 3   | `2602.04127` | **Towards Structured, State-Aware, and Execution-Grounded Reasoning for SE Agents** | Agentic AI architecture for task execution              |
| 4   | `2602.04575` | **Vibe AIGC: A New Paradigm for Content Generation via Agentic Orchestration**      | Agentic content workflows                               |
| 5   | `2602.04540` | **PersoPilot: Adaptive AI-Copilot for Contextualized Persona Classification**       | Personalized AI assistant patterns                      |
| 6   | `2602.04445` | **AgenticAKM: Agentic Architecture Knowledge Management**                           | Knowledge management via agents                         |
| 7   | `2602.04482` | **Proactive Agents, Long-term User Context, VLM Annotation, Privacy Protection**    | Proactive AI with user context                          |
| 8   | `2602.04634` | **WideSeek-R1: Multi-Agent RL for Broad Information Seeking**                       | Multi-agent information retrieval                       |

### Tier 2: High Priority — LLM/Agent Improvements

| #   | arXiv ID     | Title                                                                                     | Why It Matters                   |
| --- | ------------ | ----------------------------------------------------------------------------------------- | -------------------------------- |
| 9   | `2602.04884` | **Reinforced Attention Learning**                                                         | Attention mechanism improvements |
| 10  | `2602.04879` | **Rethinking the Trust Region in LLM Reinforcement Learning**                             | Better RLHF training             |
| 11  | `2602.04853` | **Decomposed Prompting Does Not Fix Knowledge Gaps, But Helps Models Say "I Don't Know"** | LLM uncertainty handling         |
| 12  | `2602.04755` | **When Silence Is Golden: Can LLMs Learn to Abstain?**                                    | Teaching AI when NOT to answer   |
| 13  | `2602.04649` | **Outcome Accuracy is Not Enough: Aligning the Reasoning Process of Reward Models**       | Better reasoning alignment       |
| 14  | `2602.04651` | **SAFE: Stable Alignment Finetuning with Entropy-Aware Predictive Control**               | Stable RLHF                      |
| 15  | `2602.04417` | **EMA Policy Gradient: Taming RL for LLMs**                                               | RL improvements for LLMs         |
| 16  | `2602.04541` | **LycheeDecode: Accelerating Long-Context LLM Inference**                                 | Long context efficiency          |

### Tier 3: Medium Priority — Agents & Reasoning

| #   | arXiv ID     | Title                                                                         | Why It Matters                  |
| --- | ------------ | ----------------------------------------------------------------------------- | ------------------------------- |
| 17  | `2602.04837` | **Group-Evolving Agents: Open-Ended Self-Improvement via Experience Sharing** | Agent learning patterns         |
| 18  | `2602.04811` | **SE-Bench: Benchmarking Self-Evolution with Knowledge Internalization**      | LLM self-improvement            |
| 19  | `2602.04842` | **Fluid Representations in Reasoning Models**                                 | AI reasoning internals          |
| 20  | `2602.04496` | **ReThinker: Scientific Reasoning by Rethinking with Guided Reflection**      | Reflection-based reasoning      |
| 21  | `2602.04413` | **History-Guided Iterative Visual Reasoning with Self-Correction**            | Self-correction patterns        |
| 22  | `2602.04431` | **MaMa: Game-Theoretic Approach for Safe Agentic Systems**                    | Safe agent design               |
| 23  | `2602.04785` | **Team, Then Trim: Assembly-Line LLM Framework**                              | Multi-agent collaboration       |
| 24  | `2602.04813` | **Agentic AI in Healthcare: Seven-Dimensional Taxonomy**                      | Agentic AI evaluation framework |

### Tier 4: Medium Priority — HCI & Cognitive Support

| #   | arXiv ID     | Title                                                                     | Why It Matters              |
| --- | ------------ | ------------------------------------------------------------------------- | --------------------------- |
| 25  | `2602.04598` | **AI in Education: Cognition, Agency, Emotion, and Ethics**               | Cognitive support research  |
| 26  | `2602.04487` | **The Supportiveness-Safety Tradeoff in LLM Well-Being Agents**           | Wellbeing AI design         |
| 27  | `2602.04478` | **Informing Robot Wellbeing Coach Design through Human-AI Dialogue**      | Wellbeing coaching patterns |
| 28  | `2602.04493` | **PersoDPO: Persona-Grounded Dialogue via Multi-LLM Evaluation**          | Personalized dialogue       |
| 29  | `2602.04456` | **Growth First, Care Second? LLM Value Preferences in Everyday Dilemmas** | LLM value alignment         |

### Tier 5: Lower Priority — Infrastructure & Techniques

| #   | arXiv ID     | Title                                                                  | Why It Matters                    |
| --- | ------------ | ---------------------------------------------------------------------- | --------------------------------- |
| 30  | `2602.04711` | **Addressing RAG Knowledge Poisoning with Sparse Attention**           | RAG security                      |
| 31  | `2602.04718` | **Identifying Intervenable Features via Orthogonality Regularization** | LLM interpretability              |
| 32  | `2602.04856` | **CoT is Not the Chain of Truth: Analysis of Reasoning LLMs**          | Understanding CoT limitations     |
| 33  | `2602.04577` | **Semantic Self-Distillation for Language Model Uncertainty**          | Uncertainty quantification        |
| 34  | `2602.04735` | **From Data to Behavior: Predicting Unintended Model Behaviors**       | AI safety                         |
| 35  | `2602.04705` | **ERNIE 5.0 Technical Report**                                         | State-of-the-art LLM architecture |

---

## Papers to Read First

Based on immediate applicability to BuildOS development:

### 1. **Textual Planning with Explicit Latent Transitions** `2602.04170`

> Direct application to brain dump → task extraction pipeline

### 2. **Billion-Scale Graph Foundation Models** `2602.04768`

> Could revolutionize ontology graph embeddings and reasoning

### 3. **Towards Structured, State-Aware Reasoning for SE Agents** `2602.04127`

> Architecture patterns for agentic chat improvements

### 4. **PersoPilot** `2602.04540`

> Personalized AI copilot — directly applicable to BuildOS assistant

### 5. **Proactive Agents with Long-term User Context** `2602.04482`

> Key for making BuildOS proactively helpful

---

## Research Categories (Full List)

### Agentic AI & Multi-Agent Systems

- `2602.04837` Group-Evolving Agents
- `2602.04634` WideSeek-R1 (Multi-Agent RL)
- `2602.04575` Vibe AIGC (Agentic Orchestration)
- `2602.04445` AgenticAKM
- `2602.04431` MaMa (Safe Agentic Systems)
- `2602.04127` Structured Reasoning for SE Agents
- `2602.04785` Team, Then Trim
- `2602.04418` SPEAR (Multi-Agent Smart Contracts)
- `2602.04482` Proactive Agents

### LLM Reasoning & Planning

- `2602.04170` Textual Planning with Latent Transitions
- `2602.04842` Fluid Representations in Reasoning
- `2602.04856` CoT Analysis
- `2602.04496` ReThinker
- `2602.04413` History-Guided Reasoning
- `2602.04649` Reward Model Reasoning Alignment

### LLM Training & Alignment

- `2602.04884` Reinforced Attention Learning
- `2602.04879` Trust Region in LLM RL
- `2602.04651` SAFE (Entropy-Aware RLHF)
- `2602.04417` EMA Policy Gradient
- `2602.04620` QUATRO (Query-Adaptive Trust Region)
- `2602.04811` SE-Bench (Self-Evolution)

### Uncertainty & Abstention

- `2602.04853` Decomposed Prompting Gaps
- `2602.04755` Learning to Abstain
- `2602.04577` Semantic Self-Distillation
- `2602.04678` Multi-Expert Uncertainty

### Graph & Knowledge Representation

- `2602.04768` Billion-Scale Graph Foundation Models
- `2602.04116` PLANET (Multimodal Graph FM) — _already analyzed_
- `2602.04630` Web of Science Graph Dataset

### Personalization & HCI

- `2602.04540` PersoPilot
- `2602.04493` PersoDPO
- `2602.04598` AI in Education (Cognition, Agency)
- `2602.04487` Supportiveness-Safety Tradeoff
- `2602.04478` Wellbeing Coach Design
- `2602.04456` LLM Value Preferences

### Long Context & Efficiency

- `2602.04541` LycheeDecode
- `2602.04607` Focus-LIME
- `2602.04804` OmniSIFT (Token Compression)
- `2602.04657` PIO-FVLM (Visual Token Reduction)

---

## Not Relevant to BuildOS

The following categories from the scrape are **not relevant**:

- Robotics / Autonomous vehicles
- Computer Vision (object detection, image generation, etc.)
- Networking / 5G/6G
- Hardware architecture
- Bioinformatics / Medical imaging
- Audio/Speech processing (unless for voice input)
- Quantum computing
- Cryptography
- Game theory (unless agent-related)

---

## Next Steps

1. [ ] Download and read Tier 1 papers (8 papers)
2. [ ] Extract key insights applicable to BuildOS
3. [ ] Create implementation notes for:
    - Agentic chat improvements
    - Brain dump extraction pipeline
    - Ontology graph enhancements
4. [ ] Monitor arXiv weekly for new relevant papers

---

## Already Analyzed

| Paper                        | Location                   | Key Insights                                                            |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| PLANET (Multimodal Graph FM) | `design/research-graph.md` | Topology-aware modality interaction, DSRS for alignment, text as anchor |

---

_This index is maintained to track research relevant to BuildOS development. Papers are categorized by applicability and priority._
