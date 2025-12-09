// apps/web/src/lib/services/next-step-generation.service.ts
/**
 * NextStepGenerationService - Generates contextual next step recommendations
 *
 * This service analyzes project data and uses LLM to generate intelligent
 * "next move" recommendations that help users know what to focus on.
 *
 * Analysis Factors:
 * - Project name, description, and current state
 * - Task status, priorities, and due dates
 * - Goal progress and completion
 * - Plan status and phases
 * - Milestones and deadlines
 * - Recent activity patterns
 *
 * @see /apps/web/docs/features/project-activity-logging/NEXT_STEP_GENERATION_FLOW.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createEntityReference } from '$lib/utils/entity-reference-parser';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';

// =============================================================================
// Types
// =============================================================================

interface ProjectData {
	id: string;
	name: string;
	description: string | null;
	state_key: string;
	type_key: string | null;
}

interface TaskData {
	id: string;
	title: string;
	state_key: string;
	priority: number | null;
	due_at: string | null;
	props: Record<string, unknown> | null;
}

interface GoalData {
	id: string;
	name: string;
	type_key: string | null;
	props: Record<string, unknown> | null;
}

interface PlanData {
	id: string;
	name: string;
	state_key: string;
}

interface MilestoneData {
	id: string;
	title: string;
	due_at: string | null;
	props: Record<string, unknown> | null;
}

interface OutputData {
	id: string;
	name: string;
	state_key: string;
	type_key: string;
}

interface GenerationContext {
	project: ProjectData;
	tasks: TaskData[];
	goals: GoalData[];
	plans: PlanData[];
	milestones: MilestoneData[];
	outputs: OutputData[];
}

interface GenerationResult {
	success: boolean;
	nextStepShort?: string;
	nextStepLong?: string;
	error?: string;
}

interface LLMNextStepResponse {
	short: string;
	long: string;
	reasoning?: string;
}

// =============================================================================
// Constants
// =============================================================================

const SYSTEM_PROMPT = `You are an expert project coach and productivity advisor. Your task is to analyze a project's current state and generate a clear, actionable "next step" recommendation.

You will receive:
- Project information (name, description, state)
- Tasks with their status, priority, and due dates
- Goals and their progress
- Plans and their status
- Milestones and deadlines
- Outputs/deliverables and their status

Your recommendations should be:
1. **Specific and actionable** - Tell the user exactly what to do next
2. **Priority-aware** - Focus on high-priority or blocking items first
3. **Time-sensitive** - Consider due dates and urgency
4. **Motivating** - Help the user build momentum

When referencing specific entities, use this format: [[type:id|display text]]
For example: [[task:abc-123|Complete the proposal draft]]

Response format (JSON only):
{
  "short": "A concise one-line summary (max 100 chars) of the immediate next action",
  "long": "A detailed explanation (2-4 sentences, max 500 chars) with specific entity references and reasoning for why this should be the focus",
  "reasoning": "Brief internal reasoning about what factors led to this recommendation (not shown to user)"
}

Rules:
- The "short" field should be a clear, action-oriented statement
- The "long" field should reference specific tasks, goals, or outputs using the [[type:id|text]] format
- Consider blockers, dependencies, and momentum
- If there are overdue tasks, prioritize them
- If all tasks are done, suggest reviewing goals or celebrating progress
- Be encouraging but direct`;

// =============================================================================
// Main Generation Function
// =============================================================================

/**
 * Generate a next step recommendation for a project
 */
