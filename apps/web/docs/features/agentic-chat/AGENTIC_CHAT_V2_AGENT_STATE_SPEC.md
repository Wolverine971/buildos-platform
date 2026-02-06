<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_AGENT_STATE_SPEC.md -->

# Agentic Chat V2 — Agent State Spec

**Status:** Draft (Design)  
**Owner:** BuildOS  
**Date:** 2026-02-05  
**Scope:** Structured agent state, update pipeline, and integration with streaming.

---

## 1. Purpose

This spec defines the **agent state model** used to preserve structured reasoning
across turns. It formalizes what the agent “knows,” “assumes,” and “expects,” and
how that state is updated without blocking streaming.

---

## 2. Goals

- Maintain **persistent structured state** across turns.
- Track assumptions/hypotheses explicitly.
- Support post‑action expectations/invariants.
- Avoid slowing streaming or bloating tool calls.

---

## 3. Non-Goals

- Long‑term memory outside the session scope.
- Full knowledge graph inference (use ontology graph instead).

---

## 4. Agent State Data Model

```ts
type AgentStateItem = {
  id: string;
  kind: 'task' | 'doc' | 'note' | 'idea' | 'question';
  title: string;
  details?: string;
  status: 'active' | 'resolved' | 'discarded';
  relatedEntityIds?: string[];
  createdAt: string;
  updatedAt: string;
};

type AgentState = {
  sessionId: string;
  current_understanding: {
    entities: Array<{ id: string; kind: string; name?: string }>;
    dependencies: Array<{ from: string; to: string; rel?: string }>;
  };
  assumptions: Array<{
    id: string;
    hypothesis: string;
    confidence: number;
    evidence?: string[];
  }>;
  expectations: Array<{
    id?: string;
    action: string;
    expected_outcome: string;
    expected_ids?: string[];
    expected_type?: string;
    expected_count?: number;
    invariant?: string;
    status?: 'pending' | 'confirmed' | 'failed';
    last_checked_at?: string;
  }>;
  tentative_hypotheses: Array<{
    id: string;
    hypothesis: string;
    reason?: string;
  }>;
  items: AgentStateItem[];
  lastSummarizedAt?: string;
};
```

---

## 5. Update Pipeline (Hybrid, Non‑Blocking)

Agent state updates come from three sources:

1. **Deterministic updates** from tool results + entity patches  
   - Update `current_understanding` and `dependencies` with structured data.
2. **Planner intent** (optional)  
   - Add lightweight expectations for planned steps.
3. **Summarizer LLM (end‑of‑turn)**  
   - Reconcile assumptions/hypotheses and update expectations.

State updates **never block streaming**.

---

## 6. Expectation Verification Loop (Lightweight)

Every tool result is a **state transition**. When an expectation exists, verify
the tool outcome against it and update state if it mismatches.

### 6.1 When to Verify

Only verify when:

- the planner created an explicit expectation for that action
- the tool result contains structured output that can be compared

Skip verification when expectations are vague or the tool output is unstructured.

### 6.2 Verification Outcomes

- **Match** → mark expectation `confirmed`
- **Mismatch** → mark expectation `failed` and add a hypothesis/assumption
  describing the discrepancy

### 6.3 Example (Pseudo)

```ts
function verifyExpectation(
  expectation: Expectation,
  toolResult: ToolResult
): AgentStateUpdate | null {
  const matched = doesOutcomeMatch(expectation.expected_outcome, toolResult);

  if (matched) {
    return {
      expectations: [
        { ...expectation, status: 'confirmed', last_checked_at: now() }
      ]
    };
  }

  return {
    assumptions: [{
      id: generateId(),
      hypothesis: `Expected "${expectation.expected_outcome}" but got "${summarize(toolResult)}"`,
      confidence: 0.7,
      evidence: [toolResult.id]
    }],
    expectations: [
      { ...expectation, status: 'failed', last_checked_at: now() }
    ]
  };
}
```

### 6.4 Why This Matters

This closes the **execution feedback loop**:

- tools update `current_understanding` deterministically
- mismatches update **assumptions** and **expectations**
- planner can correct course instead of silently drifting

This is intentionally lightweight and does **not** require extra tool calls.

---

## 7. Event Note (Expectation Verification)

Expectation verification emits updates via the existing `agent_state_update`
channel. A separate `expectation_verified` event is **not required**.

If needed later, `expectation_verified` can be derived from:

- expectation status change (`pending` → `confirmed` / `failed`)
- the associated tool result

---

## 8. Deterministic Matcher (doesOutcomeMatch)

Use a minimal, deterministic matcher to avoid LLM overhead:

1. **Exact ID match:** if expectation references entity IDs, require those IDs in tool result.
2. **Type match:** if expectation specifies an entity type, ensure tool result contains that type.
3. **Count match:** if expectation specifies a count (e.g., “create 2 tasks”), compare counts.
4. **Fallback:** if no structured fields are available, skip verification (do not guess).

Pseudo:

```ts
function doesOutcomeMatch(expectation: Expectation, toolResult: ToolResult): boolean {
  if (expectation.expected_ids?.length) {
    return expectation.expected_ids.every((id) => toolResult.ids?.includes(id));
  }
  if (expectation.expected_type) {
    return toolResult.types?.includes(expectation.expected_type);
  }
  if (typeof expectation.expected_count === 'number') {
    return (toolResult.count ?? 0) === expectation.expected_count;
  }
  return false; // insufficient structure
}
```

---

## 9. State Delta Schema

```ts
type AgentStateItemUpdate =
  | { op: 'add'; item: AgentStateItem }
  | { op: 'update'; id: string; patch: Partial<AgentStateItem> }
  | { op: 'remove'; id: string };

type AgentStateUpdate = {
  current_understanding?: {
    entities?: Array<{ id: string; kind: string; name?: string }>;
    dependencies?: Array<{ from: string; to: string; rel?: string }>;
  };
  assumptions?: Array<{
    id: string;
    hypothesis: string;
    confidence: number;
    evidence?: string[];
  }>;
  expectations?: Array<{
    id?: string;
    action: string;
    expected_outcome: string;
    expected_ids?: string[];
    expected_type?: string;
    expected_count?: number;
    invariant?: string;
    status?: 'pending' | 'confirmed' | 'failed';
    last_checked_at?: string;
  }>;
  tentative_hypotheses?: Array<{
    id: string;
    hypothesis: string;
    reason?: string;
  }>;
};
```

---

## 10. Summarizer Prompt Snippet

```
You are updating the agent_state for a BuildOS chat.
Use ONLY the provided messages, tool results, and current agent_state.
Return structured deltas only. Do not invent facts or expand beyond evidence.

Update:
- current_understanding (entities + dependencies)
- assumptions/hypotheses with confidence
- expectations/invariants for actions taken
- tentative/alternative hypotheses (if unresolved)

Output JSON:
{
  "agent_state_item_updates": [...],
  "agent_state_updates": { ... }
}
```

---

## 11. Integration Points

- **ContextPack** includes `agentState`.
- Planner reads agent state before planning.
- Summarizer updates state after each turn.
- State stored session‑scoped in `chat_sessions.agent_metadata.agent_state`.

---

## 12. Open Questions

**Decisions (2026-02-05):**

1. **User visibility:** Agent state is **not** user-visible by default.
2. **Retention:** Agent state persists **alongside the chat session**.
3. **Confidence:** Confidence changes **on contradiction** (not time-decay).
