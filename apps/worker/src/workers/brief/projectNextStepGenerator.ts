// apps/worker/src/workers/brief/projectNextStepGenerator.ts
// Generates project "next step" suggestions during daily brief creation.

import { supabase } from '../../lib/supabase.js';
import { SmartLLMService } from '../../lib/services/smart-llm-service.js';
import { categorizeTasks } from './ontologyBriefDataLoader.js';
import type {
	GoalProgress,
	OntoMilestone,
	OntoProjectWithRelations,
	OntoTask
} from './ontologyBriefTypes.js';
import { formatInTimeZone } from 'date-fns-tz';
import { differenceInCalendarDays, parseISO } from 'date-fns';

interface NextStepResult {
	projectId: string;
	nextStepShort: string;
	nextStepLong: string;
	persisted: boolean;
}

interface GenerateOptions {
	userId: string;
	briefDate: string; // yyyy-MM-dd (user timezone)
	timezone: string;
}

const SYSTEM_PROMPT = `You are a BuildOS project coach. Create the single best "next step" for the project using the provided context.

Must do:
- Anchor on goals, plans, milestones, and active tasks.
- Incorporate what changed recently and what is coming up.
- Consider the previous next step: refine it if still right, replace it if outdated or completed.
- Prefer specific, goal-aligned actions that unblock progress or hit near-term dates.
- Use entity references when helpful: [[task:id|title]], [[goal:id|name]], [[milestone:id|title]], [[plan:id|name]].

Output JSON ONLY:
{
  "nextStepShort": "<=120 chars, one clear action",
  "nextStepLong": "2-4 sentences, <=600 chars with reasoning + references"
}
If data is sparse, suggest the most impactful planning/clarification action. Never return null values.`;

