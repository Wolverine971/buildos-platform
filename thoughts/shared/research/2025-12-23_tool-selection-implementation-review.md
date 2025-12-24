<!-- thoughts/shared/research/2025-12-23_tool-selection-implementation-review.md -->
# Tool Selection Implementation Review

**Date**: December 23, 2025
**Reviewer**: AI Integrations Engineer Assessment
**Status**: Review Updated - Tool-miss retry added; gating constraints intentionally skipped
**Files Reviewed**: tool-selection-service.ts, strategy-analyzer.ts, agent-chat-orchestrator.ts, tools.config.ts, types.ts

---

## 1. Executive Summary

The implementation wires `StrategyAnalyzer` into the live flow and adds a `ToolSelectionService` layer. The design is **directionally correct** but has several **critical issues** that need addressing before production use.

**Overall Grade: B-** (Good concept, needs refinement)

| Aspect | Rating | Notes |
|--------|--------|-------|
| Architecture | A- | Clean separation, follows existing patterns |
| LLM Integration | B- | Prompt needs work, tool catalog bloat |
| Fallback Logic | C+ | Multiple layers but some gaps |
| Type Safety | A | Well-typed, no new type errors |
| Testability | C | No tests added, hard to unit test |
| Performance | B | Single LLM call reused, but could be costly |

---

## 2. What Works Well

### 2.1 Clean Service Separation
The `ToolSelectionService` properly encapsulates tool selection logic and delegates to `StrategyAnalyzer`:

```typescript
// Good: Single responsibility, injectable dependency
export class ToolSelectionService {
  constructor(private strategyAnalyzer: StrategyAnalyzer) {}

  async selectTools(params: {...}): Promise<ToolSelectionResult> {
    // ...
  }
}
```

### 2.2 Proper Integration Point
Tool selection happens at the right place in the flow:

```typescript
// agent-chat-orchestrator.ts:169
plannerContext = await this.applyToolSelection({
  request,
  plannerContext,
  serviceContext
});
```

This runs **after** context building but **before** agent record creation and planner loop.

### 2.3 Context Shift Re-selection
The implementation correctly re-runs tool selection after context shifts:

```typescript
// agent-chat-orchestrator.ts:510
refreshedPlannerContext = await this.applyToolSelection({
  request,
  plannerContext: refreshedPlannerContext,
  serviceContext
});
```

### 2.4 Default Pool from Metadata
The new `getDefaultToolNamesForContextType()` function correctly uses `TOOL_METADATA.contexts`:

```typescript
// tools.config.ts:61-72
export function getDefaultToolNamesForContextType(contextType: ChatContextType): string[] {
  const contexts = new Set<ToolContextScope>(['base', ...resolveToolContexts(contextType)]);
  const names = new Set<string>();

  for (const [toolName, metadata] of Object.entries(TOOL_METADATA)) {
    if (!metadata?.contexts?.length) continue;
    if (metadata.contexts.some((context) => contexts.has(context))) {
      names.add(toolName);
    }
  }
  return Array.from(names);
}
```

### 2.5 Graceful Fallback Chain
Multiple fallback layers exist:

```
LLM tool_selection → required_tools → heuristic estimation → default pool
```

---

## 3. Critical Issues

### 3.1 CRITICAL: Full Tool Catalog in Prompt = Token Explosion

**Problem**: The system prompt now includes the FULL tool catalog:

```typescript
// strategy-analyzer.ts:393-397
const toolCatalogSummaries = toolSelectionContext?.toolCatalog?.length
  ? formatToolSummaries(toolSelectionContext.toolCatalog)
  : toolSummaries;
const toolSelectionGuidance = toolSelectionContext
  ? `\nTool selection:\n- Default tool pool: ${toolList}\n- Full tool catalog:\n${toolCatalogSummaries}\n...`
```

With 35+ tools, this adds **2,000-3,000 tokens** to every strategy analysis call. This **defeats the purpose** of tool selection (reducing tokens).

**Fix**: Only include tool summaries (name + 1-line description), not full definitions:

```typescript
// Better approach
const toolCatalogBrief = toolSelectionContext?.toolCatalog
  ?.map(t => `${t.function.name}: ${t.function.description?.slice(0, 60)}...`)
  .join('\n');
```

### 3.2 CRITICAL: Default Pool Not Actually Used

