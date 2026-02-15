// apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts
/**
 * Prompt Generation Service
 *
 * Centralizes all prompt generation logic for the agentic chat system.
 * This extracts prompt generation from the AgentContextService to improve
 * separation of concerns and maintainability.
 *
 * Prompts are configured in ./config/ directory for easy iteration.
 * @see ./config/planner-prompts.ts - Planner agent prompts
 * @see ./config/executor-prompts.ts - Executor agent prompts
 * @see ./config/context-prompts.ts - Context-specific prompts
 */

import type { ChatContextType } from '@buildos/shared-types';
import type { LastTurnContext, OntologyContext } from '$lib/types/agent-chat-enhancement';
import type { EntityLinkedContext } from '$lib/types/linked-entity-context.types';
import {
	generateProjectContextFramework,
	generateProjectTypeKeyGuidance,
	generateTaskTypeKeyGuidance
} from '$lib/services/prompts/core/prompt-components';
import {
	formatLinkedEntitiesForSystemPrompt,
	hasLinkedEntities
} from '$lib/services/linked-entity-context-formatter';
import { createLogger } from '$lib/utils/logger';
import { dev } from '$app/environment';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';

// Import prompt configurations
import {
	PLANNER_PROMPTS,
	PROJECT_WORKSPACE_PROMPT,
	PROJECT_CREATION_PROMPTS,
	buildBrainDumpPrompt,
	buildExecutorPromptFromConfig,
	getContextTypeGuidance,
	buildFocusedEntityPrompt
} from './config';

const PROJECT_CONTEXT_DOC_GUIDANCE = generateProjectContextFramework('condensed');
const logger = createLogger('PromptGenerationService');

export interface PromptGenerationContext {
	contextType: ChatContextType;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	entityId?: string;
	linkedEntitiesContext?: EntityLinkedContext;
}

export class PromptGenerationService {
	/**
	 * Build enhanced system prompt with ontology and strategies
	 */
	async buildPlannerSystemPrompt(context: PromptGenerationContext): Promise<string> {
		const { contextType, ontologyContext, lastTurnContext, entityId, linkedEntitiesContext } =
			context;

		let prompt = this.getBasePrompt(contextType, ontologyContext, lastTurnContext);

		// Add context-specific sections
		if (contextType === 'project' || ontologyContext?.type === 'project') {
			prompt += this.getProjectWorkspacePrompt(ontologyContext, entityId);
		}

		if (contextType === 'project_create') {
			prompt += this.getProjectCreationPrompt();
		}

		if (contextType === 'brain_dump') {
			prompt += this.getBrainDumpPrompt();
		}

		if (contextType === 'ontology') {
			prompt +=
				'\n\n## Ontology Mode Override\n- The user opted into technical detail; internal field names and tool terminology are allowed when it improves precision.\n- Keep explanations concise and still prioritize user goals over system jargon.';
		}

		const focusType = ontologyContext?.scope?.focus?.type;
		if (focusType) {
			const focusPrompt = buildFocusedEntityPrompt(focusType);
			if (focusPrompt) {
				prompt += '\n\n' + focusPrompt;
			}
		}

		// Note: Last turn context is now consolidated in buildSessionContext()
		// within getBasePrompt() to avoid duplication. The getLastTurnPrompt()
		// method is kept for potential future use or debugging.

		// Ontology context is already included in the location snapshot to avoid duplication.

		// Add linked entities context when there's a focus entity
		if (linkedEntitiesContext && hasLinkedEntities(linkedEntitiesContext)) {
			prompt += '\n\n' + formatLinkedEntitiesForSystemPrompt(linkedEntitiesContext);
		}

		if (dev) {
			logger.debug('Planner system prompt built', {
				contextType,
				length: prompt.length,
				includesDocHierarchy: prompt.includes('Document Hierarchy'),
				includesCreateDocTool: prompt.includes('create_onto_document'),
				includesDocTreeGuidance: prompt.includes('document tree'),
				includesDocTypeKeys: prompt.includes('Documents') && prompt.includes('type_key')
			});
		}

		return prompt;
	}

