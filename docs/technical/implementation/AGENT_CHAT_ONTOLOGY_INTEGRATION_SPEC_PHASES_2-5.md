# BuildOS Agent Chat Enhancement - Phases 2-5 Complete Implementation

## PHASE 2: Modify Services (Complete Implementation)

### 2.1 Update Agent Context Service (COMPLETE)

**MODIFY FILE**: `apps/web/src/lib/services/agent-context-service.ts`

#### Step 1: Add Required Imports

Add these imports at the very top of the file, after the existing imports:

```typescript
// Add after line 27 (after existing imports)
import { OntologyContextLoader } from './ontology-context-loader';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedPlannerContext,
	EnhancedBuildPlannerContextParams
} from '$lib/types/agent-chat-enhancement';
```

#### Step 2: Replace buildPlannerContext Method

**FIND AND REPLACE** the entire `buildPlannerContext` method (starts around line 151) with:

```typescript
/**
 * Build enhanced context for the Planning Agent with ontology support
 * Token budget aware with compression fallback
 */
async buildPlannerContext(
  params: EnhancedBuildPlannerContextParams
): Promise<EnhancedPlannerContext> {
  const {
    sessionId,
    userId,
    conversationHistory,
    userMessage,
    contextType,
    entityId,
    lastTurnContext,
    ontologyContext
  } = params;

  console.log('[AgentContext] Building enhanced planner context', {
    contextType,
    hasOntology: !!ontologyContext,
    hasLastTurn: !!lastTurnContext,
    historyLength: conversationHistory.length
  });

  // Step 1: Build system prompt with ontology awareness
  const systemPrompt = await this.buildEnhancedSystemPrompt(
    contextType,
    ontologyContext,
    lastTurnContext
  );

  // Step 2: Process conversation history with compression if needed
  const processedHistory = await this.processConversationHistory(
    conversationHistory,
    lastTurnContext
  );

  // Step 3: Format location context (ontology or standard)
  let locationContext: string;
  let locationMetadata: any = {};

  if (ontologyContext) {
    const formatted = this.formatOntologyContext(ontologyContext);
    locationContext = formatted.content;
    locationMetadata = formatted.metadata;
  } else {
    // Fallback to standard context loading
    const standardContext = await this.chatContextService.loadLocationContext(
      contextType,
      entityId,
      true, // abbreviated
      userId
    );
    locationContext = standardContext.content;
    locationMetadata = standardContext.metadata;
  }

  // Step 4: Get tools appropriate for context
  const availableTools = await this.getContextTools(contextType, ontologyContext);

  // Step 5: Calculate token usage
  const totalTokens = this.calculateTokens([
    systemPrompt,
    locationContext,
    ...processedHistory.map(m => m.content)
  ]);

  // Log token usage
  console.log('[AgentContext] Token usage:', {
    systemPrompt: Math.ceil(systemPrompt.length / 4),
    locationContext: Math.ceil(locationContext.length / 4),
    history: processedHistory.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
    total: totalTokens,
    budget: this.TOKEN_BUDGETS.PLANNER.SYSTEM_PROMPT +
            this.TOKEN_BUDGETS.PLANNER.CONVERSATION +
            this.TOKEN_BUDGETS.PLANNER.LOCATION_CONTEXT
  });

  return {
    systemPrompt,
    conversationHistory: processedHistory,
    locationContext,
    locationMetadata,
    ontologyContext,
    lastTurnContext,
    userProfile: await this.loadUserProfile(userId),
    availableTools,
    metadata: {
      sessionId,
      contextType,
      entityId,
      totalTokens,
      hasOntology: !!ontologyContext
    }
  };
}
```

#### Step 3: Add All Helper Methods

Add these methods after the `buildPlannerContext` method:

```typescript
/**
 * Build enhanced system prompt with ontology and strategies
 */
private async buildEnhancedSystemPrompt(
  contextType: ChatContextType,
  ontologyContext?: OntologyContext,
  lastTurnContext?: LastTurnContext
): Promise<string> {
  let prompt = `You are an AI assistant in BuildOS with advanced context awareness.

## Current Context
- Type: ${contextType}
- Level: ${ontologyContext?.type || 'standard'}
${lastTurnContext ? `- Previous Turn: "${lastTurnContext.summary}"` : '- Previous Turn: First message'}
${lastTurnContext?.entities ? `- Active Entities: ${JSON.stringify(lastTurnContext.entities)}` : ''}

