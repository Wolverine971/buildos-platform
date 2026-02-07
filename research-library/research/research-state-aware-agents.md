<!-- research-library/research/research-state-aware-agents.md -->

https://arxiv.org/pdf/2602.04640

---

# BuildOS Analysis: State-Aware Agents

> **Paper:** Towards Structured, State-Aware, and Execution-Grounded Reasoning for Software Engineering Agents
> **Relevance to BuildOS:** ⭐⭐⭐⭐⭐ (Critical for Agentic Chat)
> **Date Analyzed:** 2026-02-05

## TL;DR

This position paper argues that current AI agents are **fundamentally reactive** — they just respond to the latest message without maintaining persistent state. This causes:

- Inconsistent reasoning over long conversations
- "Forgotten" assumptions that lead to contradictions
- Inability to connect new information to prior context

The solution: **Structured, State-Aware, Execution-Grounded Reasoning** — agents that explicitly maintain and update their understanding as they work.

## The Core Problem

Current agents operate like this:

```
Input → LLM → Tools → Output
```

They should operate like this:

```
Input + State(t-1) → LLM → Tools → Execution Feedback → State(t) → Output
```

**The key insight:** Agents need EXPLICIT PERSISTENT STATE that evolves, not just conversation history.

## Key Concepts Defined

| Term             | Definition                                                                              | BuildOS Equivalent                                       |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Agent State**  | Explicit representation of current understanding (hypotheses, invariants, dependencies) | What the agent "knows" about user's projects/tasks       |
| **Hypothesis**   | Provisional assumption formed during reasoning                                          | "User probably wants to schedule this task for tomorrow" |
| **Structure**    | How state is organized, updated, and queried                                            | The ontology graph structure                             |
| **System State** | Actual state of the software/environment                                                | Current state of user's projects, tasks, calendar        |

## Why Reactive Agents Fail (Relevant Patterns)

### 1. Inconsistent Reasoning Reconstructions

> "Without stable intermediate representations, agents may generate inconsistent explanations or plans across steps."

**BuildOS Example:** User asks agent to help with a project. Agent suggests one approach. User asks follow-up. Agent contradicts its earlier suggestion because it "forgot" its own reasoning.

### 2. Forgotten Assumptions

> "The 'assumptions' or 'hypotheses' that agents made across actions are not tracked and maintained in agent memory."

**BuildOS Example:** Agent assumes user is working on Project A based on context. Later in the conversation, agent starts mixing in Project B context without realizing the assumption changed.

### 3. Interpreting Feedback in Isolation

> "Agents often interpret feedback in isolation rather than as part of an ongoing line of reasoning."

**BuildOS Example:** User says "that didn't work" — agent doesn't connect this to its prior suggestion, just generates a new response without updating its understanding.

### 4. Retrying Without Knowing Where to Return

> "Many agents restart the entire process from the beginning, rather than identifying a specific step where reasoning went off course."

**BuildOS Example:** Task extraction fails → instead of identifying WHICH extraction was wrong, agent re-processes entire brain dump.

## The Proposed Solution: Structured State

### What Agent State Should Contain:

1. **Current understanding** of relevant entities and dependencies
2. **Assumptions/hypotheses** formed during earlier steps
3. **Expected behaviors/invariants** for actions taken
4. **Tentative/alternative hypotheses** to explore

### How Reasoning Should Work:

- Treat reasoning as **state addition/deletion/evolution** — not sequence of independent actions
- After each action: **update state** (revise hypothesis, adjust expectations, incorporate evidence)
- Keep reasoning **cleaner and structured** — reduces noise, avoids full restarts

### Connecting Execution Feedback:

- Map feedback to corresponding assumptions/hypotheses
- Identify which state components are affected
- Revise planned next steps based on feedback
- Update expectations for subsequent steps

## Key Insights for BuildOS Agentic Chat

### 1. Implement Explicit Agent State

