// apps/web/src/lib/services/ontology/goal-reverse-engineering.service.ts
import { SmartLLMService } from '$lib/services/smart-llm-service';

const MAX_CONTEXT_CHARS = 8000;
const MAX_EXISTING_MILESTONES = 10;
const MAX_EXISTING_TASKS = 20;
const DEFAULT_MILESTONE_TYPE_KEY = 'milestone.standard';
const DEFAULT_TASK_TYPE_KEY = 'task.execute';

export interface ReverseEngineeringProject {
	id: string;
	name: string;
	description?: string | null;
	state_key: string;
	type_key: string;
	props?: Record<string, unknown> | null;
}

export interface ReverseEngineeringGoal {
	id: string;
	name: string;
	state_key?: string | null;
	type_key?: string | null;
	props?: Record<string, unknown> | null;
}

export interface ReverseEngineeringContextDocument {
	title: string;
	content: string;
}

export interface ReverseEngineeringExistingMilestone {
	id: string;
	title: string;
	due_at: string | null;
}

export interface ReverseEngineeringExistingTask {
	id: string;
	title: string;
	state_key: string;
	plan_id?: string | null;
}

export interface ReverseEngineeredTaskSpec {
	title: string;
	description?: string | null;
	type_key?: string | null;
	state_key?: string | null;
	priority?: number | null;
	effort_days?: number | null;
}

export interface ReverseEngineeredMilestoneSpec {
	title: string;
	summary?: string | null;
	type_key?: string | null;
	due_date?: string | null;
	target_window_days?: number | null;
	confidence?: number | null;
	tasks: ReverseEngineeredTaskSpec[];
}

interface ReverseEngineeringLLMResponse {
	reasoning?: string;
	milestones?: Array<{
		title: string;
		summary?: string;
		type_key?: string;
		due_date?: string;
		target_window_days?: number;
		confidence?: number;
		tasks?: Array<{
			title: string;
			description?: string;
			type_key?: string;
			state_key?: string;
			priority?: number;
			effort_days?: number;
		}>;
	}>;
}

export interface GoalReverseEngineeringInput {
	userId: string;
	project: ReverseEngineeringProject;
	goal: ReverseEngineeringGoal;
	contextDocument?: ReverseEngineeringContextDocument | null;
	existingMilestones: ReverseEngineeringExistingMilestone[];
	existingTasks: ReverseEngineeringExistingTask[];
}

export interface GoalReverseEngineeringResult {
	milestones: ReverseEngineeredMilestoneSpec[];
	reasoning?: string;
}

export class GoalReverseEngineeringService {
	constructor(private readonly llm: SmartLLMService) {}

