// apps/web/src/lib/services/prompts/core/prompt-components.ts
/**
 * Atomic components for prompt generation
 * These are reusable building blocks that eliminate duplication across prompts
 */

// Import centralized data models
import { TaskModels, ProjectModels, PhaseModels } from './data-models';
import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';

/**
 * Generates date parsing instructions with examples
 */
export function generateDateParsing(baseDate?: string): string {
	const today = baseDate || new Date().toISOString().split('T')[0];
	const currentYear = new Date(today!).getFullYear();

	return `- "next week" → start_date: next Monday (calculate actual date)
   - "30 days" → end_date: 30 days from start_date (calculate actual date)
   - "3 months" → end_date: 3 months from start_date (calculate actual date)
   - "by end of month" → end_date: last day of current month
   - "in 2 weeks" → start_date: 2 weeks from today
   - "next Monday" → specific date of next Monday
   - "starting tomorrow" → start_date: tomorrow's date
   - "due Friday" → end_date: this Friday's date
   - "by Christmas" → end_date: ${currentYear}-12-25
   - "Q1" → end_date: March 31st of current year
   - "Q2" → end_date: June 30th of current year
   - Always calculate actual YYYY-MM-DD dates, NEVER use relative terms
   - If no timeline mentioned, use start_date: today, end_date: null
   - Current date context: Today is ${today}`;
}

/**
 * Generates recurring task validation rules and examples
 */
export function generateRecurringTaskRules(): string {
	return `**RECURRING TASK RULES**:
- If a task mentions recurring patterns (daily, weekly, etc.), set task_type to "recurring"
- Recurring tasks MUST have a start_date (use today's date if not specified)
- Recurring tasks MUST have a recurrence_pattern matching the frequency mentioned
- If recurrence_ends is not mentioned, leave it null (will inherit from project end date)
- Examples:
  • "Review code every Friday" → task_type: "recurring", recurrence_pattern: "weekly", start_date: next Friday
  • "Daily standup" → task_type: "recurring", recurrence_pattern: "daily", start_date: tomorrow
  • "Monthly report" → task_type: "recurring", recurrence_pattern: "monthly", start_date: first of next month`;
}

/**
 * Generates project context framework
 */
export function generateProjectContextFramework(mode: 'full' | 'condensed' = 'condensed'): string {
	if (mode === 'condensed') {
		return `**Context Generation (for projects)**:
Create comprehensive markdown that brings anyone up to speed. The following framework provides organizational guidance that should be adapted to best serve each project's unique needs:

**[Note: This is a flexible guide, not a rigid template. Adapt sections, combine categories, or add new dimensions as appropriate for the project]**

1. **Situation & Environment** – Current state, pain points, relevant history, external factors, stakeholder landscape
2. **Purpose & Vision & Framing** – The vision is the most important part. The framing should draw from the words of the user
Core purpose, success criteria, desired future state, strategic alignment
3. **Scope & Boundaries** – Deliverables, exclusions, constraints, assumptions, key risks
4. **Approach & Execution** – Strategy, methodology, workstreams, milestones, resource plan
5. **Coordination & Control** – Governance, decision rights, communication flow, risk/issue management
6. **Knowledge & Learning** – Lessons applied, documentation practices, continuous improvement approach

**Remember:** This framework is a guide to help organize thoughts. Prioritize clear communication and project-specific organization over rigid adherence to this structure. Add, combine, or reorganize sections as needed.

**Rule:** Include in context only if the update affects these dimensions. Progress updates or short-term tasks go in \`tasks\` or status fields instead.`;
	}

	// Full version for more detailed contexts
	return `**Context Generation Framework**:
Use this comprehensive structure as a starting point, adapting it to best tell this specific project's story:

**[Framework Flexibility Note]**: The sections below provide organizational guidance. Feel free to:
- Add new sections specific to your project type
- Combine sections that overlap for your use case
- Expand sections that are particularly important
- Simplify or remove sections that don't apply
- Reorganize to better communicate the project's unique aspects

## 1. Situation & Environment
- **Current State**: Where we are now
- **Pain Points**: Problems to be solved
- **Historical Context**: How we got here
- **External Factors**: Market, competition, regulations
- **Stakeholder Landscape**: Who's involved and their interests

## 2. Purpose & Vision & Framing
- **Vision**: The vision for the project is the most important part
- **Framing**: Capture the user's framing of the project in their own words
- **Core Purpose**: Why this project exists
- **Success Criteria**: How we measure achievement
- **Desired Future State**: Where we want to be
- **Strategic Alignment**: How this fits larger goals

## 3. Scope & Boundaries
- **Deliverables**: What we will produce
- **Exclusions**: What we won't do
- **Constraints**: Limitations we must work within
- **Assumptions**: What we're taking for granted
- **Key Risks**: Major threats to success

## 4. Approach & Execution
- **Strategy**: Our overall approach
- **Methodology**: How we'll work
- **Workstreams**: Parallel efforts
- **Milestones**: Key checkpoints
- **Resource Plan**: People, tools, budget

## 5. Coordination & Control
- **Governance**: Decision-making structure
- **Decision Rights**: Who decides what
- **Communication Flow**: How information moves
- **Risk/Issue Management**: How we handle problems

## 6. Knowledge & Learning
- **Lessons Applied**: What we've learned before
- **Documentation Practices**: How we capture knowledge
- **Continuous Improvement**: How we get better over time

**Remember:** The goal is comprehensive understanding, not perfect structure. Adapt this framework to serve your project's specific needs.`;
}

