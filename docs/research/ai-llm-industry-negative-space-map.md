<!-- docs/research/ai-llm-industry-negative-space-map.md -->

# AI and LLM Industry Negative-Space Map

**Status:** Living research document  
**Last updated:** 2026-08-29  
**Scope:** The global generative, multimodal, and agentic AI industry, with emphasis on general-purpose models, consumer/work products, user adoption, and the boundary between free consumer chat and paid frontier agents.  
**Decision this should eventually inform:** Where an entrant could create meaningful value in AI without competing head-on in foundation models or generic chat.

## Current evidence-based answer

The AI industry appears saturated when viewed by product category: models, chatbots, coding tools, design tools, work agents, personal assistants, and vertical applications all have active competitors. The more promising negative space may be **between categories and user states**—especially between what frontier AI can do and what ordinary people can recognize, afford, trust, and operationalize.

The most important distinction supported by the current research is:

> The quality gap between a free and top-tier answer may be modest for ordinary questions. The experience gap becomes large when work is long, repeated, contextual, tool-using, high-volume, or parallel.

That makes the relevant product boundary less “free user versus paid user” than **episodic prompting versus sustained delegation**. It does not, by itself, prove that an entrant should build at this boundary. Public research has not established the causal return from moving an otherwise-similar person from Free to Plus or Max.

## How to read this document

- **Sourced fact** means a linked source directly supports the statement.
- **Reported behavior** means a survey or platform analysis observed it, but it may not establish causality.
- **Inference** means the conclusion follows from multiple facts but has not been directly measured.
- **Hypothesis** means an opportunity thesis that still needs to be tested.

This distinction matters because vendors publish detailed plan entitlements but very little causal research comparing the outcomes of otherwise-similar free and Max subscribers.

## Objective research snapshot

This pass was designed to test the earlier map rather than confirm it. It prioritized official plan documentation, independent or academic experiments, payment-transaction data, nationally representative surveys, and contrary evidence. Vendor usage studies are included only as observational evidence.

| Question                                          | Evidence-based answer                                                                                                                                   |                                      Confidence |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------: |
| Is the Free-to-Max experience gap real?           | Yes for capacity, context, premium modes, continuity, and agentic work; often modest for a simple answer.                                               |                                            High |
| Is the best paid model 5× or 20× better?          | No. Those multiples describe usage allowance. Independent model comparisons show a smaller, task-dependent quality gap.                                 |                                            High |
| Does paying create a power user?                  | Unknown. No broad causal Free-versus-Max user-outcome study was found.                                                                                  |             High confidence in the evidence gap |
| Does AI mainly compound skilled users' advantage? | Not generally. Structured, context-rich assistants can help novices most; open-ended agent work still rewards domain expertise and recovery skill.      |                                            High |
| Are nonusers mainly blocked by not knowing how?   | No. Lack of interest, privacy concern, and accuracy distrust are more common reasons.                                                                   |                            High for U.S. adults |
| Are top-tier subscribers mainstream?              | No. Transaction data and OpenAI's own estimate indicate that only a small minority pays for any AI service; the $100/$200 subset is not publicly sized. |      High directionally; low on exact tier size |
| Is burst access untouched negative space?         | No. Major providers are already adding credits, top-ups, and usage bundles. Pay-per-outcome without a base subscription remains unproven.               |                                            High |
| What is the clearest unresolved seam?             | Independent task-to-tier fit and outcome measurement: when does premium access materially change a real user's result enough to justify its cost?       | High as an evidence gap; unproven as a business |

### Research correction log

- **Revised:** “Skill-price compounding” is a conditional mechanism, not a general law.
- **Downgraded:** A generic capability-education bridge is not an industry blind spot; labs and institutions already invest in it.
- **Downgraded:** Burst access is an active packaging front, not empty space.
- **Strengthened:** Domain integration, verification, and recovery appear more important than prompting technique alone.
- **Added:** A top-tier individual subscription buys compute and capability, not automatically enterprise privacy, governance, or organizational permission.
- **Added:** The lack of independent tier-ROI evidence may itself be the most structurally overlooked seam.

---

# Part I — Map the visible AI terrain

## 1. The industry stack

The current AI system can be mapped as nine layers:

```text
9. Users, institutions, and physical systems
8. Industry-specific applications
7. Horizontal AI work surfaces
6. Tools, skills, memory, context, and interoperability
5. APIs, inference, routing, and agent runtimes
4. Foundation models
3. Cloud training and inference
2. Chips, memory, networking, and data centers
1. Power, land, cooling, fabrication capacity, and capital
```

Value and attention do not move evenly through this stack. Most public attention concentrates on layers 4 and 7—models and visible products—while many adoption failures occur in layers 6 and 9: context, permissions, workflows, trust, and institutions.

## 2. Physical infrastructure

### Visible actors and assets

- Electricity generation, transmission, grid interconnection, cooling, land, and water
- Semiconductor fabrication and advanced packaging
- GPUs, TPUs, inference accelerators, high-bandwidth memory, networking, and storage
- Hyperscale cloud and specialized GPU clouds
- Capital providers underwriting increasingly large infrastructure cycles

Representative actors include Nvidia, AMD, Google, AWS, Microsoft, major foundries, memory manufacturers, networking vendors, utilities, and data-center operators.

### Direction of movement

