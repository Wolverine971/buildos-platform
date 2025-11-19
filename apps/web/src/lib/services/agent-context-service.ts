// apps/web/src/lib/services/agent-context-service.ts
/**
 * Agent Context Service - Context Assembly for Multi-Agent System
 *
 * This service builds minimal, role-specific contexts for different agent types.
 * Core principle: Each agent gets ONLY what it needs to minimize token usage.
 *
 * Token Budget Strategy:
 * - Planner Agent: 3000-5000 tokens (needs full picture: conversation, tools, location)
 * - Executor Agent: 1000-1500 tokens (minimal: specific task, relevant tools, scoped data)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	AgentPermission,
	SystemPromptMetadata,
	LocationContext
} from '@buildos/shared-types';
import {
	CHAT_TOOLS,
	getToolsForContextType
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { getToolsForAgent } from '@buildos/shared-types';
import { ChatCompressionService } from './chat-compression-service';
import { ChatContextService } from './chat-context-service';
import { generateProjectContextFramework } from './prompts/core/prompt-components';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedPlannerContext,
	EnhancedBuildPlannerContextParams,
	ProjectFocus,
	OntologyEntityType,
	OntologyContextScope
} from '$lib/types/agent-chat-enhancement';
import { getAvailableTemplates } from './ontology/template-resolver.service';

const PROJECT_CONTEXT_DOC_GUIDANCE = generateProjectContextFramework('condensed');

// ============================================
// TYPES
// ============================================

/**
 * Context for the Planning Agent
 * Full context with conversation history and all available tools
 */
export interface PlannerContext {
	systemPrompt: string; // Instructions for planning and orchestration
	conversationHistory: LLMMessage[]; // Last N messages (compressed if needed)
	locationContext: string; // Current project/task/calendar context (abbreviated)
	locationMetadata?: LocationContext['metadata'];
	userProfile?: string; // User preferences and work style
	availableTools: ChatToolDefinition[]; // All tools the planner can use or delegate
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
		hasOntology: boolean;
		plannerAgentId?: string;
		focus?: ProjectFocus | null;
		scope?: OntologyContextScope;
	};
}

/**
 * Executor Task Definition
 * Specific, focused task for an executor agent to complete
 */
export interface ExecutorTask {
	id: string; // Unique task ID
	description: string; // "Find the marketing project and get its details"
	goal: string; // "Return project_id, name, and task count"
	constraints?: string[]; // ["Only active tasks", "Limit to 10 results"]
	contextData?: any; // Minimal relevant data (e.g., project_id if known)
}

/**
 * Context for an Executor Agent
 * Minimal, task-focused context with specific tools only
 */
export interface ExecutorContext {
	systemPrompt: string; // Task-specific instructions
	task: ExecutorTask; // The specific task to execute
	tools: ChatToolDefinition[]; // Subset of tools needed for this task
	relevantData?: any; // Only the data needed for this specific task
	metadata: {
		executorId: string;
		sessionId: string;
		planId?: string;
		totalTokens: number;
	};
}

/**
 * Build parameters for planner context
 */
export interface BuildPlannerContextParams {
	sessionId: string;
	userId: string;
	conversationHistory: ChatMessage[]; // Recent messages from DB
	userMessage: string; // Current user message
	contextType: ChatContextType;
	entityId?: string;
}

/**
 * Build parameters for executor context
 */
export interface BuildExecutorContextParams {
	executorId: string;
	sessionId: string;
	userId: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	planId?: string;
	contextType?: ChatContextType;
	entityId?: string;
}

// ============================================
// SERVICE
// ============================================

export class AgentContextService {
	// Token allocation for different agent types
	private readonly TOKEN_BUDGETS = {
		PLANNER: {
			SYSTEM_PROMPT: 800, // Planning instructions + tool descriptions
			CONVERSATION: 2500, // Recent conversation history
			LOCATION_CONTEXT: 1000, // Current project/task context
			USER_PROFILE: 300, // User preferences
			BUFFER: 400 // Safety margin
			// Total: ~5000 tokens
		},
		EXECUTOR: {
			SYSTEM_PROMPT: 300, // Task-specific instructions
			TASK_DESCRIPTION: 200, // Task + goal + constraints
			TOOLS: 400, // Tool definitions (subset)
			CONTEXT_DATA: 400, // Minimal relevant data
			BUFFER: 200 // Safety margin
			// Total: ~1500 tokens
		}
	};

	private compressionService?: ChatCompressionService;
	private chatContextService: ChatContextService;

	constructor(
		private supabase: SupabaseClient<Database>,
		compressionService?: ChatCompressionService
	) {
		this.compressionService = compressionService;
		this.chatContextService = new ChatContextService(supabase);
	}

	// ============================================
	// PLANNER CONTEXT BUILDING
	// ============================================

