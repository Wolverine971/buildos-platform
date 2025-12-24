<!-- thoughts/shared/research/2025-12-23_dynamic-tool-selection-architecture-assessment.md -->
# Dynamic Tool Selection Architecture Assessment

**Date**: December 23, 2025
**Author**: Architecture Analysis
**Status**: Superseded by v2 assessment and implementation review (2025-12-23)
**Topic**: Replacing Static Tool Configuration with Dynamic Tool Selection

---

> Superseded: See `thoughts/shared/research/2025-12-23_dynamic-tool-selection-architecture-assessment-v2.md` and `thoughts/shared/research/2025-12-23_tool-selection-implementation-review.md` for the current direction and status.

## 1. Executive Summary

This document analyzes approaches for evolving BuildOS's agentic chat system from static tool configuration to dynamic tool selection. After analyzing your current architecture and exploring three main approaches, my recommendation is a **hybrid approach: Semantic Tool Routing with Lazy Loading**.

**Key Finding**: Pure dynamic tool selection (Approach A) adds latency and cost without proportional benefit. Full agent delegation (Approach B) is architecturally cleaner but requires significant refactoring. The hybrid approach (Approach C) provides the benefits of dynamic selection while maintaining performance.

---

## 2. Current Architecture Analysis

### 2.1 How Tools Are Currently Selected

```
tools.config.ts
├── TOOL_GROUPS (base, global, project, project_audit, etc.)
├── CONTEXT_TO_TOOL_GROUPS (maps ChatContextType → ToolContextScope[])
└── getToolsForContextType() → Returns ChatToolDefinition[]
```

**The flow today:**
1. `AgentChatOrchestrator.streamConversation()` calls `AgentContextService.buildPlannerContext()`
2. Context service uses `getToolsForContextType(contextType)` to statically load tools
3. All tools for that context are injected into the LLM prompt upfront
4. PlanOrchestrator generates plans using those tools

**Current tool count by context:**
- `global`: ~30 tools (base + global + project_create + project)
- `project`: ~25 tools (base + project)
- `project_create`: ~10 tools (base + project_create)

### 2.2 Problems with Static Selection

| Problem | Impact |
|---------|--------|
| **Context pollution** | All 25-30 tools loaded even when user needs 2-3 |
| **Token waste** | Tool definitions consume ~3,000-5,000 tokens per request |
| **Hallucinated tool calls** | LLM sometimes calls irrelevant tools it "sees" |
| **Maintenance burden** | Adding new tools requires updating multiple mappings |
| **No relationship awareness** | Can't dynamically load tools based on entity types in play |

---

## 3. Approach Analysis

### Approach A: Dynamic Tool Selection by LLM ("Tool Picker Agent")

**How it works:**
1. User message arrives
2. A lightweight "Tool Picker" LLM call analyzes the request + ontology context
3. Tool Picker returns a list of relevant tool names (e.g., `["list_onto_tasks", "get_onto_project_details", "update_onto_task"]`)
4. Main planner agent receives ONLY those tools
5. Plan generation and execution proceeds as normal

**Architecture:**
```
User Request
    ↓
┌─────────────────────┐
│  Tool Selector LLM  │  ← Small prompt with tool catalog + user intent
│  (fast, cheap call) │
└─────────────────────┘
    ↓
Selected Tools: [tool_a, tool_b, tool_c]
    ↓
┌─────────────────────┐
│  Planner Agent      │  ← Only sees relevant tools
│  (main orchestration)│
└─────────────────────┘
```

**Implementation:**
```typescript
// New service: ToolSelectionService
class ToolSelectionService {
  async selectTools(params: {
    userMessage: string;
    contextType: ChatContextType;
    ontologyContext?: OntologyContext;
    entityTypes?: string[];  // ['project', 'task', 'goal']
  }): Promise<string[]> {

    const toolCatalog = this.buildToolCatalog(); // Condensed tool summaries

    const response = await this.llm.generateText({
      systemPrompt: TOOL_SELECTION_PROMPT,
      prompt: `
        User request: ${userMessage}
        Context type: ${contextType}
        Entity types in scope: ${entityTypes?.join(', ')}
        Ontology summary: ${ontologyContext?.metadata}

        Available tools:
        ${toolCatalog}

        Return JSON: { "tools": ["tool_name_1", "tool_name_2", ...], "reasoning": "..." }
      `,
      temperature: 0.1,  // Low temp for consistent selection
      maxTokens: 300,    // Quick response
      profile: 'fast'    // Use cheapest model
    });

    return this.parseToolSelection(response);
  }
}
```

