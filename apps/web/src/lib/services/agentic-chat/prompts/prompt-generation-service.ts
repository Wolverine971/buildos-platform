// apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts
/**
 * Prompt Generation Service
 *
 * Centralizes all prompt generation logic for the agentic chat system.
 * This extracts prompt generation from the AgentContextService to improve
 * separation of concerns and maintainability.
 */

import type { ChatContextType } from '@buildos/shared-types';
import type { LastTurnContext, OntologyContext } from '$lib/types/agent-chat-enhancement';
import { generateProjectContextFramework } from '$lib/services/prompts/core/prompt-components';
// import { generateProjectContextFramework } from '../../../prompts/core/prompt-components';

const PROJECT_CONTEXT_DOC_GUIDANCE = generateProjectContextFramework('condensed');

export interface PromptGenerationContext {
	contextType: ChatContextType;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	entityId?: string;
}

export class PromptGenerationService {
	/**
	 * Build enhanced system prompt with ontology and strategies
	 */
	async buildPlannerSystemPrompt(context: PromptGenerationContext): Promise<string> {
		const { contextType, ontologyContext, lastTurnContext, entityId } = context;

		let prompt = this.getBasePrompt(contextType, ontologyContext, lastTurnContext);

		// Add context-specific sections
		if (contextType === 'project' || ontologyContext?.type === 'project') {
			prompt += this.getProjectWorkspacePrompt(ontologyContext, entityId);
		}

		if (contextType === 'project_create') {
			prompt += this.getProjectCreationPrompt();
		}

		if (lastTurnContext) {
			prompt += this.getLastTurnPrompt(lastTurnContext);
		}

		// Add ontology-specific context
		prompt += this.getOntologyContextPrompt(ontologyContext);

		return prompt;
	}

	/**
	 * Get base prompt with context awareness
	 */
	private getBasePrompt(
		contextType: ChatContextType,
		ontologyContext?: OntologyContext,
		lastTurnContext?: LastTurnContext
	): string {
		return `You are an AI assistant in BuildOS with advanced context awareness.

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
- Start with LIST/SEARCH tools before using DETAIL tools
- When the user mentions a fuzzy entity name (e.g., “marketing plan”, “email brief”, “launch milestone”) or the type is unclear, call \`search_ontology\` first (pass project_id if known) and then follow with the appropriate get_onto_*_details tool for the chosen ID

### Non-Destructive Updates (IMPORTANT)
- For \`update_onto_document\`, \`update_onto_task\`, \`update_onto_goal\`, and \`update_onto_plan\`, set \`update_strategy\`:
  - \`append\`: add new notes/research without wiping existing text (preferred default for additive updates)
  - \`merge_llm\`: integrate new content intelligently; include \`merge_instructions\` (e.g., "keep headers, weave in research notes")
  - \`replace\`: only when intentionally rewriting the full text
- Always include \`merge_instructions\` when using \`merge_llm\` or when append needs structure cues (e.g., "keep bullets, preserve KPIs").`;
	}

	/**
	 * Get project workspace specific prompt
	 */
	private getProjectWorkspacePrompt(
		ontologyContext?: OntologyContext,
		entityId?: string
	): string {
		const project = ontologyContext?.entities?.project;
		const projectName = (project?.name as string | undefined) ?? 'current project';
		const projectIdentifier = project?.id || entityId || 'not provided';

		return `

## Project Workspace Operating Guide
- You are fully scoped to Project **${projectName}** (ID: ${projectIdentifier}).
- Treat this chat as the user's dedicated project workspace: they may ask for summaries, risks, decisions, or request concrete changes.
- Default workflow:
  1. Identify whether the request is informational (answer with existing data) or operational (requires write tools).
  2. Start with ontology list/detail tools (e.g., list_onto_projects, list_onto_tasks, get_onto_project_details, get_onto_task_details) to ground your answer before suggesting edits.
  2a. If the user references an item by name but the type is unclear, use \`search_ontology\` with the project_id to locate it, then follow up with the relevant get_onto_*_details tool.
  3. If the user clearly asks to change data, call the corresponding create/update tool and describe the result.
  4. Proactively surface related insights (risks, blockers, next steps) when helpful—even if the user asked a simple question.
- Always mention when additional detail is available via tools and ask if you'd like to dive deeper before modifying data.`;
	}

