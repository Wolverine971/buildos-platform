<!-- docs/research/youtube-library/analyses/2026-05-10_peter-werry-unblocked_context-engine_analysis.md -->

---

title: "Mergeable by default: Building the context engine to save time and tokens — Peter Werry, Unblocked"
source_type: youtube_analysis
video_id: 5ID22ACI7IM
url: "https://www.youtube.com/watch?v=5ID22ACI7IM"
channel: AI Engineer
channel_url: "https://www.youtube.com/@aiDotEngineer"
upload_date: 2026-05-03
duration: "01:41:24"
views: 11628
library_category: technology-and-agent-systems
library_status: analysis, internal-reference
transcript_status: available
analysis_status: available
processing_status: needs_synthesis
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ""
public_article: ""
indexed_date: "2026-05-10"
last_reviewed: "2026-05-10"
transcribed_date: "2026-05-10"
tags:

- context-engineering
- agents
- ai-engineering
- knowledge-graphs
- rag
- mcp
- code-agents
- buildos-positioning
- connect-your-agents

---

# Peter Werry (Unblocked) — Building a Context Engine

## Source

- **Video:** [Mergeable by default: Building the context engine to save time and tokens](https://www.youtube.com/watch?v=5ID22ACI7IM)
- **Speaker:** Peter Werry, Unblocked (with colleague Brandon)
- **Venue:** AI Engineer (London talk + workshop)
- **Duration:** 1:41:24 (talk + Q&A + live workshop)
- **Transcript:** [`transcripts/2026-05-10_peter-werry-unblocked_mergeable-by-default-context-engine.md`](../transcripts/2026-05-10_peter-werry-unblocked_mergeable-by-default-context-engine.md)

## Thesis

Coding-agent intelligence is no longer the bottleneck — Mythos-class models can write near-perfect code in isolation. The real bottleneck is **context**: agents start at ground zero with no understanding of your code, conventions, prior decisions, or org politics, so they doom-loop or produce technically-correct code that violates everything important about how your team actually builds.

A **context engine** is the reasoning layer that aggregates, deconflicts, and personalizes organizational context (code, PRs, Slack, docs, incidents) and delivers only what the agent needs for the task at hand. Without one, agents waste tokens on satisfaction-of-search and miss the iceberg below the waterline (rejected approaches, deleted code, decision history, expertise hierarchy).

Werry's punchline: _"AI-generated code should feel like it was written by someone who's been on your team for 20 years."_

## The Three Myths Werry Debunks

### Myth 1: "Naive RAG over my docs is a context engine."

- Vector search alone triggers **satisfaction of search** — agents stop at the first plausible-looking match and proceed. The real golden nuggets (deleted code, Slack incident threads, rejected approaches) get missed.
- Burns tokens until compaction.
- No personalization → conflicts pull in irrelevant repos for large orgs.

### Myth 2: "Just connect a bunch of MCP servers."

- **Access ≠ understanding.** MCPs give agents doors but no map of how data sources relate.
- Without distillation of _why_ decisions were made, the agent can't reason across sources.
- Werry's live demo: same task with MCPs-only missed legacy backwards-compat; with the context engine it caught the dependency on the old `thinking_budget` API and added compat shims correctly.

### Myth 3: "A bigger context window will solve this."

- Even 1M+ tokens (Gemini was first) can find needles but can't **reason across conflicting sources**.
- Most orgs already exceed any window you'll get this decade.
- Even at hypothetical 50M tokens, you still need to know what's true, what's stale, and what's task-relevant.

## Six Requirements for a Context Engine

1. **Unified system context** — Build relationships between data (PR ↔ Slack thread ↔ incident ↔ doc). Distill recurring patterns from PR comments into "memories" that load when relevant.
2. **Conflict resolution** — Recency-bias is naive. Initial Unblocked approach (recency → bias toward main branch) failed. Better: bias toward **experts** and **where the team is going** (active feature work) over historical state.
3. **Targeted retrieval** — Pull only what the task needs.
4. **Personal relevance** — Bias retrieval toward repos a person contributes to most (deep search there, wider shallow search elsewhere).
5. **Data governance** — Flow access controls all the way through. Compartmentalize synthesis (graph-RAG layered summarization can leak across permission boundaries — use group-ID tags on synthesized output).
6. **Right context at the right time** — Token efficiency.

## Hard Lessons (from Production)

| Lesson                                      | What they tried                                                                 | What they learned                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Optimized for **access, not understanding** | Wired up tools + a knowledge graph and let the agent traverse it                | Doesn't work — relationships need to be pre-computed and distilled, not discovered at runtime                                                                            |
| **Hid conflicts** instead of surfacing them | Force-resolved conflicts using naive heuristics (recency, main-branch-as-truth) | Better to surface conflicts the engine can't resolve and **learn from human input**                                                                                      |
| **Cached answers**                          | Reused prior answers as seeds for new questions                                 | Two failures: (a) code/docs change constantly so answers go stale, and (b) using prior answers as context **regresses toward the mean** — bad outputs poison future ones |

## The Headline Performance Result

Same prompt, same MCP servers wired up, real legacy refactor task (implementing Anthropic's adaptive thinking mode, which required understanding deprecated `thinking_budget` usage):

| Metric           | Without context engine    | With context engine    |
| ---------------- | ------------------------- | ---------------------- |
| Wall clock       | 2h 25m                    | 25 min                 |
| Token usage      | 21M                       | 10M                    |
| Correction loops | 4 (kept getting it wrong) | 0 (shipped first pass) |

Werry caveat: _"Trust the vibe, not the exact numbers — Claude generated them."_

## Highest-Value Use Cases (in order)

1. **Planning** — biggest bang for buck unquestionably. Use a skill to bring the engine in before the agent starts.
2. **Code review** — context-aware reviewers catch _organizational_ issues (e.g. "this duplicates a pattern Richie already abstracted in PR #X")
3. **Ticket enrichment** — create a stub ticket, agent fills it in
4. **Triage** — paste a prod issue, get instant cross-ref to past incidents
5. **Incident management** — Sentry/Datadog signals → cross-ref to code, past incidents, Slack threads (Werry calls this "magical")
6. **Customer success / sales engineering / engineering support** — auto-answer questions in Slack support channels (his **personal favorite** use case; reportedly the highest customer adoption)

## Architecture Notes (from Q&A)

### How the knowledge graph is built

- First pass: **procedural** — page-rank-style relationship building from PRs, commits, file changes
- Then: **vector embeddings** of source code with author proximity
- Then: **LLM distillation** of historical PR comments into reusable best-practice memories
- At runtime: a **judge model** does additional deconfliction with task criteria

### "Bottling the expert"

For each code area, distill the top contributor's:

- PR history and review patterns
- Slack conversations on related topics
- Past decisions and stated rationale

When a new contributor (or agent) touches that area, **unbottle** the expert as seed context. This is the **pivot point** that drives downstream retrieval — much more powerful than naive vector search.

### Memory as seed context, not agent-fetched

Memory hydration is **part of the seed context** — agents can't be trusted to decide what to load themselves. The engine picks the seed; the agent does the work.

### Tool mix among customers

- **Claude Code** by far #1
- **Cursor** #2
- **Claude Desktop** surprisingly large (unexpected — people use it as a thinking surface even for coding)
- VS Code, Codex much smaller
- Async PR-triggered agents are still rare in practice

### Privacy / deployment

- Cloud-based for almost all customers
- On-prem solution exists for govt/banks but **actively discouraged** — maintenance burden too high
- Slack data is the most sensitive surface; private channels respect access controls so answers using them are scoped to the asker
- Whitepaper exists on data protection

### Update cadence

- Real-time for integrations with webhooks
- Cron for the rest
- Social-graph rebuilds are **incremental** (full rebuilds unnecessary; one PR rarely shifts the expert graph)
- Best-practice distillation runs ~weekly (slow-changing)

## Performance / Cost Insight

> "Output tokens are what drag down performance, not input tokens. Time-to-first-output-token is highly optimized now. So you can spend more on input/context if it cuts the implementation loop down 60–80%."

Implication: a context engine is allowed to be **slow** (compared to a raw MCP call) if it returns dramatically more compact, correct seed context. The full task time is what matters.

> "As we move toward autonomous agents, MCP server response times matter less and less. What matters is that they get the answer absolutely bang on."

## Notable Quotes

- _"Not long ago — like four years ago — **you** were the context engine."_
- _"Bleeding edge today is yesterday's news in six months. The puck is going down the line toward background agents."_
- _"AI-generated code should feel like it was written by someone who's been on your team for 20 years."_
- _"Access doesn't equal understanding."_
- _"Where you've been helps the agent understand what not to do. Where you're going helps it understand what you should do."_
- _"You cannot run autonomous agents effectively without finely-tuned context."_
- _"It's hard to demonstrate the value of a context engine to someone without actually wiring it up."_ (this is a sales/onboarding lesson, not a tech one)

---

## Why This Matters for BuildOS

Werry is selling **the engineering version of BuildOS's thesis**. Direct connections to active BuildOS work:

### 1. Validates the "context surface across agents" positioning

The `project_connect_your_agents_promo` work (locking user-facing language around BuildOS as the context surface) is now externally validated. Unblocked is selling exactly this story to engineering teams. BuildOS's parallel: the **personal** context engine that any agent (Claude, ChatGPT, Cursor, custom agents) plugs into so it acts like it's known you for years.

The "you used to be the context engine" framing maps perfectly to BuildOS's anti-AI marketing thesis: _people are tired of being the integration glue between their tools, their thinking, and their AI._

### 2. Concrete patterns BuildOS could borrow

- **Surface conflicts, don't hide them.** When a brain dump contradicts older context (project scope shifts, priorities flip), don't silently auto-resolve. Let the user weigh in. Build a feedback loop that creates trust signals over time. Werry's "we hid conflicts and it bit us" lesson is a free production scar BuildOS doesn't have to earn.
- **"Bottling DJ-as-user."** Distill the user's working style (how they break down projects, what they always defer, recurring blockers, decision patterns) from past brain dumps as **seed context** for any agent they connect. This is more powerful than vector-searching past brain dumps at query time.
- **Don't cache agent-facing answers.** When agents query BuildOS's context surface, reconstitute from current state. Cached answers regress to the mean, especially when the user's project is actively shifting.
- **Bias toward "where you're going."** Active project + this week's brain dumps > the historical archive. Recency matters but **active intent** matters more.
- **Memory as seed context.** Agents shouldn't be trusted to decide what to hydrate. BuildOS picks the seed; the agent does the work.

### 3. The "go-between across agents" LinkedIn angle has external validation

The `project_linkedin_gobetween_angle` post (BuildOS as shared context surface between DJ and his agents) now has Unblocked as a parallel example in the engineering world. Useful framings for the post:

- **Hook:** "AI-generated work should feel like it was made by someone who's known you for 20 years." (paraphrase Werry's line, swap "code" → "work")
- **Anti-pattern setup:** You used to be the context engine for your tools. Then you became the context engine for your agents. That's the new bottleneck.
- **Three myths to riff on for the personal-productivity audience:**
    1. "Just give Claude my Notion." (naive RAG)
    2. "Just connect a bunch of MCP servers." (access ≠ understanding)
    3. "Just paste everything into a giant context window." (can't reason across conflicts)
- **Close:** BuildOS isn't a chatbot. It's the layer where your agents get to know you.

### 4. Patterns to actively avoid

Werry's "live workshop with GitHub access issues + people not understanding the workshop" segment is a long stretch of dead air in the back half. Skip when re-watching for content; the value is concentrated in the first 35 minutes (talk) and the last 15 minutes (Q&A on architecture/privacy).

---

## Skill Candidate Notes

**Priority:** high

**Why:** This is a clean, public, named-expert articulation of the **context-engineering** discipline that BuildOS is implicitly selling. A public skill on "Building a personal context engine" or "Context engineering for non-engineers" could draft heavily off this transcript with attribution. The myth-busting structure is especially portable.

**Possible skill angles:**

- "Context engine vs. RAG vs. MCP: what's the difference and when do you need which?"
- "The three myths of giving AI agents context"
- "Why your AI agents keep doom-looping (and how to fix it)"
- "Bottling the expert: extracting tacit knowledge from your team for AI agents"

**Cross-reference:**

- `apps/web/src/content/blogs/philosophy/anti-ai-assistant-execution-engine.md` — published BuildOS blog on context engineering vs. agent engineering
- `project_connect_your_agents_promo.md` — onboarding callout + /integrations rewrite
- `project_linkedin_gobetween_angle.md` — next LinkedIn post angle

---

## Suggested Next Actions

1. Excerpt the "20 years on the team" line as a hook for the LinkedIn go-between post
2. Steal the **three-myth structure** for a BuildOS blog post on personal context engines
3. Add "surface conflicts, don't hide them" as a product principle to the Connect Your Agents spec
4. Consider whether **"bottling the user"** should become an explicit BuildOS feature/concept (it's effectively what brain-dump → project-context distillation already does, just unnamed)
