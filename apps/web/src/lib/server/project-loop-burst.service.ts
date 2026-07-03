// apps/web/src/lib/server/project-loop-burst.service.ts
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { createLogger } from '$lib/utils/logger';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { queueProjectLoop } from '$lib/server/project-loops.service';
import { queueProjectAudit } from '$lib/server/project-audit-trigger.service';
import type { ProjectAuditTriggerDecision } from '@buildos/shared-types';

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
	task_update: 1
};

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

export function shouldSkipProjectLoopBurst(request: Request): boolean {
	return request.headers.get('X-Skip-Project-Loop-Burst') === 'true';
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
