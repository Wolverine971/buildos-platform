# Agentic Chat V2 Spec — Analysis & Research Alignment

**Status:** Analysis Document
**Author:** Claude (Research Review)
**Date:** 2026-02-05
**Related:** `AGENTIC_CHAT_V2_SPEC.md`

---

## Executive Summary

The V2 spec is **exceptionally well-designed** and aligns strongly with recent AI agent research. The Agent State architecture (Section 8.6) directly implements the key insights from the State-Aware Agents paper. The document-first approach with `doc_structure` as the primary knowledge map is a smart choice.

**Overall Assessment:** 9/10 — Strong foundation with a few opportunities to incorporate additional research findings.

---

## Research Alignment Score Card

| Research Paper | Alignment | Notes |
|----------------|-----------|-------|
| **State-Aware Agents** | ⭐⭐⭐⭐⭐ | Agent State implementation is almost 1:1 with paper recommendations |
| **ProAgentBench** | ⭐⭐⭐⭐ | Good foundation, missing burstiness and proactive timing |
| **EMBEDPLAN** | ⭐⭐⭐ | Document-first helps, but personalization layer missing |

---

## What the Spec Gets Right

### 1. Agent State Architecture (Section 8.6) — Excellent

The `AgentState` type directly implements the State-Aware Agents paper's core recommendations:

| Paper Concept | Spec Implementation | Status |
|---------------|---------------------|--------|
| Current understanding of entities | `current_understanding.entities` | ✅ Implemented |
| Dependencies between entities | `current_understanding.dependencies` | ✅ Implemented |
| Assumptions/hypotheses | `assumptions[]` with confidence | ✅ Implemented |
| Expected outcomes | `expectations[]` | ✅ Implemented |
| Tentative alternatives | `tentative_hypotheses[]` | ✅ Implemented |

**This is exactly what the research recommends.** The spec even gets the nuance right:
- Confidence scores on assumptions
- Evidence linking for hypotheses
- Delta-based updates (not full rewrites)

### 2. State Transition Model — Well-Designed

The update pipeline (Section 8.6) correctly separates:
1. **Deterministic updates** from tool results (no LLM needed)
2. **LLM-derived updates** from summarizer (hypotheses/expectations)

This matches EMBEDPLAN's insight that transitions can be predicted/computed cheaply when the pattern is known.

### 3. Conversation Modes (Section 4.4) — Good Start

```
Clarify → Inform → Act
```

This maps to ProAgentBench's "When + How" framework:
- **Clarify/Inform** = "Not the right time to act"
- **Act** = "When to Assist" triggered

### 4. Rolling Context Window (Section 5) — Solid

The compression strategy preserves:
- Entity IDs and names
- User decisions and approvals
- Doc edits and key diffs

This aligns with the research finding that **structure matters more than raw conversation history**.

### 5. Document-First as Knowledge Graph (Section 9)

Using `doc_structure` as the primary knowledge map is smart:
- Provides stable topology (projects/tasks are ephemeral)
- Acts as a knowledge graph for retrieval
- Aligns with ProAgentBench finding that **Knowledge Graphs > RAG**

---

## Gaps & Recommendations

### Gap 1: Missing 5-Minute Context Window Insight

**Research Finding (Both Papers):**
Both ProAgentBench and EMBEDPLAN found that **5 minutes of context** is the optimal balance between richness and noise.

**Current Spec:**
Section 5.1 mentions "Last N messages (default 8-12)" but doesn't specify a time window.

**Recommendation:**
Add a time-based constraint:

```ts
type ContextBudgets = {
  maxTokens: number;
  summaryTokens: number;
  recentMessages: number;
  maxContextAge: number;  // Add: 300000 (5 minutes in ms)
};
```

When assembling context, prioritize events within the last 5 minutes, then fall back to older summarized context.

---

### Gap 2: No Proactive Timing Detection