	/**
	 * Get base prompt with context awareness
	 * Uses prompt configuration from ./config/planner-prompts.ts
	 *
	 * Section order (cognitive hierarchy):
	 * 1. Foundation - WHO am I, WHAT is BuildOS, HOW is data organized
	 * 2. Session - Current context and conversation state
	 * 3. Operational - HOW to operate (consolidated)
	 * 4. Behavioral - RULES to follow (consolidated + error handling + proactive)
	 * 5. Reference - Type key taxonomy
	 */
	private getBasePrompt(
		contextType: ChatContextType,
		ontologyContext?: OntologyContext,
		lastTurnContext?: LastTurnContext
	): string {
		const sections: string[] = [];

		// ===== FOUNDATION SECTIONS (Understanding) =====

		// 1. Identity - Who am I and what's my role
		sections.push(
			`## ${PLANNER_PROMPTS.identity.title}\n\n${PLANNER_PROMPTS.identity.content}`
		);

		// 2. Platform Context - What is BuildOS and who are users
		sections.push(
			`## ${PLANNER_PROMPTS.platformContext.title}\n\n${PLANNER_PROMPTS.platformContext.content}`
		);

		// 3. Data Model - How is information organized
		sections.push(
			`## ${PLANNER_PROMPTS.dataModelOverview.title}\n\n${PLANNER_PROMPTS.dataModelOverview.content}`
		);

		// ===== SESSION CONTEXT (Dynamic) =====

		// 4. Current session context
		sections.push(this.buildSessionContext(contextType, ontologyContext, lastTurnContext));

		// ===== OPERATIONAL SECTION (Consolidated) =====

		// 5. Operational guidelines - data access, strategies, response style
		sections.push(
			`## ${PLANNER_PROMPTS.operationalGuidelines.title}\n\n${PLANNER_PROMPTS.operationalGuidelines.content}`
		);

		if (isToolGatewayEnabled()) {
			sections.push(
				`## Tool Discovery Mode\n\n` +
					`- You only have access to tool_help and tool_exec (and optional tool_batch).\n` +
					`- Use tool_help when the op or arg schema is uncertain; avoid repeated calls for the same help path in one turn.\n` +
					`- Reuse discovered schemas in the same turn, and only re-check help after a validation error.\n` +
					`- Prefer tool_batch for first-time discovery + execution to reduce round trips.\n` +
					`- Use tool_help(\"root\") to list groups, then drill down only when needed (e.g., tool_help(\"onto.task\"), tool_help(\"onto.task.update\")).\n` +
					`- For onto.* search ops, prefer args.search (not args.query).\n` +
					`- When a tool_exec error includes help_path, call tool_help(help_path) once and retry once.\n` +
					`- Do not guess IDs or required fields; use list/search/get ops via tool_exec to look them up.`
			);
		}

		// ===== BEHAVIORAL SECTIONS (Consolidated + New) =====

		// 6. Behavioral rules - language, task creation, updates
		sections.push(
			`## ${PLANNER_PROMPTS.behavioralRules.title}\n\n${PLANNER_PROMPTS.behavioralRules.content}`
		);

		// 7. Error handling - recovery patterns
		sections.push(
			`## ${PLANNER_PROMPTS.errorHandling.title}\n\n${PLANNER_PROMPTS.errorHandling.content}`
		);

		// 8. Proactive intelligence - when to surface insights
		sections.push(
			`## ${PLANNER_PROMPTS.proactiveIntelligence.title}\n\n${PLANNER_PROMPTS.proactiveIntelligence.content}`
		);

		// ===== REFERENCE SECTIONS =====

		// 9. Task type guidance (dynamic)
		sections.push(generateTaskTypeKeyGuidance('short'));

		return sections.join('\n\n');
	}

	/**
	 * Build consolidated session context
	 * Combines context type guidance, ontology level, and last turn info into one section
	 */
	private buildSessionContext(
		contextType: ChatContextType,
		ontologyContext?: OntologyContext,
		lastTurnContext?: LastTurnContext
	): string {
		const lines: string[] = ['## Current Session'];

		// Context guidance - meaningful description instead of raw type
		lines.push('');
		lines.push(`**Context:** ${getContextTypeGuidance(contextType)}`);

		// Conversation state
		lines.push('');
		lines.push('**Conversation State:**');
		if (lastTurnContext) {
			lines.push(`- Previous Turn: "${lastTurnContext.summary}"`);
			if (lastTurnContext.strategy_used) {
				lines.push(`- Strategy Used: ${lastTurnContext.strategy_used}`);
			}
			if (lastTurnContext.data_accessed?.length) {
				lines.push(`- Data Accessed: ${lastTurnContext.data_accessed.join(', ')}`);
			}
			if (lastTurnContext.entities) {
				const entityRefs = this.formatEntityReferences(lastTurnContext.entities);
				if (entityRefs.length > 0) {
					lines.push(`- Active Entities: ${entityRefs.join(', ')}`);
				}
			}
		} else {
			lines.push('- This is the start of the conversation.');
		}

		lines.push('');
		lines.push(
			'Use this context to maintain continuity. Reference entities by ID when continuing from previous turns.'
		);

		return lines.join('\n');
	}