/**
 * Generates framework adaptation examples to show flexibility
 */
export function generateFrameworkAdaptationExamples(): string {
	return `**Framework Adaptation Examples**:

Different project types benefit from different organizational structures:

- **Software Project**: Might expand "Approach & Execution" into separate Technical Architecture and Implementation Plan sections
- **Writing Project**: Might combine "Coordination & Control" with "Knowledge & Learning" into a single Research & References section
- **Marketing Campaign**: Might add new sections for Audience Analysis and Channel Strategy
- **Research Project**: Might add Methods section and expand Knowledge & Learning into Literature Review
- **Simple Task List**: Might use only "Purpose & Vision" and "Scope & Boundaries" sections

The framework should serve the project, not constrain it. Start with the suggested structure, then evolve it as you learn more about what the project needs.`;
}

/**
 * Generates data model definitions for different entities
 */
export function getProjectModel(includeRequired: boolean = true): string {
	return `projects: {
  name: string ${includeRequired ? '(required, max 255)' : ''},
  slug: string ${includeRequired ? '(REQUIRED - generate from name: lowercase, replace spaces/special chars with hyphens)' : ''},
  description: string,
  context: string ${includeRequired ? '(required, rich markdown)' : ''},
  executive_summary: string (<500 chars),
  status: "active"|"paused"|"completed"|"archived",
  start_date: "YYYY-MM-DD" ${includeRequired ? '(REQUIRED - parse from braindump or use today)' : ''},
  end_date?: "YYYY-MM-DD" (parse timeline from braindump or leave null),
  tags: string[]
}`;
}

export function getProjectUpdateModel(projectId: string): string {
	return `
projects update: {
  id: "${projectId}" (required),
  context: string (COMPLETE markdown, preserve existing + merge new),
  executive_summary?: string (Executive summary of the state of the project, update if project shifted),
  status?: "active"|"paused"|"completed"|"archived",
  start_date?: "YYYY-MM-DD" (update if timeline changes mentioned),
  end_date?: "YYYY-MM-DD" (parse timeline changes from braindump),
  tags?: string[]
}`;
}

/**
 * @deprecated Use TaskModels.reference() from data-models.ts instead
 * Kept for backward compatibility
 */
export function getTaskModel(options?: {
	includeRecurring?: boolean;
	includeProjectRef?: boolean;
	projectStartDate?: string;
	projectId?: string;
}): string {
	const {
		includeRecurring = true,
		includeProjectRef = false,
		projectStartDate,
		projectId
	} = options || {};

	let model = `tasks: {
  title: string (required, max 255),`;

	if (projectId) {
		model += `
  project_id: "${projectId}" (required),`;
	} else if (includeProjectRef) {
		model += `
  project_ref: string (link to project),`;
	}

	model += `
  description: string,
  details: string (specifics mentioned in braindump),
  status: "backlog"|"in_progress"|"done"|"blocked",
  priority: "low"|"medium"|"high",
  task_type: "one_off"|"recurring",
  duration_minutes?: number,
  start_date?: "YYYY-MM-DDTHH:MM:SS" (timestamptz - parse dates AND times, intelligently order tasks throughout the day e.g. "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm${includeRecurring ? ', REQUIRED if task_type is "recurring"' : ''}${projectStartDate ? `, MUST be >= ${projectStartDate}` : ''}),`;

	if (includeRecurring) {
		model += `
  recurrence_pattern?: "daily"|"weekdays"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly" (REQUIRED if task_type is "recurring"),
  recurrence_ends?: "YYYY-MM-DD" (date only - parse from braindump or defaults to project end date if not specified),`;
	}

	model += `
  dependencies?: string[],
  parent_task_id?: string
}`;

	return model;
}

/**
 * @deprecated Use TaskModels.create() from data-models.ts instead
 * Kept for backward compatibility
 */