	/**
	 * Build enhanced context for the Planning Agent with ontology support
	 * Token budget aware with compression fallback
	 */
	async buildPlannerContext(
		params: EnhancedBuildPlannerContextParams | BuildPlannerContextParams
	): Promise<EnhancedPlannerContext | PlannerContext> {
		const { sessionId, userId, conversationHistory, userMessage, contextType, entityId } =
			params;
		const normalizedContext = this.normalizeContextType(contextType);

		// Check if we have enhanced params with ontology
		const lastTurnContext = 'lastTurnContext' in params ? params.lastTurnContext : undefined;
		const ontologyContext = 'ontologyContext' in params ? params.ontologyContext : undefined;
		const projectFocus = 'projectFocus' in params ? (params.projectFocus ?? null) : null;

		console.log('[AgentContext] Building enhanced planner context', {
			contextType,
			hasOntology: !!ontologyContext,
			hasLastTurn: !!lastTurnContext,
			historyLength: conversationHistory.length,
			hasFocus: !!projectFocus
		});

		// Step 1: Build system prompt with ontology awareness
		const systemPrompt = await this.buildEnhancedSystemPrompt(
			normalizedContext,
			ontologyContext,
			lastTurnContext,
			entityId
		);

		// Step 2: Process conversation history with compression if needed
		const processedHistory = await this.processConversationHistory(conversationHistory, {
			lastTurnContext,
			sessionId,
			contextType: normalizedContext,
			userId
		});

		// Step 3: Format location context (priority order: project_create → ontology → standard)
		let locationContext: string;
		let locationMetadata: any = {};

		if (contextType === 'project_create') {
			// Project creation path: Load template catalog from database
			// This provides the agent with available project templates to choose from
			const templateOverview = await this.loadTemplateOverview();
			locationContext = templateOverview.content;
			locationMetadata = templateOverview.metadata;
			console.log('[AgentContext] Using template overview for project_create', {
				template_count: locationMetadata.template_count
			});
		} else if (ontologyContext?.type === 'combined' && projectFocus) {
			const formatted = this.formatCombinedContext(ontologyContext, projectFocus);
			locationContext = formatted.content;
			locationMetadata = formatted.metadata;
			console.log('[AgentContext] Using combined focus context', {
				focusType: projectFocus.focusType,
				entityId: projectFocus.focusEntityId
			});
		} else if (ontologyContext) {
			// Ontology path: Format pre-loaded ontology context
			// Used when entity-specific or project-specific context is available
			const formatted = this.formatOntologyContext(ontologyContext);
			locationContext = formatted.content;
			locationMetadata = formatted.metadata;
			console.log('[AgentContext] Using ontology context', {
				type: ontologyContext.type
			});
		} else {
			// Standard path: Load context using legacy chat context service
			// Fallback for contexts without ontology support
			const standardContext = await this.chatContextService.loadLocationContext(
				normalizedContext,
				entityId,
				true, // abbreviated
				userId
			);
			locationContext = standardContext.content;
			locationMetadata = standardContext.metadata;
			console.log('[AgentContext] Using standard context', {
				contextType
			});
		}

		// Step 4: Get tools appropriate for context
		const rawTools = await this.getContextTools(normalizedContext, ontologyContext);
		const availableTools = this.filterToolsForFocus(rawTools, projectFocus);

		// Step 5: Calculate token usage
		const totalTokens = this.calculateTokens([
			systemPrompt,
			locationContext,
			...processedHistory.map((m) => m.content)
		]);

		// Log token usage
		console.log('[AgentContext] Token usage:', {
			systemPrompt: Math.ceil(systemPrompt.length / 4),
			locationContext: Math.ceil(locationContext.length / 4),
			history: processedHistory.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
			total: totalTokens,
			budget:
				this.TOKEN_BUDGETS.PLANNER.SYSTEM_PROMPT +
				this.TOKEN_BUDGETS.PLANNER.CONVERSATION +
				this.TOKEN_BUDGETS.PLANNER.LOCATION_CONTEXT
		});

		// Load user profile
		const userProfileData = await this.loadUserProfile(userId);
		const userProfileStr = userProfileData?.summary;
		const contextScope =
			ontologyContext?.scope ?? (entityId ? { projectId: entityId } : undefined);

		return {
			systemPrompt,
			conversationHistory: processedHistory,
			locationContext,
			locationMetadata,
			ontologyContext,
			lastTurnContext,
			userProfile: userProfileStr,
			availableTools,
			metadata: {
				sessionId,
				contextType: normalizedContext,
				entityId,
				totalTokens,
				hasOntology: !!ontologyContext,
				focus: projectFocus ?? null,
				scope: contextScope
			}
		};
	}

