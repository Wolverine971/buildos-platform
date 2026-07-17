// apps/worker/src/workers/brief/ontologyBriefGenerator.ts
/**
 * Ontology-based Daily Brief Generator
 * Replaces legacy brief generation with goal-centric ontology data.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import { supabase } from '../../lib/supabase.js';
import type { BriefJobData } from '../shared/queueUtils.js';
import type { Json } from '@buildos/shared-types';
import { DEEPSEEK_V4_FLASH_MODEL, XIAOMI_MIMO_V25_MODEL } from '@buildos/smart-llm';
import { format, parseISO, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getHoliday } from '../../lib/utils/holiday-finder.js';
import { SmartLLMService } from '../../lib/services/smart-llm-service.js';
import { OntologyBriefDataLoader, getWorkMode } from './ontologyBriefDataLoader.js';
import {
	OntologyAnalysisPrompt,
	OntologyExecutiveSummaryPrompt,
	OntologyProjectBriefPrompt,
	OntologyReengagementPrompt,
	compareProjectsForPromptInclusion
} from './ontologyPrompts.js';
import { formatCalendarSection, formatProjectCalendarItems } from './calendarBriefFormatting.js';
import type {
	GoalProgress,
	OntoTask,
	OntologyBriefData,
	OntologyBriefMetadata,
	OntologyProjectBriefRow,
	OntoProjectWithRelations,
	ProjectActivityEntry,
	ProjectBriefData,
	ProjectRecentChange
} from './ontologyBriefTypes.js';
import type { YesterdayPlanItem } from './ontologyPrompts.js';

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

interface ProjectBriefLLMResponse {
	briefMarkdown?: string;
	statusLine?: string;
	recentChangeSummary?: string;
	calendarSummary?: string;
	nextAction?: string;
	nextStepShort?: string;
	nextStepLong?: string;
}

const PROJECT_BRIEF_MODELS = [DEEPSEEK_V4_FLASH_MODEL, XIAOMI_MIMO_V25_MODEL] as const;
const BRIEF_ENTITY_RECORDING_TIMEOUT_MS = 5_000;
const PROJECT_BRIEF_GENERATION_CONCURRENCY = 3;
const ACTIVE_PROJECT_STATES = ['planning', 'active'] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDateInTimezone(timestamp: string | Date, timezone: string): string {
	const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
	const zonedDate = toZonedTime(date, timezone);
	return format(zonedDate, 'yyyy-MM-dd');
}

function formatDate(dateStr: string): string {
	const date = parseISO(dateStr + 'T00:00:00');
	return format(date, 'MMM d, yyyy');
}

function normalizePlanMatchText(value: string): string {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findTaskReferencedByAction(
	action: string,
	projectsData: OntoProjectWithRelations[]
): { task: OntoTask; projectName: string } | null {
	const normalizedAction = normalizePlanMatchText(action);
	let bestMatch: { task: OntoTask; projectName: string } | null = null;

	for (const project of projectsData) {
		for (const task of project.tasks) {
			const normalizedTitle = normalizePlanMatchText(task.title);
			if (normalizedTitle.length < 3 || !normalizedAction.includes(normalizedTitle)) {
				continue;
			}
			if (!bestMatch || task.title.length > bestMatch.task.title.length) {
				bestMatch = { task, projectName: project.project.name };
			}
		}
	}

	return bestMatch;
}

async function loadYesterdayPlanContinuity(
	userId: string,
	briefDate: string,
	projectsData: OntoProjectWithRelations[]
): Promise<YesterdayPlanItem[]> {
	const yesterday = format(subDays(parseISO(`${briefDate}T00:00:00`), 1), 'yyyy-MM-dd');
	const { data, error } = await supabase
		.from('ontology_daily_briefs')
		.select('priority_actions')
		.eq('user_id', userId)
		.eq('brief_date', yesterday)
		.eq('generation_status', 'completed')
		.maybeSingle();

	if (error) {
		console.warn('[OntologyBrief] Failed to load yesterday priority actions:', error);
		return [];
	}

	const actions = Array.isArray(data?.priority_actions)
		? data.priority_actions.filter((action): action is string => typeof action === 'string')
		: [];

	return actions.slice(0, 5).map((action) => {
		const match = findTaskReferencedByAction(action, projectsData);
		if (!match) {
			return {
				action,
				status: 'unknown',
				taskTitle: null,
				projectName: null
			};
		}

		return {
			action,
			status: match.task.state_key === 'done' ? 'done' : 'still_open',
			taskTitle: match.task.title,
			projectName: match.projectName
		};
	});
}

function escapeMarkdownLinkLabel(label: string): string {
	return label.replace(/([\\[\]*])/g, '\\$1');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timeout: NodeJS.Timeout | null = null;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
}

function formatGoalTargetSummary(goal: GoalProgress): string | null {
	if (!goal.targetDate) return null;

	const formattedDate = formatDate(goal.targetDate);
	if (goal.targetDaysAway === null) {
		return `Target: ${formattedDate}`;
	}
	if (goal.targetDaysAway === 0) {
		return `Target: ${formattedDate} (today)`;
	}
	if (goal.targetDaysAway > 0) {
		const dayLabel = goal.targetDaysAway === 1 ? 'day' : 'days';
		return `Target: ${formattedDate} (in ${goal.targetDaysAway} ${dayLabel})`;
	}

	const overdueDays = Math.abs(goal.targetDaysAway);
	const overdueLabel = overdueDays === 1 ? 'day' : 'days';
	return `Target: ${formattedDate} (${overdueDays} ${overdueLabel} overdue)`;
}

function getTaskStatusIcon(task: OntoTask): string {
	const state = task.state_key;
	if (state === 'done') return '✅';
	if (state === 'in_progress') return '🔄';
	if (state === 'blocked') return '🚫';
	if (task.due_at) return '📅';
	return '📌';
}

function formatActivityEntityType(entityType: string): string {
	const mapping: Record<string, string> = {
		task: 'task',
		goal: 'goal',
		plan: 'plan',
		milestone: 'milestone',
		document: 'document',
		risk: 'risk',
		requirement: 'requirement',
		source: 'source',
		edge: 'relationship',
		project: 'project',
		member: 'member',
		invite: 'invite'
	};

	return mapping[entityType] || entityType.replace(/_/g, ' ');
}

function formatActivityEntry(entry: ProjectActivityEntry): string {
	const actor = entry.actorName || 'Someone';
	const action = entry.action || 'updated';
	const entityType = formatActivityEntityType(entry.entityType || 'item');
	const label = entry.entityLabel ? ` "${entry.entityLabel}"` : '';
	return `${actor} ${action} ${entityType}${label}`;
}

function formatRecentChangeEntry(change: ProjectRecentChange): string {
	const actor = change.actorName ? ` by ${change.actorName}` : '';
	return `- ${change.kind} ${change.action}: ${change.title}${actor}`;
}

function containsStaleSchedulingLanguage(content: string): boolean {
	return /\btime\s*blocks?\b/i.test(content);
}

function sanitizeNextStepShort(value: string | null | undefined): string | null {
	const text = value?.replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, 120) : null;
}

function sanitizeNextStepLong(value: string | null | undefined): string | null {
	const text = value?.replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, 600) : null;
}

function countGoalsAtRisk(project: ProjectBriefData): number {
	return project.goals.filter((goal) => goal.status === 'at_risk' || goal.status === 'behind')
		.length;
}

function normalizeActivityEntityType(entityType: string): string {
	return entityType.replace(/^onto_/, '').replace(/s$/, '');
}

function countDistinctChangeSignals(project: ProjectBriefData): number {
	const changedEntities = new Set<string>();

	for (const change of project.recentChanges) {
		changedEntities.add(`${change.kind}:${change.id}`);
	}

	for (const task of project.recentlyUpdatedTasks) {
		changedEntities.add(`task:${task.id}`);
	}

	for (const entry of project.activityLogs) {
		changedEntities.add(`${normalizeActivityEntityType(entry.entityType)}:${entry.entityId}`);
	}

	return changedEntities.size;
}

export function getProjectLlmBriefDecision(project: ProjectBriefData): {
	shouldUseLlm: boolean;
	score: number;
	reasons: string[];
	changeCount: number;
	rawChangeSignalCount: number;
	weeklyCommitmentCount: number;
} {
	const changeCount = countDistinctChangeSignals(project);
	const rawChangeSignalCount =
		project.recentChanges.length +
		project.recentlyUpdatedTasks.length +
		project.activityLogs.length;
	const weeklyCommitmentCount =
		project.todaysTasks.length +
		project.upcomingTasks.length +
		project.calendarToday.length +
		project.calendarUpcoming.length;
	const goalsAtRisk = countGoalsAtRisk(project);
	const highAttentionCount =
		project.blockedTasks.length + project.unblockingTasks.length + goalsAtRisk;

	const score =
		project.todaysTasks.length * 4 +
		project.calendarToday.length * 4 +
		project.blockedTasks.length * 3 +
		project.unblockingTasks.length * 3 +
		goalsAtRisk * 3 +
		project.upcomingTasks.length * 2 +
		project.calendarUpcoming.length * 2 +
		changeCount * 2;

	const reasons: string[] = [];
	if (project.todaysTasks.length > 0) reasons.push('tasks_today');
	if (project.calendarToday.length > 0) reasons.push('calendar_today');
	if (project.blockedTasks.length > 0) reasons.push('blocked_tasks');
	if (project.unblockingTasks.length > 0) reasons.push('unblocking_tasks');
	if (goalsAtRisk > 0) reasons.push('goals_at_risk');
	if (highAttentionCount >= 2) reasons.push('multiple_attention_items');
	if (weeklyCommitmentCount >= 2) reasons.push('multiple_weekly_commitments');
	if (weeklyCommitmentCount >= 1 && changeCount >= 1) reasons.push('commitment_with_change');
	if (changeCount >= 3) reasons.push('high_recent_change_volume');

	return {
		shouldUseLlm: reasons.length > 0,
		score,
		reasons,
		changeCount,
		rawChangeSignalCount,
		weeklyCommitmentCount
	};
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
	const results = new Array<PromiseSettledResult<R>>(items.length);
	let nextIndex = 0;

	const workerCount = Math.min(Math.max(1, concurrency), items.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			try {
				results[currentIndex] = {
					status: 'fulfilled',
					value: await mapper(items[currentIndex], currentIndex)
				};
			} catch (reason) {
				results[currentIndex] = { status: 'rejected', reason };
			}
		}
	});

	await Promise.all(workers);
	return results;
}

function normalizeLLMProjectBriefMarkdown(
	project: ProjectBriefData,
	response: ProjectBriefLLMResponse
): string | null {
	const raw = typeof response.briefMarkdown === 'string' ? response.briefMarkdown.trim() : '';
	if (!raw || containsStaleSchedulingLanguage(raw)) return null;

	const expectedHeading = `## [${project.project.name}](/projects/${project.project.id})`;
	if (raw.startsWith('## ')) {
		return raw;
	}

	const withoutTopHeading = raw.replace(/^# .+(\r?\n)+/, '').trim();
	return `${expectedHeading}\n\n${withoutTopHeading}`;
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

function formatOntologyProjectBrief(project: ProjectBriefData, _timezone: string): string {
	const projectId = project.project.id;
	const projectName = project.project.name;
	let brief = `## [${projectName}](/projects/${projectId})\n\n`;

	// Project Status One-Liner - health indicator at a glance
	const activeGoals = project.goals.filter(
		(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
	);
	const goalsAtRisk = activeGoals.filter((g) => g.status === 'at_risk' || g.status === 'behind');
	const todayCount = project.todaysTasks.length;
	const blockedCount = project.blockedTasks.length;

	let statusLine = '';
	if (blockedCount > 0 && goalsAtRisk.length > 0) {
		statusLine = `🔴 **Needs attention** — ${blockedCount} blocked, ${goalsAtRisk.length} goal${goalsAtRisk.length > 1 ? 's' : ''} at risk`;
	} else if (blockedCount > 0) {
		statusLine = `⚠️ **${blockedCount} blocked task${blockedCount > 1 ? 's' : ''}** — resolve to keep momentum`;
	} else if (goalsAtRisk.length > 0) {
		statusLine = `⚠️ **${goalsAtRisk.length} goal${goalsAtRisk.length > 1 ? 's' : ''} at risk** — check progress`;
	} else if (todayCount > 0) {
		statusLine = `✅ **On track** — ${todayCount} task${todayCount > 1 ? 's' : ''} today`;
	} else if (project.thisWeekTasks.length > 0) {
		statusLine = `📅 **${project.thisWeekTasks.length} tasks this week** — nothing urgent today`;
	} else {
		statusLine = `📭 **No active tasks** — project may need planning`;
	}
	brief += `${statusLine}\n\n`;

	// Calendar - project-specific commitments
	if (project.calendarToday.length > 0 || project.calendarUpcoming.length > 0) {
		brief += `### Calendar\n`;
		if (project.calendarToday.length > 0) {
			brief += `**Today**\n`;
			brief += `${formatProjectCalendarItems(project.calendarToday, false)}\n`;
		}
		if (project.calendarUpcoming.length > 0) {
			brief += `${project.calendarToday.length > 0 ? '\n' : ''}**Upcoming**\n`;
			brief += `${formatProjectCalendarItems(project.calendarUpcoming, true)}\n`;
		}
		brief += '\n';
	}

	// Recent Changes - documents/goals/plans/events/tasks updated in this project
	if (project.recentChanges.length > 0) {
		brief += `### Recent Changes\n`;
		for (const change of project.recentChanges.slice(0, 5)) {
			brief += `${formatRecentChangeEntry(change)}\n`;
		}
		brief += '\n';
	}

	// Goal Progress Section - only show if there are active goals
	if (activeGoals.length > 0) {
		brief += `### Goal Progress\n`;
		for (const goal of activeGoals) {
			const targetSummary = formatGoalTargetSummary(goal);
			const statusEmoji =
				goal.status === 'on_track'
					? '✅'
					: goal.status === 'at_risk'
						? '⚠️'
						: goal.status === 'behind'
							? '🔴'
							: '';
			const statusPrefix = statusEmoji ? `${statusEmoji} ` : '';
			const targetSuffix = targetSummary ? ` - ${targetSummary}` : '';
			brief += `- ${statusPrefix}**${goal.goal.name}**${targetSuffix}\n`;
		}
		brief += '\n';
	}

	const activePlans = project.plans.filter((p) => p.state_key !== 'completed');
	if (activePlans.length > 0) {
		brief += `### Active Plans\n`;
		for (const plan of activePlans.slice(0, 3)) {
			const description = plan.description ? ` - ${plan.description}` : '';
			brief += `- **${plan.name}** (${plan.state_key})${description}\n`;
		}
		brief += '\n';
	}

	if (project.documents.length > 0) {
		brief += `### Recent Documents\n`;
		for (const document of project.documents.slice(0, 3)) {
			const description = document.description ? ` - ${document.description}` : '';
			brief += `- **${document.title || 'Untitled document'}**${description}\n`;
		}
		brief += '\n';
	}

	// Today's Tasks - only show if there are tasks for today
	if (project.todaysTasks.length > 0) {
		brief += `### Today's Work\n`;
		for (const task of project.todaysTasks) {
			const icon = getTaskStatusIcon(task);
			const workMode = getWorkMode(task.type_key);
			const workModeStr = workMode ? ` [${workMode}]` : '';
			brief += `- ${icon} [${task.title}](/projects/${projectId}/tasks/${task.id})${workModeStr}\n`;
		}
		brief += '\n';
	}

	// Blocked Tasks with context - explain why they matter
	if (project.blockedTasks.length > 0) {
		brief += `### 🚫 Blocked (${project.blockedTasks.length})\n`;
		for (const task of project.blockedTasks.slice(0, 3)) {
			// Check if this blocked task is blocking others
			const isBlockingOthers = project.unblockingTasks.some((ut) => ut.id === task.id);
			const context = isBlockingOthers ? ' — *blocking other work*' : '';
			brief += `- [${task.title}](/projects/${projectId}/tasks/${task.id})${context}\n`;
		}
		if (project.blockedTasks.length > 3) {
			brief += `- ... and ${project.blockedTasks.length - 3} more\n`;
		}
		brief += '\n';
	}

	// Unblocking Tasks - high-impact work
	if (project.unblockingTasks.length > 0) {
		const unblockedCount = project.unblockingTasks.length;
		brief += `### ⚡ Unblocking Work (${unblockedCount})\n`;
		brief += `*Completing these unblocks other tasks:*\n`;
		for (const task of project.unblockingTasks.slice(0, 3)) {
			brief += `- [${task.title}](/projects/${projectId}/tasks/${task.id})\n`;
		}
		brief += '\n';
	}

	// Next Milestone - important for deadline awareness
	if (project.nextMilestone) {
		brief += `### 🎯 Next Milestone\n`;
		brief += `${project.nextMilestone}\n\n`;
	}

	// Next Steps - only if there are any
	if (project.nextSteps.length > 0) {
		brief += `### Next Steps\n`;
		for (const step of project.nextSteps) {
			brief += `- ${step}\n`;
		}
		brief += '\n';
	}

	// Recent Activity - condensed, only if meaningful
	if (project.activityLogs.length > 0) {
		brief += `### Recent Activity\n`;
		for (const entry of project.activityLogs.slice(0, 2)) {
			brief += `- ${formatActivityEntry(entry)}\n`;
		}
		brief += '\n';
	}

	return brief;
}

async function generateOntologyProjectBrief(
	dailyBriefId: string,
	project: ProjectBriefData,
	timezone: string,
	userId: string,
	briefDate: string
): Promise<OntologyProjectBriefRow> {
	const fallbackBriefContent = formatOntologyProjectBrief(project, timezone);
	let briefContent = fallbackBriefContent;
	let generationMode: 'llm' | 'deterministic_fallback' = 'deterministic_fallback';
	let llmModelUsed: string | null = null;
	let llmCost: number | null = null;
	let llmStatusLine: string | null = null;
	let llmRecentChangeSummary: string | null = null;
	let llmCalendarSummary: string | null = null;
	let llmNextAction: string | null = null;
	let llmNextStepShort: string | null = null;
	let llmNextStepLong: string | null = null;
	let llmSkippedReason: string | null = null;
	let nextStepPersisted = false;
	const llmDecision = getProjectLlmBriefDecision(project);

	if (!llmDecision.shouldUseLlm) {
		llmSkippedReason = 'low_signal_project';
	} else {
		try {
			const llmService = new SmartLLMService({
				httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
				appName: 'BuildOS Ontology Brief Worker'
			});

			const response = await llmService.getJSONResponse<ProjectBriefLLMResponse>({
				systemPrompt: OntologyProjectBriefPrompt.getSystemPrompt(),
				userPrompt: OntologyProjectBriefPrompt.buildUserPrompt({
					date: briefDate,
					timezone,
					project
				}),
				userId,
				profile: 'custom',
				model: PROJECT_BRIEF_MODELS[0],
				models: [...PROJECT_BRIEF_MODELS],
				temperature: 0.25,
				requirements: {
					maxCost: 0.04,
					minAccuracy: 4.3
				},
				operationType: 'daily_brief_project_brief',
				validation: {
					retryOnParseError: true,
					maxRetries: 1,
					allowTruncatedJsonRecovery: true
				},
				metadata: {
					ontologyDailyBriefId: dailyBriefId,
					ontologyProjectId: project.project.id,
					briefDate,
					model_policy: 'project_brief_model_order',
					primary_model: PROJECT_BRIEF_MODELS[0],
					fallback_model_count: PROJECT_BRIEF_MODELS.length
				},
				onUsage: (usage) => {
					llmModelUsed = usage.model;
					llmCost = usage.totalCost;
				}
			});

			const normalized = normalizeLLMProjectBriefMarkdown(project, response);
			if (normalized) {
				briefContent = normalized;
				generationMode = 'llm';
				llmStatusLine = response.statusLine?.trim() || null;
				llmRecentChangeSummary = response.recentChangeSummary?.trim() || null;
				llmCalendarSummary = response.calendarSummary?.trim() || null;
				llmNextAction = response.nextAction?.trim() || null;
			}
			llmNextStepShort =
				sanitizeNextStepShort(response.nextStepShort) ||
				sanitizeNextStepShort(response.nextAction);
			llmNextStepLong =
				sanitizeNextStepLong(response.nextStepLong) ||
				sanitizeNextStepLong(response.nextAction) ||
				llmNextStepShort;

			if (llmNextStepShort) {
				const now = new Date().toISOString();
				const { data: persistedProject, error: nextStepError } = await supabase
					.from('onto_projects')
					.update({
						next_step_short: llmNextStepShort,
						next_step_long: llmNextStepLong,
						next_step_source: 'ai',
						next_step_updated_at: now,
						updated_at: now
					})
					.eq('id', project.project.id)
					.in('state_key', ACTIVE_PROJECT_STATES)
					.is('deleted_at', null)
					.is('archived_at', null)
					.select('id')
					.maybeSingle();

				if (nextStepError) {
					console.warn(
						`[OntologyBrief] Failed to persist LLM next step for project ${project.project.id}`,
						nextStepError
					);
				}

				nextStepPersisted = Boolean(persistedProject) && !nextStepError;
				project.project.next_step_short = llmNextStepShort;
				project.project.next_step_long = llmNextStepLong;
				project.project.next_step_source = 'ai';
				project.project.next_step_updated_at = now;
				project.nextSteps = [llmNextStepShort, llmNextStepLong].filter(
					(step): step is string => Boolean(step)
				);
			}
		} catch (error) {
			console.warn(
				`[OntologyBrief] Project brief LLM generation failed for project ${project.project.id}; using deterministic fallback`,
				error
			);
		}
	}

	if (generationMode === 'deterministic_fallback' && llmNextStepShort) {
		briefContent = formatOntologyProjectBrief(project, timezone);
	}

	const metadata = {
		todaysTaskCount: project.todaysTasks.length,
		thisWeekTaskCount: project.thisWeekTasks.length,
		blockedTaskCount: project.blockedTasks.length,
		activeGoalsCount: project.goals.filter(
			(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
		).length,
		requirementsCount: project.requirements.length,
		hasNextMilestone: !!project.nextMilestone,
		activePlanId: project.activePlan?.id || null,
		calendarTodayCount: project.calendarToday.length,
		calendarUpcomingCount: project.calendarUpcoming.length,
		recentChangeCount: project.recentChanges.length,
		documentCount: project.documents.length,
		planCount: project.plans.length,
		generationMode,
		llmModelUsed,
		llmCost,
		llmStatusLine,
		llmRecentChangeSummary,
		llmCalendarSummary,
		llmNextAction,
		llmNextStepShort,
		llmNextStepLong,
		nextStepPersisted,
		llmSkippedReason,
		llmDecision,
		recentChanges: project.recentChanges.slice(0, 8),
		calendarToday: project.calendarToday.slice(0, 5),
		calendarUpcoming: project.calendarUpcoming.slice(0, 5)
	};

	const { data: savedBrief, error } = await supabase
		.from('ontology_project_briefs')
		.upsert(
			{
				daily_brief_id: dailyBriefId,
				project_id: project.project.id,
				brief_content: briefContent,
				metadata: metadata as unknown as Json,
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'daily_brief_id,project_id'
			}
		)
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
	holidays: string[] | null,
	priorityActions: string[]
): string {
	const recentlyPausedProjects = briefData.recentlyPausedProjects ?? [];

	// Build a map of project_id -> project name for task linking
	const projectNameMap = new Map<string, string>();
	for (const project of briefData.projects) {
		projectNameMap.set(project.project.id, project.project.name);
	}

	// Helper to format task with project link
	const formatTaskWithProject = (task: OntoTask): string => {
		const projectName = projectNameMap.get(task.project_id) || 'Unknown Project';
		const priorityLabel = task.priority !== null ? `P${task.priority}` : null;
		const projectLink = `[${escapeMarkdownLinkLabel(projectName)}](/projects/${task.project_id})`;
		const metadata = [priorityLabel, projectLink].filter(Boolean).join(' / ');
		const taskLink = `[${escapeMarkdownLinkLabel(task.title)}](/projects/${task.project_id}/tasks/${task.id})`;
		return `- **${taskLink}**\n  - ${metadata}`;
	};

	let mainBrief = `# ${formatDate(briefData.briefDate)}\n\n`;

	// Holiday notice
	if (holidays && holidays.length > 0) {
		mainBrief += `🎉 **Today is ${holidays.join(' and ')}**\n\n`;
	}

	// Executive Brief - lead with the synthesized readout before status metrics
	if (executiveSummary.trim()) {
		mainBrief += `## Executive Brief\n\n${executiveSummary.trim()}\n\n`;
	}

	// Day Hook - one-liner that sets expectations
	const taskCount = briefData.todaysTasks.length;
	const projectCount = briefData.projects.length;
	const blockedCount = briefData.blockedTasks.length;
	const overdueCount = briefData.overdueTasks.length;
	const attentionCount = blockedCount + overdueCount;

	let dayType = '';
	if (taskCount === 0) {
		dayType = '📭 **Clear day** — no tasks scheduled';
	} else if (attentionCount >= 3) {
		dayType = `🔴 **${attentionCount} items need attention** — ${taskCount} tasks across ${projectCount} projects`;
	} else if (taskCount >= 10) {
		dayType = `📋 **Full day** — ${taskCount} tasks across ${projectCount} projects`;
	} else if (taskCount >= 5) {
		dayType = `🎯 **Solid workload** — ${taskCount} tasks across ${projectCount} projects`;
	} else {
		dayType = `✨ **Light day** — ${taskCount} tasks, good for deep work`;
	}
	mainBrief += `${dayType}\n\n`;

	// Priority Actions - what to do first
	if (priorityActions.length > 0) {
		mainBrief += `## Start Here\n\n`;
		for (const action of priorityActions.slice(0, 3)) {
			mainBrief += `- **${action}**\n`;
		}
		mainBrief += '\n';
	}

	// Calendar - deterministic, compact, and rendered before LLM summary
	mainBrief += formatCalendarSection(briefData.calendar);

	if (recentlyPausedProjects.length > 0) {
		mainBrief += `## Recently Paused\n\n`;
		for (const project of recentlyPausedProjects.slice(0, 5)) {
			mainBrief += `- [${project.projectName}](/projects/${project.projectId}) was paused recently and is excluded from active brief sections.\n`;
		}
		if (recentlyPausedProjects.length > 5) {
			mainBrief += `- ... and ${recentlyPausedProjects.length - 5} more\n`;
		}
		mainBrief += '\n';
	}

	// Strategic Alignment Section
	const activeGoals = briefData.goals.filter(
		(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
	);
	if (activeGoals.length > 0) {
		mainBrief += `## Strategic Alignment\n\n`;
		mainBrief += `### Goal Progress\n`;
		for (const goal of activeGoals) {
			const projectName = projectNameMap.get(goal.goal.project_id) || '';
			const projectLink = projectName
				? `[${projectName}](/projects/${goal.goal.project_id})`
				: '';
			const targetSummary = formatGoalTargetSummary(goal);
			const statusEmoji =
				targetSummary && goal.status === 'on_track'
					? '✅'
					: targetSummary && goal.status === 'at_risk'
						? '⚠️'
						: targetSummary && goal.status === 'behind'
							? '🔴'
							: '';
			const details = [targetSummary, projectLink].filter(Boolean);
			const detailSuffix = details.length > 0 ? ` - ${details.join(' - ')}` : '';
			const statusPrefix = statusEmoji ? `${statusEmoji} ` : '';
			mainBrief += `- ${statusPrefix}**${goal.goal.name}**${detailSuffix}\n`;
		}
		mainBrief += '\n';
	}

	// Attention Required Section
	if (
		briefData.blockedTasks.length > 0 ||
		briefData.overdueTasks.length > 0 ||
		briefData.risks.length > 0 ||
		briefData.requirements.length > 0
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
				const projectSuffix = projectName
					? ` — [${projectName}](/projects/${risk.project_id})`
					: '';
				mainBrief += `- **${risk.title}** (Impact: ${risk.impact})${projectSuffix}\n`;
			}
			mainBrief += '\n';
		}

		if (briefData.requirements.length > 0) {
			mainBrief += `### Requirements (${briefData.requirements.length})\n`;
			const sortedRequirements = [...briefData.requirements].sort(
				(a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime()
			);
			for (const requirement of sortedRequirements.slice(0, 5)) {
				const projectName = projectNameMap.get(requirement.project_id) || '';
				const projectSuffix = projectName
					? ` — [${projectName}](/projects/${requirement.project_id})`
					: '';
				mainBrief += `- ${requirement.text}${projectSuffix}\n`;
			}
			mainBrief += '\n';
		}
	}

	// Today's Focus by Work Mode (today's tasks only)
	if (briefData.todaysTasks.length > 0) {
		mainBrief += `## Today's Focus by Work Mode\n\n`;

		const modeOrder = [
			'execute',
			'create',
			'refine',
			'research',
			'review',
			'coordinate',
			'admin',
			'plan',
			'other'
		];

		const tasksByModeToday: Record<string, OntoTask[]> = {};
		for (const task of briefData.todaysTasks) {
			const mode = getWorkMode(task.type_key) ?? 'other';
			tasksByModeToday[mode] = tasksByModeToday[mode] ?? [];
			tasksByModeToday[mode].push(task);
		}

		for (const mode of modeOrder) {
			const tasks = tasksByModeToday[mode] ?? [];
			if (tasks.length === 0) continue;

			mainBrief += `### ${mode.charAt(0).toUpperCase() + mode.slice(1)} Tasks (${tasks.length})\n`;
			for (const task of tasks.slice(0, 3)) {
				mainBrief += formatTaskWithProject(task) + '\n';
			}
			if (tasks.length > 3) {
				mainBrief += `- ... and ${tasks.length - 3} more\n`;
			}
			mainBrief += '\n';
		}
	}

	// Recent Wins - Momentum Section (completed tasks)
	const completedTasks = briefData.recentUpdates.tasks.filter((t) => t.state_key === 'done');
	const activityEntries = briefData.projects.flatMap((project) => project.activityLogs);
	const completedActivityEntries = activityEntries.filter((e) => e.action === 'completed');

	if (completedTasks.length > 0 || completedActivityEntries.length > 0) {
		mainBrief += `## ✅ Recent Wins\n\n`;

		if (completedTasks.length > 0) {
			mainBrief += `**${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''} completed** in the last 24h:\n`;
			for (const task of completedTasks.slice(0, 5)) {
				const projectName = projectNameMap.get(task.project_id) || 'Unknown';
				mainBrief += `- ✅ [${task.title}](/projects/${task.project_id}/tasks/${task.id}) — [${projectName}](/projects/${task.project_id})\n`;
			}
			if (completedTasks.length > 5) {
				mainBrief += `- ... and ${completedTasks.length - 5} more\n`;
			}
			mainBrief += '\n';
		}
	}

	// Other Activity (non-completion updates)
	const totalUpdates =
		briefData.recentUpdates.tasks.length +
		briefData.recentUpdates.goals.length +
		briefData.recentUpdates.documents.length +
		(briefData.recentUpdates.plans?.length ?? 0);

	const hasSharedProjects = briefData.projects.some((project) => project.isShared);
	const nonCompletionEntries = activityEntries.filter((e) => e.action !== 'completed');

	if (nonCompletionEntries.length > 0 && totalUpdates > 3) {
		mainBrief += `## Recent Activity\n\n`;

		const appendActivityEntries = (entries: ProjectActivityEntry[], headingPrefix: string) => {
			if (entries.length === 0) return;

			const sorted = [...entries].sort(
				(a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()
			);
			const grouped = new Map<string, ProjectActivityEntry[]>();
			for (const entry of sorted) {
				const list = grouped.get(entry.projectId) ?? [];
				if (list.length >= 2) continue;
				list.push(entry);
				grouped.set(entry.projectId, list);
			}

			const groupedEntries = Array.from(grouped.values())
				.sort(
					(a, b) =>
						parseISO(b[0].createdAt).getTime() - parseISO(a[0].createdAt).getTime()
				)
				.slice(0, 3);

			for (const entriesForProject of groupedEntries) {
				const { projectId, projectName } = entriesForProject[0];
				mainBrief += `${headingPrefix} [${projectName}](/projects/${projectId})\n`;
				for (const entry of entriesForProject) {
					mainBrief += `- ${formatActivityEntry(entry)}\n`;
				}
				mainBrief += '\n';
			}
		};

		const sharedEntries = nonCompletionEntries.filter((entry) => entry.isShared);
		const ownedEntries = nonCompletionEntries.filter((entry) => !entry.isShared);

		if (hasSharedProjects && sharedEntries.length > 0) {
			if (ownedEntries.length > 0) {
				appendActivityEntries(ownedEntries, '###');
			}
			mainBrief += `### Shared Projects\n\n`;
			appendActivityEntries(sharedEntries, '####');
		} else {
			appendActivityEntries(
				ownedEntries.length > 0 ? ownedEntries : nonCompletionEntries,
				'###'
			);
		}
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

	const taskSort = (a: OntoTask, b: OntoTask): number => {
		const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
		const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
		if (priorityA !== priorityB) return priorityA - priorityB;

		const dueA = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
		const dueB = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
		return dueA - dueB;
	};

	// High priority tasks (P1/P2), prefer overdue then due today
	const highPriorityTasks = [...briefData.overdueTasks, ...briefData.todaysTasks]
		.filter((t) => t.priority !== null && t.priority <= 2 && t.state_key !== 'done')
		.sort(taskSort)
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

		const recentlyPausedProjects = await dataLoader.loadRecentlyPausedProjects(userId, actorId);

		if (projectsData.length === 0 && recentlyPausedProjects.length === 0) {
			throw new Error('No ontology projects found for user');
		}

		console.log(
			`[OntologyBrief] Loaded ${projectsData.length} active projects and ${recentlyPausedProjects.length} paused notices for user ${userId}`
		);

		// Step 2: Prepare brief data
		await updateProgress(dailyBrief.id, { step: 'preparing_brief_data', progress: 25 }, jobId);

		const calendar = await dataLoader.loadCalendarBriefData(
			userId,
			actorId,
			projectsData,
			briefDateInUserTz,
			userTimezone
		);

		const briefData = dataLoader.prepareBriefData(
			projectsData,
			briefDateInUserTz,
			userTimezone,
			calendar,
			recentlyPausedProjects
		);
		const yesterdayPlan = await loadYesterdayPlanContinuity(
			userId,
			briefDateInUserTz,
			projectsData
		);
		const metadata = dataLoader.calculateMetadata(
			projectsData,
			briefData,
			briefDateInUserTz,
			userTimezone
		);

		// Step 3: Generate project briefs. High-signal projects use LLM; passive projects
		// are saved with deterministic content inside generateOntologyProjectBrief().
		await updateProgress(
			dailyBrief.id,
			{ step: 'generating_project_briefs', progress: 40 },
			jobId
		);

		const projectBriefResults = await mapWithConcurrency(
			briefData.projects,
			PROJECT_BRIEF_GENERATION_CONCURRENCY,
			(project) =>
				generateOntologyProjectBrief(
					dailyBrief.id,
					project,
					userTimezone,
					userId,
					briefDateInUserTz
				)
		);

		// Log any failed project briefs for debugging
		const failedBriefs = projectBriefResults.filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected'
		);
		if (failedBriefs.length > 0) {
			console.warn(
				`[OntologyBrief] ${failedBriefs.length} project briefs failed to generate`
			);
			for (const failed of failedBriefs) {
				console.error('[OntologyBrief] Project brief error:', failed.reason);
			}
		}

		const projectBriefs = projectBriefResults
			.filter(
				(r): r is PromiseFulfilledResult<OntologyProjectBriefRow> =>
					r.status === 'fulfilled'
			)
			.map((r) => r.value);

		const allProjectBriefContents = projectBriefs.map((b) => b.brief_content);
		const projectBriefContentById = new Map(
			projectBriefs.map((brief) => [brief.project_id, brief.brief_content])
		);
		const maxPromptProjectBriefs = 5;
		const sortedProjects = [...briefData.projects].sort(compareProjectsForPromptInclusion);
		const promptProjectBriefContents: string[] = [];
		const includedProjectIds = new Set<string>();
		for (const project of sortedProjects) {
			const content = projectBriefContentById.get(project.project.id);
			if (!content) continue;
			promptProjectBriefContents.push(content);
			includedProjectIds.add(project.project.id);
			if (promptProjectBriefContents.length >= maxPromptProjectBriefs) break;
		}
		if (promptProjectBriefContents.length < maxPromptProjectBriefs) {
			for (const brief of projectBriefs) {
				if (includedProjectIds.has(brief.project_id)) continue;
				promptProjectBriefContents.push(brief.brief_content);
				if (promptProjectBriefContents.length >= maxPromptProjectBriefs) break;
			}
		}

		console.log(
			`[OntologyBrief] Generated ${projectBriefs.length}/${briefData.projects.length} project briefs`
		);

		// Step 5: Generate executive summary via LLM
		// NOTE: Executive summary now generated AFTER project briefs so it has full formatted context
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

			// Pass project brief contents for full context in executive summary
			const summaryPrompt = OntologyExecutiveSummaryPrompt.buildUserPrompt({
				date: briefDateInUserTz,
				timezone: userTimezone,
				briefData,
				holidays: holidays || undefined,
				projectBriefContents: promptProjectBriefContents,
				yesterdayPlan
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

		// Step 6: Generate full LLM analysis
		await updateProgress(dailyBrief.id, { step: 'llm_analysis', progress: 75 }, jobId);

		let llmAnalysis: string | null = null;
		const isReengagement = options?.isReengagement === true;
		const daysSinceLastLogin = options?.daysSinceLastLogin || 0;
		const engagementStage =
			options?.engagementStage === 'dormant'
				? 'dormant'
				: isReengagement
					? 'reengagement'
					: 'standard';

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
				const reengagementStage =
					engagementStage === 'dormant' ? 'dormant' : 'reengagement';

				const reengagementPrompt = OntologyReengagementPrompt.buildUserPrompt({
					date: briefDateInUserTz,
					timezone: userTimezone,
					daysSinceLastLogin,
					lastLoginDate: userData?.last_visit || 'Unknown',
					engagementStage: reengagementStage,
					briefData
				});

				llmAnalysis = await llmService.generateText({
					prompt: reengagementPrompt,
					userId,
					profile: 'quality',
					temperature: 0.7,
					maxTokens: 1200,
					systemPrompt: OntologyReengagementPrompt.getSystemPrompt(
						daysSinceLastLogin,
						reengagementStage
					)
				});
			} else {
				// Standard analysis - include project briefs for full context
				const analysisPrompt = OntologyAnalysisPrompt.buildUserPrompt({
					date: briefDateInUserTz,
					timezone: userTimezone,
					briefData,
					holidays: holidays || undefined,
					projectBriefContents: promptProjectBriefContents
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

			// Fallback LLM analysis with key metrics
			const blockedCount = briefData.blockedTasks.length;
			const overdueCount = briefData.overdueTasks.length;
			const todayCount = briefData.todaysTasks.length;
			const goalsAtRisk = briefData.goals.filter(
				(g) => g.status === 'at_risk' || g.status === 'behind'
			);

			const analysisPoints: string[] = [];

			if (todayCount > 0) {
				analysisPoints.push(`You have **${todayCount} tasks** scheduled for today.`);
			}
			if (overdueCount > 0) {
				analysisPoints.push(
					`⚠️ **${overdueCount} tasks are overdue** and need immediate attention.`
				);
			}
			if (blockedCount > 0) {
				analysisPoints.push(
					`🚫 **${blockedCount} tasks are blocked** - consider addressing blockers first.`
				);
			}
			if (goalsAtRisk.length > 0) {
				analysisPoints.push(
					`🔴 **${goalsAtRisk.length} goals** are at risk or behind schedule.`
				);
			}

			if (analysisPoints.length > 0) {
				llmAnalysis = analysisPoints.join('\n\n');
			}
		}

		// Step 7: Generate main brief markdown
		await updateProgress(dailyBrief.id, { step: 'finalizing', progress: 90 }, jobId);

		// Extract priority actions first so we can include them in the brief
		const priorityActions = extractPriorityActions(briefData);

		const mainBriefContent = generateMainBriefMarkdown(
			briefData,
			allProjectBriefContents,
			executiveSummary,
			holidays,
			priorityActions
		);

		// Step 8: Update the daily brief with final content
		const finalMetadata: OntologyBriefMetadata = {
			...metadata,
			isReengagement,
			daysSinceLastLogin,
			engagementStage
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

		// Step 9: Record entity references for analytics. This should never block
		// the completed brief from being returned to the UI.
		try {
			await withTimeout(
				recordBriefEntities(dailyBrief.id, briefData),
				BRIEF_ENTITY_RECORDING_TIMEOUT_MS,
				'Recording brief entity references'
			);
		} catch (entityError) {
			console.warn('[OntologyBrief] Brief entity recording skipped:', entityError);
		}

		await updateProgress(dailyBrief.id, { step: 'completed', progress: 100 }, jobId);

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
	const recentlyPausedProjects = briefData.recentlyPausedProjects ?? [];
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

	// Record requirements
	for (const requirement of briefData.requirements.slice(0, 10)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: requirement.project_id,
			entity_kind: 'requirement',
			entity_id: requirement.id,
			role: 'included'
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

	for (const document of briefData.recentUpdates.documents.slice(0, 5)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: document.project_id,
			entity_kind: 'document',
			entity_id: document.id,
			role: 'recently_updated'
		});
	}

	for (const goal of briefData.recentUpdates.goals.slice(0, 5)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: goal.project_id,
			entity_kind: 'goal',
			entity_id: goal.id,
			role: 'recently_updated'
		});
	}

	for (const plan of (briefData.recentUpdates.plans ?? []).slice(0, 5)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: plan.project_id,
			entity_kind: 'plan',
			entity_id: plan.id,
			role: 'recently_updated'
		});
	}

	for (const item of briefData.calendar.today.slice(0, 10)) {
		if (!item.eventId && !item.taskId) continue;
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: item.projectId,
			entity_kind: item.eventId ? 'event' : 'task',
			entity_id: item.eventId ?? item.taskId!,
			role: 'calendar_today'
		});
	}

	for (const item of briefData.calendar.upcoming.slice(0, 10)) {
		if (!item.eventId && !item.taskId) continue;
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: item.projectId,
			entity_kind: item.eventId ? 'event' : 'task',
			entity_id: item.eventId ?? item.taskId!,
			role: 'calendar_upcoming'
		});
	}

	for (const project of recentlyPausedProjects.slice(0, 10)) {
		entities.push({
			daily_brief_id: dailyBriefId,
			project_id: project.projectId,
			entity_kind: 'project',
			entity_id: project.projectId,
			role: 'recently_paused'
		});
	}

	for (const project of briefData.projects) {
		for (const change of project.recentChanges.slice(0, 5)) {
			entities.push({
				daily_brief_id: dailyBriefId,
				project_id: project.project.id,
				entity_kind: change.kind,
				entity_id: change.id,
				role: change.action === 'created' ? 'created' : 'recently_updated'
			});
		}
	}

	if (entities.length > 0) {
		const dedupedEntities = Array.from(
			new Map(
				entities.map((entity) => [
					`${entity.project_id ?? 'global'}:${entity.entity_kind}:${entity.entity_id}:${entity.role}`,
					entity
				])
			).values()
		);
		const { error } = await supabase.from('ontology_brief_entities').insert(dedupedEntities);

		if (error) {
			console.warn('[OntologyBrief] Failed to record brief entities:', error);
		}
	}
}