**Pros:**
- Dramatically reduces token usage (25 tools → 3-5 tools)
- LLM understands semantic relationships between entities and tools
- Can learn from ontology context (e.g., "this project has no goals, don't load goal tools")
- No hallucinated calls to irrelevant tools
- Self-documenting tool selection logic

**Cons:**
- **Adds 300-500ms latency** to every request (LLM call overhead)
- **Adds ~$0.001-0.003 cost** per request (even with fast model)
- Risk of under-selection (missing tools the user actually needs)
- Another prompt to maintain
- Failure in tool selection cascades to main agent failure

**Cost Analysis (1000 requests/day):**
- Tool selection calls: ~$2-3/day additional
- Token savings: ~3,000 tokens/request × $0.0001 = ~$0.30/request → $300/day savings
- **Net: Likely positive ROI if token savings > call costs**

---

### Approach B: Agent Delegation ("Data Processor Agent")

**How it works:**
1. Main "Conversational Agent" receives user message
2. Conversational Agent maintains chat context but has NO data tools
3. When data operations needed, Conversational Agent delegates to "Data Processor Agent"
4. Data Processor has full tool access and deep ontology knowledge
5. Results flow back to Conversational Agent for synthesis

**Architecture:**
```
User Request
    ↓
┌─────────────────────────────┐
│  Conversational Agent       │  ← Chat-focused, no data tools
│  - Understands user intent  │
│  - Maintains conversation   │
│  - Synthesizes responses    │
└─────────────────────────────┘
    ↓ (delegation)
┌─────────────────────────────┐
│  Data Processor Agent       │  ← Data-focused, all tools
│  - Full ontology knowledge  │
│  - Executes tool operations │
│  - Returns structured data  │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Conversational Agent       │
│  - Synthesizes response     │
│  - Continues conversation   │
└─────────────────────────────┘
```

**Implementation (extends existing agent-to-agent pattern):**
```typescript
// In AgentChatOrchestrator
private async handleDataOperation(
  intent: DataOperationIntent,
  context: ServiceContext
): Promise<DataOperationResult> {

  // Spawn Data Processor with full tool context
  const dataProcessor = await this.executorCoordinator.spawnExecutor({
    type: 'data_processor',
    systemPrompt: DATA_PROCESSOR_SYSTEM_PROMPT,
    tools: ALL_ONTOLOGY_TOOLS,  // Full access
    task: {
      operation: intent.operation,  // e.g., "list all tasks in project X grouped by status"
      constraints: intent.constraints,
      outputFormat: 'structured'
    }
  }, context);

  return this.executorCoordinator.waitForExecutor(dataProcessor.id);
}
```

**Conversational Agent System Prompt:**
```
You are a helpful BuildOS assistant focused on conversation.

When you need to access or modify project data, delegate to the Data Processor:
- Use delegate_data_operation(operation_description, expected_result_type)
- The Data Processor understands BuildOS's ontology graph deeply
- Wait for results, then synthesize for the user

You do NOT have direct access to:
- Project/task/goal/plan CRUD operations
- Ontology queries
- Calendar operations

Focus on:
- Understanding user intent
- Formulating clear data operation requests
- Synthesizing responses from data
- Maintaining conversational context
```

**Pros:**
- **Clean separation of concerns** - conversation vs data operations
- **Scalable** - can add more specialized agents (calendar agent, document agent)
- **Better prompt engineering** - each agent has focused system prompt
- **Reduces main context window** - conversation agent stays lean
- **Aligns with multi-agent patterns** (similar to OpenAI Swarm, AutoGen)

**Cons:**
- **Higher total latency** - always 2+ LLM calls for data operations
- **More complex debugging** - agent handoffs harder to trace
- **Requires new abstraction layer** - defining "data operations"
- **Risk of over-delegation** - simple queries get routed through complex pipeline
- **Context loss** - data processor doesn't see full conversation