	/**
	 * Build enhanced system prompt with ontology and strategies
	 */
	private async buildEnhancedSystemPrompt(
		contextType: ChatContextType,
		ontologyContext?: OntologyContext,
		lastTurnContext?: LastTurnContext,
		entityId?: string
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

1. **planner_stream**: Default autonomous planner loop
   - Handles quick lookups *and* multi-step investigations inside a single session
   - Call the \`agent_create_plan\` meta tool when you need structured execution or executor fan-out
   - Examples: "Analyze project health", "List active tasks and flag blockers"

2. **project_creation**: Only when the user is starting a new project (context_type === project_create)
   - Select a template (or escalate for template creation), gather missing details, and call \`create_onto_project\`
   - Populate the context document so the new project has a narrative summary

3. **ask_clarifying_questions**: When ambiguity remains AFTER attempting research
   - Try to resolve confusion with tools first
   - Only ask questions if research doesn't resolve ambiguity, and be specific about what you need

## Important Guidelines
- ALWAYS attempt research before asking for clarification
- Reference entities by their IDs when found (store in last_turn_context)
- Maintain conversation continuity using the last_turn_context
- Respect token limits through progressive disclosure
- Start with LIST/SEARCH tools before using DETAIL tools`;

		// Special handling for project context workspace
		if (contextType === 'project' || ontologyContext?.type === 'project') {
			const projectName =
				ontologyContext?.entities.project?.name ??
				ontologyContext?.scope?.projectName ??
				'current project';
			const projectIdentifier =
				ontologyContext?.entities.project?.id ||
				ontologyContext?.scope?.projectId ||
				entityId ||
				'not provided';
			prompt += `

## Project Workspace Operating Guide
- You are fully scoped to Project **${projectName}** (ID: ${projectIdentifier}).
- Treat this chat as the user's dedicated project workspace: they may ask for summaries, risks, decisions, or request concrete changes.
- Default workflow:
  1. Identify whether the request is informational (answer with existing data) or operational (requires write tools).
  2. Start with ontology list/detail tools (e.g., list_onto_projects, list_onto_tasks, get_onto_project_details, get_onto_task_details) to ground your answer before suggesting edits.
  3. If the user clearly asks to change data, call the corresponding create/update tool and describe the result.
  4. Proactively surface related insights (risks, blockers, next steps) when helpful—even if the user asked a simple question.
- Always mention when additional detail is available via tools and ask if you'd like to dive deeper before modifying data.`;
		}

		// Special handling for project_create context
		if (contextType === 'project_create') {
			prompt += `

## PROJECT CREATION CONTEXT

You are helping the user create a new ontology project. Available project templates are provided in the LOCATION CONTEXT below.

### Your Task: Create a project in ONE interaction

Review the templates below, select the best match, infer project details, and immediately call create_onto_project. Do NOT stop to ask for confirmation unless CRITICAL information is completely missing.

### Tool Usage Guide
- **list_onto_templates**: ONLY if you cannot find a suitable template in the context. Call ONCE with specific parameters.
- **get_field_info**: Use ONLY if you need to check valid field values. Call with entity_type="ontology_project", entity_type="ontology_task", entity_type="ontology_goal", entity_type="ontology_plan", or entity_type="ontology_template" as needed.
- **create_onto_project**: Your primary tool - call this to create the project after selecting template and inferring details.
- **request_template_creation**: When NO template fits (after one clarification), escalate with the full braindump + realm + hints so the template-creation service can generate one. Use once per request.

### Workflow:

**Step 1: Select Template**
- Review templates in the LOCATION CONTEXT below (organized by realm)
- Match user's request to the most appropriate template
- ONLY if you cannot find ANY suitable template in the overview AND you have specific search criteria, call list_onto_templates() ONCE with specific parameters
- After calling list_onto_templates(), DO NOT call it again - proceed immediately to Step 2
- Extract the type_key (e.g., "writer.book") from the best matching template

**Step 2: Infer All Project Details**
From the user's message and selected template, infer as much as possible:
- **name**: Extract clear project name (e.g., "book project" → "Book Writing Project")
- **description**: Expand on what user said (1-2 sentences)
- **type_key**: From the template you selected
- **facets** (use template defaults if not mentioned):
  - context: personal (default), client, commercial, internal
  - scale: micro, small, medium, large, epic
  - stage: discovery (default), planning, execution, review, complete
- **start_at**: Current date/time: ${new Date().toISOString()}
- **end_at**: Only if deadline is explicitly mentioned
- **goals**: Create 1-3 relevant goals if user mentions objectives
- **tasks**: Add initial tasks if user mentions specific actions
- **outputs**: Include if user mentions deliverables

**Step 3: Create Project Immediately**
After selecting template and inferring details, call create_onto_project RIGHT AWAY with all information.

**Step 4: Escalate if No Template Exists**
- If you truly cannot locate a template (even after ONE thoughtful clarification), call request_template_creation with:
  - Full braindump and your realm suggestion
  - Deliverable/facet hints and what was missing
- After escalation, wait for the template creation response and then immediately proceed with create_onto_project using the returned type_key.

ONLY ask clarifying questions if:
- User says "create a project" with absolutely NO context about what kind
- Critical decision affects the entire project structure

Do NOT ask if:
- You can infer project type from keywords ("book" = writing, "app" = developer)
- Missing non-critical details (use template defaults)
- User provided enough context to make a reasonable choice

### Example Workflow

User: "Create a book writing project"

Response: "I'll create a book writing project for you."

Then IMMEDIATELY:
1. Select template: "writer.book" from context
2. Infer details:
   - name: "Book Writing Project"
   - description: "A writing project focused on creating a book"
   - type_key: "writer.book"
   - facets: { context: "personal", scale: "large", stage: "discovery" }
   - start_at: "${new Date().toISOString()}"
3. Call create_onto_project({
     project: {
       name: "Book Writing Project",
       description: "A writing project focused on creating a book",
       type_key: "writer.book",
       props: { facets: { context: "personal", scale: "large", stage: "discovery" } },
       start_at: "${new Date().toISOString()}"
     },
     goals: [
       { name: "Complete first draft", description: "Write the complete first draft of the book" },
       { name: "Publish book", description: "Finalize and publish the completed book" }
     ]
   })
4. After creation, tell user: "Created your book writing project with 2 goals. You can start adding tasks and content now."

CRITICAL INSTRUCTIONS:
- Templates are in the context below - review them first
- NEVER call list_onto_templates() more than ONCE - if you've already called it, proceed with what you have
- After selecting template or getting list_onto_templates results, IMMEDIATELY call create_onto_project
- Do NOT stop after reviewing templates - continue to creation
- Do NOT ask for confirmation unless critical info is missing
- Be decisive and proactive
- IMPORTANT: Do not get stuck searching for templates - make a decision and create the project

### Context Document Requirements (MANDATORY)
${PROJECT_CONTEXT_DOC_GUIDANCE}

Use this guidance to write the \`context_document.body_markdown\` when calling \`create_onto_project\`. This document is the canonical strategic brief for the project, so weave the user's braindump into that structure before submitting the tool call.`;
		}

		if (lastTurnContext) {
			const entityHighlights = this.formatLastTurnEntities(lastTurnContext.entities);
			prompt += `

## Last Turn Highlights
- Summary: ${lastTurnContext.summary}
- Strategy Used: ${lastTurnContext.strategy_used || 'not recorded'}
- Data Accessed: ${lastTurnContext.data_accessed.length > 0 ? lastTurnContext.data_accessed.join(', ') : 'none'}
${entityHighlights.length > 0 ? entityHighlights.map((line) => `- ${line}`).join('\n') : '- No entities tracked last turn'}
- Continue the conversation by referencing these entities when relevant (e.g., pick up the last touched task before moving on).`;
		}

		// Add ontology-specific context for projects
		if (ontologyContext?.type === 'project') {
			const project = ontologyContext.entities.project;
			prompt += `

## Project Ontology Context
- Project ID: ${project?.id ?? 'unknown'}
- Project Name: ${project?.name ?? 'Unnamed project'}
- State: ${project?.state_key || 'active'}
- Type: ${project?.type_key || 'standard'}`;

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

			if (
				ontologyContext.relationships?.edges &&
				ontologyContext.relationships.edges.length > 0
			) {
				prompt += `
- Relationships: ${ontologyContext.relationships.edges.length} edges available
- Edge Types: ${[...new Set(ontologyContext.relationships.edges.map((e) => e.relation))].join(', ')}`;
			}
		}

		// Add ontology-specific context for elements
		if (ontologyContext?.type === 'element') {
			const elementType =
				ontologyContext.scope?.focus?.type ?? this.detectElementType(ontologyContext);
			const element = this.getScopedEntity(ontologyContext, elementType);
			const parentProject = ontologyContext.entities.project;

			prompt += `

## Element Ontology Context
- Element Type: ${elementType || 'element'}
- Element ID: ${element?.id ?? 'unknown'}
- Element Name: ${this.getEntityName(element)}`;

			if (parentProject) {
				prompt += `
- Parent Project: ${parentProject.name} (${parentProject.id})
- Project State: ${parentProject.state_key ?? 'unknown'}`;
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
			const totalProjects =
				ontologyContext.metadata?.total_projects ??
				ontologyContext.entities.projects?.length ??
				0;
			const recent = ontologyContext.entities.projects ?? [];
			const entityTypes = ontologyContext.metadata?.available_entity_types ?? [];

			prompt += `

## Global Ontology Context
- Total Projects: ${totalProjects}
- Recent Projects: ${recent.length} loaded
- Available Entity Types: ${entityTypes.join(', ') || 'project'}`;

			if (recent.length > 0) {
				prompt += `
- Recent Projects:
${recent
	.map((project) => `  - ${project.name} (${project.state_key}) · ${project.type_key}`)
	.slice(0, 5)
	.join('\n')}`;
			}

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
		options: {
			lastTurnContext?: LastTurnContext;
			sessionId?: string;
			contextType?: ChatContextType;
			userId?: string;
		} = {}
	): Promise<LLMMessage[]> {
		const { lastTurnContext, sessionId, contextType, userId } = options;
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
		const conversationBudget = this.TOKEN_BUDGETS.PLANNER.CONVERSATION;
		const needsCompression = estimatedTokens > conversationBudget;

		if (needsCompression && this.compressionService && sessionId) {
			try {
				console.log('[AgentContext] Compressing conversation history', {
					originalTokens: estimatedTokens,
					targetTokens: conversationBudget,
					messageCount: history.length,
					sessionId,
					contextType
				});

				if (this.compressionService.smartCompress) {
					const smartResult = await this.compressionService.smartCompress(
						sessionId,
						history,
						contextType ?? 'global',
						userId
					);

					if (smartResult?.compressedMessages?.length) {
						messages.push(...smartResult.compressedMessages);
						return messages;
					}
				}

				const compressionResult = await this.compressionService.compressConversation(
					sessionId,
					history,
					conversationBudget,
					userId
				);

				if (compressionResult.compressedMessages.length > 0) {
					messages.push(...compressionResult.compressedMessages);
					return messages;
				}
			} catch (error) {
				console.error('[AgentContext] Failed to compress history, falling back:', error);
			}
		}

		if (needsCompression) {
			console.warn('[AgentContext] Falling back to recent conversation slice', {
				originalTokens: estimatedTokens,
				targetTokens: conversationBudget,
				messageCount: history.length
			});

			messages.push({
				role: 'system',
				content: `Previous conversation trimmed to the most recent messages to stay within the ${conversationBudget} token budget.`
			});

			const recentMessages = history.slice(-10);
			messages.push(
				...recentMessages.map((m) => ({
					role: m.role as any,
					content: m.content,
					tool_calls: m.tool_calls as any
				}))
			);
			return messages;
		}

		// Use full history
		messages.push(
			...history.map((m) => ({
				role: m.role as any,
				content: m.content,
				tool_calls: m.tool_calls as any
			}))
		);

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
			const project = ontology.entities.project;
			content += `### Project Information
- ID: ${project?.id ?? 'unknown'}
- Name: ${project?.name ?? 'No name'}
- Description: ${project?.description || 'No description'}
- State: ${project?.state_key ?? 'n/a'}
- Type: ${project?.type_key ?? 'n/a'}
- Created: ${project?.created_at || 'Unknown'}

### Entity Summary
${
	Object.entries(ontology.metadata?.entity_count || {})
		.map(([type, count]) => `- ${type}s: ${count}`)
		.join('\n') || 'No entities'
}

### Available Relationships
${ontology.relationships?.edges?.length || 0} relationships loaded
${
	ontology.relationships?.edges
		?.slice(0, 5)
		.map((e) => `- ${e.relation} → ${e.target_kind} (${e.target_id})`)
		.join('\n') || ''
}
${(ontology?.relationships?.edges?.length ?? 0) > 5 ? `... and ${(ontology?.relationships?.edges?.length ?? 0) - 5} more` : ''}

### Hints
- Use list_onto_tasks, list_onto_goals, list_onto_plans to see entities
- Use get_entity_relationships for full graph
- Use get_onto_project_details for complete information`;
		} else if (ontology.type === 'element') {
			const elementType = ontology.scope?.focus?.type ?? this.detectElementType(ontology);
			const elem = this.getScopedEntity(ontology, elementType);
			const parentProject = ontology.entities.project;
			content += `### Element Information
- Type: ${elementType || 'element'}
- ID: ${elem?.id ?? 'unknown'}
- Name: ${this.getEntityName(elem)}
- Status: ${elem?.status || elem?.state_key || 'Unknown'}

### Element Details
${elem?.description ? `Description: ${(elem.description as string).substring(0, 200)}...` : 'No description'}
${elem?.props ? `Properties: ${Object.keys(elem.props).join(', ')}` : ''}

### Parent Project
${
	parentProject
		? `- ${parentProject.name} (${parentProject.id})
- Project State: ${parentProject.state_key}`
		: '- No parent project found (orphaned element)'
}

### Relationships
${
	ontology.relationships?.edges
		?.map(
			(e) =>
				`- ${e.relation} ${e.relation.startsWith('inverse_') ? 'from' : 'to'} ${e.target_kind} (${e.target_id})`
		)
		.join('\n') || 'No relationships loaded'
}

### Hints
- Use the appropriate onto detail tool (e.g., get_onto_task_details) for complete information
- Use get_onto_project_details for full project context
- Use get_entity_relationships for connected items`;
		} else if (ontology.type === 'global') {
			const totalProjects =
				ontology.metadata?.total_projects ?? ontology.entities.projects?.length ?? 0;
			const availableTypes = ontology.metadata?.available_entity_types ?? [];
			const recentProjects = ontology.entities.projects ?? [];
			content += `### Global Overview
- Total Projects: ${totalProjects}
- Available Entity Types: ${availableTypes.join(', ') || 'project'}

### Recent Projects
${
	recentProjects
		.slice(0, 5)
		.map((p: any) => `- ${p.name} (${p.state_key}) - ${p.type_key}`)
		.join('\n') || 'No recent projects'
}

### Entity Distribution
${
	Object.entries(ontology.metadata?.entity_count || {})
		.map(([type, count]) => `- Total ${type}s: ${count}`)
		.join('\n') || 'No entity counts available'
}

### Hints
- Use list_onto_projects to find specific projects
- Use create_onto_project to start new projects
- Use list_onto_templates for a broader catalog`;
		}

		return {
			content,
			metadata: ontology.metadata
		};
	}

	private formatCombinedContext(
		ontology: OntologyContext,
		focus: ProjectFocus
	): {
		content: string;
		metadata: any;
	} {
		const project = ontology.entities.project;
		const element =
			focus.focusType === 'project-wide'
				? undefined
				: this.getScopedEntity(ontology, focus.focusType);
		const relationships = ontology.relationships?.edges ?? [];
		const elementName =
			focus.focusEntityName ?? this.getEntityName(element) ?? 'Focused entity';
		const elementState =
			(element as Record<string, any> | undefined)?.state_key ??
			(element as Record<string, any> | undefined)?.status ??
			(element as Record<string, any> | undefined)?.type_key ??
			'n/a';
		const elementDue =
			(element as Record<string, any> | undefined)?.due_at ??
			(element as Record<string, any> | undefined)?.target_date ??
			null;
		const projectName = project?.name ?? focus.projectName;
		const projectState = project?.state_key ?? 'n/a';
		const projectType = project?.type_key ?? 'n/a';
		const relationshipSummary = relationships
			.slice(0, 8)
			.map(
				(edge) =>
					`- ${edge.relation} → ${edge.target_kind} (${edge.target_id}${edge.target_name ? ` · ${edge.target_name}` : ''})`
			)
			.join('\n');

		const sections: string[] = [];
		sections.push(`## Project Workspace: ${projectName}
- ID: ${project?.id ?? focus.projectId}
- State: ${projectState}
- Type: ${projectType}`);

		let focusSection = `## Current Focus (${focus.focusType})
- Name: ${elementName}
- ID: ${focus.focusEntityId ?? 'n/a'}
- State: ${elementState}`;
		if (elementDue) {
			focusSection += `\n- Due: ${elementDue}`;
		}
		if (element && element.description) {
			focusSection += `\n\n${String(element.description).slice(0, 400)}`;
		}

		sections.push(focusSection);

		const elementProps = (element as Record<string, any> | undefined)?.props as
			| Record<string, any>
			| undefined;
		if (elementProps && Object.keys(elementProps).length > 0) {
			const propKeys = Object.keys(elementProps).slice(0, 5);
			sections.push(
				`### Focus Metadata
${propKeys.map((key) => `- ${key}: ${JSON.stringify(elementProps[key])}`).join('\n')}`
			);
		}

		if (relationshipSummary) {
			sections.push(`### Relationships\n${relationshipSummary}`);
		}

		sections.push(
			'---\nFocus is scoped to this entity. Keep project awareness while prioritizing actions for the focus target.'
		);

		return {
			content: sections.filter(Boolean).join('\n\n'),
			metadata: {
				...(ontology.metadata ?? {}),
				focus_summary: {
					type: focus.focusType,
					entityId: focus.focusEntityId,
					entityName: elementName,
					projectId: focus.projectId
				}
			}
		};
	}

	/**
	 * Get tools appropriate for the context
	 * Now ontology-first: uses onto_* tools when ontology context is available
	 */
	private async getContextTools(
		contextType: ChatContextType,
		_ontologyContext?: OntologyContext
	): Promise<ChatToolDefinition[]> {
		const normalized = this.normalizeContextType(contextType);
		const tools = getToolsForContextType(normalized as Exclude<ChatContextType, 'general'>);
		return getToolsForAgent(tools, 'read_write');
	}

	private filterToolsForFocus(
		tools: ChatToolDefinition[],
		focus: ProjectFocus | null
	): ChatToolDefinition[] {
		if (!focus || focus.focusType === 'project-wide') {
			return tools;
		}

		const focusType = focus.focusType;
		const otherTypes = ['task', 'goal', 'plan', 'document', 'output', 'milestone'].filter(
			(type) => type !== focusType
		);

		return tools.filter((tool) => {
			const toolName = tool.function?.name ? tool.function.name.toLowerCase() : '';
			if (!toolName) return true;
			if (toolName.startsWith('list_') || toolName.startsWith('get_')) return true;
			if (toolName.includes('project')) return true;
			if (toolName.includes(`_${focusType}`)) return true;
			return !otherTypes.some((type) => toolName.includes(`_${type}`));
		});
	}

	/**
	 * Load template overview for project creation
	 * Provides a high-level summary of available project templates
	 */
	private async loadTemplateOverview(): Promise<{ content: string; metadata: any }> {
		try {
			// Fetch all project templates using proper service function
			const templates = await getAvailableTemplates(
				this.supabase as any,
				'project',
				false // Don't include abstract templates
			);

			// Group templates by realm
			const grouped: Record<string, any[]> = templates.reduce(
				(acc: Record<string, any[]>, template) => {
					const realm = (template.metadata?.realm as string) || 'other';
					if (!acc[realm]) {
						acc[realm] = [];
					}
					acc[realm].push(template);
					return acc;
				},
				{}
			);

			// Build concise overview
			let content = `## Available Project Templates\n\nTotal templates: ${templates.length}\n\n`;

			// List templates by realm
			for (const [realm, realmTemplates] of Object.entries(grouped)) {
				content += `### ${realm.charAt(0).toUpperCase() + realm.slice(1)} Projects\n`;
				for (const template of realmTemplates.slice(0, 5)) {
					// Limit to 5 per realm to save tokens
					content += `- **${template.type_key}**: ${template.name}`;
					if (template.metadata?.description) {
						content += ` - ${template.metadata.description.substring(0, 100)}`;
					}
					if (template.facet_defaults) {
						const facets = [];
						if (template.facet_defaults.context)
							facets.push(`context: ${template.facet_defaults.context}`);
						if (template.facet_defaults.scale)
							facets.push(`scale: ${template.facet_defaults.scale}`);
						if (template.facet_defaults.stage)
							facets.push(`stage: ${template.facet_defaults.stage}`);
						if (facets.length > 0) {
							content += ` (${facets.join(', ')})`;
						}
					}
					content += '\n';
				}
				if (realmTemplates.length > 5) {
					content += `  ...and ${realmTemplates.length - 5} more\n`;
				}
				content += '\n';
			}

			content += `\nUse list_onto_templates(scope="project", realm="...", search="...") to search for specific templates.\n`;
			content += `Realms available: ${Object.keys(grouped).join(', ')}`;

			return {
				content,
				metadata: {
					template_count: templates.length,
					realms: Object.keys(grouped),
					realm_counts: Object.fromEntries(
						Object.entries(grouped).map(([realm, temps]) => [realm, temps.length])
					)
				}
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('[AgentContext] Error loading template overview:', errorMessage, error);
			return {
				content: `Error loading template information: ${errorMessage}. Please use list_onto_templates tool to search for templates directly.`,
				metadata: {
					error: true,
					error_message: errorMessage,
					template_count: 0
				}
			};
		}
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
	 * Get system prompt for Planning Agent
	 * Includes planning instructions, tool delegation, and orchestration guidance
	 */
	private getPlannerSystemPrompt(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata,
		locationContext?: string
	): string {
		const sections: string[] = [];

		sections.push(this.getPlannerBaseInstructions());

		const modeSummary = this.formatContextSummary(contextType, metadata);
		if (modeSummary) {
			sections.push(modeSummary);
		}

		const progressiveSection = this.getProgressiveDisclosureForPlanner();
		if (progressiveSection) {
			sections.push(progressiveSection);
		}

		const contextGuidance = this.chatContextService
			.getContextGuidance(contextType, metadata)
			.trim();
		if (contextGuidance) {
			sections.push(contextGuidance);
		}

		if (locationContext) {
			sections.push(`## Context Snapshot (Abbreviated)\n${locationContext}`);
		}

		return sections.filter(Boolean).join('\n\n');
	}

	private getPlannerBaseInstructions(): string {
		return `You are an AI Planning Agent in BuildOS, a productivity system for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Your Role: Intelligent Orchestration

You are the PLANNING layer of a multi-agent system. Your responsibilities:

1. **Respond to user requests** using available tools when needed
2. **Use tools directly** for most queries (conversational or data retrieval)
3. **Create execution plans** only for complex multi-step operations
4. **Spawn sub agent executors** for independent tasks in complex plans
5. **Synthesize results** into coherent, helpful responses

## Decision Framework

### Direct Query (Most Common)
- User asks a question (conversational or data-driven)
- You have tools available - use them ONLY if needed
- Examples:
  - "What is BuildOS?" → Just respond conversationally (no tools)
  - "Show me my tasks" → Use list_onto_tasks tool
  - "Tell me about my marketing project" → Use list_onto_projects + get_onto_project_details
→ Respond directly, using tools as needed

### Complex Multi-Step Query (Rare)
- User explicitly requests multiple sequential operations
- Example: "Update project X and then schedule all its tasks"
- Example: "Find project Y, archive completed tasks, then create a summary"
→ Create plan, spawn executors for each step, synthesize results

## Tool Delegation Strategy

When spawning executors, give them:
- **Specific task description**: "Find project named 'Marketing' and get details"
- **Goal**: "Return project_id, name, task_count"
- **Tool subset**: Only tools needed for that specific task
- **Minimal context**: Just the data they need (e.g., project_id if known)

## Available Tools

You have access to:
- **LIST/SEARCH tools**: Ontology queries (list_onto_projects, list_onto_tasks, list_onto_goals, list_onto_plans)
- **DETAIL tools**: Complete ontology info (get_onto_project_details, get_onto_task_details)
- **ACTION tools**: Ontology mutations (create_onto_task, create_onto_goal, create_onto_plan, update_onto_task, update_onto_project)
- **CALENDAR tools**: Scheduling (schedule_task, find_available_slots)
- **EXECUTOR tool**: spawn_executor (for delegating tasks)

## Response Guidelines

- Be conversational and helpful
- Explain what you're doing when using tools or spawning executors
- If spawning executors, briefly explain your plan first
- Synthesize executor results into a coherent response
- Keep the user informed of progress`;
	}

	private formatContextSummary(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata
	): string {
		const lines = [`- Mode: ${this.getContextDisplayName(contextType)}`];

		if (metadata?.projectName) {
			lines.push(`- Project: ${metadata.projectName}`);
		} else if (metadata?.projectId) {
			lines.push(`- Project ID: ${metadata.projectId}`);
		}

		if (metadata?.taskTitle) {
			lines.push(`- Task: ${metadata.taskTitle}`);
		}

		if (metadata?.userName) {
			lines.push(`- User: ${metadata.userName}`);
		}

		if (contextType === 'project_audit' && metadata?.auditHarshness) {
			lines.push(`- Audit Severity: ${metadata.auditHarshness}/10`);
		}

		return `## Active Mode\n${lines.join('\n')}\n\nAlign planning, tone, and tool usage with this mode before taking action.`;
	}

	private getContextDisplayName(contextType: ChatContextType): string {
		const labels: Record<ChatContextType, string> = {
			global: 'Global Assistant Mode',
			project: 'Project Workspace',
			task: 'Task Context',
			calendar: 'Calendar Context',
			general: 'Global Assistant Mode',
			project_create: 'Project Creation Mode',
			project_audit: 'Project Audit Mode',
			project_forecast: 'Project Forecast Mode',
			task_update: 'Task Update Mode',
			daily_brief_update: 'Daily Brief Update Mode'
		};

		return labels[contextType] ?? contextType.replace(/_/g, ' ');
	}

	private formatLastTurnEntities(entities: LastTurnContext['entities'] = {}): string[] {
		const lines: string[] = [];

		if (entities.project_id) {
			lines.push(`Current project focus: ${entities.project_id}`);
		}

		if (entities.task_ids?.length) {
			const [primaryTask, ...restTasks] = entities.task_ids;
			const suffix =
				restTasks.length > 0 ? ` (additional tasks: ${restTasks.join(', ')})` : '';
			lines.push(`Last touched task: ${primaryTask}${suffix}`);
		}

		if (entities.plan_id) {
			lines.push(`Active plan: ${entities.plan_id}`);
		}

		if (entities.goal_ids?.length) {
			lines.push(`Goals referenced: ${entities.goal_ids.join(', ')}`);
		}

		if (entities.document_id) {
			lines.push(`Document in focus: ${entities.document_id}`);
		}

		if (entities.output_id) {
			lines.push(`Output referenced: ${entities.output_id}`);
		}

		return lines;
	}

	private getProgressiveDisclosureForPlanner(): string {
		const prompt = this.chatContextService.getProgressiveDisclosurePrompt();
		const filtered = prompt
			.split('\n')
			.filter(
				(line) =>
					!line.startsWith('You are an AI assistant integrated into BuildOS') &&
					!line.startsWith('Current date:')
			);

		if (filtered.length === 0) {
			return '';
		}

		if (filtered?.[0]?.startsWith('## Critical: Progressive Information Access Pattern')) {
			filtered[0] = '## BuildOS Progressive Disclosure Protocol';
		}

		return filtered.join('\n').trim();
	}

	private buildSystemPromptMetadata(
		contextType: ChatContextType,
		locationMetadata?: LocationContext['metadata'],
		userMetadata?: { userName?: string }
	): SystemPromptMetadata | undefined {
		const metadata: SystemPromptMetadata = {};

		if (userMetadata?.userName) {
			metadata.userName = userMetadata.userName;
		}

		const projectContexts: ChatContextType[] = ['project', 'project_audit', 'project_forecast'];

		const taskContexts: ChatContextType[] = ['task', 'task_update'];

		if (projectContexts.includes(contextType)) {
			if (locationMetadata?.projectId) {
				metadata.projectId = locationMetadata.projectId;
			}
			if (locationMetadata?.projectName) {
				metadata.projectName = locationMetadata.projectName;
			}
			if (contextType === 'project_audit' && metadata.auditHarshness === undefined) {
				metadata.auditHarshness = 7;
			}
		}

		if (taskContexts.includes(contextType)) {
			if (locationMetadata?.taskTitle) {
				metadata.taskTitle = locationMetadata.taskTitle;
			}
			if (!metadata.projectId && locationMetadata?.projectId) {
				metadata.projectId = locationMetadata.projectId;
			}
		}

		return Object.keys(metadata).length > 0 ? metadata : undefined;
	}

	/**
	 * Compress conversation history to fit within token budget
	 * Uses ChatCompressionService if available, otherwise falls back to simple truncation
	 *
	 * @param messages - Chat messages to compress
	 * @param currentMessage - Current user message (not yet in messages array)
	 * @param tokenBudget - Target token count for compressed history
	 * @param sessionId - Session ID for compression tracking (optional)
	 * @returns Compressed messages in LLM format
	 */
	private async compressConversationForPlanner(
		messages: ChatMessage[],
		currentMessage: string,
		tokenBudget: number,
		sessionId?: string
	): Promise<LLMMessage[]> {
		// Try using ChatCompressionService if available
		if (this.compressionService && sessionId) {
			try {
				const result = await this.compressionService.compressConversation(
					sessionId,
					messages,
					tokenBudget
				);

				// Return compressed messages with current message appended (immutable)
				return [
					...result.compressedMessages,
					{
						role: 'user',
						content: currentMessage
					}
				];
			} catch (error) {
				console.error('Compression failed, falling back to truncation:', error);
				// Fall through to simple truncation
			}
		}

		// Fallback: Simple truncation (original logic)
		const recentMessages = messages.slice(-10);

		// Convert to LLM message format
		const llmMessages: LLMMessage[] = recentMessages.map((msg) => ({
			role: msg.role as any,
			content: msg.content,
			tool_calls: msg.tool_calls as any,
			tool_call_id: msg.tool_call_id ?? undefined // Convert null to undefined
		}));

		// Add current user message
		llmMessages.push({
			role: 'user',
			content: currentMessage
		});

		// Calculate tokens (rough estimate: 4 chars per token)
		const estimatedTokens = this.estimateTokens(JSON.stringify(llmMessages));

		// If under budget, return as-is
		if (estimatedTokens <= tokenBudget) {
			return llmMessages;
		}

		// If over budget, trim to most recent messages
		const maxMessages = Math.floor(tokenBudget / 200); // ~200 tokens per message
		return llmMessages.slice(-maxMessages);
	}

	/**
	 * Load location context for planner (abbreviated)
	 * Uses ChatContextService to load rich context based on contextType
	 *
	 * @param userId - User ID for data access
	 * @param contextType - Type of context to load (project, task, calendar, global, etc.)
	 * @param entityId - Entity ID (project_id, task_id) if applicable
	 * @returns Formatted context string for the planner
	 */
	private async loadLocationContextForPlanner(
		userId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<LocationContext> {
		try {
			const locationContext = await this.chatContextService.loadLocationContext(
				contextType,
				entityId,
				true,
				userId
			);

			return locationContext;
		} catch (error) {
			console.error('Failed to load location context for planner:', error);
			return this.createFallbackLocationContext(contextType, entityId);
		}
	}

	private createFallbackLocationContext(
		contextType: ChatContextType,
		entityId?: string
	): LocationContext {
		const normalized = this.normalizeContextType(contextType);
		const content = this.getFallbackContext(normalized, entityId);
		const fallbackMetadata: LocationContext['metadata'] = {
			contextType: normalized,
			abbreviated: true
		};

		const baseType = this.resolveDataContextType(normalized);

		if (baseType === 'project' && entityId) {
			fallbackMetadata.projectId = entityId;
		}

		if (baseType === 'task' && entityId) {
			fallbackMetadata.taskId = entityId;
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: fallbackMetadata
		};
	}

	private resolveDataContextType(contextType: ChatContextType): ChatContextType {
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
				return 'project';
			case 'task_update':
				return 'task';
			default:
				return contextType;
		}
	}

	/**
	 * Get fallback context if loading fails
	 * Provides minimal but useful context even when data loading fails
	 */
	private getFallbackContext(contextType: ChatContextType, entityId?: string): string {
		switch (contextType) {
			case 'project':
				return entityId
					? `## Project Workspace\nProject ID: ${entityId}\n\nUse ontology tools (list_onto_projects, get_onto_project_details, list_onto_tasks) to explore or update this workspace. Start with list/search tools before making changes.`
					: 'No project selected. Use list_onto_projects to find a project before continuing.';

			case 'task':
				return entityId
					? `## Current Task\nTask ID: ${entityId}\n\nUse get_onto_task_details tool to load task information.`
					: 'No task context available. Use list_onto_tasks to find tasks.';

			case 'calendar':
				return `## Calendar Context\n\nUse calendar tools (find_available_slots, get_task_calendar_events) to access schedule information.`;

			case 'project_create':
				return `## Project Creation Mode\nHelp the user create a well-structured project by asking clarifying questions.`;

			case 'project_audit':
				return entityId
					? `## Project Audit Mode\nProject ID: ${entityId}\n\nAnalyze project for gaps and improvement opportunities.`
					: 'Project audit mode requires a project ID.';

			case 'project_forecast':
				return entityId
					? `## Project Forecasting Mode\nProject ID: ${entityId}\n\nGenerate scenario forecasts for the project.`
					: 'Project forecast mode requires a project ID.';

			case 'task_update':
				return entityId
					? `## Task Update Mode\nTask ID: ${entityId}\n\nUse task tools to update task information.`
					: 'Task update mode requires a task ID.';

			case 'daily_brief_update':
				return `## Daily Brief Settings\nHelp user configure their daily brief preferences.`;

			case 'global':
			default:
				return `## BuildOS Assistant\nGeneral conversation mode. Use tools as needed to help the user with their productivity workflows.`;
		}
	}

	/**
	 * Load user profile for planner
	 */
	private async loadUserProfile(
		userId: string
	): Promise<{ summary: string; metadata: { userName?: string } } | undefined> {
		const { data: user } = await this.supabase
			.from('users')
			.select('email, name')
			.eq('id', userId)
			.single();

		if (!user) return undefined;

		const displayName = user.name || user.email;
		const summary = `User: ${displayName}`;

		return {
			summary,
			metadata: {
				userName: user.name || undefined
			}
		};
	}

	/**
	 * Get all tools available to the planner
	 * Planner has access to ALL tools (read + write)
	 */
	private getAllToolsForPlanner(contextType: ChatContextType): ChatToolDefinition[] {
		// Planner gets all tools (read-write permission)
		return getToolsForAgent(CHAT_TOOLS, 'read_write');
	}

	/**
	 * Estimate token count for planner context
	 */
	private estimatePlannerTokens(params: {
		systemPrompt: string;
		conversationHistory: LLMMessage[];
		locationContext: string;
		userProfile?: string;
		tools: ChatToolDefinition[];
	}): number {
		const { systemPrompt, conversationHistory, locationContext, userProfile, tools } = params;

		let total = 0;
		total += this.estimateTokens(systemPrompt);
		total += this.estimateTokens(JSON.stringify(conversationHistory));
		total += this.estimateTokens(locationContext);
		if (userProfile) total += this.estimateTokens(userProfile);
		total += this.estimateTokens(JSON.stringify(tools));

		return total;
	}

	// ============================================
	// EXECUTOR CONTEXT BUILDING
	// ============================================

	/**
	 * Build context for an Executor Agent
	 * Returns minimal, task-focused context with specific tools only
	 *
	 * @param params - Parameters for building executor context
	 * @returns Minimal context for the executor agent
	 */
	async buildExecutorContext(params: BuildExecutorContextParams): Promise<ExecutorContext> {
		const { executorId, sessionId, userId, task, tools, planId, contextType, entityId } =
			params;
		const normalizedContextType = contextType
			? this.normalizeContextType(contextType)
			: undefined;

		// 1. Build system prompt for executor
		const systemPrompt = this.getExecutorSystemPrompt(task, normalizedContextType);

		// 2. Extract relevant data for the task (if available)
		const relevantData = await this.extractRelevantDataForExecutor(
			task,
			userId,
			normalizedContextType,
			entityId
		);

		// 3. Calculate total tokens
		const totalTokens = this.estimateExecutorTokens({
			systemPrompt,
			task,
			tools,
			relevantData
		});

		return {
			systemPrompt,
			task,
			tools,
			relevantData,
			metadata: {
				executorId,
				sessionId,
				planId,
				totalTokens
			}
		};
	}

	/**
	 * Get system prompt for Executor Agent
	 * Task-specific instructions for focused execution
	 */
	private getExecutorSystemPrompt(task: ExecutorTask, contextType?: ChatContextType): string {
		let prompt = `You are a Task Executor Agent in BuildOS.

## Your Role: Focused Task Execution

You are given ONE specific task to complete. Your job:
1. Execute the task using the provided tools
2. Return structured results
3. Do NOT engage in conversation - focus on the task

## Your Task

${task.description}

**Goal:** ${task.goal}

${task.constraints && task.constraints.length > 0 ? `**Constraints:**\n${task.constraints.map((c) => `- ${c}`).join('\n')}` : ''}

## Guidelines

- Use only the tools provided to you
- Be efficient - minimize tool calls
- Return results in the format requested
- If you encounter errors, include them in your response
- Do not ask clarifying questions - work with what you have

## Response Format

When complete, your final message should clearly indicate:
- What you found/did
- Any relevant IDs or data
- Any errors or issues encountered`;

		if (contextType === 'project_create') {
			prompt += `

## Project Context Document Requirements
${PROJECT_CONTEXT_DOC_GUIDANCE}

Apply this structure when generating the \`context_document.body_markdown\` in \`create_onto_project\`. The agent or human should be able to read it and immediately grasp the project's vision, strategy, and next strategic moves.`;
		}

		return prompt;
	}

	/**
	 * Extract minimal relevant data for an executor task
	 * Only includes data that's directly needed for the specific task
	 */
	private async extractRelevantDataForExecutor(
		task: ExecutorTask,
		userId: string,
		contextType?: ChatContextType,
		entityId?: string
	): Promise<any> {
		// If task already has context data, return it
		if (task.contextData) {
			return task.contextData;
		}

		// Otherwise, extract based on context type and task
		// For now, return minimal data
		// This will be enhanced based on actual task requirements
		return {
			userId,
			contextType,
			entityId
			// Additional relevant data will be added based on task analysis
		};
	}

	/**
	 * Estimate token count for executor context
	 */
	private estimateExecutorTokens(params: {
		systemPrompt: string;
		task: ExecutorTask;
		tools: ChatToolDefinition[];
		relevantData?: any;
	}): number {
		const { systemPrompt, task, tools, relevantData } = params;

		let total = 0;
		total += this.estimateTokens(systemPrompt);
		total += this.estimateTokens(JSON.stringify(task));
		total += tools.length * 50; // Rough estimate per tool
		if (relevantData) total += this.estimateTokens(JSON.stringify(relevantData));

		return total;
	}

	private detectElementType(
		ontology: OntologyContext
	): Exclude<OntologyEntityType, 'project'> | undefined {
		if (ontology.scope?.focus?.type) {
			return ontology.scope.focus.type;
		}

		const candidates: Exclude<OntologyEntityType, 'project'>[] = [
			'task',
			'goal',
			'plan',
			'document',
			'output',
			'milestone'
		];

		return candidates.find((type) => !!this.getScopedEntity(ontology, type));
	}

	private getScopedEntity(
		ontology: OntologyContext,
		type?: OntologyEntityType | ProjectFocus['focusType']
	): Record<string, any> | undefined {
		if (!type || type === 'project-wide') {
			return undefined;
		}
		return (ontology.entities as Record<string, any>)[type];
	}

	private getEntityName(entity?: Record<string, any> | null): string {
		if (!entity) {
			return 'Unnamed';
		}

		return (
			entity.name ||
			entity.title ||
			entity.summary ||
			entity.display_name ||
			entity.id ||
			'Unnamed'
		);
	}

	private normalizeContextType(
		contextType: ChatContextType
	): Exclude<ChatContextType, 'general'> {
		return (contextType === 'general' ? 'global' : contextType) as Exclude<
			ChatContextType,
			'general'
		>;
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	/**
	 * Estimate token count for text
	 * Conservative estimate: ~4 characters per token
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}
}
