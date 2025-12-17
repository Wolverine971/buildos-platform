// apps/worker/src/workers/brief/ontologyBriefGenerator.ts
/**
 * Ontology-based Daily Brief Generator
 * Replaces legacy brief generation with goal/output-centric ontology data.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import { supabase } from '../../lib/supabase.js';
import type { BriefJobData } from '../shared/queueUtils.js';
import type { Json } from '@buildos/shared-types';
import { format, parseISO } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getHoliday } from '../../lib/utils/holiday-finder.js';
import { SmartLLMService } from '../../lib/services/smart-llm-service.js';
import {
	OntologyBriefDataLoader,
	categorizeTasks,
	findUnblockingTasks,
	getWorkMode
} from './ontologyBriefDataLoader.js';
import {
	OntologyAnalysisPrompt,
	OntologyExecutiveSummaryPrompt,
	OntologyProjectBriefPrompt,
	OntologyReengagementPrompt
} from './ontologyPrompts.js';
import type {
	OntoProjectWithRelations,
	OntologyBriefData,
	OntologyBriefMetadata,
	OntologyDailyBriefRow,
	OntologyProjectBriefRow,
	GoalProgress,
	OntoTask,
	ProjectBriefData
} from './ontologyBriefTypes.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OntologyDailyBriefResult {
	id: string;
	userId: string;
	actorId: string;
	briefDate: string;
	executiveSummary: string;
	llmAnalysis: string | null;
	priorityActions: string[];
	metadata: OntologyBriefMetadata;
	generationStatus: string;
	projectBriefIds: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDateInTimezone(timestamp: string | Date, timezone: string): string {
	const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
	const zonedDate = utcToZonedTime(date, timezone);
	return format(zonedDate, 'yyyy-MM-dd');
}

function formatDate(dateStr: string): string {
	const date = parseISO(dateStr + 'T00:00:00');
	return format(date, 'MMM d, yyyy');
}

function formatDateInTimezone(
	timestamp: string,
	timezone: string,
	includeTime: boolean = false
): string {
	const date = parseISO(timestamp);
	const zonedDate = utcToZonedTime(date, timezone);
	if (includeTime) {
		return format(zonedDate, 'MMM d, yyyy h:mm a');
	}
	return format(zonedDate, 'MMM d, yyyy');
}

function trimMarkdownForPrompt(markdown: string, maxLength: number = 8000): string {
	if (!markdown) return '';
	if (markdown.length <= maxLength) {
		return markdown;
	}
	const truncated = markdown.slice(0, maxLength);
	return `${truncated}\n\n... (content truncated for analysis prompt)`;
}

function getTaskStatusIcon(task: OntoTask): string {
	const state = task.state_key;
	if (state === 'done') return '';
	if (state === 'in_progress') return '';
	if (state === 'blocked') return '';
	if (task.due_at) return '';
	return '';
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

async function updateProgress(
	briefId: string,
	progress: { step: string; progress: number },
	jobId?: string
): Promise<void> {
	// Update ontology daily brief progress
	await supabase
		.from('ontology_daily_briefs')
		.update({
			updated_at: new Date().toISOString()
		})
		.eq('id', briefId);

	// Also update job metadata if job ID is provided
	if (jobId) {
		const { data: currentJob } = await supabase
			.from('queue_jobs')
			.select('metadata')
			.eq('queue_job_id', jobId)
			.single();

		const metaData: Record<string, unknown> = currentJob?.metadata
			? (currentJob.metadata as Record<string, unknown>)
			: {};

		await supabase
			.from('queue_jobs')
			.update({
				metadata: { ...metaData, generation_progress: progress },
				updated_at: new Date().toISOString()
			})
			.eq('queue_job_id', jobId);
	}
}

// ============================================================================
// PROJECT BRIEF GENERATION
// ============================================================================

function formatOntologyProjectBrief(project: ProjectBriefData, timezone: string): string {
	const projectId = project.project.id;
	const projectName = project.project.name;
	let brief = `## [${projectName}](/projects/${projectId})\n\n`;

	// Goal Progress Section
	const activeGoals = project.goals.filter((g) => g.goal.state_key !== 'achieved');
	brief += `### Goal Progress\n`;
	if (activeGoals.length > 0) {
		for (const goal of activeGoals) {
			const statusEmoji =
				goal.status === 'on_track' ? '' : goal.status === 'at_risk' ? '' : '';
			brief += `- ${statusEmoji} **${goal.goal.name}**: ${goal.progressPercent}% (${goal.completedTasks}/${goal.totalTasks} tasks)\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Active Outputs Section
	const activeOutputs = project.outputs.filter((o) => o.state !== 'published');
	brief += `### Outputs in Progress\n`;
	if (activeOutputs.length > 0) {
		for (const output of activeOutputs.slice(0, 3)) {
			brief += `- **${output.output.name}** (${output.state})\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Today's Tasks
	brief += `### Starting Today\n`;
	if (project.todaysTasks.length > 0) {
		for (const task of project.todaysTasks) {
			const icon = getTaskStatusIcon(task);
			const workMode = getWorkMode(task.type_key);
			const workModeStr = workMode ? ` [${workMode}]` : '';
			brief += `- ${icon} [${task.title}](/projects/${projectId}/tasks/${task.id})${workModeStr}\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Blocked Tasks
	brief += `### Blocked Tasks\n`;
	if (project.blockedTasks.length > 0) {
		for (const task of project.blockedTasks.slice(0, 3)) {
			brief += `- [${task.title}](/projects/${projectId}/tasks/${task.id})\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Unblocking Tasks
	brief += `### Unblocking Work\n`;
	if (project.unblockingTasks.length > 0) {
		brief += `*These tasks, when completed, will unblock other work:*\n`;
		for (const task of project.unblockingTasks.slice(0, 3)) {
			brief += `- [${task.title}](/projects/${projectId}/tasks/${task.id})\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Next Steps
	brief += `### Next Steps\n`;
	if (project.nextSteps.length > 0) {
		for (const step of project.nextSteps) {
			brief += `- ${step}\n`;
		}
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	// Next Milestone
	brief += `### Upcoming Milestone\n`;
	if (project.nextMilestone) {
		brief += `${project.nextMilestone}\n`;
	} else {
		brief += `N/A\n`;
	}
	brief += '\n';

	return brief;
}

async function generateOntologyProjectBrief(
	dailyBriefId: string,
	project: ProjectBriefData,
	timezone: string
): Promise<OntologyProjectBriefRow> {
	const briefContent = formatOntologyProjectBrief(project, timezone);

	const metadata = {
		todaysTaskCount: project.todaysTasks.length,
		thisWeekTaskCount: project.thisWeekTasks.length,
		blockedTaskCount: project.blockedTasks.length,
		activeGoalsCount: project.goals.filter((g) => g.goal.state_key !== 'achieved').length,
		activeOutputsCount: project.outputs.filter((o) => o.state !== 'published').length,
		hasNextMilestone: !!project.nextMilestone,
		activePlanId: project.activePlan?.id || null
	};

	const { data: savedBrief, error } = await supabase
		.from('ontology_project_briefs')
		.insert({
			daily_brief_id: dailyBriefId,
			project_id: project.project.id,
			brief_content: briefContent,
			metadata
		})
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to save ontology project brief: ${error.message}`);
	}

	return savedBrief as OntologyProjectBriefRow;
}

// ============================================================================
// MAIN BRIEF GENERATION
// ============================================================================

function generateMainBriefMarkdown(
	briefData: OntologyBriefData,
	projectBriefContents: string[],
	executiveSummary: string,
	holidays: string[] | null
): string {
	// Build a map of project_id -> project name for task linking
	const projectNameMap = new Map<string, string>();
	for (const project of briefData.projects) {
		projectNameMap.set(project.project.id, project.project.name);
	}

	// Helper to format task with project link
	const formatTaskWithProject = (task: OntoTask): string => {
		const projectName = projectNameMap.get(task.project_id) || 'Unknown Project';
		return `- [${task.title}](/projects/${task.project_id}/tasks/${task.id}) — [${projectName}](/projects/${task.project_id})`;
	};

	let mainBrief = `# ${formatDate(briefData.briefDate)}\n\n`;

	// Holiday notice
	if (holidays && holidays.length > 0) {
		mainBrief += `## Today is ${holidays.join(' and ')}\n\n`;
	}

	// Executive Summary
	mainBrief += `## Executive Summary\n\n${executiveSummary}\n\n`;

	// Strategic Alignment Section
	const activeGoals = briefData.goals.filter(
		(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
	);
	if (activeGoals.length > 0) {
		mainBrief += `## Strategic Alignment\n\n`;
		mainBrief += `### Goal Progress\n`;
		for (const goal of activeGoals) {
			const statusEmoji =
				goal.status === 'on_track' ? '' : goal.status === 'at_risk' ? '' : '';
			const projectName = projectNameMap.get(goal.goal.project_id) || '';
			const projectSuffix = projectName ? ` — [${projectName}](/projects/${goal.goal.project_id})` : '';
			mainBrief += `- ${statusEmoji} **${goal.goal.name}**: ${goal.progressPercent}%${projectSuffix}\n`;
		}
		mainBrief += '\n';
	}

	// Active Outputs
	const activeOutputs = briefData.outputs.filter((o) => o.state !== 'published');
	if (activeOutputs.length > 0) {
		mainBrief += `### Outputs in Flight\n`;
		for (const output of activeOutputs.slice(0, 5)) {
			const projectName = projectNameMap.get(output.output.project_id) || '';
			const projectSuffix = projectName ? ` — [${projectName}](/projects/${output.output.project_id})` : '';
			mainBrief += `- **${output.output.name}** (${output.state})${projectSuffix}\n`;
		}
		mainBrief += '\n';
	}

	// Attention Required Section
	if (
		briefData.blockedTasks.length > 0 ||
		briefData.overdueTasks.length > 0 ||
		briefData.risks.length > 0
	) {
		mainBrief += `## Attention Required\n\n`;

		if (briefData.overdueTasks.length > 0) {
			mainBrief += `### Overdue Tasks (${briefData.overdueTasks.length})\n`;
			for (const task of briefData.overdueTasks.slice(0, 5)) {
				mainBrief += formatTaskWithProject(task) + '\n';
			}
			mainBrief += '\n';
		}

		if (briefData.blockedTasks.length > 0) {
			mainBrief += `### Blocked Tasks (${briefData.blockedTasks.length})\n`;
			for (const task of briefData.blockedTasks.slice(0, 5)) {
				mainBrief += formatTaskWithProject(task) + '\n';
			}
			mainBrief += '\n';
		}

		if (briefData.risks.length > 0) {
			mainBrief += `### Active Risks (${briefData.risks.length})\n`;
			for (const risk of briefData.risks.slice(0, 3)) {
				const projectName = projectNameMap.get(risk.project_id) || '';
				const projectSuffix = projectName ? ` — [${projectName}](/projects/${risk.project_id})` : '';
				mainBrief += `- **${risk.title}** (Impact: ${risk.impact})${projectSuffix}\n`;
			}
			mainBrief += '\n';
		}
	}

	// Today's Focus by Work Mode
	const tasksByMode = briefData.tasksByWorkMode;
	const hasWorkModeTasks = Object.values(tasksByMode).some((tasks) => tasks.length > 0);
	if (hasWorkModeTasks) {
		mainBrief += `## Today's Focus by Work Mode\n\n`;
		for (const [mode, tasks] of Object.entries(tasksByMode)) {
			if (tasks.length > 0) {
				mainBrief += `### ${mode.charAt(0).toUpperCase() + mode.slice(1)} Tasks (${tasks.length})\n`;
				for (const task of tasks.slice(0, 3)) {
					mainBrief += formatTaskWithProject(task) + '\n';
				}
				mainBrief += '\n';
			}
		}
	}

	// Recent Updates Summary
	const totalUpdates =
		briefData.recentUpdates.tasks.length +
		briefData.recentUpdates.goals.length +
		briefData.recentUpdates.outputs.length +
		briefData.recentUpdates.documents.length;

	if (totalUpdates > 0) {
		mainBrief += `## Recent Activity (Last 24h)\n\n`;
		mainBrief += `- **${briefData.recentUpdates.tasks.length}** tasks updated\n`;
		mainBrief += `- **${briefData.recentUpdates.goals.length}** goals updated\n`;
		mainBrief += `- **${briefData.recentUpdates.outputs.length}** outputs updated\n`;
		mainBrief += `- **${briefData.recentUpdates.documents.length}** documents updated\n\n`;
	}

	// Detailed Project Briefs
	if (projectBriefContents.length > 0) {
		mainBrief += `## Project Details\n\n`;
		for (const content of projectBriefContents) {
			mainBrief += content + '\n---\n\n';
		}
	}

	return mainBrief;
}

function extractPriorityActions(briefData: OntologyBriefData): string[] {
	const actions: string[] = [];

	// High priority tasks
	const highPriorityTasks = briefData.todaysTasks
		.filter((t) => t.priority !== null && t.priority >= 8)
		.slice(0, 3);
	for (const task of highPriorityTasks) {
		actions.push(task.title);
	}

	// Unblocking tasks from all projects
	for (const project of briefData.projects) {
		for (const task of project.unblockingTasks.slice(0, 2)) {
			if (actions.length >= 5) break;
			if (!actions.includes(task.title)) {
				actions.push(task.title);
			}
		}
	}

	// Goals at risk
	const goalsAtRisk = briefData.goals
		.filter((g) => g.status === 'at_risk' || g.status === 'behind')
		.slice(0, 2);
	for (const goal of goalsAtRisk) {
		if (actions.length >= 5) break;
		actions.push(`Address goal: ${goal.goal.name}`);
	}

	return actions.slice(0, 5);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function generateOntologyDailyBrief(
	userId: string,
	briefDate: string,
	options: BriefJobData['options'],
	timezone: string,
	jobId?: string
): Promise<OntologyDailyBriefResult> {
	console.log(`[OntologyBrief] Starting generation for user ${userId} on ${briefDate}`);

	// Initialize data loader
	const dataLoader = new OntologyBriefDataLoader(supabase);

	// Get actor ID for user
	const actorId = await dataLoader.getActorIdForUser(userId);
	if (!actorId) {
		throw new Error(
			`No ontology actor found for user ${userId}. User may need ontology setup.`
		);
	}

	// Resolve timezone
	let userTimezone = timezone;
	if (!userTimezone) {
		const { data: user } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.single();
		userTimezone = user?.timezone || 'UTC';
	}

	const briefDateInUserTz = briefDate || getDateInTimezone(new Date(), userTimezone);
	const briefDateObj = parseISO(briefDateInUserTz + 'T00:00:00');

	// Create or update the ontology daily brief record
	const briefMetadata: Partial<OntologyBriefMetadata> = {
		generatedVia: 'ontology_v1',
		timezone: userTimezone
	};

	const { data: dailyBrief, error: createError } = await supabase
		.from('ontology_daily_briefs')
		.upsert(
			{
				user_id: userId,
				actor_id: actorId,
				brief_date: briefDateInUserTz,
				executive_summary: '',
				generation_status: 'processing',
				generation_started_at: new Date().toISOString(),
				metadata: briefMetadata
			},
			{
				onConflict: 'user_id,brief_date'
			}
		)
		.select()
		.single();

	if (createError) {
		throw new Error(`Failed to create ontology daily brief: ${createError.message}`);
	}

	try {
		// Step 1: Load ontology data
		await updateProgress(dailyBrief.id, { step: 'loading_ontology_data', progress: 10 }, jobId);

		const projectsData = await dataLoader.loadUserOntologyData(
			userId,
			actorId,
			briefDateObj,
			userTimezone
		);

		if (projectsData.length === 0) {
			throw new Error('No ontology projects found for user');
		}

		console.log(`[OntologyBrief] Loaded ${projectsData.length} projects for user ${userId}`);

		// Step 2: Prepare brief data
		await updateProgress(dailyBrief.id, { step: 'preparing_brief_data', progress: 25 }, jobId);

		const briefData = dataLoader.prepareBriefData(projectsData, briefDateObj, userTimezone);
		const metadata = dataLoader.calculateMetadata(projectsData, briefData, userTimezone);

		// Step 3: Generate project briefs
		await updateProgress(
			dailyBrief.id,
			{ step: 'generating_project_briefs', progress: 40 },
			jobId
		);

		const projectBriefResults = await Promise.allSettled(
			briefData.projects.map((project) =>
				generateOntologyProjectBrief(dailyBrief.id, project, userTimezone)
			)
		);

		const projectBriefs = projectBriefResults
			.filter((r) => r.status === 'fulfilled')
			.map((r) => (r as PromiseFulfilledResult<OntologyProjectBriefRow>).value);

		const projectBriefContents = projectBriefs.map((b) => b.brief_content);

		console.log(`[OntologyBrief] Generated ${projectBriefs.length} project briefs`);

		// Step 4: Generate executive summary via LLM
		await updateProgress(
			dailyBrief.id,
			{ step: 'generating_executive_summary', progress: 60 },
			jobId
		);

		const holidays = getHoliday(briefDateObj);
		let executiveSummary = '';

		try {
			const llmService = new SmartLLMService({
				httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
				appName: 'BuildOS Ontology Brief Worker'
			});

			const summaryPrompt = OntologyExecutiveSummaryPrompt.buildUserPrompt({
				date: briefDateInUserTz,
				timezone: userTimezone,
				briefData,
				holidays: holidays || undefined
			});

			executiveSummary = await llmService.generateText({
				prompt: summaryPrompt,
				userId,
				profile: 'quality',
				temperature: 0.7,
				maxTokens: 600,
				systemPrompt: OntologyExecutiveSummaryPrompt.getSystemPrompt()
			});

			console.log(`[OntologyBrief] Generated executive summary`);
		} catch (llmError) {
			console.error('[OntologyBrief] Failed to generate executive summary:', llmError);

			// Fallback executive summary
			executiveSummary = `You have **${briefData.projects.length} active projects** with **${briefData.todaysTasks.length} tasks** starting today. `;
			if (briefData.blockedTasks.length > 0) {
				executiveSummary += `**${briefData.blockedTasks.length} tasks** are blocked. `;
			}
			if (briefData.overdueTasks.length > 0) {
				executiveSummary += `**${briefData.overdueTasks.length} tasks** are overdue. `;
			}
			const goalsAtRisk = briefData.goals.filter(
				(g) => g.status === 'at_risk' || g.status === 'behind'
			);
			if (goalsAtRisk.length > 0) {
				executiveSummary += `**${goalsAtRisk.length} goals** need attention.`;
			}
		}

		// Step 5: Generate full LLM analysis
		await updateProgress(dailyBrief.id, { step: 'llm_analysis', progress: 75 }, jobId);

		let llmAnalysis: string | null = null;
		const isReengagement = options?.isReengagement === true;
		const daysSinceLastLogin = options?.daysSinceLastLogin || 0;

		try {
			const llmService = new SmartLLMService({
				httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
				appName: 'BuildOS Ontology Brief Worker'
			});

			if (isReengagement && daysSinceLastLogin > 0) {
				// Re-engagement analysis
				const { data: userData } = await supabase
					.from('users')
					.select('last_visit')
					.eq('id', userId)
					.single();

				const reengagementPrompt = OntologyReengagementPrompt.buildUserPrompt({
					date: briefDateInUserTz,
					timezone: userTimezone,
					daysSinceLastLogin,
					lastLoginDate: userData?.last_visit || 'Unknown',
					briefData
				});

				llmAnalysis = await llmService.generateText({
					prompt: reengagementPrompt,
					userId,
					profile: 'quality',
					temperature: 0.7,
					maxTokens: 1200,
					systemPrompt: OntologyReengagementPrompt.getSystemPrompt(daysSinceLastLogin)
				});
			} else {
				// Standard analysis
				const analysisPrompt = OntologyAnalysisPrompt.buildUserPrompt({
					date: briefDateInUserTz,
					timezone: userTimezone,
					briefData,
					holidays: holidays || undefined
				});

				llmAnalysis = await llmService.generateText({
					prompt: analysisPrompt,
					userId,
					profile: 'quality',
					temperature: 0.4,
					maxTokens: 2000,
					systemPrompt: OntologyAnalysisPrompt.getSystemPrompt()
				});
			}

			console.log(`[OntologyBrief] Generated LLM analysis`);
		} catch (llmError) {
			console.error('[OntologyBrief] Failed to generate LLM analysis:', llmError);
		}

		// Step 6: Generate main brief markdown
		await updateProgress(dailyBrief.id, { step: 'finalizing', progress: 90 }, jobId);

		const mainBriefContent = generateMainBriefMarkdown(
			briefData,
			projectBriefContents,
			executiveSummary,
			holidays
		);

		const priorityActions = extractPriorityActions(briefData);

		// Step 7: Update the daily brief with final content
		const finalMetadata: OntologyBriefMetadata = {
			...metadata,
			isReengagement,
			daysSinceLastLogin
		};

		const { data: finalBrief, error: updateError } = await supabase
			.from('ontology_daily_briefs')
			.update({
				executive_summary: mainBriefContent,
				llm_analysis: llmAnalysis,
				priority_actions: priorityActions,
				metadata: finalMetadata as unknown as Json,
				generation_status: 'completed',
				generation_completed_at: new Date().toISOString()
			})
			.eq('id', dailyBrief.id)
			.select()
			.single();

		if (updateError) {
			throw new Error(`Failed to update ontology daily brief: ${updateError.message}`);
		}

		// Step 8: Record entity references for analytics
		await recordBriefEntities(dailyBrief.id, briefData);

		console.log(`[OntologyBrief] Successfully generated brief for user ${userId}`);

		return {
			id: finalBrief.id,
			userId: finalBrief.user_id,
			actorId: finalBrief.actor_id,
			briefDate: finalBrief.brief_date,
			executiveSummary: finalBrief.executive_summary,
			llmAnalysis: finalBrief.llm_analysis,
			priorityActions: finalBrief.priority_actions || [],
			metadata: finalBrief.metadata as unknown as OntologyBriefMetadata,
			generationStatus: finalBrief.generation_status,
			projectBriefIds: projectBriefs.map((b) => b.id)
		};
	} catch (error) {
		// Mark brief as failed
		await supabase
			.from('ontology_daily_briefs')
			.update({
				generation_status: 'failed',
				generation_error: error instanceof Error ? error.message : 'Unknown error',
				generation_completed_at: new Date().toISOString()
			})
			.eq('id', dailyBrief.id);

		throw error;
	}
}

// ============================================================================
// ENTITY TRACKING
// ============================================================================

async function recordBriefEntities(
	dailyBriefId: string,
	briefData: OntologyBriefData
): Promise<void> {
	const entities: Array<{
		daily_brief_id: string;
		project_id: string | null;
		entity_kind: string;
		entity_id: string;
		role: string;
	}> = [];

	// Record highlighted tasks (today's tasks)
	for (const task of briefData.todaysTasks.slice(0, 10)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: task.project_id,
			entity_kind: 'task',
			entity_id: task.id,
			role: 'highlighted'
		});
	}

	// Record blocked tasks
	for (const task of briefData.blockedTasks.slice(0, 10)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: task.project_id,
			entity_kind: 'task',
			entity_id: task.id,
			role: 'blocked'
		});
	}

	// Record goals
	for (const goalProgress of briefData.goals.slice(0, 10)) {
		const role =
			goalProgress.status === 'at_risk' || goalProgress.status === 'behind'
				? 'at_risk'
				: 'tracked';
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: goalProgress.goal.project_id,
			entity_kind: 'goal',
			entity_id: goalProgress.goal.id,
			role
		});
	}

	// Record risks
	for (const risk of briefData.risks.slice(0, 5)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: risk.project_id,
			entity_kind: 'risk',
			entity_id: risk.id,
			role: 'active'
		});
	}

	// Record recently updated entities
	for (const task of briefData.recentUpdates.tasks.slice(0, 5)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: task.project_id,
			entity_kind: 'task',
			entity_id: task.id,
			role: 'recently_updated'
		});
	}

	if (entities.length > 0) {
		const { error } = await supabase.from('ontology_brief_entities').insert(entities);

		if (error) {
			console.warn('[OntologyBrief] Failed to record brief entities:', error);
		}
	}
}