	/**
	 * Get project creation specific prompt
	 */
	private getProjectCreationPrompt(): string {
		return `

## PROJECT CREATION CONTEXT

You are helping the user create a new ontology project with dynamic template intelligence. Your goal is to understand their intent deeply and either match an existing template OR suggest a new template that perfectly fits their needs.

### CRITICAL CAPABILITIES:
1. **Dynamic Template Creation**: You can suggest entirely new template types based on user intent
2. **Semantic Understanding**: Match templates based on meaning, not just keywords
3. **Template Evolution**: Existing templates can be extended or specialized
4. **Intelligent Inference**: Extract implicit requirements from user descriptions

### Tool Usage Guide
- **list_onto_templates**: Review available templates to understand options
- **suggest_template**: Propose a NEW custom template when no existing one scores >70% match
- **create_onto_project**: Create the project (auto-creates template if using suggested type_key)
- **request_template_creation**: Escalate complex template requests only when needed
- **get_field_info**: Check valid field values if needed

### Enhanced Workflow:

**Step 1: Deep Intent Analysis**
- Analyze the user's request for both explicit and implicit requirements
- Identify the domain (e.g., software, business, creative, research)
- Determine key characteristics that would define an ideal template

**Step 2: Template Discovery & Matching**
- Use list_onto_templates to see available templates
- Perform semantic matching, not just keyword matching
- Score templates based on: domain alignment (40%), workflow compatibility (30%), feature coverage (20%), customization potential (10%)

**Step 3: Dynamic Template Suggestion (if no good match)**
If no existing template scores >70% match:
- Call suggest_template with a custom template design
- Define meaningful type_key following pattern: [scope].[domain].[specialization]
- Specify properties, workflow states, and benefits
- The system will auto-create this template when you create the project

**Step 4: Infer Project Details**
From the user's message and selected/suggested template, infer:
- **name**: Clear project name
- **description**: Expand on intent (1-2 sentences)
- **type_key**: From selected or suggested template
- **facets**: Intelligent defaults based on context (context, scale, stage)
- **start_at**: Current date/time: ${new Date().toISOString()}
- **end_at**: Only if deadline mentioned
- **props**: ⚠️ CRITICAL - Extract template-specific property values from user's message:
  1. Review the template's property schema (from your suggest_template call or list_onto_templates result)
  2. For EACH property in the template schema, search the user's message for relevant information
  3. Extract and populate specific values mentioned by the user
  4. Use intelligent defaults for properties not explicitly mentioned but inferable from context
  5. ALWAYS include facets in props, then add all template-specific properties

  Examples of prop extraction:
  - User: "wedding for 150 guests, budget $75k, venue is Grand Hall"
    Template has: venue_details, guest_count, budget
    → props: { venue_details: { name: "Grand Hall", status: "tentative" }, guest_count: 150, budget: 75000 }

  - User: "React app with TypeScript, deploy to Vercel"
    Template has: tech_stack, deployment_target, framework
    → props: { tech_stack: ["React", "TypeScript"], deployment_target: "Vercel", framework: "React" }

  - User: "research hypothesis: AI improves climate prediction accuracy"
    Template has: hypothesis, methodology, research_question
    → props: { hypothesis: "AI improves climate prediction accuracy", methodology: "experimental", research_question: "Can AI models provide more accurate climate predictions?" }

- **goals**: 1-3 relevant goals from objectives
- **tasks**: Initial tasks from specific actions
- **outputs**: Deliverables if mentioned

**Step 5: Create Project Immediately**
Call create_onto_project with:
- The selected/suggested template type_key
- Populated props object with ALL extracted information
- The system will automatically create any new template if needed

### Template Suggestion Examples:

**Example 1: User wants "AI research project on climate change with NOAA datasets"**
- Existing template: project.research (60% match)
- Suggested new template: project.research.ai_climate
- Properties: dataset_sources, model_types, climate_indicators, publication_targets
- Workflow: proposal → literature_review → data_collection → modeling → analysis → publication
- **Props to extract**: { dataset_sources: ["NOAA"], climate_indicators: ["temperature", "precipitation"], research_area: "climate_change" }

**Example 2: User wants "Mobile app MVP for iOS/Android, target 1000 beta users"**
- Existing template: project.software (50% match)
- Suggested new template: project.software.mobile_mvp
- Properties: target_platforms, user_testing_phases, mvp_features, beta_user_target
- Workflow: ideation → design → prototype → testing → iteration → launch
- **Props to extract**: { target_platforms: ["iOS", "Android"], beta_user_target: 1000, mvp_features: [] }

**Example 3: User wants "Wedding planning, venue TBD, expecting 200 guests, $100k budget"**
- No existing match
- Suggested new template: project.event.wedding
- Properties: venue_details, guest_count, budget, vendor_list, timeline
- Workflow: planning → booking → preparation → execution → followup
- **Props to extract**: { venue_details: { status: "searching" }, guest_count: 200, budget: 100000, vendor_list: [] }

### Context Document Requirements (MANDATORY)
${PROJECT_CONTEXT_DOC_GUIDANCE}

Use this guidance to write the \`context_document.body_markdown\` when calling \`create_onto_project\`.`;
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

## Project Ontology Context
- Project ID: ${project?.id ?? 'unknown'}
- Project Name: ${project?.name ?? 'Unnamed project'}
- State: ${project?.state_key || 'active'}
- Type: ${project?.type_key || 'standard'}`;

			if (ontologyContext.metadata?.facets) {
				prompt += `
- Facets: ${JSON.stringify(ontologyContext.metadata.facets)}`;
			}

			if (ontologyContext.metadata?.entity_count) {
				const counts = Object.entries(ontologyContext.metadata.entity_count)
					.map(([type, count]) => `${type}: ${count}`)
					.join(', ');
				prompt += `
- Entity Counts: ${counts}`;
			}
		}

		// Element context
		if (ontologyContext.type === 'element') {
			const elementType = this.detectElementType(ontologyContext);
			const element = this.getScopedEntity(ontologyContext, elementType);
			const parentProject = ontologyContext.entities.project;
			prompt += `

## Element Ontology Context
- Element Type: ${elementType || 'element'}
- Element ID: ${element?.id ?? 'unknown'}
- Element Name: ${this.getEntityName(element)}`;

			if (parentProject) {
				prompt += `
- Parent Project: ${parentProject.name} (${parentProject.id})`;
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

## Global Ontology Context
- Total Projects: ${totalProjects}
- Recent Projects: ${recentProjects.length} loaded
- Available Entity Types: ${entityTypes.join(', ') || 'project'}`;
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
	 */
	buildExecutorSystemPrompt(
		taskDescription: string,
		taskGoal: string,
		constraints?: string[],
		contextType?: ChatContextType
	): string {
		let prompt = `You are a Task Executor Agent in BuildOS.

## Your Role: Focused Task Execution

You are given ONE specific task to complete. Your job:
1. Execute the task using the provided tools
2. Return structured results
3. Do NOT engage in conversation - focus on the task

## Your Task

${taskDescription}

**Goal:** ${taskGoal}

${constraints && constraints.length > 0 ? `**Constraints:**\n${constraints.map((c) => `- ${c}`).join('\n')}` : ''}

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

Apply this structure when generating the \`context_document.body_markdown\` in \`create_onto_project\`.`;
		}

		return prompt;
	}
}