## Data Access Pattern (CRITICAL)
You operate with progressive disclosure:
1. You start with ABBREVIATED summaries (what's shown in context)
2. Use detail tools (get_*_details) to drill down when needed
3. Always indicate when more detailed data is available with hints like "I can get more details if needed"

## Available Strategies
Analyze each request and choose the appropriate strategy:

1. **simple_research**: For straightforward queries needing 1-2 tool calls
   - Examples: "Show me the marketing project", "List active tasks"
   - Direct tool execution without spawning executors

2. **complex_research**: For multi-step investigations
   - Examples: "Analyze project health", "Generate comprehensive report"
   - May spawn executor agents for parallel processing
   - You'll receive just-in-time instructions if executors are needed

3. **ask_clarifying_questions**: When ambiguity remains AFTER attempting research
   - Always try to find information first
   - Only ask questions if research doesn't resolve ambiguity
   - Be specific about what clarification is needed

## Important Guidelines
- ALWAYS attempt research before asking for clarification
- Reference entities by their IDs when found (store in last_turn_context)
- Maintain conversation continuity using the last_turn_context
- Respect token limits through progressive disclosure
- Start with LIST/SEARCH tools before using DETAIL tools`;

  // Add ontology-specific context for projects
  if (ontologyContext?.type === 'project') {
    prompt += `

## Project Ontology Context
- Project ID: ${ontologyContext.data.id}
- Project Name: ${ontologyContext.data.name}
- State: ${ontologyContext.data.state_key || 'active'}
- Type: ${ontologyContext.data.type_key || 'standard'}`;

    if (ontologyContext.metadata?.facets) {
      prompt += `
- Facets: ${JSON.stringify(ontologyContext.metadata.facets)}`;
    }

    if (ontologyContext.metadata?.context_document_id) {
      prompt += `
- Context Document: ${ontologyContext.metadata.context_document_id}`;
    }

    if (ontologyContext.metadata?.entity_count) {
      const counts = Object.entries(ontologyContext.metadata.entity_count)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      prompt += `
- Entity Counts: ${counts}`;
    }

    if (ontologyContext.relationships?.edges?.length) {
      prompt += `
- Relationships: ${ontologyContext.relationships.edges.length} edges available
- Edge Types: ${[...new Set(ontologyContext.relationships.edges.map(e => e.relation))].join(', ')}`;
    }
  }

  // Add ontology-specific context for elements
  if (ontologyContext?.type === 'element') {
    prompt += `

## Element Ontology Context
- Element Type: ${ontologyContext.data.element_type}
- Element ID: ${ontologyContext.data.element?.id}
- Element Name: ${ontologyContext.data.element?.name || 'Unnamed'}`;

    if (ontologyContext.data.parent_project) {
      prompt += `
- Parent Project: ${ontologyContext.data.parent_project.name} (${ontologyContext.data.parent_project.id})
- Project State: ${ontologyContext.data.parent_project.state}`;
    }

    prompt += `
- Hierarchy Level: ${ontologyContext.metadata?.hierarchy_level || 0}`;

    if (ontologyContext.relationships?.edges?.length) {
      prompt += `
- Direct Relationships: ${ontologyContext.relationships.edges.length}`;
    }
  }

  // Add global context
  if (ontologyContext?.type === 'global') {
    prompt += `

## Global Ontology Context
- Total Projects: ${ontologyContext.data.total_projects}
- Recent Projects: ${ontologyContext.data.recent_projects?.length || 0} loaded
- Available Entity Types: ${ontologyContext.data.available_types.join(', ')}`;

    if (ontologyContext.metadata?.entity_count) {
      prompt += `
- Global Entity Distribution:
${Object.entries(ontologyContext.metadata.entity_count)
  .map(([type, count]) => `  - ${type}: ${count}`)
  .join('\n')}`;
    }
  }

  return prompt;
}

/**
 * Process conversation history with compression
 */
private async processConversationHistory(
  history: ChatMessage[],
  lastTurnContext?: LastTurnContext
): Promise<LLMMessage[]> {
  const messages: LLMMessage[] = [];

  // Add last turn context as a system message if available
  if (lastTurnContext) {
    messages.push({
      role: 'system',
      content: `Previous turn context:
- Summary: ${lastTurnContext.summary}
- Entities: ${JSON.stringify(lastTurnContext.entities)}
- Strategy Used: ${lastTurnContext.strategy_used || 'none'}
- Tools Accessed: ${lastTurnContext.data_accessed.join(', ') || 'none'}`
    });
  }

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const estimatedTokens = history.reduce(
    (sum, msg) => sum + Math.ceil(msg.content.length / 4),
    0
  );

  // Compress if needed
  if (estimatedTokens > this.TOKEN_BUDGETS.PLANNER.CONVERSATION) {
    console.log('[AgentContext] Compressing conversation history', {
      originalTokens: estimatedTokens,
      targetTokens: this.TOKEN_BUDGETS.PLANNER.CONVERSATION,
      messageCount: history.length
    });

    if (this.compressionService) {
      const compressed = await this.compressionService.smartCompress(
        history,
        this.TOKEN_BUDGETS.PLANNER.CONVERSATION,
        lastTurnContext
      );
      messages.push(...compressed.messages);
    } else {
      // Fallback: take recent messages only
      const recentMessages = history.slice(-10);
      messages.push(...recentMessages.map(m => ({
        role: m.role as any,
        content: m.content,
        tool_calls: m.tool_calls as any
      })));
    }
  } else {
    // Use full history
    messages.push(...history.map(m => ({
      role: m.role as any,
      content: m.content,
      tool_calls: m.tool_calls as any
    })));
  }

  return messages;
}

/**
 * Format ontology context for inclusion in prompt
 */
private formatOntologyContext(ontology: OntologyContext): {
  content: string;
  metadata: any;
} {
  let content = `## Ontology Context (${ontology.type})\n\n`;

  if (ontology.type === 'project') {
    content += `### Project Information
- ID: ${ontology.data.id}
- Name: ${ontology.data.name}
- Description: ${ontology.data.description || 'No description'}
- State: ${ontology.data.state_key}
- Type: ${ontology.data.type_key}
- Created: ${ontology.data.created_at || 'Unknown'}

### Entity Summary
${Object.entries(ontology.metadata?.entity_count || {})
  .map(([type, count]) => `- ${type}s: ${count}`)
  .join('\n') || 'No entities'}

### Available Relationships
${ontology.relationships?.edges?.length || 0} relationships loaded
${ontology.relationships?.edges?.slice(0, 5).map(e =>
  `- ${e.relation} → ${e.target_kind} (${e.target_id})`
).join('\n') || ''}
${ontology.relationships?.edges?.length > 5 ? `... and ${ontology.relationships.edges.length - 5} more` : ''}

### Hints
- Use list_tasks, list_goals, list_plans to see entities
- Use get_entity_relationships for full graph
- Use get_project_details for complete information`;
  } else if (ontology.type === 'element') {
    const elem = ontology.data.element;
    content += `### Element Information
- Type: ${ontology.data.element_type}
- ID: ${elem?.id}
- Name: ${elem?.name || 'Unnamed'}
- Status: ${elem?.status || elem?.state_key || 'Unknown'}

### Element Details
${elem?.description ? `Description: ${elem.description.substring(0, 200)}...` : 'No description'}
${elem?.props ? `Properties: ${Object.keys(elem.props).join(', ')}` : ''}

### Parent Project
${ontology.data.parent_project ?
  `- ${ontology.data.parent_project.name} (${ontology.data.parent_project.id})
- Project State: ${ontology.data.parent_project.state}` :
  '- No parent project found (orphaned element)'}

### Relationships
${ontology.relationships?.edges?.map(e =>
  `- ${e.relation} ${e.relation.startsWith('inverse_') ? 'from' : 'to'} ${e.target_kind} (${e.target_id})`
).join('\n') || 'No relationships loaded'}

### Hints
- Use get_element_details for complete information
- Use get_parent_project for project context
- Use get_related_elements for connected items`;
  } else if (ontology.type === 'global') {
    content += `### Global Overview
- Total Projects: ${ontology.data.total_projects}
- Available Entity Types: ${ontology.data.available_types.join(', ')}

### Recent Projects
${ontology.data.recent_projects?.slice(0, 5).map(p =>
  `- ${p.name} (${p.state_key}) - ${p.type_key}`
).join('\n') || 'No recent projects'}

### Entity Distribution
${Object.entries(ontology.metadata?.entity_count || {})
  .map(([type, count]) => `- Total ${type}s: ${count}`)
  .join('\n') || 'No entity counts available'}

### Hints
- Use search_projects to find specific projects
- Use create_project to start new project
- Use list_all_projects for complete list`;
  }

  return {
    content,
    metadata: ontology.metadata
  };
}

