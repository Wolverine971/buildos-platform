// apps/web/src/lib/server/project-loop-burst.service.ts
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { createLogger } from '$lib/utils/logger';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { queueProjectLoop } from '$lib/server/project-loops.service';
import { queueProjectAudit } from '$lib/server/project-audit-trigger.service';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import {
	buildProjectReviewSignalDueAt,
	mergeProjectReviewSignalMetadata,
	mergeUniqueStrings,
	projectReviewSignalDedupKey,
	PROJECT_REVIEW_SIGNAL_QUEUE_MODE,
	PROJECT_REVIEW_SIGNAL_TRIGGER_REASON
} from '@buildos/shared-agent-ops';
import type { Json, ProjectAuditTriggerDecision } from '@buildos/shared-types';

const logger = createLogger('ProjectLoopBurst');

export const PROJECT_LOOP_BURST_LOOKBACK_MINUTES = 30;
export const PROJECT_LOOP_BURST_SCORE_THRESHOLD = 4;
const PROJECT_LOOP_BURST_ACTIVITY_LIMIT = 50;

type ProjectLoopBurstParams = {
	projectId: string | null | undefined;
	userId: string | null | undefined;
	source: string;
	entityType?: string | null;
	entityId?: string | null;
	action?: string | null;
};

export type ProjectLoopRecentActivityRow = {
	entity_type: string | null;
	entity_id?: string | null;
	action: string | null;
	change_source?: string | null;
	created_at?: string | null;
};

export type ProjectLoopBurstResult = {
	queued: boolean;
	reason:
		| 'disabled'
		| 'missing_context'
		| 'below_threshold'
		| 'queued'
		| 'active_run'
		| 'recent_run'
		| 'queue_skipped';
	sourceScore: number;
	recentScore: number;
	totalScore: number;
	threshold: number;
	recentActivityCount: number;
	runId?: string;
	jobId?: string;
	audit?: ProjectLoopBurstAuditResult;
};

export type ProjectLoopReviewSignalResult = {
	queued: boolean;
	reason: 'disabled' | 'missing_context' | 'queued' | 'queue_failed' | 'record_failed';
	signalId?: string;
	queueJobId?: string;
	dueAt?: string;
};

export type ProjectLoopReviewPolicy = 'suppress' | 'debounced' | 'immediate';

export type ProjectLoopReviewContext = {
	operationId?: string | null;
	origin?: string | null;
	operationKind?: string | null;
	reviewPolicy?: ProjectLoopReviewPolicy | null;
	entityCount?: number | null;
};

export type ProjectLoopBurstAuditResult = {
	evaluated: boolean;
	queued: boolean;
	decision?: ProjectAuditTriggerDecision;
	reason?: string;
	auditId?: string;
	runId?: string;
	jobId?: string;
	evaluationId?: string;
};

const CURRENT_SOURCE_SCORES: Record<string, number> = {
	document_create: 2,
	document_archive: 4,
	document_restore: 4,
	document_update: 1,
	doc_tree_move: 4,
	task_create: 1,
	task_move: 4,
	task_update: 1
};

const REVIEW_CONTEXT_BODY_KEY = 'project_review_context';
const OVERDUE_TRIAGE_ORIGIN = 'overdue_triage';
const PROJECT_SUGGESTION_REPLAY_ORIGIN = 'project_suggestion_replay';
const OVERDUE_TRIAGE_BACKLOG_OPERATION_KINDS = new Set([
	'single_backlog',
	'bulk_backlog',
	'backlog_cleanup',
	'overdue_triage.backlog_cleanup'
]);

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNonNegativeNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function asProjectLoopReviewPolicy(value: unknown): ProjectLoopReviewPolicy | null {
	const text = asString(value);
	return text === 'suppress' || text === 'debounced' || text === 'immediate' ? text : null;
}

