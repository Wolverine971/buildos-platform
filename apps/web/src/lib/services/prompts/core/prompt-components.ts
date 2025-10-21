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
		return `**Context Generation (Living Project Narrative):**

The context field is a flexible, evolving narrative that captures the project's story in the user's own voice.

**MARKDOWN FORMATTING REQUIREMENT**
The context field AND all 9 core dimensions MUST be formatted as markdown (not plain text). Let the structure evolve naturally based on the content and as the project grows.

**What the context field IS (Strategic Overview)**:
- A living document that brings anyone up to speed on the project
- The project's ongoing story in markdown format - high-level view
- Captures WHY the project matters, WHAT we're doing, and HOW we're approaching it
- Flexible structure that evolves naturally from the project's direction
- A master context doc: someone unfamiliar with the project can read it and understand the full picture

**What the context field is NOT (Execution Details)**:
- NOT a task list or execution log
- NOT specific step-by-step actions (those are tasks)
- NOT individual assignment details or implementation specifics
- NOT a braindump transcript or comprehensive information dump
- Tasks table handles execution details; context handles strategy

**Key Distinction**:
- **Context**: "We're preparing for AP exams in 6 weeks, with weak areas in Calc BC series convergence and Bio lab practicals. Timeline is tight and focus is on weak areas."
- **NOT Context**: "Study series convergence 1 hour daily", "Review all 12 required Bio labs", "Take SAT practice test Saturday"
- **Those belong in**: Tasks table with specific execution details

**The 9 Core Meta Dimensions of a Project (extracted into separate fields - all formatted as markdown):**
1. **Integrity & Ideals** ("core_integrity_ideals") — Ideal end-state, quality bars, definitions of “done/right.”
2. **People & Bonds** ("core_people_bonds") — Who’s involved, roles, dynamics, power/comms patterns.
3. **Goals & Momentum** ("core_goals_momentum") — Milestones, deliverables, metrics, cadence.
4. **Meaning & Identity** ("core_meaning_identity") — Purpose, differentiation, brand/mission coherence.
5. **Reality & Understanding** ("core_reality_understanding") — Current state, data, diagnosis/model.
6. **Trust & Safeguards** ("core_trust_safeguards") — Risks, mitigations, contingencies, reliability.
7. **Opportunity & Freedom** ("core_opportunity_freedom") — Options, experiments, pivots, optionality.
8. **Power & Resources** ("core_power_resources") — Budget, headcount, tools, infra, permissions.
9. **Harmony & Integration** ("core_harmony_integration") — Feedback loops, integration points, iteration.


**Context writing principles:**
- Start with the user's own words and framing
- Let structure emerge naturally from the project's needs
- Add timestamps for significant updates: **[2025-10-17]**
- Preserve the narrative arc - how the project unfolds over time
- Include insights, pivots, decisions, and "aha" moments
- Don't force categorization - let ideas flow naturally

**Remember:** Core dimensions are systematically extracted when present. The context tells the human story.`;
	}

	// Full version
	return `**Context Field: Living Project Narrative**

## MARKDOWN FORMATTING FOR ALL FIELDS

Both the context field AND all 9 core dimensions MUST be formatted as markdown, not plain text. Let the structure evolve naturally as the project grows and more information is added.

## Philosophy: Context as Strategic Master Document

The context field is a **strategic overview** that brings anyone unfamiliar with the project up to speed. It captures:
- **Why** the project matters and what the vision is
- **What** we're doing and what success looks like
- **How** we're approaching the project
- **Evolution** of thinking, key decisions, pivots, learnings
- **Current state** and key constraints/challenges

The context is NOT:
- A task list or execution log
- Specific step-by-step actions (those go in tasks)
- A braindump transcript
- A comprehensive information dump

**Key Rule**: Task-level execution details belong in the tasks table. Strategic information, high-level approach, and understanding belong in context.

Example of what belongs:
- "Preparing for AP exams in 6 weeks with focus on weak areas in Calc BC and Bio lab practicals"
- NOT: "Study Calc BC series convergence 1 hour daily", "Review all 12 required labs"

## The 9 Core Meta Dimensions of a Project (Extracted Automatically - All as Markdown)

These dimensions are extracted into dedicated fields when present in braindumps. Format each as markdown. Each dimension captures strategic-level information, not execution details. The structure will become richer over time as the project evolves.

### 1) Integrity & Ideals (**column:** "core_integrity_ideals")

* **Capture:** The ideal end-state, quality bars, non-negotiables, definitions of “done/right.”
* **Look for:** Goals, acceptance criteria, standards, constraints of acceptability.
* **Phrases:** “Success looks like…”, “Quality means…”, “Must meet…”, “Non-negotiable…”
* **Why:** Sets the north star and judgment criteria.

### 2) People & Bonds (**column:** "core_people_bonds")

* **Capture:** Who’s involved, roles/authority, dynamics, empathy needs, comms patterns.
* **Look for:** Team/client/user lists, reporting lines, consensus needs, partner dependencies.
* **Phrases:** “Working with…”, “The team includes…”, “Users need…”, “Decision maker is…”
* **Why:** Execution rides on relationships and power structures.

### 3) Goals & Momentum (**column:** "core_goals_momentum")

* **Capture:** Milestones, deliverables, metrics, cadence, execution plan.
* **Look for:** Dates/deadlines, KPIs/OKRs, phases, critical path, operating rhythm.
* **Phrases:** “By <date>…”, “We’ll deliver…”, “Metric is…”, “Cadence is…”
* **Why:** Converts intent into velocity and measurables.

### 4) Meaning & Identity (**column:** "core_meaning_identity")

* **Capture:** Why this matters, differentiation, mission, brand/identity coherence.
* **Look for:** Purpose, value propositions, impact statements, narrative/positioning.
* **Phrases:** “This matters because…”, “Unique because…”, “Enables…”, “We stand for…”
* **Why:** Sustains motivation and strategic coherence.

### 5) Reality & Understanding (**column:** "core_reality_understanding")

* **Capture:** Current state, constraints, observations, data, diagnosis/model.
* **Look for:** “Currently…”, problems/root causes, baselines, environment/market context.
* **Phrases:** “The situation is…”, “We’re seeing…”, “Baseline is…”, “Root cause…”
* **Why:** Ground truth prevents fantasy planning.

### 6) Trust & Safeguards (**column:** "core_trust_safeguards")

* **Capture:** Risks, uncertainties, mitigations, contingencies, reliability and trust.
* **Look for:** “Risk of…”, failure modes, SLAs/uptime, backups, legal/security concerns.
* **Phrases:** “Could fail if…”, “Mitigate by…”, “Backup plan…”, “We need a fallback…”
* **Why:** Preserves continuity under uncertainty.

### 7) Opportunity & Freedom (**column:** "core_opportunity_freedom")

* **Capture:** Options, pivots, experiments, explorations, optionality levers.
* **Look for:** Alternative approaches, trials/pilots, “we could also…”, innovation threads.
* **Phrases:** “Another option…”, “Might explore…”, “Opportunity to…”, “A/B test…”
* **Why:** Maintains adaptability and upside.

### 8) Power & Resources (**column:** "core_power_resources")

* **Capture:** Budget, headcount, tools, infrastructure, permissions, constraints.
* **Look for:** “Budget is…”, “We have access to…”, “Using tools like…”, “Authority to…”
* **Phrases:** “Capacity…”, “Runway…”, “Licenses…”, “Vendors…”, “Scope limits…”
* **Why:** Determines feasibility and speed.

### 9) Harmony & Integration (**column:** "core_harmony_integration")

* **Capture:** Feedback loops, review cadence, cross-system integration, change incorporation.
* **Look for:** User feedback, QA/retros, integration points, learning/adaptation mechanisms.
* **Phrases:** “Feedback from…”, “Integrates with…”, “We learned…”, “Next iteration…”
* **Why:** Ensures the system evolves and coheres as a whole.

**General extraction rules:**

* Prefer **specifics over platitudes**; summarize in 1–4 tight sentences per dimension found.
* If a dimension isn't present, **leave its field null** (don't infer).
* Quote briefly when helpful (≤1 short clause), otherwise paraphrase.
* De-duplicate across dimensions; place content in the **single best-fit** field.

**FORMATTING REQUIREMENT - MARKDOWN:**
ALL fields (context AND all 9 core dimensions) MUST be formatted as markdown, not plain text.
Let the markdown structure evolve naturally based on the content. Use headers, bullets, emphasis, lists, and formatting as the information naturally calls for it. The formatting will become richer as the project grows.

---
---

Want me to also:

* generate **TypeScript types** for the updated columns,
* add **pgvector embedding** triggers for these nine fields,
* or create a **Svelte form** snippet that binds to the new names?


## Writing Good Context

**Core Principle:** The context is a living narrative that captures your project's journey in your own voice. Let structure emerge naturally - some projects flow chronologically, others cluster around themes, some follow problem→solution arcs.

**What to Include:**
Capture the origin story, key decisions and their reasoning, pivots and breakthroughs, research insights, open questions, and the evolving understanding of the project. Include timestamps for major shifts: **[2025-10-17]** Major pivot...

**How It Works with Dimensions:**
The context field tells the human story - capturing nuance, emotion, and narrative flow. The 9 dimensions provide systematic analysis. Together they create complete understanding: the story and the structure, the journey and the data.

**Evolution Tips:**
Start with the user's initial framing and let it develop. When updating, weave new information into the narrative rather than just appending. Show how thinking has evolved. A good context reads like a coherent story where someone new can quickly understand not just what you're doing, but why it matters and how you got here.

**Remember:** The context is the living story. The dimensions are the extracted insights. Both are essential for complete project understanding.`;
}