	/**
	 * Format entity references from last turn context
	 */
	private formatEntityReferences(entities: LastTurnContext['entities']): string[] {
		const refs: string[] = [];

		if (entities.project_id) {
			refs.push(`project:${entities.project_id}`);
		}
		if (entities.task_ids?.length) {
			refs.push(`tasks:${entities.task_ids.join(',')}`);
		}
		if (entities.plan_id) {
			refs.push(`plan:${entities.plan_id}`);
		}
		if (entities.goal_ids?.length) {
			refs.push(`goals:${entities.goal_ids.join(',')}`);
		}

		return refs;
	}

	/**
	 * Get project workspace specific prompt
	 * Uses prompt configuration from ./config/context-prompts.ts
	 */
	private getProjectWorkspacePrompt(
		ontologyContext?: OntologyContext,
		entityId?: string
	): string {
		const project = ontologyContext?.entities?.project;
		const projectName = (project?.name as string | undefined) ?? 'current project';
		const projectIdentifier = project?.id || entityId || 'not provided';

		return `

## ${PROJECT_WORKSPACE_PROMPT.title}
- You are fully scoped to Project **${projectName}** (ID: ${projectIdentifier}).
${PROJECT_WORKSPACE_PROMPT.content}`;
	}

	/**
	 * Get project creation specific prompt
	 * Uses prompt configuration from ./config/context-prompts.ts
	 */
	private getProjectCreationPrompt(): string {
		const sections: string[] = [];

		// Introduction
		sections.push(
			`## ${PROJECT_CREATION_PROMPTS.introduction.title}\n\n${PROJECT_CREATION_PROMPTS.introduction.content}`
		);

		// User communication rules
		sections.push(
			`**${PROJECT_CREATION_PROMPTS.userCommunicationRules.title}:**\n${PROJECT_CREATION_PROMPTS.userCommunicationRules.content}`
		);

		// Type key guidance (dynamic)
		sections.push(generateProjectTypeKeyGuidance('short'));

		// Internal capabilities
		sections.push(
			`### ${PROJECT_CREATION_PROMPTS.internalCapabilities.title}\n${PROJECT_CREATION_PROMPTS.internalCapabilities.content}`
		);

		// Tool usage guide
		sections.push(
			`### ${PROJECT_CREATION_PROMPTS.toolUsageGuide.title}\n${PROJECT_CREATION_PROMPTS.toolUsageGuide.content}`
		);

		// Workflow steps
		sections.push(
			`### ${PROJECT_CREATION_PROMPTS.workflowSteps.title}\n\n${PROJECT_CREATION_PROMPTS.workflowSteps.content}`
		);

		// Dynamic date for project creation
		sections.push(`- **start_at**: Current date/time: ${new Date().toISOString()}`);

		// Prop examples
		sections.push(
			`### ${PROJECT_CREATION_PROMPTS.propExamples.title}\n${PROJECT_CREATION_PROMPTS.propExamples.content}`
		);

		// Context document requirements
		sections.push(
			`### Context Document Requirements (MANDATORY)\n${PROJECT_CONTEXT_DOC_GUIDANCE}\n\nUse this guidance to write the \`context_document.content\` when calling \`create_onto_project\`.`
		);

		return '\n\n' + sections.join('\n\n');
	}

	/**
	 * Get brain dump exploration prompt
	 * Uses prompt configuration from ./config/context-prompts.ts
	 */
	private getBrainDumpPrompt(): string {
		return '\n\n' + buildBrainDumpPrompt();
	}