**Problem**: `ToolSelectionService` calls `StrategyAnalyzer` with `defaultToolNames`, but the default pool is **ignored in heuristic mode**:

```typescript
// tool-selection-service.ts:100-106
if (mode !== 'llm') {
  selectedToolNames = selectedToolNames.filter((name) => defaultSet.has(name)); // Good
  selectedToolNames = this.filterExternalTools(selectedToolNames, message);
  if (selectedToolNames.length === 0) {
    selectedToolNames = defaultToolNames.filter((name) => toolCatalogNames.has(name));
    mode = 'default';
  }
}
```

But earlier at line 87-91:
```typescript
} else {
  selectedToolNames = this.strategyAnalyzer.estimateRequiredTools(
    message,
    defaultToolNames  // Using default pool
  );
  mode = selectedToolNames.length ? 'heuristic' : 'default';
}
```

The heuristic `estimateRequiredTools` only matches keywords like "list", "create", "search" against available tools. If the user says "show me my tasks" (no keyword match), it returns `[]` and falls back to **all default tools** - no reduction achieved.

**Fix**: The heuristic needs smarter entity-based matching:

```typescript
// Better heuristic
estimateRequiredTools(message: string, availableTools: string[]): string[] {
  const lowerMessage = message.toLowerCase();
  const requiredTools: string[] = [];

  // Entity-based matching
  if (lowerMessage.includes('task')) {
    requiredTools.push(...availableTools.filter(t => t.includes('task')));
  }
  if (lowerMessage.includes('project')) {
    requiredTools.push(...availableTools.filter(t => t.includes('project')));
  }
  // ... etc

  return [...new Set(requiredTools)];
}
```

### 3.3 HIGH: LLM Tool Selection Not Constrained to Default Pool

**Problem**: When LLM returns `tool_selection.selected_tools`, those tools are **not validated against the default pool**:

```typescript
// tool-selection-service.ts:80-82
if (analysis.tool_selection?.selected_tools?.length && !isFallbackSelection) {
  selectedToolNames = analysis.tool_selection.selected_tools;
  mode = 'llm';
}
```

The LLM could select tools outside the default pool. Line 94 only normalizes against `toolCatalogNames` (all tools), not `defaultSet`.

**Fix**: The design doc said "Start with the default pool, then add missing tools or trim irrelevant ones." The implementation should:

1. Start with default pool
2. LLM adds/removes from that pool
3. Validate final selection exists in catalog

```typescript
// Better approach
if (analysis.tool_selection?.selected_tools?.length) {
  // LLM selected tools - use as base, but validate
  const llmSelected = new Set(analysis.tool_selection.selected_tools);

  // Add anything from default pool that LLM kept
  // Plus any additions LLM made (if in catalog)
  selectedToolNames = analysis.tool_selection.selected_tools
    .filter(name => toolCatalogNames.has(name));

  mode = 'llm';
}
```

**Decision**: Accepted; default pool is advisory by design.

### 3.4 MEDIUM: Missing Write Tool Gating

**Problem**: The v2 assessment doc says "Gate write tools based on `tool_selection.intent == 'write'` or `'mixed'`". But the implementation doesn't actually filter write tools based on intent:

```typescript
// tool-selection-service.ts - no write intent check
// The old includeWriteTools was supposed to be replaced by intent-based gating
```

**Fix**: Add intent-based write gating:

```typescript
private filterWriteTools(names: string[], analysis: StrategyAnalysis): string[] {
  const intent = analysis.tool_selection?.intent;

  if (intent === 'read') {
    // Remove write tools
    return names.filter(name => !TOOL_METADATA[name]?.category?.includes('write'));
  }

  return names;
}
```

**Decision**: Accepted; write gating intentionally skipped.

### 3.5 MEDIUM: No Safety Fallback for Missing Tools

**Problem**: The v2 assessment doc describes Step D: "If the plan requests a tool that is not loaded, re-run selection with relaxed constraints." This wasn't implemented.

Currently, if the planner requests a tool that wasn't loaded, it will fail. There's no retry mechanism.

**Fix**: Add to `PlanOrchestrator` or `ToolExecutionService`:

```typescript
// In tool-execution-service.ts
if (!this.toolRegistry.has(toolName)) {
  // Emit event for orchestrator to handle
  throw new ToolNotLoadedError(toolName);
}

// In orchestrator, catch and retry with expanded selection
```