**Research Finding (ProAgentBench):**
The "When to Assist" classification is a distinct capability that should run continuously, not just reactively.

**Current Spec:**
Section 4.4 describes modes (Clarify/Inform/Act) but these are reactive — triggered by user messages.

**Recommendation:**
Add a lightweight proactive detection layer:

```ts
type ProactiveSignal = {
  trigger: 'idle_detected' | 'context_change' | 'deadline_approaching' | 'pattern_match';
  confidence: number;
  suggested_action?: string;
};

// Run periodically or on context changes
function detectProactiveOpportunity(
  userState: UserActivityState,
  agentState: AgentState,
  projectContext: ContextPack
): ProactiveSignal | null;
```

This could power:
- "I noticed you haven't captured any tasks from your last brain dump"
- "Your deadline for X is approaching — want me to help prioritize?"
- "Based on your pattern, you usually brain dump around this time"

---

### Gap 3: Missing Burstiness Awareness

**Research Finding (ProAgentBench):**
Human-AI interaction follows power-law "bursty" patterns (B=0.787). Users don't engage uniformly — they work in sprints.

**Current Spec:**
No mention of temporal patterns or burst detection.

**Recommendation:**
Track session engagement patterns:

```ts
type SessionMetrics = {
  messageCount: number;
  burstScore: number;  // Rolling calculation of inter-event times
  lastActivityAt: string;
  sessionStartedAt: string;
};
```

Use burstiness to:
- **High burst (active sprint):** Be more responsive, reduce confirmation prompts
- **Low activity:** Be more proactive with gentle nudges
- **Post-burst lull:** Summarize what was accomplished

---

### Gap 4: Ontology Graph Underutilized for Retrieval

**Research Finding (ProAgentBench):**
Knowledge Graph retrieval outperformed RAG by **+11.8%** for personalization.

**Current Spec:**
Uses `doc_structure` as a knowledge map but doesn't mention graph-based retrieval for context assembly.

**Recommendation:**
Enhance `ContextPack` assembly to use graph relationships:

```ts
// When building context for a task entity
function buildEntityContext(entityId: string): ContextPack {
  const entity = await getEntity(entityId);

  // Use graph relationships, not just vector similarity
  const relatedEntities = await getGraphNeighbors(entityId, {
    depth: 2,
    relationTypes: ['parent', 'blocks', 'related_to', 'mentioned_in']
  });

  // Include graph path as context
  return {
    ...baseContext,
    data: {
      entityDetails: entity,
      linkedEntities: relatedEntities,
      graphPath: getPathToRoot(entityId)  // Add: where this sits in the tree
    }
  };
}
```

---

### Gap 5: No User-Specific Learning

**Research Finding (EMBEDPLAN):**
Cross-domain transfer is near-zero (6.6%), but within-domain extrapolation works well (54.6%). Each user is effectively their own "domain."

**Current Spec:**
`userPreferences` is mentioned but not detailed. No mechanism for learning user patterns.

**Recommendation:**
Add a user pattern layer to Agent State:

```ts
type UserPatterns = {
  preferredActionPatterns: Array<{
    context: string;      // "when discussing tasks"
    typicalAction: string; // "user usually wants them created"
    confidence: number;
  }>;
  vocabularyMapping: Map<string, string>;  // "sync" → "meeting", "EOD" → "end of day"
  workingHoursPattern?: {
    typicalStart: string;
    typicalEnd: string;
    burstTimes: string[];
  };
};
```

Populate over time from:
- Agent state assumption confirmations/rejections
- User corrections to generated content
- Temporal patterns of engagement

---

### Gap 6: Expectation Verification Loop

**Research Finding (State-Aware Agents):**
Agents should compare expected outcomes to actual outcomes and update state accordingly.

**Current Spec:**
Has `expectations` in Agent State but no explicit verification mechanism.

**Recommendation:**
Add post-action verification:

```ts
type ExpectationResult = {
  expectationId: string;
  matched: boolean;
  actual_outcome?: string;
  state_update?: AgentStateUpdate;
};

// After tool execution
function verifyExpectation(
  expectation: Expectation,
  toolResult: ToolResult
): ExpectationResult {
  // Compare expected vs actual
  // Generate state delta if mismatch
}
```

Example flow:
1. Agent expects: "Creating task X should add it to Phase 1"
2. Tool executes: Task created but added to Phase 2 (user preference)
3. Verification: Mismatch detected
4. State update: "User prefers new tasks in most recent phase" → add to `assumptions`

---

## Minor Suggestions

### 1. Summarizer Should Preserve Agent State Item IDs

Section 5.4 specifies that summaries preserve entity IDs. Extend this to Agent State item IDs:

```ts
// Summarizer output should map old → new references
{
  summary: "...",
  preserved_item_ids: ["item-1", "item-3"],
  merged_items: [{ from: ["item-2", "item-4"], to: "item-5" }]
}
```

### 2. Add Confidence Decay to Assumptions

Assumptions without recent evidence should decay:

```ts
// During summarizer update
if (timeSinceLastEvidence(assumption) > 10_MINUTES) {
  assumption.confidence *= 0.9;  // Decay factor
}
```

### 3. Consider "Agent State Visible in UI" (Open Question #3)

**Recommendation:** Start implicit, make explicit over time.

- **Phase 1:** Agent state is internal (debugging only)
- **Phase 2:** Add subtle indicators ("I'm assuming you want..." in responses)
- **Phase 3:** Optional power-user panel showing agent's current understanding

This follows the principle of progressive disclosure.

---

## Architectural Observations

### Strengths

1. **Separation of Concerns:** Planner, Executor, Summarizer, and State are cleanly separated
2. **Streaming-First:** Non-blocking state updates are critical for UX
3. **Delta-Based Updates:** Avoids the "reconstruct everything" anti-pattern from State-Aware paper
4. **Document-Centric:** Stable knowledge topology vs ephemeral tasks

### Potential Risks

1. **State Bloat:** Without cleanup, `assumptions` and `tentative_hypotheses` could grow unbounded
   - **Mitigation:** Add confidence decay + periodic pruning in summarizer

2. **Summarizer as Bottleneck:** If summarizer is slow, state updates lag behind
   - **Mitigation:** Already addressed with async post-`done` execution

3. **Cold Start Problem:** New sessions have no agent state
   - **Mitigation:** Bootstrap from user preferences + project context

---

## Implementation Priority

Based on research impact, I'd prioritize additions in this order:

| Priority | Enhancement | Expected Impact |
|----------|-------------|-----------------|
| 1 | 5-minute context window constraint | Reduces noise, aligns with research |
| 2 | Expectation verification loop | Completes the state-aware feedback cycle |
| 3 | Graph-based retrieval for context | +10-15% context relevance (per ProAgentBench) |
| 4 | Confidence decay on assumptions | Prevents stale state accumulation |
| 5 | Proactive timing detection | Enables "When to Assist" capability |
| 6 | User pattern learning | Long-term personalization (high effort) |
| 7 | Burstiness awareness | Nice-to-have for engagement optimization |

---

## Conclusion

The V2 spec demonstrates a strong understanding of modern agent architecture. The Agent State implementation is research-grade and directly addresses the problems identified in academic literature.

The main opportunities are:
1. Adding proactive capabilities (beyond reactive chat)
2. Tightening the expectation verification loop
3. Leveraging the ontology graph more deeply for retrieval
4. Building user-specific learning over time

With these additions, BuildOS would have one of the most sophisticated agentic chat architectures in the productivity space.

---

## References

- `design/research-proactive-agents.md` — ProAgentBench analysis
- `design/research-state-aware-agents.md` — State-Aware Agents analysis
- `design/research-textual-planning.md` — EMBEDPLAN analysis
- `design/research-index.md` — Full research index