export async function generateProjectNextStep(
	supabase: SupabaseClient<Database>,
	projectId: string,
	userId: string
): Promise<GenerationResult> {
	try {
		// 1. Fetch all project context
		const context = await fetchProjectContext(supabase, projectId);
		if (!context) {
			return { success: false, error: 'Project not found' };
		}

		// 2. Build the analysis prompt
		const userPrompt = buildAnalysisPrompt(context);

		// 3. Call LLM for generation
		const llmResponse = await callLLM(userPrompt);
		if (!llmResponse) {
			return { success: false, error: 'Failed to generate recommendation' };
		}

		// 4. Parse and validate response
		const parsed = parseAndValidateLLMResponse(llmResponse);
		if (!parsed) {
			return { success: false, error: 'Invalid LLM response format' };
		}

		// 5. Update project with new next step
		const { error: updateError } = await supabase
			.from('onto_projects')
			.update({
				next_step_short: parsed.short,
				next_step_long: parsed.long,
				next_step_source: 'ai',
				next_step_updated_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (updateError) {
			console.error('[NextStep] Failed to update project:', updateError);
			return { success: false, error: 'Failed to save next step' };
		}

		return {
			success: true,
			nextStepShort: parsed.short,
			nextStepLong: parsed.long
		};
	} catch (error) {
		console.error('[NextStep] Generation error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchProjectContext(
	supabase: SupabaseClient<Database>,
	projectId: string
): Promise<GenerationContext | null> {
	// Fetch project
	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, description, state_key, type_key')
		.eq('id', projectId)
		.single();

	if (projectError || !project) {
		console.error('[NextStep] Project not found:', projectError);
		return null;
	}

	// Fetch related entities in parallel
	const [tasksResult, goalsResult, plansResult, milestonesResult, outputsResult] =
		await Promise.all([
			supabase
				.from('onto_tasks')
				.select('id, title, state_key, priority, due_at, props')
				.eq('project_id', projectId)
				.order('priority', { ascending: false, nullsFirst: false })
				.order('due_at', { ascending: true, nullsFirst: false })
				.limit(20),
			supabase
				.from('onto_goals')
				.select('id, name, type_key, props')
				.eq('project_id', projectId)
				.limit(10),
			supabase
				.from('onto_plans')
				.select('id, name, state_key')
				.eq('project_id', projectId)
				.limit(10),
			supabase
				.from('onto_milestones')
				.select('id, title, due_at, props')
				.eq('project_id', projectId)
				.order('due_at', { ascending: true })
				.limit(10),
			supabase
				.from('onto_outputs')
				.select('id, name, state_key, type_key')
				.eq('project_id', projectId)
				.limit(10)
		]);

	return {
		project: project as ProjectData,
		tasks: (tasksResult.data || []) as TaskData[],
		goals: (goalsResult.data || []) as GoalData[],
		plans: (plansResult.data || []) as PlanData[],
		milestones: (milestonesResult.data || []) as MilestoneData[],
		outputs: (outputsResult.data || []) as OutputData[]
	};
}

// =============================================================================
// Prompt Building
// =============================================================================

function buildAnalysisPrompt(context: GenerationContext): string {
	const { project, tasks, goals, plans, milestones, outputs } = context;
	const now = new Date();

	// Build project section
	let prompt = `## Project: ${project.name}\n`;
	prompt += `State: ${formatState(project.state_key)}\n`;
	if (project.description) {
		prompt += `Description: ${project.description}\n`;
	}
	if (project.type_key) {
		prompt += `Type: ${project.type_key}\n`;
	}

	// Categorize tasks
	const completedTasks = tasks.filter((t) => isCompletedState(t.state_key));
	const activeTasks = tasks.filter((t) => isActiveState(t.state_key));
	const pendingTasks = tasks.filter(
		(t) => !isCompletedState(t.state_key) && !isActiveState(t.state_key)
	);

	// Find overdue and upcoming tasks
	const overdueTasks = tasks.filter((t) => {
		if (!t.due_at || isCompletedState(t.state_key)) return false;
		return new Date(t.due_at) < now;
	});

	const upcomingTasks = tasks.filter((t) => {
		if (!t.due_at || isCompletedState(t.state_key)) return false;
		const dueDate = new Date(t.due_at);
		const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
		return daysUntilDue >= 0 && daysUntilDue <= 7;
	});

	// High priority tasks
	const highPriorityTasks = tasks.filter(
		(t) => t.priority !== null && t.priority >= 3 && !isCompletedState(t.state_key)
	);

	// Build tasks section
	prompt += `\n## Tasks (${tasks.length} total)\n`;
	prompt += `- Completed: ${completedTasks.length}\n`;
	prompt += `- Active/In Progress: ${activeTasks.length}\n`;
	prompt += `- Pending/Not Started: ${pendingTasks.length}\n`;

	if (overdueTasks.length > 0) {
		prompt += `\n### ⚠️ OVERDUE Tasks (${overdueTasks.length}):\n`;
		for (const task of overdueTasks.slice(0, 5)) {
			const ref = createEntityReference('task', task.id, task.title);
			const daysOverdue = Math.ceil(
				(now.getTime() - new Date(task.due_at!).getTime()) / (1000 * 60 * 60 * 24)
			);
			prompt += `- ${ref} (${daysOverdue} days overdue, priority: ${task.priority || 'unset'})\n`;
		}
	}

	if (highPriorityTasks.length > 0) {
		prompt += `\n### 🔥 High Priority Tasks (${highPriorityTasks.length}):\n`;
		for (const task of highPriorityTasks.slice(0, 5)) {
			const ref = createEntityReference('task', task.id, task.title);
			const duePart = task.due_at ? `, due: ${formatDueDate(task.due_at)}` : '';
			prompt += `- ${ref} (priority: ${task.priority}${duePart}, state: ${formatState(task.state_key)})\n`;
		}
	}

	if (upcomingTasks.length > 0 && overdueTasks.length === 0) {
		prompt += `\n### 📅 Due This Week (${upcomingTasks.length}):\n`;
		for (const task of upcomingTasks.slice(0, 5)) {
			const ref = createEntityReference('task', task.id, task.title);
			prompt += `- ${ref} (due: ${formatDueDate(task.due_at!)}, state: ${formatState(task.state_key)})\n`;
		}
	}

	if (activeTasks.length > 0) {
		prompt += `\n### 🚀 Currently Active:\n`;
		for (const task of activeTasks.slice(0, 5)) {
			const ref = createEntityReference('task', task.id, task.title);
			prompt += `- ${ref}\n`;
		}
	}

	if (pendingTasks.length > 0 && activeTasks.length === 0) {
		prompt += `\n### 📋 Ready to Start:\n`;
		for (const task of pendingTasks.slice(0, 5)) {
			const ref = createEntityReference('task', task.id, task.title);
			prompt += `- ${ref} (priority: ${task.priority || 'unset'})\n`;
		}
	}

	// Goals section
	if (goals.length > 0) {
		prompt += `\n## Goals (${goals.length})\n`;
		// Goals don't have state_key, check props for state or treat all as active
		const activeGoals = goals.filter((g) => !isCompletedGoal(g));
		const completedGoals = goals.filter((g) => isCompletedGoal(g));
		prompt += `- Active: ${activeGoals.length}, Completed: ${completedGoals.length}\n`;
		for (const goal of activeGoals.slice(0, 3)) {
			const ref = createEntityReference('goal', goal.id, goal.name);
			const goalState = getGoalState(goal);
			prompt += `- ${ref}${goalState ? ` (${goalState})` : ''}\n`;
		}
	}

	// Milestones section
	const upcomingMilestones = milestones.filter((m) => {
		if (!m.due_at || isCompletedMilestone(m)) return false;
		return new Date(m.due_at) >= now;
	});
	if (upcomingMilestones.length > 0) {
		prompt += `\n## Upcoming Milestones\n`;
		for (const milestone of upcomingMilestones.slice(0, 3)) {
			const ref = createEntityReference('milestone', milestone.id, milestone.title);
			prompt += `- ${ref} (due: ${formatDueDate(milestone.due_at!)})\n`;
		}
	}

	// Outputs/Deliverables section
	if (outputs.length > 0) {
		const pendingOutputs = outputs.filter((o) => !isCompletedState(o.state_key));
		if (pendingOutputs.length > 0) {
			prompt += `\n## Pending Deliverables (${pendingOutputs.length})\n`;
			for (const output of pendingOutputs.slice(0, 3)) {
				const ref = createEntityReference('output', output.id, output.name);
				prompt += `- ${ref} (${formatState(output.state_key)})\n`;
			}
		}
	}

	// Summary section for LLM to consider
	prompt += `\n## Analysis Summary\n`;
	prompt += `- Total tasks: ${tasks.length}, Completed: ${completedTasks.length} (${Math.round((completedTasks.length / Math.max(tasks.length, 1)) * 100)}%)\n`;
	prompt += `- Overdue items: ${overdueTasks.length}\n`;
	prompt += `- High priority pending: ${highPriorityTasks.length}\n`;
	prompt += `- Active goals: ${goals.filter((g) => !isCompletedGoal(g)).length}\n`;

	prompt += `\n---\nBased on this analysis, what should be the user's immediate next step? Remember to use [[type:id|text]] format for entity references.`;

	return prompt;
}

// =============================================================================
// LLM Interaction
// =============================================================================

async function callLLM(userPrompt: string): Promise<string | null> {
	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${PRIVATE_OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://build-os.com',
				'X-Title': 'BuildOS Next Step Generator'
			},
			body: JSON.stringify({
				model: 'deepseek/deepseek-chat',
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: userPrompt }
				],
				temperature: 0.4,
				max_tokens: 1000,
				response_format: { type: 'json_object' }
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('[NextStep] LLM API error:', response.status, errorText);
			return null;
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			console.error('[NextStep] No content in LLM response');
			return null;
		}

		return content;
	} catch (error) {
		console.error('[NextStep] LLM call failed:', error);
		return null;
	}
}

function parseAndValidateLLMResponse(content: string): LLMNextStepResponse | null {
	try {
		const parsed = JSON.parse(content);

		if (!parsed.short || typeof parsed.short !== 'string') {
			console.error('[NextStep] Missing or invalid "short" field');
			return null;
		}

		if (!parsed.long || typeof parsed.long !== 'string') {
			console.error('[NextStep] Missing or invalid "long" field');
			return null;
		}

		// Enforce length limits
		return {
			short: parsed.short.slice(0, 100),
			long: parsed.long.slice(0, 500),
			reasoning: parsed.reasoning
		};
	} catch (error) {
		console.error('[NextStep] Failed to parse LLM response:', error, content);
		return null;
	}
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatState(state: string): string {
	return state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDueDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

	if (diffDays < 0) {
		return `${Math.abs(diffDays)} days overdue`;
	} else if (diffDays === 0) {
		return 'today';
	} else if (diffDays === 1) {
		return 'tomorrow';
	} else if (diffDays <= 7) {
		return `in ${diffDays} days`;
	} else {
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
}

function isCompletedState(state: string): boolean {
	const completedStates = ['done', 'completed', 'complete', 'shipped', 'published', 'approved'];
	return completedStates.includes(state?.toLowerCase() || '');
}

function isActiveState(state: string): boolean {
	const activeStates = ['in_progress', 'active', 'working', 'started', 'ongoing'];
	return activeStates.includes(state?.toLowerCase() || '');
}

/**
 * Check if a goal is completed by looking at props.state or props.status
 */
function isCompletedGoal(goal: GoalData): boolean {
	if (!goal.props) return false;
	const state = (goal.props.state as string) || (goal.props.status as string) || '';
	return isCompletedState(state);
}

/**
 * Get the display state for a goal from props
 */
function getGoalState(goal: GoalData): string | null {
	if (!goal.props) return null;
	const state = (goal.props.state as string) || (goal.props.status as string);
	return state ? formatState(state) : null;
}

/**
 * Check if a milestone is completed by looking at props.state or props.status
 */
function isCompletedMilestone(milestone: MilestoneData): boolean {
	if (!milestone.props) return false;
	const state = (milestone.props.state as string) || (milestone.props.status as string) || '';
	return isCompletedState(state);
}