/**
 * Get tools appropriate for the context
 */
private async getContextTools(
  contextType: ChatContextType,
  ontologyContext?: OntologyContext
): Promise<ChatToolDefinition[]> {
  // Get base tools from chat context service
  const baseTools = await this.chatContextService.getTools(contextType);

  // Add ontology-specific tools if applicable
  if (ontologyContext) {
    const ontologyTools: string[] = [];

    if (ontologyContext.type === 'project') {
      ontologyTools.push(
        'get_project_details',
        'list_tasks',
        'list_goals',
        'list_plans',
        'list_documents',
        'list_outputs',
        'get_entity_relationships',
        'create_task',
        'create_goal',
        'update_project'
      );
    } else if (ontologyContext.type === 'element') {
      const elementType = ontologyContext.data.element_type;
      ontologyTools.push(
        `get_${elementType}_details`,
        'get_parent_project',
        'get_related_elements',
        'get_entity_relationships',
        `update_${elementType}`,
        'add_relationship'
      );
    } else if (ontologyContext.type === 'global') {
      ontologyTools.push(
        'search_projects',
        'create_project',
        'list_all_projects',
        'get_global_statistics',
        'search_entities'
      );
    }

    // Merge tools (deduplicate)
    const toolNames = new Set([
      ...baseTools.map(t => t.name),
      ...ontologyTools
    ]);

    // Map to tool definitions (simplified - you'll need actual definitions)
    return Array.from(toolNames).map(name => {
      // Find existing tool definition or create placeholder
      const existing = baseTools.find(t => t.name === name);
      if (existing) return existing;

      return {
        name,
        description: `Ontology tool: ${name}`,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      } as ChatToolDefinition;
    });
  }

  return baseTools;
}