export function getTaskCreateModel(projectId?: string): string {
	return `// For CREATE:
{
  "operation": "create",
  "title": "New task title (required)",${
		projectId
			? `
  "project_id": "${projectId}",`
			: `
  "project_ref": "new-project-1",`
  }
  "description": "Task summary",
  "details": "COMPREHENSIVE details - capture ALL specifics, implementation notes, research, ideas, observations, and context related to this task from the braindump",
  "priority": "low|medium|high",
  "status": "backlog",
  "task_type": "one_off|recurring", (if recurring, must have 'start_date')
  "duration_minutes": 15|30|60|120|240|480,
  "start_date": "YYYY-MM-DDTHH:MM:SS" (timestamptz - REQUIRED if task_type is recurring, optional otherwise. Schedule tasks intelligently throughout the day, e.g., "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm),
  "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly" (REQUIRED if task_type is recurring),
  "recurrence_ends": "YYYY-MM-DD" (date only, optional - defaults to project end date)
}`;
}

/**
 * @deprecated Use TaskModels.update() from data-models.ts instead
 * Kept for backward compatibility
 */
export function getTaskUpdateModel(projectId?: string): string {
	return `// For UPDATE:
{
  "id": "existing-task-uuid",
  "operation": "update",
  "title": "Updated title if changed",
  "project_id": "${projectId}"
  "description": "Updated description if mentioned",
  "details": "Updated/additional details (specifics mentioned in braindump)",
  "status": "backlog|in_progress|done|blocked",
  "priority": "low|medium|high",
  // Include only fields that should be updated
}`;
}

/**
 * @deprecated Use PhaseModels.create() from data-models.ts instead
 * Kept for backward compatibility
 */
export function getPhaseModel(): string {
	return `phases: {
  name: string (required, descriptive name),
  description: string (what this phase accomplishes),
  start_date: "YYYY-MM-DDTHH:MM:SS" (timestamptz - when phase begins, e.g. "2024-03-15T09:00:00"),
  end_date: "YYYY-MM-DD" (when phase ends),
  order_index: number (sequence in project),
  status: "not_started"|"in_progress"|"completed",
  goals: string[] (specific objectives),
  deliverables: string[] (what will be produced)
}`;
}

// Backward compatibility exports
export const DataModelsComponent = {
	getProjectModel,
	getProjectUpdateModel,
	getTaskModel,
	getTaskCreateModel,
	getTaskUpdateModel,
	getPhaseModel
};

/**
 * Generates operation ID patterns for JSON output
 */
export function generateOperationIdInstructions(): string {
	return `**Output JSON Structure**:
IMPORTANT: Every operation MUST have a unique "id" field. Generate IDs like: "op-[timestamp]-[type]-[index]"
Example: "op-1234567890-task-1", "op-1234567890-project-create"`;
}

export function generateOperationId(type: string, index: number = 1): string {
	const timestamp = Date.now();
	return `op-${timestamp}-${type}-${index}`;
}

// Backward compatibility exports
export const OperationIdComponent = {
	generateInstructions: generateOperationIdInstructions,
	generateId: generateOperationId
};

/**
 * Generates decision matrix for project updates
 */
export function generateDecisionMatrix(): string {
	return `**Decision Matrix**:
CREATE PROJECT when: Multiple tasks | Clear deliverable | Timeline/phases | Progress tracking needed | Research/ideas/thoughts
PROJECT CONTEXT should capture: All strategic information, research, ideas, observations, references`;
}

export function getDecisionMatrixUpdateCriteria(): string {
	return `**Context Update Criteria** (Update context when):
1. Strategic insights or learnings emerge
2. Scope or boundaries change
3. New stakeholders or dependencies identified
4. Approach or methodology evolves
5. Risks or assumptions change
6. External factors shift
7. Major decisions made
8. **Project structure needs evolution** (add new sections, reorganize existing ones to better communicate the project's story)

**Don't Update Context For**:
- Simple task completions
- Minor status changes
- Day-to-day progress
- Temporary blockers

**Remember**: Context structure should evolve with the project. Don't be constrained by the initial framework - adapt it as the project's needs become clearer.`;
}

/**
 * Generates instruction compliance validation steps
 */
export function generateInstructionCompliance(context: string = ''): string {
	return `**INSTRUCTION COMPLIANCE VALIDATION**:
- Cross-check each operation against detected user instructions
- Ensure processing approach matches user preferences
- If conflicts arise, prioritize user instructions over default patterns
- Document validation results in metadata.compartmentalization_note${
		context
			? `
- Context: ${context}`
			: ''
	}`;
}

/**
 * Generates project question generation instructions
 */