**When This Shines:**
- Complex multi-entity operations ("audit my project health across all dimensions")
- Operations requiring deep ontology traversal
- Write operations where safety matters

---

### Approach C: Semantic Tool Routing with Lazy Loading (RECOMMENDED)

**How it works:**
1. Tools are organized into **semantic clusters** based on entity types and operations
2. A fast **intent classifier** (rule-based + light ML) determines which clusters are needed
3. Only relevant clusters are loaded
4. Within a cluster, tools are still available but grouped logically

**Architecture:**
```
User Request
    ↓
┌─────────────────────────────┐
│  Intent Classifier          │  ← Rule-based + embeddings
│  (no LLM call needed)       │
└─────────────────────────────┘
    ↓
Clusters Needed: [project_read, task_write]
    ↓
┌─────────────────────────────┐
│  Tool Loader                │  ← Loads only needed clusters
│  (lazy instantiation)       │
└─────────────────────────────┘
    ↓
Tools: [get_onto_project_details, list_onto_tasks, update_onto_task, ...]
    ↓
┌─────────────────────────────┐
│  Planner Agent              │  ← Focused tool set
│  (main orchestration)       │
└─────────────────────────────┘
```

**Tool Cluster Design:**
```typescript
const TOOL_CLUSTERS = {
  // Read clusters (commonly needed together)
  project_overview: {
    tools: ['get_onto_project_details', 'list_onto_tasks', 'list_onto_goals', 'list_onto_plans'],
    triggers: ['project', 'overview', 'status', 'summary', 'how is', 'tell me about'],
    entities: ['project']
  },

  task_management: {
    tools: ['list_onto_tasks', 'get_onto_task_details', 'search_onto_tasks'],
    triggers: ['task', 'tasks', 'todo', 'action item', 'what should I', 'next step'],
    entities: ['task']
  },

  task_mutations: {
    tools: ['create_onto_task', 'update_onto_task', 'delete_onto_task'],
    triggers: ['create task', 'add task', 'update task', 'mark', 'complete', 'change'],
    entities: ['task'],
    requiresWrite: true
  },

  goal_tracking: {
    tools: ['list_onto_goals', 'get_onto_goal_details', 'create_onto_goal', 'update_onto_goal'],
    triggers: ['goal', 'goals', 'objective', 'target', 'aim'],
    entities: ['goal']
  },

  document_ops: {
    tools: ['list_onto_documents', 'get_onto_document_details', 'search_onto_documents', 'create_onto_document'],
    triggers: ['document', 'doc', 'notes', 'write', 'context'],
    entities: ['document']
  },

  relationship_queries: {
    tools: ['get_entity_relationships', 'get_linked_entities', 'search_ontology'],
    triggers: ['related', 'linked', 'connected', 'depends on', 'blocks'],
    entities: ['*']  // Any entity
  },

  // Meta/utility clusters
  utility: {
    tools: ['get_field_info', 'get_buildos_overview', 'get_buildos_usage_guide'],
    triggers: ['how does', 'what is', 'help', 'explain'],
    entities: []
  },

  web_research: {
    tools: ['web_search'],
    triggers: ['search', 'look up', 'find online', 'research'],
    entities: []
  }
};
```

**Intent Classification (fast, no LLM):**
```typescript
class IntentClassifier {
  private embeddings: Map<string, number[]>;  // Pre-computed tool cluster embeddings

  classifyIntent(params: {
    userMessage: string;
    contextType: ChatContextType;
    entityId?: string;
    ontologyContext?: OntologyContext;
  }): ToolCluster[] {
    const clusters: Set<string> = new Set();

    // 1. Rule-based matching (fast)
    const messageLower = userMessage.toLowerCase();
    for (const [clusterName, config] of Object.entries(TOOL_CLUSTERS)) {
      if (config.triggers.some(trigger => messageLower.includes(trigger))) {
        clusters.add(clusterName);
      }
    }

    // 2. Context-based defaults
    if (params.contextType === 'project') {
      clusters.add('project_overview');
    }
    if (params.ontologyContext?.entities?.tasks?.length > 0) {
      clusters.add('task_management');
    }

    // 3. Semantic similarity (optional, for ambiguous queries)
    if (clusters.size === 0) {
      const messageEmbedding = this.embed(userMessage);
      clusters.add(this.findClosestCluster(messageEmbedding));
    }

    // 4. Always include utility
    clusters.add('utility');

    return Array.from(clusters);
  }
}
```