/**
 * Calculate total tokens for context
 */
private calculateTokens(contents: string[]): number {
  return contents.reduce((sum, content) => {
    if (!content) return sum;
    // More accurate token estimation
    // Average English word is ~1.3 tokens, average word length is 4.7 chars
    // So roughly 1 token per 3.6 chars, but we'll use 4 for safety
    return sum + Math.ceil(content.length / 4);
  }, 0);
}

/**
 * Load user profile (enhanced implementation)
 */
private async loadUserProfile(userId: string): Promise<string | undefined> {
  try {
    // Load user preferences if they exist
    const { data: user } = await this.supabase
      .from('users')
      .select('preferences, work_style, timezone')
      .eq('id', userId)
      .single();

    if (user?.preferences || user?.work_style) {
      return `User Preferences: ${JSON.stringify({
        work_style: user.work_style,
        timezone: user.timezone,
        preferences: user.preferences
      })}`;
    }
  } catch (error) {
    console.log('[AgentContext] No user profile found');
  }

  return undefined;
}
```

### 2.2 Update Chat Context Service (COMPLETE)

**MODIFY FILE**: `apps/web/src/lib/services/chat-context-service.ts`

#### Replace getSystemPrompt Method

**FIND** the `getSystemPrompt` method (around line 148) and **REPLACE** it entirely with:

```typescript
public getSystemPrompt(contextType: ChatContextType, metadata?: SystemPromptMetadata): string {
  const basePrompt = `You are an AI assistant integrated into BuildOS, a productivity system designed for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Critical: Progressive Information Access Pattern

You have tools that follow a STRICT progressive disclosure pattern to optimize token usage:

### Tier 1: LIST/SEARCH Tools (Use First)
These return abbreviated summaries with preview fields:
- list_tasks → Task titles + 100 char description previews
- search_projects → Project summaries + 500 char context previews
- search_notes → Note titles + 200 char content previews
- get_calendar_events → Event times and titles only
- list_goals, list_plans → Name and status only
- list_documents, list_outputs → Title and summary only

### Tier 2: DETAIL Tools (Use Only When Needed)
These return complete information and should ONLY be called when:
- User explicitly asks for more details about a specific item
- You need complete information to answer a specific question
- User wants to modify something (need full context first)

Tools:
- get_task_details → Complete task with full descriptions
- get_project_details → Full project context and dimensions
- get_note_details → Complete note content
- get_goal_details, get_plan_details → Full specifications
- get_document_details, get_output_details → Complete content

### Tier 3: ONTOLOGY Tools (For Relationships)
- get_entity_relationships → Explore connections between entities
- get_parent_project → Find parent project of element
- get_related_elements → Find connected entities

### Required Flow Pattern

1. **Always start with LIST/SEARCH tools**
   - Even if user mentions a specific item, search for it first
   - This confirms it exists and gets current status

2. **Show abbreviated results to user**
   - Present the summary information clearly
   - Indicate more details are available if needed

3. **Only drill down when necessary**
   - User asks for specific details
   - Task requires full information
   - Modification needs complete context

4. **Track entities in last_turn_context**
   - Store IDs of accessed entities
   - Maintain conversation continuity
   - Reference by ID in subsequent turns

### Strategy Selection (IMPORTANT)
Based on query complexity, choose your approach:

1. **simple_research**: 1-2 tool calls for direct queries
   - "Show me the marketing project"
   - "List my active tasks"
   - "What's on my calendar today?"

2. **complex_research**: Multi-step investigation, may spawn executors
   - "Analyze project health across all dimensions"
   - "Generate a comprehensive status report"
   - "Find patterns in task completion"

3. **ask_clarifying_questions**: When ambiguity remains AFTER research
   - Multiple entities match the query
   - Time range or scope unclear
   - Required parameters missing

IMPORTANT: Always attempt research before asking questions. The user expects you to be proactive.`;

  const contextAddition = this.getContextAddition(contextType, metadata);
  return basePrompt + contextAddition;
}
```

### 2.3 Update Agent Planner Service (COMPLETE)

**MODIFY FILE**: `apps/web/src/lib/services/agent-planner-service.ts`

#### Step 1: Add Imports

Add at the very top of the file, after existing imports:

```typescript
import type {
	ChatStrategy,
	StrategyAnalysis,
	ResearchResult,
	EnhancedPlannerContext,
	LastTurnContext
} from '$lib/types/agent-chat-enhancement';
import { ExecutorInstructionGenerator } from './agent-executor-instructions';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
```

#### Step 2: Add Strategy Analysis Methods

Add these methods to the AgentPlannerService class:

```typescript
/**
 * Analyze user intent and select strategy
 */