	/**
	 * Get last turn context prompt
	 */
	private getLastTurnPrompt(lastTurnContext: LastTurnContext): string {
		const entityHighlights = this.formatLastTurnEntities(lastTurnContext.entities);

		return `

## Last Turn Highlights
- Summary: ${lastTurnContext.summary}
- Strategy Used: ${lastTurnContext.strategy_used || 'not recorded'}
- Data Accessed: ${lastTurnContext.data_accessed.length > 0 ? lastTurnContext.data_accessed.join(', ') : 'none'}
${entityHighlights.length > 0 ? entityHighlights.map((line) => `- ${line}`).join('\n') : '- No entities tracked last turn'}
- Continue the conversation by referencing these entities when relevant.`;
	}

	/**
	 * Get ontology-specific context prompt
	 */
	private getOntologyContextPrompt(ontologyContext?: OntologyContext): string {
		if (!ontologyContext) return '';

		let prompt = '';

		// Project context
		if (ontologyContext.type === 'project') {
			const project = ontologyContext.entities.project;
			prompt += `

## Current Project (Internal Reference)
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

			// Add relationships info if available
			if (
				ontologyContext.relationships?.edges &&
				ontologyContext.relationships.edges.length > 0
			) {
				prompt += `
- Relationships: ${ontologyContext.relationships.edges.length} edges available
- Edge Types: ${[...new Set(ontologyContext.relationships.edges.map((e) => e.relation))].join(', ')}`;
			}
		}

		// Element context
		if (ontologyContext.type === 'element') {
			const elementType =
				ontologyContext.scope?.focus?.type ?? this.detectElementType(ontologyContext);
			const element = this.getScopedEntity(ontologyContext, elementType);
			const parentProject = ontologyContext.entities.project;
			prompt += `

## Current Element (Internal Reference)
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

		// Global context
		if (ontologyContext.type === 'global') {
			const totalProjects =
				ontologyContext.metadata?.total_projects ??
				ontologyContext.entities.projects?.length ??
				0;
			const recentProjects = ontologyContext.entities.projects ?? [];
			const entityTypes = ontologyContext.metadata?.available_entity_types ?? [];
			prompt += `

## Workspace Overview (Internal Reference)
- Total Projects: ${totalProjects}
- Recent Projects: ${recentProjects.length} loaded
- Available Types: ${entityTypes.join(', ') || 'project'}`;

			// Add recent projects listing
			if (recentProjects.length > 0) {
				prompt += `
- Recent Projects:
${recentProjects
	.slice(0, 5)
	.map(
		(project) =>
			`  - ${project.name} (${(project as Record<string, unknown>).state_key}) · ${(project as Record<string, unknown>).type_key}`
	)
	.join('\n')}`;
			}

			// Add entity distribution
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
	 * Format last turn entities for display
	 */
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

		return lines;
	}

	private detectElementType(ontology?: OntologyContext): string | undefined {
		if (!ontology) return undefined;
		if (ontology.scope?.focus?.type) {
			return ontology.scope.focus.type;
		}

		const candidates = ['task', 'goal', 'plan', 'document', 'milestone'];
		return candidates.find((type) => !!this.getScopedEntity(ontology, type));
	}

	private getScopedEntity(
		ontology: OntologyContext,
		type?: string
	): Record<string, any> | undefined {
		if (!type) return undefined;
		return (ontology.entities as Record<string, any>)[type];
	}

	private getEntityName(entity?: Record<string, any> | null): string {
		if (!entity) return 'Unnamed';
		return (
			entity.name ||
			entity.title ||
			entity.summary ||
			entity.display_name ||
			entity.id ||
			'Unnamed'
		);
	}

	/**
	 * Build executor system prompt
	 * Uses prompt configuration from ./config/executor-prompts.ts
	 */
	buildExecutorSystemPrompt(
		taskDescription: string,
		taskGoal: string,
		constraints?: string[],
		contextType?: ChatContextType
	): string {
		// Build base prompt from config
		let prompt = buildExecutorPromptFromConfig(taskDescription, taskGoal, constraints);

		// Add project creation context if needed
		if (contextType === 'project_create') {
			prompt += `

## Project Context Document Requirements
${PROJECT_CONTEXT_DOC_GUIDANCE}

Apply this structure when generating the \`context_document.content\` in \`create_onto_project\`.`;
		}

		return prompt;
	}
}
