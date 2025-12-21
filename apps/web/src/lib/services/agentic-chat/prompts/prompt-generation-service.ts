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

// Import prompt configurations
import {
	PLANNER_PROMPTS,
	PROJECT_WORKSPACE_PROMPT,
	PROJECT_CREATION_PROMPTS,
	buildBrainDumpPrompt,
	buildExecutorPromptFromConfig,
	assembleSections
} from './config';

const PROJECT_CONTEXT_DOC_GUIDANCE = generateProjectContextFramework('condensed');

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

		if (lastTurnContext) {
			prompt += this.getLastTurnPrompt(lastTurnContext);
		}

		// Add ontology-specific context
		prompt += this.getOntologyContextPrompt(ontologyContext);

		// Add linked entities context when there's a focus entity
		if (linkedEntitiesContext && hasLinkedEntities(linkedEntitiesContext)) {
			prompt += '\n\n' + formatLinkedEntitiesForSystemPrompt(linkedEntitiesContext);
		}

		return prompt;
	}

	/**
	 * Get base prompt with context awareness
	 * Uses prompt configuration from ./config/planner-prompts.ts
	 */
	private getBasePrompt(
		contextType: ChatContextType,
		ontologyContext?: OntologyContext,
		lastTurnContext?: LastTurnContext
	): string {
		// Build prompt from config sections
		const sections: string[] = [];

		// Identity - simplified intro
		sections.push(`You are an AI assistant in BuildOS with advanced context awareness.`);

		// Language rules from config
		sections.push(
			`## ${PLANNER_PROMPTS.languageRules.title}\n${PLANNER_PROMPTS.languageRules.content}`
		);

		// Dynamic current context
		sections.push(`## Current Context
- Type: ${contextType}
- Level: ${ontologyContext?.type || 'standard'}
${lastTurnContext ? `- Previous Turn: "${lastTurnContext.summary}"` : '- Previous Turn: First message'}
${lastTurnContext?.entities ? `- Active Entities: ${JSON.stringify(lastTurnContext.entities)}` : ''}`);

		// Data access patterns from config
		sections.push(
			`## ${PLANNER_PROMPTS.dataAccessPatterns.title}\n${PLANNER_PROMPTS.dataAccessPatterns.content}`
		);

		// Strategies from config
		sections.push(
			`## ${PLANNER_PROMPTS.strategies.title}\n${PLANNER_PROMPTS.strategies.content}`
		);

		// Guidelines from config
		sections.push(
			`## ${PLANNER_PROMPTS.guidelines.title}\n${PLANNER_PROMPTS.guidelines.content}`
		);

		// Update rules from config
		sections.push(
			`### ${PLANNER_PROMPTS.updateRules.title}\n${PLANNER_PROMPTS.updateRules.content}`
		);

		// Task creation philosophy from config
		sections.push(
			`### ${PLANNER_PROMPTS.taskCreationPhilosophy.title}\n${PLANNER_PROMPTS.taskCreationPhilosophy.content}`
		);

		// Task type guidance (dynamic)
		sections.push(generateTaskTypeKeyGuidance('short'));

		return sections.join('\n\n');
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

		const candidates = ['task', 'goal', 'plan', 'document', 'output', 'milestone'];
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