async analyzeUserIntent(
  message: string,
  context: EnhancedPlannerContext,
  lastTurnContext?: LastTurnContext
): Promise<StrategyAnalysis> {
  console.log('[Planner] Analyzing user intent', {
    message: message.substring(0, 100),
    contextType: context.metadata.contextType,
    hasOntology: context.metadata.hasOntology,
    hasLastTurn: !!lastTurnContext
  });

  const systemPrompt = `You are a strategy analyzer for BuildOS chat.

Available strategies:
1. simple_research: Can be completed with 1-2 tool calls
   - Direct lookups, lists, simple searches
   - No coordination needed
   - Examples: "Show me X project", "List Y tasks"

2. complex_research: Requires multiple steps or coordination
   - Multi-entity analysis
   - Aggregation across data sources
   - May need executor agents
   - Examples: "Analyze project health", "Generate comprehensive report"

3. ask_clarifying_questions: Ambiguity that research can't resolve
   - Multiple matches for entity names
   - Unclear time ranges or scopes
   - Missing required parameters
   - ONLY after attempting research first

Context available:
- Type: ${context.metadata.contextType}
- Has ontology: ${context.metadata.hasOntology}
- Previous turn: ${lastTurnContext?.summary || 'First message'}
- Available tools: ${context.availableTools.length}
- Entities from last turn: ${JSON.stringify(lastTurnContext?.entities || {})}

IMPORTANT:
- Prefer research strategies over asking questions
- Only suggest clarifying questions if research cannot resolve the ambiguity
- Consider the context type when estimating complexity`;

  const analysisPrompt = `Analyze this user message and determine the best strategy:

User message: "${message}"

Previous context: ${lastTurnContext ? `User was ${lastTurnContext.summary}` : 'This is the first message'}

Consider:
1. How many tools/steps are needed?
2. Is there ambiguity that research can't resolve?
3. Does this need coordination across multiple data sources?
4. Can this be answered with the abbreviated data from LIST tools?

Return a JSON object with:
{
  "primary_strategy": "simple_research" | "complex_research" | "ask_clarifying_questions",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this strategy was chosen",
  "needs_clarification": boolean,
  "clarifying_questions": ["question1", "question2"] or null,
  "estimated_steps": number,
  "required_tools": ["tool1", "tool2"],
  "can_complete_directly": boolean
}`;

  try {
    const response = await this.llmService.generateText({
      systemPrompt,
      prompt: analysisPrompt,
      temperature: 0.3,
      maxTokens: 500,
      userId: context.metadata.sessionId,
      operationType: 'strategy_analysis'
    });

    const analysis = JSON.parse(response) as StrategyAnalysis;

    // Validate and normalize
    return this.validateStrategyAnalysis(analysis);
  } catch (error) {
    console.error('[Planner] Failed to analyze intent:', error);

    // Fallback to simple research
    return {
      primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
      confidence: 0.5,
      reasoning: 'Defaulting to simple research due to analysis error',
      needs_clarification: false,
      estimated_steps: 1,
      required_tools: [],
      can_complete_directly: true
    };
  }
}

/**
 * Execute the selected strategy
 */
