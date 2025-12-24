<!-- thoughts/shared/research/2025-12-23_dynamic-tool-selection-architecture-assessment-v2.md -->
# Dynamic Tool Selection Architecture Assessment (v2)

**Date**: 2025-12-23
**Author**: Architecture Analysis
**Status**: Proposed

---

## 1. Executive Summary

This reassessment recommends wiring the existing `StrategyAnalyzer` into the live agentic chat flow and using it as the primary tool selection signal, combined with metadata- and context-based filtering. The goal is to replace static `CONTEXT_TO_TOOL_GROUPS` plus `includeWriteTools` with a dynamic pipeline that:

- Uses `TOOL_METADATA.contexts` + `projectFocus` + ontology scope to build a candidate pool
- Uses `StrategyAnalyzer` to select tool categories and optional explicit tool names
- Adds write tools only when intent requires it
- Adds web/docs tools only when the message explicitly needs external help
- Falls back safely when tools are missing at plan time

This keeps latency controlled (one LLM call that already exists in the system), trims tool tokens, and matches the intent that context informs selection but does not decide it alone.

---

## 2. Current State (Observed in Code)

**Reality check**
- `StrategyAnalyzer` exists but is not wired into the agentic chat orchestration flow (no runtime usage, only tests and types).
- `AgentContextService.buildPlannerContext()` still calls `getToolsForContextType()` which pulls from `CONTEXT_TO_TOOL_GROUPS` and includes write tools by default.
- `PlanOrchestrator` uses `plannerContext.availableTools` directly, so tool scope must be finalized before plan generation.
- `filterToolsForFocus()` already narrows by project focus, but it runs after static tool selection and still starts from a large base set.

**Implication**
To make tool selection dynamic, the selection step needs to happen before or during `buildPlannerContext()`, and `StrategyAnalyzer` should be connected to that step.

---

## 3. Assessment and Recommendation

### 3.1 Core Finding
`StrategyAnalyzer` is almost exactly the missing piece, but it currently stops at strategy selection and an optional list of `required_tools`. It should be extended and used to control the actual tool inventory injected into the planner.

### 3.2 Recommended Approach
**Strategy Analyzer driven tool routing plus metadata gating**

Why this is the right fit:
- It reuses a component already built (and tested).
- It avoids an additional LLM call if we reuse the existing analysis step.
- It aligns with the preference that context informs candidate tools, but the tool chooser decides final selection.

---

## 4. Proposed Tool Selection Pipeline

### Step A: Candidate Pool (Metadata and Context)
Use `TOOL_METADATA.contexts` to build a default pool of suggested tools for the current context type, then apply `projectFocus` and ontology scope to trim entity-specific tools. This produces a reasonable default set before any LLM-driven tool selection.

Candidate pool logic:
- Start with tools where `metadata.contexts` contains the normalized context, plus those tagged `base`.
- Filter by focus (existing `filterToolsForFocus()` logic).
- If ontology scope is known (combined or focused entity), deprioritize tools for unrelated entities.

Then, the tool-choosing agent (with knowledge of the full tool catalog) reviews the default pool and can:
- Add tools that are clearly required but not present.
- Trim tools that are unnecessary for the intent.

### Step B: Intent Filter (StrategyAnalyzer)
Extend `StrategyAnalyzer` to output a `tool_selection` object:

```json
{
  "tool_selection": {
    "intent": "read" | "write" | "mixed",
    "tool_categories": ["ontology", "utility"],
    "required_tools": ["list_onto_tasks", "get_onto_project_details"],
    "optional_tools": ["search_ontology"]
  }
}
```

Use this to filter the candidate pool:
- Always include `required_tools` (if they exist in the candidate pool).
- Include `optional_tools` only if token budget allows.
- Use `intent` to allow or block write tools.

### Step C: External Tool Gating
Only add:
- `web_search` when intent explicitly asks for research or external info.
- `get_buildos_overview` / `get_buildos_usage_guide` only for "how does BuildOS work" or "help" queries.

### Step D: Safety Fallbacks
If the plan requests a tool that is not loaded:
1. Re-run tool selection with relaxed constraints (add relevant category).
2. Replan once with the expanded tool set.
3. If still failing, fall back to full context for that turn only and log telemetry.

---

## 5. Implementation Plan

### Phase 0: Wire `StrategyAnalyzer`
Goal: Make it part of the live flow before any deeper changes.
- Instantiate `StrategyAnalyzer` inside `AgentChatOrchestrator` or a new tool selection service.
- Run it before `buildPlannerContext()` or immediately after (but before plan generation).
- Store analysis result in `plannerContext.metadata` for observability.

### Phase 1: Metadata-First Candidate Pool
Goal: Replace `CONTEXT_TO_TOOL_GROUPS` with metadata-driven candidates.
- Build candidate tools using `TOOL_METADATA.contexts` plus normalized context type.
- Apply `filterToolsForFocus()` and ontology scope filters.
- Keep `CONTEXT_TO_TOOL_GROUPS` as a short-term fallback behind a feature flag.

### Phase 2: Tool Selection Output
Goal: Extend `StrategyAnalyzer` to output `tool_selection`.
- Update the system prompt to request tool categories and intent.
- Ensure `required_tools` is validated against available tool names.
- If confidence is low, allow broader tool selection (include more candidates).

### Phase 3: Remove `includeWriteTools`
Goal: Eliminate the static write flag and use intent-driven writes.
- Deprecate `includeWriteTools` in `getToolsForContextType`.
- Gate write tools based on `tool_selection.intent == "write"` or `"mixed"`.
- Ensure project creation path always forces `create_onto_project`.

### Phase 4: Fallback and Telemetry
Goal: Reduce risk and enable tuning.
- Track `tools_loaded`, `tools_used`, `tool_misses`, `tool_escalations`.
- Alert when tool miss rate exceeds threshold.
- Add a single retry path on tool missing in plan generation.

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Under-selection breaks plan | Add tool escalation fallback and replan once |
| Over-selection grows tokens | Use strict gating and optional tool lists |
| LLM selection inconsistency | Add confidence thresholds plus deterministic fallbacks |
| Write tool exposure | Gate writes on explicit intent and context type |

---

## 7. Success Criteria

- 50%+ reduction in tools injected per request for typical project context.
- No increase in plan failure rate from missing tools.
- Measurable drop in tool hallucinations in logs.
- No regression in project creation flow.

---

## 8. Open Questions

- Should `StrategyAnalyzer` run for every request or only when token budget is at risk?
- Do we want a lightweight heuristic selection fallback when LLM analysis fails?
- Where should the tool selection live (context service vs orchestration layer)?

---

## 9. Recommendation

Move forward with strategy-analyzer driven tool selection and metadata gating, using a staged rollout behind a feature flag. This preserves the current architecture while converting tool selection from static to intent-aware, without adding a second LLM call or introducing multi-agent complexity prematurely.