export function generateQuestionGenerationInstructions(options?: {
	includeCategories?: boolean;
	includeGuidelines?: boolean;
	includeFormat?: boolean;
}): string {
	const {
		includeCategories = true,
		includeGuidelines = true,
		includeFormat = true
	} = options || {};

	let instructions = '';

	if (includeGuidelines) {
		instructions += `Generate 3-5 NEW questions that:
- Help the user think about the next steps based off of the project's current state and the new info coming from the braindump
- Help clarify vague aspects or ambiguous requirements
- Identify critical decisions that need to be made
- Break down complex problems into manageable steps
- Surface potential blockers, risks, or resource needs
- Move the project forward with concrete next steps

Questions should:
- Be specific and actionable and reference something specific in the project
- Spark creative thinking for productive future braindumps`;
	}

	if (includeCategories) {
		instructions += `\n\nQuestion categories:
- **clarification**: Define vague concepts
- **decision**: Force choices on open items
- **planning**: Break down large tasks
- **risk**: Identify potential obstacles
- **resource**: Clarify needs and constraints`;
	}

	if (includeFormat) {
		instructions += `\n\nQuestion format:
{
  "question": "specific question text",
  "category": "clarification|decision|planning|risk|resource",
  "priority": "high|medium|low",
  "context": "why this matters now",
  "expectedOutcome": "what info this should produce"
}`;
	}

	return instructions;
}

/**
 * Generates question analysis instructions for displayed questions
 */
export function generateQuestionAnalysisInstructions(
	displayedQuestions?: DisplayedBrainDumpQuestion[]
): string {
	if (!displayedQuestions || displayedQuestions.length === 0) {
		return '';
	}

	const questionsText = displayedQuestions
		.map((q) => `- Question ${q.id}: "${q.question}"`)
		.join('\n');

	return `## Questions to Analyze:
${questionsText}

Determine if each question was addressed in the braindump.
Include in your response:
"questionAnalysis": {
  "[questionId]": {
    "wasAnswered": boolean,
    "answerContent": "extracted answer if addressed, null otherwise"
  }
}`;
}

/**
 * Generates minimal preprocessing steps for short content
 * Used for content < 500 characters to reduce token overhead
 */
export function generateMinimalPreprocessingSteps(): string {
	return `**QUICK PREPROCESSING** (Execute in order):

1. **USER INSTRUCTIONS**: Check for processing preferences ("just notes", "tasks only", "don't create")
2. **ACTION DETECTION**: Identify explicit tasks (TODO, checkboxes, imperatives)
3. **DATE PARSING**: Convert natural language to YYYY-MM-DD format

If user gives explicit instructions, follow them exactly.`;
}

/**
 * Generates full preprocessing steps for longer content
 * Used for content >= 500 characters
 */
export function generateFullPreprocessingSteps(currentDate: string): string {
	const currentYear = new Date(currentDate).getFullYear();

	return `**PREPROCESSING STEPS** (Execute in order):

1. **USER INSTRUCTION SCAN**: Look for meta-instructions about how to process this brain dump
   - Keywords: "just", "only", "don't", "focus on", "treat as", "break into"
   - Processing preferences: "just notes", "full project", "tasks only"
   - Scope limiters: "don't create tasks", "document only", "capture for later"
   - Structure requests: "break into phases", "separate by category"
   - Priority indicators: "urgent items first", "focus on technical aspects"
   - Follow any explicit user instructions exactly

2. **ACTION ITEM DETECTION**: Systematically identify ALL actionable items
   - Explicit markers: "TODO:", "Action:", "Next:", "- [ ]", "□", "☐", "⬜"
   - Task keywords: "Action items:", "Next steps:", "To do:", "Tasks:", "Follow up:"
   - List structures: numbered lists (1., 2., 3.), bullet points with verbs
   - Imperative phrases: "implement X", "research Y", "design Z", "create", "build", "test"
   - Time-bound items: "by Friday", "this week", "before launch", "due", "deadline"
   - Responsibility assignments: "I need to", "must do", "should handle", "assigned to"
   - Urgency indicators: "urgent", "ASAP", "priority", "critical", "immediately"
   - Progress states: "in progress", "pending", "blocked", "waiting for"
   - Create tasks for each unless user instructions say otherwise

3. **DATE PARSING**: Convert natural language dates to YYYY-MM-DD format
   ${generateDateParsing(currentDate)}

4. **SCOPE ASSESSMENT**: Determine document complexity and structure
   - Single focused topic → targeted project/notes
   - Multiple topics → separate appropriately
   - Large research → structured documentation

5. **PROCESSING DECISION**: Based on instructions + scope + action items
   - Honor user preferences first
   - Use decision matrix as fallback
   - Document reasoning in metadata.processingNote

6. **INSTRUCTION COMPLIANCE VALIDATION**: Before finalizing operations
   - Cross-check each operation against detected user instructions
   - Ensure processing approach matches user preferences
   - If conflicts arise, prioritize user instructions over default patterns
   - Document validation results in metadata.processingNote`;
}