**Update**: Implemented a single retry path that expands the tool pool and re-runs the planner loop.

---

## 4. Minor Issues

### 4.1 Redundant Tool Name Extraction

Multiple places extract tool names with slightly different logic:

```typescript
// strategy-analyzer.ts:745-766
private getAvailableToolNames(availableTools: PlannerContext['availableTools']): string[] {
  // Complex null handling
}

// tool-selection-service.ts:135-142
private getToolNames(tools: ChatToolDefinition[]): string[] {
  // Different approach
}

// tools.config.ts:341-343
function getToolName(tool: ChatToolDefinition): string {
  // Yet another approach
}
```

**Recommendation**: Consolidate into single utility function.

### 4.2 Heuristic Fallback Detection is Fragile

```typescript
// tool-selection-service.ts:78
const isFallbackSelection = toolSelectionReasoning.includes('Heuristic fallback');
```

Relying on string matching in reasoning text is fragile. The LLM might phrase it differently.

**Fix**: Add explicit flag to tool_selection:

```typescript
interface ToolSelectionSummary {
  selected_tools: string[];
  is_heuristic_fallback?: boolean;  // Explicit flag
  // ...
}
```

### 4.3 Missing Telemetry

The v2 assessment doc recommends tracking:
- `tools_loaded`, `tools_used`, `tool_misses`, `tool_escalations`

The implementation stores metadata in `plannerContext.metadata.toolSelection` but doesn't emit telemetry events.

**Recommendation**: Add telemetry emission in orchestrator:

```typescript
// After tool selection
this.emitTelemetry('tool_selection', {
  mode: selection.metadata.mode,
  defaultCount: selection.metadata.defaultToolNames.length,
  selectedCount: selection.metadata.selectedToolNames.length,
  added: selection.metadata.addedTools,
  removed: selection.metadata.removedTools
});
```

---

## 5. Architecture Concerns

### 5.1 Coupling Between StrategyAnalyzer and Tool Selection

The `StrategyAnalyzer` now has two responsibilities:
1. Determine execution strategy (planner_stream, project_creation, ask_clarifying)
2. Select tools

This violates single responsibility. Consider:
- Keep strategy analysis separate from tool selection
- Have `ToolSelectionService` call a dedicated tool selection prompt OR
- Have `ToolSelectionService` use strategy analysis as an input signal (not the primary selector)

### 5.2 Default Pool Logic Lives in Two Places

Default tool resolution happens in:
1. `tools.config.ts` - `getDefaultToolNamesForContextType()`
2. `agent-context-service.ts` - `getDefaultToolsForContextType()` call

This could lead to inconsistency. Consider having `ToolSelectionService` own all default pool logic.

---

## 6. Performance Analysis

### 6.1 Token Cost Estimate

**Before** (static selection):
- System prompt: ~1,500 tokens
- Tools: ~3,500 tokens (35 tools × ~100 tokens each)
- Total tool context: ~3,500 tokens

**After** (with current implementation):
- Strategy analysis prompt: ~1,000 tokens
- Tool catalog in strategy prompt: ~2,500 tokens (35 summaries)
- Selected tools in planner: ~1,000-2,000 tokens (10-20 tools)
- Total: ~4,500-5,500 tokens

**Net impact**: Potentially **MORE** tokens, not fewer!

### 6.2 Latency Impact

The strategy analysis LLM call is now doing more work (tool selection). This could add 200-500ms depending on model.

---

## 7. Recommendations

### Immediate Fixes (Before Merging)

1. **Remove full tool catalog from strategy prompt** - Use brief summaries only
2. **Add write tool gating** based on intent
3. **Constrain LLM selection to default pool + explicit additions**
4. **Add entity-based heuristic matching**

### Short-Term Improvements

5. **Add telemetry** for tool selection metrics
6. **Add missing tool fallback** (retry with expanded selection)
7. **Consolidate tool name extraction** utilities

### Longer-Term

8. **Separate tool selection from strategy analysis** - Dedicated light prompt
9. **Add unit tests** for ToolSelectionService
10. **Consider caching** tool selections for similar queries

---

## 8. Test Scenarios to Validate

Before deploying, test these scenarios:

| Scenario | Expected Behavior |
|----------|-------------------|
| "List my tasks" | Loads task read tools only (~5-8 tools) |
| "Create a new task" | Loads task read + write tools (~10-12 tools) |
| "Analyze project health" | Loads full project tools (~20 tools) |
| "Search the web for X" | Includes web_search tool |
| "How does BuildOS work?" | Includes buildos docs tools |
| "Update task status" | intent=write, includes update_onto_task |
| Context shift to task | Re-selects with task-focused tools |

---

## 9. Conclusion

The implementation follows the v2 assessment's recommendations but has gaps in execution. The **core issue** is that the current implementation may **increase** token usage rather than decrease it, due to including the full tool catalog in the strategy prompt.

**Recommended action**: Fix critical issues #3.1 and #3.2 before merging, then iterate on the others.

The architecture is sound - the wiring into the orchestrator flow is correct and the fallback chain is reasonable. With the fixes above, this should achieve the goal of dynamic, intent-aware tool selection.

---

## 10. Implementation Progress Log

### December 23, 2025 - Issues Fixed

| Issue | Status | Notes |
|-------|--------|-------|
| **3.1 Full Tool Catalog in Prompt** | ✅ Fixed | Added `formatBriefToolCatalog()` in `tools.config.ts` - only includes `name: truncated_summary` |
| **3.2 Default Pool Not Actually Used** | ✅ Fixed | Added entity-based matching to `estimateRequiredTools()` in `strategy-analyzer.ts` |
| **3.3 LLM Tool Selection Unconstrained** | ✅ Accepted | Default pool remains advisory by design |
| **3.4 Missing Write Tool Gating** | ✅ Accepted | Write gating intentionally skipped |
| **3.5 No Safety Fallback** | ✅ Fixed | Added single tool-miss retry with expanded pool and replan |
| **4.1 Redundant Tool Name Extraction** | ✅ Fixed | Consolidated into `resolveToolName()` and `extractToolNamesFromDefinitions()` in `tools.config.ts` |
| **4.2 Fragile Heuristic Fallback Detection** | ✅ Fixed | Added `is_fallback` flag to `ToolSelectionSummary` interface |
| **4.3 Missing Telemetry** | ✅ Fixed | Added telemetry StreamEvent type and emission in `agent-chat-orchestrator.ts` |
| **5.1 Coupling StrategyAnalyzer/Tool Selection** | 📋 TODO | Consider separating in future iteration |
| **5.2 Default Pool Logic in Two Places** | ✅ Fixed | `ToolSelectionService` now owns all default pool logic |

### Architecture Fix: Consolidated Default Pool Logic

**Before:** Default tool resolution happened in:
- `tools.config.ts` - `getDefaultToolNamesForContextType()`
- `agent-context-service.ts` - duplicate `getContextTools()` and `filterToolsForFocus()` methods

**After:** `ToolSelectionService` is the SINGLE SOURCE OF TRUTH:
- Added `getDefaultToolPool(contextType)` method
- Added `filterToolsForFocus(tools, focus)` method
- `selectTools()` now computes defaults internally from `serviceContext.contextType`
- `agent-context-service.ts` now passes `ALL_TOOLS` and lets `ToolSelectionService` filter
- Removed dead `getContextTools()` and `filterToolsForFocus()` from `agent-context-service.ts`

### Files Modified

| File | Changes |
|------|---------|
| `tools.config.ts` | Added `resolveToolName()`, `extractToolNamesFromDefinitions()`, `formatBriefToolCatalog()`, `formatToolNamesOnly()` |
| `strategy-analyzer.ts` | Updated to use brief catalog, added entity-based heuristics, sets `is_fallback` flag |
| `tool-selection-service.ts` | Added `getDefaultToolPool()` and `filterToolsForFocus()` methods - now owns default pool logic |
| `agent-context-service.ts` | Changed to pass `ALL_TOOLS`, removed duplicate methods |
| `shared/types.ts` | Added `ToolExecutionErrorType`, `errorType` field, telemetry StreamEvent |
| `agent-chat-enhancement.ts` | Added `is_fallback` to `ToolSelectionSummary` |
| `tool-execution-service.ts` | Added `errorType` detection |
| `agent-chat-orchestrator.ts` | Added telemetry emission |

### Verification

- ✅ Typecheck passes (no new errors introduced)
- ✅ All pre-existing errors are unrelated Supabase typing issues
- 🧪 Manual testing recommended for scenarios in Section 8