/**
 * Generates markdown formatting guidance for core dimensions
 */
export function generateCoreDimensionsMarkdownInstructions(): string {
	return `## Core Dimensions: Strategic Level Information as Markdown

Each core dimension field MUST be formatted as markdown, not plain text. Capture STRATEGIC information only - not execution details.

**What belongs in dimensions** (Strategic):
- High-level approach and thinking
- Key challenges, constraints, timeline
- Evolution of understanding
- Why things matter
- Key decisions and pivots

**What does NOT belong** (Execution):
- Specific task steps or actions
- Implementation details
- Individual assignment specifics
- Day-to-day execution plans

Let the structure emerge naturally based on the content:
- Use formatting as information naturally calls for it
- Structure evolves as project grows
- First braindump: 1-2 sentences; as it matures: richer structure

**Examples of STRATEGIC evolution** (NOT execution details):

**Early stage** (simple strategy):
\`\`\`
Goal is to prepare for AP exams in 6 weeks. Key challenge: weak areas in Calc BC series and Bio lab practicals. Approach: daily focused practice on weak areas.
\`\`\`

**Mid-stage** (strategy with structure):
\`\`\`
## Exam Preparation Strategy

### Timeline
6 weeks until AP exams (May)

### Key Challenge Areas
- Calc BC: Series convergence tests, polar coordinates
- Bio: Lab practicals (12 required labs), Krebs cycle

### Approach
- Daily focused practice on weak areas
- Study groups (Bio team: Jake and Sarah)
- SAT prep runs in parallel
\`\`\`

**Mature** (rich strategic context):
\`\`\`
## Exam Preparation - Strategic Overview

### Timeline & Pressure Points
- AP exams: 6 weeks away (May)
- SAT: March (less urgent)
- Current status: Weak in foundational areas, strong in derivatives/integrals

### Key Challenges
- **Calc BC**: Series convergence and polar coordinate concepts not solidifying
- **Bio**: Lab practicals require hands-on review of all 12 required labs
- **Time pressure**: Balancing multiple exam preps simultaneously

### Strategic Approach
- Prioritize weak areas over strong areas for efficiency
- Leverage study groups for accountability (Bio team meeting Sundays)
- SAT prep using Khan Academy to maintain consistency
\`\`\`

**Execution details that do NOT belong here**:
- "Study series convergence 1 hour daily" → Task
- "Review all 12 required Bio labs" → Task
- "Take SAT practice test Saturday morning" → Task
- "Make flashcards for vocabulary" → Task

The best markdown captures strategic thinking. Let it grow naturally.`;
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
	return `**Update Criteria for Context & Core Dimensions**

**Update Context (narrative) when:**
- Key decisions or pivots occur
- Understanding of the project evolves
- Significant insights or learnings emerge
- New connections or relationships form
- Major events or milestones happen
- The story needs to continue

**Update Core Dimensions when braindump touches:**
1. **Integrity & Ideals** ("core_integrity_ideals") — Ideal end-state, quality bars, definitions of “done/right.”
2. **People & Bonds** ("core_people_bonds") — Who’s involved, roles, dynamics, power/comms patterns.
3. **Goals & Momentum** ("core_goals_momentum") — Milestones, deliverables, metrics, cadence.
4. **Meaning & Identity** ("core_meaning_identity") — Purpose, differentiation, brand/mission coherence.
5. **Reality & Understanding** ("core_reality_understanding") — Current state, data, diagnosis/model.
6. **Trust & Safeguards** ("core_trust_safeguards") — Risks, mitigations, contingencies, reliability.
7. **Opportunity & Freedom** ("core_opportunity_freedom") — Options, experiments, pivots, optionality.
8. **Power & Resources** ("core_power_resources") — Budget, headcount, tools, infra, permissions.
9. **Harmony & Integration** ("core_harmony_integration") — Feedback loops, integration points, iteration.

**Don't Update For:**
- Simple task completions or status updates
- Minor progress reports
- Day-to-day execution details
- Temporary blockers or issues
- Information that belongs in task details

**Remember**: 
- Context is a living narrative - update it to continue the story
- Core dimensions are replaced entirely when updated (not appended)
- Both can be updated in the same braindump
- Not every braindump requires updates`;
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