The emphasis is broadening from training frontier models to serving sustained inference. Agentic systems make tokens per watt, latency, memory, storage, sandbox capacity, and reliable long-duration execution more important. Nvidia’s Rubin platform and Google’s TPU roadmap both foreground system-level inference performance rather than treating a chip as an isolated component ([Nvidia Rubin](https://www.nvidia.com/en-us/data-center/technologies/rubin/), [Google Cloud TPUs](https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/tpus-8t-8i-cloud-next/)).

### What this layer rewards

- Utilization
- Tokens per dollar and per watt
- Throughput and latency
- Long-term capacity commitments
- Large, predictable buyers

This naturally favors high-volume business and agent workloads over low-frequency consumer needs.

## 3. Foundation models

### Major participants

OpenAI, Anthropic, Google, Meta, xAI, DeepSeek, Alibaba, Mistral, Moonshot, Z.ai, and other regional or open-weight developers compete across:

- Reasoning and difficult problem-solving
- Coding and tool use
- Long-context and long-horizon work
- Multimodal understanding and generation
- Computer use and browser action
- Scientific performance
- Speed, price, and efficiency
- Open weights and deployment control
- Safety, controllability, and enterprise assurance

The [Stanford AI Index](https://hai.stanford.edu/ai-index) documents the pace of model progress and the growing competitiveness of smaller and open models. Raw model quality still matters, but the product advantage increasingly depends on how models are wrapped in context, tools, runtime, and distribution.

## 4. Access, runtime, and orchestration

Between models and products sits a large enabling layer:

- Model APIs and inference platforms
- Model routing and fallback
- Prompt and response caching
- Fine-tuning and post-training
- Retrieval, memory, and context assembly
- Sandboxed execution and durable jobs
- Observability, evaluation, and guardrails
- Identity, permissions, secrets, and billing
- Agent runtimes and multi-agent coordination

Representative companies and projects include LangChain/LangSmith, LlamaIndex, Braintrust, Arize, Langfuse, and OpenRouter.

This layer is strategically important because “the model can do it” is different from “the system can do it reliably, repeatedly, with the right information and authority.”

## 5. Interoperability and portable agent capability

Several standards and conventions are forming around agent systems:

- **MCP:** connections between agents and tools or data ([Anthropic introduction](https://www.anthropic.com/news/model-context-protocol))
- **A2A:** communication between agents ([A2A protocol](https://a2a-protocol.org/latest/))
- **Agent Skills:** portable instructions and resources for recurring capabilities
- **AGENTS.md:** repository-local guidance for coding agents
- **Agent SDKs:** primitives for tool use, handoffs, traces, and runtime control ([OpenAI Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/))

The emerging contest is not only over who owns the best model. It is also over who owns the user’s context, workflow definitions, tool permissions, and durable history.

## 6. Horizontal product fronts

| Product front             | User job                                   | Representative products                             | Competitive center                                |
| ------------------------- | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------- |
| Conversation and advice   | Ask, learn, decide, draft                  | ChatGPT, Claude, Gemini, Perplexity                 | Breadth, trust, memory, distribution              |
| Coding                    | Build and maintain software                | Claude Code, Codex, Cursor, Copilot, Antigravity    | Repository context, long tasks, execution, review |
| General knowledge work    | Research, analyze, create deliverables     | Claude Cowork, ChatGPT Work, Microsoft 365 Copilot  | Finished artifacts, integrations, permissions     |
| Design                    | Create and modify interfaces and assets    | Figma AI, Canva AI, Adobe Firefly                   | Canvas control, brand systems, editable output    |
| Browser and computer use  | Navigate sites and complete actions        | Computer-use agents, Comet, cloud browsers          | Reliability, authentication, safe action          |
| Personal operating system | Maintain context and coordinate life       | OpenClaw, Siri AI, personal Claude/ChatGPT/Gemini   | Memory, local control, channels, proactive action |
| Enterprise agent platform | Deploy governed agents                     | OpenAI, Microsoft, Salesforce, Google Cloud         | Security, identity, governance, distribution      |
| Shared work               | Coordinate documents, projects, and teams  | Notion, Asana, Atlassian, ClickUp                   | Shared context and workflow ownership             |
| Creative media            | Generate and edit images, audio, and video | Adobe, Runway, OpenAI, Google, ElevenLabs, Canva    | Control, consistency, editing, rights             |
| Embodied AI               | Act in physical environments               | Gemini Robotics, Nvidia GR00T/Cosmos, Figure, Skild | World models, hardware, safety, deployment        |

## 7. Model labs are expanding into operating surfaces

The model companies are moving outward from chat:

- Anthropic: Claude → Claude Code → Claude Cowork and specialized work surfaces
- OpenAI: ChatGPT → research and work agents → Codex and multi-step execution
- Google: Gemini → Workspace and Search → AI Studio, Jules, Antigravity, and personal agents

The common evolution is:

```text
answering → artifacts → tool use → multi-step work → persistence → parallel agents
```

This shift is visible in Anthropic’s discussion of containing long-running Claude work, OpenAI’s agent platform, and Google’s expanding developer surfaces ([Anthropic](https://www.anthropic.com/engineering/how-we-contain-claude), [OpenAI](https://help.openai.com/en/articles/20001275/), [Google I/O 2026 developer highlights](https://blog.google/innovation-and-ai/technology/developers-tools/google-io-2026-developer-highlights/)).

## 8. Incumbents are defending owned context

Existing software companies do not need to win the generic model race if they retain the place where work already happens:

- Figma owns the design canvas ([Figma AI](https://www.figma.com/solutions/ai-design-agent/)).
- Canva owns accessible, template-driven creation ([Canva Create 2026](https://www.canva.com/newsroom/news/canva-create-2026-ai/)).
- Adobe owns professional creative workflows.
- Notion, Asana, Atlassian, and ClickUp own shared project context.
- Microsoft owns office documents, email, identity, and enterprise distribution.
- Salesforce owns CRM data and sales workflows.
- Apple owns devices and a privileged path to personal context ([Apple Siri AI](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)).

Their defense is less “our model is smarter” and more “the user does not have to move or reconstruct context.”

## 9. The personal-AI operating-system front

[OpenClaw](https://openclaw.ai/) represents an increasingly important product shape: a local or self-hosted personal agent that can use a chosen model, maintain persistent memory, receive requests through messaging channels, access email/calendar/files/browser, run schedules, load skills, and coordinate other agents.

Many products are converging on part of this vision. The open question is who controls:

- The durable personal context
- The permission boundary
- The interface across devices and channels
- The workflow and skill library
- The record of completed and pending work
- The user’s ability to move between models

## 10. Industry-specific applications

### Heavily pursued

- Software development
- Marketing and content
- Sales and customer support
- Search and research
- Legal work
- Finance and analysis
- Cybersecurity
- Healthcare documentation and administration
- Education and tutoring
- Design and media production

Examples include [Harvey](https://www.harvey.ai/newsroom) in legal AI and the broad expansion of clinical AI described by [Stanford Medicine](https://medicine.stanford.edu/news/stories/2026/01/clinical-ai-has-boomed.html).

### Developing but less mature

- Autonomous science and research
- Drug and materials discovery
- Robotics and physical-world operation
- Government and public-service delivery
- Infrastructure planning and maintenance
- Fully autonomous personal agents
- Long-duration work spanning multiple institutions

Examples include Google’s [AI co-scientist](https://deepmind.google/blog/co-scientist-a-multi-agent-ai-partner-to-accelerate-research/) and Nvidia’s [physical AI partnerships](https://nvidianews.nvidia.com/news/nvidia-and-global-robotics-leaders-take-physical-ai-to-the-real-world).

## 11. User adoption is not one variable

“Uses AI” collapses at least five distinct levels:

1. **Breadth:** Has tried a chatbot.
2. **Frequency:** Uses it regularly.
3. **Depth:** Uses advanced models, files, tools, projects, or agents.
4. **Integration:** Gives it real context and connects it to systems.
5. **Delegation:** Trusts it to complete work or take action.

### Provisional user map

| User group                              |                          Breadth |          Typical depth | Important qualification                                        |
| --------------------------------------- | -------------------------------: | ---------------------: | -------------------------------------------------------------- |
| AI and software workers                 |                             High |              Very high | Overrepresented in product design and discourse                |
| Founders and AI-forward business owners |                High within group |                   High | Clear economic reason to experiment                            |
| Executives and managers                 |                          Growing |            Medium–high | Often supported by organizational tooling                      |
| General knowledge workers               |                 Broad but uneven |             Low–medium | Access and training depend on employer                         |
| Students                                |                        Very high |     Usually low–medium | High frequency does not imply frontier use                     |
| Creators and marketers                  |                             High |                 Medium | Strong output-oriented workflows                               |
| General consumers                       |                            Broad |                    Low | Advice, information, writing, and occasional planning dominate |
| Small businesses overall                | Lower than the narrative implies |                 Uneven | Many have not operationalized AI                               |
| Frontline and physical workers          |                              Low |                    Low | Work is less digitized and less visible to agents              |
| Older adults                            |                 Lower but rising |                    Low | Interest, confidence, and trust vary widely                    |
| Regulated professionals                 |                           Uneven | Institution-controlled | Permission may matter more than capability                     |

### Business adoption

U.S. Census data indicated that roughly 17–20% of businesses used AI in late 2025 and early 2026, with much higher use in large firms than the smallest firms ([U.S. Census Bureau](https://www.census.gov/library/stories/2026/05/ai-use-businesses.html)). Gallup found growing but uneven workplace use, concentrated in remote, managerial, technology, finance, and professional-service roles ([Gallup](https://www.gallup.com/workplace/712736/organizational-adoption-jumps-six-points.aspx)).

**Inference:** The supply side may cover nearly every business case while the demand side has operationalized only a minority of them.

### Students

Student adoption is high. Pew found 54% of U.S. teens had used a chatbot for schoolwork; HEPI reported 95% of surveyed UK undergraduates used AI and 94% used it for assessed work; the OECD reported broad use among older students ([Pew](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/), [HEPI](https://www.hepi.ac.uk/reports/student-generative-ai-survey-2026/), [OECD](https://www.oecd.org/en/about/news/announcements/2026/01/ai-use-by-individuals-surges-across-the-oecd-as-adoption-by-firms-continues-to-expand.html)).

But OpenAI reports that even advanced college-age users use ChatGPT capabilities roughly 90–99% less than power users ([OpenAI education analysis](https://openai.com/index/learn-teach-chatgpt-work-codex/)).

**Inference:** Students are a high-breadth, lower-relative-depth group—not a low-adoption group.

### Consumers

OpenAI’s consumer analysis found that non-work use dominates ChatGPT activity and that asking for guidance, information, and writing help is more common than pure task execution ([OpenAI consumer-use study](https://openai.com/index/how-people-are-using-chatgpt/)). Pew found consumers also use chatbots for medical advice, emotional support, and companionship, though the latter two remain minority behaviors ([Pew 2026](https://www.pewresearch.org/internet/2026/06/17/americans-and-ai-2026-chatbots-smart-devices-and-views-on-impact/)).

This consumer surface is wide but often shallow: a general-purpose adviser rather than a deeply integrated operator.

## 12. Adoption divides

Important divides include:

- Age, education, income, and geography
- Digital knowledge work versus physical/frontline work
- Individual access versus employer- or school-supported access
- Free access versus paid frontier access
- Permission versus technical capability
- Trust, privacy, and fear of error
- Language and local-context support
- Work already represented in software versus work that remains tacit or offline

Anthropic finds that AI use remains concentrated in higher-income places and computer-heavy occupations, while the OECD reports large age, education, and income gaps ([Anthropic Economic Index](https://www.anthropic.com/research/economic-index-june-2026-report), [OECD](https://www.oecd.org/en/about/news/announcements/2026/01/ai-use-by-individuals-surges-across-the-oecd-as-adoption-by-firms-continues-to-expand.html)).

Pew's nationally representative February 2026 survey shows why “teach people how” is an incomplete adoption thesis. Among U.S. adults who never use chatbots, 83% cite lack of interest, 79% concern about personal information, 76% accuracy distrust, and 55% not knowing how. Only 29% call lack of know-how a major reason. Mainstream non-adoption therefore contains at least three different problems—perceived relevance, trust/privacy, and capability—not one generic skills deficit ([Pew](https://www.pewresearch.org/internet/2026/06/17/why-dont-people-use-chatbots/)).

## 13. What the industry foregrounds

The dominant labs, platforms, analysts, and investors foreground:

- Benchmark and model performance
- Coding performance and agent task duration
- Token price, latency, and context windows
- Enterprise revenue and deployed agents
- Tasks automated and artifacts produced
- Integration counts
- Safety, compliance, and regulation
- Compute efficiency and tokens per watt

These measures pull investment toward work that is:

- Digital and already accessible through APIs
- Frequent enough to justify integration
- Performed by users or firms able to pay
- Measurable in software
- Distributed through an existing product or institution

## 14. Rules and regulatory surfaces

The EU AI Act creates obligations around risk, transparency, and enforcement, while U.S. practice emphasizes sector-specific assurance and frameworks such as the NIST AI Risk Management Framework ([European Commission](https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august), [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)).

Regulation is not only a barrier. It also shapes which institutions can grant permission, which intermediaries can earn trust, and which use cases remain invisible because no actor owns the assurance layer.

---

# Part II — Negative-space boundary map

The most interesting spaces currently appear at boundaries rather than inside established categories:

1. Digital knowledge work ↔ physical and frontline work
2. Power users ↔ mainstream shallow users
3. Students ↔ teachers and institutions
4. Individuals ↔ families, households, and communities
5. Business owners ↔ employees who perform the work
6. Domain experts ↔ technical AI operators
7. **Free consumer chat ↔ paid frontier agents**
8. Occasional life events ↔ repeated workflows
9. Personal context ↔ shared or institutional context
10. Advice ↔ action
11. Output generation ↔ real execution
12. High-income/high-adoption users ↔ lower-income or access-constrained users
13. People eager to delegate ↔ people who resist on privacy or authority grounds
14. Structured-software users ↔ work never captured in software
15. Model capability ↔ institutional permission

These are not automatically opportunities. Each needs an observer-specific explanation, a route into the market, and evidence that users will change behavior or pay.

---

# Part III — Deep dive on Boundary 7: free consumer chat ↔ paid frontier agents

## 15. The question

What experience does someone paying for a top-tier individual AI plan receive that an average free consumer does not? Is the gap primarily answer quality, or does it create a different mode of using AI?

## 16. Cohorts being compared

This analysis separates four groups that are often collapsed:

| Cohort                  | Typical relationship to AI                                   | Approximate plan shape                            |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Free mainstream user    | Occasional questions, writing, advice, light files or images | $0, dynamic limits                                |
| Standard paid user      | Regular use and selected advanced tasks                      | Usually around $20/month                          |
| Top-tier subscriber     | Frequent, demanding, or professional individual use          | Commonly $100 or $200/month                       |
| API/organizational user | Programmatic or governed production work                     | Usage- or seat-based; separate from consumer plan |

Payment and power use are not synonyms. A skilled user can be constrained on a free plan; an unskilled user can pay $200 and still use AI shallowly.

## 17. Current plan packaging

**Sourced facts, as of 2026-08-29. Plan features and limits change frequently.**

| Platform   | Free/mainstream experience                                                                                                                                                                                                              | Standard paid experience                                                                                                                                                                                             | Top-tier individual experience                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT    | Free users can search the web, analyze data, upload files/images, create images, and use GPTs, but advanced models and tools have stricter limits ([Free Tier FAQ](https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq)). | Plus is $20/month with higher model limits, advanced reasoning, faster responses, files, images, deep research, voice, and paid features ([Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)). | Pro now has $100 and $200 tiers with the same core advanced capabilities; the main difference is approximately 5× versus 20× Plus usage, with Pro-model allowance, Codex, deep research, memory, and files ([Pro tiers](https://help.openai.com/en/articles/9793128)).                                                                                                                                                                                                                                         |
| Claude     | Free access is designed for occasional use and has limited capacity.                                                                                                                                                                    | Pro is $20/month, supplies at least 5× the free session capacity, and includes priority access, Claude Code, and Cowork ([Claude Pro](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)).         | Max 5× is $100/month and Max 20× is $200/month, measured against Pro. Max adds far more capacity, priority access to new models/features, Claude Code, and Cowork ([Claude Max](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)). Select premium models may be included in Max but metered separately on Pro ([model-plan example](https://support.claude.com/en/articles/15424964-claude-fable-5-on-your-plan)).                                                                        |
| Gemini     | Users without an AI plan have access to Flash-Lite, Flash, and Pro, with standard limits and a 32K context window.                                                                                                                      | Google AI Pro provides 4× standard limits, higher access across Gemini and Google apps, and a 1M-token context window.                                                                                               | Ultra 5× is $100/month and Ultra 20× is $200/month relative to AI Pro; it adds higher quotas, priority/concurrency, Deep Think for eligible plans, personal and coding agents, and 20–30TB of storage ([limits](https://support.google.com/gemini/answer/16275805?hl=en-CA), [Ultra announcement](https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions/), [Ultra benefits](https://support.google.com/googleone/answer/16286513?hl=en)).                                     |
| Perplexity | Free offers practically unlimited basic searches but very limited Pro Search, file use, and no manual advanced-model access.                                                                                                            | Pro adds advanced models, deeper search, file analysis, image/video generation, and limited file/app creation.                                                                                                       | Max is $200/month and offers highest model access, more research and creation capacity, Max Assistant, early features, and a monthly allowance for agentic Computer work ([plan comparison](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you), [Max](https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max), [Computer credits](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity)). |

### Packaging pattern

OpenAI, Anthropic, and Google have converged on $100 and $200 individual tiers framed around roughly **5× and 20×** the ordinary paid tier. This is a strong market signal: the top-tier product is increasingly an **allowance for sustained intelligence and agent labor**, not merely a cleaner chatbot.

### Paying users are a small minority; the Max cohort is still opaque

Payment-transaction data and platform reporting provide a more credible baseline than selected self-report surveys. Bank of America found that approximately 3% of its households paid for AI services in early 2026. OpenAI CFO Sarah Friar told the Associated Press that about 95% of ChatGPT's more than 900 million weekly users paid nothing ([Bank of America Institute](https://institute.bankofamerica.com/economic-insights/consumer-ai-usage.html), [Associated Press](https://apnews.com/article/3c2674f5cdf67ac6d88eedb207de117c)).

This does not mean exactly 3–5% of all people pay: a household transaction panel and a platform user count have different denominators. It does establish that paid use is a small minority behavior. Self-reported surveys finding much higher payment shares are likely describing selected populations of engaged or self-identified AI users rather than the public at large.

OpenAI's analysis of 300,000 U.S. consumer accounts found active entrepreneurs disproportionately represented on higher-tier plans relative to its broader consumer sample and people who had not yet started a business. That is consistent with valuable recurring tasks selecting people into payment, but it does not show that the plan caused their higher-value use ([OpenAI entrepreneurship report](https://cdn.openai.com/pdf/32153121-f87f-4320-a725-9c94ee8d9b30/empowering-entrepreneurship-in-chatgpt-report.pdf)).

**What remains unknown:** Public data does not size the $100/$200 subset or describe its occupation, income, employer subsidy, task mix, retention, or objective outcomes. That cohort is important research dead space, but the available evidence does not justify treating it as a large market.

## 18. What actually changes in the experience

| Experience dimension            | Free/mainstream                                                            | Top-tier                                                                                                |                                                     Likely size of gap |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------: |
| Simple question or rewrite      | Often receives a capable answer from a current model                       | May receive a somewhat stronger or more controllable answer                                             |                                                      Small to moderate |
| Difficult reasoning             | Limited model selection or reasoning budget                                | Privileged reasoning modes and frontier models                                                          |                                                       Moderate to high |
| Long files and large context    | Smaller context, stricter upload limits, or rapid quota use                | Large context and repeated analysis without immediate lockout                                           |                                                                   High |
| Iteration                       | Enough for a short session                                                 | Enough to refine, test, reject, and redo repeatedly                                                     |                                                                   High |
| Deep research                   | Limited trials or low monthly allowance                                    | Much more frequent, deeper use                                                                          |                                                                   High |
| Agentic execution               | Little access or a small taste                                             | Sustained multi-step work, browser/computer use, and recurring tasks                                    |                                                              Very high |
| Coding/work agents              | Limited or absent, depending on platform                                   | Long-running repository work and higher agent capacity                                                  |                                                              Very high |
| Parallelism                     | Usually one foreground interaction                                         | Multiple tasks or agents can run while the person does something else                                   |                                                              Very high |
| Interruptions and fallback      | Caps, queues, or automatic fallback to smaller models                      | Priority traffic and substantially fewer interruptions                                                  |                       High for daily users; irrelevant for light users |
| New features                    | Arrive later or in limited form                                            | Early access and previews                                                                               |                                                               Variable |
| Integration and durable context | Some memory/projects may exist, but constrained use discourages investment | More reason to maintain projects, files, agents, and recurring workflows                                |                                                         High over time |
| Privacy and governance          | Consumer data controls and opt-outs                                        | Usually the same consumer privacy class; enterprise defaults and administration require a business plan | Small within individual plans; categorical versus organizational plans |
| Economic commitment             | No financial risk                                                          | $1,200–$2,400 per year for one provider                                                                 |                                                              Very high |

### Direct answer: is there a big gap?

**At the answer level: sometimes, but not consistently.** Free tiers now expose remarkably capable models and tools. Claude Sonnet 5 is the default for both Free and Pro. All Gemini plans can access Gemini 3 Pro, although their context and compute allowances differ. ChatGPT Free uses GPT-5.6 Luna while eligible paid plans use GPT-5.6 Sol ([Claude Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5), [Gemini limits](https://support.google.com/gemini/answer/16275805?hl=en-CA), [GPT-5.6 in ChatGPT](https://help.openai.com/en/articles/20001354-gpt-56-in-chatgpt/)).

Independent benchmark evidence shows a real but nonuniform model gap. Artificial Analysis scores GPT-5.6 Sol at maximum effort at 59 on its Intelligence Index versus 51 for Luna at maximum effort. In a narrow 2026 plastic-surgery exam benchmark, GPT-5.2 Pro averaged 87.0% accuracy versus 84.8% for GPT-5.2; their paired majority-vote difference was not statistically significant, and the free model was more consistent. These are model-and-task comparisons, not a causal test of human Free and Pro users ([Artificial Analysis](https://artificialanalysis.ai/articles/gpt-5-6-has-landed/), [Aesthetic Surgery Journal Open Forum](https://doi.org/10.1093/asjof/ojag052)).

**At the workflow level: yes.** The gap becomes large when a user needs to maintain flow, load substantial context, iterate many times, invoke expensive reasoning, run tools, or delegate multiple tasks. A Max user can begin to treat AI as available labor or infrastructure. The free user is encouraged by the economics and interface to treat it as an occasional adviser.

**At the privacy and governance level: not necessarily.** ChatGPT Free, Plus, and Pro personal workspaces have model-improvement sharing enabled by default with an opt-out, while Business, Enterprise, Edu, and API inputs and outputs are not used for training by default. Anthropic also distinguishes consumer Free/Pro/Max privacy settings from commercial defaults. Paying $100–$200 for an individual plan primarily buys capability and capacity, not an enterprise control plane ([OpenAI data controls](https://help.openai.com/en/articles/8983130), [Anthropic consumer privacy](https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings), [Anthropic commercial privacy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)).

**Inference:** The plan gap is nonlinear and task-dependent. The first few interactions can look similar; divergence appears after a user hits a model, context, tool, or continuity threshold. The 5× and 20× labels are allowance multiples, not quality or outcome multiples.

## 19. Thresholds where the gap becomes visible

1. The task requires many turns rather than one answer.
2. The relevant context is a long document, codebase, inbox, or project history.
3. The user needs to redo work until it meets a professional bar.
4. The task crosses multiple tools or websites.
5. The work should continue in the background.
6. Several tasks can be run in parallel.
7. The work recurs often enough to justify stored context and setup.
8. The task is valuable enough that a better model or lower interruption rate matters.

This explains why a mainstream consumer can honestly say “the free version is already enough” while a power user can honestly say “the $200 plan changes how I work.” They may be using the same brand for different units of work.

## 20. Access gap versus realized-value gap

A useful conceptual model is:

```text
Realized value
  = capability access
  × user skill
  × relevant context
  × task frequency
  × permission and trust
  × ability to verify and apply the result
```

This is not a measured formula; it is a causal map. Its implication is important: upgrading primarily raises **capability access and capacity**. It does not automatically supply good task selection, domain judgment, organizational permission, trusted context, or the habit of delegation.

Therefore the industry contains two overlapping gaps:

- **Access gap:** The free user cannot invoke enough of the best models and agent runtime.
- **Complement gap:** The user lacks one or more of a relevant task, trust, context, permission, domain knowledge, verification, recovery support, or skill. Know-how is only one possible missing complement.

A subscription can solve the first while leaving the second untouched.

## 21. What the outcome evidence actually says

No broad public study was found that randomly assigns otherwise-similar people to Free, Plus, and Max and measures completion, quality, time, or economic return. The closest evidence studies AI versus no AI, model performance on bounded tasks, or observed differences among users. Those bodies of evidence do not all point in the same direction.

### Evidence that AI can compress skill gaps

- A 2026 NBER randomized experiment with 1,174 adults found that AI improved both education groups on an incentivized workplace-style business problem. The higher-versus-lower education performance gap fell from 0.548 standard deviations without AI to 0.139 with AI, closing about three-quarters of the initial gap ([NBER](https://www.nber.org/papers/w34851)).
- A field study of 5,179 customer-support agents found a 14% average productivity gain, with roughly 34–35% gains for novice and low-skilled agents and minimal gains for the most experienced agents. The assistant embedded successful practices in a constrained, context-rich workflow ([NBER](https://www.nber.org/papers/w31161)).

These studies contradict a general claim that AI access necessarily compounds the advantage of already-skilled users.

### Evidence that open-ended agent work still rewards expertise

Anthropic's observational analysis of roughly 400,000 Claude Code sessions found that task-specific domain expertise predicted success and recovery. Novice-rated sessions reached verified success 15% of the time versus 28–33% for intermediate-or-higher sessions. When sessions hit trouble, 19% of novice sessions were abandoned versus 5–7% for other levels. Occupation mattered less than understanding the problem being solved ([Anthropic](https://www.anthropic.com/research/claude-code-expertise)).

This is not causal and uses model-derived classifications, but it supports a narrower thesis: open-ended agentic work rewards good task framing, verification, correction, and domain judgment.

### Evidence that perceived productivity is unreliable

METR's early-2025 randomized study found 16 experienced open-source developers took 19% longer with AI, even though they believed it made them about 20% faster. METR's later experiment using late-2025 agents produced raw estimates of an 18% speedup for returning developers and 4% for newly recruited developers, but METR calls the result unreliable because high-benefit people and tasks selected out, parallel agents broke time measurement, and the task mix and output quality changed ([early-2025 RCT](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/), [2026 update](https://metr.org/blog/2026-02-24-uplift-update/)).

The appropriate conclusion is not that AI makes experts slower or faster by a fixed amount. It is that uplift changes by task, model generation, workflow, and measurement definition. People also substitute toward work they would not previously attempt, so time saved on the old task mix can understate value while self-reported multipliers can overstate it ([METR task substitution](https://metr.org/blog/2026-05-08-task-substitution-and-uplift/)).

### Observed power-user depth

- OpenAI reports that 95th-percentile enterprise workers send 6× more messages than the median, with a 17× coding-volume difference. Users spanning more task categories self-report more time saved ([OpenAI enterprise report](https://openai.com/business/guides-and-resources/the-state-of-enterprise-ai-2025-report/)).
- Anthropic finds longer-tenure users attempt broader, harder work and have higher observed conversation success, while explicitly noting that selection and learning are confounded ([Anthropic learning curves](https://www.anthropic.com/research/economic-index-march-2026-report)).
- OpenAI reports extreme parallel agent use among its heaviest Codex users ([OpenAI agent-use study](https://openai.com/index/how-agents-are-transforming-work/)).

These observations establish that a high-depth mode exists. They do not show that purchasing Max creates it.

### Reconciled conclusion

The evidence is consistent if workflow shape is treated as the moderator:

```text
Constrained task + embedded context + clear success criteria
  → AI can transfer expert practice and disproportionately help novices

Open-ended task + weak context + ambiguous success criteria
  → domain expertise, verification, and recovery skill remain decisive
```

“Power user” is therefore not a subscription tier. It is the combination of valuable recurring tasks, domain knowledge, integrated context, iteration and recovery skill, permission, and enough capacity to sustain the workflow.

## 22. Observer model

### Focal observer: frontier AI labs and their consumer product organizations

They can see:

- Subscription conversion and retention
- Tokens and compute consumed
- Rate-limit encounters
- Feature and model adoption
- Session frequency and task categories
- Enterprise seat expansion
- Revenue per user and gross margin

They have incentives to reward:

- High-frequency use
- Expensive features that demonstrate frontier capability
- Users likely to convert to recurring subscriptions
- Work that remains inside their product ecosystem
- Agentic volume that increases demand for compute and platform services

They may see less clearly:

- Valuable tasks people never attempt because they assume AI cannot help
- Work users perform outside the product after receiving an answer
- People who would pay for one intense week but not twelve months
- Households or communities sharing one need without a clear individual subscriber
- Users whose missing complement is coaching, permission, or context—not more tokens
- What happens to workflows and stored context after a user downgrades

### Secondary observer: the free mainstream user

The free user sees a chat box, occasional tool buttons, dynamic limits, and a list of plan features. They may not see:

- How a ten-turn conversation becomes a recurring workflow
- What parallel agents make possible
- Why long context and repeated iteration change output quality
- How much tacit workflow skill a power user has accumulated
- Whether a $100–$200 plan would produce enough value for their particular life

### Secondary observer: the top-tier power user

The power user sees capacity limits, model tradeoffs, context management, parallel execution, and tool reliability. They may underestimate:

- The mainstream user’s uncertainty about what to ask
- Privacy and authority concerns
- The lack of a repeated, high-value task
- The psychological leap from asking for advice to delegating action
- How foreign agent-oriented language is to nontechnical users

## 23. Negative space at this boundary

### NS1 — Independent task-to-tier fit and outcome measurement

**Observation:** Feature tables describe models, limits, and tools, while model benchmarks average across tasks. Neither answers whether a particular person's real task reaches an acceptable result at Free, Plus, or Max—or whether the premium result justifies its incremental cost.

**Occluding mechanism:** Providers can see usage and conversion but have a conflict in recommending that a cheaper tier is sufficient. Benchmark firms compare models rather than end-to-end workflows. The important outcome often occurs outside the chat product.

**Hypothesis:** An independent evaluator could hold the task and user constant, compare access levels, and measure completion, quality, retries, time, and cost. This is the strongest documented evidence gap, but willingness to pay for the measurement is unproven.

### NS2 — Task-conditional returns to skill

**Observation:** Open-ended agent sessions reward domain expertise and recovery skill, but constrained, context-rich AI systems can disproportionately help novices and compress performance gaps.

**Occluding mechanism:** “AI skill” aggregates task selection, domain judgment, prompting, verification, context, tool access, and plan capacity. Platform analytics can also conflate prior skill and valuable tasks with the effect of paying.

**Hypothesis:** The useful intervention is not generic prompting education. It may be a domain-specific system that supplies context, clear success criteria, verification, and recovery support where novices otherwise fail. This must be tested per workflow.

### NS3 — Burst demand is now a contested seam

**Observation:** Many high-value consumer needs are intermittent: a job search, home purchase, benefits appeal, tax issue, trip, medical-navigation episode, school application, family transition, or major repair.

**Market response:** OpenAI offers flexible credits for selected paid-plan workloads; Anthropic offers pay-as-you-go credits and discounted usage bundles; Google offers top-ups for advanced workloads; Perplexity meters Computer work through credits ([OpenAI credits](https://help.openai.com/en/articles/12642688), [Anthropic usage bundles](https://support.claude.com/en/articles/14246112-buy-usage-bundles), [Google subscription updates](https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions/), [Perplexity credits](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity)).

**Revised hypothesis:** Pure burst access is not empty space. A remaining wedge could be a no-base-plan, fixed-outcome service for nontechnical users, but it would compete on domain trust, workflow design, and completion—not simply reselling frontier tokens. Demand and service economics are unproven.

### NS4 — Capability translation

**Observation:** Vendors sell “deep research,” “reasoning,” “agents,” “context,” and limit multiples. Ordinary people think in life outcomes and obligations.

**Occluding mechanism:** The category uses the producer’s vocabulary rather than the user’s vocabulary.

**Hypothesis:** Packaging around “prepare my disability-benefits file” or “coordinate this move” may unlock demand that a generic Max plan cannot articulate.

### NS5 — Continuity after downgrade

**Observation:** The more a user invests in projects, memory, files, schedules, and agents, the more valuable—and potentially difficult to leave—the system becomes.

**Occluding mechanism:** Subscription reporting foregrounds retention, not the user’s ability to preserve workflows and context at a lower tier or another provider.

**Hypothesis:** A portable personal context and workflow layer could reduce commitment risk and let users rent frontier capacity from multiple providers.

### NS6 — Sponsored access and institutional brokerage

**Observation:** Employers and universities can provide advanced access, structured training, and permission. Individuals outside those institutions must discover and fund the same capability alone.

**Occluding mechanism:** Consumer and enterprise product organizations divide the market by billing relationship, obscuring people who need institution-like support without an institution.

**Hypothesis:** Libraries, workforce programs, unions, professional associations, local governments, or benefits providers could broker advanced access around specific outcomes.

### NS7 — Outcome measurement

**Observation:** Plans sell capacity, but most consumers cannot predict or measure return on intelligence.

**Occluding mechanism:** Vendors observe tokens and retention more readily than avoided cost, improved decisions, or completed life outcomes outside the product.

**Hypothesis:** A product that measures completed work, time saved, or avoided spend could make the value legible and support different pricing.

### NS8 — Delegation without technical identity

**Observation:** Agent products are growing beyond developers, but their language and examples remain heavily influenced by software work.

**Occluding mechanism:** Early adopters, product teams, and available benchmark tasks overrepresent digital technical work.

**Hypothesis:** There is room for an agentic interface built around nontechnical delegation: showing status, requesting authority, preserving receipts, and explaining what happened.

### NS9 — Capacity opacity and plan orchestration

**Observation:** Limits vary by model, feature, five-hour window, week, plan, and provider; some products add credits after the subscription allowance.

**Occluding mechanism:** Each provider optimizes its own packaging. A user with several subscriptions cannot easily route work by quality, remaining allowance, privacy, or urgency.

**Hypothesis:** A consumer-side control plane could make capacity legible and route tasks across owned subscriptions and local models.

### NS10 — The “good enough” ceiling

**Observation:** Free models are strong enough for many ordinary tasks, which weakens the perceived reason to upgrade.

**Occluding mechanism:** Labs demonstrate superior models on benchmarks or expert tasks, while mainstream users evaluate them on low-complexity prompts where differences compress.

**Hypothesis:** The opportunity is not persuading users that every answer should be better. It is identifying a task whose shape changes when it can become an agentic workflow.

## 24. Dead space and missing evidence

These questions are not currently answered by public data:

| Missing evidence                                        | Why it is hard to see                                                        | New vantage needed                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| Causal outcome difference between free and Max users    | Subscribers self-select by skill, income, and task value                     | Randomized trials or matched cohorts         |
| What valuable tasks free users abandon at a limit       | Platforms see the limit event but not the eventual offline outcome           | Exit interviews and task diaries             |
| Demand for one-week frontier access                     | Subscription funnels test monthly willingness to pay                         | Burst-access landing page or concierge offer |
| How novices use Max after purchase                      | Public reports aggregate paid or active users                                | New-subscriber longitudinal study            |
| Whether workflow coaching outperforms more model access | Plans bundle access but not controlled training                              | 2×2 access-versus-coaching experiment        |
| Household and shared-context value                      | Accounts and pricing are mostly individual or organizational                 | Household pilots and shared outcome tracking |
| Downgrade and portability costs                         | Providers own the context and have little incentive to measure exit friction | Export/downgrade study                       |

Do not treat these as proven opportunities. They are dead space until a new vantage produces evidence.

## 25. Surfaces and entrant-specific gaps

### Surfaces

- Frontier labs control models, compute, pricing, and first-party product distribution.
- Free general chat is already extremely capable and globally distributed.
- Large incumbents own email, files, identity, browser, devices, and work canvases.
- Agent execution creates real safety, privacy, reliability, and cost risk.
- A general “AI for everyone” product would face intense competition and weak differentiation.

### Potential gaps

| Gap                                     | Only traversable if the entrant has…                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Independent task-to-tier evaluation     | Permission to work with sensitive context, stable cross-provider tests, and a credible definition of an acceptable outcome |
| Outcome-priced burst service            | Narrow domain workflows, cost controls, verification, and enough trust to compete with provider-native credits             |
| Domain integration and recovery support | Task-specific context models, success criteria, guardrails, and escalation behavior                                        |
| Portable context/workflows              | Provider-neutral integrations, user trust, and a clear permission system                                                   |
| Institution-like access for individuals | Distribution through a trusted community or service provider                                                               |
| Consumer agent control plane            | Reliable routing, metering visibility, privacy guarantees, and model interoperability                                      |

## 26. Provisional avenues of approach

These are routes to investigate, not recommendations yet.

### Route A — Outcome-priced burst workspace

**Entry point:** One high-stakes, time-bounded consumer event.  
**Overlooked behavior:** A person may value $200 of intelligence during one week but reject a perpetual $200 monthly commitment.  
**Sequence:** Narrow event intake → assemble context → expose a guided plan → use frontier agents to complete defined work → preserve the resulting case file and workflow → offer recurring capacity only if the need continues.  
**Required capability:** Domain workflow design, cost control, verification, and trust.  
**Learning gained:** Which occasional needs support willingness to pay and which parts users will delegate.  
**End position:** Trusted context and workflow ownership around consequential life events.  
**Reveal threshold:** The product expands from one event into a visible general-purpose consumer agent.  
**Likely incumbent response:** Labs add temporary passes, credits, or event templates.  
**Current status:** Downgraded. Labs have already added credits, top-ups, and usage bundles.  
**Why a narrower version may stay open:** Providers sell capacity, while consequential life events require service design, domain trust, verification, and operational detail.

### Route B — Independent task-to-tier evaluator

**Entry point:** Compare Free, standard paid, and frontier access on one user's real task while holding the task and acceptance criteria constant.  
**Overlooked behavior:** Users cannot infer task-specific value from benchmark scores, plan limits, or provider marketing.  
**Sequence:** Define acceptable outcome → run blinded or standardized attempts across tiers/providers → record completion, quality, retries, time, and cost → recommend the least expensive adequate option → optionally save the successful workflow.  
**Required capability:** Cross-provider evaluation, privacy-preserving task handling, domain-appropriate rubrics, and transparent uncertainty.  
**Learning gained:** Which task shapes materially benefit from premium access, when coaching matters more than model access, and whether users value neutral recommendations.  
**End position:** An evidence and routing layer between real work and rapidly changing AI plans.  
**Reveal threshold:** Enough task-outcome data to influence plan selection or model routing.  
**Likely incumbent response:** Personalized upgrade trials and in-product task routing.  
**Why it may stay open:** Providers have a structural conflict in recommending that a free, cheaper, or competing option is sufficient.  
**Primary uncertainty:** The evidence gap is clear; the business model and defensibility are not.

### Route C — Domain workflows with verification and recovery

**Entry point:** Capture a skilled user’s proven workflow for a specific audience.  
**Overlooked behavior:** The scarce complement may be domain context, success criteria, and failure recovery rather than model access or prompting technique.  
**Sequence:** Observe expert workflow → encode the common sequence and context → add verification, recovery, and human escalation → distribute through a trusted group → collect completion and failure data.  
**Required capability:** Workflow capture, quality assurance, domain distribution, and reliable escalation to humans.  
**Learning gained:** Which expert behaviors transfer and which depend on judgment that cannot be encoded.  
**End position:** A workflow network with proprietary completion data and trusted distribution.  
**Reveal threshold:** A workflow category becomes large enough for a lab or incumbent application to bundle.  
**Likely incumbent response:** Template marketplaces and native workflow builders.  
**Why it may stay open:** Distribution and domain trust are fragmented, and the workflows evolve faster than centralized product teams can encode them.

## 27. Current route ranking

| Route                                 | Evidence-gap strength | Market evidence |                Traversability | Primary risk                                                 | Status                                                    |
| ------------------------------------- | --------------------: | --------------: | ----------------------------: | ------------------------------------------------------------ | --------------------------------------------------------- |
| A. Outcome-priced burst workspace     |                Medium |             Low |                        Medium | Provider credits, service-heavy economics, adverse selection | Downgraded                                                |
| B. Independent task-to-tier evaluator |                  High |             Low | High for a research prototype | Users may not pay; providers can copy parts                  | Best measurement probe, not yet a business recommendation |
| C. Domain workflow with recovery      |           Medium–high |          Medium |                        Medium | Crowded vertical markets, liability, hidden expert judgment  | Strongest product mechanism; domain still unspecified     |

**Highest-confidence first probe:** Route B, because it directly produces evidence missing from the public market and can falsify the premise before a larger build.  
**Potentially strongest end position:** Route C, because domain context, verification, recovery behavior, trusted distribution, and outcome data can be more durable than subscription recommendation.  
**Do not infer:** That Route B has the largest market or Route C has a viable domain. Neither has been established.

## 28. Best next probes

### Probe 1 — Same user, same task, three access levels

Recruit 8–12 people who currently use only free AI. Ask each person for:

- One ordinary task
- One important multi-step task
- One recurring task

Complete each at the free, standard paid, and top-tier level while holding the user and task constant. Measure:

- Completion and quality
- Time to acceptable result
- Number of retries
- Context assembled
- Tool calls and human interventions
- Whether the person would pay after seeing the difference

**Supports the thesis if:** Differences are small on ordinary prompts but large on multi-step or recurring work, and participants can name an outcome they would buy.  
**Kills or revises it if:** Free access completes the same tasks with tolerable friction, or users still do not value delegation after seeing it.

### Probe 2 — Access versus coaching experiment

Create four groups:

|                 | No coaching | Guided workflow |
| --------------- | ----------- | --------------- |
| Free access     | A           | B               |
| Frontier access | C           | D               |

Compare completion quality and subsequent independent use.

**Key question:** Does better access or better task framing create more value for a mainstream user?

### Probe 3 — Burst-access offer

Offer a fixed-price, seven-day “frontier AI sprint” for one real life event. Do not begin by selling a general subscription. Test two or three events with concrete outcomes.

Measure conversion, cost to serve, completion, trust, and interest in keeping the context afterward.

**Priority note:** This is a secondary market probe because provider-native credits have already weakened pure burst access as a thesis. It tests whether domain completion—not capacity alone—creates demand.

### Probe 4 — New Max-subscriber diary

Follow 10 people from the day they upgrade for 30 days. Capture:

- Why they upgraded
- Which limits or models they actually use
- Whether their task mix changes
- What they learn to delegate
- Whether value persists after the novelty period
- Whether they would renew at $100 or $200

### Probe 5 — Power-user workflow capture

Observe five power users completing the same category of task. Separate:

- Reusable sequence
- Personal tacit judgment
- Model choice
- Context requirements
- Verification and recovery behavior

Encode only the common sequence and test it with novices.

## 29. Red-team and contrary evidence

- Free models may continue improving until the practical difference is negligible for nearly all consumer tasks.
- Top-tier users may be a small, self-selected professional segment whose behavior does not transfer to mainstream consumers.
- The willingness to delegate may be constrained more by trust and task relevance than access or education.
- Occasional high-stakes events may require human accountability, licensing, or empathy that an AI-first service cannot provide.
- Burst access can attract expensive, difficult cases and create adverse selection.
- Provider-native credits and temporary tiers could erase a pure access-arbitrage business.
- Workflow templates may commoditize quickly as models become better at discovering the workflow themselves.
- The user may value the result but not want a new intermediary to hold sensitive personal context.

## 30. Working conclusions

1. The visible AI market is crowded, but adoption depth is highly uneven.
2. Frontier labs increasingly sell agent capacity in 5× and 20× increments, signaling a transition from chat subscriptions to allowances for synthetic work.
3. The free-to-Max gap is not best described as “bad answers versus good answers.” For simple tasks it may be modest; for sustained, contextual, tool-using, or parallel work it can become large.
4. A 5× or 20× allowance is not a 5× or 20× model-quality or outcome difference.
5. “Power user” is not a plan. It is a combination of task value and recurrence, domain knowledge, context, verification and recovery skill, permission, and capacity.
6. Existing evidence does not support a general skill-compounding thesis. AI can compress gaps in constrained, context-rich work while expertise remains important in open-ended agentic work.
7. Mainstream non-adoption is not mainly a prompting-education problem; perceived relevance, privacy, and accuracy are at least as important.
8. Burst access and generic capability education are already active incumbent fronts, so neither should be treated as empty space.
9. The clearest unresolved seam is independent task-to-tier fit and outcome measurement. It is an evidence gap, not yet a validated market.
10. The most important causal unknown remains whether top-tier access creates power users, whether power users select top-tier access, or both.
11. The next step should hold the user and task constant and measure where premium access actually changes an acceptable outcome.

---

# Research backlog

- Segment which consumer life events are valuable, time-bounded, document-heavy, and legally safe enough for a burst agent.
- Compare employer-funded, school-funded, and self-funded advanced access.
- Study what happens when a user downgrades after building memory, projects, schedules, or agents.
- Map the nontechnical language people use for delegation and authority.
- Investigate households and families as a unit of AI adoption rather than individual accounts.
- Measure whether showing agent work changes willingness to pay more than showing model outputs.
- Separate top-tier users by occupation, income, employer subsidy, and actual workflow depth.
- Track whether $100/$200 tiers remain stable or give way to credits and usage-based consumer pricing.
- Test whether an independent “cheapest adequate tier” recommendation changes purchase or routing behavior.
- Distinguish objective completion, perceived time saved, new-task creation, and value—not one generic productivity measure.

# Source and confidence notes

- Product entitlements and prices are sourced primarily from official vendor documentation and are high confidence as of the update date, but they are unusually volatile.
- Adoption research from OpenAI and Anthropic is based on their own user populations. It is valuable behavioral evidence but may not generalize to all AI users.
- Vendor-reported productivity and success measures can contain selection effects and should not be interpreted as neutral causal estimates.
- Transaction data and OpenAI's platform estimate both indicate that paying is a small-minority behavior, but they use different denominators and do not reveal the size of $100/$200 tiers.
- Search specifically targeted direct Free-versus-paid user-outcome research. Only narrow task and model comparisons were found, not a broad causal human-outcome study.
- Absence of public evidence does not imply that providers lack private experimental evidence.
