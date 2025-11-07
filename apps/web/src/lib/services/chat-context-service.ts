// apps/web/src/lib/services/chat-context-service.ts
/**
 * Chat Context Service - Progressive Disclosure Pattern
 *
 * This service manages context assembly for chat sessions using a progressive
 * disclosure pattern. It loads abbreviated data initially (reducing tokens by 70%)
 * and provides methods for drilling down into detailed data when needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	SystemPromptMetadata,
	ContextLayer,
	LocationContext,
	ContextBundle,
	AssembledContext,
	TokenBudget,
	AbbreviatedProject,
	AbbreviatedTask,
	AbbreviatedNote,
	AbbreviatedBrainDump,
	AbbreviatedCalendarEvent,
	ChatSession,
	Json
} from '@buildos/shared-types';

export class ChatContextService {
	// Token allocation strategy
	private readonly TOKEN_BUDGETS: TokenBudget = {
		HARD_LIMIT: 10000, // OpenRouter limit

		// Initial context (abbreviated)
		SYSTEM_PROMPT: 500, // Instructions + tool descriptions
		USER_PROFILE: 300, // Work style preferences
		LOCATION_CONTEXT: 1000, // Current project/task (abbreviated)
		RELATED_DATA: 500, // Related items (abbreviated)

		// Conversation
		HISTORY: 4000, // Previous messages

		// Response buffer
		RESPONSE: 2000, // LLM response space
		TOOL_RESULTS: 1700 // Space for tool call results
	};

	// Character limits for previews
	private readonly PREVIEW_LIMITS = {
		TASK_DESCRIPTION: 100, // chars
		TASK_DETAILS: 100, // chars
		PROJECT_CONTEXT: 500, // chars
		NOTE_CONTENT: 200, // chars
		BRAIN_DUMP_SUMMARY: null, // Full summary (already concise)
		EXECUTIVE_SUMMARY: null // Full summary (already concise)
	};

	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Build initial context for a chat session
	 * Returns abbreviated context to minimize token usage
	 */
	async buildInitialContext(
		sessionId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<AssembledContext> {
		// Get session details
		const { data: session } = await this.supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();

		if (!session) {
			throw new Error('Chat session not found');
		}

		const userId = session.user_id;
		const layers: ContextLayer[] = [];

		// Layer 1: System instructions (always included)
		const systemPrompt = this.getSystemPrompt(contextType);
		layers.push({
			priority: 1,
			type: 'system',
			content: systemPrompt,
			tokens: this.estimateTokens(systemPrompt),
			truncatable: false
		});

		// Layer 2: User profile (abbreviated)
		const userProfile = await this.loadUserProfile(userId);
		if (userProfile) {
			layers.push({
				priority: 2,
				type: 'user',
				content: userProfile,
				tokens: this.estimateTokens(userProfile),
				truncatable: true
			});
		}

		// Layer 3: Location context (ABBREVIATED)
		const locationContext = await this.loadLocationContext(
			contextType,
			entityId,
			true, // abbreviated = true
			userId
		);
		layers.push({
			priority: 3,
			type: 'location',
			content: locationContext.content,
			tokens: locationContext.tokens,
			metadata: locationContext.metadata,
			truncatable: false // Core context
		});

		// Layer 4: Related data (ABBREVIATED)
		const relatedData = await this.loadRelatedData(
			contextType,
			entityId,
			true, // abbreviated = true
			userId
		);
		if (relatedData) {
			layers.push({
				priority: 4,
				type: 'related',
				content: relatedData.content,
				tokens: relatedData.tokens,
				truncatable: true
			});
		}

		// Assemble within budget
		const assembled = this.assembleContext(layers);

		return {
			...assembled,
			systemPrompt,
			userContext: userProfile || undefined,
			locationContext: locationContext.content,
			relatedData: relatedData?.content
		};
	}

	public getSystemPrompt(contextType: ChatContextType, metadata?: SystemPromptMetadata): string {
		const basePrompt = `You are an AI assistant integrated into BuildOS, a productivity system designed for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Critical: Progressive Information Access Pattern

You have tools that follow a STRICT progressive disclosure pattern to optimize token usage:

## ONTOLOGY DATA MODEL (Primary System)

BuildOS uses a template-driven ontology system with these core entities:
- **Projects** (onto_projects): Root work units with type_key, state_key, facets
- **Tasks** (onto_tasks): Actionable items linked to projects/plans
- **Plans** (onto_plans): Logical groupings of tasks within projects
- **Goals** (onto_goals): Project objectives and success criteria
- **Outputs** (onto_outputs): Deliverables and artifacts
- **Documents** (onto_documents): Project documentation
- **Edges** (onto_edges): Relationships between entities

### Tier 1: ONTOLOGY LIST Tools (Use First)
These query the ontology system and return abbreviated data:
- list_onto_projects → Project summaries (id, name, type_key, state_key, description)
- list_onto_tasks → Task summaries (id, title, state_key, priority, due_at)
- list_onto_plans → Plan summaries (id, name, type_key, state_key)
- list_onto_goals → Goal summaries (id, name, type_key, description)

**Filters Available:**
- Projects: state_key, type_key
- Tasks: project_id, state_key (filter by state: 'todo', 'in_progress', 'done')
- Plans: project_id
- Goals: project_id

### Tier 2: ONTOLOGY DETAIL Tools (Use When Needed)
Get complete entity data including props (JSON):
- get_onto_project_details → Full project with all properties
- get_onto_task_details → Full task with all properties

### Tier 3: ONTOLOGY RELATIONSHIP Tools
Explore the entity graph:
- get_entity_relationships → Query onto_edges for entity connections (incoming/outgoing/both)

### Tier 4: ONTOLOGY ACTION Tools (Mutations)
Create, update, and delete ontology entities:

**CREATE Tools** (Add new entities):
- create_onto_task → Create task in project (required: project_id, title)
- create_onto_goal → Create project goal (required: project_id, name)
- create_onto_plan → Create task grouping (required: project_id, name)

**UPDATE Tools** (Modify existing):
- update_onto_task → Update task fields (required: task_id, optional: title, description, state_key, priority, plan_id, due_at, props)
- update_onto_project → Update project fields (required: project_id, optional: name, description, state_key, props)

**DELETE Tools** (Remove entities):
- delete_onto_task → Delete task permanently (required: task_id)
- delete_onto_goal → Delete goal permanently (required: goal_id)
- delete_onto_plan → Delete plan permanently (required: plan_id)

**When to use ACTION tools:**
- User explicitly requests creation: "Create a task", "Add a goal", "Make a new plan"
- User requests updates: "Mark task as done", "Change priority to high", "Update description"
- User requests deletion: "Delete that task", "Remove the goal"
- Always verify entity exists before updating/deleting (use LIST tools first)
- Confirm significant actions with user when appropriate

**Action Tool Best Practices:**
1. **Create**: Provide sensible defaults (state_key='todo', priority=3, type_key='task.basic')
2. **Update**: Only specify fields being changed (partial updates supported)
3. **Delete**: Verify ownership and warn about permanence
4. **Feedback**: Report success with entity name and ID for user verification

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
   - "Show me the marketing project" → list_onto_projects + get_onto_project_details
   - "List my active tasks" → list_onto_tasks with state_key filter
   - "What goals are in project X?" → list_onto_goals with project_id

2. **complex_research**: Multi-step investigation, may spawn executors
   - "Analyze all my projects and tell me which are at risk" → Multiple queries + analysis
   - "Generate a comprehensive status report" → Cross-entity aggregation
   - "Find all tasks blocking project completion" → Relationship graph traversal

3. **ask_clarifying_questions**: When ambiguity remains AFTER research
   - Multiple entities match the query
   - Time range or scope unclear
   - Required parameters missing

### Example Workflows

**User: "Show me the writing project"**
1. list_onto_projects (search for "writing")
2. If found: get_onto_project_details(project_id)
3. Optional: list_onto_tasks(project_id) to show tasks

**User: "What tasks are due soon?"**
1. list_onto_tasks (no filters to get all)
2. Analyze due_at dates and show upcoming
3. Group by project_id if helpful

**User: "How are the goals for project X?"**
1. list_onto_goals(project_id=X)
2. Show goal summaries
3. If user wants details: get_onto_goal_details for specific goals

**User: "Create a task called 'Write introduction' in the writing project"**
1. list_onto_projects (search for "writing" to get project_id)
2. create_onto_task(project_id=<id>, title="Write introduction", state_key="todo", priority=3)
3. Confirm creation with user showing task name and ID

**User: "Mark that task as in progress"**
1. Identify task from conversation context (last_turn_context.entities.task_ids)
2. update_onto_task(task_id=<id>, state_key="in_progress")
3. Confirm update with current state

**User: "Delete the old goal about user testing"**
1. list_onto_goals (search for "user testing")
2. Confirm which goal matches
3. delete_onto_goal(goal_id=<id>)
4. Confirm deletion

### Tier 5: PROJECT CREATION (Intelligent Workflow)

**NEW: Smart Project Creation**

Use create_onto_project for creating complete projects. This tool supports intelligent inference:

**Workflow for project creation:**
1. Search templates: list_onto_templates(scope="project", realm=<inferred>, search=<keywords>)
2. Pick best template from results (check type_key, description, facet_defaults)
3. Infer project details from user message:
   - name: Extract from user intent ("book project" → "Book Writing Project")
   - description: Expand on what user said
   - facets: Infer context (personal/client), scale (micro/large), stage (discovery/planning)
   - start_at: Default to current date if not mentioned
4. Add initial entities if mentioned:
   - goals: If user mentions objectives
   - tasks: If user mentions specific actions
   - outputs: If user mentions deliverables
5. ONLY use clarifications[] if CRITICAL info is missing (e.g., user says "create a project" with no context)
6. Call create_onto_project with inferred ProjectSpec

**Examples:**

**User: "Create a book writing project"**
1. list_onto_templates(scope="project", realm="writer", search="book")
2. Pick "project.writer.book" (type_key from results)
3. create_onto_project({
     project: {
       name: "Book Writing Project",
       type_key: "project.writer.book",
       description: "Writing project for book creation",
       props: { facets: { context: "personal", scale: "large", stage: "discovery" } },
       start_at: "2025-11-04T00:00:00Z"
     },
     goals: [
       { name: "Complete first draft" },
       { name: "Publish book" }
     ]
   })

**User: "Start a new software project for client work with an MVP deadline in 3 months"**
1. list_onto_templates(scope="project", realm="developer", search="software")
2. Pick "project.developer.software"
3. create_onto_project({
     project: {
       name: "Client Software Project",
       type_key: "project.developer.software",
       description: "Software development project for client with MVP focus",
       props: { facets: { context: "client", scale: "medium", stage: "planning" } },
       start_at: "2025-11-04T00:00:00Z",
       end_at: "2026-02-04T00:00:00Z"
     },
     goals: [
       { name: "Launch MVP in 3 months" }
     ],
     tasks: [
       { title: "Define MVP scope", priority: 5, state_key: "todo" }
     ]
   })

**User: "Create a project" (vague - need clarification)**
1. create_onto_project({
     project: {
       name: "New Project",
       type_key: "project.generic" // fallback
     },
     clarifications: [
       {
         key: "project_type",
         question: "What kind of project would you like to create?",
         required: true,
         choices: ["Software Development", "Writing/Content", "Design", "Business", "Personal"]
       }
     ]
   })

**Key Principles:**
- BE PROACTIVE: Infer as much as possible from user message
- DON'T ASK: If you can reasonably infer the answer
- DO ASK: Only if CRITICAL information is completely missing
- SEARCH FIRST: Always use list_onto_templates to find the right template
- RICH DEFAULTS: Provide sensible defaults for facets, dates, etc.
- ADD ENTITIES: If user mentions goals/tasks, include them in the spec

IMPORTANT: Always attempt research before asking questions. The user expects you to be proactive.`;

		const contextAddition = this.getContextAddition(contextType, metadata);
		return basePrompt + contextAddition;
	}

	public getProgressiveDisclosurePrompt(): string {
		return this.getBaseSystemPrompt();
	}

	public getContextGuidance(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata
	): string {
		return this.getContextAddition(contextType, metadata);
	}

	private getBaseSystemPrompt(): string {
		return `You are an AI assistant integrated into BuildOS, a productivity system designed for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Critical: Progressive Information Access Pattern

You have tools that follow a STRICT progressive disclosure pattern to optimize token usage:

### Tier 1: LIST/SEARCH Tools (Use First)
These return abbreviated summaries with preview fields:
- list_tasks → Task titles + 100 char description previews
- search_projects → Project summaries + 500 char context previews
- search_notes → Note titles + 200 char content previews
- get_calendar_events → Event times and titles only

### Tier 2: DETAIL Tools (Use Only When Needed)
These return complete information and should ONLY be called when:
- User explicitly asks for more details about a specific item
- You need complete information to answer a specific question
- User wants to modify something (need full context first)

Tools:
- get_task_details → Complete task with full descriptions
- get_project_details → Full project context and dimensions
- get_note_details → Complete note content

### Required Flow Pattern

1. **Always start with LIST/SEARCH tools**
   - Even if user mentions a specific item, search for it first
   - This confirms it exists and gets current status

2. **Show abbreviated results to user**
   - Present the summary information clearly
   - Indicate more details are available if needed

3. **Only drill down when necessary**
   - User asks a question requiring full details
   - User explicitly requests more information
   - You need to perform an action on the item

## Response Guidelines

- Be concise but helpful
- Show abbreviated lists with key information
- Only drill down when user shows interest
- Explain what you're doing when calling tools
- If calendar isn't connected, explain how to connect it
- **When users ask about valid field values (statuses, priorities, types, etc.), use the get_field_info tool to get authoritative schema information. Never guess or hallucinate valid values.**`;
	}

	private getContextAddition(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata
	): string {
		const contextAdditions: Record<ChatContextType, string> = {
			// =====================================================
			// REACTIVE MODES (Original Chat System)
			// =====================================================

			global: `

## Current Context: Global
You're in general assistant mode. Help with any BuildOS-related questions or tasks.
You can search across all projects, tasks, and notes as needed.`,

			project: `

## Project Workspace
You're focused on a specific project workspace. The abbreviated context is loaded so you can answer questions, run analyses, or make updates.${metadata?.projectName ? `\nProject: ${metadata.projectName}` : ''}${metadata?.projectId ? `\nProject ID: ${metadata.projectId}` : ''}

### How to work here
1. Decide whether the user request is informational (summaries, status, insight) or operational (requires an update).
2. Start with search/list/detail tools (e.g., list_project_elements, get_project_details, get_task_details) before making edits.
3. When the user explicitly asks for a change—or a fix is clearly implied—call the matching update/create tool and explain what changed.
4. Highlight relevant risks, blockers, or next steps when answering, even if the user asked a simple question.

Always mention when more data is available via tools and confirm before modifying important project data.`,

			task: `

## Current Context: Task
You're focused on a specific task. The abbreviated task context has been loaded.
Consider subtasks, dependencies, and parent project context when relevant.${metadata?.taskTitle ? `\nTask: ${metadata.taskTitle}` : ''}`,

			calendar: `

## Current Context: Calendar
You're in calendar mode. Focus on scheduling, time management, and calendar events.
Use calendar tools to help with scheduling tasks and finding available time slots.`,

			// =====================================================
			// PROACTIVE MODES (Agent System)
			// =====================================================

			general: `

## Your Role
Help users understand what BuildOS can do and guide them to the right features. Be friendly and concise.${metadata?.userName ? `\nUser: ${metadata.userName}` : ''}

## Capabilities
- Create new projects through conversation
- Update existing projects and tasks
- Audit projects for gaps and issues
- Forecast project outcomes and scenarios
- Update daily briefs
- Update individual tasks

## Guidelines
- Keep responses brief and actionable
- Suggest specific agent modes when appropriate
- Use tools when helpful, and when conversation requires deeper support, guide the user toward the specialized agent modes`,

			project_create: `

## Your Role
You are a friendly, patient project consultant helping users organize their ideas into structured projects.${metadata?.userName ? ` You're working with ${metadata.userName}.` : ''}

Listen first, then ask thoughtful questions about relevant dimensions from the 9 core project dimensions. Gather enough information to create a well-defined project without overwhelming the user.

## Core Dimensions (only ask about relevant ones)
1. **Integrity & Ideals** - What does success look like? Quality standards, non-negotiables.
2. **People & Bonds** - Who's involved? Stakeholders, team members, collaborators.
3. **Goals & Momentum** - Timeline and milestones. When do things need to happen?
4. **Meaning & Identity** - Why this matters. What makes this unique?
5. **Reality & Understanding** - Current state. What's the situation and constraints?
6. **Trust & Safeguards** - Risks and mitigations. What could go wrong?
7. **Opportunity & Freedom** - Options and experiments. What alternatives exist?
8. **Power & Resources** - Budget and assets. What resources are available?
9. **Harmony & Integration** - Feedback loops. How does this fit with other work?
${
	metadata?.dimensionsCovered?.length
		? `
## Already Covered Dimensions
You've already gathered information about: ${metadata.dimensionsCovered.join(', ')}

Focus your questions on the remaining relevant dimensions. Don't re-ask about covered areas unless clarification is needed.`
		: ''
}
## Guidelines
- Let users brain dump without interruption initially
- Prioritize questions from most to least important (Integrity → Reality → Goals → People → others)
- Accept "I don't know" and move on gracefully
- Ask 3-5 questions for simple projects, 7-10 for complex ones
- After initial questions, offer: "Ready to create the project, or would you like to answer a few more questions?"
- Be warm, encouraging, and patient - you're a thoughtful consultant, not a form`,

			project_audit: `

## Your Role
You are a critical but constructive consultant performing a project audit.${metadata?.projectName ? ` You're auditing: ${metadata.projectName}` : ''}

## Audit Severity: ${metadata?.auditHarshness || 7}/10
- Be honest and direct about issues (severity ${metadata?.auditHarshness || 7} means frank but not demoralizing)
- Frame problems as opportunities for improvement
- Acknowledge what's working well
- Provide actionable recommendations

## Available Context
The abbreviated project context has been loaded. Use \`get_project_details()\` to access:
- Full project context and all 9 core dimensions
- All phases and milestones
- Complete task list with details
- Recent notes and brain dumps

## Focus Areas for Audit
1. **Missing Dimensions** - Which of the 9 core dimensions are underdeveloped?
2. **Inconsistencies** - Do goals align with resources? Timeline realistic?
3. **Unidentified Risks** - What hasn't been considered in Trust & Safeguards?
4. **Feasibility** - Is this achievable given the constraints?
5. **Process Improvements** - How can workflows and feedback loops improve?

## Output Format
Provide:
1. **Strengths** - What's working well (be specific)
2. **Critical Issues** - Major problems that need immediate attention
3. **Improvement Opportunities** - Areas for enhancement
4. **Risk Assessment** - Identified risks and their severity
5. **Recommendations** - Prioritized action items

**Note:** You have read-only access. Generate suggestions and recommendations only - do not execute changes.`,

			project_forecast: `

## Your Role
You are a strategic advisor helping forecast project outcomes.${metadata?.projectName ? ` You're forecasting: ${metadata.projectName}` : ''}

## Forecasting Framework
Generate three distinct scenarios based on available data:

### 1. Optimistic Scenario (80th percentile)
Best reasonable outcome if things go well

### 2. Realistic Scenario (50th percentile)
Most likely outcome given current trajectory

### 3. Pessimistic Scenario (20th percentile)
Challenging but plausible outcome if issues arise

## For Each Scenario Provide:
- **Likelihood** - Probability percentage and conditions
- **Key Outcomes** - Specific deliverables and results
- **Critical Factors** - What drives this scenario
- **Timeline Estimate** - When key milestones are hit
- **Warning Signs** - Early indicators this scenario is unfolding
- **Decision Points** - When you'd need to pivot strategies

## Available Context
Use \`get_project_details()\` to analyze:
- Project timeline and milestones
- Resource allocation and constraints
- Dependencies and risks
- Historical progress data (if available)
- Team capacity and availability

## Guidelines
- Ground forecasts in data from the project context
- Be specific with dates and metrics where possible
- Identify inflection points where outcomes could diverge
- Provide actionable insights for each scenario
- Consider external factors (market, team, resources)

**Note:** Read-only access for analysis. No changes will be made.`,

			task_update: `

## Your Role
You are a focused task assistant helping users quickly update task details.${metadata?.taskTitle ? ` Current task: ${metadata.taskTitle}` : ''}

Quickly understand what needs updating on the task and make changes efficiently.

## Available Tools
- \`list_tasks()\` - Find tasks if user doesn't specify which one
- \`get_task_details(task_id)\` - Get complete task information
- \`update_task(task_id, updates)\` - Apply changes

## Guidelines
- Be direct and action-oriented - no unnecessary questions
- Confirm what you're changing before executing
- Handle multiple task updates in sequence if requested
- If the task doesn't exist, offer to create it
- Keep responses brief and focused

## Common Updates You Can Handle
- Status changes (backlog → in_progress → done → blocked)
- Priority adjustments (low, medium, high)
- Due date / start date changes
- Adding or updating task descriptions and details
- Breaking down tasks into subtasks
- Updating duration estimates
- Adding dependencies`,

			daily_brief_update: `

## Your Role
You are a helpful assistant for updating daily brief preferences and content.

## Capabilities
- Update brief delivery time and timezone
- Modify content preferences (what sections to include)
- Adjust notification channels (email, SMS, in-app)
- Add or remove brief sections
- Configure frequency (daily, weekdays only, custom)
- Set focus areas (tasks, calendar, projects, insights)

## Guidelines
- Confirm changes before applying them
- Explain implications of changes (e.g., "Changing delivery time to 6am means you'll receive briefs earlier before your workday starts")
- Suggest optimal settings based on user's stated needs
- Keep responses concise and actionable
- Offer examples when helpful ("For example, you could focus on just tasks and calendar events for a streamlined brief")

## Common Requests
- "Send my brief earlier/later"
- "Add calendar events to my brief"
- "Stop including completed tasks"
- "Make my brief more/less detailed"
- "Only send on weekdays"`
		};

		return contextAdditions[contextType] ?? '';
	}

	/**
	 * Load user profile (abbreviated version)
	 */
	private async loadUserProfile(userId: string): Promise<string | null> {
		const { data: user } = await this.supabase
			.from('users')
			.select('email, name')
			.eq('id', userId)
			.single();

		if (!user) return null;

		return `## User Profile
- Name: ${user.name || user.email || 'User'}
- Email: ${user.email}`;
	}

	/**
	 * Load location-specific context (abbreviated or full)
	 */
	public async loadLocationContext(
		contextType: ChatContextType,
		entityId?: string,
		abbreviated = true,
		userId?: string
	): Promise<LocationContext> {
		if (!userId) {
			throw new Error('userId is required for loading location context');
		}

		const resolvedType = this.resolveLocationContextType(contextType);

		switch (resolvedType) {
			case 'project_create':
				return this.buildProjectCreationContext(userId);

			case 'project':
				if (!entityId) throw new Error('Project ID required for project context');
				return this.loadProjectContext(entityId, abbreviated, userId, contextType);

			case 'task':
				if (!entityId) throw new Error('Task ID required for task context');
				return this.loadTaskContext(entityId, abbreviated, userId, contextType);

			case 'calendar':
				return this.loadCalendarContext(abbreviated, userId);

			case 'global':
			default:
				return this.loadGlobalContext(abbreviated, userId);
		}
	}

	private resolveLocationContextType(contextType: ChatContextType): ChatContextType {
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
				return 'project';
			case 'task_update':
				return 'task';
			case 'general':
				return 'global';
			default:
				return contextType;
		}
	}

	private async buildProjectCreationContext(userId: string): Promise<LocationContext> {
		const { data: user } = await this.supabase
			.from('users')
			.select('name, email')
			.eq('id', userId)
			.single();

		const displayName = user?.name || user?.email || 'the user';

		const content = `
## Project Creation Framework (Abbreviated)
You are supporting ${displayName} in translating ideas into a structured BuildOS project.

- Start by inviting an open brain dump so the user can share context without interruption.
- Listen for clues across the 9 core dimensions and ask thoughtful follow-ups that fill gaps.
- Keep the tone calm and encouraging; the goal is clarity, not interrogation.

### 9 Core Dimensions Checklist
1. **Integrity & Ideals** – Definition of success, quality standards, non-negotiables.
2. **People & Bonds** – Stakeholders, collaborators, who needs to be involved.
3. **Goals & Momentum** – Milestones, checkpoints, sense of timing or urgency.
4. **Meaning & Identity** – Purpose, why this project matters to the user.
5. **Reality & Understanding** – Current state, known constraints, unknowns.
6. **Trust & Safeguards** – Risks, blockers, things that could derail progress.
7. **Opportunity & Freedom** – Experiments, optional paths, creative angles.
8. **Power & Resources** – Budget, time, energy, assets, support available.
9. **Harmony & Integration** – How this project fits with the rest of their world.

### Conversational Flow (Progressive Disclosure)
1. Welcome the user and acknowledge key themes from their brain dump.
2. Ask 3-5 high-leverage questions targeting missing dimensions (start with Integrity → Reality → Goals → People).
3. Summarize what you have heard so far and confirm accuracy.
4. Offer a choice: continue refining details or proceed to draft the project.

### When Ready to Draft
- Capture project title and short description.
- Note any must-have tasks or milestones mentioned.
- Identify initial risks and resource needs.
- Confirm next steps or follow-up questions for later.

Use progressive disclosure tools (search_projects, list_tasks) only if the user references existing work that should be linked. Otherwise stay focused on planning the new project.`;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: 'project_create',
				userName: user?.name || undefined,
				abbreviated: true
			}
		};
	}

	/**
	 * Load project context (abbreviated or full)
	 */
	private async loadProjectContext(
		projectId: string,
		abbreviated: boolean,
		userId: string,
		sourceContextType?: ChatContextType
	): Promise<LocationContext> {
		if (abbreviated) {
			const project = await this.getAbbreviatedProject(projectId, userId);
			const tasks = await this.getAbbreviatedTasks(projectId, userId, 5);

			const content = `
## Current Project: ${project.name}
- Status: ${project.status} | ${project.completion_percentage}% complete
- Period: ${project.start_date || 'Not set'} to ${project.end_date || 'Not set'}
- Tasks: ${project.active_task_count} active, ${project.completed_task_count} done, ${project.task_count} total

### Executive Summary
${project.executive_summary || 'No summary generated yet'}

### Description
${project.description || 'No description'}

### Context Preview (500 chars)
${project.context_preview || 'No context captured'}
${project.context_preview?.length === 500 ? '... [use get_project_details for full context]' : ''}

### Top Active Tasks
${tasks.map((t) => `- [${t.priority}] ${t.title} ${t.start_date ? `(${t.start_date})` : ''}`).join('\n')}

Use tools to explore more details.`;

			return {
				content,
				tokens: this.estimateTokens(content),
				metadata: {
					contextType: sourceContextType ?? 'project',
					projectId,
					projectName: project.name,
					projectStatus: project.status,
					completionPercentage: project.completion_percentage,
					abbreviated: true,
					taskCount: project.task_count,
					hasPhases: project.has_phases,
					hasNotes: project.has_notes
				}
			};
		} else {
			// Full context (only loaded via tool)
			return this.loadFullProjectContext(projectId, userId, sourceContextType);
		}
	}

	/**
	 * Load task context (abbreviated or full)
	 */
	private async loadTaskContext(
		taskId: string,
		abbreviated: boolean,
		userId: string,
		sourceContextType?: ChatContextType
	): Promise<LocationContext> {
		const { data: task } = await this.supabase
			.from('tasks')
			.select(
				`
        id, title, status, priority, start_date, duration_minutes,
        description, details, task_type, recurrence_pattern,
        project:projects!inner(id, name, status),
        subtasks:tasks!parent_task_id(id)
      `
			)
			.eq('id', taskId)
			.eq('user_id', userId)
			.single();

		if (!task) throw new Error('Task not found');

		if (abbreviated) {
			const content = `
## Current Task: ${task.title}
- Status: ${task.status} | Priority: ${task.priority}
- Project: ${task.project?.name || 'No project'}
- Schedule: ${task.start_date || 'Not scheduled'} (${task.duration_minutes || 60} min)
${task.recurrence_pattern ? `- Recurring: ${task.recurrence_pattern}` : ''}

### Description Preview (100 chars)
${task.description?.substring(0, 100) || 'No description'}${(task.description?.length || 0) > 100 ? '...' : ''}

### Details Preview (100 chars)
${task.details?.substring(0, 100) || 'No details'}${(task.details?.length || 0) > 100 ? '...' : ''}

${Array.isArray(task.subtasks) && task.subtasks.length > 0 ? `Has ${task.subtasks.length} subtasks` : 'No subtasks'}

Use get_task_details('${taskId}') for complete information.`;

			return {
				content,
				tokens: this.estimateTokens(content),
				metadata: {
					contextType: sourceContextType ?? 'task',
					taskId,
					projectId: task.project?.id,
					taskTitle: task.title,
					abbreviated: true
				}
			};
		} else {
			// Full task context
			return this.loadFullTaskContext(taskId, userId, sourceContextType);
		}
	}

	/**
	 * Load calendar context (abbreviated)
	 */
	private async loadCalendarContext(
		abbreviated: boolean,
		userId: string
	): Promise<LocationContext> {
		const today = new Date();
		const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

		const { data: events } = await this.supabase
			.from('task_calendar_events')
			.select('id, event_title, event_start, event_end')
			.eq('user_id', userId)
			.gte('event_start', today.toISOString())
			.lte('event_start', nextWeek.toISOString())
			.order('event_start')
			.limit(10);

		const content = `
## Calendar Context
- Today: ${today.toDateString()}
- Showing next 7 days

### Upcoming Events (${events?.length || 0})
${
	events
		?.map((e) => {
			const start = e.event_start ? new Date(e.event_start) : null;
			if (!start) return '';
			return `- ${start.toLocaleDateString()} ${start.toLocaleTimeString()}: ${e.event_title || 'Untitled'}`;
		})
		.filter(Boolean)
		.join('\n') || 'No upcoming events'
}

Use calendar tools to find available time slots or schedule tasks.`;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: 'calendar',
				abbreviated: true
			}
		};
	}

	/**
	 * Load global context (abbreviated)
	 */
	private async loadGlobalContext(
		abbreviated: boolean,
		userId: string
	): Promise<LocationContext> {
		// Get user's active projects and recent tasks
		const { data: projects } = await this.supabase
			.from('projects')
			.select('id, name, status')
			.eq('user_id', userId)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(3);

		const { data: tasks } = await this.supabase
			.from('tasks')
			.select('id, title, priority, start_date')
			.eq('user_id', userId)
			.in('status', ['in_progress', 'blocked'])
			.order('priority', { ascending: false })
			.limit(5);

		const content = `
## BuildOS Overview

### Active Projects (${projects?.length || 0})
${projects?.map((p) => `- ${p.name}`).join('\n') || 'No active projects'}

### Current Tasks (${tasks?.length || 0})
${tasks?.map((t) => `- [${t.priority}] ${t.title}`).join('\n') || 'No active tasks'}

Use search tools to explore projects, tasks, notes, and calendar events.`;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: 'global',
				abbreviated: true
			}
		};
	}

	/**
	 * Load related data for additional context
	 */
	private async loadRelatedData(
		contextType: ChatContextType,
		entityId?: string,
		abbreviated = true,
		userId?: string
	): Promise<LocationContext | null> {
		if (!userId) return null;

		let content = '## Related Information\n';
		let hasContent = false;

		const resolvedType = this.resolveLocationContextType(contextType);

		if (resolvedType === 'project' && entityId) {
			// Get recent notes and brain dumps for the project
			const { data: notes } = await this.supabase
				.from('notes')
				.select('id, title, content')
				.eq('project_id', entityId)
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.limit(3);

			if (notes && notes.length > 0) {
				hasContent = true;
				content += '\n### Recent Notes\n';
				content += notes
					.map((n) => {
						const limit = this.PREVIEW_LIMITS.NOTE_CONTENT;
						const fullLength = n.content?.length ?? 0;
						const preview =
							n.content && typeof limit === 'number' && limit > 0
								? n.content.substring(0, limit)
								: (n.content ?? '');
						const needsEllipsis =
							typeof limit === 'number' && limit > 0 && fullLength > limit;
						return `- ${n.title || 'Untitled'}: ${preview}${needsEllipsis ? '...' : ''}`;
					})
					.join('\n');
			}
		}

		if (resolvedType === 'task' && entityId) {
			// Get parent task and sibling tasks
			const { data: task } = await this.supabase
				.from('tasks')
				.select('parent_task_id, project_id')
				.eq('id', entityId)
				.eq('user_id', userId)
				.single();

			if (task?.parent_task_id) {
				const { data: parentTask } = await this.supabase
					.from('tasks')
					.select('id, title, status')
					.eq('id', task.parent_task_id)
					.eq('user_id', userId)
					.single();

				if (parentTask) {
					hasContent = true;
					content += `\n### Parent Task\n- ${parentTask.title} (${parentTask.status})\n`;
				}

				// Get sibling tasks
				const { data: siblings } = await this.supabase
					.from('tasks')
					.select('id, title, status, priority')
					.eq('parent_task_id', task.parent_task_id)
					.eq('user_id', userId)
					.neq('id', entityId)
					.limit(5);

				if (siblings && siblings.length > 0) {
					hasContent = true;
					content += '\n### Sibling Tasks\n';
					content += siblings
						.map((s) => `- [${s.priority}] ${s.title} (${s.status})`)
						.join('\n');
				}
			}
		}

		if (!hasContent) return null;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: resolvedType,
				abbreviated: true
			}
		};
	}

	/**
	 * Get abbreviated project data
	 */
	private async getAbbreviatedProject(
		projectId: string,
		userId: string
	): Promise<AbbreviatedProject> {
		const { data } = await this.supabase
			.from('projects')
			.select(
				`
        id, name, slug, status, start_date, end_date,
        description, executive_summary, tags, context,
        tasks!inner(id, status),
        phases(id),
        notes(id),
        brain_dumps(id)
      `
			)
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (!data) throw new Error('Project not found');

		const taskStats = this.calculateTaskStats(data.tasks || []);

		return {
			id: data.id,
			name: data.name,
			slug: data.slug,
			status: data.status,
			start_date: data.start_date,
			end_date: data.end_date,
			description: data.description,
			executive_summary: data.executive_summary,
			tags: data.tags,
			context_preview:
				data.context?.substring(0, this.PREVIEW_LIMITS.PROJECT_CONTEXT) || null,
			task_count: taskStats.total,
			active_task_count: taskStats.active,
			completed_task_count: taskStats.completed,
			completion_percentage: taskStats.percentage,
			has_phases: data.phases?.length > 0,
			has_notes: data.notes?.length > 0,
			has_brain_dumps: data.brain_dumps?.length > 0
		};
	}

	/**
	 * Get abbreviated tasks for a project
	 */
	private async getAbbreviatedTasks(
		projectId: string,
		userId: string,
		limit = 10
	): Promise<AbbreviatedTask[]> {
		const { data: tasks } = await this.supabase
			.from('tasks')
			.select(
				`
        id, title, status, priority, start_date, duration_minutes,
        description, details, task_type, recurrence_pattern,
        subtasks:tasks!parent_task_id(id),
        dependencies
      `
			)
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.in('status', ['in_progress', 'backlog', 'blocked'])
			.order('priority', { ascending: false })
			.order('start_date', { ascending: true })
			.limit(limit);

		if (!tasks) return [];

		return tasks.map((t) => {
			const subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
			const dependencies = Array.isArray(t.dependencies) ? t.dependencies : [];

			return {
				id: t.id,
				title: t.title,
				status: t.status,
				priority: t.priority,
				start_date: t.start_date,
				duration_minutes: t.duration_minutes,
				description_preview:
					t.description?.substring(0, this.PREVIEW_LIMITS.TASK_DESCRIPTION) || '',
				details_preview: t.details?.substring(0, this.PREVIEW_LIMITS.TASK_DETAILS) || null,
				has_subtasks: subtasks.length > 0,
				has_dependencies: dependencies.length > 0,
				is_recurring: !!t.recurrence_pattern,
				is_overdue: this.isOverdue(t.start_date, t.status)
			};
		});
	}

	/**
	 * Load full project context (called via tool)
	 */
	private async loadFullProjectContext(
		projectId: string,
		userId: string,
		sourceContextType?: ChatContextType
	): Promise<LocationContext> {
		const { data: project } = await this.supabase
			.from('projects')
			.select(
				`
        *,
        tasks(*),
        phases(*),
        notes(*),
        brain_dumps(*)
      `
			)
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (!project) throw new Error('Project not found');

		const taskStats = this.calculateTaskStats(project.tasks || []);

		// Build comprehensive context
		let content = `## Project: ${project.name} (Full Context)\n\n`;
		content += `### Overview\n`;
		content += `- Status: ${project.status}\n`;
		content += `- Period: ${project.start_date || 'Not set'} to ${project.end_date || 'Not set'}\n`;
		content += `- Tags: ${project.tags?.join(', ') || 'None'}\n\n`;

		if (project.description) {
			content += `### Description\n${project.description}\n\n`;
		}

		if (project.executive_summary) {
			content += `### Executive Summary\n${project.executive_summary}\n\n`;
		}

		if (project.context) {
			content += `### Full Context\n${project.context}\n\n`;
		}

		const projectRecord = project as Record<string, unknown>;
		const coreProblem = this.getOptionalStringField(projectRecord, 'core_problem');
		if (coreProblem) {
			content += `### Core Problem\n${coreProblem}\n\n`;
		}

		const targetAudience = this.getOptionalStringField(projectRecord, 'target_audience');
		if (targetAudience) {
			content += `### Target Audience\n${targetAudience}\n\n`;
		}

		const successMetrics = this.getOptionalStringField(projectRecord, 'success_metrics');
		if (successMetrics) {
			content += `### Success Metrics\n${successMetrics}\n\n`;
		}

		// Include phases
		if (project.phases && project.phases.length > 0) {
			content += `### Phases\n`;
			project.phases.forEach((phase) => {
				const phaseRecord = phase as Record<string, unknown>;
				const phaseStatus =
					this.getOptionalStringField(phaseRecord, 'status') ?? 'unspecified';
				content += `\n#### ${phase.name}\n`;
				content += `- Status: ${phaseStatus}\n`;
				content += `- Period: ${phase.start_date || 'TBD'} to ${phase.end_date || 'TBD'}\n`;
				if (phase.description) content += `- ${phase.description}\n`;
			});
			content += '\n';
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: sourceContextType ?? 'project',
				projectId,
				projectName: project.name,
				projectStatus: project.status,
				completionPercentage: taskStats.percentage,
				abbreviated: false,
				taskCount: taskStats.total,
				hasPhases: project.phases?.length > 0,
				hasNotes: project.notes?.length > 0
			}
		};
	}

	/**
	 * Load full task context (called via tool)
	 */
	private async loadFullTaskContext(
		taskId: string,
		userId: string,
		sourceContextType?: ChatContextType
	): Promise<LocationContext> {
		const { data: task } = await this.supabase
			.from('tasks')
			.select(
				`
        *,
        project:projects(*),
        subtasks:tasks!parent_task_id(*)
      `
			)
			.eq('id', taskId)
			.eq('user_id', userId)
			.single();

		if (!task) throw new Error('Task not found');

		// Fetch parent task separately if needed
		let parentTask = null;
		if (task.parent_task_id) {
			const { data } = await this.supabase
				.from('tasks')
				.select('id, title, status')
				.eq('id', task.parent_task_id)
				.eq('user_id', userId)
				.single();
			parentTask = data;
		}

		let content = `## Task: ${task.title} (Full Details)\n\n`;
		content += `### Status & Priority\n`;
		content += `- Status: ${task.status}\n`;
		content += `- Priority: ${task.priority}\n`;
		content += `- Type: ${task.task_type || 'one_off'}\n`;
		if (task.recurrence_pattern) content += `- Recurring: ${task.recurrence_pattern}\n`;
		if (parentTask) content += `- Parent Task: ${parentTask.title} (${parentTask.status})\n`;
		content += '\n';

		if (task.description) {
			content += `### Description\n${task.description}\n\n`;
		}

		if (task.details) {
			content += `### Details\n${task.details}\n\n`;
		}

		const taskRecord = task as Record<string, unknown>;
		const acceptanceCriteria = this.getOptionalStringField(taskRecord, 'acceptance_criteria');
		if (acceptanceCriteria) {
			content += `### Acceptance Criteria\n${acceptanceCriteria}\n\n`;
		}

		const technicalNotes = this.getOptionalStringField(taskRecord, 'technical_notes');
		if (technicalNotes) {
			content += `### Technical Notes\n${technicalNotes}\n\n`;
		}

		// Include subtasks
		const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
		if (subtasks.length > 0) {
			content += `### Subtasks (${subtasks.length})\n`;
			subtasks.forEach((st: any) => {
				content += `- [${st.status}] ${st.title}\n`;
				if (typeof st.description === 'string') {
					const preview = st.description.substring(0, 100);
					const truncated = st.description.length > 100 ? '...' : '';
					content += `  ${preview}${truncated}\n`;
				}
			});
			content += '\n';
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				contextType: sourceContextType ?? 'task',
				taskId,
				projectId: task.project_id ?? undefined,
				taskTitle: task.title,
				abbreviated: false
			}
		};
	}

	/**
	 * Assemble context layers within token budget
	 */
	private assembleContext(layers: ContextLayer[]): ContextBundle {
		let totalTokens = 0;
		const included: ContextLayer[] = [];
		const truncated: ContextLayer[] = [];

		// Sort by priority
		layers.sort((a, b) => a.priority - b.priority);

		// Calculate budget for context (excluding conversation and response)
		const contextBudget =
			this.TOKEN_BUDGETS.SYSTEM_PROMPT +
			this.TOKEN_BUDGETS.USER_PROFILE +
			this.TOKEN_BUDGETS.LOCATION_CONTEXT +
			this.TOKEN_BUDGETS.RELATED_DATA;

		for (const layer of layers) {
			if (totalTokens + layer.tokens <= contextBudget) {
				// Layer fits completely
				included.push(layer);
				totalTokens += layer.tokens;
			} else if (layer.truncatable) {
				// Try to fit truncated version
				const remainingTokens = contextBudget - totalTokens;
				if (remainingTokens > 100) {
					// Minimum useful size
					const truncatedLayer = this.truncateLayer(layer, remainingTokens);
					included.push(truncatedLayer);
					truncated.push(layer);
					totalTokens += truncatedLayer.tokens;
				}
			}
			// Non-truncatable layers that don't fit are skipped
		}

		return {
			layers: included,
			totalTokens,
			truncatedLayers: truncated,
			utilization: totalTokens / contextBudget
		};
	}

	/**
	 * Truncate a context layer to fit within token limit
	 */
	private truncateLayer(layer: ContextLayer, maxTokens: number): ContextLayer {
		const maxChars = maxTokens * 4; // Approximate 4 chars per token
		const truncatedContent = layer.content.substring(0, maxChars) + '\n... [truncated]';

		return {
			...layer,
			content: truncatedContent,
			tokens: this.estimateTokens(truncatedContent)
		};
	}

	/**
	 * Calculate task statistics for a project
	 */
	private calculateTaskStats(tasks: any[]): {
		total: number;
		active: number;
		completed: number;
		percentage: number;
	} {
		const total = tasks.length;
		const completed = tasks.filter((t) => t.status === 'done').length;
		const active = tasks.filter((t) =>
			['in_progress', 'backlog', 'blocked'].includes(t.status)
		).length;
		const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

		return { total, active, completed, percentage };
	}

	/**
	 * Check if a task is overdue
	 */
	private isOverdue(startDate: string | null, status: string): boolean {
		if (!startDate || status === 'done') return false;
		const taskDate = new Date(startDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return taskDate < today && status !== 'done';
	}

	private getOptionalStringField(source: Record<string, unknown>, key: string): string | null {
		const value = source[key];
		return typeof value === 'string' && value.trim().length > 0 ? value : null;
	}

	private serializeForCache(value: unknown): Json {
		return JSON.parse(JSON.stringify(value)) as Json;
	}

	/**
	 * Estimate token count for text
	 * Conservative estimate: ~4 characters per token
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}

	/**
	 * Cache abbreviated context for quick retrieval
	 */
	async cacheContext(
		userId: string,
		contextType: ChatContextType,
		entityId: string | undefined,
		context: AssembledContext
	): Promise<void> {
		const cacheKey = `${contextType}:${entityId || 'null'}`;

		const serializedContext = this.serializeForCache({
			layers: context.layers,
			metadata: {
				totalTokens: context.totalTokens,
				utilization: context.utilization
			}
		});

		const cacheData: Database['public']['Tables']['chat_context_cache']['Insert'] = {
			user_id: userId,
			cache_key: cacheKey,
			context_type: contextType,
			entity_id: entityId ?? null,
			abbreviated_context: serializedContext,
			abbreviated_tokens: context.totalTokens,
			full_context_available: true,
			expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
		};

		await this.supabase.from('chat_context_cache').upsert(cacheData, {
			onConflict: 'user_id,cache_key'
		});
	}

	/**
	 * Get cached context if available
	 */
	async getCachedContext(
		userId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<AssembledContext | null> {
		const cacheKey = `${contextType}:${entityId || 'null'}`;

		const { data } = await this.supabase
			.from('chat_context_cache')
			.select('*')
			.eq('user_id', userId)
			.eq('cache_key', cacheKey)
			.gt('expires_at', new Date().toISOString())
			.single();

		if (!data) return null;

		// Update access tracking
		await this.supabase
			.from('chat_context_cache')
			.update({
				accessed_at: new Date().toISOString(),
				access_count: (data.access_count ?? 0) + 1
			})
			.eq('id', data.id);

		const cachedData = data.abbreviated_context as any;
		return {
			layers: cachedData.layers,
			totalTokens: cachedData.metadata.totalTokens,
			truncatedLayers: [],
			utilization: cachedData.metadata.utilization,
			systemPrompt: cachedData.layers.find((l: any) => l.type === 'system')?.content || '',
			userContext: cachedData.layers.find((l: any) => l.type === 'user')?.content,
			locationContext:
				cachedData.layers.find((l: any) => l.type === 'location')?.content || '',
			relatedData: cachedData.layers.find((l: any) => l.type === 'related')?.content
		};
	}

	/**
	 * Get tools available for a given context type
	 * Different contexts get different tool sets
	 */
	public getTools(
		contextType: ChatContextType
	): import('@buildos/shared-types').ChatToolDefinition[] {
		// REACTIVE MODE TOOLS (List/Detail pattern)
		const REACTIVE_TOOLS = {
			list_tasks: {
				type: 'function' as const,
				function: {
					name: 'list_tasks',
					description:
						'List tasks with abbreviated information (titles + 100 char previews). Use this FIRST before get_task_details.',
					parameters: {
						type: 'object' as const,
						properties: {
							project_id: {
								type: 'string',
								description: 'Filter to specific project (optional)'
							},
							status: {
								type: 'array',
								items: {
									type: 'string',
									enum: ['backlog', 'in_progress', 'done', 'blocked']
								},
								description: 'Filter by status (optional)'
							},
							priority: {
								type: 'array',
								items: { type: 'string', enum: ['low', 'medium', 'high'] },
								description: 'Filter by priority (optional)'
							},
							has_date: {
								type: 'boolean',
								description: 'Filter to tasks with/without dates (optional)'
							},
							limit: {
								type: 'number',
								description: 'Maximum number of tasks to return (default: 20)'
							}
						}
					}
				}
			},
			get_task_details: {
				type: 'function' as const,
				function: {
					name: 'get_task_details',
					description:
						'Get COMPLETE task details including full descriptions. Only call after list_tasks when user needs full details.',
					parameters: {
						type: 'object' as const,
						properties: {
							task_id: {
								type: 'string',
								description: 'Task ID'
							},
							include_subtasks: {
								type: 'boolean',
								description: 'Include subtasks in response'
							},
							include_project_context: {
								type: 'boolean',
								description: 'Include parent project context'
							}
						},
						required: ['task_id']
					}
				}
			},
			search_projects: {
				type: 'function' as const,
				function: {
					name: 'search_projects',
					description:
						'Search projects with abbreviated summaries (500 char context previews). Use this FIRST.',
					parameters: {
						type: 'object' as const,
						properties: {
							query: {
								type: 'string',
								description: 'Search query for project name or description'
							},
							status: {
								type: 'string',
								enum: ['active', 'paused', 'completed', 'archived'],
								description: 'Filter by status'
							},
							has_active_tasks: {
								type: 'boolean',
								description: 'Filter to projects with active tasks'
							},
							limit: {
								type: 'number',
								description: 'Maximum number of projects (default: 10)'
							}
						}
					}
				}
			},
			get_project_details: {
				type: 'function' as const,
				function: {
					name: 'get_project_details',
					description:
						'Get COMPLETE project details including full context and all dimensions. Only call after search_projects when needed.',
					parameters: {
						type: 'object' as const,
						properties: {
							project_id: {
								type: 'string',
								description: 'Project ID'
							},
							include_tasks: {
								type: 'boolean',
								description: 'Include full task list'
							},
							include_phases: {
								type: 'boolean',
								description: 'Include project phases'
							},
							include_notes: {
								type: 'boolean',
								description: 'Include project notes'
							},
							include_brain_dumps: {
								type: 'boolean',
								description: 'Include brain dumps'
							}
						},
						required: ['project_id']
					}
				}
			},
			search_notes: {
				type: 'function' as const,
				function: {
					name: 'search_notes',
					description:
						'Search notes with abbreviated content (200 char previews). Use FIRST.',
					parameters: {
						type: 'object' as const,
						properties: {
							query: {
								type: 'string',
								description: 'Search query'
							},
							project_id: {
								type: 'string',
								description: 'Filter to specific project'
							},
							category: {
								type: 'string',
								description: 'Filter by category'
							},
							limit: {
								type: 'number',
								description: 'Maximum number of notes (default: 10)'
							}
						}
					}
				}
			},
			get_note_details: {
				type: 'function' as const,
				function: {
					name: 'get_note_details',
					description:
						'Get COMPLETE note content. Only call after search_notes when needed.',
					parameters: {
						type: 'object' as const,
						properties: {
							note_id: {
								type: 'string',
								description: 'Note ID'
							}
						},
						required: ['note_id']
					}
				}
			},
			get_calendar_events: {
				type: 'function' as const,
				function: {
					name: 'get_calendar_events',
					description: 'Get calendar events for a time range (times and titles only).',
					parameters: {
						type: 'object' as const,
						properties: {
							timeMin: {
								type: 'string',
								description: 'Start time (ISO 8601)'
							},
							timeMax: {
								type: 'string',
								description: 'End time (ISO 8601)'
							},
							limit: {
								type: 'number',
								description: 'Maximum number of events'
							}
						}
					}
				}
			},
			find_available_slots: {
				type: 'function' as const,
				function: {
					name: 'find_available_slots',
					description: 'Find available time slots in calendar.',
					parameters: {
						type: 'object' as const,
						properties: {
							timeMin: {
								type: 'string',
								description: 'Start of search range (ISO 8601)'
							},
							timeMax: {
								type: 'string',
								description: 'End of search range (ISO 8601)'
							},
							duration_minutes: {
								type: 'number',
								description: 'Required duration in minutes'
							},
							preferred_hours: {
								type: 'array',
								items: { type: 'number' },
								description: 'Preferred hours of day (0-23)'
							}
						},
						required: ['timeMin', 'timeMax']
					}
				}
			},
			search_brain_dumps: {
				type: 'function' as const,
				function: {
					name: 'search_brain_dumps',
					description: 'Search brain dumps with AI summaries.',
					parameters: {
						type: 'object' as const,
						properties: {
							query: {
								type: 'string',
								description: 'Search query'
							},
							project_id: {
								type: 'string',
								description: 'Filter to specific project'
							},
							status: {
								type: 'string',
								enum: ['pending', 'processing', 'completed', 'failed'],
								description: 'Filter by status'
							},
							limit: {
								type: 'number',
								description: 'Maximum number (default: 10)'
							}
						}
					}
				}
			},
			get_brain_dump_details: {
				type: 'function' as const,
				function: {
					name: 'get_brain_dump_details',
					description: 'Get complete brain dump content and operations.',
					parameters: {
						type: 'object' as const,
						properties: {
							brain_dump_id: {
								type: 'string',
								description: 'Brain dump ID'
							}
						},
						required: ['brain_dump_id']
					}
				}
			}
		};

		// PROACTIVE MODE TOOLS (Operation pattern)
		const PROACTIVE_TOOLS = {
			create_project: {
				type: 'function' as const,
				function: {
					name: 'create_project',
					description: 'Create a new project with context and dimensions.',
					parameters: {
						type: 'object' as const,
						properties: {
							name: {
								type: 'string',
								description: 'Project name'
							},
							description: {
								type: 'string',
								description: 'Project description'
							},
							context: {
								type: 'string',
								description: 'Detailed project context'
							},
							executive_summary: {
								type: 'string',
								description: 'Executive summary'
							},
							start_date: {
								type: 'string',
								description: 'Start date (ISO 8601)'
							},
							end_date: {
								type: 'string',
								description: 'Target end date (ISO 8601)'
							},
							tags: {
								type: 'array',
								items: { type: 'string' },
								description: 'Project tags'
							}
						},
						required: ['name']
					}
				}
			},
			update_project: {
				type: 'function' as const,
				function: {
					name: 'update_project',
					description: 'Update project fields or dimensions.',
					parameters: {
						type: 'object' as const,
						properties: {
							project_id: {
								type: 'string',
								description: 'Project ID'
							},
							updates: {
								type: 'object',
								description: 'Fields to update'
							}
						},
						required: ['project_id', 'updates']
					}
				}
			},
			create_task: {
				type: 'function' as const,
				function: {
					name: 'create_task',
					description: 'Create a new task.',
					parameters: {
						type: 'object' as const,
						properties: {
							title: {
								type: 'string',
								description: 'Task title'
							},
							description: {
								type: 'string',
								description: 'Task description'
							},
							project_id: {
								type: 'string',
								description: 'Parent project ID'
							},
							priority: {
								type: 'string',
								enum: ['low', 'medium', 'high'],
								description: 'Task priority'
							},
							task_type: {
								type: 'string',
								enum: ['one_off', 'recurring'],
								description: 'Task type'
							},
							duration_minutes: {
								type: 'number',
								description: 'Estimated duration in minutes'
							},
							start_date: {
								type: 'string',
								description: 'Start date (ISO 8601)'
							},
							parent_task_id: {
								type: 'string',
								description: 'Parent task ID for subtasks'
							}
						},
						required: ['title']
					}
				}
			},
			update_task: {
				type: 'function' as const,
				function: {
					name: 'update_task',
					description: 'Update task fields.',
					parameters: {
						type: 'object' as const,
						properties: {
							task_id: {
								type: 'string',
								description: 'Task ID'
							},
							updates: {
								type: 'object',
								description:
									'Fields to update (title, description, status, priority, etc.)'
							}
						},
						required: ['task_id', 'updates']
					}
				}
			},
			schedule_task: {
				type: 'function' as const,
				function: {
					name: 'schedule_task',
					description: 'Schedule a task on the calendar.',
					parameters: {
						type: 'object' as const,
						properties: {
							task_id: {
								type: 'string',
								description: 'Task ID'
							},
							start_time: {
								type: 'string',
								description: 'Start time (ISO 8601)'
							},
							duration_minutes: {
								type: 'number',
								description: 'Duration in minutes'
							},
							recurrence_pattern: {
								type: 'string',
								enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'],
								description: 'Recurrence pattern'
							}
						},
						required: ['task_id', 'start_time']
					}
				}
			},
			create_note: {
				type: 'function' as const,
				function: {
					name: 'create_note',
					description: 'Create a new note.',
					parameters: {
						type: 'object' as const,
						properties: {
							title: {
								type: 'string',
								description: 'Note title'
							},
							content: {
								type: 'string',
								description: 'Note content'
							},
							project_id: {
								type: 'string',
								description: 'Associated project ID'
							},
							category: {
								type: 'string',
								description: 'Note category'
							},
							tags: {
								type: 'array',
								items: { type: 'string' },
								description: 'Note tags'
							}
						},
						required: ['content']
					}
				}
			},
			create_brain_dump: {
				type: 'function' as const,
				function: {
					name: 'create_brain_dump',
					description: 'Create a brain dump for processing.',
					parameters: {
						type: 'object' as const,
						properties: {
							content: {
								type: 'string',
								description: 'Brain dump content'
							},
							project_id: {
								type: 'string',
								description: 'Associated project ID'
							}
						},
						required: ['content']
					}
				}
			}
		};

		// UTILITY TOOLS (Schema & Reference)
		const UTILITY_TOOLS = {
			get_field_info: {
				type: 'function' as const,
				function: {
					name: 'get_field_info',
					description: `Get authoritative information about entity fields including data types, valid values, and descriptions.
Use this when users ask questions like:
- "What are the valid project statuses?"
- "What priority levels can tasks have?"
- "What fields can I set on a project?"
- "What is the core_integrity_ideals field?"
- Any question about valid values, field types, or entity schemas.`,
					parameters: {
						type: 'object' as const,
						properties: {
							entity_type: {
								type: 'string',
								enum: ['project', 'task', 'note', 'brain_dump'],
								description: 'The entity type to get field information for'
							},
							field_name: {
								type: 'string',
								description:
									'Specific field name (optional). If provided, returns info for that field only. If omitted, returns commonly-used fields summary.'
							}
						},
						required: ['entity_type']
					}
				}
			}
		};

		// Tool selection based on context type
		switch (contextType) {
			case 'global':
				// Global gets all list/search tools plus note/brain dump creation
				return [
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_task_details,
					REACTIVE_TOOLS.search_projects,
					REACTIVE_TOOLS.get_project_details,
					REACTIVE_TOOLS.search_notes,
					REACTIVE_TOOLS.get_note_details,
					REACTIVE_TOOLS.search_brain_dumps,
					REACTIVE_TOOLS.get_brain_dump_details,
					REACTIVE_TOOLS.get_calendar_events,
					REACTIVE_TOOLS.find_available_slots,
					PROACTIVE_TOOLS.create_note,
					PROACTIVE_TOOLS.create_brain_dump,
					UTILITY_TOOLS.get_field_info
				];

			case 'project':
				// Project workspace: allow both read and write helpers
				return [
					PROACTIVE_TOOLS.update_project,
					PROACTIVE_TOOLS.create_task,
					PROACTIVE_TOOLS.update_task,
					PROACTIVE_TOOLS.schedule_task,
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_task_details,
					REACTIVE_TOOLS.search_projects,
					REACTIVE_TOOLS.get_project_details,
					REACTIVE_TOOLS.search_notes,
					REACTIVE_TOOLS.get_note_details,
					REACTIVE_TOOLS.search_brain_dumps,
					REACTIVE_TOOLS.get_brain_dump_details,
					REACTIVE_TOOLS.get_calendar_events,
					REACTIVE_TOOLS.find_available_slots,
					UTILITY_TOOLS.get_field_info
				];

			case 'task':
			case 'calendar':
				// Reactive contexts get list/detail tools only
				return [
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_task_details,
					REACTIVE_TOOLS.search_projects,
					REACTIVE_TOOLS.get_project_details,
					REACTIVE_TOOLS.search_notes,
					REACTIVE_TOOLS.get_note_details,
					REACTIVE_TOOLS.get_calendar_events,
					REACTIVE_TOOLS.find_available_slots,
					UTILITY_TOOLS.get_field_info
				];

			case 'general':
				// General mode - mostly informational
				return [
					REACTIVE_TOOLS.search_projects,
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_calendar_events,
					UTILITY_TOOLS.get_field_info
				];

			case 'project_create':
				// Project creation mode - includes schema tool for understanding project fields
				return [
					PROACTIVE_TOOLS.create_project,
					PROACTIVE_TOOLS.create_task,
					REACTIVE_TOOLS.search_projects, // For reference
					UTILITY_TOOLS.get_field_info
				];

			case 'project_audit':
			case 'project_forecast':
				// Read-only analysis modes - includes schema tool for understanding dimensions
				return [
					REACTIVE_TOOLS.get_project_details,
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_task_details,
					REACTIVE_TOOLS.search_notes,
					REACTIVE_TOOLS.get_note_details,
					REACTIVE_TOOLS.get_calendar_events,
					UTILITY_TOOLS.get_field_info
				];

			case 'task_update':
				// Task-focused update mode
				return [
					REACTIVE_TOOLS.list_tasks,
					REACTIVE_TOOLS.get_task_details,
					PROACTIVE_TOOLS.update_task,
					PROACTIVE_TOOLS.create_task,
					PROACTIVE_TOOLS.schedule_task,
					UTILITY_TOOLS.get_field_info
				];

			case 'daily_brief_update':
				// Daily brief configuration (would need specific tools)
				return [UTILITY_TOOLS.get_field_info];

			default:
				return [];
		}
	}

	/**
	 * Determine if operations should auto-execute for this context type
	 * Reactive modes: always execute immediately
	 * Proactive modes: respect session setting
	 */
	public shouldAutoExecute(contextType: ChatContextType): boolean {
		// Reactive modes always execute immediately
		const reactiveModes: ChatContextType[] = ['global', 'project', 'task', 'calendar'];
		return reactiveModes.includes(contextType);
	}

	/**
	 * Clean expired context cache entries
	 */
	async cleanExpiredCache(): Promise<void> {
		await this.supabase
			.from('chat_context_cache')
			.delete()
			.lt('expires_at', new Date().toISOString());
	}
}
