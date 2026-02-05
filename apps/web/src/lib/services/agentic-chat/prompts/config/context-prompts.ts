// apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts
/**
 * Context-Specific Prompt Configuration
 *
 * Prompts for different chat contexts: project workspace, project creation,
 * brain dump exploration, etc.
 *
 * @version 1.0.0
 * @lastUpdated 2025-01-16
 */

import type { ChatContextType } from '@buildos/shared-types';
import type { OntologyEntityType } from '$lib/types/agent-chat-enhancement';
import type {
	ProjectCreationPromptConfig,
	BrainDumpPromptConfig,
	PromptSection,
	ContextDisplayNames,
	FallbackContextMessages
} from './types';

// ============================================
// CONTEXT TYPE GUIDANCE (AI Agent-Facing)
// ============================================

/**
 * AI-agent-facing guidance for each context type.
 * These descriptions help the AI understand the operational context
 * and adjust its behavior accordingly.
 *
 * Unlike CONTEXT_DISPLAY_NAMES (for UI) or FALLBACK_CONTEXT_MESSAGES (for errors),
 * these are concise operational summaries embedded in the session context.
 */
export const CONTEXT_TYPE_GUIDANCE: Record<ChatContextType, string> = {
	global: `No project selected. Provide workspace-level overviews, cross-project insights, and help locating projects.`,

	project: `Scoped to a specific project; default all queries to this project's entities. Don't ask which project—use project tools for tasks, progress, and risks.`,

	calendar: `Calendar planning mode. Focus on scheduling, availability, time blocks, and date coordination.`,

	general: `Same as global—no project selected. Provide workspace-level help and cross-project insights.`,

	project_create: `User is starting a new project. Focus on intent, classification, props, and creation; detailed guidance follows.`,

	project_audit: `Critical review mode for a project. Identify gaps, risks, unclear goals, and missing structure with a constructive tone.`,

	project_forecast: `Scenario planning mode for a project. Explore timelines, dependencies, risks, and what-if outcomes.`,

	daily_brief_update: `Daily brief preferences mode. Help configure what surfaces in summaries and notification settings.`,

	brain_dump: `Exploratory mode for unstructured thoughts. Be a sounding board, ask gentle questions, and avoid forcing structure; detailed guidance follows.`,

	ontology: `Ontology mode with direct data-model focus. The user opted into technical detail, so it's acceptable to use internal field names and tool terminology when helpful.`
};

/**
 * Get context guidance for a given context type
 */
export function getContextTypeGuidance(contextType: ChatContextType): string {
	return CONTEXT_TYPE_GUIDANCE[contextType] || CONTEXT_TYPE_GUIDANCE.global;
}

// ============================================
// PROJECT WORKSPACE PROMPTS
// ============================================

export const PROJECT_WORKSPACE_PROMPT: PromptSection = {
	id: 'project-workspace',
	title: 'Project Workspace Operating Guide',
content: `- Treat this chat as the user's dedicated project workspace: expect summaries, risks, or concrete changes within this project.
- Stay scoped to this project by default; do not ask which project they mean.
- When the user names an item vaguely, use search tools with the project_id to disambiguate before fetching details.
- Documents are hierarchical: use doc_structure for hierarchy and selectively fetch document details only when needed.
- Resolve document names via list/search tools before loading full content.
- Place new docs with parent_id/position.
- Keep responses grounded in this project's tasks, plans, goals, and documents unless the user asks for cross-project context.`,
includeHeader: true
};

// ============================================
// PROJECT CREATION PROMPTS
// ============================================

const PROJECT_CREATION_INTRO: PromptSection = {
	id: 'project-creation-intro',
	title: 'PROJECT CREATION CONTEXT',
	content: `You are helping the user create a new project. Focus on intent, correct type_key classification, and rich props extraction.

**Default assumption:** In project_create context, the user wants a project created. Proceed once critical details are clear; ask brief questions only when missing info would change the project.`,
	includeHeader: true
};

const PROJECT_CREATION_USER_RULES: PromptSection = {
	id: 'project-creation-user-rules',
	title: 'IMPORTANT - User Communication',
	content: `- Keep user-facing updates simple and action-oriented
- Say "I'll create a project for you" or "Setting up your [type] project"
- Do not mention internal fields or tool names
- In project_create, treat the user's intent as implicit confirmation once critical details are clear (no extra "are you sure?" write confirmation)`,
	includeHeader: false
};

const PROJECT_CREATION_CAPABILITIES: PromptSection = {
	id: 'project-creation-capabilities',
	title: 'INTERNAL CAPABILITIES (do not explain to user)',
	content: `1. **Type Classification**: Map intent to project.{realm}.{initiative}[.{variant}]
2. **Prop Inference**: Extract properties using proper naming (snake_case, is_/has_, *_count, target_*)
3. **Contextual Facets**: Infer facets (context/scale/stage) from intent
4. **Intelligent Inference**: Extract implicit requirements from user descriptions`,
	includeHeader: true
};