export function readProjectLoopReviewContext(
	body: Record<string, unknown>
): ProjectLoopReviewContext | null {
	const raw = asRecord(body[REVIEW_CONTEXT_BODY_KEY]);
	if (!raw) return null;

	return {
		operationId: asString(raw.operation_id) ?? asString(raw.operationId),
		origin: asString(raw.origin),
		operationKind: asString(raw.operation_kind) ?? asString(raw.operationKind),
		reviewPolicy: asProjectLoopReviewPolicy(raw.review_policy ?? raw.reviewPolicy),
		entityCount: asNonNegativeNumber(raw.entity_count ?? raw.entityCount)
	};
}

export function shouldSuppressProjectLoopBurstForTaskUpdate(params: {
	body: Record<string, unknown>;
	reviewContext?: ProjectLoopReviewContext | null;
}): boolean {
	return projectLoopReviewPolicyForTaskUpdate(params) === 'suppress';
}

export function shouldSuppressProjectLoopBurstForReviewContext(
	reviewContext?: ProjectLoopReviewContext | null
): boolean {
	return (
		reviewContext?.reviewPolicy === 'suppress' &&
		reviewContext.origin === PROJECT_SUGGESTION_REPLAY_ORIGIN
	);
}

export function shouldDebounceProjectLoopBurstForTaskUpdate(params: {
	body: Record<string, unknown>;
	reviewContext?: ProjectLoopReviewContext | null;
}): boolean {
	return projectLoopReviewPolicyForTaskUpdate(params) === 'debounced';
}

export function projectLoopReviewPolicyForTaskUpdate(params: {
	body: Record<string, unknown>;
	reviewContext?: ProjectLoopReviewContext | null;
}): ProjectLoopReviewPolicy | null {
	const context = params.reviewContext ?? readProjectLoopReviewContext(params.body);
	if (!context || !context.reviewPolicy) return null;
	if (context.reviewPolicy === 'immediate') return 'immediate';
	if (context.origin !== OVERDUE_TRIAGE_ORIGIN) return null;
	if (
		!context.operationKind ||
		!OVERDUE_TRIAGE_BACKLOG_OPERATION_KINDS.has(context.operationKind)
	) {
		return null;
	}

	const isBacklogCleanup =
		params.body.state_key === 'todo' &&
		Object.prototype.hasOwnProperty.call(params.body, 'start_at') &&
		params.body.start_at === null &&
		Object.prototype.hasOwnProperty.call(params.body, 'due_at') &&
		params.body.due_at === null;

	return isBacklogCleanup ? context.reviewPolicy : null;
}

export function queueProjectLoopBurstAsync(params: {
	projectId: string | null | undefined;
	userId: string | null | undefined;
	source: string;
	entityType?: string | null;
	entityId?: string | null;
	action?: string | null;
}): void {
	if (!PROJECT_LOOPS_ENABLED || !params.projectId || !params.userId) return;

	void queueProjectLoopBurst(params).catch((error) => {
		logger.warn('Failed to queue project review burst', {
			projectId: params.projectId,
			userId: params.userId,
			source: params.source,
			error: error instanceof Error ? error.message : String(error)
		});
	});
}

export function queueProjectLoopReviewSignalAsync(params: {
	projectId: string | null | undefined;
	userId: string | null | undefined;
	source: string;
	entityType?: string | null;
	entityId?: string | null;
	action?: string | null;
	reviewContext?: ProjectLoopReviewContext | null;
}): void {
	if (!PROJECT_LOOPS_ENABLED || !params.projectId || !params.userId) return;

	void queueProjectLoopReviewSignal(params).catch((error) => {
		logger.warn('Failed to queue debounced project review signal', {
			projectId: params.projectId,
			userId: params.userId,
			source: params.source,
			error: error instanceof Error ? error.message : String(error)
		});
	});
}