**Integration with Existing Architecture:**
```typescript
// Modified AgentContextService.buildPlannerContext()
async buildPlannerContext(params: BuildPlannerContextParams): Promise<PlannerContext> {
  // ... existing context building ...

  // NEW: Smart tool selection instead of static mapping
  const intentClassifier = new IntentClassifier();
  const neededClusters = intentClassifier.classifyIntent({
    userMessage: params.userMessage,
    contextType: params.contextType,
    entityId: params.entityId,
    ontologyContext: params.ontologyContext
  });

  const availableTools = this.loadToolClusters(neededClusters);

  return {
    ...context,
    availableTools,
    metadata: {
      ...context.metadata,
      toolClusters: neededClusters  // For debugging
    }
  };
}
```

**Pros:**
- **No additional LLM latency** - classification is fast (< 10ms)
- **No additional cost** - no LLM calls for tool selection
- **Semantic grouping** - tools that work together stay together
- **Progressive enhancement** - can add ML-based classification later
- **Easy to tune** - triggers are explicit and debuggable
- **Preserves existing architecture** - minimal changes to orchestrator

**Cons:**
- Rule-based triggers need maintenance
- May miss edge cases that LLM would catch
- Less "intelligent" than pure LLM selection
- Requires upfront cluster design

---

## 4. Comparative Analysis

| Criterion | A: Tool Picker LLM | B: Agent Delegation | C: Semantic Routing |
|-----------|-------------------|---------------------|---------------------|
| **Latency** | +300-500ms | +500-1000ms | +5-10ms |
| **Cost/request** | +$0.001-0.003 | +$0.003-0.010 | $0 |
| **Token reduction** | 80-90% | 90%+ | 60-70% |
| **Implementation effort** | Medium | High | Low |
| **Debugging** | Medium | Hard | Easy |
| **Accuracy** | High (LLM decides) | High (specialized) | Medium (rules) |
| **Maintenance** | Prompt updates | System design | Trigger updates |
| **Scalability** | Linear (per call) | Good (specialized agents) | Linear (clusters) |

---

## 5. Recommendation

### Primary Recommendation: Start with Approach C (Semantic Routing)

**Rationale:**
1. **Lowest risk** - Incremental change to existing architecture
2. **No latency penalty** - Critical for chat UX
3. **No cost increase** - Important for scaling
4. **Immediate benefit** - Token reduction visible immediately
5. **Foundation for future** - Can layer LLM selection on top later

### Implementation Roadmap

**Phase 1: Tool Clustering (Week 1)**
```
1. Define TOOL_CLUSTERS based on current usage patterns
2. Create IntentClassifier with rule-based matching
3. Integrate into AgentContextService.buildPlannerContext()
4. Add telemetry to measure cluster accuracy
```

**Phase 2: Refinement (Week 2)**
```
1. Analyze telemetry for missed tools / over-selection
2. Add semantic similarity fallback for ambiguous queries
3. Tune trigger keywords based on real usage
4. Document cluster design decisions
```

**Phase 3: Optional LLM Enhancement (Week 3+)**
```
1. For ambiguous queries only, add LLM tool selection
2. Use as "second opinion" when classifier confidence is low
3. A/B test to measure improvement vs latency cost
```

### Future Evolution: Approach B for Complex Operations

Once semantic routing is stable, consider **selective agent delegation** for:
- Multi-entity audit operations ("analyze project health")
- Complex write operations with validation
- Operations requiring deep ontology traversal

This creates a tiered system:
```
Simple queries → Semantic routing (fast)
Complex queries → Tool picker LLM (accurate)
Multi-entity operations → Data processor agent (specialized)
```

---

## 6. Additional Considerations

### 6.1 Ontology-Aware Tool Selection

Your ontology graph structure provides valuable signals:

```typescript
// Load tools based on what entities exist
const enhanceToolSelection = (clusters: string[], ontologyContext: OntologyContext) => {
  const enhancedClusters = [...clusters];

  // If project has no goals, skip goal tools
  if (ontologyContext.entities?.goals?.length === 0) {
    enhancedClusters.filter(c => c !== 'goal_tracking');
  }

  // If project has documents, ensure document cluster is loaded
  if (ontologyContext.entities?.documents?.length > 0) {
    enhancedClusters.push('document_ops');
  }

  // If asking about relationships, ensure relationship tools
  if (ontologyContext.metadata?.relationships?.length > 0) {
    enhancedClusters.push('relationship_queries');
  }

  return [...new Set(enhancedClusters)];
};
```

### 6.2 Caching Strategy

Tool definitions don't change often. Cache aggressively:

```typescript
const toolDefinitionCache = new Map<string, ChatToolDefinition[]>();

const loadToolClusters = (clusters: string[]): ChatToolDefinition[] => {
  const cacheKey = clusters.sort().join(',');

  if (toolDefinitionCache.has(cacheKey)) {
    return toolDefinitionCache.get(cacheKey)!;
  }

  const tools = clusters.flatMap(c => TOOL_CLUSTERS[c].tools)
    .map(name => TOOL_DEFINITION_MAP.get(name))
    .filter(Boolean);

  toolDefinitionCache.set(cacheKey, tools);
  return tools;
};
```

### 6.3 Telemetry for Iteration

Track these metrics to refine selection:

```typescript
interface ToolSelectionTelemetry {
  sessionId: string;
  userMessage: string;
  selectedClusters: string[];
  toolsLoaded: string[];
  toolsActuallyUsed: string[];  // From plan execution
  missedTools: string[];         // Tools agent asked for but weren't loaded
  timestamp: Date;
}
```

---

## 7. Conclusion

The static `CONTEXT_TO_TOOL_GROUPS` mapping served well during initial development but doesn't scale with ontology complexity. Moving to **semantic tool routing** (Approach C) provides:

1. **60-70% token reduction** without latency penalty
2. **Clear upgrade path** to LLM-based selection
3. **Minimal architecture disruption**
4. **Foundation for multi-agent patterns** (Approach B)

The key insight is that **most tool selection is predictable from keywords and context**. Reserve expensive LLM reasoning for the genuinely ambiguous cases.

---

## Appendix A: Sample Tool Cluster Definitions

```typescript
// Full cluster definitions for implementation reference
export const TOOL_CLUSTERS: Record<string, ToolClusterConfig> = {
  project_overview: {
    tools: [
      'get_onto_project_details',
      'list_onto_tasks',
      'list_onto_goals',
      'list_onto_plans',
      'list_onto_documents'
    ],
    triggers: [
      'project', 'overview', 'status', 'summary', 'how is',
      'tell me about', 'what\'s the state', 'progress'
    ],
    entities: ['project'],
    description: 'High-level project information and entity lists'
  },

  task_read: {
    tools: [
      'list_onto_tasks',
      'get_onto_task_details',
      'search_onto_tasks',
      'list_task_documents'
    ],
    triggers: [
      'task', 'tasks', 'todo', 'action item', 'what should I',
      'next step', 'pending', 'in progress', 'blocked', 'done'
    ],
    entities: ['task'],
    description: 'Read-only task operations'
  },

  task_write: {
    tools: [
      'create_onto_task',
      'update_onto_task',
      'delete_onto_task',
      'create_task_document'
    ],
    triggers: [
      'create task', 'add task', 'new task', 'update task',
      'mark complete', 'mark done', 'change status', 'delete task'
    ],
    entities: ['task'],
    requiresWrite: true,
    description: 'Task creation, updates, and deletion'
  },

  // ... additional clusters ...
};
```

---

## Appendix B: Migration Checklist

- [ ] Define initial tool clusters based on current tool groups
- [ ] Create IntentClassifier class with rule-based matching
- [ ] Add unit tests for classifier accuracy
- [ ] Integrate into AgentContextService
- [ ] Add feature flag for rollout
- [ ] Set up telemetry tracking
- [ ] Monitor tool miss rate in production
- [ ] Iterate on trigger keywords
- [ ] Document cluster design rationale
- [ ] Consider LLM fallback for low-confidence classifications