Instead of just conversation history, maintain structured state:

```typescript
interface AgentState {
	currentContext: {
		activeProject?: Project;
		activeTasks: Task[];
		userIntent?: string;
	};
	hypotheses: {
		id: string;
		assumption: string;
		confidence: number;
		evidence: string[];
	}[];
	pendingActions: Action[];
	expectations: {
		action: string;
		expectedOutcome: string;
	}[];
}
```

### 2. State Transitions, Not Reconstructions

When user provides feedback:

- DON'T: Re-read entire conversation history
- DO: Update specific state components based on feedback type

### 3. Hypothesis Tracking

When agent makes assumptions:

- **Explicitly record them** in state
- **Link to evidence** that supports them
- **Update/invalidate** when contradicted

### 4. Pre/Post Conditions for Actions

Before executing an action:

- Record what you expect to happen
- After execution: compare actual vs expected
- If mismatch: update state, don't just continue

## Actionable Ideas for BuildOS

### Immediate

1. Add a `currentContext` object to agentic chat that persists across turns
2. When agent makes assumptions (e.g., "working on Project X"), log them explicitly
3. When user corrects agent, update context rather than starting fresh

### Medium-Term

4. Implement hypothesis tracking:
    - Agent proposes: "I think you want to create a task for this"
    - Store as hypothesis with confidence
    - If user confirms/denies, update and learn

5. Add "expected outcome" tracking:
    - Agent: "I'll create this task for you" → expect: task created
    - If task creation fails → agent knows to update state

### Long-Term

6. Build a finite-state machine abstraction for multi-step workflows
7. Implement structured "where did I go wrong?" backtracking
8. Create agent memory that separates:
    - Completed actions (immutable)
    - Current hypotheses (mutable)
    - Pending decisions (queued)

## Connection to Ontology Graph

The paper's concept of "structure" maps directly to BuildOS's ontology:

- **Entities**: Projects, tasks, contexts, people
- **Relations**: Parent/child, dependencies, contexts
- **State**: Current status, priorities, deadlines

**Insight:** The ontology graph IS the agent's structured state for understanding user's work. Agentic chat should READ and WRITE to it as part of reasoning.

## Key Quotes

> "Current SE agents remain fundamentally reactive, making decisions mainly based on conversation history and the most recent response."

> "Without a persistent structure or state, agents can lose track of their objectives, misinterpret environmental changes, and produce actions that conflict with earlier steps."

> "Developers do not solve tasks step-by-step in isolation. Developers gradually build their mental model based on code structure, dependencies, runtime behavior, and their interactions."

> "Every piece of feedback, whether expected or unexpected, represents a state transition that needs to be integrated or updated into the ongoing reasoning."

---

_Original paper content below_

---