const PROJECT_CREATION_TOOL_GUIDE: PromptSection = {
	id: 'project-creation-tool-guide',
	title: 'Tool Usage Guide (Internal - do not mention tool names to user)',
content: `- **create_onto_project**: Create the project
- **get_field_info**: Check valid field values if needed
- **Documents**: Context docs live in the project's doc_structure; use parent_id/position when creating docs

**When talking to user, say things like:**
- "I'm setting up your project now..."
- "Creating your [book/app/research] project..."
- "Your project is ready! Here's what I've set up..."`,
	includeHeader: true
};

const PROJECT_CREATION_WORKFLOW: PromptSection = {
	id: 'project-creation-workflow',
	title: 'Enhanced Workflow',
	content: `**Step 1: Deep Intent Analysis**
- Analyze the user's request for explicit requirements and implied constraints (use implications for props/description, not extra entities)
- Identify the domain (e.g., software, business, creative, research)
- Determine primary focus, constraints, audience, timelines, and success criteria

**Step 2: Type Classification**
- Use the type_key guidance above to select the correct realm and focus
- Ask yourself: "What does success look like?" to disambiguate

**Step 3: Prop Extraction (CRITICAL)**
- Apply prop naming guidance: snake_case; booleans as is_/has_; *_count; target_*; *_at or *_date for dates
- Props persist in a JSONB column. Populate with facts from the user's chat or thoughtful inferences.
- Extract all meaningful details mentioned by the user (genre, tech_stack, audience, deadlines, budget, complexity, team size, constraints)
- Include facets in props when present: facets: { context, scale, stage }

**Step 4: Infer Project Details**
From the user's message, infer:
- **name**: Clear project name
- **description**: Expand on intent (1-2 sentences)
- **type_key**: From classification (MUST follow project.{realm}.{initiative} format)
- **facets**: Intelligent defaults based on context (context, scale, stage)
- **props**: Extract property values from user's message. Populate with specific values mentioned; use intelligent defaults for inferable items; include facets when present.

**Entities + Relationships (CRITICAL - Start Simple):**
- **entities**: Only what the user explicitly mentioned or clearly implied
- **Goal**: Include if user states a clear outcome ("I want to...", "The goal is...")
- **Tasks**: ONLY if user mentions SPECIFIC FUTURE ACTIONS ("call vendor", "schedule meeting")
- **Plans/Milestones**: ONLY if user describes these entities or phases, deadlines, or workstreams
- **Don't add** peripheral entities (risks, documents, requirements, metrics, sources) unless explicitly mentioned

**Anti-Inference Rules:**
- "I want to write a book" -> project + 1 goal ("Finish the book"), NO tasks
- "Start a side project for a habit tracker" -> project + 1 goal, maybe 1-2 tasks IF user mentioned specific actions
- "Help me plan my wedding" -> project + 1 goal, NO tasks unless user said "I need to call the venue"
- Simple projects are GOOD. Structure grows over time.

**relationships**: REQUIRED even if empty
- Use [] for a single entity with no connections
- Include at least one relationship when multiple entities exist
- Just express adjacency; the system determines edge types

**Step 5: Confirm + Create Project**
- If the user explicitly asked to create a project (typical in this context), treat that as confirmation and proceed.
- If they are still exploring or unclear about creating, ask a brief confirmation before calling create_onto_project.
Call create_onto_project with:
- The chosen type_key (MUST be project.{realm}.{initiative} format)
- Populated props object with ALL extracted information
- entities + relationships (relationships is required even if empty)
- If using clarifications, still include entities: [] and relationships: []`,
	includeHeader: true
};

const PROJECT_CREATION_PROP_EXAMPLES: PromptSection = {
	id: 'project-creation-prop-examples',
	title: 'Prop Examples (use real values from the chat)',
	content: `- Software app: \`{ tech_stack: ["nextjs", "supabase"], deployment_target: "vercel", is_mvp: true, target_users: "indie creators", budget: 15000 }\`
- Business launch: \`{ launch_date: "2025-02-15", target_customers: 500, budget: 75000, channels: ["email", "paid_social"], value_proposition: "automated reporting for SMBs" }\`
- Event: \`{ venue: "Grand Hall", guest_count: 180, date: "2025-06-20", catering: "needed", budget: 40000, is_indoor: true }\`
- Creative book: \`{ genre: "sci-fi", target_word_count: 80000, audience: "ya", has_agent: false, deadline_date: "2025-09-01" }\`
- Course: \`{ topic: "LLM safety", lesson_count: 8, target_duration_minutes: 45, delivery_mode: "live", audience: "senior engineers" }\``,
	includeHeader: true
};