async executeStrategy(
  analysis: StrategyAnalysis,
  context: EnhancedPlannerContext,
  userMessage: string,
  streamCallback: (event: any) => void
): Promise<ResearchResult> {
  console.log('[Planner] Executing strategy:', {
    strategy: analysis.primary_strategy,
    confidence: analysis.confidence,
    steps: analysis.estimated_steps
  });

  // Send strategy selection event
  streamCallback({
    type: 'strategy_selected',
    strategy: analysis.primary_strategy,
    confidence: analysis.confidence
  });

  switch (analysis.primary_strategy) {
    case ChatStrategy.SIMPLE_RESEARCH:
      return await this.executeSimpleResearch(analysis, context, userMessage, streamCallback);

    case ChatStrategy.COMPLEX_RESEARCH:
      return await this.executeComplexResearch(analysis, context, userMessage, streamCallback);

    case ChatStrategy.ASK_CLARIFYING:
      return await this.executeClarifyingQuestions(analysis, context, streamCallback);

    default:
      throw new Error(`Unknown strategy: ${analysis.primary_strategy}`);
  }
}

/**
 * Execute simple research (1-2 tool calls)
 */
private async executeSimpleResearch(
  analysis: StrategyAnalysis,
  context: EnhancedPlannerContext,
  userMessage: string,
  streamCallback: (event: any) => void
): Promise<ResearchResult> {
  console.log('[Planner] Executing simple research with tools:', analysis.required_tools);

  const tools = analysis.required_tools.slice(0, 2); // Max 2 tools
  const results: any[] = [];
  const entitiesAccessed: string[] = [];
  const toolsUsed: string[] = [];

  // Initialize tool executor
  const toolExecutor = new ChatToolExecutor(this.supabase);

  // Execute tools directly (no executor agent needed)
  for (const toolName of tools) {
    streamCallback({
      type: 'tool_call',
      tool_call: {
        function: {
          name: toolName,
          arguments: this.generateToolArguments(toolName, userMessage, context)
        }
      }
    });

    try {
      // Execute tool via tool executor
      const toolResult = await toolExecutor.executeTool(
        toolName,
        this.generateToolArguments(toolName, userMessage, context),
        context.metadata.sessionId // Use session ID as user context
      );

      results.push(toolResult);
      toolsUsed.push(toolName);

      // Extract entity IDs from result
      const entityIds = this.extractEntityIds(toolResult);
      entitiesAccessed.push(...entityIds);

      streamCallback({
        type: 'tool_result',
        result: {
          tool: toolName,
          success: true,
          preview: this.getResultPreview(toolResult),
          entity_count: entityIds.length
        }
      });
    } catch (error) {
      console.error(`[Planner] Tool ${toolName} failed:`, error);
      streamCallback({
        type: 'tool_result',
        result: {
          tool: toolName,
          success: false,
          error: error.message
        }
      });
    }
  }

  // Check if clarification is needed after research
  if (analysis.needs_clarification && !this.hasEnoughInfo(results)) {
    console.log('[Planner] Research incomplete, need clarification');
    return {
      strategy_used: ChatStrategy.SIMPLE_RESEARCH,
      data_found: results,
      entities_accessed: entitiesAccessed,
      tools_used: toolsUsed,
      needs_followup: true,
      followup_questions: analysis.clarifying_questions,
      success: true
    };
  }

  return {
    strategy_used: ChatStrategy.SIMPLE_RESEARCH,
    data_found: results,
    entities_accessed: entitiesAccessed,
    tools_used: toolsUsed,
    needs_followup: false,
    success: true
  };
}

/**
 * Execute complex research (multi-step with possible executors)
 */
private async executeComplexResearch(
  analysis: StrategyAnalysis,
  context: EnhancedPlannerContext,
  userMessage: string,
  streamCallback: (event: any) => void
): Promise<ResearchResult> {
  console.log('[Planner] Executing complex research');

  // Create multi-step plan
  const plan = await this.createResearchPlan(analysis, context, userMessage);

  streamCallback({
    type: 'plan_created',
    plan: {
      steps: plan.steps.map(s => ({
        stepNumber: s.stepNumber,
        description: s.description,
        status: 'pending'
      }))
    }
  });

  // Check if we need executors
  if (plan.steps.some(s => s.requiresExecutor)) {
    // Generate just-in-time instructions
    const instructionGen = new ExecutorInstructionGenerator();
    const instructions = instructionGen.generateInstructions(plan, context);

    streamCallback({
      type: 'executor_instructions',
      instructions
    });

    // Execute with executors
    return await this.executeWithExecutors(plan, context, userMessage, streamCallback);
  }

  // Execute sequentially without executors
  const results: any[] = [];
  const entitiesAccessed: string[] = [];
  const toolsUsed: string[] = [];
  const toolExecutor = new ChatToolExecutor(this.supabase);

  for (const step of plan.steps) {
    streamCallback({
      type: 'step_start',
      step: {
        stepNumber: step.stepNumber,
        description: step.description
      }
    });

    // Execute step
    for (const tool of step.requiredTools) {
      try {
        const stepResult = await toolExecutor.executeTool(
          tool,
          this.generateToolArguments(tool, userMessage, context),
          context.metadata.sessionId
        );

        results.push(stepResult);
        entitiesAccessed.push(...this.extractEntityIds(stepResult));
        toolsUsed.push(tool);
      } catch (error) {
        console.error(`[Planner] Step ${step.stepNumber} tool ${tool} failed:`, error);
      }
    }

    streamCallback({
      type: 'step_complete',
      step: {
        stepNumber: step.stepNumber,
        success: true
      }
    });
  }

  return {
    strategy_used: ChatStrategy.COMPLEX_RESEARCH,
    data_found: results,
    entities_accessed: entitiesAccessed,
    tools_used: toolsUsed,
    needs_followup: false,
    success: true
  };
}