Towards Structured, State-Aware, and Execution-Grounded
Reasoning for Software Engineering Agents
Tse-Hsun (Peter) Chen
Software PErformance, Analysis, and Reliability (SPEAR) lab
Concordia University
Montreal, QC, Canada
peterc@concordia.ca
Abstract
Software Engineering (SE) agents have shown promising abilities
in supporting various SE tasks. Current SE agents remain fundamentally reactive, making decisions mainly based on conversation
history and the most recent response. However, this reactive design
provides no explicit structure or persistent state within the agent’s
memory, making long-horizon reasoning challenging. As a result,
SE agents struggle to maintain a coherent understanding across
reasoning steps, adapt their hypotheses as new evidence emerges,
or incorporate execution feedback into the mental reasoning model
of the system state.
In this position paper, we argue that, to further advance SE
agents, we need to move beyond reactive behavior toward a structured, state-aware, and execution-grounded reasoning. We outline
how explicit structure, persistent and evolving state, and the integration of execution-grounded feedback can help SE agents perform
more coherent and reliable reasoning in long-horizon tasks. We
also provide an initial roadmap for developing next-generation SE
agents that can more effectively perform real-world tasks.
ACM Reference Format:
Tse-Hsun (Peter) Chen. 2026. Towards Structured, State-Aware, and ExecutionGrounded Reasoning for Software Engineering Agents. In 7th International
Workshop on Bots and Agents in Software Engineering (BoatSE ’26), April
12–18, 2026, Rio de Janeiro, Brazil. ACM, New York, NY, USA, 4 pages.
https://doi.org/10.1145/3786161.3788456
1 Introduction
Developers are rapidly adopting large language model (LLM) agents
to assist with a variety of software engineering activities. Beyond
simple code completion, recent work shows that Software Engineering (SE) agents can invoke tools, analyze execution feedback, and
iteratively update code or configurations [8, 9, 17, 19, 22]. Emerging
agentic SE development platforms such as GitHub Copilot, OpenAI’s GPT-5.1-Codex, Anthropic’s Claude Code, and TRAE [1, 3, 6,
12] also show a trend toward integrating agent-driven workflows
into end-to-end software development.
Despite significant progress, current SE agents still operate reactively. Their decisions are based on the most recent prompt and
conversation history [11, 16, 20], with no structured representation
This work is licensed under a Creative Commons Attribution 4.0 International License.
BoatSE ’26, Rio de Janeiro, Brazil
© 2026 Copyright held by the owner/author(s).
ACM ISBN 979-8-4007-2393-3/2026/04
https://doi.org/10.1145/3786161.3788456
or evolving states in the agent memory. Moreover, execution feedback is often incorporated in an ad-hoc manner rather than as an
integrated part of the agent’s reasoning. These limitations make
long-horizon planning inherently challenging. Without a persistent
structure or state, agents can lose track of their objectives, misinterpret environmental changes, and produce actions that conflict
with earlier steps. The absence of stateful connections across tool
outputs and reasoning results further prevents agents from forming
a coherent understanding of how the system evolves as they act.
In contrast, real-world development requires structured and stateful reasoning that evolves based on the system state and execution
feedback. Developers do not solve tasks step-by-step in isolation.
Developers gradually build their mental model based on code structure, dependencies, runtime behavior, and their interactions. They
create initial hypotheses to reason about the root cause of a failure
or the impact of new code changes, and refine the hypotheses after receiving feedback from compilers, test results, debuggers, or
logs [14]. Every piece of feedback, whether expected or unexpected,
represents a state transition that needs to be integrated or updated
into the ongoing reasoning. This evolving mental model guides
subsequent decisions, such as what to inspect next, how a
change may propagate, or whether to form a completely new
hypothesis.
Current LLM-based agents cannot support structured, executiongrounded reasoning, as all reasoning and execution feedback are
represented as unstructured text. Without concrete, well-defined
structures, agents struggle to capture how system states transition over time or to leverage the implicit conditions that condition
those states. Although execution feedback provides evidence of how
software states change, current agents lack the necessary representation to incorporate this information into a coherent, constantly
evolving behavioral model of the system. Thus, the agents must
iteratively reconstruct their understanding from an unstructured,
noisy prompt history, leading to inconsistent, less reliable multistep reasoning.
In this paper, we argue that advancing SE agents requires
rethinking the foundations of their reasoning processes. We
believe that effective agent reasoning must incorporate explicit
structure, behavior state, and execution-grounded updates. These
capabilities mirror how human developers construct and refine
agents’ mental models to understand the software systems over
time.
Paper Organization. Section 2 discusses the current limitation
in SE agents. Section 3 presents the future roadmap for SE agents.
Section 4 concludes the paper.
arXiv:2602.04640v1 [cs.SE] 4 Feb 2026
BoatSE ’26, April 12–18, 2026, Rio de Janeiro, Brazil Tse-Hsun (Peter) Chen
2 The Fundamental Mismatch in SE Agent
Reasoning
In this section, we discuss the limitations of existing reactive SE
agents. We use agent state to refer to the agent’s explicit persistent
representation of its current understanding of the system (e.g.,
inferred failure points, invariants, or dependency relations). We use
hypothesis to refer to any provisional assumption or expectation
the agent forms during reasoning (e.g., anticipated behavior after
a code change). We use structure to describe the organization of
this state. The structure describes how hypotheses, dependencies,
and observations are stored, updated, and related. We distinguish
between system state, which refers to the software under analysis’s
actual runtime or code-level state, and agent state, which captures
the agent’s current understanding of the system. Importantly, we
do not treat states as raw conversational memory or retrieved text,
but as a structured representation that can be revised and validated.
These definitions help clarify the limitations of current reactive
agents, which lack explicit mechanisms to maintain or evolve such
structured states across reasoning steps.
2.1 Why SE Tasks Expose the Limits of Reactive
Agents
Recent research finds that the reasoning abilities of these agents
degrade as interactions grow longer [2, 10]. As interactions grow
longer, agents often lose track of prior reasoning, generate inconsistent results, or overfit to the most recent output [13]. These behaviors suggest that current reactive agent designs lack the mechanisms
needed to sustain coherent reasoning over extended SE workflows.
However, software engineering tasks often require long chains of
reasoning that integrate evidence across multiple steps. Developers
must iteratively update their understanding of the system (i.e.,
system state) and the hypotheses that guide their reasoning as new
evidence appears. More importantly, each step in a task reshapes the
system’s states and affects the internal model of the entire process.
Recent agent research has explored various forms of memory
to extend context, including retrieval-based memory, vector-store
memories, and long-term conversation summaries [4, 11, 13, 18].
These approaches primarily focus on information retention and
recall, enabling agents to retrieve past observations. In contrast, our
notion of state-aware reasoning focuses on maintaining explicit,
structured representations of the agent’s current reasoning commitments, such as hypotheses, invariants, dependencies, and preand post-conditions.
This long-horizon reasoning process creates three main challenges:
• Historical coherence: agent decisions must remain consistent with prior insights, or we need to explicitly revise or
remove them when they are no longer valid.
• Interpretive stability: new evidence must be understood
in the context of existing beliefs about the system, rather
than in isolation.
• Pre–post reasoning consistency: agents must maintain
hypotheses about the system’s behavior before and after each
action, and systematically update or correct these hypotheses
as new feedback arrives.
Input
LLM Agent Tools
Output
Input
Statet
• Hypothesis
• Invariant
• Pre/post
conditions
• Dependencies
• Statet-1
LLM Agent
• Read Statet
• Plan/Generate
action
Tools Execution
feedback
a) Reactive SE agent b) Structured, state-aware, and
execution grounded SE agent
Figure 1: An illustration of the difference between reactive
SE agents and structured, state-aware, execution-grounded
agents. The example highlights the explicit persistence and
evolution of agent state across actions.
Position Statement
We believe addressing these main challenges requires innovative research solutions that maintain and evolve structured
agent states across reasoning steps. Without such structured
memory representations and guidance, agents may exhibit inaccurate reasoning, reasoning drift, and misalignment over the
course of a long reasoning process.
2.2 How the Reactive Paradigm Fails in Practice
Since current SE agents do not explicitly maintain structured reasoning states or track their intermediate hypotheses, they need to
repeatedly reconstruct their understanding from the entire prompt
history. Figure 1 illustrates the difference between reactive, and
structured, state-aware, and execution-grounded SE agents. Empirical analyses of agent trajectories show that this reconstructionbased process produces several recurring failure patterns in longhorizon SE tasks [2, 13, 21].
Inconsistent reasoning reconstructions. Without stable intermediate representations, agents may generate inconsistent explanations or plans across steps. Prior evaluations on benchmarks
such as SWE-bench show that repeated runs, even under identical initial conditions, frequently lead to decisions that contradict
earlier reasoning [2, 7]. We believe these inconsistencies are more
prevalent because each reconstruction attends to different parts of
the available context, making it impossible to maintain a coherent
logical link to earlier insights.
Forgotten assumptions and broken reasoning process. The
“assumptions” or “hypotheses” that the SE agents made across actions in the reasoning process are not tracked and maintained in
agent memory. These assumptions, such as suspected failure points,
invariants, or expected behavior after code changes, are important
hypotheses that affect reasoning decisions. Bouzenia et al. [2] show
that agents often contradict earlier self-generated constraints or
reintroduce issues they had resolved previously. Without ways to
Towards Structured, State-Aware, and Execution-Grounded Reasoning for Software Engineering Agents BoatSE ’26, April 12–18, 2026, Rio de Janeiro, Brazil
store or revise hypotheses, agents cannot preserve or update the
rationale that motivates their actions.
Interpreting execution feedback in isolation. Currently, execution feedback, such as test execution, runtime traces, and logs,
is provided to agents in unstructured text format. Because agents
lack clear records of what they assumed in earlier steps, they often
interpret this feedback in isolation rather than as part of an ongoing
line of reasoning. Prior work [5, 13, 15] shows that this leads agents
to focus on the most recent messages or the incorrect part of the
system. Since execution feedback is not connected to their earlier
reasoning, agents struggle to form a stable view of what the system
is doing or how their hypotheses should change.
Retrying without knowing where to return. When errors or
contradictions occur in the reasoning process, many agents perform
a reset-and-retry strategy. However, most agents often restart the
entire process from the beginning, rather than identifying a specific
step where the reasoning went off course [2, 21]. Localizing the
specific problematic step can be challenging without a proper agent
memory structure to represent the actions. A complete restart also
incurs additional overhead, produces inconsistent output, or may
even cause the agent to repeat the same failure, as all prior reasoning
was removed.
The above-mentioned failure patterns are model-agnostic and
tied to the reactive nature of the current SE agent design. We believe addressing these limitations requires rethinking how agents
represent, update, and rely on intermediate reasoning states.
3 Rethinking SE Agent Reasoning: From
Reactive to Structured
In this section, we outline an initial roadmap for moving from reactive SE agents to structured, state-aware, and execution-grounded
reasoning.
From Conversation Histories to Explicit Intermediate Representations. To support long-horizon tasks, instead of directly
using the conversation history as agent memory, agents should
leverage explicit intermediate representations that stores:
• the current understanding of the relevant code elements and
their dependencies,
• assumptions and hypotheses formed during earlier steps,
• expected behavior or invariants of the actions, and
• tentative or alternative hypotheses that may be further explored.
Our recent study [7] shows that representing agent actions using a finite-state machine abstraction with explicit pre- and postconditions (e.g., similar to forming hypotheses before making actions) leads to more stable and accurate multi-step reasoning. Such
structured representations help separate completed actions from
unresolved hypotheses, allow systematic refinement of earlier assumptions, and avoid interpreting long conversational histories.
Reasoning as an Evolving State Rather Than Repeated Reconstruction. Developers maintain and continuously refine a mental model of the task that they are solving. To emulate this behavior,
agents should treat reasoning as the addition, deletion, or evolution
of an internal state rather than a sequence of independent actions.
The agent should update the state, such as revise the hypothesis, adjust expected behaviour, or include new evidence, after each action
or tool invocation.
Maintaining the states keeps the reasoning process cleaner and
more structured. This reduces the noise an LLM receives and avoids
the need to restart the entire process when an error occurs. A
structured representation also makes it easier for the agent to selfreflect and pinpoint where an incorrect assumption was introduced
in the reasoning process.
Connecting Execution Feedback to Structured Updates. Existing agents often treat execution feedback as text appended to
the prompt [8, 9, 17, 19, 22]. However, software engineering tasks
require interpreting feedback based on prior assumptions about
system behavior and code structure. A structured agent must therefore:
• map execution feedback to the corresponding assumptions
or hypotheses (e.g., a failing test indicating that an assumed
invariant about the system’s behavior does not hold),
• identify which components of the internal state are affected
and how,
• revise any assumptions or planned next steps that depend
on the feedback, and
• update hypotheses about how the system is expected to
behave in subsequent steps.
Treating execution feedback as structured evidence allows the
agent to incorporate new information into its internal state, rather
than responding to each observation independently. We believe
this gives agents a more stable and coherent understanding of the
system’s behavior.
Overall, rethinking SE agent reasoning calls for an evolution
from reactive behavior toward structured, reasoning-grounded processes. These directions point to a potential roadmap for a new
generation of SE agents capable of maintaining coherent, statedriven reasoning across long-horizon tasks.
4 Conclusion
Current Software Engineering (SE) agents remain fundamentally reactive, making decisions mainly based on the most recent response.
However, we argue that effective agent reasoning requires explicit
structure, persistent state, and integration of execution-grounded
feedback. These principles are critical for agents to maintain coherent reasoning across steps, adapt their understanding as new
evidence appears, and better support complex workflows in realworld SE tasks.
Our roadmap outlines an initial direction for developing more
reliable and capable SE agents. Moving toward structured, stateaware, and execution-grounded reasoning will require new agent
memory representations and better integration with analysis and
runtime tools to improve the need for long-horizon reasoning in
SE tasks.
References
[1] Anthropic. 2025. Claude Code. https://www.claude.com/product/claude-code.
Accessed: 2025-12-01.
[2] Islem Bouzenia and Michael Pradel. 2025. Understanding Software Engineering
Agents: A Study of Thought-Action-Result Trajectories. In Proceedings of the 40th
BoatSE ’26, April 12–18, 2026, Rio de Janeiro, Brazil Tse-Hsun (Peter) Chen
IEEE/ACM International Conference on Automated Software Engineering (ASE’25).
12 pages.
[3] ByteDance. 2025. TRAE. https://www.trae.ai/. Accessed: 2025-12-01.
[4] Prateek Chhikara, Dev Khant, Saket Aryan, Taranjeet Singh, and Deshraj Yadav. 2025. Mem0: Building Production-Ready AI Agents with Scalable Long-Term
Memory. arXiv:2504.19413 [cs.CL] https://arxiv.org/abs/2504.19413
[5] Darshan Deshpande, Varun Gangal, Hersh Mehta, Jitin Krishnan, Anand Kannappan, and Rebecca Qian. 2025. TRAIL: Trace Reasoning and Agentic Issue
Localization. arXiv:2505.08638 [cs.AI] https://arxiv.org/abs/2505.08638
[6] GitHub, Inc. 2025. GitHub Copilot. https://github.com/features/copilot. Accessed:
2025-12-01.
[7] Linqiang Guo, Wei Liu, Yi Wen Heng, Tse-Hsun (Peter) Chen, and Yang Wang. 2026. Agent-SAMA: State-Aware Mobile Assistant. In The Fortieth AAAI Conference on Artificial Intelligence (AAAI’26).
[8] Dong Huang, Jie M. Zhang, Michael Luck, Qingwen Bu, Yuhao Qing, and Heming
Cui. 2024. AgentCoder: Multi-Agent-based Code Generation with Iterative Testing and Optimisation. arXiv:2312.13010 [cs.CL] https://arxiv.org/abs/2312.13010
[9] Feng Lin, Dong Jae Kim, and Tse-Hsun (Peter) Chen. 2025. SOEN-101: Code
Generation by Emulating Software Process Models Using Large Language Model
Agents. 1527–1539.
[10] Junwei Liu, Kaixin Wang, Yixuan Chen, Xin Peng, Zhenpeng Chen, Lingming
Zhang, and Yiling Lou. 2025. Large Language Model-Based Agents for Software
Engineering: A Survey. arXiv:2409.02977 [cs.SE] https://arxiv.org/abs/2409.02977
[11] Xiangxin Meng, Zexiong Ma, Pengfei Gao, and Chao Peng. 2025. An Empirical
Study on LLM-based Agents for Automated Bug Fixing. arXiv:2411.10213 https:
//arxiv.org/abs/2411.10213
[12] OpenAI. 2025. GPT-5.1-Codex and GPT-5.1-Codex-Max. https://openai.com/
index/gpt-5-1-codex-max-system-card/. Accessed: 2025-12-01.
[13] Md Nakhla Rafi, Dong Jae Kim, Tse-Hsun Chen, and Shaowei Wang. 2026. Order
Matters! An Empirical Study on Large Language Models’ Input Order Bias in
Software Fault Localization. In Proceedings of the 48th IEEE/ACM International
Conference on Software Engineering (ICSE’26).
[14] Martin P. Robillard, Wesley Coelho, and Gail C. Murphy. 2004. How Effective
Developers Investigate Source Code: An Exploratory Study. IEEE Trans. Softw.
Eng. 30, 12 (Dec. 2004), 889–903. doi:10.1109/TSE.2004.101
[15] Devjeet Roy, Xuchao Zhang, Rashi Bhave, Chetan Bansal, Pedro Las-Casas, Rodrigo Fonseca, and Saravan Rajmohan. 2024. Exploring LLM-Based Agents for
Root Cause Analysis. In Companion Proceedings of the 32nd ACM International
Conference on the Foundations of Software Engineering (FSE’24). 208–219.
[16] Noah Shinn, Federico Cassano, Ashwin Gopinath, Karthik Narasimhan, and
Shunyu Yao. 2023. Reflexion: language agents with verbal reinforcement learning. In Advances in Neural Information Processing Systems (NeurIPS’23), A. Oh,
T. Naumann, A. Globerson, K. Saenko, M. Hardt, and S. Levine (Eds.). 8634–8652.
[17] Chunqiu Steven Xia, Yinlin Deng, Soren Dunn, and Lingming Zhang. 2025. Demystifying LLM-Based Software Engineering Agents. Proc. ACM Softw. Eng. 2,
FSE (2025).
[18] Wujiang Xu, Zujie Liang, Kai Mei, Hang Gao, Juntao Tan, and Yongfeng Zhang. 2025. A-Mem: Agentic Memory for LLM Agents. In The Thirty-ninth Annual
Conference on Neural Information Processing Systems (NeurIPS’25).
[19] John Yang, Carlos E Jimenez, Alexander Wettig, Kilian Lieret, Shunyu Yao,
Karthik R Narasimhan, and Ofir Press. 2024. SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering. In The Thirty-eighth Annual
Conference on Neural Information Processing Systems (NeurIPS’24).
[20] Shunyu Yao, Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran, Karthik R Narasimhan,
and Yuan Cao. 2023. ReAct: Synergizing Reasoning and Acting in Language
Models. In The Eleventh International Conference on Learning Representations
(ICLR’23).
[21] Shaokun Zhang, Ming Yin, Jieyu Zhang, Jiale Liu, Zhiguang Han, Jingyang Zhang,
Beibin Li, Chi Wang, Huazheng Wang, Yiran Chen, and Qingyun Wu. 2025. Which
Agent Causes Task Failures and When? On Automated Failure Attribution of
LLM Multi-Agent Systems. In Forty-second International Conference on Machine
Learning (ICML’25).
[22] Yuntong Zhang, Haifeng Ruan, Zhiyu Fan, and Abhik Roychoudhury. 2024. AutoCodeRover: Autonomous Program Improvement. In Proceedings of the 33rd ACM
SIGSOFT International Symposium on Software Testing and Analysis (ISSTA’24).
1592–1604.