export const PROJECT_CREATION_PROMPTS: ProjectCreationPromptConfig = {
	introduction: PROJECT_CREATION_INTRO,
	userCommunicationRules: PROJECT_CREATION_USER_RULES,
	internalCapabilities: PROJECT_CREATION_CAPABILITIES,
	toolUsageGuide: PROJECT_CREATION_TOOL_GUIDE,
	workflowSteps: PROJECT_CREATION_WORKFLOW,
	propExamples: PROJECT_CREATION_PROP_EXAMPLES
};

// ============================================
// BRAIN DUMP EXPLORATION PROMPT
// ============================================

const BRAIN_DUMP_GUIDE: PromptSection = {
	id: 'brain-dump-guide',
	title: 'Braindump Exploration Guide',
	content: `The user is thinking out loud. Be a supportive sounding board that helps them clarify without forcing structure.

- Mirror their energy and reflect key themes.
- Ask gentle, minimal questions; avoid interrogating.
- Do not rush to projects/tasks unless they signal readiness.
- If they say "I should make a plan" or "I need to track this," offer to organize it.`,
	includeHeader: true
};

export const BRAIN_DUMP_PROMPTS: BrainDumpPromptConfig = {
	guide: BRAIN_DUMP_GUIDE
};

// ============================================
// FOCUSED ENTITY PROMPTS
// ============================================

type FocusEntityType = Exclude<OntologyEntityType, 'project'>;

const FOCUS_ORGANIZATION_GUIDANCE: PromptSection = {
	id: 'focus-organization-guidance',
	title: 'Focused Organization Lens',
	content: `Preferred structure: project -> goal -> plan OR milestones; plans own tasks. If a goal uses milestones, each milestone should have its own plan with tasks.

When organizing, apply three acts:
- Categorize (Kind): group like with like; ask "what kind of thing is this?"
- Relate (Constraint): map dependencies and sequence (order is about what comes before/after, not importance)
- Rank (Choice): prioritize based on urgency, impact, or leverage

Always consider "what's next" after the focused entity and how it advances the goal or plan. Suggest links, sequencing, or next steps, but avoid creating new entities without user intent.
Minimal mnemonic: Kind -> Constraint -> Choice.`,
	includeHeader: true
};

const FOCUSED_ENTITY_PROMPTS: Record<FocusEntityType, PromptSection> = {
	task: {
		id: 'focus-task-guidance',
		title: 'Task Focus Guidance',
		content: `You are focused on a task.
- Tasks should belong to a plan (and usually a goal).
- If no plan is linked, suggest linking to an existing plan or creating one under the relevant goal or milestone.
- Think about sequencing: what must happen before or after? Note dependencies and propose the next task.
- Keep tasks atomic and action-oriented; if the task implies a larger effort, propose a plan and split tasks under it.`,
		includeHeader: true
	},
	goal: {
		id: 'focus-goal-guidance',
		title: 'Goal Focus Guidance',
		content: `You are focused on a goal.
- Goals should be structured by a plan or milestones.
- If milestones are used, each milestone should have its own plan with tasks.
- Avoid piling tasks directly under the goal unless they are small, one-off actions.
- Identify what is missing next (plan, milestones, or first plan step) and suggest it.`,
		includeHeader: true
	},
	plan: {
		id: 'focus-plan-guidance',
		title: 'Plan Focus Guidance',
		content: `You are focused on a plan.
- Plans should roll up to a goal (or be the plan for a milestone).
- Ensure tasks are linked to this plan and ordered by dependency (not priority).
- If tasks exist outside the plan, suggest linking or moving them in.
- Use the plan to surface the next task after the current one.`,
		includeHeader: true
	},
	milestone: {
		id: 'focus-milestone-guidance',
		title: 'Milestone Focus Guidance',
		content: `You are focused on a milestone.
- Milestones should tie to a goal and be achieved via a dedicated plan with tasks.
- If no plan exists, propose creating one; if tasks exist, link them under the milestone's plan.
- Use the milestone date to sequence work and identify the next action.`,
		includeHeader: true
	},
	document: {
		id: 'focus-document-guidance',
		title: 'Document Focus Guidance',
		content: `You are focused on a document.
- Documents can link to multiple entities, but prefer a primary anchor (goal, plan, or task) for context.
- If the document implies work, propose creating or linking a plan or tasks.
- Keep links purposeful; avoid over-linking.`,
		includeHeader: true
	},
	risk: {
		id: 'focus-risk-guidance',
		title: 'Risk Focus Guidance',
		content: `You are focused on a risk.
- Risks should link to the goal, plan, or task they threaten.
- Mitigation should be expressed as a plan or tasks under a plan.
- If the risk affects a milestone, link it and ensure a plan exists to address it.`,
		includeHeader: true
	},
	requirement: {
		id: 'focus-requirement-guidance',
		title: 'Requirement Focus Guidance',
		content: `You are focused on a requirement.
- Requirements should attach to a goal or plan, with tasks implementing them under the plan.
- Clarify acceptance criteria if missing.
- If the requirement implies a milestone, suggest linking it.`,
		includeHeader: true
	}
};