function sanitizeShort(text: string): string {
	if (!text) return '';
	return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function sanitizeLong(text: string): string {
	if (!text) return '';
	// Keep gentle formatting but cap length
	const collapsed = text.replace(/\s+/g, ' ').trim();
	return collapsed.slice(0, 600);
}

function sanitizeEntityRefText(text: string): string {
	// Remove characters that could break entity reference parsing: [ ] |
	return text.replace(/[\[\]|]/g, '');
}

function formatTaskRef(task: OntoTask, timezone: string): string {
	const dueDate = task.due_at ? formatInTimeZone(parseISO(task.due_at), timezone, 'MMM d') : null;
	const status = task.state_key === 'done' ? 'done' : task.state_key;
	const duePart = dueDate ? `, due ${dueDate}` : '';
	const sanitizedTitle = sanitizeEntityRefText(task.title);
	return `[[task:${task.id}|${sanitizedTitle}]] (${status}${duePart})`;
}

function formatGoal(goal: GoalProgress): string {
	const status = goal.status;
	const target = goal.targetDate ? `, target ${goal.targetDate}` : '';
	const sanitizedName = sanitizeEntityRefText(goal.goal.name);
	return `[[goal:${goal.goal.id}|${sanitizedName}]] (${status}${target})`;
}

function formatMilestone(milestone: OntoMilestone, timezone: string): string {
	const due = milestone.due_at
		? formatInTimeZone(parseISO(milestone.due_at), timezone, 'MMM d')
		: 'no date';
	const sanitizedTitle = sanitizeEntityRefText(milestone.title);
	return `[[milestone:${milestone.id}|${sanitizedTitle}]] (due ${due}, state ${milestone.state_key})`;
}

function buildProjectPrompt(params: {
	project: OntoProjectWithRelations;
	goals: GoalProgress[];
	briefDate: string;
	timezone: string;
	categories: ReturnType<typeof categorizeTasks>;
	upcomingMilestones: OntoMilestone[];
}): string {
	const { project, goals, briefDate, timezone, categories, upcomingMilestones } = params;
	const activeGoals = goals.filter(
		(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
	);
	const openTasks = project.tasks.filter((t) => t.state_key !== 'done');
	const previousShort = project.project.next_step_short || 'none';
	const previousLong = project.project.next_step_long || 'none';

	const parts: string[] = [];
	parts.push(`Date: ${briefDate} (${timezone})`);
	parts.push(
		`Project: ${project.project.name} (state: ${project.project.state_key}, type: ${project.project.type_key || 'unspecified'})`
	);
	if (project.project.description) {
		parts.push(`Description: ${project.project.description}`);
	}
	parts.push(`Previous next step short: ${previousShort}`);
	parts.push(`Previous next step long: ${previousLong}`);

	// Goals
	parts.push(`\nGoals (${activeGoals.length} active):`);
	if (activeGoals.length === 0) {
		parts.push('- No active goals.');
	} else {
		for (const goal of activeGoals.slice(0, 6)) {
			parts.push(`- ${formatGoal(goal)}`);
		}
	}

	// Plans
	const activePlans = project.plans.filter((p) => p.state_key !== 'completed');
	parts.push(`\nPlans (${activePlans.length} active):`);
	if (activePlans.length === 0) {
		parts.push('- No active plans.');
	} else {
		for (const plan of activePlans.slice(0, 4)) {
			const sanitizedPlanName = sanitizeEntityRefText(plan.name ?? 'Plan');
			parts.push(`- [[plan:${plan.id}|${sanitizedPlanName}]] (${plan.state_key})`);
		}
	}

	// Milestones
	parts.push(`\nUpcoming milestones:`);
	if (upcomingMilestones.length === 0) {
		parts.push('- None scheduled.');
	} else {
		for (const milestone of upcomingMilestones.slice(0, 3)) {
			const daysAway = milestone.due_at
				? differenceInCalendarDays(
						parseISO(milestone.due_at),
						parseISO(`${briefDate}T12:00:00`)
					)
				: null;
			const urgency = daysAway !== null ? `${daysAway}d away` : 'no date';
			parts.push(`- ${formatMilestone(milestone, timezone)} (${urgency})`);
		}
	}

	// Task snapshot
	parts.push(`\nTask snapshot (open ${openTasks.length}):`);
	parts.push(`- Overdue: ${categories.overdueTasks.length}`);
	parts.push(`- Due/Start today: ${categories.todaysTasks.length}`);
	parts.push(`- Upcoming (7d): ${categories.upcomingTasks.length}`);
	parts.push(`- Blocked: ${categories.blockedTasks.length}`);

	const listSection = (label: string, tasks: OntoTask[], limit: number) => {
		if (tasks.length === 0) return;
		parts.push(`\n${label}`);
		for (const task of tasks.slice(0, limit)) {
			parts.push(`- ${formatTaskRef(task, timezone)}`);
		}
	};

	listSection('Overdue tasks to resolve first:', categories.overdueTasks, 4);
	listSection("Today's tasks:", categories.todaysTasks, 4);
	listSection('Upcoming within 7 days:', categories.upcomingTasks, 4);
	listSection('Blocked tasks (consider unblocking):', categories.blockedTasks, 3);
	listSection('Recently updated (last 7d):', categories.recentlyUpdated, 3);
	listSection('Recently completed (last 24h):', categories.recentlyCompleted, 3);

	// Recent project activity (24h window already applied upstream)
	if (project.activityLogs.length > 0) {
		parts.push(`\nRecent activity (24h):`);
		for (const log of project.activityLogs.slice(0, 4)) {
			const entity = log.entityLabel || `${log.entityType} ${log.entityId}`;
			parts.push(`- ${log.actorName} ${log.action} ${entity}`);
		}
	}

	parts.push(
		`\nInstruction: Use the context above to pick ONE next step that advances the project. Honor upcoming dates and active goals. If the previous next step is still right, refine it; otherwise replace it. Return JSON only.`
	);

	return parts.join('\n');
}

async function generateNextStepForProject(
	project: OntoProjectWithRelations,
	goals: GoalProgress[],
	options: GenerateOptions
): Promise<NextStepResult | null> {
	const categories = categorizeTasks(project.tasks, options.briefDate, options.timezone);
	const upcomingMilestones = project.milestones
		.filter((m) => m.state_key !== 'completed' && m.state_key !== 'missed')
		.sort((a, b) => {
			const aDue = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
			const bDue = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
			return aDue - bDue;
		});

	const llmService = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Ontology Brief Worker'
	});

	const prompt = buildProjectPrompt({
		project,
		goals,
		briefDate: options.briefDate,
		timezone: options.timezone,
		categories,
		upcomingMilestones
	});

	try {
		const response = await llmService.getJSONResponse<{
			nextStepShort: string;
			nextStepLong: string;
		}>({
			systemPrompt: SYSTEM_PROMPT,
			userPrompt: prompt,
			userId: options.userId,
			profile: 'fast',
			temperature: 0.35,
			operationType: 'daily_brief_project_next_step',
			projectId: project.project.id,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});

		const nextStepShort = sanitizeShort(response.nextStepShort);
		const nextStepLong = sanitizeLong(response.nextStepLong);

		const { error } = await supabase
			.from('onto_projects')
			.update({
				next_step_short: nextStepShort,
				next_step_long: nextStepLong,
				next_step_source: 'ai',
				next_step_updated_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', project.project.id);

		if (error) {
			console.warn(
				`[NextStep][Brief] Failed to persist next step for project ${project.project.id}:`,
				error
			);
		}

		// Reflect in-memory so the brief uses the fresh next step even if persistence fails
		project.project.next_step_short = nextStepShort;
		project.project.next_step_long = nextStepLong;
		project.project.next_step_source = 'ai';
		project.project.next_step_updated_at = new Date().toISOString();

		return {
			projectId: project.project.id,
			nextStepShort,
			nextStepLong,
			persisted: !error
		};
	} catch (err) {
		console.error('[NextStep][Brief] LLM generation failed:', err);
		return null;
	}
}

export async function generateProjectNextStepsForBrief(
	projects: OntoProjectWithRelations[],
	options: GenerateOptions
): Promise<{ results: NextStepResult[]; failed: number }> {
	const results: NextStepResult[] = [];
	let failed = 0;

	for (const project of projects) {
		const goals = Array.from(project.goalProgress.values());
		const result = await generateNextStepForProject(project, goals, options);
		if (result) {
			results.push(result);
		} else {
			failed += 1;
		}
	}

	return { results, failed };
}