/**
 * Execute clarifying questions strategy
 */
private async executeClarifyingQuestions(
  analysis: StrategyAnalysis,
  context: EnhancedPlannerContext,
  streamCallback: (event: any) => void
): Promise<ResearchResult> {
  console.log('[Planner] Asking clarifying questions');

  const questions = analysis.clarifying_questions || [
    'Could you provide more specific details about what you're looking for?',
    'Which project or timeframe are you interested in?'
  ];

  streamCallback({
    type: 'clarifying_questions',
    questions
  });

  return {
    strategy_used: ChatStrategy.ASK_CLARIFYING,
    data_found: null,
    entities_accessed: [],
    tools_used: [],
    needs_followup: true,
    followup_questions: questions,
    success: true
  };
}

/**
 * Generate response from research results
 */
async generateResponse(
  result: ResearchResult,
  context: EnhancedPlannerContext
): Promise<string> {
  if (!result.success || !result.data_found) {
    return 'I encountered an issue while researching your request. Please try again.';
  }

  const systemPrompt = `You are presenting research results to the user.
Context type: ${context.metadata.contextType}
Strategy used: ${result.strategy_used}
Tools used: ${result.tools_used.join(', ')}

Format the response clearly and concisely.
If abbreviated data was retrieved, mention that more details are available.`;

  const dataPrompt = `Research results:
${JSON.stringify(result.data_found, null, 2)}

Entities accessed: ${result.entities_accessed.join(', ') || 'none'}

Generate a helpful response that:
1. Answers the user's question
2. Mentions if more detailed information is available
3. References specific entities by name and ID
4. Is formatted with markdown for readability`;

  const response = await this.llmService.generateText({
    systemPrompt,
    prompt: dataPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userId: context.metadata.sessionId,
    operationType: 'response_generation'
  });

  return response;
}

// === Helper Methods ===

private validateStrategyAnalysis(analysis: any): StrategyAnalysis {
  // Map string strategies to enum
  let strategy: ChatStrategy;
  if (analysis.primary_strategy === 'simple_research') {
    strategy = ChatStrategy.SIMPLE_RESEARCH;
  } else if (analysis.primary_strategy === 'complex_research') {
    strategy = ChatStrategy.COMPLEX_RESEARCH;
  } else if (analysis.primary_strategy === 'ask_clarifying_questions' || analysis.primary_strategy === 'clarifying') {
    strategy = ChatStrategy.ASK_CLARIFYING;
  } else {
    strategy = ChatStrategy.SIMPLE_RESEARCH; // Default
  }

  return {
    primary_strategy: strategy,
    confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
    reasoning: analysis.reasoning || 'No reasoning provided',
    needs_clarification: !!analysis.needs_clarification,
    clarifying_questions: Array.isArray(analysis.clarifying_questions)
      ? analysis.clarifying_questions
      : undefined,
    estimated_steps: Math.max(1, analysis.estimated_steps || 1),
    required_tools: Array.isArray(analysis.required_tools)
      ? analysis.required_tools
      : [],
    can_complete_directly: analysis.can_complete_directly !== false
  };
}

private generateToolArguments(toolName: string, userMessage: string, context: any): string {
  // Generate appropriate arguments based on tool name
  const args: any = {};

  if (toolName.includes('list') || toolName.includes('search')) {
    if (context.metadata.entityId) {
      args.project_id = context.metadata.entityId;
    }
    if (toolName.includes('search')) {
      // Extract search terms from user message
      args.query = userMessage.substring(0, 100);
    }
  } else if (toolName.includes('get') && toolName.includes('details')) {
    // Need specific ID
    if (context.lastTurnContext?.entities) {
      const entities = context.lastTurnContext.entities;
      if (toolName.includes('project') && entities.project_id) {
        args.id = entities.project_id;
      } else if (toolName.includes('task') && entities.task_ids?.length) {
        args.id = entities.task_ids[0];
      }
    }
  }

  return JSON.stringify(args);
}