const formatPromptSection = (section: PromptSection): string => {
	const header = section.includeHeader === false ? '' : `## ${section.title}\n\n`;
	return `${header}${section.content}`;
};

export function buildFocusedEntityPrompt(focusType?: FocusEntityType | string): string {
	if (!focusType) return '';

	const sections: PromptSection[] = [FOCUS_ORGANIZATION_GUIDANCE];
	const typedFocus = focusType as FocusEntityType;
	const focusSection = FOCUSED_ENTITY_PROMPTS[typedFocus];
	if (focusSection) sections.push(focusSection);

	return sections.map(formatPromptSection).join('\n\n');
}

// ============================================
// CONTEXT DISPLAY NAMES
// ============================================

export const CONTEXT_DISPLAY_NAMES: ContextDisplayNames = {
	global: 'Global Assistant Mode',
	project: 'Project Workspace',
	calendar: 'Calendar Context',
	general: 'Global Assistant Mode',
	project_create: 'Project Creation Mode',
	project_audit: 'Project Audit Mode',
	project_forecast: 'Project Forecast Mode',
	daily_brief_update: 'Daily Brief Update Mode',
	brain_dump: 'Braindump Exploration Mode',
	ontology: 'Ontology Mode'
};

// ============================================
// FALLBACK CONTEXT MESSAGES
// ============================================

export const FALLBACK_CONTEXT_MESSAGES: FallbackContextMessages = {
	project: `## Project Workspace
Project ID: {{entityId}}

Use available project tools to explore or update this workspace. Start with list/search tools before making changes.`,

	project_no_id:
		'No project selected. Use available list/search tools to find a project before continuing.',

	calendar: `## Calendar Context

Use available calendar tools to access schedule information.`,

	project_create: `## Project Creation Mode
Help the user create a well-structured project by asking clarifying questions.`,

	project_audit: `## Project Audit Mode
Project ID: {{entityId}}

Analyze project for gaps and improvement opportunities.`,

	project_audit_no_id: 'Project audit mode requires a project ID.',

	project_forecast: `## Project Forecasting Mode
Project ID: {{entityId}}

Generate scenario forecasts for the project.`,

	project_forecast_no_id: 'Project forecast mode requires a project ID.',

	daily_brief_update: `## Daily Brief Settings
Help user configure their daily brief preferences.`,

	brain_dump: `## Braindump Exploration Mode
The user has shared a braindump - raw, unstructured thoughts. Your role is to be a supportive thought partner, helping them clarify and organize their thinking without being too aggressive about structuring.`,

	global: `## BuildOS Assistant
General conversation mode. Use tools as needed to help the user with their productivity workflows.`
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get fallback context message for a given context type
 */
export function getFallbackMessage(contextType: string, entityId?: string): string {
	const hasEntity = !!entityId;

	// Handle special cases with entity ID variations
	// Non-null assertions are safe: these keys are defined in FALLBACK_CONTEXT_MESSAGES
	if (contextType === 'project') {
		return hasEntity
			? FALLBACK_CONTEXT_MESSAGES.project!.replace('{{entityId}}', entityId!)
			: FALLBACK_CONTEXT_MESSAGES.project_no_id!;
	}

	if (contextType === 'project_audit') {
		return hasEntity
			? FALLBACK_CONTEXT_MESSAGES.project_audit!.replace('{{entityId}}', entityId!)
			: FALLBACK_CONTEXT_MESSAGES.project_audit_no_id!;
	}

	if (contextType === 'project_forecast') {
		return hasEntity
			? FALLBACK_CONTEXT_MESSAGES.project_forecast!.replace('{{entityId}}', entityId!)
			: FALLBACK_CONTEXT_MESSAGES.project_forecast_no_id!;
	}

	// Default fallback - use nullish coalescing with global as fallback
	return FALLBACK_CONTEXT_MESSAGES[contextType] ?? FALLBACK_CONTEXT_MESSAGES.global!;
}

/**
 * Get display name for a context type
 */
export function getContextDisplayName(contextType: string): string {
	return CONTEXT_DISPLAY_NAMES[contextType] ?? contextType.replace(/_/g, ' ');
}

/**
 * Build brain dump prompt from config sections
 */
export function buildBrainDumpPrompt(): string {
	const sections = [BRAIN_DUMP_GUIDE];

	return sections
		.map((section) => {
			const header = section.includeHeader ? `## ${section.title}\n\n` : '';
			return `${header}${section.content}`;
		})
		.join('\n\n');
}