export async function queueProjectLoopReviewSignal(params: {
	projectId: string | null | undefined;
	userId: string | null | undefined;
	source: string;
	entityType?: string | null;
	entityId?: string | null;
	action?: string | null;
	reviewContext?: ProjectLoopReviewContext | null;
	now?: Date;
}): Promise<ProjectLoopReviewSignalResult> {
	if (!PROJECT_LOOPS_ENABLED) return { queued: false, reason: 'disabled' };
	if (!params.projectId || !params.userId) return { queued: false, reason: 'missing_context' };

	const admin = createAdminSupabaseClient();
	const now = params.now ?? new Date();
	const dueAt = buildProjectReviewSignalDueAt(now).toISOString();
	const operationId = params.reviewContext?.operationId ?? null;
	const sourceScore = scoreProjectLoopBurstSource(params.source);
	const operationEntityCount = params.reviewContext?.entityCount ?? null;
	const signalEntityCount = Math.max(operationEntityCount ?? 0, params.entityId ? 1 : 0);

	const { data: existing, error: existingError } = await (admin as any)
		.from('project_review_signals')
		.select('*')
		.eq('project_id', params.projectId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (existingError) {
		logger.warn('Failed to load pending project review signal', {
			projectId: params.projectId,
			error: existingError.message
		});
	}

	const mergedMetadata = mergeProjectReviewSignalMetadata({
		existing: existing?.metadata,
		source: params.source,
		action: params.action,
		entityType: params.entityType,
		entityId: params.entityId,
		operation: {
			operationId,
			origin: params.reviewContext?.origin ?? null,
			operationKind: params.reviewContext?.operationKind ?? null,
			entityCount: operationEntityCount
		}
	});
	const mergedEntityIds = mergeUniqueStrings([
		...(((existing?.entity_ids as string[] | null) ?? []) as string[]),
		params.entityId
	]);
	const mergedOperationIds = mergeUniqueStrings([
		...(((existing?.operation_ids as string[] | null) ?? []) as string[]),
		operationId
	]);
	const signalPatch = {
		project_id: params.projectId,
		user_id: params.userId,
		status: 'pending',
		review_policy: 'debounced',
		origin: params.reviewContext?.origin ?? existing?.origin ?? null,
		operation_kind: params.reviewContext?.operationKind ?? existing?.operation_kind ?? null,
		source: params.source,
		entity_type: params.entityType ?? existing?.entity_type ?? null,
		entity_ids: mergedEntityIds,
		operation_ids: mergedOperationIds,
		entity_count: Math.max(
			typeof existing?.entity_count === 'number' ? existing.entity_count : 0,
			signalEntityCount
		),
		signal_count: (typeof existing?.signal_count === 'number' ? existing.signal_count : 0) + 1,
		activity_score: Math.max(
			typeof existing?.activity_score === 'number' ? existing.activity_score : 0,
			sourceScore
		),
		metadata: mergedMetadata as unknown as Json,
		due_at: dueAt,
		last_seen_at: now.toISOString(),
		error_message: null
	};

	const signalResult = existing?.id
		? await (admin as any)
				.from('project_review_signals')
				.update(signalPatch)
				.eq('id', existing.id)
				.eq('status', 'pending')
				.select('*')
				.maybeSingle()
		: await (admin as any)
				.from('project_review_signals')
				.insert(signalPatch)
				.select('*')
				.single();

	if (signalResult.error || !signalResult.data?.id) {
		logger.warn('Failed to record project review signal', {
			projectId: params.projectId,
			error: signalResult.error?.message
		});
		return { queued: false, reason: 'record_failed' };
	}

	const signal = signalResult.data as Record<string, unknown>;
	const signalId = typeof signal.id === 'string' ? signal.id : null;
	if (!signalId) {
		logger.warn('Project review signal record is missing a string ID', {
			projectId: params.projectId
		});
		return { queued: false, reason: 'record_failed' };
	}

	const queueMetadata: Json = {
		mode: PROJECT_REVIEW_SIGNAL_QUEUE_MODE,
		signalId,
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: PROJECT_REVIEW_SIGNAL_TRIGGER_REASON
	};
	try {
		const { queueRecordId, queueJobId } = await addQueueJobWithPublicId(admin, {
			p_user_id: params.userId,
			p_job_type: 'buildos_project_loop',
			p_metadata: queueMetadata,
			p_priority: 8,
			p_scheduled_for: dueAt,
			p_dedup_key: projectReviewSignalDedupKey(params.projectId)
		});

		await Promise.all([
			(admin as any)
				.from('queue_jobs')
				.update({
					scheduled_for: dueAt,
					metadata: queueMetadata
				})
				.eq('id', queueRecordId)
				.eq('status', 'pending'),
			(admin as any)
				.from('project_review_signals')
				.update({ queue_job_id: queueJobId })
				.eq('id', signalId)
				.eq('status', 'pending')
		]);

		return {
			queued: true,
			reason: 'queued',
			signalId,
			queueJobId,
			dueAt
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn('Failed to schedule project review signal wakeup', {
			projectId: params.projectId,
			signalId,
			error: message
		});
		await (admin as any)
			.from('project_review_signals')
			.update({
				status: 'failed',
				error_message: message,
				finished_at: new Date().toISOString()
			})
			.eq('id', signalId)
			.eq('status', 'pending');
		return { queued: false, reason: 'queue_failed', signalId, dueAt };
	}
}

export async function queueProjectLoopBurst(
	params: ProjectLoopBurstParams
): Promise<ProjectLoopBurstResult> {
	const sourceScore = scoreProjectLoopBurstSource(params.source);
	const baseResult = {
		sourceScore,
		recentScore: 0,
		totalScore: sourceScore,
		threshold: PROJECT_LOOP_BURST_SCORE_THRESHOLD,
		recentActivityCount: 0
	};

	if (!PROJECT_LOOPS_ENABLED) {
		return { ...baseResult, queued: false, reason: 'disabled' };
	}
	if (!params.projectId || !params.userId) {
		return { ...baseResult, queued: false, reason: 'missing_context' };
	}

	const recentRows = omitCurrentActivityLog(
		await loadRecentProjectActivity(params.projectId),
		params
	);
	const recentScore = scoreProjectLoopRecentActivity(recentRows);
	const totalScore = sourceScore + recentScore;
	const threshold = PROJECT_LOOP_BURST_SCORE_THRESHOLD;

	if (totalScore < threshold) {
		logger.debug('Skipped project review burst below threshold', {
			projectId: params.projectId,
			userId: params.userId,
			source: params.source,
			sourceScore,
			recentScore,
			totalScore,
			threshold,
			recentActivityCount: recentRows.length
		});
		return {
			queued: false,
			reason: 'below_threshold',
			sourceScore,
			recentScore,
			totalScore,
			threshold,
			recentActivityCount: recentRows.length
		};
	}

	const queueResult = await queueProjectLoop({
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: 'burst'
	});
	const audit = await evaluateCompleteAuditBurst(params);

	return {
		queued: queueResult.queued,
		reason: queueResult.queued ? 'queued' : mapQueueSkipReason(queueResult.reason),
		sourceScore,
		recentScore,
		totalScore,
		threshold,
		recentActivityCount: recentRows.length,
		...(queueResult.runId ? { runId: queueResult.runId } : {}),
		...(queueResult.jobId ? { jobId: queueResult.jobId } : {}),
		...(audit ? { audit } : {})
	};
}

export function shouldSkipProjectLoopBurst(
	request: Request,
	reviewContext?: ProjectLoopReviewContext | null
): boolean {
	return (
		request.headers.get('X-Skip-Project-Loop-Burst') === 'true' ||
		shouldSuppressProjectLoopBurstForReviewContext(reviewContext)
	);
}

export function scoreProjectLoopBurstSource(source: string): number {
	return CURRENT_SOURCE_SCORES[source] ?? 1;
}

export function scoreProjectLoopRecentActivity(
	rows: readonly ProjectLoopRecentActivityRow[]
): number {
	const countedUpdateEntities = new Set<string>();

	return rows.reduce((score, row) => {
		if (row.action === 'updated' && row.entity_id) {
			const entityKey = `${row.entity_type ?? 'unknown'}:${row.entity_id}`;
			if (countedUpdateEntities.has(entityKey)) return score;
			countedUpdateEntities.add(entityKey);
		}

		return score + scoreProjectLoopActivityLogRow(row);
	}, 0);
}

export function scoreProjectLoopActivityLogRow(row: ProjectLoopRecentActivityRow): number {
	const action = row.action ?? '';
	const entityType = row.entity_type ?? '';

	if (entityType === 'project') return action === 'updated' ? 5 : 3;
	if (entityType === 'goal') return 5;
	if (entityType === 'milestone') return 5;
	if (entityType === 'risk') return 4;

	if (entityType === 'document') {
		if (action === 'created') return 2;
		if (action === 'deleted') return 4;
		if (action === 'updated') return 1;
	}

	if (entityType === 'task') {
		if (action === 'created') return 1;
		if (action === 'deleted') return 3;
		if (action === 'updated') return 1;
	}

	if (action === 'created') return 2;
	if (action === 'deleted') return 3;
	if (action === 'updated') return 1;
	return 1;
}

async function loadRecentProjectActivity(
	projectId: string
): Promise<ProjectLoopRecentActivityRow[]> {
	const admin = createAdminSupabaseClient();
	const since = new Date(
		Date.now() - PROJECT_LOOP_BURST_LOOKBACK_MINUTES * 60 * 1000
	).toISOString();

	const { data, error } = await admin
		.from('onto_project_logs')
		.select('entity_type, entity_id, action, change_source, created_at')
		.eq('project_id', projectId)
		.gte('created_at', since)
		.order('created_at', { ascending: false })
		.limit(PROJECT_LOOP_BURST_ACTIVITY_LIMIT);

	if (error) {
		logger.warn('Failed to load recent project activity for burst scoring', {
			projectId,
			error: error.message
		});
		return [];
	}

	return (data ?? []) as ProjectLoopRecentActivityRow[];
}

function mapQueueSkipReason(reason?: string): ProjectLoopBurstResult['reason'] {
	if (reason === 'already_running' || reason === 'active_run') return 'active_run';
	if (reason === 'cooldown_active' || reason === 'recent_run') return 'recent_run';
	return 'queue_skipped';
}

async function evaluateCompleteAuditBurst(
	params: ProjectLoopBurstParams
): Promise<ProjectLoopBurstAuditResult | null> {
	if (!params.projectId || !params.userId) return null;

	try {
		const result = await queueProjectAudit({
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: 'burst'
		});
		return {
			evaluated: true,
			queued: result.queued,
			decision: result.decision,
			reason: result.reason,
			...(result.auditId ? { auditId: result.auditId } : {}),
			...(result.runId ? { runId: result.runId } : {}),
			...(result.jobId ? { jobId: result.jobId } : {}),
			...(result.evaluationId ? { evaluationId: result.evaluationId } : {})
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn('Failed to evaluate complete audit burst', {
			projectId: params.projectId,
			userId: params.userId,
			source: params.source,
			error: message
		});
		return {
			evaluated: false,
			queued: false,
			reason: message
		};
	}
}

function omitCurrentActivityLog(
	rows: ProjectLoopRecentActivityRow[],
	params: ProjectLoopBurstParams
): ProjectLoopRecentActivityRow[] {
	const entityType = params.entityType ?? inferCurrentEntityType(params.source);
	const action = params.action ?? inferCurrentAction(params.source);
	if (!entityType || !params.entityId || !action) return rows;

	let omitted = false;
	return rows.filter((row) => {
		if (
			!omitted &&
			row.entity_type === entityType &&
			row.entity_id === params.entityId &&
			row.action === action
		) {
			omitted = true;
			return false;
		}
		return true;
	});
}

function inferCurrentEntityType(source: string): string | null {
	if (source.startsWith('document_') || source === 'doc_tree_move') return 'document';
	if (source.startsWith('task_')) return 'task';
	return null;
}

function inferCurrentAction(source: string): string | null {
	if (source.endsWith('_create')) return 'created';
	if (source.endsWith('_update')) return 'updated';
	if (source === 'document_archive' || source === 'document_restore') return 'updated';
	if (source === 'doc_tree_move') return 'updated';
	return null;
}