	async reverseEngineerGoal(
		input: GoalReverseEngineeringInput
	): Promise<GoalReverseEngineeringResult> {
		const systemPrompt = `You are a staff-level execution architect who reverse engineers goals into milestone plans.
- Always return clean JSON that matches the requested schema.
- Ground recommendations in the provided project context and project goal details.
- Create actionable milestones (3-5) with clear sequencing and scope.
- Each milestone must include 2-4 concrete tasks that directly advance the milestone.
- Prefer concise wording (<= 12 words per title) and avoid duplicating existing work.
- Provide due_date in ISO format when possible and include target_window_days as a fallback.
- Use ${DEFAULT_MILESTONE_TYPE_KEY} and ${DEFAULT_TASK_TYPE_KEY} when unsure about type keys.`;

		const userPrompt = this.buildUserPrompt(input);

		const response = await this.llm.getJSONResponse<ReverseEngineeringLLMResponse>({
			systemPrompt,
			userPrompt,
			userId: input.userId,
			profile: 'balanced',
			temperature: 0.25,
			operationType: 'goal_reverse_engineering',
			requirements: {
				maxLatency: 25,
				minAccuracy: 0.75
			},
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		const normalizedMilestones = (response?.milestones ?? [])
			.slice(0, 5)
			.map((milestone) => ({
				title: milestone.title?.trim() || 'Milestone',
				summary: milestone.summary?.trim() || null,
				type_key: milestone.type_key || DEFAULT_MILESTONE_TYPE_KEY,
				due_date: milestone.due_date ?? null,
				target_window_days: this.toNumber(milestone.target_window_days) ?? undefined,
				confidence:
					typeof milestone.confidence === 'number' ? milestone.confidence : undefined,
				tasks: (milestone.tasks ?? []).slice(0, 4).map((task) => ({
					title: task.title?.trim() || 'Task',
					description: task.description?.trim() || null,
					type_key: task.type_key || DEFAULT_TASK_TYPE_KEY,
					state_key: task.state_key || 'todo',
					priority: this.toNumber(task.priority),
					effort_days: this.toNumber(task.effort_days)
				}))
			}))
			.filter((milestone) => milestone.title.length > 0 && milestone.tasks.length > 0);

		return {
			milestones: normalizedMilestones,
			reasoning: response?.reasoning?.trim()
		};
	}

	private buildUserPrompt(input: GoalReverseEngineeringInput): string {
		const project = input.project;
		const goal = input.goal;
		const goalState =
			goal.state_key ||
			(typeof goal.props?.state_key === 'string' ? (goal.props.state_key as string) : null) ||
			'draft';
		const contextSection = this.buildContextSection(input.contextDocument);
		const existingMilestonesSection = this.buildExistingMilestonesSection(
			input.existingMilestones
		);
		const existingTasksSection = this.buildExistingTasksSection(input.existingTasks);

		const goalProps = goal.props || {};
		const measurement = goalProps['measurement_criteria'] || goalProps['measurement'] || null;
		const priority = goalProps['priority'] || goalProps['priority_level'] || null;
		const description = goalProps['description'] || null;

		return `## Project Overview
- ID: ${project.id}
- Name: ${project.name}
- Type: ${project.type_key}
- State: ${project.state_key}
${project.description ? `- Description: ${project.description}` : ''}

## Goal To Reverse Engineer
- ID: ${goal.id}
	- Name: ${goal.name}
	- Type: ${goal.type_key ?? 'goal.outcome.project'}
	- State: ${goalState}
${priority ? `- Priority: ${priority}` : ''}
${measurement ? `- Measurement Criteria: ${measurement}` : ''}
${description ? `- Context: ${description}` : ''}

${contextSection}

${existingMilestonesSection}

${existingTasksSection}

## Output Requirements
Return JSON: { "milestones": Array<Milestone>?, "reasoning": string? }
Milestone fields:
- title (string, <= 10 words, no duplicates)
- summary (string, <= 2 sentences)
- type_key (string)
- due_date (ISO YYYY-MM-DD format) OR null if unknown
- target_window_days (integer days from today if due_date unknown)
- confidence (0-1) optional
- tasks: 2-4 Task objects

Task fields:
- title (string, action-oriented verb)
- description (string, <= 2 sentences)
- type_key (string)
- state_key (todo | in_progress | blocked | done)
- priority (1-5 integer)
- effort_days (integer, optional)

Rules:
1. Reference the project context document for narrative fidelity.
2. Avoid duplicating existing milestones or tasks listed above.
3. Produce the minimal set of milestones that guarantees the goal can be achieved.
4. Provide chronological ordering within the milestones array.`;
	}

	private buildContextSection(
		contextDocument?: ReverseEngineeringContextDocument | null
	): string {
		if (!contextDocument?.content) {
			return '## Project Context Document\n_No project context document was provided._';
		}

		const trimmed = this.trimContext(contextDocument.content);
		return `## Project Context Document (${contextDocument.title})
${trimmed}`;
	}

	private buildExistingMilestonesSection(
		milestones: ReverseEngineeringExistingMilestone[]
	): string {
		if (!milestones.length) {
			return '## Existing Milestones\n_None recorded for this project._';
		}

		const sample = milestones.slice(0, MAX_EXISTING_MILESTONES);
		const lines = sample.map((milestone) => {
			if (!milestone.due_at) {
				return `- ${milestone.title} (No due date)`;
			}
			const dueDate = new Date(milestone.due_at);
			const formatted = Number.isNaN(dueDate.getTime())
				? milestone.due_at
				: dueDate.toISOString();
			return `- ${milestone.title} (Due ${formatted})`;
		});

		const note =
			milestones.length > sample.length
				? `\n_Note: ${milestones.length - sample.length} additional milestones omitted for brevity._`
				: '';

		return `## Existing Milestones
${lines.join('\n')}${note}`;
	}

	private buildExistingTasksSection(tasks: ReverseEngineeringExistingTask[]): string {
		if (!tasks.length) {
			return '## Existing Tasks\n_None recorded for this project._';
		}

		const sample = tasks.slice(0, MAX_EXISTING_TASKS);
		const lines = sample.map(
			(task) =>
				`- [${task.state_key}] ${task.title}${task.plan_id ? ` (Plan: ${task.plan_id})` : ''}`
		);

		const note =
			tasks.length > sample.length
				? `\n_Note: ${tasks.length - sample.length} additional tasks omitted for brevity._`
				: '';

		return `## Existing Tasks
${lines.join('\n')}${note}`;
	}

	private trimContext(markdown: string): string {
		if (!markdown) return '';
		if (markdown.length <= MAX_CONTEXT_CHARS) {
			return markdown;
		}
		return `${markdown.slice(0, MAX_CONTEXT_CHARS)}\n\n... (trimmed for model input)`;
	}

	private toNumber(value: unknown): number | undefined {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = Number(value);
			if (!Number.isNaN(parsed)) {
				return parsed;
			}
		}
		return undefined;
	}
}
