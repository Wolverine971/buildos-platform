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
		return `**Project Context Doc (Vision + Strategy Narrative):**

Write a markdown document that orients any human or agent to the project's vision, stakes, and strategic plan.

**Purpose**
- Explain why the project exists and what must be true for success
- Capture the strategic approach, major bets, and how the story is evolving
- Provide enough context for decision-making without digging into task lists

**Include**
- Mission/vision and the promise being made (who benefits, why now)
- Definition of success and non-negotiables (metrics, deadlines, quality bars)
- Strategy and approach (phases, leverage points, sequencing of big rocks)
- Scope and boundaries (what is in/out, constraints, assumptions, guardrails)
- Operating context (timeline, resources, dependencies, stakeholders)
- Decisions, insights, pivots, and the reasoning behind them
- Risks, open questions, and signals being monitored
- Next strategic moves or hypotheses (not granular tasks)

**Avoid**
- Task lists, status checklists, or implementation minutiae
- Raw braindump transcripts or disconnected bullet soup
- Step-by-step directives that belong inside the task model

**Formatting**
- Always use markdown headings, bullets, emphasis, tables when helpful
- Integrate updates into the narrative and add timestamps like **[2025-10-17]** for major shifts
- Maintain the user's voice so the doc reads like a coherent story, not a log`;
	}

	// Full version
	return `**Project Context Doc: Vision + Strategy Narrative**

## Markdown-First Living Artifact
- This is the canonical brief that orients any collaborator or agent in seconds.
- Always use markdown headings, bullets, and tables when helpful.
- Update the story as the project evolves; integrate new facts instead of dumping raw transcripts.

## Narrative Objectives
1. **Orientation:** Explain what we are building, for whom, and why it matters now.
2. **Strategy:** Describe the approach, leverage points, phases, and success criteria.
3. **Boundaries:** Clarify scope, constraints, guardrails, and what is intentionally out of bounds.
4. **Coordination:** Highlight dependencies, stakeholders, resources, and decision owners.
5. **Memory:** Record key decisions, pivots, insights, and open questions with timestamps.

## Suggested Sections (adapt freely)
### Mission & Stakes
- Vision, user promise, business value, urgency.
- What happens if we succeed or fail.

### Strategy & Leverage
- Pillars, phases, sequencing, leverage points, differentiators.
- Where we are placing bets versus hedging.

### Operating Context
- Timeline horizons, cadences, major milestones, budget or resource posture.
- Critical dependencies, systems touched, environments involved.

### Scope & Boundaries
- What is explicitly in scope right now and what is intentionally excluded.
- Constraints, assumptions, success metrics, quality bars.

### People & Interfaces
- Stakeholders, decision makers, teams, external partners, approvals.
- Communication patterns, integration touchpoints, responsibilities.

### Decisions, Risks & Open Questions
- Recent choices, rationale, competing options considered.
- Risks, mitigations, unknowns to watch, signals that trigger change.

### Next Strategic Moves
- Upcoming thrusts or hypotheses (no granular step lists).
- How progress or learning will be validated.

## Writing Guidance
- Use concise paragraphs plus connective sentences so it reads like a narrative, not a dump.
- Quote the user sparingly when voice matters; otherwise paraphrase for clarity.
- Add timestamps like **[2025-10-17]** when logging pivots or inflection points.
- Keep implementation detail out of the context doc; push execution specifics into tasks or plans.
- Remember the reader is an AI agent or new teammate who must act confidently after reading only this document.

The context doc should feel like the definitive strategic brief: vision, approach, constraints, people, and next moves captured cleanly in markdown.`;
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
 * Generates project type_key classification guidance
 *
 * This is the authoritative guide for LLMs to create valid project type_keys.
 * Format: project.{realm}.{deliverable}[.{variant}]
 *
 * @param mode - 'short' for quick reference with examples, 'full' for complete guidance
 */