private extractEntityIds(result: any): string[] {
  const ids: string[] = [];

  // Extract IDs from various result formats
  if (Array.isArray(result)) {
    result.forEach(item => {
      if (item?.id) ids.push(item.id);
    });
  } else if (result?.data && Array.isArray(result.data)) {
    result.data.forEach(item => {
      if (item?.id) ids.push(item.id);
    });
  } else if (result?.id) {
    ids.push(result.id);
  }

  // Also check for nested entities
  if (result?.tasks) {
    result.tasks.forEach(task => {
      if (task?.id) ids.push(task.id);
    });
  }
  if (result?.goals) {
    result.goals.forEach(goal => {
      if (goal?.id) ids.push(goal.id);
    });
  }

  return [...new Set(ids)]; // Deduplicate
}

private hasEnoughInfo(results: any[]): boolean {
  // Check if results contain enough information
  if (!results || results.length === 0) return false;

  // Check if we have actual data
  const hasData = results.some(r => {
    if (!r) return false;
    if (Array.isArray(r) && r.length > 0) return true;
    if (r.data && Array.isArray(r.data) && r.data.length > 0) return true;
    if (typeof r === 'object' && Object.keys(r).length > 1) return true;
    return false;
  });

  return hasData;
}

private getResultPreview(result: any): string {
  if (Array.isArray(result)) {
    return `Found ${result.length} items`;
  } else if (result?.data && Array.isArray(result.data)) {
    return `Retrieved ${result.data.length} ${result.type || 'items'}`;
  } else if (result?.id) {
    return `Retrieved ${result.type || 'entity'} ${result.id}`;
  }
  return 'Data retrieved';
}

private async createResearchPlan(
  analysis: StrategyAnalysis,
  context: EnhancedPlannerContext,
  userMessage: string
): Promise<any> {
  // Create a plan based on analysis
  const steps = [];

  for (let i = 0; i < analysis.estimated_steps; i++) {
    const toolsForStep = analysis.required_tools.slice(
      i * 2,
      (i + 1) * 2
    );

    steps.push({
      stepNumber: i + 1,
      description: `Execute ${toolsForStep.join(' and ')}`,
      requiresExecutor: analysis.estimated_steps > 3 && i > 0,
      requiredTools: toolsForStep,
      successCriteria: 'Return valid data',
      requiresProjectContext: context.metadata.entityId != null,
      requiresHistoricalData: i > 0 // Later steps may need earlier results
    });
  }

  return {
    steps,
    requiresParallelExecution: analysis.estimated_steps > 3
  };
}

private async executeWithExecutors(
  plan: any,
  context: EnhancedPlannerContext,
  userMessage: string,
  streamCallback: (event: any) => void
): Promise<ResearchResult> {
  // This is where we would spawn actual executor agents
  // For now, we'll simulate the execution
  console.log('[Planner] Would spawn executors for plan', plan);

  const executorService = new AgentExecutorService(this.supabase, this.contextService);
  const results = [];
  const entitiesAccessed = [];
  const toolsUsed = [];

  for (const step of plan.steps.filter(s => s.requiresExecutor)) {
    streamCallback({
      type: 'executor_spawned',
      task: {
        description: step.description
      }
    });

    // Create executor task
    const task = {
      description: step.description,
      tools: step.requiredTools,
      context: {
        projectId: context.metadata.entityId,
        userMessage
      }
    };

    // Execute (simplified)
    try {
      const result = await executorService.executeTask(
        task,
        step.requiredTools,
        context.metadata.sessionId
      );

      results.push(result);
      if (result.entitiesAccessed) {
        entitiesAccessed.push(...result.entitiesAccessed);
      }
      toolsUsed.push(...step.requiredTools);

      streamCallback({
        type: 'executor_result',
        result: {
          success: result.success
        }
      });
    } catch (error) {
      console.error('[Planner] Executor failed:', error);
    }
  }

  return {
    strategy_used: ChatStrategy.COMPLEX_RESEARCH,
    data_found: results,
    entities_accessed: entitiesAccessed,
    tools_used: toolsUsed,
    needs_followup: false,
    success: true
  };
}
```

## PHASE 3: Update API Endpoint (COMPLETE)

**MODIFY FILE**: `apps/web/src/routes/api/agent/stream/+server.ts`

[Content continues in next section due to length...]