export function generateProjectTypeKeyGuidance(mode: 'full' | 'short' = 'short'): string {
	if (mode === 'short') {
		return `## Project Type Key (MANDATORY)

**Format**: \`project.{realm}.{deliverable}\` (3 segments, lowercase, underscores for multi-word)

**The 6 Realms**:
- **creative** — Original content/expression (the artifact IS the output)
- **technical** — Building functional systems/tools
- **business** — Commercial growth, revenue, market goals
- **service** — Delivering value to a specific client
- **education** — Acquiring knowledge or credentials
- **personal** — Self-improvement, life optimization

**Examples by Realm**:
- creative: \`project.creative.book\`, \`project.creative.video\`, \`project.creative.brand\`
- technical: \`project.technical.app\`, \`project.technical.api\`, \`project.technical.feature\`
- business: \`project.business.product_launch\`, \`project.business.startup\`, \`project.business.campaign\`
- service: \`project.service.consulting_engagement\`, \`project.service.workshop\`, \`project.service.retainer\`
- education: \`project.education.course\`, \`project.education.thesis\`, \`project.education.certification\`
- personal: \`project.personal.habit\`, \`project.personal.wellness\`, \`project.personal.finance\`

**Disambiguation** — Ask "What does success look like?":
- "It's published/shipped" → creative | "It's working/deployed" → technical
- "We hit revenue/customers" → business | "Client achieved their goal" → service
- "I learned it/passed" → education | "I'm doing it consistently" → personal

**Note**: Realm describes the PROJECT, not the person. A developer writing a book = \`project.creative.book\`.`;
	}

	// Full version with complete taxonomy and detailed guidance
	return `## Project Type Key Classification (MANDATORY)

**Format**: \`project.{realm}.{deliverable}\` — exactly 3 lowercase dot-separated segments.
Optional 4th segment for variants: \`project.{realm}.{deliverable}.{variant}\`

Use only lowercase letters and underscores. No spaces, hyphens, or uppercase.

### The 6 Core Realms

Realms describe the **category of value/output** the project creates, NOT the role of the person doing the work.

| Realm | Core Focus | Success Looks Like |
|-------|------------|-------------------|
| **creative** | Original content, artistic expression | "It's published, shipped, the content is out" |
| **technical** | Building functional systems | "It's working, deployed, the feature shipped" |
| **business** | Commercial growth & ventures | "We hit revenue, gained customers, closed the deal" |
| **service** | Delivering value to clients | "Client achieved their goal, engagement successful" |
| **education** | Acquiring knowledge | "I learned it, passed the exam, got certified" |
| **personal** | Self/life improvement | "I'm doing it consistently, I feel better" |

### Realm Classification Signals

When inferring realm from user input, use these vocabulary signals:

| Realm | Strong Vocabulary Signals |
|-------|--------------------------|
| **technical** | "build", "code", "app", "API", "feature", "deploy", "bug", "database", "ship" |
| **creative** | "write", "book", "article", "publish", "draft", "story", "content", "design", "brand" |
| **business** | "launch", "startup", "revenue", "customers", "market", "pitch", "fundraise", "sales", "campaign", "hire" |
| **service** | "client", "engagement", "deliverable", "SOW", "consulting", "session", "workshop" |
| **education** | "class", "assignment", "thesis", "degree", "learn", "exam", "professor", "course", "study" |
| **personal** | "habit", "routine", "goal", "health", "morning", "productivity", "self", "wellness" |

### Complete Examples by Realm

**Creative** (\`project.creative.*\`):
- \`project.creative.book\` — Writing a book
- \`project.creative.article\` — Writing an article or essay
- \`project.creative.album\` — Music album production
- \`project.creative.video\` — Video production
- \`project.creative.screenplay\` — Screenwriting project
- \`project.creative.brand\` — Brand/identity design
- \`project.creative.design\` — Visual design project

**Technical** (\`project.technical.*\`):
- \`project.technical.app\` — Application development
- \`project.technical.app.mobile\` — Mobile app (variant)
- \`project.technical.app.web\` — Web application (variant)
- \`project.technical.api\` — API development
- \`project.technical.feature\` — Feature implementation
- \`project.technical.infrastructure\` — Infrastructure/DevOps
- \`project.technical.ux\` — UX design (system-focused)

**Business** (\`project.business.*\`):
- \`project.business.startup\` — New venture/company
- \`project.business.product_launch\` — Launching a product
- \`project.business.campaign\` — Marketing/sales campaign
- \`project.business.fundraise\` — Fundraising round
- \`project.business.market_research\` — Market research/analysis
- \`project.business.event\` — Company event/conference
- \`project.business.hiring\` — Hiring initiative

**Service** (\`project.service.*\`):
- \`project.service.coaching_program\` — Coaching engagement
- \`project.service.consulting_engagement\` — Consulting project
- \`project.service.workshop\` — Workshop delivery
- \`project.service.retainer\` — Ongoing retainer work

**Education** (\`project.education.*\`):
- \`project.education.course\` — Taking/completing a course
- \`project.education.thesis\` — Thesis or dissertation
- \`project.education.certification\` — Getting certified
- \`project.education.degree\` — Degree program
- \`project.education.research\` — Academic research

**Personal** (\`project.personal.*\`):
- \`project.personal.habit\` — Building a new habit
- \`project.personal.routine\` — Establishing a routine
- \`project.personal.goal\` — Personal goal achievement
- \`project.personal.wellness\` — Health/wellness initiative
- \`project.personal.finance\` — Personal finance project

### Disambiguation Strategy

When classification is ambiguous, ask: **"What does success look like?"**

- "I shipped the feature / it's working" → **technical**
- "The client achieved their goal" → **service**
- "We hit revenue target / gained customers" → **business**
- "I learned the skill / passed the exam" → **education**
- "It's published / the content is out" → **creative**
- "I'm doing it consistently / I feel better" → **personal**

### Edge Cases

- **Research** → Usually \`business\` (market research) or \`education\` (academic research)
- **Operations** → Usually \`business\` (company ops) or \`service\` (client ops)
- **Design** → Usually \`creative\` (visual/brand) or \`technical\` (UX/product design)

### CRITICAL: Realm ≠ Role

The realm describes the **project**, not the **person**:

- A **developer** writing a technical book → \`project.creative.book\` (not technical)
- A **writer** building a writing tool → \`project.technical.app\` (not creative)
- A **coach** launching their practice → \`project.business.startup\` (not service)
- A **founder** taking a leadership course → \`project.education.course\` (not business)

### Validation Rules

1. Must start with \`project.\`
2. Must have exactly 3 segments (or 4 with variant): \`project.{realm}.{deliverable}\`
3. Realm must be one of: creative, technical, business, service, education, personal
4. All segments must be lowercase with underscores only (no spaces, hyphens, uppercase)
5. Multi-word deliverables use underscores: \`product_launch\`, \`coaching_program\`

**Valid**: \`project.business.product_launch\`, \`project.technical.app.mobile\`
**Invalid**: \`business.product_launch\` (missing project prefix), \`project.Business.App\` (uppercase)`;
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
